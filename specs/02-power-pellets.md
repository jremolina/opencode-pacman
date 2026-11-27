# SPEC 02 — Power pellets, modo asustado y fantasmas comestibles

> **Status:** Borrador
> **Depends on:** SPEC 01
> **Date:** 2026-11-26
> **Objective:** Añadir un power pellet en cada esquina que, al comerselo, deja a los fantasmas azules, aleatorios y comestibles durante 7 s (200→1600 puntos) antes de que vuelvan como ojos a la pen.

## Por qué existe este spec

La SPEC 01 dejó explícitamente pendiente el paquete «power pellets, modo asustado y fantasmas comestibles». Hoy la única interacción con un fantasma es morir, así que el tablero no tiene ningún momento de riesgo/recompensa: el jugador nunca puede contraatacar.

## Scope

**In:**

- Cuatro `o` en las esquinas de `MAZE_STR`: `(1,1)`, `(26,1)`, `(1,29)` y `(26,29)`; `parseTile('o')` → `4`.
- Comer un power pellet: 50 puntos, la celda queda en 0 y cuenta para ganar la partida.
- Temporizador `frightenedFrames` de 420 frames (7 s) y cadena `ghostChain` de 200×2.
- Giro forzado de 180° en los fantasmas vivos justo al activarse el efecto.
- Fantasmas asustados: dirección aleatoria en cada celda alineada, misma velocidad 0.1, cuerpo azul `#2121ff` con parpadeo a blanco en los últimos 2 s.
- Comer un fantasma asustado: 200, 400, 800 y 1600 puntos por cada caza de la misma activación.
- Fantasma comido: se dibuja solo como ojos, vuelve a su celda de la pen por BFS a 0.2 y espera 180 frames antes de salir de nuevo.
- Un segundo pellet durante el efecto suma 420 frames al tiempo restante.
- Limpieza del estado asustado y de los ojos al perder una vida.
- Una línea en `AGENTS.md` con el carácter `o` y la regla del modo asustado.

**Out of scope (para specs futuros):**

- Niveles, dificultad escalada y duración del efecto según el nivel.
- Fruta / bonus de mitad de tablero.
- HUD con barra o contador del tiempo asustado.
- Recuperar dots o pellets al perder una vida.
- Scatter/chase, sonido, sprites y puntuación alta.
- Cambios de laberinto, canvas, vidas o velocidades de movimiento.

## Data model

```js
// maze.js — esquinas del mapa legible
// MAZE_STR: los '.' de (1,1), (26,1), (1,29), (26,29) pasan a 'o'
parseTile( 'o' ) → 4;  // 0 vacio · 1 pared · 2 dot · 3 puerta · 4 power pellet

// game.js — constantes nuevas
const FRIGHT_FRAMES = 420;   // duración del modo asustado (7 s)
const FLASH_FRAMES = 120;    // ultimos 2 s: parpadeo blanco
const EYES_SPEED = 0.2;      // 1/5 celda/frame al volver como ojos
const RESPAWN_FRAMES = 180;  // espera en la pen antes de salir (3 s)

// game.js — estado de partida
game.frightenedFrames = 0;   // frames restantes; 0 = efecto apagado
game.ghostChain = 1;         // multiplicador: 200 * chain por fantasma comido

// cada fantasma añade:
{
  eaten: false,               // true = solo ojos volviendo a la pen
  home: { x, y },              // copia de su celda en GHOST_STARTS
  // releaseFrame se muta al ser comido: game.tick + RESPAWN_FRAMES
}
```

Convenciones:

- La celda 4 no bloquea a nadie: `isWall` solo mira 1 y 3, sin cambios.
- `dotsRemaining` se alimenta de los valores 2 **y** 4 al crear la partida.
- Todo el tiempo se mide en frames a 60 fps, igual que `releaseFrame`.
- El parpadeo usa el `frame` global que ya recibe `draw()`.

## Implementation plan

