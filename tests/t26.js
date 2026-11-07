const { make, check, done } = require('./harness');
const fs = require('fs');
const P = __dirname + '/../packs/', pack = n => JSON.parse(fs.readFileSync(P + n, 'utf8'));
const store = () => ({ v: 2, settings: { level: '5e', apiKey: '', name: 'Léo' }, courses: [], cards: [], decks: [], activity: { days: [] } });
(async () => {
  const h = make({ store: store() }), T = h.t;
  T.importPack(pack('5e-maths.json'));
  const c = T.db.courses[0];
  check('chapitre neuf : découverte', T.courseMastery(c) === 'decouverte');
  c.scores.push({ date: Date.now(), score: 15, total: 15, mode: 'full' });
  check('bilan 100 % sans autre étape : maîtrisé', T.courseMastery(c) === 'maitrise');
  c.scores.push({ date: Date.now(), score: 14, total: 15, mode: 'full' });
  check('dernier bilan à 14/15 : pas validé automatiquement', T.courseMastery(c) !== 'maitrise');
  c.scores.push({ date: Date.now(), score: 3, total: 3, mode: 'full' });
  check('bilan trop court (3 questions) : pas validé', T.courseMastery(c) !== 'maitrise');
  check('aucune erreur JS', h.errors.length === 0, h.errors.join('|'));
  done();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
