#!/usr/bin/env node
// portal-credits — the Portal (2007) end credits, recreated in your terminal.
//
// Layout follows the game: GLaDOS' letter/forms type themselves out on the
// left as each line is sung, the credits roll on the right, and the game's
// ASCII art prints in the bottom-left corner (Aperture logo, Black Mesa,
// cake, fire, GLaDOS...), all driven by the real cue timings.
//
// ASCII art and the credit roll belong to Valve; "Still Alive" is by
// Jonathan Coulton, performed by Ellen McLain. No audio is bundled — point
// --audio at your own copy.

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { ARTS, EVENTS, CREDITS } from './portal-data.js';

const HELP = `portal-credits — the Portal end credits, recreated in your terminal.

The letter types itself out on the left as it is sung, the credits roll on the
right, and the game's ASCII art prints bottom-right beneath them. About three
minutes, on the song's timing.

Usage
  portal-credits [options]

Options
  --audio <file>    play and sync to your own copy of "Still Alive"
                    (by default it looks for still-alive.mp3 etc. in the
                    repo folder, ./music, ./audio, or $PORTAL_CREDITS_AUDIO)
  --offset <sec>    delay the song's start, in seconds            (default 0)
  --speed <x>       run everything faster or slower, e.g. 2 or 0.5
  --frame <sec>     print one frame at <sec> and exit (no TTY needed)
  --width <cols>    frame width for --frame                       (default 100)
  --height <rows>   frame height for --frame                      (default 40)
  --no-color        plain text, no ANSI
  -h, --help        this text

Keys
  space             pause / resume
  left / right      seek back / forward 5 seconds
  q                 quit

Audio players are tried in order: ffplay, mpv, vlc, sox "play", and on macOS
afplay. In WSL or Windows it falls back to the built-in Windows media player,
so no extra packages are needed there. Without a working player it plays
silently, on the song's timing.
`;

// ---------------------------------------------------------------------------
// arguments
// ---------------------------------------------------------------------------

