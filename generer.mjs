// Génère un nouveau Dédale des Lames avec la règle de rotation, puis écrit :
//   - dedale.json         : la grille (flèches « imprimées »), publique ;
//   - prive/solution.json : le chemin, à copier dans le secret SOLUTION_JSON (jamais publié).
// Les anciens fichiers sont copiés dans prive/archives/ avant d'être remplacés.
//
// Règles :
//   - après un saut de k cases, toutes les flèches tournent de k × 45° dans le sens horaire ;
//   - la sortie [0,0] ne s'ouvre que si l'on y arrive avec les flèches à +0° (rotation totale multiple de 360°).
// Un état du jeu est donc (case, orientation) : 121 × 8 = 968 états au lieu de 121 cases.
//
// Le générateur garantit :
//   - un seul départ mène à la sortie, par un seul chemin de 23 sauts, sans raccourci ni détour ;
//   - toutes les cases sont atteignables depuis la ligne du bas ;
//   - le chemin passe par chaque ligne et chaque colonne (plus de ligne ou de colonne « morte » évidente) ;
//   - le chemin repasse au moins une fois par une de ses cases avec une autre orientation ;
//   - peu d'impasses immédiates et beaucoup d'états à explorer.
//
// Usage : node generer.mjs            (hasard cryptographique : à utiliser pour la vraie grille)
//         SEED=1234 node generer.mjs  (graine fixée, pour les essais seulement : jamais pour la vraie grille)
//         node generer.mjs --essai    (n'écrit rien, affiche seulement les statistiques)
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { randomInt } from "node:crypto";

const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const DV = { N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1], S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1] };
const rot = (d, r) => DIRS[(DIRS.indexOf(d) + r + 8) % 8];

const cfg = JSON.parse(readFileSync("dedale.json", "utf8"));
const n = cfg.n, L = cfg.fridays.length; // L cases sur le chemin, donc L sauts (le dernier vers la sortie)
const essai = process.argv.includes("--essai");
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
  for (let k = 1; inside(x + k * dx, y + k * dy); k++) o.push(sid(x + k * dx, y + k * dy, (r + k) % 8));
  return o;
}

