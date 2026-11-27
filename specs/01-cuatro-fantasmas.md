# SPEC 01 — Cuatro fantasmas con comportamientos distintos

> **Status:** Aprobado
> **Depends on:** —
> **Date:** 2026-11-25
> **Objective:** Pasar de dos fantasmas genéricos a cuatro con comportamiento propio —perseguidor agresivo, emboscador, errático y cobarde— que salen escalonados de la pen y se mueven con reglas distintas.

## Por qué existe este spec

Hoy `GHOST_STARTS` define dos fantasmas (`hunter` y `random`) y `decideGhost()` los trata como un caso especial y un `else`. Eso no escala a cuatro y no da la sensación de "cada fantasma es un personaje". Este spec convierte el comportamiento en un dato declarado por fantasma y una función por tipo, sin tocar el resto del juego.

## Scope

**In:**

- Cuatro entradas en `GHOST_STARTS` con `kind`, `name`, `color` y `releaseFrame`.
- Cuatro comportamientos: `chaser` (persigue con BFS), `ambusher` (apunta 4 celdas delante de Pac-Man), `wanderer` (aleatorio), `coward` (patrulla la esquina inferior derecha y huye si Pac-Man está cerca).
- Salida escalonada de la pen: 0, 90, 180 y 270 frames.
- Color de cada fantasma leído desde sus datos en `render.js`.
- `resetPositions()` reinicia la pen y la secuencia de salida al perder una vida.
- Una línea en `AGENTS.md` documentando los cuatro tipos.

**Out of scope (para specs futuros):**

- Alternancia scatter/chase por tiempo.
- Power pellets, modo asustado y fantasmas comestibles (ojos volviendo a la pen).
- Prohibir la re-entrada a la pen una vez salieron.
- Colisión entre fantasmas.
- Leyenda de nombres/colores en el HUD.
- Cambios de vidas, velocidades o tamaño del laberinto.
- Niveles, frutas y sprites.

## Data model

```js
// maze.js — registro único de fantasmas
const GHOST_STARTS = [
  { x: 13, y: 14, kind: 'chaser',   name: 'Rojo',    color: '#ff0000', releaseFrame: 0 },
  { x: 14, y: 14, kind: 'ambusher', name: 'Rosa',    color: '#ffb8ff', releaseFrame: 90 },
  { x: 13, y: 15, kind: 'wanderer', name: 'Cian',    color: '#00ffff', releaseFrame: 180 },
  { x: 14, y: 15, kind: 'coward',   name: 'Naranja', color: '#ffb852', releaseFrame: 270 },
];
```

```js
// game.js — estado nuevo
game.tick = 0;              // frames desde el último reset; solo corre en 'playing'
// cada fantasma añade:
{
  inPen: true,              // true hasta cruzar la puerta
  // kind, name, color, releaseFrame se copian de GHOST_STARTS
}
```

Convenciones:

- Coordenadas en celdas, origen arriba-izquierda.
- `releaseFrame` en frames a 60 fps: 0 s, 1,5 s, 3 s y 4,5 s.
- Distancia entre celdas = Manhattan.
- Las cuatro celdas de inicio están en las columnas 13 y 14, filas 14 y 15: la salida recta hacia arriba atraviesa la puerta sin maniobras laterales.
- Velocidades intactas: `PACMAN_SPEED = 0.125`, `GHOST_SPEED = 0.1`.

Reglas por tipo, evaluadas solo cuando el fantasma está alineado a una celda:

| kind       | Objetivo                                                              | Elección                                            |
| ---------- | --------------------------------------------------------------------- | --------------------------------------------------- |
| `chaser`   | Celda redondeada de Pac-Man                                            | Primer paso del camino más corto (BFS)              |
| `ambusher` | 4 celdas delante de Pac-Man según `pacman.dir`, recortado al laberinto | Vecino que minimiza Manhattan al objetivo           |
| `wanderer` | Ninguno                                                               | Vecino aleatorio entre los válidos                  |
| `coward`   | Si distancia a Pac-Man ≤ 8: huir; si no: patrulla `{ x: 25, y: 29 }`   | Vecino que maximiza (huir) o minimiza (patrullar)   |

## Implementation plan

1. **Registro de fantasmas.** En `maze.js`, sustituir `GHOST_STARTS` por las cuatro entradas de arriba. En `render.js`, borrar `GHOST_COLORS` y dibujar con `g.color`.
   Prueba manual: aparecen cuatro fantasmas con colores rojo, rosa, cian y naranja; los dos de abajo no se mueven todavía.
2. **Salida escalonada.** En `game.js`, copiar los campos nuevos en `createGame()`, añadir `game.tick` e incrementarlo en `update()`. En `moveGhost()`, si `g.inPen` y `game.tick < g.releaseFrame`, no mover. Si ya toca, forzar `dir = 'up'` y marcar `inPen = false` al llegar a `y <= 11`. Reiniciar `tick` e `inPen` en `resetPositions()`.
   Prueba manual: los cuatro salen de la pen en orden con ~1,5 s de diferencia y luego circulan libres.