function die(msg) {
  process.stderr.write(`portal-credits: ${msg}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const o = {
    audio: null,
    offset: 0,
    speed: 1,
    frame: null,
    width: 100,
    height: 40,
    color: 'auto',
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined) die(`${a} needs a value`);
      return v;
    };
    switch (a) {
      case '-h':
      case '--help':
        o.help = true;
        break;
      case '--audio':
        o.audio = val();
        break;
      case '--offset':
        o.offset = Number(val());
        break;
      case '--speed':
        o.speed = Number(val());
        break;
      case '--frame':
        o.frame = Number(val());
        break;
      case '--width':
        o.width = parseInt(val(), 10);
        break;
      case '--height':
        o.height = parseInt(val(), 10);
        break;
      case '--no-color':
        o.color = 'none';
        break;
      case '--color':
        o.color = val();
        break;
      default:
        die(`unknown option ${a} (try --help)`);
    }
  }
  if (!(o.speed > 0)) die('--speed must be greater than 0');
  if (!Number.isFinite(o.offset) || o.offset < 0) die('--offset must be a positive number');
  if (o.frame !== null && !Number.isFinite(o.frame)) die('--frame must be a number');
  return o;
}

// ---------------------------------------------------------------------------
// finding the song
// ---------------------------------------------------------------------------

// No audio ships with this project — "Still Alive" is Valve's and Jonathan
// Coulton's. Drop your own copy in and it will be picked up.
const AUDIO_RE = /^(portal[-_ ]?)?still[-_ ]?alive[^/\\]*\.(mp3|m4a|flac|ogg|oga|opus|wav|aac)$/i;

function discoverAudio() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dirs = [
    process.cwd(),
    path.join(here, '..'),
    path.join(process.cwd(), 'music'),
    path.join(process.cwd(), 'audio'),
    path.join(here, '..', 'music'),
    path.join(here, '..', 'audio'),
  ];
  for (const dir of dirs) {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    const hit = entries
      .filter((f) => AUDIO_RE.test(f))
      .sort((a, b) => a.length - b.length)[0];
    if (hit) return path.join(dir, hit);
  }
  return null;
}

// ---------------------------------------------------------------------------
// palette
// ---------------------------------------------------------------------------

const RESET = '\x1b[0m';
// a Windows console moves the cursor down but not to column 1 on a bare \n
const EOL = process.platform === 'win32' ? '\r\n' : '\n';

const PALETTES = {
  truecolor: {
    main: '\x1b[38;2;216;150;74m',
    dim: '\x1b[38;2;118;78;38m',
    hot: '\x1b[38;2;255;201;116m',
  },
  ansi256: {
    main: '\x1b[38;5;179m',
    dim: '\x1b[38;5;94m',
    hot: '\x1b[38;5;222m',
  },
  none: { main: '', dim: '', hot: '' },
};

function pickPalette(mode, isTTY) {
  if (mode === 'none') return PALETTES.none;
  if (mode === '256') return PALETTES.ansi256;
  if (mode === 'truecolor') return PALETTES.truecolor;
  if (process.env.NO_COLOR) return PALETTES.none;
  const ct = (process.env.COLORTERM || '').toLowerCase();
  if (ct.includes('truecolor') || ct.includes('24bit')) return PALETTES.truecolor;
  if (String(process.env.TERM || '').includes('256')) return PALETTES.ansi256;
  if (process.platform === 'win32' || isWSL()) return PALETTES.ansi256;
  if (process.env.TERM === 'dumb' || !isTTY) return PALETTES.none;
  return PALETTES.ansi256;
}

let _wsl = null;
function isWSL() {
  if (_wsl !== null) return _wsl;
  try {
    _wsl = /microsoft/i.test(readFileSync('/proc/version', 'utf8'));
  } catch {
    _wsl = false;
  }
  return _wsl;
}

// ---------------------------------------------------------------------------
// the cue sheet, in seconds
// ---------------------------------------------------------------------------

const LETTER = []; // { t, text, nl } — nl: true ends the line, false continues it
const ART = []; // { t, idx }
let creditsStart = 9.3;
let endT = 185;

for (const [payload, cs, , mode] of EVENTS) {
  const t = cs / 100;
  if (mode === 0 || mode === 1) {
    LETTER.push({ t, text: String(payload), nl: mode === 0 });
  } else if (mode === 2) {
    ART.push({ t, idx: Number(payload) });
  } else if (mode === 3) {
    LETTER.push({ t, text: null, nl: true, clear: true });
  } else if (mode === 5) {
    creditsStart = t;
  } else if (mode === 9) {
    endT = t;
  }
}
ART.sort((a, b) => a.t - b.t);

const CREDIT_LINES = CREDITS.replace(/^\n+/, '')
  .split('\n')
  .map((s) => s.replace(/\s+$/, ''));

const CREDIT_TIMES = CREDIT_LINES.map(
  (_, i) => creditsStart + ((i + 1) * (endT - creditsStart - 3)) / CREDIT_LINES.length,
);

const TOTAL = endT;

// ---------------------------------------------------------------------------
// state at time t (deterministic, so seeking works)
// ---------------------------------------------------------------------------

function letterState(t) {
  let page = [];
  let cur = '';
  for (const ev of LETTER) {
    if (ev.t > t) break;
    if (ev.clear) {
      page = [];
      cur = '';
      continue;
    }
    if (ev.nl) {
      page.push(cur + ev.text);
      cur = '';
    } else {
      cur += ev.text;
    }
  }
  if (cur) page.push(cur);
  return page;
}

function artState(t) {
  let cur = null;
  for (const a of ART) {
    if (a.t > t) break;
    cur = a;
  }
  return cur ? { idx: cur.idx, since: cur.t } : null;
}

function creditsState(t) {
  let n = 0;
  for (let i = 0; i < CREDIT_TIMES.length; i++) {
    if (CREDIT_TIMES[i] <= t) n = i + 1;
  }
  return n;
}

// ---------------------------------------------------------------------------
// screen buffer
// ---------------------------------------------------------------------------

function makeScreen(W, H) {
  return { W, H, cells: Array.from({ length: H }, () => new Array(W).fill(null)) };
}

function put(scr, x, y, text, style) {
  if (y < 0 || y >= scr.H) return;
  const row = scr.cells[y];
  for (let i = 0; i < text.length; i++) {
    const gx = x + i;
    if (gx < 0 || gx >= scr.W) continue;
    const c = text[i];
    if (c === ' ' && !style) continue;
    row[gx] = { c, s: style || null };
  }
}

function clip(text, width) {
  return text.length <= width ? text : text.slice(0, Math.max(0, width));
}

function drawBox(scr, x, y, w, h) {
  if (w < 4 || h < 3) return;
  put(scr, x, y, '|' + '-'.repeat(w - 2) + '|', 'dim');
  put(scr, x, y + h - 1, '|' + '-'.repeat(w - 2) + '|', 'dim');
  for (let i = 1; i < h - 1; i++) {
    put(scr, x, y + i, '|', 'dim');
    put(scr, x + w - 1, y + i, '|', 'dim');
  }
}

// ---------------------------------------------------------------------------
// layout
// ---------------------------------------------------------------------------

function layout(W, H) {
  const top = 1;
  const gap = 2;
  const leftW = Math.max(30, Math.min(46, Math.round(W * 0.47)));
  const rightX = 1 + leftW + gap;
  const rightW = W - 2 - rightX;

  const inLeft = Math.max(10, leftW - 4); // text width inside the left box
  const inRight = Math.max(4, rightW - 4);

  // The art sits at the bottom of the right-hand column, under the credits,
  // exactly where the game prints it. It is 40 columns wide and must not
  // run into the letter's box, so crop it (or drop it) on narrow screens.
  const artWanted = Math.min(40, W - 2 - (leftW + 2));
  const artH = Math.min(20, Math.max(8, H - 16));
  const showArt = artWanted >= 34 && H >= 24 && rightW >= 20;
  const artW = showArt ? artWanted : 0;
  const artX = Math.max(leftW + 3, rightX + Math.floor((rightW - artW) / 2));
  const artTop = H - artH - 1;
  const rightBottom = showArt ? artTop - 2 : H - 2;

  return {
    top,
    leftX: 1,
    leftW,
    leftBottom: H - 2,
    rightX,
    rightW,
    rightBottom,
    inLeft,
    inRight,
    artW,
    artH,
    showArt,
    artTop,
    creditH: Math.max(3, rightBottom - top - 1),
    artX,
    letterTop: top + 1,
    letterH: Math.max(3, H - 2 - 2),
    cols: rightW >= 18,
  };
}

// ---------------------------------------------------------------------------
// frame
// ---------------------------------------------------------------------------

function buildFrame(W, H, t) {
  const scr = makeScreen(W, H);
  const L = layout(W, H);

  drawBox(scr, L.leftX, L.top, L.leftW, L.leftBottom);
  if (L.cols) drawBox(scr, L.rightX, L.top, L.rightW, L.rightBottom);

  // ---- the letter -------------------------------------------------------
  const page = letterState(t);
  const shown = page.slice(-L.letterH);
  for (let i = 0; i < shown.length; i++) {
    const isLast = i === shown.length - 1;
    const text = clip(shown[i], L.inLeft);
    put(scr, L.leftX + 2, L.letterTop + i, text, isLast ? 'hot' : 'main');
    if (isLast && text.length < L.inLeft) {
      put(scr, L.leftX + 2 + text.length, L.letterTop + i, '_', 'hot');
    }
  }

  // ---- the art, printing row by row, bottom-right ----------------------
  const art = artState(t);
  if (art && L.showArt && L.artH > 0) {
    const panel = ARTS[art.idx] || [];
    const revealed = Math.min(panel.length, Math.max(0, Math.floor((t - art.since) / 0.035) + 1));
    const rowCrop = Math.floor((panel.length - L.artH) / 2);
    for (let r = 0; r < L.artH; r++) {
      const srcRow = rowCrop + r;
      if (srcRow >= revealed || srcRow >= panel.length) break;
      const line = panel[srcRow] || '';
      const colCrop = Math.max(0, Math.floor((line.length - L.artW) / 2));
      put(scr, L.artX, L.artTop + r, clip(line.slice(colCrop), L.artW), 'main');
    }
  }

  // ---- the credits, rolling above the art -------------------------------
  if (L.cols) {
    const n = creditsState(t);
    const rows = L.creditH;
    const shownCredits = CREDIT_LINES.slice(Math.max(0, n - rows), n);
    const startY = L.top + 1 + Math.max(0, rows - shownCredits.length);
    for (let i = 0; i < shownCredits.length; i++) {
      const line = clip(shownCredits[i], L.inRight);
      put(scr, L.rightX + 2, startY + i, line, 'main');
    }
  }

  return scr;
}

function renderScreen(scr, palette) {
  const out = [];
  for (let y = 0; y < scr.H; y++) {
    const row = scr.cells[y];
    let line = '';
    let runStyle = null;
    let run = '';
    const flush = () => {
      if (!run) return;
      const code = runStyle ? palette[runStyle] : '';
      line += code ? code + run + RESET : run;
      run = '';
    };
    for (let x = 0; x < row.length; x++) {
      const cell = row[x];
      const ch = cell ? cell.c : ' ';
      const st = cell ? cell.s : null;
      if (st !== runStyle) {
        flush();
        runStyle = st;
      }
      run += ch;
    }
    flush();
    out.push(line);
  }
  return out;
}

function frameAt(W, H, t, palette) {
  return renderScreen(buildFrame(W, H, Math.max(0, t)), palette).join(EOL);
}

// ---------------------------------------------------------------------------
// audio
// ---------------------------------------------------------------------------

let AUDIO_WARNING = null;
let AUDIO_FOUND = null;

function windowsPlayer(file) {
  let winPath = file;
  if (isWSL()) {
    try {
      winPath = execFileSync('wslpath', ['-w', file], { encoding: 'utf8' }).trim();
    } catch {
      return null;
    }
  } else {
    winPath = file.replace(/\\/g, '\\\\');
  }
  const script =
    "Add-Type -AssemblyName PresentationCore; " +
    `$p = New-Object System.Windows.Media.MediaPlayer; $p.Open([uri]'${winPath.replace(/'/g, "''")}'); ` +
    `$p.Play(); Start-Sleep -Seconds ${Math.ceil(TOTAL) + 10}`;
  const child = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script],
    { stdio: 'ignore' },
  );
  child.on('error', () => {});
  return child.pid ? child : null;
}

