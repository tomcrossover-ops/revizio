const { make, check, done } = require('./harness');
(async () => {
  const mk = (id, t) => ({ id, subject: 'maths', level: '6e', origin: 'generated', title: id, createdAt: t, summary: '', lesson: [{ title: 'a', content: 'b', examples: [] }], keyPoints: [], questions: [], scores: [], skills: {}, mistakes: [], path: {} });
  const h = make({ store: { v: 2, settings: { level: '6e', apiKey: 'k' }, courses: [mk('A', 1000), mk('B', 2000), mk('C', 3000), mk('D', 4000)], cards: [], decks: [], activity: { days: [] } } });
  const T = h.t;
  await h.go('#/courses'); await h.wait(50);
  const home = () => h.$$('a[href^="#/course/"]').map(a => a.getAttribute('href').slice(9));
  check('accueil : plus récents d\'abord', home().slice(0, 3).join() === 'D,C,B', home().join());
  await h.go('#/course/A'); await h.wait(50);
  check('ouverture mémorisée', T.db.courses.find(c => c.id === 'A').lastOpened > 0);
  await h.go('#/courses'); await h.wait(50);
  check('« Derniers cours » : le cours ouvert passe en tête', home()[0] === 'A', home().join());
  check('l\'ordre de création n\'est pas modifié', T.db.courses.find(c => c.id === 'A').createdAt === 1000);
  // variantes acceptées
  const ok = (mine, answer, type = 'trous', accept = []) => T.sameAnswer(mine, { type, answer, accept });
  check('casse et accents', ok('ÉQUATEUR', 'equateur'));
  check('pluriel en s', ok('planètes', 'planète'));
  check('singulier pour pluriel', ok('planète', 'planètes'));
  check('faute de frappe sur un mot long', ok('photosyntese', 'photosynthèse') && ok('equatuer', 'équateur'));
  check('lettre en trop / manquante', ok('hémisphèere', 'hémisphère'));
  check('mot court : pas de tolérance', !ok('mais', 'mai') && !ok('lac', 'lit'));
  check('nombres : exacts', !ok('12', '13') && !ok('120', '12') && ok('12', '12'));
  check('deux fautes : refusé', !ok('photosintese', 'photosynthèse'));
  check('autre mot long : refusé', !ok('hémisphère', 'hypothèse') && !ok('atmosphère', 'astrosphère'));
  // doublons
  const qs = T.normQuestions([
    { type: 'qcm', q: 'Capitale ?', choices: ['Paris', 'Rome', 'Oslo'], answer: 0 }, { type: 'qcm', q: 'capitale ?', choices: ['paris', 'rome', 'oslo'], answer: 0 },
    { type: 'qcm', q: 'Capitale ?', choices: ['Lyon', 'Rome', 'Oslo'], answer: 1 },
    { type: 'calcul', q: '2+2', answer: '4' }, { type: 'calcul', q: '2×2', answer: '4' }, { type: 'calcul', q: '2+2', answer: '4' }]);
  check('questions identiques fusionnées, variantes conservées', qs.length === 4, qs.length);
  const cs = T.normCards([{ q: 'Aire du carré ?', a: 'c × c' }, { q: 'aire du carré ?', a: 'C × C' }, { q: 'Aire du carré ?', a: 'côté au carré' }], { subject: 'maths', chapter: 'x', courseId: 'z' });
  check('cartes identiques fusionnées', cs.length === 2, cs.length);
  done();
})();
