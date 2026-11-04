# Packs de contenu Révizio

Chaque fichier `.json` contient des chapitres déjà rédigés (leçon, cartes, exercices). Les importer ne coûte aucun appel à l'IA.
`index.json` liste les packs proposés dans l'appli. Un pack peut aussi être importé à la main : Réglages → « Importer un fichier de cours ».

L'import fusionne : un chapitre déjà présent (même classe, matière et titre) est ignoré, rien n'est écrasé.

```json
{ "format": "revizio-pack", "version": 1, "courses": [
  { "level": "6e", "subject": "maths", "catalogTitle": "Fractions", "title": "Fractions",
    "summary": "…", "duration": 25, "objectives": ["…"], "prerequisites": ["…"], "pitfalls": ["…"],
    "lesson": [ { "title": "…", "content": "…", "examples": ["…"] } ],
    "keyPoints": ["…"],
    "cards": [ { "q": "…", "a": "…", "explain": "…" } ],
    "questions": [ { "type": "qcm|vf|short|trous|calcul|assoc|ordre", "q": "…", "…": "voir l'appli" } ] } ] }
```
Matières : maths, francais, histgeo, svt, physique, langues, techno. Classes : CM1, CM2, 6e, 5e, 4e, 3e.
