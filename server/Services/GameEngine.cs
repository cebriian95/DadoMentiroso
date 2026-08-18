using Microsoft.AspNetCore.SignalR;
using server.Hubs;
using server.Models;

namespace server.Services;

/// <summary>
/// Lógica autoritativa del juego. El servidor es la única fuente de verdad:
/// los dados se generan aquí y cada cliente solo recibe los suyos.
/// Toda mutación de una sala se hace bajo room.Lock.
/// </summary>
public sealed class GameEngine
{
    public static readonly TimeSpan RollingDuration = TimeSpan.FromSeconds(10);
    public static readonly TimeSpan TurnDuration = TimeSpan.FromMinutes(3);
    public static readonly TimeSpan RevealDuration = TimeSpan.FromSeconds(8);
    public static readonly TimeSpan ReconnectWindow = TimeSpan.FromSeconds(60);

    private const string WatchersGroup = "public-watchers";

    private readonly IHubContext<GameHub> _hub;
    private readonly RoomManager _rooms;

    public GameEngine(IHubContext<GameHub> hub, RoomManager rooms)
    {
        _hub = hub;
        _rooms = rooms;
    }

    // ---- Construcción de DTOs y broadcasts ----

    public static RoomDto BuildRoomDto(Room room, string? viewerId = null)
    {
        var players = room.Players.Select(p => new PlayerDto(
            p.Id, p.Name, p.IsSpectator ? 0 : p.Dice.Count,
            p.Id == room.HostId, p.IsSpectator, p.IsDisconnected, p.Wins, p.ColorIndex, p.PendingJoin)).ToList();

        GameDto? game = null;
        if (room.Status == RoomStatus.InGame && room.Phase is { } phase)
        {
            var bet = room.CurrentBet is { } b
                ? new BetDto(b.PlayerId, room.Players.FirstOrDefault(p => p.Id == b.PlayerId)?.Name ?? "?", b.Quantity, b.Value)
                : null;
            string? turn = phase == GamePhase.Betting && room.TurnOrder.Count > 0
                ? room.TurnOrder[room.CurrentTurnIndex % room.TurnOrder.Count]
                : null;
            var totalDice = room.Players.Where(p => !p.IsSpectator).Sum(p => p.Dice.Count);
            var roundBets = room.RoundBets.Select(b => new BetDto(b.PlayerId,
                room.Players.FirstOrDefault(p => p.Id == b.PlayerId)?.Name ?? "?", b.Quantity, b.Value)).ToList();
            game = new GameDto(phase.ToString(), bet, turn, room.RoundNumber, totalDice,
                room.PhaseEndsAt, room.TurnEndsAt, room.TurnOrder.ToList(), roundBets,
                room.CurrentReveal, viewerId is not null && room.RolledPlayers.Contains(viewerId));
        }

        return new RoomDto(room.Id, room.Name, room.Password is not null, room.HostId,
            room.DicePerPlayer, room.Status.ToString(), players, game, room.LastWinner);
    }

    /// <summary>Adquiere el lock y emite el estado de la sala.</summary>
    public void Broadcast(Room room)
    {
        lock (room.Lock) BroadcastRoomLocked(room);
    }

    /// <summary>Debe llamarse con room.Lock adquirido.</summary>
    public void BroadcastRoomLocked(Room room)
    {
        foreach (var player in room.Players.Where(p => p.ConnectionId is not null))
        {
            var connectionId = player.ConnectionId!;
            var dto = BuildRoomDto(room, player.Id);
            _ = SendLogged(() => _hub.Clients.Client(connectionId).SendAsync("RoomState", dto), "RoomState");
        }
        // La notificación toma locks de varias salas; diferirla evita invertir
        // el orden de locks mientras la sala actual sigue bloqueada.
        _ = Task.Run(NotifyPublicRoomsChanged);
    }

