// Génère la grille d'un niveau du Dédale des Lames, puis écrit :
//   - dedale.json         : les grilles des trois niveaux (flèches « imprimées »), publiques ;
//   - prive/solution.json : le chemin de chaque niveau, à copier dans le secret SOLUTION_JSON (jamais publié).
// Seul le niveau demandé est remplacé ; les anciens fichiers sont copiés dans prive/archives/ avant d'être remplacés.
//
// Les niveaux sont décrits dans dedale.json :
//   - facile    : pas de brouillard, pas de rotation ;
//   - moyen     : brouillard, pas de rotation ;
//   - difficile : brouillard et rotation.
// Le brouillard ne change que l'affichage ; la rotation change les règles :
//   - après un saut de k cases, toutes les flèches tournent de k × 45° dans le sens horaire ;
//   - la sortie [0,0] ne s'ouvre que si l'on y arrive avec les flèches à +0° (rotation totale multiple de 360°).
// Avec rotation, un état du jeu est (case, orientation) : 121 × 8 = 968 états au lieu de 121 cases.
//
// Le générateur garantit, pour chaque niveau :
//   - un seul départ mène à la sortie, par un seul chemin (un saut par vendredi), sans raccourci ni détour ;
//   - un départ différent de celui des autres niveaux ;
//   - toutes les cases sont atteignables depuis la ligne du bas ;
//   - le chemin passe par chaque ligne et chaque colonne (plus de ligne ou de colonne « morte » évidente) ;
//   - avec rotation, le chemin repasse au moins une fois par une de ses cases avec une autre orientation ;
//   - des pièges dosés selon le niveau (voir PROFILS) ;
//   - si prive/sequence-<niveau>.json existe, les sauts du chemin suivent exactement ces directions.
//
// Usage : node generer.mjs <niveau>            (hasard cryptographique : à utiliser pour la vraie grille)
//         SEED=1234 node generer.mjs <niveau>  (graine fixée, pour les essais seulement : jamais pour la vraie grille)
//         node generer.mjs <niveau> --essai    (n'écrit rien, affiche seulement les statistiques)
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { randomInt } from "node:crypto";

const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const DV = { N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1], S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1] };
const rot = (d, r) => DIRS[(DIRS.indexOf(d) + r + 8) % 8];

// Réglages de difficulté. Un « piège » est une case hors du chemin sur laquelle on peut sauter depuis le chemin.
//   piege   : [min, max] de sa profondeur, c'est-à-dire du nombre de sauts qu'on peut encore enchaîner avant d'avoir
//             fait le tour de ce qui est accessible (impasse ou boucle) : plus c'est long, plus on met de temps à
//             comprendre qu'on s'est trompé ;
//   leurres : nombre visé de pièges dont la flèche ressemble à la bonne (même direction que la flèche publiée suivante) ;
//   proche  : pénalité des impasses trouvables en 2 sauts ou moins depuis le bas ;
//   mort    : pénalité de chaque impasse (flèche qui sort du plateau) ou, si impasses est donné, de chaque impasse
//             d'écart avec ce nombre visé. Une impasse se voit tout de suite (« aucune case dans cette direction ») ;
//             sans elle, un piège est une boucle, plus longue à comprendre ;
//   depart  : exigences pour chacun des 10 faux départs (ligne du bas), pour qu'aucun ne s'élimine d'un coup d'œil :
//             sauts   = nombre minimal de cases où l'on peut sauter depuis ce départ (0 = flèche qui sort du plateau) ;
//             zone    = nombre minimal de cases qu'il faut explorer avant d'avoir fait le tour de ce départ ;
//             impasse = nombre minimal de sauts avant de pouvoir tomber sur une impasse ;
//             bloques = nombre maximal de faux départs sans aucune flèche possible (contrainte géométrique) ;
//             le vrai départ ne pointe jamais vers N, et la ligne du bas évite les flèches horizontales et répétées ;
//   zone    : nombre minimal de cases accessibles depuis toute case hors du chemin. Une case d'où l'on ne peut aller
//             que dans 2 ou 3 cases (une colonne de flèches qui descendent vers le bord, par exemple) forme une
//             « zone morte » qu'on repère et qu'on raye vite de la carte.
const PROFILS = {
  facile: { piege: [3, 6], leurres: 10, impasses: 4, proche: 40, mort: 8, depart: { sauts: 2, zone: 12, impasse: 3, bloques: 2 }, zone: 8 },
  moyen: { piege: [5, 10], leurres: 18, impasses: 2, proche: 40, mort: 8, depart: { sauts: 3, zone: 25, impasse: 5, bloques: 2 }, zone: 15 },
  difficile: { piege: null, leurres: null, impasses: null, proche: 40, mort: 8 },
};