// ---------- 1. Le chemin ----------
// Marche aléatoire avec retour arrière. Une fois la flèche d'une case du chemin fixée, ses 8 orientations sont
// connues : aucune ne doit sauter sur le chemin (ou dans la sortie) ailleurs qu'au pas suivant.
function makePath() {
  const fixed = new Map(); // case -> flèche imprimée imposée par le chemin
  const idx = new Map();   // état -> rang dans le chemin
  const visits = new Map(), path = [];
  let budget = 4000;

  function consistent() {
    for (const [c, p] of fixed) {
      const x = c % n, y = (c / n) | 0;
      for (let r = 0; r < 8; r++) {
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
      if (e && (r + Math.max(x, y)) % 8 === 0 && (!f || rot(f, r) === e)) {
        if (!f) fixed.set(c, rot(e, -r));
        if (consistent()) return true;
        if (!f) fixed.delete(c);
      }
      undo(); return false;
    }
    if (!f && !consistent()) { undo(); return false; }
    const options = [];
    for (const e of f ? [rot(f, r)] : DIRS) {
      const [dx, dy] = DV[e];
      for (let k = 1; inside(x + k * dx, y + k * dy); k++) {
        const tx = x + k * dx, ty = y + k * dy, tr = (r + k) % 8;
        if (tx === 0 && ty === 0) continue;
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
  const sx = 1 + Math.floor(rnd() * (n - 1)); // pas la colonne 0 : trop évident
  return step(sx, n - 1, 0, 0) ? { path, fixed } : null;
}

function pathOk({ path }) {
  const revisits = L - new Set(path.map(([x, y]) => cid(x, y))).size;
  if (revisits < 1 || revisits > 3) return false;
  const rows = new Set(path.map(([, y]) => y)), cols = new Set(path.map(([x]) => x));
  return rows.size === n && cols.size === n;
}

// ---------- 2. Évaluation d'une grille ----------
function evaluate(grid, path, final = false) {
  const succ = new Array(NS), pred = Array.from({ length: NS }, () => []);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) for (let r = 0; r < 8; r++) {
    const a = sid(x, y, r);
    succ[a] = jumps(x, y, r, grid[y][x]);
    for (const b of succ[a]) pred[b].push(a);
  }
  const reach = new Uint8Array(NS), q = [];
  for (let x = 0; x < n; x++) { const a = sid(x, n - 1, 0); reach[a] = 1; q.push(a); }
  while (q.length) for (const b of succ[q.pop()]) if (!reach[b]) { reach[b] = 1; q.push(b); }

  const pathIds = path.map(([x, y, r]) => sid(x, y, r));
  const onPath = new Set(pathIds);
  const target = (b) => b === EXIT || onPath.has(b);
  // « Fuite » : un état atteignable hors du chemin qui saute sur le chemin ou dans la sortie,
  // ou un état du chemin qui a un autre saut gagnant que le suivant. Zéro fuite = chemin unique.
  let viol = 0, reached = 0, dead0 = 0, lowDeg = 0;
  for (let a = 0; a < NS; a++) {
    if (!reach[a] || isExitCell(a)) continue;
    reached++;
    if (!onPath.has(a) && succ[a].some(target)) viol++;
    if (!succ[a].length) dead0++;
  }
  pathIds.forEach((a, i) => {
    const next = i + 1 < L ? pathIds[i + 1] : EXIT;
    for (const b of succ[a]) if (target(b) && b !== next) viol++;
    lowDeg += Math.max(0, 3 - succ[a].length);
  });
  const cellReached = new Uint8Array(n * n);
  for (let a = 0; a < NS; a++) if (reach[a]) cellReached[a >> 3] = 1;
  let unreached = 0; for (let c = 1; c < n * n; c++) if (!cellReached[c]) unreached++;

  if (final) { // vérification indépendante : états d'où la sortie est atteignable
    const good = new Uint8Array(NS); good[EXIT] = 1; q.push(EXIT);
    while (q.length) for (const a of pred[q.pop()]) if (!good[a]) { good[a] = 1; q.push(a); }
    const goodReached = [];
    for (let a = 0; a < NS; a++) if (reach[a] && good[a] && a !== EXIT) goodReached.push(a);
    const startsGood = [...Array(n).keys()].filter((x) => good[sid(x, n - 1, 0)]);
    const ok = goodReached.length === L && goodReached.every((a) => onPath.has(a)) && startsGood.length === 1 &&
      pathIds.every((a, i) => { const g = succ[a].filter((b) => good[b]); return g.length === 1 && g[0] === (i + 1 < L ? pathIds[i + 1] : EXIT); });
    if (!ok) viol += 1000;
  }
  const score = 1000 * viol + 300 * unreached + 8 * dead0 + 15 * lowDeg - reached / 2;
  return { score, viol, unreached, dead0, lowDeg, reached };
}

// ---------- 3. Recherche ----------
let best = null;
const t0 = Date.now();
for (let tentative = 1; tentative <= 60 && !best; tentative++) {
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
  if (cur.viol === 0 && cur.unreached === 0 && evaluate(grid, p.path, true).viol === 0) best = { grid, path: p.path, stats: cur };
}
if (!best) { console.error("Aucune grille valide trouvée, relance la commande."); process.exit(1); }

// ---------- 4. Écriture ----------
const { grid, path, stats } = best;
const revisits = L - new Set(path.map(([x, y]) => cid(x, y))).size;
console.log(`\nGrille trouvée${seed !== undefined ? ` (graine ${seed})` : ""} :`);
console.log(`  états atteignables : ${stats.reached} / ${NS}`);
console.log(`  impasses immédiates atteignables : ${stats.dead0}`);
console.log(`  cases du chemin repassées avec une autre orientation : ${revisits}`);
console.log(`  le chemin couvre toutes les lignes et toutes les colonnes : oui`);
if (essai) { console.log("\n--essai : rien n'a été écrit."); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
mkdirSync("prive/archives", { recursive: true });
for (const f of ["dedale.json", "prive/solution.json"]) if (existsSync(f)) copyFileSync(f, `prive/archives/${stamp}-${f.replace("prive/", "")}`);
const rows = grid.map((row) => "    [" + row.map((d) => JSON.stringify(d)).join(",") + "]").join(",\n");
writeFileSync("dedale.json", `{\n  "n": ${n},\n  "grid": [\n${rows}\n  ],\n  "fridays": ${JSON.stringify(cfg.fridays)}\n}\n`);
writeFileSync("prive/solution.json", JSON.stringify(path.map(([x, y]) => [x, y])) + "\n");
console.log(`\nÉcrit : dedale.json et prive/solution.json (anciens fichiers copiés dans prive/archives/).`);
console.log("Pense à mettre à jour le secret SOLUTION_JSON sur GitHub avec le contenu de prive/solution.json.");
