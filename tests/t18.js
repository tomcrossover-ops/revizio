const { make, check, done } = require('./harness');
(async () => {
  const h = make({ store: { v: 2, settings: { level: '6e', apiKey: 'k', name: 'Léo' }, courses: [], cards: [], decks: [], activity: { days: [] } } });
  const T = h.t;
  await h.go('#/settings'); await h.wait(80);
  const labelled = el => el.hasAttribute('aria-label') || (el.labels && el.labels.length > 0) || el.type === 'hidden';
  const bad = h.$$('#app input, #app select, #app textarea').filter(e => !labelled(e));
  check('réglages : tous les champs ont un nom accessible', bad.length === 0, bad.map(e => e.id || e.tagName).join());
  check('lien d\'évitement présent', !!h.$('a.skip'));
  check('zone principale sans aria-live global', !h.$('#app').hasAttribute('aria-live') && h.$('#app').tabIndex === -1);
  check('page courante signalée dans le menu', h.$('nav a[aria-current="page"]') && h.$('nav a[aria-current="page"]').dataset.nav === 'settings');
  check('titre de l\'onglet mis à jour', /Révizio$/.test(h.w.document.title) && h.w.document.title !== 'Révizio', h.w.document.title);
  check('toast annoncé aux lecteurs d\'écran', h.$('#toast').getAttribute('role') === 'status');
  await h.go('#/library'); await h.wait(80);
  const bad2 = h.$$('#app input, #app select, #app textarea').filter(e => !labelled(e));
  check('cartes : tous les champs ont un nom accessible', bad2.length === 0, bad2.map(e => e.id || e.tagName).join());
  // QCM : le résultat n'est pas signalé par la seule couleur
  const body = h.w.document.createElement('div'); h.w.document.body.appendChild(body);
  let res; T.renderExercise({ type: 'qcm', q: 'Q ?', choices: ['a', 'b', 'c'], answer: 1, explanation: '' }, body, ok => { res = ok; });
  body.querySelector('.choice[data-k="0"]').click();
  check('QCM : bonne réponse annoncée en texte', /bonne réponse/.test(body.querySelector('.choice.good').textContent));
  check('QCM : mauvaise réponse annoncée en texte', /incorrecte/.test(body.querySelector('.choice.bad').textContent));
  done();
})();
