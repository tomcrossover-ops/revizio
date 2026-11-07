const { make, check, done } = require('./harness');
const fs = require('fs');
const P = __dirname + '/../packs/', pack = n => JSON.parse(fs.readFileSync(P + n, 'utf8'));
const store = () => ({ v: 2, settings: { level: '5e', apiKey: '', name: 'Léo' }, courses: [], cards: [], decks: [], activity: { days: [] } });
(async () => {
  const h = make({ store: store() }), T = h.t;
  // clé de doublon
  const a = { type: 'short', q: 'Combien font 2 + 2 ?', answer: '4' }, b = { ...a, q: 'combien font 2+2' };
  const au1 = { type: 'qcm', q: 'Écoute, puis choisis le sens.', audio: 'Buenos días' }, au2 = { type: 'trous', q: 'Écoute, puis écris.', audio: 'Buenos días.' };
  check('doublon : même énoncé ou même audio', T.uniqueQs([a, { ...a }, au1, au2, { ...au1, audio: 'Gracias' }]).length === 3);
  check('doublon : énoncés différents conservés', T.uniqueQs([a, { ...a, q: 'Combien font 3 + 3 ?' }]).length === 2);
  check('doublon : associations différentes conservées', T.uniqueQs([{ type: 'assoc', q: 'Relie.', pairs: [['a', 'b']] }, { type: 'assoc', q: 'Relie.', pairs: [['c', 'd']] }]).length === 2);
  // séries tirées d'un chapitre où l'on force un doublon
  T.importPack(pack('5e-maths.json'));
  const c = T.db.courses[0];
  const q0 = c.questions.find(q => !q.audio);
  c.questions.push({ ...q0, id: 'dup-1' }, { ...q0, id: 'dup-2' });
  const key = T.qKey(q0);
  let worst = 0;
  for (let i = 0; i < 40; i++) {
    const t = T.pickTrain(c, 8), n = t.filter(q => T.qKey(q) === key).length; worst = Math.max(worst, n);
    const s = T.pickExercises(10).filter(x => T.qKey(x.q) === key).length; worst = Math.max(worst, s);
  }
  check('entraînement et séance : jamais deux fois la même question', worst <= 1, worst);
  const keys = T.pickExercises(30).map(x => T.qKey(x.q));
  check('séance : aucune clé en double', new Set(keys).size === keys.length);
  // aucun doublon exact dans les packs fournis
  let dup = 0; const ex = [];
  fs.readdirSync(P).filter(f => /^(CM|\d)/.test(f)).forEach(f => pack(f).courses.forEach(co => { const s = new Set(); co.questions.filter(q => !q.audio && q.type !== 'repete').forEach(q => { const k = T.qKey(q); if (s.has(k)) { dup++; ex.push(f + ': ' + q.q); } s.add(k); }); }));
  check('packs : aucun doublon dans un chapitre', dup === 0, ex.slice(0, 3).join(' | '));
  // association sans texte répété
  let rep = 0; fs.readdirSync(P).filter(f => /^(CM|\d)/.test(f)).forEach(f => pack(f).courses.forEach(co => co.questions.forEach(q => { if (q.type === 'assoc') { const all = q.pairs.flat().map(x => String(x).toLowerCase()); if (new Set(all).size !== all.length) rep++; } if (q.type === 'qcm' && new Set(q.choices.map(x => String(x))).size !== q.choices.length) rep++; })));
  check('packs : pas de texte répété dans un QCM ou une association', rep === 0, rep);
  check('aucune erreur JS', h.errors.length === 0, h.errors.join('|'));
  done();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