1. **Pellets visibles.** En `maze.js`, cambiar por `'o'` los cuatro puntos de las esquinas y mapear `'o'` a 4 en `parseTile`; actualizar el comentario de cabecera. En `render.js`, añadir `drawPellets( ctx, grid, frame )` con radio `5 + 2.5 * Math.sin( frame * 0.15 )` y color `DOT_COLOR`, llamado desde `draw()` después de `drawDots`.
   Prueba manual: aparecen cuatro pellets pulsantes en las esquinas y nada más cambia.
2. **Comer pellet.** En `movePacman`, si la celda es 4: ponerla a 0, `score += 50` y `dotsRemaining--`. En `createGame`, contar también los 4 en `dotsRemaining`.
   Prueba manual: comerlo suma 50, desaparece y ya no se gana sin recoger los cuatro.
3. **Estado asustado.** En `createGame`, inicializar `frightenedFrames = 0` y `ghostChain = 1`. Al comer el pellet, hacer `frightenedFrames += FRIGHT_FRAMES`, `ghostChain = 1` e invertir `g.dir` de los fantasmas que no estén en la pen ni comidos. En `update()`, decrementar `frightenedFrames` si es mayor que 0. En `decideGhost`, si hay efecto activo, elegir dirección aleatoria entre las válidas antes de cualquier regla de `kind`. En `resetPositions`, poner `frightenedFrames = 0` y `ghostChain = 1`.
   Prueba manual: al comer el pellet los fantasmas giran 180° al instante y recorren 7 s eligiendo cruces al azar.
4. **Render asustado.** En `render.js`, extraer el dibujo de ojos a `drawEyes( ctx, g )` y añadir `ghostColor( g, game, frame )`: si `g.eaten` → solo ojos; si asustado y quedan ≤ `FLASH_FRAMES` con `Math.floor( frame / 15 ) % 2 === 0` → `#ffffff`; si asustado → `#2121ff`; si no → `g.color`.
   Prueba manual: los fantasmas se ven azules y parpadean en blanco los últimos 2 s.
5. **Comer fantasmas.** En `createGame`, copiar `home` y `eaten = false`. En `update()`, por cada colisión: si `g.eaten`, ignorar; si hay efecto activo, `score += 200 * game.ghostChain`, `game.ghostChain *= 2` y `g.eaten = true`; si no, restar vida como hasta ahora. En `moveGhost`, si `g.eaten`, saltarse `decideGhost` y usar `EYES_SPEED`; en celda alineada, `bfsNextDir( grid, g, g.home )`; al alcanzar `home`, `eaten = false`, `inPen = true` y `releaseFrame = game.tick + RESPAWN_FRAMES`.
   Prueba manual: durante el efecto, chocar come al fantasma y suma 200/400/800/1600; los ojos vuelven a la pen y a los 3 s el fantasma reaparece por la puerta.
6. **Muerte limpia.** En `resetPositions`, añadir por fantasma `eaten = false` y restaurar `releaseFrame = GHOST_STARTS[ i ].releaseFrame`.
   Prueba manual: morir con el efecto activo borra azul, ojos y cadena, y se repite la salida escalonada original.
7. **Documentación.** Añadir en `AGENTS.md` el carácter `o` = power pellet(4) en la lista de celdas y una nota con la regla del modo asustado junto a los cuatro `kind`.
   Prueba manual: el archivo describe el sistema real.

## Acceptance criteria