const args = process.argv.slice(2);
const essai = args.includes("--essai");
const cfg = JSON.parse(readFileSync("dedale.json", "utf8"));
const level = cfg.levels.find((l) => args.includes(l.id));
if (!level) { console.error(`Usage : node generer.mjs <${cfg.levels.map((l) => l.id).join("|")}> [--essai]`); process.exit(1); }
const P = PROFILS[level.id];
const n = cfg.n, L = cfg.fridays.length; // L cases sur le chemin, donc L sauts (le dernier vers la sortie)
const ROTATE = level.rotation;
const RS = ROTATE ? 8 : 1; // orientations possibles
const turn = (r, k) => (ROTATE ? (r + k) % 8 : r);
console.log(`Niveau ${level.nom} : ${level.brouillard ? "brouillard" : "sans brouillard"}, ${ROTATE ? "rotation" : "sans rotation"}.`);

// Chemins des autres niveaux : on évite leur case de départ.
const SOL = "prive/solution.json";
let solutions = {};
if (existsSync(SOL)) {
  const s = JSON.parse(readFileSync(SOL, "utf8").replace(/^﻿/, ""));
  solutions = Array.isArray(s) ? { difficile: s } : s; // ancien format : le seul chemin était celui du difficile
}
const otherStarts = new Set(Object.entries(solutions).filter(([k]) => k !== level.id).map(([, p]) => p[0][0]));

// Séquence imposée (facultative) : prive/sequence-<niveau>.json donne la direction réelle de chaque saut, dans l'ordre
// des vendredis, avec les mêmes noms que la grille (N, NE, E, SE, S, SW, W, NW). Le dernier saut atterrit sur la sortie.
// Ce fichier reste dans prive/ (jamais publié) : il donnerait toutes les flèches à l'avance.
const SEQ_FILE = `prive/sequence-${level.id}.json`;
let SEQ = null;
if (existsSync(SEQ_FILE)) {
  SEQ = JSON.parse(readFileSync(SEQ_FILE, "utf8").replace(/^﻿/, ""));
  const bad = SEQ.filter((d) => !DIRS.includes(d));
  if (bad.length) { console.error(`${SEQ_FILE} : direction(s) inconnue(s) ${bad.join(", ")}.`); process.exit(1); }
  if (SEQ.length !== L) { console.error(`${SEQ_FILE} : ${SEQ.length} flèches pour ${L} vendredis.`); process.exit(1); }
  console.log(`Séquence imposée lue dans ${SEQ_FILE} (${L} flèches).`);
}
// Sans SEED : hasard cryptographique. Une graine courte rendrait la grille retrouvable en essayant toutes
// les graines avec ce script public. SEED ne sert qu'aux essais.
const seed = process.env.SEED;
let s = Number(seed) >>> 0;
const rnd = seed !== undefined
  ? () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32; }
  : () => randomInt(2 ** 32) / 2 ** 32;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const inside = (x, y) => x >= 0 && x < n && y >= 0 && y < n;
const cid = (x, y) => y * n + x;
const sid = (x, y, r) => cid(x, y) * 8 + r;
const NS = n * n * 8;
const EXIT = sid(0, 0, 0); // le seul état gagnant
const isExitCell = (a) => a >> 3 === 0;

