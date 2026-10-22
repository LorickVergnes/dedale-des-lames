# Le Dédale des Lames

Chaque vendredi à 20 h 30 (heure de Paris), une GitHub Action reconstruit la page et publie la flèche du jour.
La solution complète n'est jamais dans le dépôt : elle vient d'un secret, et la page n'en contient qu'une version chiffrée que seul le code prof permet d'ouvrir (bouton « Révéler la solution »).

## Mise en place (une seule fois)

1. **Settings → Secrets and variables → Actions → New repository secret**, créer :
   - `SOLUTION_JSON` : le contenu de `prive/solution.json` (le chemin, de la sortie vers le départ) ;
   - `REVEAL_PASSWORD` : le code prof (au moins 12 caractères, idéalement 4 ou 5 mots au hasard).
2. **Settings → Pages → Build and deployment → Source : GitHub Actions.**
3. **Actions → Publier le Dédale des Lames → Run workflow** pour la première publication.

## Statistiques (Microsoft Clarity, facultatif)

1. Créer un projet sur [clarity.microsoft.com](https://clarity.microsoft.com) et copier son **Project ID** (Settings → Overview).
2. Dans Clarity, **Settings → Setup → Cookies : désactivé**, et **Masking : Strict**.
3. Sur GitHub, **Settings → Secrets and variables → Actions → onglet Variables → New repository variable** : `CLARITY_ID` = le Project ID. Puis relancer l'Action.

Événements envoyés : `visite`, `depart`, `victoire`, `victoire_parfaite` (25 sauts, aucun retour, aucun nouveau départ), `victoire_rejouee`, `code_prof_faux`, `code_prof_ok`.
Étiquettes : `case_depart`, `departs`, `sauts_victoire`, `sauts_total`, `annulations`, `recommencements`, `duree_s`, `sans_erreur`, `fleches_publiees`, `prof`.

## Bon à savoir

- Le dossier `prive/` (ignoré par git) garde la version complète `dedale-des-lames-complet.html`, utilisable hors ligne.
- Pour tester en local : `node build.mjs` (lit `prive/solution.json` et `prive/mot-de-passe.txt`), puis ouvrir `dist/index.html`. `BUILD_DATE="2027-01-15 20:30"` simule une date et une heure.
- GitHub retarde parfois les tâches programmées de plusieurs heures (ou en saute). L’Action est donc relancée toutes les 15 minutes le vendredi soir, et une page restée ouverte affiche « Une nouvelle flèche vient d’être publiée » dès qu’elle est en ligne. La flèche n’apparaît jamais avant 20 h 30.
- En local, `dist/index.html` est figé au moment du `node build.mjs` : relancer la commande pour voir les nouvelles flèches.
- Sur un dépôt public, GitHub désactive les tâches programmées après 60 jours sans commit. GitHub prévient par e-mail ; il suffit de les réactiver dans l'onglet Actions (ou de faire un petit commit pendant les vacances).
