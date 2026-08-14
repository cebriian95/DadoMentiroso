using Microsoft.AspNetCore.SignalR;
using server.Models;
using server.Services;
using System.Security.Cryptography;

namespace server.Hubs;

public sealed class GameHub : Hub
{
    private const string WatchersGroup = "public-watchers";
    private const int MinPasswordLength = 3;
    private const int MaxPasswordLength = 20;

    private readonly RoomManager _rooms;
    private readonly GameEngine _engine;

    public GameHub(RoomManager rooms, GameEngine engine)
    {
        _rooms = rooms;
        _engine = engine;
    }

    // ---- Salas ----

    public async Task<RoomJoinResponse> CreateRoom(CreateRoomRequest req)
    {
        var playerName = (req.PlayerName ?? "").Trim();
        var roomName = (req.RoomName ?? "").Trim();
        if (playerName.Length is < 1 or > 16) throw new HubException("Nombre de usuario inválido (1-16 caracteres)");
        if (roomName.Length is < 1 or > 30) throw new HubException("Nombre de sala inválido (1-30 caracteres)");
        ValidatePlayerId(req.PlayerId);

        string? password = null;
        if (req.IsPrivate)
        {
            password = req.Password ?? "";
            if (password.Length is < MinPasswordLength or > MaxPasswordLength)
                throw new HubException($"La contraseña debe tener entre {MinPasswordLength} y {MaxPasswordLength} caracteres");
        }

        await DetachPreviousRoom();
        var player = new Player { Id = req.PlayerId, Name = playerName, ConnectionId = Context.ConnectionId,
            ColorIndex = 0, ReconnectToken = NewReconnectToken() };
        var room = _rooms.CreateRoom(player, roomName, password);

        _rooms.MapConnection(Context.ConnectionId, room.Id);
        await Groups.AddToGroupAsync(Context.ConnectionId, room.Id);
        RoomDto dto;
        lock (room.Lock)
        {
            dto = GameEngine.BuildRoomDto(room);
            _engine.BroadcastRoomLocked(room);
        }
        return new RoomJoinResponse(dto, player.ReconnectToken);
    }

    public async Task<RoomJoinResponse> JoinRoom(JoinRoomRequest req)
    {
        var playerName = (req.PlayerName ?? "").Trim();
        if (playerName.Length is < 1 or > 16) throw new HubException("Nombre de usuario inválido (1-16 caracteres)");
        if (string.IsNullOrWhiteSpace(req.RoomCode)) throw new HubException("Falta el código de sala");
        ValidatePlayerId(req.PlayerId);
        if (!_rooms.TryGetRoom(req.RoomCode.Trim(), out var room)) throw new HubException("La sala no existe");

        int[]? myDice = null;
        RoomDto dto;
        lock (room.Lock)
        {
            var existing = room.Players.FirstOrDefault(p => p.Id == req.PlayerId);
            if (existing is not null)
            {
                if (req.ReconnectToken is null ||
                    req.ReconnectToken.Length != existing.ReconnectToken.Length ||
                    !CryptographicOperations.FixedTimeEquals(
                        System.Text.Encoding.UTF8.GetBytes(existing.ReconnectToken),
                        System.Text.Encoding.UTF8.GetBytes(req.ReconnectToken)))
                    throw new HubException("Token de reconexión inválido");
                existing.Name = playerName;
                existing.ConnectionId = Context.ConnectionId;
                existing.IsDisconnected = false;
                existing.DisconnectedAt = null;
                if (room.Status == RoomStatus.InGame && !existing.IsSpectator)
                    myDice = existing.Dice.ToArray();
            }
            else
            {
                if (room.Password is not null && room.Password != req.Password)
                    throw new HubException("Contraseña incorrecta");
                if (room.Players.Count >= RoomManager.MaxPlayers)
                    throw new HubException("La sala está llena");
                var previousPlayer = room.Players.FirstOrDefault(p => p.ConnectionId == Context.ConnectionId);
                if (previousPlayer is not null)
                    _engine.RemovePlayerLocked(room, previousPlayer.Id);

                var player = new Player
                {
                    Id = req.PlayerId,
                    Name = playerName,
                    ConnectionId = Context.ConnectionId,
                    ColorIndex = AssignColor(room),
                    ReconnectToken = NewReconnectToken()
                };
                if (room.Status == RoomStatus.InGame)
                    _engine.MarkPendingJoinLocked(room, player);
                room.Players.Add(player);
            }

            _rooms.Touch(room);
            dto = GameEngine.BuildRoomDto(room);
        }

        // Primero unir al grupo y luego emitir, para que el que entra también reciba el RoomState.
        await DetachPreviousRoom(room.Id);
        _rooms.MapConnection(Context.ConnectionId, room.Id);
        await Groups.AddToGroupAsync(Context.ConnectionId, room.Id);
        var reconnectToken = room.Players.First(p => p.Id == req.PlayerId).ReconnectToken;
        _engine.Broadcast(room);
        if (myDice is not null)
            await Clients.Caller.SendAsync("YourDice", myDice);
        return new RoomJoinResponse(dto, reconnectToken);
    }

