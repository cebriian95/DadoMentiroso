# Dado Mentiroso Online

Juego online multijugador del "Dado Mentiroso" (Perudo/Liar's Dice) al estilo Pinturillo: salas con código, host, apuestas en tiempo real y chat. Todo el texto de la UI está en español; mantenerlo así.

## Reglas y contexto

- **Reglas completas del juego:** `REGLASJUEGO.md` (léelo antes de tocar lógica de juego).
- **Producto y mundo visual:** `PRODUCT.md` y `DESIGN.md` (skill impeccable; mantener el casino verde fieltro + amarillo `#f7e05e`, dados CSS con pips).

## Arquitectura

Monorepo con dos apps:

- `server/` — ASP.NET Core 10 (net10.0) con **SignalR**. **Sin BBDD**: salas en memoria (`RoomManager`, `ConcurrentDictionary`); un `RoomSweeper` (BackgroundService) borra salas inactivas >5h.
  - `Models/GameModels.cs` — entidades y DTOs (contrato con el cliente; la copia TS está en `client/src/app/models.ts`; mantenerlos sincronizados). El orden de turno se envía en `GameDto.TurnOrder` y los jugadores que esperan la siguiente ronda llevan `PendingJoin`.
  - `Services/GameEngine.cs` — **toda la lógica de juego autoritativa**: dados, turnos, validación de apuestas, Mentira/Exacto, incorporación pendiente con media de dados, timers (10s tirada / 3min turno / 8s revelado / 60s reconexión). El servidor es la única fuente de verdad: cada cliente recibe solo sus dados (`YourDice`). La fase de tirada se acorta si todos los jugadores activos pulsan TIRAR (`MarkRolled`). Durante el revelado se muestran primero los dados completos y la pérdida se aplica al finalizar los 8s.
  - `Hubs/GameHub.cs` — entrada de acciones; grupo SignalR = código de sala; grupo `public-watchers` = lista de salas públicas.
  - **Concurrencia:** toda mutación de sala bajo `room.Lock`; los timers usan `room.PhaseToken` para invalidarse entre sí. No romper este patrón.
  - **Colores de avatar:** el servidor asigna `ColorIndex` (0-11) al unirse un jugador. El hub `SetPlayerColor` permite cambiarlo solo en el lobby (validación de no-conflicto). El cliente usa la paleta `AVATAR_COLORS` en `game.service.ts` indexando con el `colorIndex` del servidor — nunca un mapa local.
- `client/` — Angular 21 (standalone, signals, OnPush, control flow `@if/@for`) + TailwindCSS 4 (`@tailwindcss/postcss`, sin config file).
  - `services/game.service.ts` — conexión SignalR + todo el estado en signals (`room`, `myDice`, `reveal`, `chat`, `roundBets`, `loserPlayers`...). Re-unión automática a la sala tras reconexión de SignalR y tras recarga de página (persistencia de sala en `dmRoomCode`/`dmRoomPassword` en localStorage; `tryReconnect()` en guard y HomeComponent).
  - `services/user.service.ts` — `playerId` (UUID con fallback manual para http no-seguro) y username en localStorage (`dmPlayerId`, `dmUsername`). **No usa `crypto.randomUUID()` directamente** (no existe en `http://<ip-local>`).
  - Vistas: `views/home` (login/crear/unirse/salas), `views/room` (shell que alterna `lobby` y `game`). Guard `/sala` exige sala activa (async — intenta `tryReconnect()` antes de redirigir).
  - Dados CSS puros (`.dice.face-N` + 9 pips) en `styles.css` (portados del cubilete original); componente `dice`. La animación de tirada **no es infinita**: se dispara una vez al pulsar TIRAR (señal `rollingNow` + setTimeout 450ms). Botón **Ordenar ↑** debajo de los dados.
  - **Gotcha OnPush:** los `computed()` solo se recalculan si leen signals. Nunca leer propiedades planas dentro de un `computed` (ya hubo un bug por esto en el home); campos de formulario = `signal()`.
  - **Solo modo oscuro** (no hay theme service ni toggle). Los colores de la UI usan variables CSS mapeadas en `styles.css` vía `@theme`. La bandeja de la rueda (`.wheel-tray`) es fieltro oscuro fijo.
  - **Layout móvil:** la vista de juego usa `flex flex-col` + `main flex-1` para anclar las acciones abajo; en `lg:` pasa a grid de 3 columnas. Los cajones de chat son `fixed` (no `absolute`) para que no se vean al hacer scroll. El lobby usa `grid grid-cols-3` para los jugadores y chat desplegable igual que el juego.
  - **Indicadores:** `loserPlayers` señal muestra badge −1 y borde rojo en el modal de revelado. `roundBets` señal guarda el historial de apuestas de la ronda (modal al tocar apuesta actual). En partida, el orden de turno incluye al jugador local y el host puede expulsar con pulsación larga sobre un recuadro.
  - **Modal de reglas:** `components/rules-modal` — se muestra automáticamente la primera visita (`dmRulesSeen` en localStorage) y mediante botón "Reglas" en la cabecera del juego.

## Comandos

- **Backend (dev):** `dotnet run --project server --urls http://localhost:5080`
- **Backend (dev, accesible desde móvil):** `dotnet run --project server --urls http://0.0.0.0:5080`
- **Frontend (dev):** `cd client && npx ng serve` (en :4200; el hub se resuelve a `:5080` automáticamente cuando el puerto es 4200, y a ruta relativa `/hub/game` en producción). Para probar desde un móvil en la misma red: `npx ng serve --host 0.0.0.0` (el servidor también debe arrancarse con `--urls http://0.0.0.0:5080`).
- **Build cliente:** `cd client && npx ng build`
- **CORS:** en Development se permite cualquier origen para facilitar pruebas desde otros dispositivos; en producción el servidor servirá el cliente compilado (pendiente: Docker).
- **Test E2E sin navegador:** scripts en `/tmp/opencode/e2e/test.mjs` y `test-gameover.mjs` (Node + `@microsoft/signalr` contra el server en :5080). No están en el repo; recrearlos si hace falta.

## Docker (arm64, Raspberry Pi)

- **Imágenes:** `cebriian95/dado-mentiroso-api_arm` (backend .NET) y `cebriian95/dado-mentiroso-frontend_arm` (nginx + Angular).
- **Build y push:** `docker buildx build --platform linux/arm64 -t cebriian95/dado-mentiroso-api_arm:latest --push ./server` (ídem para `./client`).
- **docker-compose.yml** en la raíz: backend en `5253:8080` (dominio `backdadomentiroso.cebrian.app`), frontend en `3000:80` (dominio `dadomentiroso.cebrian.app`).
- **nginx.conf** en `client/`: sirve el SPA con fallback a `index.html` y proxy de `/hub/game` al contenedor `backend:8080` (sin CORS en producción porque es mismo origen).
- **En la Raspberry Pi:** `docker compose pull && docker compose up -d`
