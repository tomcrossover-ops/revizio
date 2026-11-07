const { make, check, done } = require('./harness');
(async () => {
  const course = (id, subject) => ({ id, subject, level: '6e', title: 'Cours ' + id, createdAt: 1, lastOpened: id === 'b' ? 50 : 10, summary: 's', lesson: [], keyPoints: [], questions: [], scores: [], skills: {}, mistakes: [], path: {} });
  const card = i => ({ id: 'k' + i, subject: 'maths', front: 'q', back: 'a', tag: 'definition', createdAt: 1, fwd: { step: 0, due: '2000-01-01', lapses: 0 }, rev: null });
  const mk = o => make({ store: Object.assign({ v: 2, settings: { name: 'Léo', level: '6e', profileDone: true, lastBackup: Date.now() }, courses: [], cards: [], decks: [], activity: { days: [] } }, o) });
  // 1) rien du tout : choisir une matière
  let h = mk({}); await h.go('#/');
  check('Continuer : rien → « Choisir une matière »', /Choisir une matière/.test(h.$('.go').textContent) && h.$('.go').getAttribute('href') === '#/revise');
  check('accueil : un seul bandeau au maximum', h.$$('.banner').length === 0);
  // 2) cours existants non maîtrisés : reprendre le plus récent
  h = mk({ courses: [course('a', 'maths'), course('b', 'francais')] }); await h.go('#/');
  check('Continuer : reprendre le dernier chapitre ouvert', /Reprendre/.test(h.$('.go').textContent) && h.$('.go').getAttribute('href') === '#/course/b' && /Cours b/.test(h.$('.go').textContent), h.$('.go').textContent);
  // 3) cartes dues : prioritaire
  h = mk({ courses: [course('a', 'maths')], cards: [card(1), card(2)] }); await h.go('#/');
  check('Continuer : cartes dues en premier', /Réviser 2 cartes/.test(h.$('.go').textContent) && h.$('.go').getAttribute('href') === '#/review');
  // 4) emploi du temps : matières du programme en haut, les autres repliées
  h = mk({ settings: { name: 'Léo', level: '6e', profileDone: true, lastBackup: Date.now(), schedule: { 1: ['maths', 'francais'], 2: ['svt'] } } }); await h.go('#/');
  const main = h.$$('#app > .subjgrid a').length, other = h.$$('details.others a').length;
  check('accueil : matières de l\'emploi du temps visibles, autres repliées', main === 3 && other >= 5 && !!h.$('details.others summary'), main + '/' + other);
  // 5) bandeaux : profil d'abord, un seul, fermable
  h = mk({ settings: { name: 'Léo', level: '6e', profileDone: false } }); await h.go('#/');
  check('bandeau : profil seul (la sauvegarde attend)', h.$$('.banner').length === 1 && !!h.$('#pf'));
  h.$('#pfLater').click(); await h.wait(30);
  check('bandeau profil : ✕ le masque et le repousse', !h.$('#pf') && h.t.db.settings.profileSnooze > Date.now());
  // 6) page Progrès + page Réviser
  h = mk({ courses: [course('a', 'maths')], cards: [card(1)] }); await h.go('#/progress');
  check('Progrès : fiche, 4 chiffres, médailles', !!h.$('.status') && h.$$('.stat').length === 4 && h.$$('.badge').length === 8);
  check('onglet Progrès actif', h.$('.tabbar a.active').dataset.nav === 'progress');
  await h.go('#/revise');
  check('Réviser : onglet actif + toutes les matières (11)', h.$('.tabbar a.active').dataset.nav === 'revise' && h.$$('.subjgrid a').length === 11);
  await h.go('#/subject/maths'); check('matière : onglet Réviser reste actif', h.$('.tabbar a.active').dataset.nav === 'revise');
  await h.go('#/course/a'); check('cours : onglet Cours actif', h.$('.tabbar a.active').dataset.nav === 'courses');
  await h.go('#/settings'); check('réglages : onglet actif', h.$('.tabbar a.active').dataset.nav === 'settings');
  // 7) accueil court : pas de stats, médailles, paquets ni liste de cours
  await h.go('#/'); check('accueil allégé : ni médailles, ni stats, ni quête, ni liste de cours', !h.$('.badges') && !h.$('.stat') && !h.$('.quest') && !h.$('a.course'));
  // 8) pendant un exercice : barre d'onglets masquée
  h.t.db.courses[0].questions = Array.from({ length: 8 }, (_, i) => ({ id: 'q' + i, type: 'qcm', q: 'Q' + i, choices: ['a', 'b'], answer: 0, explanation: 'Parce que.', skill: 'S' })); await h.go('#/quiz/a'); await h.wait(30); check('exercice : mode concentré', h.w.document.body.classList.contains('focus'));
  done();
})();
