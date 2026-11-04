# Tests Révizio
Tests sans navigateur (jsdom). Ils ne font aucun appel réseau ni aucun appel à l'IA.

    cd tests
    npm install
    npm test

`t14` vérifie tous les packs (titres dans le catalogue, aucune question perdue, au moins 8 cartes, 8 questions et 3 types par chapitre).
Ces fichiers ne sont pas nécessaires au fonctionnement du site : ils sont exclus du déploiement (`.vercelignore`).
