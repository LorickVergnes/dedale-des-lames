// Construit dist/index.html à partir de index.html + dedale.json (Le Dédale des Lames).
// La solution (SOLUTION_JSON) et le code prof (REVEAL_PASSWORD) viennent des secrets GitHub,
// ou en local des fichiers prive/solution.json et prive/mot-de-passe.txt.
// Trois niveaux, chacun avec sa grille et son chemin. Pour chaque niveau, la flèche du vendredi n° i est la direction réelle du saut n° i
// (flèche de la case, tournée selon la règle de rotation pour le niveau difficile). Seules celles dont la date est passée (heure de Paris)
// sont publiées, sans la case correspondante ; la solution complète est chiffrée (AES-256-GCM, clé dérivée du code par PBKDF2).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { randomBytes, pbkdf2Sync, createCipheriv } from "node:crypto";
import { normaliser, parisNow, lireTrouvees, lireEnigmes, dateDeSortie, SORTIE } from "./enigmes.mjs";

const fail = (msg) => { console.error("Erreur : " + msg); process.exit(1); };
const clean = (s) => s.replace(/^﻿/, "").trim(); // retire BOM et retours à la ligne
const fromEnvOrFile = (name, file) =>
  clean(process.env[name] || "") || (existsSync(file) ? clean(readFileSync(file, "utf8")) : "");

// Trois niveaux (facile, moyen, difficile), chacun avec sa grille, son chemin et ses flèches publiées.
const { n, fridays, levels } = JSON.parse(readFileSync("dedale.json", "utf8"));
const solutionTxt = fromEnvOrFile("SOLUTION_JSON", "prive/solution.json");
const password = fromEnvOrFile("REVEAL_PASSWORD", "prive/mot-de-passe.txt").normalize("NFC");
if (!solutionTxt) fail("solution absente (secret SOLUTION_JSON ou prive/solution.json).");
if (!password) fail("code prof absent (secret REVEAL_PASSWORD ou prive/mot-de-passe.txt).");
if (password.length < 12) console.warn("Attention : code de moins de 12 caractères, plus facile à deviner.");

// La solution donne, pour chaque niveau, les cases du chemin dans l’ordre des vendredis : la case de départ
// (ligne du bas) d’abord. La dernière case saute vers la sortie [0,0], qui ne fait pas partie de la liste.
let solutions;
try { solutions = JSON.parse(solutionTxt); } catch { fail("SOLUTION_JSON n'est pas du JSON valide."); }
if (Array.isArray(solutions) || typeof solutions !== "object" || !solutions)
  fail("SOLUTION_JSON doit être un objet { \"facile\": [...], \"moyen\": [...], \"difficile\": [...] } (contenu de prive/solution.json).");
// Règle de rotation (niveaux qui l'activent) : après un saut de k cases, toutes les flèches tournent de k × 45°
// (sens horaire), et la sortie ne s'ouvre que si l'on y arrive avec les flèches à +0°.
const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const DV = { N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1], S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1] };
const rot = (d, r) => DIRS[(DIRS.indexOf(d) + r) % 8];
// Direction réelle de chaque saut, une fois les flèches tournées : c'est la flèche publiée chaque vendredi.
function jumpDirsOf({ id, grid, rotation }) {
  const path = solutions[id];
  if (!grid) fail(`pas de grille pour le niveau ${id} dans dedale.json (node generer.mjs ${id}).`);
  if (!Array.isArray(path) || path.length !== fridays.length) fail(`niveau ${id} : il faut ${fridays.length} cases dans la solution (une par vendredi).`);
  if (path[0][1] !== n - 1) fail(`niveau ${id} : la première case doit être sur la ligne du bas.`);
  const steps = [...path, [0, 0]], dirs = [];
  let r = 0;
  for (let i = 0; i < path.length; i++) {
    const [fx, fy] = steps[i], [tx, ty] = steps[i + 1], d = rot(grid[fy][fx], r), [dx, dy] = DV[d];
    const k = dx ? (tx - fx) / dx : (ty - fy) / dy;
    if (!(k >= 1 && Number.isInteger(k) && fx + k * dx === tx && fy + k * dy === ty))
      fail(`niveau ${id} : saut impossible de [${fx},${fy}] vers [${tx},${ty}] (flèche ${rotation ? "tournée " : ""}vers ${d}).`);
    dirs.push(d);
    if (rotation) r = (r + k) % 8;
  }
  if (r !== 0) fail(`niveau ${id} : le chemin arrive à la sortie avec les flèches à +${r * 45}° : la sortie ne s'ouvre qu'à +0°.`);
  return dirs;
}
const jumpDirs = Object.fromEntries(levels.map((l) => [l.id, jumpDirsOf(l)]));

// Chaque flèche sort le vendredi à 20 h 30, heure de Paris. BUILD_DATE ("2027-01-15" ou "2027-01-15 20:30") simule une date.
const RELEASE = SORTIE;
const bd = process.env.BUILD_DATE;
const today = bd ? (bd.length === 10 ? bd + " 23:59" : bd) : parisNow();
const posted = fridays.filter((f) => `${f} ${RELEASE}` <= today).length;