3. **Comportamientos por objetivo.** En `game.js`, sustituir el `if (kind === 'hunter')` por `targetFor( game, g )` (Pac-Man, 4 celdas delante, `null` o esquina) y un selector greedy `bestDir( g, options, target, mode )`. `wanderer` conserva el aleatorio.
   Prueba manual: con Pac-Man quieto mirando a la derecha, Rosa se dirige a la celda 4 posiciones a su derecha; Naranja se queda rondando la esquina inferior derecha.
4. **Perseguidor con BFS.** Añadir `bfsNextDir( grid, from, to )` con vecinos en orden fijo (`up`, `left`, `down`, `right`), pasabilidad de fantasma y salto por el túnel en `TUNNEL_ROW`. Usarlo solo en `chaser`; si no hay camino, caer al greedy.
   Prueba manual: Rojo dobla esquinas y llega a Pac-Man por el camino más corto; no se queda oscilando.
5. **Cobarde.** En `game.js`, añadir la regla de huida: a ≤ 8 celdas elige el vecino que más aleja de Pac-Man; si no, patrulla `{ x: 25, y: 29 }`.
   Prueba manual: acercarse a Naranja lo hace huir; al alejarse, vuelve a su esquina.
6. **Documentación.** Añadir en `AGENTS.md` una línea con los cuatro `kind` y su regla.
   Prueba manual: el archivo describe el comportamiento real.

## Acceptance criteria

- [ ] La consola del navegador no muestra errores al cargar ni al jugar.
- [ ] Hay exactamente cuatro fantasmas, con colores rojo, rosa, cian y naranja.
- [ ] Al empezar, solo Rojo sale de la pen de inmediato; Rosa, Cian y Naranja salen con retardo creciente.
- [ ] Rojo persigue a Pac-Man por el camino más corto: rodea paredes y dobla esquinas en su dirección.
- [ ] Rosa apunta a la celda 4 posiciones delante de Pac-Man según su dirección actual.
- [ ] Cian cambia de dirección de forma distinta en cruces equivalentes (comportamiento aleatorio).
- [ ] Naranja se mantiene cerca de `{ x: 25, y: 29 }` cuando Pac-Man está lejos y huye cuando está a 8 celdas o menos.
- [ ] Al perder una vida, los cuatro vuelven a sus celdas de la pen y se repite la salida escalonada.
- [ ] Comer dots, marcador, túnel, overlays de victoria/derrota y reinicio siguen funcionando.
- [ ] Las velocidades siguen siendo 0.125 y 0.1 y los actores siguen girando solo en celdas alineadas.

## Decisions

- **Sí:** clásico simplificado (Rojo/Rosa/Cian/Naranja). Da cuatro personalidades reconocibles con poca lógica nueva.
- **No:** Inky con vector dependiente de Blinky ni scatter/chase alternado. Más código y más difícil de verificar; merece spec propio.
- **Sí:** BFS solo para el perseguidor. El greedy Manhattan actual puede oscilar y no se siente agresivo; BFS sobre 868 celdas es barato y solo se ejecuta en celdas alineadas.
- **No:** BFS para los cuatro. Borraría la diferencia de "inteligencia" entre fantasmas y multiplicaría el coste.
- **Sí:** liberación escalonada con `releaseFrame` por fantasma. Evita que los cuatro salgan apilados.
- **No:** rebote/animación dentro de la pen. Rompería la regla de que solo se decide movimiento en celdas alineadas.
- **Sí:** color y nombre como datos en `GHOST_STARTS`. `maze.js` queda como registro único y `render.js` deja de tener una lista paralela.
- **No:** impedir la re-entrada a la pen. La pen es un callejón sin salida por arriba, así que no acorta caminos; prohibirla exige estado extra en `isWall()`.
- **Sí:** mantener 3 vidas y velocidades. Si con cuatro fantasmas resulta injugable, se ajusta en otro spec.
- **No:** leyenda de fantasmas en el HUD. No aporta al comportamiento y come espacio del canvas.

## Risks

| Riesgo                                                        | Mitigación                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| El perseguidor BFS vuelve el juego demasiado difícil          | Es el único agresivo; si hace falta, se baja su velocidad en otro spec.        |
| BFS con coordenadas fraccionarias o desalineadas              | Se ejecuta solo tras redondear `g.x`/`g.y` en celda alineada.                  |
| Los fantasmas usan el túnel y el BFS no lo contempla          | `bfsNextDir` envuelve los bordes en `TUNNEL_ROW` como `canMove`.               |
| Un cambio de velocidad rompe la alineación y con ella las IA  | Velocidades siguen siendo `1/entero`; el spec no las toca.                     |

## What is **not** in this spec

- Modo asustado, power pellets y fantasmas comestibles.
- Scatter/chase alternado y temporizadores globales.
- Niveles, frutas, puntuaciones altas y sprites.
- HUD con nombres o leyenda de fantasmas.
- Cambios de laberinto, canvas, vidas o velocidades.

Cada uno de esos, si llega, va en su propio spec.
