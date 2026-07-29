namespace server.Models;

public enum RoomStatus { Lobby, InGame }
public enum GamePhase { Rolling, Betting, Revealing }

public sealed class Player
{
    public required string Id { get; init; }
    public required string Name { get; set; }
    public string? ConnectionId { get; set; }
    public List<int> Dice { get; set; } = [];
    public int Wins { get; set; }
    public bool IsSpectator { get; set; }
    public bool IsDisconnected { get; set; }
    public DateTimeOffset? DisconnectedAt { get; set; }
}

public sealed class Bet
{
    public required string PlayerId { get; init; }
    public int Quantity { get; init; }
    public int Value { get; init; }
}

public sealed class Room
{
    public required string Id { get; init; }
    public required string Name { get; set; }
    public string? Password { get; init; }
    public required string HostId { get; set; }
    public List<Player> Players { get; } = [];
    public RoomStatus Status { get; set; } = RoomStatus.Lobby;
    public int DicePerPlayer { get; set; } = 5;
    public DateTimeOffset LastActivity { get; set; } = DateTimeOffset.UtcNow;
    public object Lock { get; } = new();

    /// <summary>Se incrementa en cada cambio de fase/turno para invalidar timers pendientes.</summary>
    public int PhaseToken { get; set; }
    public CancellationTokenSource TimerCts { get; } = new();

    // Estado de partida
    public GamePhase? Phase { get; set; }
    public Bet? CurrentBet { get; set; }
    public List<string> TurnOrder { get; set; } = [];
    public int CurrentTurnIndex { get; set; }
    public int RoundNumber { get; set; }
    public string? StarterId { get; set; }
    public DateTimeOffset? PhaseEndsAt { get; set; }
    public DateTimeOffset? TurnEndsAt { get; set; }
    public HashSet<string> RolledPlayers { get; } = [];
}

// ---- DTOs (contrato con el cliente) ----

public sealed record PlayerDto(string Id, string Name, int DiceCount, bool IsHost, bool IsSpectator, bool IsDisconnected, int Wins);
public sealed record BetDto(string PlayerId, string PlayerName, int Quantity, int Value);
public sealed record GameDto(string Phase, BetDto? CurrentBet, string? CurrentTurnPlayerId, int RoundNumber, int TotalDiceInPlay, DateTimeOffset? PhaseEndsAt, DateTimeOffset? TurnEndsAt);
public sealed record RoomDto(string Id, string Name, bool IsPrivate, string HostId, int DicePerPlayer, string Status, List<PlayerDto> Players, GameDto? Game);
public sealed record PublicRoomDto(string Id, string Name, int PlayerCount, int MaxPlayers);
public sealed record RevealPlayerDto(string PlayerId, string PlayerName, int[] Dice);
public sealed record RevealDto(string Resolution, BetDto Bet, int ActualCount, List<string> LoserIds, List<RevealPlayerDto> Players, string? WinnerId, string? WinnerName);
public sealed record ChatMessageDto(string PlayerId, string PlayerName, string Text, DateTimeOffset At);

public sealed record CreateRoomRequest(string PlayerId, string PlayerName, string RoomName, bool IsPrivate, string? Password);
public sealed record JoinRoomRequest(string PlayerId, string PlayerName, string RoomCode, string? Password);