function startAudio(file) {
  if (!existsSync(file)) die(`audio file not found: ${file}`);
  const candidates = [];
  const wsl = isWSL();
  if (process.platform === 'darwin') candidates.push(['afplay', [file]]);
  if (wsl || process.platform === 'win32') candidates.push(() => windowsPlayer(file));
  candidates.push(['ffplay', ['-nodisp', '-autoexit', '-loglevel', 'quiet', file]]);
  candidates.push(['mpv', ['--no-video', '--really-quiet', file]]);
  candidates.push(['cvlc', ['--play-and-exit', '--quiet', file]]);
  candidates.push(['play', ['-q', file]]);
  candidates.push(['paplay', [file]]);
  candidates.push(['aplay', ['-q', file]]);

  for (const c of candidates) {
    if (typeof c === 'function') {
      const child = c();
      if (child) return child;
      continue;
    }
    const [cmd, args] = c;
    const child = spawn(cmd, args, { stdio: 'ignore' });
    child.on('error', () => {});
    if (child.pid) return child;
  }
  AUDIO_WARNING = 'portal-credits: no audio player found; playing silently';
  return null;
}

// ---------------------------------------------------------------------------
// live playback
// ---------------------------------------------------------------------------

function play(o) {
  const out = process.stdout;
  const palette = pickPalette(o.color, true);
  let state = {
    W: out.columns || 90,
    H: out.rows || 30,
  };

  out.write('\x1b[?1049h\x1b[?25l\x1b[?7l\x1b[2J');

  let audio = null;
  let finished = false;
  const cleanup = () => {
    if (finished) return;
    finished = true;
    if (audio) {
      try {
        audio.kill();
      } catch {
        /* already gone */
      }
    }
    out.write('\x1b[?7h\x1b[?25h\x1b[?1049l');
    if (AUDIO_WARNING) process.stderr.write(AUDIO_WARNING + '\n');
    else if (!AUDIO_FOUND) {
      process.stderr.write(
        'portal-credits: no track found — add still-alive.mp3 (or use --audio); credits play silently.\n',
      );
    }
  };
  process.on('exit', cleanup);

  if (o.audio) {
    AUDIO_FOUND = o.audio;
    if (o.offset > 0) {
      setTimeout(() => {
        if (!finished) audio = startAudio(o.audio);
      }, o.offset * 1000).unref();
    } else {
      audio = startAudio(o.audio);
    }
  }

  let t = 0;
  let paused = false;
  let last = Date.now();

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
  const onKey = (_str, key) => {
    if (!key) return;
    if (key.ctrl && key.name === 'c') process.exit(0);
    if (key.name === 'q' || key.name === 'escape') process.exit(0);
    if (key.name === 'space') paused = !paused;
    if (key.name === 'right') t = Math.min(TOTAL, t + 5);
    if (key.name === 'left') t = Math.max(0, t - 5);
  };
  process.stdin.on('keypress', onKey);

  let render = () => frameAt(state.W, state.H, t, palette);
  out.write('\x1b[H' + render());

  process.on('SIGWINCH', () => {
    state.W = out.columns || state.W;
    state.H = out.rows || state.H;
    out.write('\x1b[2J');
  });

  const timer = setInterval(() => {
    const now = Date.now();
    const dt = (now - last) / 1000;
    last = now;
    if (!paused) t += dt * o.speed;
    if (t >= TOTAL + 2) {
      clearInterval(timer);
      process.stdin.removeListener('keypress', onKey);
      cleanup();
      process.exit(0);
    }
    out.write('\x1b[H' + render());
  }, 33);
}

// ---------------------------------------------------------------------------
// single frame (also handy over ssh / in a log)
// ---------------------------------------------------------------------------

function dumpFrame(o) {
  const W = Math.max(24, o.width);
  const H = Math.max(10, o.height);
  const palette = pickPalette(o.color, false);
  process.stdout.write(frameAt(W, H, Math.max(0, o.frame), palette).replace(/ +$/gm, '') + '\n');
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const opts = parseArgs(process.argv.slice(2));
if (opts.audio && !existsSync(opts.audio)) die(`audio file not found: ${opts.audio}`);
if (!opts.audio) {
  const found = process.env.PORTAL_CREDITS_AUDIO || discoverAudio();
  if (found && existsSync(found)) {
    opts.audio = found;
    AUDIO_FOUND = found;
  }
}
if (opts.help) {
  process.stdout.write(HELP);
  process.exit(0);
} else if (opts.frame !== null) {
  dumpFrame(opts);
} else if (!process.stdout.isTTY) {
  die('this needs an interactive terminal; use --frame <seconds> to dump one frame');
} else {
  play(opts);
}
