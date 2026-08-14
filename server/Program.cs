using server.Hubs;
using server.Services;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSignalR();
builder.Services.AddSingleton<RoomManager>();
builder.Services.AddSingleton<GameEngine>();
builder.Services.AddHostedService<RoomSweeper>();
builder.Services.AddHealthChecks();

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("hub", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 120,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
        }));
});

// CORS para desarrollo: permite acceder desde localhost:4200 y desde cualquier IP
// local (teléfono conectado a la misma red cuando `ng serve --host 0.0.0.0`).
// En producción el propio servidor sirve el cliente compilado y no hace falta.
var configuredOrigins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>()
    ?? ["http://localhost:4200"];
builder.Services.AddCors(options => options.AddPolicy("dev", policy => policy
    .WithOrigins(configuredOrigins)
    .AllowAnyHeader()
    .AllowAnyMethod()));

var app = builder.Build();
app.UseRateLimiter();

if (app.Environment.IsDevelopment())
{
    app.UseCors("dev");
}

app.MapHealthChecks("/health");
app.MapHub<GameHub>("/hub/game").RequireRateLimiting("hub");

app.Run();
