using Microsoft.AspNetCore.SignalR;
using server.Hubs;

namespace server.Services;

/// <summary>Borra salas con más de 5h de inactividad (jugadores que cerraron la página sin borrar la sala).</summary>
public sealed class RoomSweeper : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(1);

    private readonly RoomManager _rooms;
    private readonly GameEngine _engine;
    private readonly IHubContext<GameHub> _hub;

    public RoomSweeper(RoomManager rooms, GameEngine engine, IHubContext<GameHub> hub)
    {
        _rooms = rooms;
        _engine = engine;
        _hub = hub;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var removed = _rooms.SweepIdle(DateTimeOffset.UtcNow);
                foreach (var room in removed)
                    _ = _hub.Clients.Group(room.Id).SendAsync("RoomDeleted", room.Id);
                if (removed.Count > 0)
                    _engine.NotifyPublicRoomsChanged();
            }
            catch
            {
                // El sweeper nunca debe morir.
            }
            await Task.Delay(Interval, stoppingToken);
        }
    }
}
