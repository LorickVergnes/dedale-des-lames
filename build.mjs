// Construit dist/index.html à partir de index.html + dedale.json (Le Dédale des Lames).
// La solution (SOLUTION_JSON) et le code prof (REVEAL_PASSWORD) viennent des secrets GitHub,
// ou en local des fichiers prive/solution.json et prive/mot-de-passe.txt.
// Les flèches sont postées du départ vers la sortie ; seules celles dont la date est passée
// (heure de Paris) sont publiées en clair, la solution complète est chiffrée (AES-256-GCM, clé dérivée du code par PBKDF2).
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

// post[0] est la sortie, post[25] la case de départ sur la ligne du bas.
let post;
try { post = JSON.parse(solutionTxt); } catch { fail("SOLUTION_JSON n'est pas du JSON valide."); }
const DV = { N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1], S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1] };
if (!Array.isArray(post) || post.length !== fridays.length) fail(`il faut ${fridays.length} cases dans la solution.`);
if (post[0][0] !== 0 || post[0][1] !== 0) fail("la première case doit être la sortie [0,0].");
if (post.at(-1)[1] !== n - 1) fail("la dernière case doit être sur la ligne du bas.");
for (let i = post.length - 1; i > 0; i--) {
  const [fx, fy] = post[i], [tx, ty] = post[i - 1], [dx, dy] = DV[grid[fy][fx]];
  const k = dx ? (tx - fx) / dx : (ty - fy) / dy;
  if (!(k >= 1 && Number.isInteger(k) && fx + k * dx === tx && fy + k * dy === ty))
    fail(`saut impossible de [${fx},${fy}] vers [${tx},${ty}].`);
}

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
const path = post.slice().reverse(); // départ → sortie, dans l’ordre des vendredis

const iter = 600000, salt = randomBytes(16), iv = randomBytes(12);
const key = pbkdf2Sync(password, salt, iter, 32, "sha256");
const cipher = createCipheriv("aes-256-gcm", key, iv);
const ct = Buffer.concat([cipher.update(JSON.stringify(path), "utf8"), cipher.final(), cipher.getAuthTag()]);

const data = {
  n, grid, fridays,
  revealed: path.slice(0, posted),
  enc: { iter, salt: salt.toString("base64"), iv: iv.toString("base64"), ct: ct.toString("base64") },
};
const html = readFileSync("index.html", "utf8");
if (!html.includes("/*DATA*/null")) fail("marqueur /*DATA*/null introuvable dans index.html.");
mkdirSync("dist", { recursive: true });
writeFileSync("dist/index.html", html.replace("/*DATA*/null", () => JSON.stringify(data)));
console.log(`dist/index.html construit le ${today} : ${posted}/${fridays.length} flèches publiées.`);
