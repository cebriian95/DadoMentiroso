# Dado Mentiroso Online

Juego online multijugador del "Dado Mentiroso" (Perudo/Liar's Dice) al estilo Pinturillo: salas con código, host, apuestas en tiempo real y chat. Todo el texto de la UI está en español; mantenerlo así.

## Reglas y contexto

- **Reglas completas del juego:** `REGLASJUEGO.md` (léelo antes de tocar lógica de juego).
- **Producto y mundo visual:** `PRODUCT.md` y `DESIGN.md` (skill impeccable; mantener el casino verde fieltro + amarillo `#f7e05e`, dados CSS con pips).

## Arquitectura

Monorepo con dos apps:

- `server/` — ASP.NET Core 10 (net10.0) con **SignalR**. **Sin BBDD**: salas en memoria (`RoomManager`, `ConcurrentDictionary`); un `RoomSweeper` (BackgroundService) borra salas inactivas >5h.
  - `Models/GameModels.cs` — entidades y DTOs (contrato con el cliente; la copia TS está en `client/src/app/models.ts`; mantenerlos sincronizados).
  - `Services/GameEngine.cs` — **toda la lógica de juego autoritativa**: dados, turnos, validación de apuestas, Mentira/Exacto, timers (10s tirada / 3min turno / 8s revelado / 60s reconexión). El servidor es la única fuente de verdad: cada cliente recibe solo sus dados (`YourDice`). La fase de tirada se acorta si todos los jugadores activos pulsan TIRAR (`MarkRolled`).
  - `Hubs/GameHub.cs` — entrada de acciones; grupo SignalR = código de sala; grupo `public-watchers` = lista de salas públicas.
  - **Concurrencia:** toda mutación de sala bajo `room.Lock`; los timers usan `room.PhaseToken` para invalidarse entre sí. No romper este patrón.
- `client/` — Angular 21 (standalone, signals, OnPush, control flow `@if/@for`) + TailwindCSS 4 (`@tailwindcss/postcss`, sin config file).
  - `services/game.service.ts` — conexión SignalR + todo el estado en signals (`room`, `myDice`, `reveal`, `chat`...). Re-unión automática a la sala tras reconexión de SignalR.
  - `services/user.service.ts` — `playerId` (UUID) y username en localStorage (`dmPlayerId`, `dmUsername`); el playerId permite reconectar a partidas.
  - Vistas: `views/home` (login/crear/unirse/salas), `views/room` (shell que alterna `lobby` y `game`). Guard `/sala` exige sala activa.
  - Dados CSS puros (`.dice.face-N` + 9 pips) en `styles.css` (portados del cubilete original); componente `dice`.
  - **Gotcha OnPush:** los `computed()` solo se recalculan si leen signals. Nunca leer propiedades planas dentro de un `computed` (ya hubo un bug por esto en el home); campos de formulario = `signal()`.
  - **Tema:** `services/theme.service.ts` gestiona oscuro/claro/auto (`dmTheme`) añadiendo la clase `dark`/`light` a `<html>`. Los colores de la UI usan variables CSS mapeadas en `styles.css` vía `@theme`; no hardcodear `#f7e05e` ni `text-white` en templates (excepción: la bandeja de la rueda `.wheel-tray`, fieltro oscuro fijo en ambos temas).
  - **Gotcha contexto seguro:** `crypto.randomUUID()` NO existe en `http://<ip-local>` (no-HTTPS). `user.service.ts` tiene un fallback manual; no llamar a APIs de contexto seguro (crypto.randomUUID, navigator.clipboard sin guard) directamente.
  - **Layout móvil:** la vista de juego usa `flex flex-col` + `main flex-1` para anclar las acciones abajo; en `lg:` pasa a grid de 3 columnas. No quitar el `flex-col` del contenedor raíz del juego.

## Comandos

- **Backend (dev):** `dotnet run --project server --urls http://localhost:5080`
- **Backend (dev, accesible desde móvil):** `dotnet run --project server --urls http://0.0.0.0:5080`
- **Frontend (dev):** `cd client && npx ng serve` (en :4200; el hub se resuelve a `:5080` automáticamente cuando el puerto es 4200, y a ruta relativa `/hub/game` en producción). Para probar desde un móvil en la misma red: `npx ng serve --host 0.0.0.0` (el servidor también debe arrancarse con `--urls http://0.0.0.0:5080`).
- **Build cliente:** `cd client && npx ng build`
- **CORS:** en Development se permite cualquier origen para facilitar pruebas desde otros dispositivos; en producción el servidor servirá el cliente compilado (pendiente: Docker).
- **Test E2E sin navegador:** scripts en `/tmp/opencode/e2e/test.mjs` y `test-gameover.mjs` (Node + `@microsoft/signalr` contra el server en :5080). No están en el repo; recrearlos si hace falta.

## Pendiente (fase final, cuando el usuario lo pida)

- Dockerfile multi-stage (build Angular → wwwroot del servidor, `linux/arm64` para Raspberry Pi) + `docker-compose.yml`. En el servidor faltará `UseDefaultFiles/UseStaticFiles/MapFallbackToFile` para servir el SPA.
