const { make, check, done } = require('./harness');
const fs = require('fs');
const P = __dirname + '/../packs/', pack = n => JSON.parse(fs.readFileSync(P + n, 'utf8'));
const fetchImpl = async u => { const f = P + String(u).replace(/^packs\//, ''); if (!fs.existsSync(f)) return { ok: false }; const j = JSON.parse(fs.readFileSync(f, 'utf8')); return { ok: true, json: async () => j }; };
const store = () => ({ v: 2, settings: { level: '5e', apiKey: '', name: 'Léo' }, courses: [], cards: [], decks: [], activity: { days: [] } });
(async () => {
  const fx = pack('corrections.json');
  check('corrections : fichier valide (5 corrections)', fx.format === 'revizio-corrections' && fx.fixes.length === 5 && fx.fixes.every(f => f.id && f.match && f.question && f.catalogTitle));
  const h = make({ store: store(), fetchImpl }), T = h.t;
  T.importPack(pack('5e-techno.json'));
  const co = T.db.courses.find(c => c.catalogTitle === "Analyse d'un objet technique");
  const i = co.questions.findIndex(q => q.type === 'ordre' && q.items.includes('Minitel'));
  const id = co.questions[i].id;
  co.questions[i] = { ...co.questions[i], items: ['Minitel', 'Téléphone fixe', 'Smartphone'] }; // ancienne version fautive
  await h.wait(80); T.db.settings.fixesDone = []; co.questions[i] = { ...co.questions[i], items: ['Minitel', 'Téléphone fixe', 'Smartphone'] };
  const n = await T.applyCorrections();
  const q = co.questions.find(x => x.id === id);
  check('correction : classement Minitel rétabli, identifiant conservé', n >= 1 && q && q.items.join() === 'Téléphone fixe,Minitel,Smartphone', JSON.stringify(q && q.items));
  check('correction : enregistrée, non rejouée', T.db.settings.fixesDone.includes('v316-minitel') && (await T.applyCorrections()) === 0);
  // chapitre non importé : la correction est marquée faite sans rien ajouter
  check('correction : chapitres absents ignorés', T.db.courses.length === pack('5e-techno.json').courses.length);
  // hors ligne : rien n'est marqué
  const h2 = make({ store: store() }); h2.t.importPack(pack('5e-techno.json'));
  check('hors ligne : rien de marqué, réessai possible', (await h2.t.applyCorrections()) === 0 && !(h2.t.db.settings.fixesDone || []).length);
  check('aucune erreur JS', h.errors.length === 0 && h2.errors.length === 0, h.errors.concat(h2.errors).join('|'));
  done();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
