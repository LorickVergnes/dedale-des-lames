// Outils communs aux énigmes du Dédale (build.mjs et valider-enigme.mjs).
import { readFileSync, existsSync } from "node:fs";

// Mise en forme d'une réponse avant comparaison : minuscules, sans accents ni ponctuation, sans article au début
// (« le », « la », « l’ »…), sans « s » final à chaque mot, puis mots collés. Ex. « L’Alternance » → « alternance »,
// « 2ème Croix » → « 2emecroix », « Forme 1 » → « forme1 ».
// La même fonction existe dans index.html (norm) : les deux doivent rester identiques.
const ARTICLES = new Set(["le", "la", "les", "l", "un", "une", "des", "du", "de", "d"]);
export function normaliser(s) {
  const mots = String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/œ/g, "oe").replace(/æ/g, "ae").split(/[^a-z0-9]+/).filter(Boolean);
  if (mots.length > 1 && ARTICLES.has(mots[0])) mots.shift();
  return mots.map((m) => (m.length > 3 && m.endsWith("s") ? m.slice(0, -1) : m)).join("");
}

// Heure de Paris au format « AAAA-MM-JJ HH:MM ».
export function parisNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

// Énigmes trouvées (fichier public, versionné) : { "1": { "le": "2026-11-22 14:05" }, … }
export const FICHIER_TROUVEES = "enigmes-trouvees.json";
export const DATE_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
export function lireTrouvees() {
  if (!existsSync(FICHIER_TROUVEES)) return {};
  const t = JSON.parse(readFileSync(FICHIER_TROUVEES, "utf8").replace(/^﻿/, ""));
  for (const [n, v] of Object.entries(t)) {
    if (!/^[1-9]\d*$/.test(n) || !v || !DATE_RE.test(v.le || ""))
      throw new Error(`${FICHIER_TROUVEES} : entrée « ${n} » invalide (il faut { "le": "AAAA-MM-JJ HH:MM" }).`);
  }
  return t;
}

// Énigmes privées (secret ENIGMES_JSON ou prive/enigmes.json) : { "enigmes": [ { texte, mot, reponses }, … ] }
export function lireEnigmes(txt) {
  const e = JSON.parse(txt).enigmes;
  if (!Array.isArray(e) || !e.length) throw new Error("ENIGMES_JSON doit contenir { \"enigmes\": [ … ] }.");
  e.forEach((x, i) => {
    if (!x || typeof x.texte !== "string" || !Array.isArray(x.reponses) || !x.reponses.length)
      throw new Error(`énigme ${i + 1} : il faut « texte » et « reponses » (liste).`);
    if (x.reponses.some((r) => !normaliser(r))) throw new Error(`énigme ${i + 1} : une réponse est vide une fois mise en forme.`);
  });
  return e;
}

// Une énigme (à partir de la 2e) sort le premier vendredi de cours à 20 h 30 qui suit la découverte de la précédente.
// La 1re sort le premier vendredi. Renvoie « AAAA-MM-JJ » ou null (précédente pas encore trouvée, ou plus de vendredi).
export const SORTIE = "20:30";
export function dateDeSortie(i, trouvees, fridays) {
  if (i === 0) return fridays[0];
  const prec = trouvees[String(i)];
  if (!prec) return null;
  return fridays.find((f) => `${f} ${SORTIE}` > prec.le) || null;
}