    public void NotifyPublicRoomsChanged()
    {
        var list = _rooms.PublicRooms()
            .Select(r =>
            {
                lock (r.Lock)
                    return new PublicRoomDto(r.Id, r.Name, r.Players.Count, RoomManager.MaxPlayers, r.Status.ToString());
            })
            .ToList();
        _ = SendLogged(() => _hub.Clients.Group(WatchersGroup).SendAsync("PublicRooms", list), "PublicRooms");
    }

    private static async Task SendLogged(Func<Task> send, string eventName)
    {
        try { await send(); }
        catch (Exception ex) { Console.Error.WriteLine($"SignalR {eventName}: {ex.Message}"); }
    }

    private void SendPrivateDiceLocked(Room room)
    {
        foreach (var p in room.Players.Where(p => !p.IsSpectator && !p.IsDisconnected && p.ConnectionId is not null))
            _ = SendLogged(() => _hub.Clients.Client(p.ConnectionId!).SendAsync("YourDice", p.Dice.ToArray()), "YourDice");
    }

    private void SendErrorLocked(Player? player, string message)
    {
        if (player?.ConnectionId is { } conn)
            _ = SendLogged(() => _hub.Clients.Client(conn).SendAsync("ActionError", message), "ActionError");
    }

    // ---- Programación de timers (invalidables con PhaseToken) ----

    /// <summary>Ejecuta action bajo room.Lock tras el delay, solo si el token de fase sigue vigente.</summary>
    private void Schedule(Room room, TimeSpan delay, Action action)
    {
        var token = room.PhaseToken;
        var cts = room.TimerCts;
        _ = Task.Run(async () =>
        {
            try { await Task.Delay(delay, cts.Token); }
            catch (OperationCanceledException) { return; }
            lock (room.Lock)
            {
                if (room.PhaseToken != token) return;
                action();
            }
        });
    }

    // ---- Ciclo de partida ----

    public void StartGame(Room room, string requesterId)
    {
        lock (room.Lock)
        {
            if (room.HostId != requesterId) return;
            if (room.Status != RoomStatus.Lobby) return;
            if (room.Players.Count < 2)
            {
                SendErrorLocked(room.Players.FirstOrDefault(p => p.Id == requesterId), "Se necesitan al menos 2 jugadores");
                return;
            }

            room.Status = RoomStatus.InGame;
            room.LastWinner = null;
            room.RoundNumber = 0;
            foreach (var p in room.Players)
            {
                p.IsSpectator = false;
                p.PendingJoin = false;
                p.Dice = Enumerable.Range(0, room.DicePerPlayer).Select(_ => Roll()).ToList();
            }

            var starter = room.Players[Random.Shared.Next(room.Players.Count)].Id;
            StartRoundLocked(room, starter);
        }
    }

    private static int Roll() => Random.Shared.Next(1, 7);

    /// <summary>Nueva ronda: re-tira los dados de los jugadores activos. Lock adquirido.</summary>
    private void StartRoundLocked(Room room, string starterId)
    {
        _rooms.Touch(room);
        room.PhaseToken++;
        room.RoundNumber++;
        room.Phase = GamePhase.Rolling;
        room.CurrentBet = null;
        room.CurrentReveal = null;
        room.RoundBets.Clear();
        room.TurnEndsAt = null;
        room.PhaseEndsAt = DateTimeOffset.UtcNow + RollingDuration;

        var pending = room.Players.Where(p => p.PendingJoin).ToList();
        if (pending.Count > 0)
        {
            var activeDice = room.Players
                .Where(p => !p.IsSpectator && !p.PendingJoin)
                .Select(p => p.Dice.Count)
                .ToList();
            var averageDice = activeDice.Count == 0
                ? room.DicePerPlayer
                : Math.Max(1, (int)Math.Round(activeDice.Average(), MidpointRounding.AwayFromZero));

            foreach (var p in pending)
            {
                p.PendingJoin = false;
                p.IsSpectator = false;
                p.Dice = Enumerable.Range(0, averageDice).Select(_ => Roll()).ToList();
            }
        }

        var active = room.Players.Where(p => !p.IsSpectator).ToList();
        room.TurnOrder = active.Select(p => p.Id).ToList();
        foreach (var p in active)
            p.Dice = p.Dice.Select(_ => Roll()).ToList();

        // El que empieza debe estar activo; si no, el siguiente activo.
        if (!room.TurnOrder.Contains(starterId))
            starterId = NextActiveAfter(room, starterId) ?? room.TurnOrder[0];
        room.StarterId = starterId;
        room.CurrentTurnIndex = Math.Max(0, room.TurnOrder.IndexOf(starterId));
        room.RolledPlayers.Clear();

        BroadcastRoomLocked(room);
        SendPrivateDiceLocked(room);
        Schedule(room, RollingDuration, () => BeginBetting(room));
    }

