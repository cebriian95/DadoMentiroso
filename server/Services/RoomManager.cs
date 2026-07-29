using System.Collections.Concurrent;
using server.Models;

namespace server.Services;

/// <summary>
/// Almacén en memoria de salas. No hay BBDD: las salas son efímeras y las
/// borra el sweeper tras 5h de inactividad.
/// </summary>
public sealed class RoomManager
{
    public const int MaxPlayers = 12;
    public static readonly TimeSpan MaxIdle = TimeSpan.FromHours(5);

    // Sin 0/O, 1/I/L para evitar confusiones al dictar el código.
    private const string CodeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

    private readonly ConcurrentDictionary<string, Room> _rooms = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, string> _roomCodeByConnection = new();

    public Room CreateRoom(Player host, string name, string? password)
    {
        var code = GenerateCode();
        var room = new Room { Id = code, Name = name, Password = password, HostId = host.Id };
        room.Players.Add(host);
        _rooms[code] = room;
        return room;
    }

    private string GenerateCode()
    {
        while (true)
        {
            var code = string.Create(5, CodeAlphabet, static (chars, alphabet) =>
            {
                for (var i = 0; i < chars.Length; i++)
                    chars[i] = alphabet[Random.Shared.Next(alphabet.Length)];
            });
            if (!_rooms.ContainsKey(code)) return code;
        }
    }

    public bool TryGetRoom(string code, out Room room) => _rooms.TryGetValue(code, out room!);

    public List<Room> PublicLobbyRooms() =>
        _rooms.Values
            .Where(r => r.Password is null && r.Status == RoomStatus.Lobby)
            .OrderByDescending(r => r.LastActivity)
            .ToList();

    public void RemoveRoom(Room room)
    {
        room.TimerCts.Cancel();
        _rooms.TryRemove(room.Id, out _);
    }

    public void MapConnection(string connectionId, string roomCode) => _roomCodeByConnection[connectionId] = roomCode;
    public void UnmapConnection(string connectionId) => _roomCodeByConnection.TryRemove(connectionId, out _);

    public bool TryGetRoomByConnection(string connectionId, out Room room)
    {
        room = null!;
        return _roomCodeByConnection.TryGetValue(connectionId, out var code) && _rooms.TryGetValue(code, out room!);
    }

    /// <summary>Borra las salas inactivas y devuelve las eliminadas para notificar.</summary>
    public List<Room> SweepIdle(DateTimeOffset now)
    {
        var idle = _rooms.Values.Where(r => now - r.LastActivity > MaxIdle).ToList();
        foreach (var room in idle) RemoveRoom(room);
        return idle;
    }

    public void Touch(Room room) => room.LastActivity = DateTimeOffset.UtcNow;
}