- [ ] La consola del navegador no muestra errores al cargar ni al jugar.
- [ ] Hay exactamente cuatro power pellets en (1,1), (26,1), (1,29) y (26,29), con radio pulsante.
- [ ] Comer un power pellet suma 50 puntos y la celda queda vacía.
- [ ] La partida solo se gana cuando no queda ningún dot ni ningún power pellet.
- [ ] Al comer un pellet, los fantasmas que no están en la pen invierten su dirección al instante.
- [ ] Durante 7 s los fantasmas eligen dirección al azar en cada celda y se pintan azul `#2121ff` con velocidad 0.1.
- [ ] En los últimos 2 s del efecto el fantasma parpadea entre azul y blanco.
- [ ] Comer un segundo pellet con el efecto aún activo suma 420 frames al tiempo restante.
- [ ] Chocar con un fantasma asustado lo come y suma 200, luego 400, luego 800 y luego 1600 en la misma activación.
- [ ] El fantasma comido se dibuja solo como ojos y vuelve por el camino más corto a su celda de la pen.
- [ ] Al llegar los ojos a la pen, el fantasma vuelve a salir tras 3 segundos.
- [ ] Chocar con un fantasma sin efecto sigue restando una vida; chocar con los ojos no pasa nada.
- [ ] Al perder una vida se limpian modo asustado, ojos y cadena, y se repite la salida escalonada de la SPEC 01.
- [ ] Los fantasmas siguen girando solo en celdas alineadas; 0.125 y 0.1 no cambian.
- [ ] Dots, túnel, overlays de victoria/derrota y reinicio siguen funcionando.

## Decisions

- **Sí:** carácter `'o'` dentro de `MAZE_STR`. El mapa legible sigue siendo la única fuente de verdad, igual que `'-'` para la pen.
- **No:** array `POWER_PELLETS` aparte en `maze.js`. Dos listas de posiciones se desincronizan con el primer cambio de laberinto.
- **Sí:** los pellets cuentan en `dotsRemaining`. Gana quien limpia el tablero entero.
- **No:** recuperar dots y pellets al perder una vida. Hoy los dots comidos persisten; cambiar eso altera una regla ajena y merece spec propio.
- **Sí:** dirección aleatoria manteniendo la velocidad 0.1. No se toca una velocidad que sostiene la alineación y las IAs.
- **No:** ralentizar a 0.05 los fantasmas asustados. La ventaja ya viene de poder comérselos.
- **Sí:** giro forzado 180° al instante. Es lo que espera el jugador del arcade y cuesta una línea.
- **No:** HUD con barra de tiempo. El parpadeo final da el aviso sin ocupar el canvas.
- **Sí:** suma de +420 frames por pellet extra en vez de reiniciar el contador. Recompensa coger la segunda pelota sin crear ventajas infinitas (son solo cuatro pelotas por tablero).
- **Sí:** ojos a 0.2 con `bfsNextDir` hacia su `home`. Reutiliza el camino más corto ya escrito para el `chaser`.
- **No:** teletransporte a la pen. El viaje de los ojos es la señal visual de que el fantasma «nació de nuevo».
- **Sí:** reutilizar `releaseFrame` con valor absoluto (`game.tick + RESPAWN_FRAMES`) para la espera de salida. Evita un segundo temporizador por fantasma, siempre que `resetPositions` lo restaure desde `GHOST_STARTS`.
- **No:** dificultad creciente del efecto. No hay niveles; si los hay, escala en otro spec.

## Risks

| Riesgo                                                                    | Mitigación                                                                        |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Colisión con ojos al terminar el efecto: se comería a un fantasma ya comido | En `update()`, comprobar `g.eaten` antes que `frightenedFrames`.                  |
| `releaseFrame` mutado se hereda al perder una vida                        | `resetPositions` lo restaura desde `GHOST_STARTS[ i ]` en el paso 6.              |
| `createGame` solo cuenta tiles 2 y la victoria se vuelve imposible       | El paso 2 amplía el recuento a 2 y 4 antes de que haya pellets comibles.          |
| BFS de los ojos sobre posición fraccionada                                | Como en el `chaser`: `bfsNextDir` solo se llama en celda alineada.               |
| Las cuatro esquinas dejan de ser transitables si cambia el laberinto      | Las coordenadas viven en `MAZE_STR`, donde la regla `#`/`o` es visible a simple vista. |

## What is **not** in this spec

- Niveles, fruta, dificultad escalada y puntuación alta.
- HUD con temporizador del modo asustado.
- Recuperar el tablero completo al perder una vida.
- Sonido, sprites y cualquier asset fuera del render procedural.
- Cambios de geometría, canvas, vidas o velocidades.

Cada uno de esos, si llega, va en su propio spec.