    /// <summary>Marca a un jugador nuevo para entrar al comenzar la siguiente ronda.</summary>
    public void MarkPendingJoinLocked(Room room, Player player)
    {
        player.IsSpectator = true;
        player.PendingJoin = true;
        player.Dice.Clear();
    }

    public void MarkRolled(Room room, string playerId)
    {
        lock (room.Lock)
        {
            if (room.Status != RoomStatus.InGame || room.Phase != GamePhase.Rolling) return;
            if (!room.TurnOrder.Contains(playerId)) return;
            if (!room.RolledPlayers.Add(playerId)) return;
            var connectedCount = room.TurnOrder.Count(id => room.Players.FirstOrDefault(p => p.Id == id)?.IsDisconnected == false);
            if (connectedCount == 0 || room.RolledPlayers.Count >= connectedCount)
                BeginBetting(room);
        }
    }

    private void BeginBetting(Room room)
    {
        // Lock y token ya garantizados por Schedule.
        if (room.Status != RoomStatus.InGame || room.Phase != GamePhase.Rolling) return;
        room.Phase = GamePhase.Betting;
        room.PhaseEndsAt = null;
        _rooms.Touch(room);
        ArmTurnTimerLocked(room);
        BroadcastRoomLocked(room);
    }

    private void ArmTurnTimerLocked(Room room, TimeSpan? duration = null)
    {
        var actualDuration = duration ?? TurnDuration;
        room.PausedTurnRemaining = null;
        room.TurnEndsAt = DateTimeOffset.UtcNow + actualDuration;
        Schedule(room, actualDuration, () => AutoPlayTurn(room));
    }

    /// <summary>Sin acción en 3 min: apuesta mínima válida (o Mentira si no hay subida posible).</summary>
    private void AutoPlayTurn(Room room)
    {
        if (room.Status != RoomStatus.InGame || room.Phase != GamePhase.Betting) return;
        _rooms.Touch(room);
        var playerId = room.TurnOrder[room.CurrentTurnIndex % room.TurnOrder.Count];
        var prev = room.CurrentBet;
        var total = TotalDice(room);

        if (prev is null)
        {
            PlaceBetLocked(room, playerId, 1, Random.Shared.Next(1, 7));
        }
        else if (prev.Value < 6)
        {
            PlaceBetLocked(room, playerId, prev.Quantity, prev.Value + 1);
        }
        else if (prev.Quantity < total)
        {
            PlaceBetLocked(room, playerId, prev.Quantity + 1, Random.Shared.Next(1, 7));
        }
        else
        {
            ResolveLocked(room, playerId, isExact: false); // no queda otra que dudar
        }
    }

    private static int TotalDice(Room room) =>
        room.Players.Where(p => !p.IsSpectator).Sum(p => p.Dice.Count);

    private string? ValidateTurn(Room room, string playerId)
    {
        if (room.Status != RoomStatus.InGame || room.Phase != GamePhase.Betting) return "No es momento de actuar";
        if (room.TurnOrder.Count == 0 || room.TurnOrder[room.CurrentTurnIndex % room.TurnOrder.Count] != playerId) return "No es tu turno";
        return null;
    }