// Sauts possibles depuis l'état (x, y, r) quand la case porte la flèche imprimée p
function jumps(x, y, r, p) {
  if (x === 0 && y === 0) return [];
  const [dx, dy] = DV[rot(p, r)], o = [];
  for (let k = 1; inside(x + k * dx, y + k * dy); k++) o.push(sid(x + k * dx, y + k * dy, turn(r, k)));
  return o;
}

// Avec une séquence imposée : can[i][état] = 1 si les sauts i..L-1 de la séquence peuvent mener de cet état à la
// sortie (en arrivant à +0°). Sert à élaguer la marche aléatoire.
let can = null;
if (SEQ) {
  can = Array.from({ length: L + 1 }, () => new Uint8Array(NS));
  can[L][EXIT] = 1;
  for (let i = L - 1; i >= 0; i--) {
    const [dx, dy] = DV[SEQ[i]];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) for (let r = 0; r < RS; r++) {
      if (x === 0 && y === 0) continue;
      for (let k = 1; inside(x + k * dx, y + k * dy); k++) {
        const b = sid(x + k * dx, y + k * dy, turn(r, k));
        if (i + 1 < L && isExitCell(b)) continue; // on ne passe pas par la sortie avant la fin
        if (can[i + 1][b]) { can[i][sid(x, y, r)] = 1; break; }
      }
    }
  }
  if (![...Array(n).keys()].some((x) => x > 0 && can[0][sid(x, n - 1, 0)])) {
    console.error("La séquence imposée ne peut mener d'aucune case du bas à la sortie à +0°."); process.exit(1);
  }
}

// ---------- 1. Le chemin ----------
// Marche aléatoire avec retour arrière. Une fois la flèche d'une case du chemin fixée, ses orientations sont
// connues : aucune ne doit sauter sur le chemin (ou dans la sortie) ailleurs qu'au pas suivant.
function makePath() {
  const fixed = new Map(); // case -> flèche imprimée imposée par le chemin
  const idx = new Map();   // état -> rang dans le chemin
  const visits = new Map(), path = [];
  let budget = 4000;

  function consistent() {
    for (const [c, p] of fixed) {
      const x = c % n, y = (c / n) | 0;
      for (let r = 0; r < RS; r++) {
        const ai = idx.get(sid(x, y, r));
        for (const b of jumps(x, y, r, p)) {
          if (b !== EXIT && !idx.has(b)) continue;
          const ok = ai !== undefined && (idx.get(b) === ai + 1 || (b === EXIT && ai === L - 1));
          if (!ok) return false;
        }
      }
    }
    return true;
  }
  function step(x, y, r, i) {
    if (--budget < 0) return false;
    const a = sid(x, y, r), c = cid(x, y);
    path.push([x, y, r]); idx.set(a, i); visits.set(c, (visits.get(c) || 0) + 1);
    const undo = () => { path.pop(); idx.delete(a); visits.set(c, visits.get(c) - 1); };
    const f = fixed.get(c);
    if (i === L - 1) { // dernier saut : vers la sortie, en arrivant à +0°
      const e = x === 0 ? "N" : y === 0 ? "W" : x === y ? "NW" : null;
      if (e && (!SEQ || SEQ[i] === e) && turn(r, Math.max(x, y)) === 0 && (!f || rot(f, r) === e)) {
        if (!f) fixed.set(c, rot(e, -r));
        if (consistent()) return true;
        if (!f) fixed.delete(c);
      }
      undo(); return false;
    }
    if (!f && !consistent()) { undo(); return false; }
    const options = [];
    // Facile et moyen : un faux départ ne peut jamais pointer vers N (le chemin passe par toutes les colonnes) ;
    // un vrai départ vers N serait donc le seul de la ligne du bas et se repérerait tout de suite.
    const wanted = SEQ ? [SEQ[i]] : i === 0 && P.depart ? DIRS.filter((d) => d !== "N") : DIRS;
    for (const e of (f ? [rot(f, r)] : DIRS).filter((d) => wanted.includes(d))) {
      const [dx, dy] = DV[e];
      for (let k = 1; inside(x + k * dx, y + k * dy); k++) {
        const tx = x + k * dx, ty = y + k * dy, tr = turn(r, k);
        if (tx === 0 && ty === 0) continue;
        if (can && !can[i + 1][sid(tx, ty, tr)]) continue; // ne mènerait plus à la sortie avec la séquence
        if (idx.has(sid(tx, ty, tr)) || (visits.get(cid(tx, ty)) || 0) >= 2) continue;
        if (ty === n - 1 && tr === 0) continue; // ce serait un autre départ gagnant
        options.push([e, tx, ty, tr]);
      }
    }
    for (const [e, tx, ty, tr] of shuffle(options)) {
      const added = !f; if (added) fixed.set(c, rot(e, -r));
      idx.set(sid(tx, ty, tr), i + 1); // anticipe pour le contrôle de cohérence
      const ok = consistent();
      idx.delete(sid(tx, ty, tr));
      if (ok && step(tx, ty, tr, i + 1)) return true;
      if (added) fixed.delete(c);
    }
    undo(); return false;
  }
  // pas la colonne 0 (trop évident), ni le départ d'un autre niveau
  const starts = [...Array(n).keys()].filter((x) => x > 0 && !otherStarts.has(x) && (!can || can[0][sid(x, n - 1, 0)]));
  if (!starts.length) return null;
  const sx = pick(starts);
  return step(sx, n - 1, 0, 0) ? { path, fixed } : null;
}

