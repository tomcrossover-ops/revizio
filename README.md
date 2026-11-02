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