    public void PlaceBet(Room room, string playerId, int quantity, int value)
    {
        lock (room.Lock)
        {
            _rooms.Touch(room);
            var player = room.Players.FirstOrDefault(p => p.Id == playerId);
            if (ValidateTurn(room, playerId) is { } err) { SendErrorLocked(player, err); return; }
            var prev = room.CurrentBet;
            var total = TotalDice(room);
            if (quantity < 1 || quantity > total || value < 1 || value > 6)
            {
                SendErrorLocked(player, "Apuesta inválida");
                return;
            }
            if (prev is not null && !(quantity > prev.Quantity || (quantity == prev.Quantity && value > prev.Value)))
            {
                SendErrorLocked(player, "La apuesta debe superar a la anterior");
                return;
            }
            PlaceBetLocked(room, playerId, quantity, value);
        }
    }

    private void PlaceBetLocked(Room room, string playerId, int quantity, int value)
    {
        room.PhaseToken++;
        room.CurrentBet = new Bet { PlayerId = playerId, Quantity = quantity, Value = value };
        room.RoundBets.Add(room.CurrentBet);
        room.CurrentTurnIndex = (room.CurrentTurnIndex + 1) % room.TurnOrder.Count;
        ArmTurnTimerLocked(room);
        BroadcastRoomLocked(room);
    }

    public void Doubt(Room room, string playerId)
    {
        lock (room.Lock)
        {
            _rooms.Touch(room);
            var player = room.Players.FirstOrDefault(p => p.Id == playerId);
            if (ValidateTurn(room, playerId) is { } err) { SendErrorLocked(player, err); return; }
            if (room.CurrentBet is null) { SendErrorLocked(player, "Aún no hay apuesta que impugnar"); return; }
            ResolveLocked(room, playerId, isExact: false);
        }
    }

    public void CallExact(Room room, string playerId)
    {
        lock (room.Lock)
        {
            _rooms.Touch(room);
            var player = room.Players.FirstOrDefault(p => p.Id == playerId);
            if (ValidateTurn(room, playerId) is { } err) { SendErrorLocked(player, err); return; }
            if (room.CurrentBet is null) { SendErrorLocked(player, "Aún no hay apuesta"); return; }
            ResolveLocked(room, playerId, isExact: true);
        }
    }