function pathOk({ path }) {
  const revisits = L - new Set(path.map(([x, y]) => cid(x, y))).size;
  if (ROTATE && (revisits < 1 || revisits > 3)) return false;
  const rows = new Set(path.map(([, y]) => y)), cols = new Set(path.map(([x]) => x));
  if (rows.size !== n || cols.size !== n) return false;
  // Faux départs : chacun doit pouvoir recevoir une flèche qui mène à au moins D.sauts cases sans jamais toucher le
  // chemin ni la sortie (sinon ce serait un autre départ gagnant). Sans cela, le générateur n'a plus que des flèches
  // qui sortent du plateau, et ces départs s'éliminent d'un coup d'œil.
  // Certaines cases n'ont parfois aucune flèche possible (le coin en bas à droite : N tombe sur le chemin, NW sur la
  // sortie, W sur le vrai départ) : on en tolère au plus D.bloques.
  if (P.depart) {
    const cells = new Set(path.map(([x, y]) => cid(x, y))); cells.add(cid(0, 0));
    let bloques = 0;
    for (let x = 0; x < n; x++) {
      if (x === path[0][0]) continue;
      const ok = DIRS.some((d) => {
        const [dx, dy] = DV[d]; let k = 0;
        for (let a = x + dx, b = n - 1 + dy; inside(a, b); a += dx, b += dy, k++) if (cells.has(cid(a, b))) return false;
        return k >= Math.min(2, P.depart.sauts); // filtre souple : le recuit pousse ensuite vers D.sauts
      });
      if (!ok) bloques++;
    }
    if (bloques > P.depart.bloques) return false;
  }
  return true;
}

