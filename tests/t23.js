const { make, check, done } = require('./harness');
const fs = require('fs');
const pack = n => JSON.parse(fs.readFileSync(__dirname + '/../packs/' + n, 'utf8'));
const base = s => ({ v: 2, settings: { level: '6e', apiKey: 'sk-secret-1234567890', provider: 'anthropic', profiles: { anthropic: { apiKey: 'sk-secret-1234567890' } }, ...s }, courses: [], cards: [], decks: [], activity: { days: [] } });
(async () => {
  // appareil A : profil + cours + activité
  const A = make({ store: base({ name: 'Léo', avatar: '🦊', profileDone: true, theme: 'parchemin', schedule: { 1: ['maths'] }, micro: true, packDone: { '6e|maths': ['Fractions'] } }) });
  A.t.importPack(pack('6e-maths.json')); A.t.importPack(pack('6e-japonais.json'));
  A.t.db.activity.days = ['2026-10-01', '2026-10-02']; A.t.db.activity.xp = 120;
  A.t.db.decks.push({ id: 'd1', name: 'Mon paquet', cardIds: [A.t.db.cards[0].id] });
  const bk = JSON.parse(JSON.stringify(A.t.backupData()));
  check('export : format, profil et réglages inclus', bk.format === 'revizio-backup' && bk.settings.name === 'Léo' && bk.settings.avatar === '🦊' && bk.settings.theme === 'parchemin' && bk.settings.micro === true && !!bk.settings.schedule[1] && !!bk.settings.packDone['6e|maths']);
  check('export : la clé API n\'y est jamais', !/sk-secret/.test(JSON.stringify(bk)) && bk.settings.apiKey === undefined && bk.settings.profiles === undefined);
  // appareil B vide : remplacement
  const B = make({ store: base({ apiKey: 'sk-autre-0987654321', profiles: {} }) });
  const r = B.t.applyBackup(bk, 'replace');
  check('remplacement : cours, cartes, paquet, XP et profil restaurés', r.courses === A.t.db.courses.length && B.t.db.cards.length === A.t.db.cards.length && B.t.db.decks.length === 1 && B.t.db.activity.xp === 120 && B.t.db.settings.name === 'Léo' && B.t.db.settings.profileDone === true);
  check('remplacement : la clé API locale est conservée', B.t.db.settings.apiKey === 'sk-autre-0987654321');
  // fusion : appareil C avec ses propres données
  const C = make({ store: base({ name: 'Zoé', profileDone: true, schedule: { 2: ['svt'] }, packDone: { '6e|maths': ['Autre'] } }) });
  C.t.importPack(pack('6e-maths.json')); // mêmes chapitres, autres identifiants
  const own = C.t.db.courses.length, ownCards = C.t.db.cards.length;
  C.t.db.activity.days = ['2026-10-02', '2026-10-05']; C.t.db.activity.xp = 300;
  const m = C.t.applyBackup(bk, 'merge');
  check('fusion : chapitres déjà présents ignorés, nouveaux ajoutés', m.skipped === pack('6e-maths.json').courses.length && C.t.db.courses.length === own + pack('6e-japonais.json').courses.length, JSON.stringify(m));
  check('fusion : pas de cartes en double', C.t.db.cards.length === ownCards + A.t.db.cards.filter(c => c.subject === 'japonais').length, C.t.db.cards.length);
  check('fusion : profil existant intact, XP max, jours réunis', C.t.db.settings.name === 'Zoé' && C.t.db.activity.xp === 300 && C.t.db.activity.days.join() === '2026-10-01,2026-10-02,2026-10-05');
  check('fusion : emploi du temps existant gardé, packDone réuni', JSON.stringify(C.t.db.settings.schedule) === '{"2":["svt"]}' && C.t.db.settings.packDone['6e|maths'].length === 2);
  const again = C.t.applyBackup(bk, 'merge');
  check('fusion : idempotente', again.courses === 0 && again.cards === 0 && again.decks === 0 || again.cards === 0);
  // fusion dans un appareil sans profil : le profil de la sauvegarde est repris
  const D = make({ store: base({}) }); D.t.applyBackup(bk, 'merge');
  check('fusion sur appareil neuf : profil repris', D.t.db.settings.name === 'Léo' && D.t.db.settings.profileDone === true);
  // ancienne sauvegarde sans réglages
  const E = make({ store: base({ name: 'Max', profileDone: true }) }); E.t.applyBackup({ courses: [], cards: [], decks: [], activity: { days: [] } }, 'replace');
  check('ancienne sauvegarde : profil actuel inchangé', E.t.db.settings.name === 'Max');
  let bad = false; try { E.t.applyBackup({ x: 1 }, 'merge'); } catch (e) { bad = true; }
  check('fichier invalide refusé', bad);
  // écran : OK = fusionner ; Annuler puis OK = remplacer ; Annuler deux fois = rien
  const F = make({ store: base({ name: 'Léo', profileDone: true }) }); await F.go('#/settings');
  const file = txt => ({ files: [{ text: async () => txt }] });
  const run = async answers => {  F.w.confirm = () => answers.shift(); const inp = F.$('#imp'); Object.defineProperty(inp, 'files', { value: file(JSON.stringify(bk)).files, configurable: true }); inp.dispatchEvent(new F.w.Event('change')); await F.wait(40); };
  await run([true]); check('écran : OK = fusion', /Fusion réussie/.test(F.$('#toast').textContent) && F.t.db.courses.length > 0, F.$('#toast').textContent);
  await F.go('#/settings'); const n = F.t.db.courses.length; F.t.db.courses.pop();
  await run([false, false]); check('écran : annuler deux fois = rien ne change', F.t.db.courses.length === n - 1);
  await F.go('#/settings'); await run([false, true]); check('écran : remplacer', F.t.db.courses.length === n && /Import réussi/.test(F.$('#toast').textContent));
  await F.go('#/settings'); F.$('#exp').click();
  check('écran : export déclenché', /^revizio-\d{4}/.test(F.w.__clicked || ''));
  check('aucune erreur JS', A.errors.length + B.errors.length + C.errors.length + F.errors.length === 0, [A, B, C, F].flatMap(x => x.errors).join('|'));
  done();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
