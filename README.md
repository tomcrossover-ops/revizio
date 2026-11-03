# Révizio

PWA de révision pour le collège (6e à 3e) : cartes mémoire à répétition espacée, quiz, cours générés d'après le programme, mode « Comprendre la leçon ».

## Fonctionnalités

- **Cours** : demandé par classe / matière / chapitre (IA) ou importé (photo, PDF, texte).
- **Cartes** : créées à la main (5 modèles, règles de validation, 200 caractères max au verso, découpage assisté par IA), générées par l'IA, ou importées en CSV. Cartes inversables (recto → verso et verso → recto).
- **Révision active** : recto seul, réflexion avant de révéler, 3 boutons (Je ne sais pas / Presque / Je sais), question bonus après une réussite, carte de remédiation après une erreur.
- **Répétition espacée** : « Je ne sais pas » = le jour même ; « Presque » = 2 jours ; « Je sais » = 7 jours, puis 21 jours, puis 2 mois (maîtrisée). Une carte ratée repart du début du cycle.
- **Organisation** : filtres matière / chapitre / étiquette / niveau (à revoir, en cours, maîtrisée), paquets, statistiques et série de jours.
- **Comprendre la leçon** : l'élève explique avec ses mots, comparaison aux mots-clés, cartes sur les manques, carte mentale.
- Données 100 % locales (localStorage), hors ligne, export/import JSON (complet) et CSV (cartes).
- IA : API Claude appelée depuis le navigateur avec la clé saisie dans les Réglages (stockée sur l'appareil uniquement).

## Structure

- `core.js` : données, migration, répétition espacée, CSV, prompts IA
- `cards.js` : révision, formulaire de carte, bibliothèque/paquets, « Comprendre la leçon »
- `app.js` : routeur, accueil, cours, quiz, réglages, mises à jour
- `sw.js` : service worker (hors ligne, mises à jour)

## Lancer en local

    python -m http.server 8080      # ou : npx serve

Puis ouvrir http://localhost:8080.

## Publier une nouvelle version

1. Modifier le code, puis changer le numéro de version aux **deux** endroits (ils doivent rester identiques) :
   - `APP_VERSION` dans `core.js`
   - `VERSION` dans `sw.js`
   Si tu ajoutes un fichier, l'ajouter aussi à `ASSETS` dans `sw.js`.
2. `git add . && git commit -m "..." && git push` : Vercel redéploie automatiquement.
3. Chez l'utilisateur, une bannière « Une nouvelle version est disponible » apparaît : un clic sur **Mettre à jour** l'active.
   Réglages > Mises à jour : « Rechercher une mise à jour » et « Forcer la mise à jour » (vide le cache, conserve cours, cartes et réglages).
