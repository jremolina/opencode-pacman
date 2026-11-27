// game.js
// Estado y reglas. Depende de globals de maze.js: MAZE, TUNNEL_ROW,
// PACMAN_START, GHOST_STARTS.

const DIRS = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};
const OPPOSITE = { left: 'right', right: 'left', up: 'down', down: 'up' };

const PACMAN_SPEED = 0.125; // 1/8 celda/frame -> alinea cada 8 frames
const GHOST_SPEED = 0.1;    // 1/10 celda/frame

// Crea una partida nueva. Copia MAZE (pristino) a game.grid para poder comer
// dots sin destruir el original, y reiniciar.
function createGame() {
  const grid = MAZE.map( ( row ) => row.slice() );
  // La celda de inicio de Pacman arranca sin dot.
  grid[ PACMAN_START.y ][ PACMAN_START.x ] = 0;

  let dots = 0;
  for ( const row of grid ) for ( const v of row ) if ( v === 2 ) dots++;

  return {
    state: 'start',
    score: 0,
    lives: 3,
    tick: 0,
    dotsRemaining: dots,
    grid,
    pacman: {
      x: PACMAN_START.x,
      y: PACMAN_START.y,
      dir: 'left',
      nextDir: null,
      speed: PACMAN_SPEED,
    },
    ghosts: GHOST_STARTS.map( ( g ) => ( {
      x: g.x,
      y: g.y,
      dir: 'up',
      speed: GHOST_SPEED,
      kind: g.kind,
      name: g.name,
      color: g.color,
      releaseFrame: g.releaseFrame,
      inPen: true, // true hasta cruzar la puerta (fila 11)
    } ) ),
  };
}

function aligned( v ) {
  return Math.abs( v - Math.round( v ) ) < 1e-3;
}

// Una celda es muro para el actor dado?
//   pacman: bloqueado por pared (1) y puerta (3)
//   ghost:  bloqueado solo por pared (1)
function isWall( grid, x, y, actor ) {
  if ( y < 0 || y >= grid.length ) return true;
  if ( x < 0 || x >= grid[ 0 ].length ) return true;
  const v = grid[ y ][ x ];
  if ( v === 1 ) return true;
  if ( v === 3 && actor === 'pacman' ) return true;
  return false;
}

// Puede el actor avanzar desde (x,y) en la direccion dir?
function canMove( grid, x, y, dir, actor ) {
  const d = DIRS[ dir ];
  if ( !d ) return false;
  const tx = x + d.x;
  const ty = y + d.y;
  // Tunel: salir por un borde en la fila del tunel siempre es valido.
  if ( ty === TUNNEL_ROW && ( tx < 0 || tx >= grid[ 0 ].length ) ) return true;
  return !isWall( grid, tx, ty, actor );
}

function wrapTunnel( a, width ) {
  if ( Math.round( a.y ) === TUNNEL_ROW ) {
    if ( a.x < 0 ) a.x += width;
    else if ( a.x >= width ) a.x -= width;
  }
}

function movePacman( game ) {
  const p = game.pacman;
  const grid = game.grid;
  const width = grid[ 0 ].length;

  if ( aligned( p.x ) && aligned( p.y ) ) {
    p.x = Math.round( p.x );
    p.y = Math.round( p.y );

    // Aplicar giro pendiente si es posible.
    if ( p.nextDir && canMove( grid, p.x, p.y, p.nextDir, 'pacman' ) ) {
      p.dir = p.nextDir;
      p.nextDir = null;
    }
    // Comer dot.
    if ( grid[ p.y ][ p.x ] === 2 ) {
      grid[ p.y ][ p.x ] = 0;
      game.score += 10;
      game.dotsRemaining--;
    }
    // Si no puede seguir, se detiene en la celda.
    if ( !canMove( grid, p.x, p.y, p.dir, 'pacman' ) ) return;
  }

  const d = DIRS[ p.dir ];
  p.x += d.x * p.speed;
  p.y += d.y * p.speed;
  wrapTunnel( p, width );
}

// Objetivo de persecucion segun la personalidad del fantasma.
//   chaser   -> celda redondeada de Pac-Man
//   ambusher -> 4 celdas delante de Pac-Man segun su direccion
//   coward   -> esquina inferior derecha a patrullar
//   wanderer -> sin objetivo (null)
function targetFor( game, g ) {
  const grid = game.grid;
  const p = game.pacman;
  const W = grid[ 0 ].length;
  const H = grid.length;

  if ( g.kind === 'chaser' ) {
    return { x: Math.round( p.x ), y: Math.round( p.y ) };
  }
  if ( g.kind === 'ambusher' ) {
    const d = DIRS[ p.dir ];
    const x = Math.max( 0, Math.min( W - 1, Math.round( p.x ) + d.x * 4 ) );
    const y = Math.max( 0, Math.min( H - 1, Math.round( p.y ) + d.y * 4 ) );
    return { x, y };
  }
  if ( g.kind === 'coward' ) return { x: 25, y: 29 }; // esquina a patrullar
  return null;
}

