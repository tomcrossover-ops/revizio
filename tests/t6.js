const { make, check, done } = require('./harness');
(async () => {
  const mk = (i, o) => ({ id: 'c' + i, subject: 'maths', level: '6e', title: 'Cours ' + i, createdAt: i, summary: '', lesson: [], keyPoints: [], questions: [], scores: [], ...o });
  const store = { v: 2, settings: { apiKey: 'k', level: '6e' }, cards: [], decks: [], activity: { days: [] },
    courses: [mk(1, { mindmap: { center: 'Fractions', branches: [{ label: 'Types', children: ['a', 'b'] }] } }), mk(2, { subject: 'francais', level: '5e', title: 'Passé simple' }), mk(3), mk(4)] };
  const h = make({ store }); const { $, $$ } = h;
  await h.go('#/');
  check('2 raccourcis sur l\'accueil', $$('.shortcuts a').length === 2 && $$('.shortcuts a').map(a => a.getAttribute('href')).join() === '#/courses,#/library' && !/mentale|Comprendre/.test($('#app').textContent));
  check('compteurs', $('.shortcuts').textContent.includes('4 cours') && $('.shortcuts').textContent.includes('0 carte'));
  check('accueil : 3 derniers cours + tout voir', $$('a.course[href^="#/course"]').length === 3 && !!$$('a').find(a => a.getAttribute('href') === '#/courses' && a.textContent.includes('Tout voir')));
  await h.go('#/courses');
  check('bibliothèque : 4 cours', $$('#list a.course').length === 4);
  $('#fs').value = 'francais'; h.change($('#fs'));
  check('filtre matière', $$('#list a.course').length === 1);
  $('#fs').value = ''; h.change($('#fs')); $('#fl').value = '6e'; h.change($('#fl'));
  check('filtre classe', $$('#list a.course').length === 3);
  $('#fq').value = 'COURS 3'; h.input($('#fq'));
  check('recherche sans accent/casse', $$('#list a.course').length === 1);
  check('onglet Accueil actif', $('nav a.active').dataset.nav === 'home');
  const e = make({ store: { v: 2, settings: {}, courses: [], cards: [], decks: [], activity: { days: [] } } });
  await e.go('#/courses'); check('vide : message', e.$('#list').textContent.includes('Aucun cours'));
  check('aucune erreur JS', h.errors.length + e.errors.length === 0, h.errors.concat(e.errors).join('|'));
  done();
})();