    public async Task LeaveRoom()
    {
        if (!_rooms.TryGetRoomByConnection(Context.ConnectionId, out var room)) return;
        lock (room.Lock)
        {
            var player = room.Players.FirstOrDefault(p => p.ConnectionId == Context.ConnectionId);
            if (player is not null)
                _engine.RemovePlayerLocked(room, player.Id);
        }
        _rooms.UnmapConnection(Context.ConnectionId);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, room.Id);
    }

    public async Task KickPlayer(string targetPlayerId)
    {
        if (!TryGetContext(out var room, out var requester)) return;
        string? targetConnection = null;
        lock (room.Lock)
        {
            if (requester!.Id != room.HostId) return;
            if (targetPlayerId == room.HostId) return;
            var target = room.Players.FirstOrDefault(p => p.Id == targetPlayerId);
            if (target is null) return;
            targetConnection = target.ConnectionId;
            _rooms.Touch(room);
            _engine.RemovePlayerLocked(room, targetPlayerId);
        }
        if (targetConnection is not null)
        {
            await Clients.Client(targetConnection).SendAsync("Kicked");
            await Groups.RemoveFromGroupAsync(targetConnection, room.Id);
            _rooms.UnmapConnection(targetConnection);
        }
    }

    public Task SetDiceCount(int count)
    {
        if (!TryGetContext(out var room, out var requester)) return Task.CompletedTask;
        lock (room.Lock)
        {
            if (requester!.Id != room.HostId || room.Status != RoomStatus.Lobby) return Task.CompletedTask;
            if (count is < 1 or > 10) return Task.CompletedTask;
            room.DicePerPlayer = count;
            _rooms.Touch(room);
            _engine.BroadcastRoomLocked(room);
        }
        return Task.CompletedTask;
    }

    public Task StartGame()
    {
        if (!TryGetContext(out var room, out var requester)) return Task.CompletedTask;
        _rooms.Touch(room);
        _engine.StartGame(room, requester!.Id);
        return Task.CompletedTask;
    }

    public async Task DeleteRoom()
    {
        if (!TryGetContext(out var room, out var requester)) return;
        lock (room.Lock)
        {
            if (requester!.Id != room.HostId) return;
            _rooms.RemoveRoom(room);
        }
        _engine.NotifyPublicRoomsChanged();
        await Clients.Group(room.Id).SendAsync("RoomDeleted", room.Id);
    }

    // ---- Juego ----

    public Task PlaceBet(int quantity, int value)
    {
        if (!TryGetContext(out var room, out var player)) return Task.CompletedTask;
        _engine.PlaceBet(room, player!.Id, quantity, value);
        return Task.CompletedTask;
    }

    public Task Doubt()
    {
        if (!TryGetContext(out var room, out var player)) return Task.CompletedTask;
        _engine.Doubt(room, player!.Id);
        return Task.CompletedTask;
    }

    public Task Exact()
    {
        if (!TryGetContext(out var room, out var player)) return Task.CompletedTask;
        _engine.CallExact(room, player!.Id);
        return Task.CompletedTask;
    }

    public Task MarkRolled()
    {
        if (!TryGetContext(out var room, out var player)) return Task.CompletedTask;
        _engine.MarkRolled(room, player!.Id);
        return Task.CompletedTask;
    }

    // ---- Chat ----

    public Task SendChat(string message)
    {
        if (!TryGetContext(out var room, out var player)) return Task.CompletedTask;
        var text = (message ?? "").Trim();
        if (text.Length is < 1 or > 50) return Task.CompletedTask;
        lock (room.Lock)
        {
            _rooms.Touch(room);
            var dto = new ChatMessageDto(player!.Id, player.Name, text, DateTimeOffset.UtcNow);
            _ = Clients.Group(room.Id).SendAsync("ChatMessage", dto);
        }
        return Task.CompletedTask;
    }

    // ---- Salas públicas ----

    public Task<List<PublicRoomDto>> GetPublicRooms()
    {
        var list = _rooms.PublicRooms()
            .Select(r =>
            {
                lock (r.Lock)
                    return new PublicRoomDto(r.Id, r.Name, r.Players.Count, RoomManager.MaxPlayers, r.Status.ToString());
            })
            .ToList();
        return Task.FromResult(list);
    }

    public async Task SubscribePublicRooms()
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, WatchersGroup);
        _engine.NotifyPublicRoomsChanged();
    }

    public Task UnsubscribePublicRooms() => Groups.RemoveFromGroupAsync(Context.ConnectionId, WatchersGroup);

    // ---- Ciclo de vida ----

    public Task SetPlayerColor(int colorIndex)
    {
        if (!TryGetContext(out var room, out var player)) return Task.CompletedTask;
        lock (room.Lock)
        {
            if (room.Status == RoomStatus.InGame) return Task.CompletedTask;
            if (colorIndex < 0 || colorIndex >= 12) return Task.CompletedTask;
            var taken = room.Players.Where(p => p.Id != player!.Id).Select(p => p.ColorIndex).ToHashSet();
            if (taken.Contains(colorIndex)) return Task.CompletedTask;
            player!.ColorIndex = colorIndex;
            _rooms.Touch(room);
            _engine.BroadcastRoomLocked(room);
        }
        return Task.CompletedTask;
    }

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        if (_rooms.TryGetRoomByConnection(Context.ConnectionId, out var room))
        {
            _rooms.UnmapConnection(Context.ConnectionId);
            _engine.HandleDisconnected(room, Context.ConnectionId);
        }
        return base.OnDisconnectedAsync(exception);
    }

    private static int AssignColor(Models.Room room)
    {
        var used = room.Players.Select(p => p.ColorIndex).ToHashSet();
        for (int i = 0; i < 12; i++)
            if (!used.Contains(i)) return i;
        return 0;
    }

    private static string NewReconnectToken() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));

    private static void ValidatePlayerId(string playerId)
    {
        if (string.IsNullOrWhiteSpace(playerId) || playerId.Length > 64 || !Guid.TryParse(playerId, out _))
            throw new HubException("Identificador de jugador inválido");
    }

    private Task DetachPreviousRoom(string? keepRoom = null)
    {
        if (!_rooms.TryGetRoomByConnection(Context.ConnectionId, out var previous) ||
            previous.Id.Equals(keepRoom, StringComparison.OrdinalIgnoreCase)) return Task.CompletedTask;
        lock (previous.Lock)
        {
            var player = previous.Players.FirstOrDefault(p => p.ConnectionId == Context.ConnectionId);
            if (player is not null) _engine.RemovePlayerLocked(previous, player.Id);
        }
        _rooms.UnmapConnection(Context.ConnectionId, previous.Id);
        return Groups.RemoveFromGroupAsync(Context.ConnectionId, previous.Id);
    }

    private bool TryGetContext(out Room room, out Player? player)
    {
        player = null;
        if (!_rooms.TryGetRoomByConnection(Context.ConnectionId, out room!)) return false;
        lock (room.Lock)
        {
            player = room.Players.FirstOrDefault(p => p.ConnectionId == Context.ConnectionId);
        }
        return player is not null;
    }
}
