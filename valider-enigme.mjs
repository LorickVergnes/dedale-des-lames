// Marque une énigme comme trouvée dans enigmes-trouvees.json (lancé par l'Action « Publier », bouton Run workflow).
// Entrées : ENIGME (numéro), QUAND (« AAAA-MM-JJ HH:MM », heure de Paris, facultatif : maintenant).
// Le numéro est vérifié avec ENIGMES_JSON (ou prive/enigmes.json) s'il est disponible.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { parisNow, lireTrouvees, lireEnigmes, dateDeSortie, FICHIER_TROUVEES, DATE_RE, SORTIE } from "./enigmes.mjs";

const fail = (msg) => { console.error("Erreur : " + msg); process.exit(1); };
const num = (process.env.ENIGME || "").trim();
const quand = (process.env.QUAND || "").trim() || parisNow();
if (!/^[1-9]\d*$/.test(num)) fail(`numéro d'énigme invalide : « ${num} ».`);
if (!DATE_RE.test(quand)) fail(`date invalide : « ${quand} » (format AAAA-MM-JJ HH:MM, heure de Paris).`);

let trouvees;
try { trouvees = lireTrouvees(); } catch (e) { fail(e.message); }
const n = Number(num);
const txt = (process.env.ENIGMES_JSON || "").trim() || (existsSync("prive/enigmes.json") ? readFileSync("prive/enigmes.json", "utf8") : "");
if (txt) {
  let total;
  try { total = lireEnigmes(txt.replace(/^﻿/, "")).length; } catch (e) { fail(e.message); }
  if (n > total) fail(`il n'y a que ${total} énigmes.`);
}
if (trouvees[num]) fail(`l'énigme ${n} est déjà marquée trouvée (le ${trouvees[num].le}). Pour corriger, modifier ${FICHIER_TROUVEES}.`);
if (n > 1 && !trouvees[String(n - 1)]) fail(`l'énigme ${n - 1} n'est pas encore trouvée : l'énigme ${n} ne peut pas l'être avant.`);
const sortie = dateDeSortie(n - 1, trouvees, JSON.parse(readFileSync("dedale.json", "utf8")).fridays);
if (!sortie || quand < `${sortie} ${SORTIE}`)
  fail(`l'énigme ${n} n'était pas encore sortie le ${quand}${sortie ? ` (elle sort le ${sortie} à ${SORTIE})` : ""}.`);

trouvees[num] = { le: quand };
const trie = Object.fromEntries(Object.entries(trouvees).sort((a, b) => Number(a[0]) - Number(b[0])));
writeFileSync(FICHIER_TROUVEES, JSON.stringify(trie, null, 2) + "\n");
console.log(`Énigme ${n} marquée trouvée le ${quand}.`);