    /// <summary>Resuelve Mentira/Exacto: revela primero y aplica la pérdida al terminar el revelado.</summary>
    private void ResolveLocked(Room room, string callerId, bool isExact)
    {
        room.PhaseToken++;
        var bet = room.CurrentBet!;
        var actual = room.Players.Where(p => !p.IsSpectator).SelectMany(p => p.Dice).Count(d => d == bet.Value);

        List<string> losers;
        string resolution;
        if (!isExact)
        {
            resolution = "doubt";
            losers = [actual >= bet.Quantity ? callerId : bet.PlayerId];
        }
        else if (actual == bet.Quantity)
        {
            resolution = "exact-hit";
            losers = room.Players.Where(p => !p.IsSpectator && p.Id != callerId).Select(p => p.Id).ToList();
        }
        else
        {
            resolution = "exact-miss";
            losers = [callerId];
        }

        room.Phase = GamePhase.Revealing;
        _rooms.Touch(room);
        room.PhaseEndsAt = DateTimeOffset.UtcNow + RevealDuration;
        room.TurnEndsAt = null;
        room.PausedTurnRemaining = null;

        // Proyectamos la pérdida para decidir el ganador sin mutar todavía los dados.
        var projectedActive = room.Players
            .Where(p => !p.IsSpectator && p.Dice.Count - (losers.Contains(p.Id) ? 1 : 0) > 0)
            .ToList();
        var winner = projectedActive.Count == 1 ? projectedActive[0] : null;

        // Quien empezará la siguiente ronda, validándolo de nuevo al terminar el revelado.
        string starterCandidate = resolution switch
        {
            "doubt" => losers[0],                       // pierde un dado y empieza él
            "exact-miss" => callerId,                   // pierde un dado y empieza él
            _ => NextActiveAfter(room, callerId) ?? callerId, // exact-hit: el siguiente al que dijo Exacto
        };

        var revealDto = new RevealDto(
            resolution,
            new BetDto(bet.PlayerId, room.Players.FirstOrDefault(p => p.Id == bet.PlayerId)?.Name ?? "?", bet.Quantity, bet.Value),
            actual,
            losers,
            room.Players.Where(p => !p.IsSpectator || p.Dice.Count > 0 || losers.Contains(p.Id))
                .Select(p => new RevealPlayerDto(p.Id, p.Name, p.Dice.ToArray())).ToList(),
            winner?.Id,
            winner?.Name);
        room.CurrentReveal = revealDto;

        _ = SendLogged(() => _hub.Clients.Group(room.Id).SendAsync("RevealAll", revealDto), "RevealAll");
        BroadcastRoomLocked(room);

        Schedule(room, RevealDuration, () =>
        {
            _rooms.Touch(room);
            foreach (var id in losers)
            {
                var p = room.Players.FirstOrDefault(x => x.Id == id);
                if (p is null) continue;
                if (p.Dice.Count > 0) p.Dice.RemoveAt(p.Dice.Count - 1);
                if (p.Dice.Count == 0) p.IsSpectator = true;
            }

            var activeNow = room.Players.Where(p => !p.IsSpectator).ToList();
            var validWinner = winner is not null && activeNow.Any(p => p.Id == winner.Id)
                ? activeNow.First(p => p.Id == winner.Id)
                : activeNow.Count == 1 ? activeNow[0] : null;

            if (validWinner is not null)
            {
                EndGameLocked(room, validWinner);
                return;
            }

            if (activeNow.Count == 0)
            {
                room.PhaseToken++;
                room.Status = RoomStatus.Lobby;
                room.Phase = null;
                room.CurrentBet = null;
                room.CurrentReveal = null;
                room.RoundBets.Clear();
                room.PhaseEndsAt = null;
                room.TurnEndsAt = null;
                room.TurnOrder = [];
                BroadcastRoomLocked(room);
                return;
            }

            var starterId = starterCandidate;
            if (room.Players.FirstOrDefault(p => p.Id == starterId)?.IsSpectator != false)
                starterId = NextActiveAfter(room, starterId) ?? activeNow[0].Id;
            StartRoundLocked(room, starterId);
        });
    }

    private void EndGameLocked(Room room, Player winner)
    {
        room.PhaseToken++;
        winner.Wins++;
        room.Status = RoomStatus.Lobby;
        room.Phase = null;
        room.CurrentBet = null;
        room.CurrentReveal = null;
        room.RoundBets.Clear();
        room.PhaseEndsAt = null;
        room.TurnEndsAt = null;
        room.TurnOrder = [];
        room.LastWinner = new GameResultDto(winner.Id, winner.Name);
        _ = SendLogged(() => _hub.Clients.Group(room.Id).SendAsync("GameOver", winner.Id, winner.Name), "GameOver");
        BroadcastRoomLocked(room);
    }

    private static string? NextActiveAfter(Room room, string fromId)
    {
        if (room.Players.Count == 0) return null;
        var start = room.Players.FindIndex(p => p.Id == fromId);
        if (start < 0) start = 0;
        for (var i = 1; i <= room.Players.Count; i++)
        {
            var p = room.Players[(start + i) % room.Players.Count];
            if (!p.IsSpectator) return p.Id;
        }
        return null;
    }

    // ---- Bajas de jugadores (salir, expulsar, desconexión permanente) ----

