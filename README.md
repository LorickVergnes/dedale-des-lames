# Le Dédale des Lames

Chaque vendredi à 20 h 30 (heure de Paris), une GitHub Action reconstruit la page et publie la flèche du jour.
La solution complète n'est jamais dans le dépôt : elle vient d'un secret, et la page n'en contient qu'une version chiffrée que seul le code prof permet d'ouvrir (bouton « Révéler la solution »).

## Mise en place (une seule fois)

1. **Settings → Secrets and variables → Actions → New repository secret**, créer :
   - `SOLUTION_JSON` : le contenu de `prive/solution.json` (le chemin, de la sortie vers le départ) ;
   - `REVEAL_PASSWORD` : le code prof (au moins 12 caractères, idéalement 4 ou 5 mots au hasard).
2. **Settings → Pages → Build and deployment → Source : GitHub Actions.**
3. **Actions → Publier le Dédale des Lames → Run workflow** pour la première publication.

## Bon à savoir

- Le dossier `prive/` (ignoré par git) garde la version complète `dedale-des-lames-complet.html`, utilisable hors ligne.
- Pour tester en local : `node build.mjs` (lit `prive/solution.json` et `prive/mot-de-passe.txt`), puis ouvrir `dist/index.html`. `BUILD_DATE="2027-01-15 20:30"` simule une date et une heure.
- GitHub lance parfois les tâches programmées avec quelques minutes de retard : la flèche peut apparaître un peu après 20 h 30, jamais avant.
- Sur un dépôt public, GitHub désactive les tâches programmées après 60 jours sans commit. GitHub prévient par e-mail ; il suffit de les réactiver dans l'onglet Actions (ou de faire un petit commit pendant les vacances).