// ---------- 2. Évaluation d'une grille ----------
const mark = new Int32Array(NS), dist = new Int16Array(NS); let markId = 0;
// Profondeur d'un piège : distance maximale (en sauts) atteignable depuis b, plafonnée à 15.
function trapDepth(b, succ) {
  markId++; mark[b] = markId; dist[b] = 0;
  const q = [b]; let depth = 0;
  for (let h = 0; h < q.length; h++) {
    const a = q[h];
    if (dist[a] >= 15) break;
    for (const c of succ[a]) if (mark[c] !== markId) { mark[c] = markId; dist[c] = dist[a] + 1; depth = dist[c]; q.push(c); }
  }
  return depth;
}
// Nombre d'états atteignables depuis b (b compris), en s'arrêtant à cap.
function zoneSize(b, succ, cap) {
  markId++; mark[b] = markId;
  const q = [b];
  for (let h = 0; h < q.length && q.length < cap; h++)
    for (const c of succ[q[h]]) if (mark[c] !== markId) { mark[c] = markId; q.push(c); }
  return Math.min(q.length, cap);
}
// Nombre minimal de sauts depuis b avant d'atteindre une impasse (plafonné à cap).
function deadDist(b, succ, cap) {
  markId++; mark[b] = markId; dist[b] = 0;
  const q = [b];
  for (let h = 0; h < q.length; h++) {
    const a = q[h];
    if (!succ[a].length && !isExitCell(a)) return dist[a];
    if (dist[a] >= cap) continue;
    for (const c of succ[a]) if (mark[c] !== markId) { mark[c] = markId; dist[c] = dist[a] + 1; q.push(c); }
  }
  return cap;
}
const dirOf = (grid, a) => { const c = a >> 3; return rot(grid[(c / n) | 0][c % n], a & 7); };

function evaluate(grid, path, final = false) {
  const succ = new Array(NS).fill(null).map(() => []), pred = Array.from({ length: NS }, () => []);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) for (let r = 0; r < RS; r++) {
    const a = sid(x, y, r);
    succ[a] = jumps(x, y, r, grid[y][x]);
    for (const b of succ[a]) pred[b].push(a);
  }
  // Parcours en largeur depuis les départs : reach[a] = 1 + nombre minimal de sauts pour atteindre a (0 = jamais).
  const reach = new Uint8Array(NS), bfs = [];
  for (let x = 0; x < n; x++) { const a = sid(x, n - 1, 0); reach[a] = 1; bfs.push(a); }
  for (let h = 0; h < bfs.length; h++) for (const b of succ[bfs[h]]) if (!reach[b]) { reach[b] = reach[bfs[h]] + 1; bfs.push(b); }

  const pathIds = path.map(([x, y, r]) => sid(x, y, r));
  const onPath = new Set(pathIds);
  const target = (b) => b === EXIT || onPath.has(b);
  // « Fuite » : un état atteignable hors du chemin qui saute sur le chemin ou dans la sortie,
  // ou un état du chemin qui a un autre saut gagnant que le suivant. Zéro fuite = chemin unique.
  // Impasse « proche » : atteignable en 2 sauts ou moins depuis le bas, donc trouvée trop vite.
  let viol = 0, reached = 0, dead0 = 0, deadNear = 0, lowDeg = 0;
  for (let a = 0; a < NS; a++) {
    if (!reach[a] || isExitCell(a)) continue;
    reached++;
    if (!onPath.has(a) && succ[a].some(target)) viol++;
    if (!succ[a].length) { dead0++; if (reach[a] <= 3) deadNear++; }
  }
  // Pièges : cases hors chemin accessibles d'un saut depuis le chemin.
  let trapPen = 0, leurres = 0, traps = 0, depthSum = 0;
  pathIds.forEach((a, i) => {
    const next = i + 1 < L ? pathIds[i + 1] : EXIT;
    for (const b of succ[a]) {
      if (target(b) && b !== next) viol++;
      if (b === next || isExitCell(b) || !P.piege) continue;
      const d = trapDepth(b, succ);
      traps++; depthSum += d;
      trapPen += Math.max(0, P.piege[0] - d) + Math.max(0, d - P.piege[1]);
      if (i + 1 < L && dirOf(grid, b) === dirOf(grid, next)) leurres++;
    }
    lowDeg += Math.max(0, 3 - succ[a].length);
  });
  const cellReached = new Uint8Array(n * n);
  for (let a = 0; a < NS; a++) if (reach[a]) cellReached[a >> 3] = 1;
  let unreached = 0; for (let c = 1; c < n * n; c++) if (!cellReached[c]) unreached++;

  if (final) { // vérification indépendante : états d'où la sortie est atteignable
    const q = [], good = new Uint8Array(NS); good[EXIT] = 1; q.push(EXIT);
    while (q.length) for (const a of pred[q.pop()]) if (!good[a]) { good[a] = 1; q.push(a); }
    const goodReached = [];
    for (let a = 0; a < NS; a++) if (reach[a] && good[a] && a !== EXIT) goodReached.push(a);
    const startsGood = [...Array(n).keys()].filter((x) => good[sid(x, n - 1, 0)]);
    const ok = goodReached.length === L && goodReached.every((a) => onPath.has(a)) && startsGood.length === 1 &&
      pathIds.every((a, i) => { const g = succ[a].filter((b) => good[b]); return g.length === 1 && g[0] === (i + 1 < L ? pathIds[i + 1] : EXIT); });
    if (!ok) viol += 1000;
  }
  let score = 1000 * viol + 300 * unreached + P.mort * (P.impasses === null ? dead0 : Math.abs(dead0 - P.impasses)) +
    P.proche * deadNear + 15 * lowDeg - reached / 2;
  if (P.piege) score += 20 * trapPen + 8 * Math.abs(leurres - P.leurres);
  // Faux départs trop vite éliminés, et zones mortes (cases hors chemin qui ne mènent presque nulle part).
  let departPen = 0, departsFaibles = 0, zonesMortes = 0;
  if (P.depart) {
    const D = P.depart;
    for (let x = 0; x < n; x++) {
      const a = sid(x, n - 1, 0);
      if (a === pathIds[0]) continue;
      const pen = 40 * Math.max(0, D.sauts - succ[a].length) + 4 * Math.max(0, D.zone - zoneSize(a, succ, D.zone)) +
        30 * Math.max(0, D.impasse - deadDist(a, succ, D.impasse));
      if (pen) departsFaibles++;
      departPen += pen;
    }
    // Ligne du bas variée : les flèches horizontales et les voisines identiques forment un motif (« W W W W… »).
    const bas = grid[n - 1];
    for (let x = 0; x < n; x++) {
      if (bas[x] === "E" || bas[x] === "W") departPen += 6;
      if (x && bas[x] === bas[x - 1]) departPen += 5;
    }
    score += departPen;
  }
  if (P.zone) {
    for (let a = 0; a < NS; a++) {
      if (!reach[a] || onPath.has(a) || isExitCell(a)) continue;
      const miss = P.zone - zoneSize(a, succ, P.zone);
      if (miss > 0) { zonesMortes++; score += 3 * miss; }
    }
  }
  return { score, viol, unreached, dead0, deadNear, lowDeg, reached, traps, profondeurMoy: traps ? +(depthSum / traps).toFixed(1) : 0, horsCible: trapPen, leurres, departsFaibles, zonesMortes };
}

