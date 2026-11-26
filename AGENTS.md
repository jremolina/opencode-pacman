# AGENTS.md

Pac-Man clone in vanilla JS/HTML/CSS. No build step, no dependencies, no tests.

## Run / verify

- Open `src/index.html` directly in a browser (works over `file://`; no server needed).
- There is no lint, typecheck, or test command. Verify changes manually in the browser: move with arrow keys, eat dots, collide with ghosts, win/lose overlays.
- After changing maze dimensions, update all three: `MAZE_STR`, `<canvas width/height>` in `src/index.html`, and `#game-wrap` size in `src/css/style.css` (tile size is 20px, so 28x31 cells = 560x620).

## Architecture

Scripts are plain globals loaded by ordered `<script>` tags in `src/index.html` — no ES modules, no bundler:

1. `maze.js` → `MAZE`, `TUNNEL_ROW`, `PACMAN_START`, `GHOST_STARTS`
2. `game.js` → `createGame`, `update`, `DIRS` (uses maze globals)
3. `render.js` → `draw` (uses `DIRS` and `game.grid`)
4. `main.js` → game loop, keyboard, overlay

New files must be added to `index.html` in dependency order and expose what they need via `window.*`. `main.js` must stay last.

Key invariants:
- `MAZE` is pristine and never mutated. `createGame()` deep-copies rows into `game.grid`; render and collision logic must read `game.grid` so eaten dots disappear and restart works.
- Maze chars: `#`=wall(1), `.`=dot(2), space=empty(0), `-`=pen door(3). Pac-Man is blocked by 1 and 3; ghosts only by 1.
- `render.js` and `game.js` both depend on `TILE`/maze geometry implicitly; don't change one without checking the other.

## Non-obvious gotchas

- Movement speeds are in **cells per frame** (`0.125` Pac-Man, `0.1` ghosts), not pixels. Turning and ghost decisions only happen when the actor is exactly aligned to a cell center. Speeds must remain `1/integer` (and the game loop must not use variable delta time) or actors will drift and miss turns; update `aligned()` tolerances only with care.
- Game states: `start`, `playing`, `won`, `lost`. `update()` only runs while `playing`; `main.js` swaps overlay HTML via `innerHTML` and re-binds the button each time.
- Tunnel wrapping only applies on `TUNNEL_ROW` (14); edge exits are valid only on that row.
- `main.js` reads `game.pacman.nextDir` for queued turns — direction changes are applied at the next aligned cell, not immediately.

## Conventions

- Comments, UI text, and specs are in **Spanish** (README, maze labels, overlay).
- Style is intentionally spaced: `if ( x )`, `fn( a, b )`, single quotes, 2-space indent, semicolons. Match it; don't reformat to Prettier defaults.
- Keep the arcade rendering procedural on `<canvas>` (no sprites/assets).

## Spec-driven workflow

This repo exists to practice spec-driven development. Installed skills live in `.agents/skills/` (pinned in `skills-lock.json` from `Klerith/fernando-skills`; don't hand-edit them):

- `/spec` — designs a spec into `specs/NN-slug.md`; never writes code.
- `/spec-impl NN-slug` — implements only specs whose status means "Approved"; creates branch `spec-NN-slug` and pauses per step.

`specs/` does not exist yet; the first spec is `01-`. Specs use the header/state machine in `.agents/skills/spec/template.md` (`Draft` → `Approved` → `Implemented`), and the first run seeds `specs/.spec-config.yml` (`AutoCreateBranch: true`, `AutoCommitSteps: false`). Follow the spec instead of improvising; out-of-scope work belongs in a new spec.