    /// <summary>Elimina al jugador de la sala. Lock adquirido. Devuelve el jugador eliminado (o null).</summary>
    public Player? RemovePlayerLocked(Room room, string playerId)
    {
        var player = room.Players.FirstOrDefault(p => p.Id == playerId);
        if (player is null) return null;

        if (room.Status == RoomStatus.InGame && !player.IsSpectator)
        {
            // Neutralizarlo dentro de la partida antes de borrarlo.
            player.IsSpectator = true;
            player.Dice.Clear();
            FixTurnAfterRemovalLocked(room, playerId);
        }

        room.Players.Remove(player);

        if (room.Players.Count == 0)
        {
            _rooms.RemoveRoom(room);
            NotifyPublicRoomsChanged();
            return player;
        }

        if (room.HostId == playerId)
            room.HostId = room.Players[0].Id;

        if (room.Status == RoomStatus.InGame && room.Phase != GamePhase.Revealing)
        {
            var active = room.Players.Where(p => !p.IsSpectator).ToList();
            if (active.Count == 1)
            {
                EndGameLocked(room, active[0]);
                return player;
            }

            if (room.Phase == GamePhase.Rolling)
            {
                var connectedActive = room.TurnOrder.Count(id =>
                    room.Players.FirstOrDefault(p => p.Id == id)?.IsDisconnected == false);
                if (connectedActive > 0 && room.RolledPlayers.Count >= connectedActive)
                    BeginBetting(room);
            }
        }

        BroadcastRoomLocked(room);
        return player;
    }

    private void FixTurnAfterRemovalLocked(Room room, string removedId)
    {
        if (room.Phase != GamePhase.Betting || room.TurnOrder.Count == 0)
        {
            room.TurnOrder.Remove(removedId);
            return;
        }

        var currentId = room.TurnOrder[room.CurrentTurnIndex % room.TurnOrder.Count];
        room.TurnOrder.Remove(removedId);
        if (room.TurnOrder.Count == 0) return;

        if (currentId == removedId)
        {
            // El turno pasa al siguiente (el índice ya apunta a él); reinicia su timer.
            room.CurrentTurnIndex %= room.TurnOrder.Count;
            room.PhaseToken++;
            ArmTurnTimerLocked(room);
        }
        else
        {
            room.CurrentTurnIndex = room.TurnOrder.IndexOf(currentId);
        }
    }

    /// <summary>Marca al jugador como desconectado y programa su baja si no vuelve en 60s.</summary>
    public void HandleDisconnected(Room room, string connectionId)
    {
        Player? player;
        lock (room.Lock)
        {
            player = room.Players.FirstOrDefault(p => p.ConnectionId == connectionId);
            if (player is null) return;
            player.IsDisconnected = true;
            player.DisconnectedAt = DateTimeOffset.UtcNow;
            player.ConnectionId = null;
            if (room.Phase == GamePhase.Rolling)
            {
                var connectedActive = room.TurnOrder.Count(id => room.Players.FirstOrDefault(p => p.Id == id)?.IsDisconnected == false);
                if (connectedActive > 0 && room.RolledPlayers.Count >= connectedActive) BeginBetting(room);
            }
            else if (room.Phase == GamePhase.Betting && room.TurnOrder.Count > 0 &&
                     room.TurnOrder[room.CurrentTurnIndex % room.TurnOrder.Count] == player.Id)
            {
                room.PausedTurnRemaining = room.TurnEndsAt is { } ends
                    ? ends - DateTimeOffset.UtcNow
                    : TurnDuration;
                if (room.PausedTurnRemaining < TimeSpan.Zero) room.PausedTurnRemaining = TimeSpan.Zero;
                room.TurnEndsAt = null;
                room.PhaseToken++;
            }
            _rooms.Touch(room);
            BroadcastRoomLocked(room);
        }

        var at = player.DisconnectedAt.Value;
        var playerId = player.Id;
        _ = Task.Run(async () =>
        {
            await Task.Delay(ReconnectWindow);
            lock (room.Lock)
            {
                var p = room.Players.FirstOrDefault(x => x.Id == playerId);
                if (p is null || !p.IsDisconnected || p.DisconnectedAt != at) return;
                RemovePlayerLocked(room, playerId);
            }
        });
    }

    public void HandleReconnectedLocked(Room room, Player player)
    {
        if (room.Status == RoomStatus.InGame && room.Phase == GamePhase.Betting &&
            room.TurnOrder.Count > 0 && room.TurnOrder[room.CurrentTurnIndex % room.TurnOrder.Count] == player.Id &&
            room.PausedTurnRemaining is { } remaining)
        {
            room.PhaseToken++;
            ArmTurnTimerLocked(room, remaining);
        }
    }
}