// ---------- 3. Recherche ----------
// Facile et moyen : on garde la meilleure de plusieurs grilles valides (CANDIDATS), pas la première trouvée.
let best = null, valides = 0;
const CANDIDATS = P.depart ? 4 : 1;
const t0 = Date.now();
for (let tentative = 1; tentative <= 60 && valides < CANDIDATS; tentative++) {
  let p = null, essais = 0;
  while (!(p && pathOk(p)) && essais++ < 20000) p = makePath();
  if (!p || !pathOk(p)) { console.log(`tentative ${tentative} : pas de chemin`); continue; }
  const grid = Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => p.fixed.get(cid(x, y)) || pick(DIRS)));
  grid[0][0] = "N"; // la sortie
  const free = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!(x === 0 && y === 0) && !p.fixed.has(cid(x, y))) free.push([x, y]);
  let cur = evaluate(grid, p.path);
  // recuit simulé sur les cases libres
  const iters = 25000;
  for (let it = 0; it < iters; it++) {
    const [x, y] = pick(free), old = grid[y][x];
    grid[y][x] = pick(DIRS.filter((d) => d !== old));
    const nv = evaluate(grid, p.path), T = 60 * (1 - it / iters) + 0.5;
    if (nv.score <= cur.score || rnd() < Math.exp((cur.score - nv.score) / T)) cur = nv; else grid[y][x] = old;
  }
  console.log(`tentative ${tentative} (${essais} chemins essayés, ${((Date.now() - t0) / 1000).toFixed(0)} s) : ${JSON.stringify(cur)}`);
  if (cur.viol === 0 && cur.unreached === 0 && evaluate(grid, p.path, true).viol === 0) {
    valides++;
    if (!best || cur.score < best.stats.score) best = { grid, path: p.path, stats: cur };
  }
}
if (!best) { console.error("Aucune grille valide trouvée, relance la commande."); process.exit(1); }

