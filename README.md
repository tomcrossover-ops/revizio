# Révizio

PWA de révision pour le collège : import d'un cours (photo, PDF ou texte), fiche de synthèse, cartes mémoire à révision espacée, quiz et suivi par matière.

- Données 100 % locales (localStorage), export/import JSON dans les Réglages.
- Génération par l'API Claude, appelée directement depuis le navigateur avec la clé saisie dans les Réglages (stockée uniquement sur l'appareil).

## Lancer en local

    cd Revizio
    python -m http.server 8080      # ou : npx serve

Puis ouvrir http://localhost:8080.

## Installer sur téléphone / tablette

L'installation PWA demande du HTTPS : déployer le dossier tel quel (site statique) sur Vercel, puis « Ajouter à l'écran d'accueil ».

## Publier une nouvelle version

1. Modifier le code, puis changer le numéro de version aux **deux** endroits (ils doivent rester identiques) :
   - `APP_VERSION` dans `app.js`
   - `VERSION` dans `sw.js`
2. `git add . && git commit -m "..." && git push` (ou redéployer sur Vercel).
3. Chez l'utilisateur, une bannière « Une nouvelle version est disponible » apparaît : un clic sur **Mettre à jour** active la nouvelle version.
   - Réglages > Mises à jour : « Rechercher une mise à jour » et « Forcer la mise à jour » (vide le cache, conserve les cours et réglages).
