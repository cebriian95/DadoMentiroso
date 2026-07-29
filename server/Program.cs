using server.Hubs;
using server.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSignalR();
builder.Services.AddSingleton<RoomManager>();
builder.Services.AddSingleton<GameEngine>();
builder.Services.AddHostedService<RoomSweeper>();

// CORS para desarrollo: permite acceder desde localhost:4200 y desde cualquier IP
// local (teléfono conectado a la misma red cuando `ng serve --host 0.0.0.0`).
// En producción el propio servidor sirve el cliente compilado y no hace falta.
builder.Services.AddCors(options => options.AddPolicy("dev", policy => policy
    .SetIsOriginAllowed(_ => true)
    .AllowAnyHeader()
    .AllowAnyMethod()
    .AllowCredentials()));

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseCors("dev");
}

app.MapHub<GameHub>("/hub/game");

app.Run();