// ---------- 4. Écriture ----------
const { grid, path, stats } = best;
if (SEQ && !path.every(([x, y, r], i) => rot(grid[y][x], r) === SEQ[i])) {
  console.error(`Erreur interne : les directions du chemin ne suivent pas ${SEQ_FILE}.`); process.exit(1);
}
const revisits = L - new Set(path.map(([x, y]) => cid(x, y))).size;
console.log(`\nGrille ${level.nom} trouvée${seed !== undefined ? ` (graine ${seed})` : ""} :`);
console.log(`  départ : colonne ${path[0][0] + 1}`);
console.log(`  états atteignables : ${stats.reached} / ${n * n * RS}`);
console.log(`  impasses immédiates atteignables : ${stats.dead0}`);
console.log(`  dont à 2 sauts ou moins du bas (trouvées trop vite) : ${stats.deadNear}`);
if (P.piege) {
  console.log(`  pièges accessibles depuis le chemin : ${stats.traps}, profondeur moyenne ${stats.profondeurMoy} sauts (visée ${P.piege[0]} à ${P.piege[1]})`);
  console.log(`  leurres (piège dont la flèche ressemble à la bonne) : ${stats.leurres} (visé ${P.leurres})`);
}
if (P.depart) console.log(`  faux départs éliminables trop vite : ${stats.departsFaibles} / ${n - 1}`);
if (P.zone) console.log(`  cases hors chemin en « zone morte » (moins de ${P.zone} cases accessibles) : ${stats.zonesMortes}`);
if (ROTATE) console.log(`  cases du chemin repassées avec une autre orientation : ${revisits}`);
console.log(`  le chemin couvre toutes les lignes et toutes les colonnes : oui`);
if (essai) { console.log("\n--essai : rien n'a été écrit."); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
mkdirSync("prive/archives", { recursive: true });
for (const f of ["dedale.json", SOL]) if (existsSync(f)) copyFileSync(f, `prive/archives/${stamp}-${f.replace("prive/", "")}`);
level.grid = grid;
writeFileSync("dedale.json", formatDedale(cfg));
solutions[level.id] = path.map(([x, y]) => [x, y]);
writeFileSync(SOL, "{\n" + cfg.levels.filter((l) => solutions[l.id]).map((l) => `  ${JSON.stringify(l.id)}: ${JSON.stringify(solutions[l.id])}`).join(",\n") + "\n}\n");
console.log(`\nÉcrit : dedale.json et ${SOL} (niveau ${level.nom} ; anciens fichiers copiés dans prive/archives/).`);
console.log("Pense à mettre à jour le secret SOLUTION_JSON sur GitHub avec le contenu de prive/solution.json.");

function formatDedale(c) {
  const rows = (g) => g.map((row) => "        [" + row.map((d) => JSON.stringify(d)).join(",") + "]").join(",\n");
  const lv = c.levels.map((l) =>
    `    {\n      "id": ${JSON.stringify(l.id)}, "nom": ${JSON.stringify(l.nom)}, "brouillard": ${l.brouillard}, "rotation": ${l.rotation},\n` +
    `      "grid": ${l.grid ? `[\n${rows(l.grid)}\n      ]` : "null"}\n    }`).join(",\n");
  return `{\n  "n": ${c.n},\n  "fridays": ${JSON.stringify(c.fridays)},\n  "levels": [\n${lv}\n  ]\n}\n`;
}
