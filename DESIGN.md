# Design

<!-- Mundo visual heredado del cubilete digital original y ampliado al juego online. -->

## World

**Casino de sobremesa nocturno.** Una mesa de fieltro verde a oscuras, con luz cálida centrada en el paño. Lo importante (turno, apuesta, tu acción) brilla en amarillo dorado; lo secundario se hunde en el verde. Los dados son objetos físicos: blancos, con puntos, con sombra real.

En modo claro se invierte el fondo a un verde menta claro y los textos pasan a oscuros, manteniendo el acento dorado y el lenguaje de componentes.

## Color

Estrategia **Restrained** con un tema oscuro por defecto y un claro alternativo. Los colores se definen como variables CSS en `client/src/styles.css` y se exponen a Tailwind vía `@theme`. No se hardcodean valores en los templates.

### Modo oscuro (default)

- Fondo: `radial-gradient(ellipse at center, #0d1b0e 0%, #05080a 100%)`.
- Acento principal: amarillo dorado `#f7e05e` (títulos, turno activo, apuesta actual, CTA primario con degradado `accent-light → accent-dark`).
- Peligro (Mentira, expulsar, perder): rojo `#f87171`.
- Exacto / acierto: esmeralda `#34d399`.
- Superficies: blanco con opacidad 5–20% (`surface-a5..a20`); bordes con opacidad 10–20%.
- Texto: primario `#e2e8f0`, secundario `#94a3b8`, apagado `#64748b`.

### Modo claro

- Fondo: `radial-gradient(ellipse at center, #f0fdf4 0%, #dcfce7 100%)`.
- Acento: `#d4a00e` (dorado más oscuro para mantener contraste).
- Peligro: `#dc2626`; éxito: `#059669`.
- Superficies: blanco con opacidad 55–95% para crear tarjetas sobre el fondo verde.
- Texto: primario `#0f172a`, secundario `#475569`, apagado `#94a3b8`.

El tema se cambia añadiendo la clase `dark` o `light` a `<html>` (`services/theme.service.ts`).

## Type

- Stack de sistema: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial`.
- Display (títulos, ganador): `font-black`, `tracking-widest`, amarillo acento.
- UI: `text-sm`/`text-base`, pesos 600-800 en botones.
- Etiquetas pequeñas: `text-xs`, `tracking-[1px]`, uppercase, secundario.

## Components

- **Botón primario:** `rounded-2xl`, degradado amarillo, texto oscuro, `active:scale-95`, sombra con offset.
- **Botón fantasma:** superficie translúcida, borde sutil, `rounded-xl`.
- **Botón peligro:** tinte rojo translúcido.
- **Dado CSS:** div blanco con 9 `.pip`, clases `face-1..6`, sombra real; animación `rolling` de tirada realista (gira 360º en el aire y cae con rebote).
- **Rueda de apuesta (bet wheel):** columna vertical con scroll-snap; muestra el seleccionado + 1.5 ítems arriba + 1.5 abajo; el seleccionado es grande y amarillo, los demás atenuados y difuminados por máscara.
- **Mesa de juego:** en móvil, rivales en una tira horizontal; en escritorio, rivales en columna a la izquierda, chat a la derecha y el usuario/dados/acciones en el centro.
- **Chat:** panel con mensajes compactos, nombre del propio jugador en acento; cajón en móvil y panel fijo en escritorio.
- **Modales:** overlay oscuro con `backdrop-blur`, panel degradado `modal-from → modal-to`, `rounded-2xl`.

## Motion

- **Tirada de dados:** animación realista (rotación 3D + rebote) en lugar de una sacudida plana; cada dado puede tener `animation-delay` escalonado.
- **Revelación de dados:** pop escalonado con ligero rebote.
- **Resto:** transiciones `active:scale-95` y cambios de estado discretos. Sin parallax ni partículas.

## Rules

- Mobile-first; home/lobby en columna central `max-w-[480px]`.
- Mesa: en móvil columna única `max-w-[480px]`; en escritorio tres columnas (`lg:grid-cols-[200px_1fr_320px]`, `max-w-[1300px]`).
- Todo texto en español.
- `user-select: none` global; touch handlers y estados `active:` siempre.
- Sin emojis como iconos de UI salvo 👑 (host) y 🏆/punto de victoria en marcadores.
