# Reglas del juego — Dado Mentiroso Online

Documento de referencia con todas las normas implementadas (y por implementar) en el juego. Fuente de verdad para futuras sesiones.

## Concepto general

Juego de dados y faroles para **2-12 jugadores** (Perudo / Liar's Dice), online, al estilo Pinturillo: sin cuentas, salas con código, un host y partidas por rondas.

**Objetivo:** ser el último jugador que conserva dados.

## Identidad y sesiones

- No hay registro: cada jugador solo tiene un **nombre de usuario** (1-16 caracteres) que se guarda en `localStorage` y se prerrellena en futuras sesiones.
- El cliente genera un `playerId` (UUID) persistente en `localStorage` que permite **reconectar** a una partida en curso (ventana de 60 segundos).

## Salas

- **Crear sala:** nombre de sala (1-30 caracteres), visibilidad pública o privada. Si es privada, contraseña obligatoria de **3 a 20 caracteres**. Al crearla se genera un **código único de 5 caracteres** (alfabeto sin caracteres ambiguos: sin 0/O, 1/I/L).
- **Unirse a sala privada:** nombre de usuario + código de sala + contraseña.
- **Salas públicas:** lista en vivo de salas en preparación y partidas en curso. Las partidas en curso aparecen marcadas como **En curso**; al tocar su nombre se muestra el código para compartirlo o unirse. Unirse no requiere contraseña.
- Quien se une a una sala (por código) **en mitad de una partida** queda pendiente y entra al comenzar la siguiente ronda con la media redondeada de los dados de los jugadores activos (mínimo 1 dado).
- Las salas se **borran automáticamente tras 5 horas de inactividad**.
- Capacidad máxima: **12 jugadores** por sala.

## Sala de preparación (lobby)

- El creador es el **host** 👑. Si abandona, el host pasa al siguiente jugador de la lista.
- El host puede:
  - Elegir el **número de dados por jugador** (1-10, por defecto 5).
  - **Expulsar** a cualquier jugador (con confirmación).
  - **Iniciar la partida** (mínimo 2 jugadores).
  - **Borrar la sala**: todos los jugadores vuelven a la pantalla de inicio.
- Durante una partida, el host puede expulsar jugadores manteniendo pulsado su recuadro y confirmando la acción.
- Cualquier jugador puede salir de la sala.
- Hay **chat de texto** (también durante la partida; los espectadores pueden chatear).
- Junto a cada nombre se muestran sus **victorias** (un punto por partida ganada en esta sala).

## Estructura de una partida

### Fase 1 — Tirada de dados (10 segundos)

- El servidor genera los dados de todos los jugadores activos (cada uno conserva los dados que le queden) y envía a cada cliente **solo sus propios dados** (el servidor es autoritativo: nadie puede ver los dados ajenos).
- Hay **10 segundos** para pulsar TIRAR.
- Si **todos los jugadores activos** pulsan TIRAR antes de que terminen los 10 segundos, la fase se acorta y comienzan las apuestas inmediatamente.
- Si se agota el tiempo, los dados se muestran automáticamente y empiezan las apuestas.

### Fase 2 — Apuestas (3 minutos por turno)

- La primera ronda la abre un jugador **aleatorio**; las siguientes las abre quien perdió un dado en la resolución anterior.
- Una apuesta es "**N dados de valor V**" (ej: "cuatro 5s") sobre el total de dados de TODOS los jugadores activos.
- En su turno, el jugador puede: **apostar**, decir **Mentira** o decir **Exacto** (Mentira y Exacto solo existen si ya hay una apuesta en la mesa).

#### Regla de apuesta válida

La nueva apuesta debe **superar estrictamente** a la anterior:

- **Más cantidad** con cualquier valor (4 cincos → 5 cualquier valor), o
- **Misma cantidad con valor mayor** (4 cincos → 4 seises).

Consecuencias:

- Si la apuesta anterior es "4 dados de valor 6", la única subida posible es aumentar la cantidad (el valor ya es máximo); al subir la cantidad el valor vuelve a ser libre.
- Si la apuesta ya cubre **todos los dados de la mesa a valor 6**, no existe subida posible: el jugador solo puede decir Mentira o Exacto.
- La cantidad nunca puede superar el total de dados en juego.

#### Mentira (impugnar)

Se revelan los dados de todos:

- Si hay **menos** dados de valor V que los apostados → el **apostante** pierde 1 dado.
- Si hay **al menos** los apostados → quien dijo "Mentira" pierde 1 dado.
- La siguiente ronda la empieza **quien perdió el dado**.

#### Exacto

Se revelan los dados de todos:

- Si hay **exactamente** N dados de valor V → **todos los demás jugadores activos** pierden 1 dado. La siguiente ronda la empieza **el jugador siguiente** al que dijo "Exacto".
- Si no es exacto → quien dijo "Exacto" pierde 1 dado y **empieza él** la siguiente ronda.

### Fin de ronda

- Tras cada resolución hay unos segundos de revelado (8s) mostrando los dados de todos y el resultado, y comienza una nueva ronda (fase 1).
- Durante el revelado se muestran los dados completos de la ronda; la pérdida se aplica al terminar el revelado, antes de la siguiente ronda.
- Quien se queda **con 0 dados** pasa a **espectador**: sale de la mesa, no participa en las apuestas, pero permanece en la sala y puede usar el chat.

### Fin de partida

- Cuando solo queda **1 jugador con dados**, ese jugador **gana la partida** y suma 1 punto de victoria.
- Todos vuelven a la **sala de preparación** (los espectadores recuperan sus dados para la siguiente partida). El host puede cambiar el número de dados, expulsar, iniciar otra partida o borrar la sala.

## Tiempos (gobernados por el servidor)

| Temporizador | Duración | Al expirar |
|---|---|---|
| Fase de tirada | 10 s | Se muestran los dados automáticamente y empiezan las apuestas |
| Turno de apuesta | 3 min | El servidor realiza la **apuesta mínima válida** por el jugador (o Mentira si no hay subida posible) |
| Revelado de dados | 8 s | Comienza la siguiente ronda (o termina la partida) |
| Reconexión | 60 s | Si no vuelve, pierde sus dados y queda como espectador (o se borra de la sala) |
| Inactividad de sala | 5 h | La sala se borra automáticamente |

## Desconexiones

- Al perder la conexión, el jugador se marca como **desconectado** (visible para los demás) durante 60 segundos.
- Si vuelve dentro de la ventana, recupera su sitio, sus dados y su turno.
- Si no vuelve: se elimina de la sala; si estaba en partida, sus dados salen del juego y queda fuera. Si era su turno, pasa al siguiente. Si era el host, el host pasa a otro jugador.
- Si solo queda 1 jugador activo por desconexiones, ese jugador gana la partida.

## Decisiones de diseño confirmadas

- **Sin comodines**: los 1 (ases) NO cuentan como cualquier valor (se descartó la regla clásica del Perudo).
- **Sin regla de "calza"**.
- El servidor es la única fuente de verdad: dados, turnos y tiempos nunca se calculan en el cliente.
- UI en español, mobile-first.
