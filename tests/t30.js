const { make, check, done } = require('./harness');
(async () => {
  const q = { type: 'qcm', q: 'Question bizarre', choices: ['a', 'b'], answer: 0, explanation: 'Parce que.', skill: 'S' };
  const h = make({ store: { v: 2, settings: {}, courses: [{ id: 'c', subject: 'maths', title: 'Cours X', createdAt: 1, questions: [q], cards: [], scores: [], skills: {}, mistakes: [], path: {} }], cards: [], decks: [], activity: { days: [] } } });
  const body = h.w.document.createElement('div'); h.w.document.body.appendChild(body);
  h.t.renderExercise(q, body, () => {});
  [...body.querySelectorAll('.choice')][0].click(); await h.wait(30);
  const b = body.querySelector('.reportbtn');
  check('bouton « Signaler une erreur » après la réponse', !!b);
  b.click();
  const r = h.t.db.settings.reports;
  check('signalement enregistré avec cours et réponse', r.length === 1 && r[0].q === 'Question bizarre' && r[0].course === 'Cours X' && r[0].subject === 'maths');
  check('bouton désactivé (pas de doublon)', body.querySelector('.reportbtn').disabled);
  await h.go('#/settings'); check('Réglages : liste des erreurs signalées', /Erreurs signalées/.test(h.$('#app').textContent) && !!h.$('#repCopy'));
  check('sauvegarde : les signalements sont inclus', h.t.backupData().settings.reports.length === 1);
  done();
})();
