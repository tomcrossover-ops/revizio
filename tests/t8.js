const { make, check, done } = require('./harness');
(async () => {
  const resp = { title: 'Fractions', summary: 's', duration: 9, objectives: ['Savoir comparer'], prerequisites: [], pitfalls: ['A → B'], lesson: [{ title: 'T', content: '- a', examples: [] }], keyPoints: ['k'],
    cards: [{ q: 'Une fraction ?', a: 'Un quotient', explain: '', tag: 'definition', reversible: false }],
    questions: [{ type: 'qcm', q: 'x ?', choices: ['a', 'b', 'c', 'd'], answer: 0, explanation: 'e', skill: 'Comparer', pitfall: 'p' }] };
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(resp) }] }) });
  const h = make({ store: { v: 2, settings: { apiKey: 'k', level: '6e' }, courses: [], cards: [], decks: [], activity: { days: [] } }, fetchImpl });
  await h.go('#/new'); h.submit(h.$('#f')); await h.wait(300);
  const c = h.t.db.courses[0];
  check('génération : extras enregistrés', c && c.duration === 9 && c.objectives[0] === 'Savoir comparer' && c.pitfalls.length === 1 && c.questions[0].skill === 'Comparer' && c.questions[0].pitfall === 'p', JSON.stringify(c));
  check('chapitre généré : durée affichée', h.$('#app').textContent.includes('9 min'));
  await h.go('#/course/' + c.id + '/lesson'); check('leçon : erreurs fréquentes', h.$('#app').textContent.includes('Erreurs fréquentes'));
  done();
})();
