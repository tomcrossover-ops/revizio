const { make, check, done } = require('./harness');
const fs = require('fs');
const P = __dirname + '/../packs/', pack = n => JSON.parse(fs.readFileSync(P + n, 'utf8'));
const fetchImpl = async u => { const f = P + String(u).replace(/^packs\//, ''); if (!fs.existsSync(f)) return { ok: false }; const j = JSON.parse(fs.readFileSync(f, 'utf8')); return { ok: true, json: async () => j }; };
const store = () => ({ v: 2, settings: { level: '5e', apiKey: '', name: 'Léo' }, courses: [], cards: [], decks: [], activity: { days: [] } });
(async () => {
  // les packs fournis ne contiennent plus d'explication courte (hors audio) pour les matières réécrites
  const REWRITTEN = ['maths', 'francais', 'histgeo', 'physique', 'techno', 'svt', 'langues', 'italien', 'vietnamien', 'espagnol'];
  let short = 0, tot = 0;
  fs.readdirSync(P).filter(f => /^(CM|\d)/.test(f)).forEach(f => pack(f).courses.forEach(c => { if (!REWRITTEN.includes(c.subject)) return; c.questions.forEach(q => { if (q.audio) return; tot++; if (!q.explanation || String(q.explanation).length < 15) short++; }); }));
  check('toutes matières : plus aucune explication courte dans les packs', tot > 400 && short === 0, short + '/' + tot);
  const co = JSON.parse(fs.readFileSync(P + 'corrections.json', 'utf8'));
  check('lots déclarés', co.batches && co.batches.some(b => b.id === 'v317-expl-maths' && b.file === 'fixes-expl-maths.json'));
  // ancien chapitre déjà importé : explications courtes → remplacées, texte de l'énoncé et identifiants conservés
  const h = make({ store: store(), fetchImpl }), T = h.t;
  await h.wait(80); T.importPack(pack('4e-maths.json'));
  const ids = {}; let nshort = 0;
  T.db.courses.forEach(c => c.questions.forEach(q => { ids[q.id] = q.q; if (!q.audio) { q.explanation = 'Voir cours.'; nshort++; } }));
  T.db.settings.fixesDone = [];
  const n = await T.applyCorrections();
  let still = 0, kept = true;
  T.db.courses.forEach(c => c.questions.forEach(q => { if (!q.audio && String(q.explanation) === 'Voir cours.') still++; if (ids[q.id] !== q.q) kept = false; }));
  check('lot : explications appliquées aux chapitres existants', n > 0 && still < nshort, n + ' appliquées, ' + still + ' restantes sur ' + nshort);
  check('lot : identifiants et énoncés conservés', kept);
  check('lot : marqué fait, non rejoué', T.db.settings.fixesDone.includes('v317-expl-maths') && (await T.applyCorrections()) === 0);
  // une explication déjà riche n'est jamais écrasée
  const h2 = make({ store: store(), fetchImpl }), T2 = h2.t;
  await h2.wait(80); T2.importPack(pack('4e-maths.json'));
  const q0 = T2.db.courses[0].questions.find(q => !q.audio); q0.explanation = 'Mon explication personnelle, très détaillée.';
  T2.db.settings.fixesDone = []; await T2.applyCorrections();
  check('lot : explication riche préservée', q0.explanation === 'Mon explication personnelle, très détaillée.');
  // nouveaux choix de QCM : appliqués aux chapitres déjà importés, bonne réponse cohérente
  const h3 = make({ store: store(), fetchImpl }), T3 = h3.t;
  await h3.wait(80); T3.importPack(pack('4e-svt.json'));
  const fc = pack('fixes-choices.json').items.find(i => i.level === '4e' && i.subject === 'svt');
  const cq = T3.db.courses.find(c => c.catalogTitle === fc.catalogTitle).questions.find(q => q.q === fc.match);
  cq.choices = ['a', 'b', 'c', 'd']; cq.answer = 3; T3.db.settings.fixesDone = [];
  await T3.applyCorrections();
  check('lot : choix de QCM remplacés, bonne réponse indiquée', cq.choices.join('|') === fc.choices.join('|') && cq.answer === fc.answer && cq.choices[cq.answer] !== undefined);
  check('aucune erreur JS', h.errors.length === 0 && h2.errors.length === 0, h.errors.concat(h2.errors).join('|'));
  done();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
