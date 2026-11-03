/* Révizio — thèmes visuels et petits textes d'ambiance.
   « Système » : fenêtres bleu néon, niveaux et rangs façon jeu de chasseurs (inspiration générale, aucun personnage ni nom d'œuvre).
   « Anime »   : manga coloré, contours épais, rose et jaune.
   « Parchemin » : l'ancien thème de magie. */
'use strict';

const THEMES = {
  systeme: {
    label: '⚔️ Système — néon bleu, niveaux et rangs', color: '#060a14',
    txt: {
      hello_new: 'Bienvenue, nouveau chasseur', session_btn: 'Lancer la quête', daily_title: 'Entraînement du jour', gen_btn: 'Lancer la génération',
      gen_wait: 'Génération en cours…', gen_done: '✔ Cours généré', badges_title: 'Succès', status_title: 'Fiche du chasseur', quest_title: 'Quête quotidienne',
      title_name: 'Chasseur de savoir', session_end: 'Quête terminée',
    },
    badges: ['Régulier', 'Infatigable', 'Mémoire de fer', 'Archiviste', 'Maître de la mémoire', 'Sans faute', 'Donjon terminé', 'Chasseur de rang'],
  },
  anime: {
    label: '🌸 Anime — manga coloré', color: '#ff7eb6',
    txt: {
      hello_new: 'Bienvenue sur Révizio', session_btn: 'C\'est parti !', daily_title: 'Séance du jour', gen_btn: 'Créer mon cours',
      gen_wait: 'Ça arrive…', gen_done: '✔ Cours prêt', badges_title: 'Médailles', status_title: 'Ma fiche héros', quest_title: 'Défi du jour',
      title_name: 'Héros en progression', session_end: 'Séance terminée',
    },
    badges: ['Motivé', 'Inarrêtable', 'Super mémoire', 'Grand collectionneur', 'Légende', 'Perfect !', 'Chapitre bouclé', 'Diplômé'],
  },
  parchemin: {
    label: '📜 Parchemin — magie', color: '#3b1d5e',
    txt: {
      hello_new: 'Bienvenue à l\'Académie Révizio', session_btn: 'Lancer la séance', daily_title: 'Ma séance du jour', gen_btn: 'Écrire mon grimoire',
      gen_wait: 'Le grimoire s\'écrit…', gen_done: '✨ Grimoire prêt', badges_title: 'Distinctions', status_title: 'Ma fiche d\'apprenti', quest_title: 'Défi du jour',
      title_name: 'Apprenti sorcier', session_end: 'Séance terminée',
    },
    badges: ['Apprenti assidu', 'Sorcier assidu', 'Premier parchemin', 'Bibliothèque ensorcelée', 'Archimage', 'Sortilège parfait', 'Épreuve réussie', 'Diplôme de magie'],
  },
};
const DEFAULT_THEME = 'systeme';
const themeOf = () => THEMES[db.settings.theme] || THEMES[DEFAULT_THEME];
const tx = key => themeOf().txt[key] || key;

function applyTheme() {
  const id = THEMES[db.settings.theme] ? db.settings.theme : DEFAULT_THEME;
  document.documentElement.dataset.theme = id;
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', THEMES[id].color);
}
applyTheme();
