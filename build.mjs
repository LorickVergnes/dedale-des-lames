// Construit dist/index.html à partir de index.html + dedale.json (Le Dédale des Lames).
// La solution (SOLUTION_JSON) et le code prof (REVEAL_PASSWORD) viennent des secrets GitHub,
// ou en local des fichiers prive/solution.json et prive/mot-de-passe.txt.
// Les flèches sont postées du départ vers la sortie : la flèche du vendredi n° i est la direction réelle du saut n° i
// (flèche de la case tournée selon la règle de rotation). Seules celles dont la date est passée (heure de Paris)
// sont publiées, sans la case correspondante ; la solution complète est chiffrée (AES-256-GCM, clé dérivée du code par PBKDF2).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { randomBytes, pbkdf2Sync, createCipheriv } from "node:crypto";

const fail = (msg) => { console.error("Erreur : " + msg); process.exit(1); };
const clean = (s) => s.replace(/^﻿/, "").trim(); // retire BOM et retours à la ligne
const fromEnvOrFile = (name, file) =>
  clean(process.env[name] || "") || (existsSync(file) ? clean(readFileSync(file, "utf8")) : "");

const { n, grid, fridays } = JSON.parse(readFileSync("dedale.json", "utf8"));
const solutionTxt = fromEnvOrFile("SOLUTION_JSON", "prive/solution.json");
const password = fromEnvOrFile("REVEAL_PASSWORD", "prive/mot-de-passe.txt").normalize("NFC");
if (!solutionTxt) fail("solution absente (secret SOLUTION_JSON ou prive/solution.json).");
if (!password) fail("code prof absent (secret REVEAL_PASSWORD ou prive/mot-de-passe.txt).");
if (password.length < 12) console.warn("Attention : code de moins de 12 caractères, plus facile à deviner.");

// La solution liste les cases du chemin dans l’ordre des vendredis : la case de départ (ligne du bas) d’abord.
// La dernière case saute vers la sortie [0,0], qui ne fait pas partie de la liste.
let path;
try { path = JSON.parse(solutionTxt); } catch { fail("SOLUTION_JSON n'est pas du JSON valide."); }
// Règle de rotation : après un saut de k cases, toutes les flèches tournent de k × 45° (sens horaire),
// et la sortie ne s'ouvre que si l'on y arrive avec les flèches à +0°.
const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const DV = { N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1], S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1] };
const rot = (d, r) => DIRS[(DIRS.indexOf(d) + r) % 8];
if (!Array.isArray(path) || path.length !== fridays.length) fail(`il faut ${fridays.length} cases dans la solution (une par vendredi).`);
if (path[0][1] !== n - 1) fail("la première case doit être sur la ligne du bas.");
const steps = [...path, [0, 0]];
const jumpDirs = []; // direction réelle de chaque saut, une fois les flèches tournées : c'est la flèche publiée chaque vendredi
let r = 0;
for (let i = 0; i < path.length; i++) {
  const [fx, fy] = steps[i], [tx, ty] = steps[i + 1], d = rot(grid[fy][fx], r), [dx, dy] = DV[d];
  const k = dx ? (tx - fx) / dx : (ty - fy) / dy;
  if (!(k >= 1 && Number.isInteger(k) && fx + k * dx === tx && fy + k * dy === ty))
    fail(`saut impossible de [${fx},${fy}] vers [${tx},${ty}] (flèche tournée vers ${d}).`);
  jumpDirs.push(d);
  r = (r + k) % 8;
}
if (r !== 0) fail(`le chemin arrive à la sortie avec les flèches à +${r * 45}° : la sortie ne s'ouvre qu'à +0°.`);

// Chaque flèche sort le vendredi à 20 h 30, heure de Paris. BUILD_DATE ("2027-01-15" ou "2027-01-15 20:30") simule une date.
const RELEASE = "20:30";
const parisNow = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
};
const bd = process.env.BUILD_DATE;
const today = bd ? (bd.length === 10 ? bd + " 23:59" : bd) : parisNow();
const posted = fridays.filter((f) => `${f} ${RELEASE}` <= today).length;

const iter = 600000, salt = randomBytes(16), iv = randomBytes(12);
const key = pbkdf2Sync(password, salt, iter, 32, "sha256");
const cipher = createCipheriv("aes-256-gcm", key, iv);
const ct = Buffer.concat([cipher.update(JSON.stringify(path), "utf8"), cipher.final(), cipher.getAuthTag()]);

const data = {
  n, grid, fridays,
  revealed: jumpDirs.slice(0, posted), // seulement les directions, jamais les cases
  enc: { iter, salt: salt.toString("base64"), iv: iv.toString("base64"), ct: ct.toString("base64") },
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
  .replace("/*DATA*/null", () => JSON.stringify(data)));
console.log(`dist/index.html construit le ${today} : ${posted}/${fridays.length} flèches publiées` +
  (clarityId ? ", avec Clarity." : ", sans Clarity."));
