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
        while (true)
        {
            var code = GenerateCode();
            var room = new Room { Id = code, Name = name, Password = password, HostId = host.Id };
            room.Players.Add(host);
            if (_rooms.TryAdd(code, room)) return room;
        }
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

    public bool TryGetRoom(string code, out Room room) => _rooms.TryGetValue(code, out room!) && !room.Removed;

    public List<Room> PublicRooms() => _rooms.Values
        .Where(r => { lock (r.Lock) return !r.Removed && r.Password is null; })
        .OrderByDescending(r => { lock (r.Lock) return r.LastActivity; })
        .ToList();

    public bool RemoveRoom(Room room)
    {
        lock (room.Lock)
        {
            if (room.Removed) return false;
            room.Removed = true;
            room.TimerCts.Cancel();
            _rooms.TryRemove(new KeyValuePair<string, Room>(room.Id, room));
            foreach (var mapping in _roomCodeByConnection.Where(x => x.Value.Equals(room.Id, StringComparison.OrdinalIgnoreCase)).ToList())
                _roomCodeByConnection.TryRemove(mapping.Key, out _);
            return true;
        }
    }

    public string? MapConnection(string connectionId, string roomCode)
    {
        _roomCodeByConnection.TryGetValue(connectionId, out var previous);
        _roomCodeByConnection[connectionId] = roomCode;
        return previous;
    }
    public void UnmapConnection(string connectionId, string? roomCode = null)
    {
        if (roomCode is null) _roomCodeByConnection.TryRemove(connectionId, out _);
        else _roomCodeByConnection.TryRemove(new KeyValuePair<string, string>(connectionId, roomCode));
    }

    public bool TryGetRoomByConnection(string connectionId, out Room room)
    {
        room = null!;
        return _roomCodeByConnection.TryGetValue(connectionId, out var code) && _rooms.TryGetValue(code, out room!) && !room.Removed;
    }

    /// <summary>Borra las salas inactivas y devuelve las eliminadas para notificar.</summary>
    public List<Room> SweepIdle(DateTimeOffset now)
    {
        var idle = _rooms.Values.Where(r => { lock (r.Lock) return !r.Removed && now - r.LastActivity > MaxIdle; }).ToList();
        var removed = idle.Where(RemoveRoom).ToList();
        return removed;
    }

    public void Touch(Room room)
    {
        lock (room.Lock)
            if (!room.Removed) room.LastActivity = DateTimeOffset.UtcNow;
    }
}