// Énigmes (facultatives) : le texte vient du secret ENIGMES_JSON (ou prive/enigmes.json), les énigmes trouvées de
// enigmes-trouvees.json. Une énigme n'entre dans la page qu'à sa sortie. Tant qu'elle n'est pas trouvée, sa réponse
// n'y est que chiffrée : chaque réponse acceptée (mise en forme) est une clé qui la déchiffre.
const ENIG_ITER = 400000;
function chiffrerAvec(mdp, sel, obj) {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", pbkdf2Sync(mdp, sel, ENIG_ITER, 32, "sha256"), iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final(), c.getAuthTag()]);
  return { iv: iv.toString("base64"), ct: ct.toString("base64") };
}
let enigmes = null;
const enigmesTxt = fromEnvOrFile("ENIGMES_JSON", "prive/enigmes.json");
if (!enigmesTxt) console.warn("Pas d'énigmes (secret ENIGMES_JSON ou prive/enigmes.json absent) : la zone Énigmes est masquée.");
else {
  let liste, trouvees;
  try { liste = lireEnigmes(enigmesTxt); trouvees = lireTrouvees(); } catch (e) { fail(e.message); }
  const sorties = liste.map((_, i) => dateDeSortie(i, trouvees, fridays));
  const visibles = [];
  for (let i = 0; i < liste.length; i++) {
    if (!sorties[i] || `${sorties[i]} ${RELEASE}` > today) break; // les suivantes attendent celle-ci
    const { texte, mot, reponses } = liste[i], t = trouvees[String(i + 1)];
    const affiche = mot || reponses[0];
    if (t) visibles.push({ n: i + 1, texte, etat: "resolue", mot: affiche });
    else {
      const sel = randomBytes(16), cles = [...new Set(reponses.map(normaliser))];
      visibles.push({ n: i + 1, texte, etat: "ouverte", iter: ENIG_ITER, sel: sel.toString("base64"),
        essais: cles.map((k) => chiffrerAvec(k, sel, { mot: affiche })) });
    }
  }
  const k = visibles.length;
  enigmes = { total: liste.length, liste: visibles,
    // prochaine énigme : sa date si la précédente est trouvée, sinon null (elle attend la découverte)
    prochaine: k < liste.length ? { n: k + 1, date: sorties[k] } : null };
}

const iter = 600000, salt = randomBytes(16), iv = randomBytes(12);
const key = pbkdf2Sync(password, salt, iter, 32, "sha256");
const cipher = createCipheriv("aes-256-gcm", key, iv);
const allPaths = Object.fromEntries(levels.map((l) => [l.id, solutions[l.id]]));
const ct = Buffer.concat([cipher.update(JSON.stringify(allPaths), "utf8"), cipher.final(), cipher.getAuthTag()]);

const data = {
  n, fridays, posted,
  levels: levels.map(({ id, nom, brouillard, rotation, grid }) => ({ id, nom, brouillard, rotation, grid })),
  // seulement les directions, jamais les cases : une flèche par niveau et par vendredi
  revealed: Object.fromEntries(levels.map((l) => [l.id, jumpDirs[l.id].slice(0, posted)])),
  enc: { iter, salt: salt.toString("base64"), iv: iv.toString("base64"), ct: ct.toString("base64") },
  enigmes,
};
// Microsoft Clarity : ajouté seulement si la variable CLARITY_ID est définie (en ligne), pas en local.
const clarityId = clean(process.env.CLARITY_ID || "");
if (clarityId && !/^[a-z0-9]{5,20}$/i.test(clarityId)) fail("CLARITY_ID invalide (lettres et chiffres uniquement).");
const claritySnippet = clarityId
  ? `<script>(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${clarityId}");</script>`
  : "";

const html = readFileSync("index.html", "utf8");
if (!html.includes("/*DATA*/null")) fail("marqueur /*DATA*/null introuvable dans index.html.");
if (!html.includes("<!--CLARITY-->")) fail("marqueur <!--CLARITY--> introuvable dans index.html.");
mkdirSync("dist", { recursive: true });
writeFileSync("dist/index.html", html
  .replace("<!--CLARITY-->", () => claritySnippet)
  // « < » échappé : un texte d'énigme ne peut pas fermer la balise <script>
  .replace("/*DATA*/null", () => JSON.stringify(data).replace(/</g, "\\u003c")));
const resumeEnigmes = enigmes
  ? `, énigmes ${enigmes.liste.length}/${enigmes.total} sorties (${enigmes.liste.filter((e) => e.etat === "resolue").length} trouvées)`
  : "";
console.log(`dist/index.html construit le ${today} : ${posted}/${fridays.length} flèches publiées${resumeEnigmes}` +
  (clarityId ? ", avec Clarity." : ", sans Clarity."));
