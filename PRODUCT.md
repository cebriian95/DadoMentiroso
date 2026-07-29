# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Grupos de amigos (2-12) que quieren jugar al Dado Mentiroso/Perudo online, cada uno desde su móvil. Uso casual: partidas en sobremesa, quedadas o a distancia. Sin cuentas ni registro: solo un nombre de usuario.

## Product Purpose

Juego online multijugador del Dado Mentiroso con salas al estilo Pinturillo: crear sala (pública o privada con contraseña), unirse con código, lista de salas públicas, sala de preparación con host, partidas por rondas con apuestas, Mentira y Exacto, chat en vivo. El último jugador con dados gana.

## Positioning

A diferencia de juegos con registro y emparejamiento, aquí no hay fricción: sin cuentas, sin descargas, salas efímeras con código de 5 caracteres y contraseña opcional. El servidor es autoritativo (los dados nunca salen del servidor salvo los tuyos), así que no se puede hacer trampa.

## Operating Context

Mobile-first (la vista de juego está pensada para el teléfono de cada jugador), pero funciona en escritorio. Se despliega en una Raspberry Pi (arm64) con Docker. Las salas se autodestruyen tras 5h de inactividad. Desconexiones: ventana de 60s para reconectar conservando la sesión (id de jugador en localStorage).

## Capabilities and Constraints

- Reglas del juego: apuesta creciente (más cantidad, o misma cantidad con mayor valor), Mentira (pierde dado quien falle), Exacto (acertar la cantidad exacta: los demás pierden dado; fallar: pierdes tú). Sin comodines ni ases (decisión del usuario).
- Tiempos gobernados por el servidor: 10s para la fase de tirada, 3min por turno de apuesta (si expira, apuesta mínima automática).
- Host: elige nº de dados (1-10), expulsa jugadores, inicia la partida (mínimo 2), borra la sala.
- Espectadores: al quedarte sin dados sigues en la sala, solo chat.
- Victorias: punto acumulado junto al nombre, visible en la sala de preparación.
- Stack: Angular + ASP.NET Core SignalR, salas en memoria (sin BBDD), UI en español.

## Brand Commitments

Hereda la identidad del cubilete digital original (mismo repo, historial git): mesa de casino nocturna — verde fieltro oscuro, amarillo dorado para lo importante, dados CSS con puntos. Todo el texto en español.

## Evidence on Hand

El proyecto original (cubilete estático) vive en el historial git (`git show HEAD~:index.html`, `dice.css`): paleta, dados CSS y lenguaje de botones ya validados con usuarios reales.

## Product Principles

1. **Cero fricción:** abrir la página y estar jugando en 30 segundos.
2. **El servidor manda:** estado, dados y tiempos solo en servidor; el cliente es una vista.
3. **Lo importante se ve:** de quién es el turno, cuál es la apuesta y cuánto queda deben saltar a la vista.
4. **Móvil primero:** cada acción alcanzable con el pulgar.