// Elige entre las direcciones válidas la que mas se acerca ('min') o
// mas aleja ('max') del objetivo, midiendo distancia Manhattan.
function bestDir( g, options, target, mode ) {
  let best = options[ 0 ];
  let bestScore = mode === 'max' ? -Infinity : Infinity;
  for ( const dir of options ) {
    const d = DIRS[ dir ];
    const score = Math.abs( g.x + d.x - target.x ) + Math.abs( g.y + d.y - target.y );
    const better = mode === 'max' ? score > bestScore : score < bestScore;
    if ( better ) {
      bestScore = score;
      best = dir;
    }
  }
  return best;
}

// Primer paso del camino mas corto (BFS) de 'from' a 'to', en celdas enteras.
// Vecinos en orden fijo (up, left, down, right) para un desempate determinista;
// pasabilidad de fantasma y salto por el tunel en TUNNEL_ROW, igual que canMove.
// Devuelve la direccion o null si no hay camino (el caller cae al greedy).
function bfsNextDir( grid, from, to ) {
  const W = grid[ 0 ].length;
  const H = grid.length;
  const DIR_ORDER = [ 'up', 'left', 'down', 'right' ];

  const startKey = from.y * W + from.x;
  const targetKey = to.y * W + to.x;
  const seen = new Set( [ startKey ] );
  const queue = [ { x: from.x, y: from.y, first: null } ];
  let head = 0;

  while ( head < queue.length ) {
    const cur = queue[ head++ ];
    if ( cur.y * W + cur.x === targetKey ) return cur.first;

    for ( const dir of DIR_ORDER ) {
      const d = DIRS[ dir ];
      let nx = cur.x + d.x;
      let ny = cur.y + d.y;
      // Tunel: salir por un borde en la fila del tunel envuelve al otro lado.
      if ( ny === TUNNEL_ROW && ( nx < 0 || nx >= W ) ) nx = ( nx + W ) % W;
      if ( nx < 0 || nx >= W || ny < 0 || ny >= H ) continue;
      if ( isWall( grid, nx, ny, 'ghost' ) ) continue;
      const k = ny * W + nx;
      if ( seen.has( k ) ) continue;
      seen.add( k );
      queue.push( { x: nx, y: ny, first: cur.first === null ? dir : cur.first } );
    }
  }
  return null; // sin camino
}

function decideGhost( game, g ) {
  const grid = game.grid;

  const options = Object.keys( DIRS ).filter(
    ( dir ) => dir !== OPPOSITE[ g.dir ] && canMove( grid, g.x, g.y, dir, 'ghost' )
  );
  // Sin salida (callejon): permitir el giro de 180.
  const choices = options.length ? options : [ '' + OPPOSITE[ g.dir ] ];

  if ( g.kind === 'wanderer' ) {
    g.dir = choices[ Math.floor( Math.random() * choices.length ) ];
    return;
  }

  const target = targetFor( game, g );

  // El perseguidor va por el camino mas corto; sin camino, greedy.
  if ( g.kind === 'chaser' ) {
    const step = bfsNextDir( grid, g, target );
    if ( step ) {
      g.dir = step;
      return;
    }
  }

  g.dir = bestDir( g, choices, target, 'min' );
}

function moveGhost( game, g ) {
  const grid = game.grid;
  const width = grid[ 0 ].length;

  // Salida escalonada: dentro de la pen, recto hacia arriba hasta la fila 11.
  if ( g.inPen ) {
    if ( game.tick < g.releaseFrame ) return; // aun no le toca salir
    if ( aligned( g.x ) && aligned( g.y ) ) {
      g.x = Math.round( g.x );
      g.y = Math.round( g.y );
      g.dir = 'up';
      if ( g.y <= 11 ) g.inPen = false; // cruzo la puerta
    }
    if ( g.inPen ) {
      g.y -= g.speed;
      return;
    }
  }

  if ( aligned( g.x ) && aligned( g.y ) ) {
    g.x = Math.round( g.x );
    g.y = Math.round( g.y );
    decideGhost( game, g );
    if ( !canMove( grid, g.x, g.y, g.dir, 'ghost' ) ) return;
  }

  const d = DIRS[ g.dir ];
  g.x += d.x * g.speed;
  g.y += d.y * g.speed;
  wrapTunnel( g, width );
}

function resetPositions( game ) {
  const p = game.pacman;
  p.x = PACMAN_START.x;
  p.y = PACMAN_START.y;
  p.dir = 'left';
  p.nextDir = null;
  game.ghosts.forEach( ( g, i ) => {
    g.x = GHOST_STARTS[ i ].x;
    g.y = GHOST_STARTS[ i ].y;
    g.dir = 'up';
    g.inPen = true;
  } );
  game.tick = 0;
}

function collides( a, b ) {
  return Math.abs( a.x - b.x ) < 0.5 && Math.abs( a.y - b.y ) < 0.5;
}

function update( game ) {
  game.tick++; // solo avanza en 'playing': update no se llama en otros estados
  movePacman( game );
  game.ghosts.forEach( ( g ) => moveGhost( game, g ) );

  for ( const g of game.ghosts ) {
    if ( collides( game.pacman, g ) ) {
      game.lives--;
      if ( game.lives <= 0 ) {
        game.state = 'lost';
        return;
      }
      resetPositions( game );
      break;
    }
  }

  if ( game.dotsRemaining <= 0 ) game.state = 'won';
}

window.createGame = createGame;
window.update = update;
window.DIRS = DIRS;
