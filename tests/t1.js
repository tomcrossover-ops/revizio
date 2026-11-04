const { make, check, done } = require('./harness');
(async () => {
  // ---- A) migration d'anciennes données
  const DAYMS = 86400000;
  let h = make({ store: { settings: { name: 'Léo', apiKey: 'sk', model: 'claude-sonnet-5-5' }, courses: [{ id: 'c1', subject: 'maths', title: 'Fractions', createdAt: 1, summary: 's', keyPoints: ['k'], questions: [], scores: [{ date: 1, score: 2, total: 3 }],
    cards: [{ id: 'k1', q: 'Q1', a: 'A1', box: 0, due: 0 }, { id: 'k2', q: 'Q2', a: 'A2', box: 2, due: Date.now() + 3 * DAYMS }, { id: 'k3', q: 'Q3', a: 'A3', box: 5, due: 0 }] }] } });
  let db = h.t.db;
  check('migration: 3 cartes globales', db.cards.length === 3, db.cards.length);
  check('migration: cours sans .cards', db.courses[0].cards === undefined);
  check('migration: étapes 0/2/3', db.cards[0].fwd.step === 0 && db.cards[1].fwd.step === 2 && db.cards[2].fwd.step === 3, JSON.stringify(db.cards.map(c => c.fwd.step)));
  check('migration: échéance future conservée', db.cards[1].fwd.due > h.t.today(), db.cards[1].fwd.due);
  check('migration: réglages par défaut', db.settings.level === '6e' && db.settings.bonus === true && db.settings.name === 'Léo');
  check('migration: rattachée au cours', db.cards.every(c => c.courseId === 'c1' && c.chapter === 'Fractions' && c.subject === 'maths'));
  check('migration: niveaux', h.t.cardLevel(db.cards[0]) === 'revoir' && h.t.cardLevel(db.cards[1]) === 'cours' && h.t.cardLevel(db.cards[2]) === 'maitrisee');
  check('aucune erreur JS au chargement', h.errors.length === 0, h.errors.join('|'));

  // ---- B) répétition espacée
  h = make(); const t = h.t, T = t.today();
  let c = t.newCard({ front: 'Q ?', back: 'R' });
  check('carte neuve due aujourd\'hui', t.dueItems().length === 0 && true); // pas encore dans db
  t.db.cards.push(c);
  check('carte neuve: 1 item dû', t.dueItems().length === 1);
  t.gradeItem(c, 'fwd', 'yes'); check('sais #1 -> étape 1, +7j', c.fwd.step === 1 && c.fwd.due === t.addDays(T, 7), JSON.stringify(c.fwd));
  t.gradeItem(c, 'fwd', 'yes'); check('sais #2 -> étape 2, +21j', c.fwd.step === 2 && c.fwd.due === t.addDays(T, 21));
  t.gradeItem(c, 'fwd', 'yes'); check('sais #3 -> étape 3 (maîtrisée), +60j', c.fwd.step === 3 && c.fwd.due === t.addDays(T, 60) && t.cardLevel(c) === 'maitrisee');
  t.gradeItem(c, 'fwd', 'no'); check('raté après acquis -> retour au début, aujourd\'hui', c.fwd.step === 0 && c.fwd.due === T && c.fwd.lapses === 1);
  t.gradeItem(c, 'fwd', 'almost'); check('presque à l\'étape 0 -> reste 0, +2j', c.fwd.step === 0 && c.fwd.due === t.addDays(T, 2));
  c.fwd.step = 3; t.gradeItem(c, 'fwd', 'almost'); check('presque quand maîtrisée -> étape 2, +2j', c.fwd.step === 2 && c.fwd.due === t.addDays(T, 2));
  check('hors échéance: plus dû aujourd\'hui', t.dueItems().length === 0);
  let r = t.newCard({ front: 'Terme', back: 'Def', reversible: true }); t.db.cards.push(r);
  check('carte inversable: 2 items dus', t.dueItems(x => x.id === r.id).length === 2);
  t.gradeItem(r, 'fwd', 'yes'); check('sens indépendants', r.fwd.step === 1 && r.rev.step === 0 && t.dueItems(x => x.id === r.id).length === 1 && t.dueItems(x => x.id === r.id)[0].dir === 'rev');
  check('niveau = pire des deux sens', t.cardLevel(r) === 'revoir');
  t.db.activity.days = [T, t.addDays(T, -1), t.addDays(T, -2), t.addDays(T, -4)];
  check('série = 3 jours consécutifs', t.streak() === 3, t.streak());
  t.db.activity.days = [t.addDays(T, -1)]; check('série tient si hier révisé', t.streak() === 1);
  t.db.activity.days = [t.addDays(T, -3)]; check('série retombe à 0', t.streak() === 0);

  // ---- C) validation de création
  const v = (o, tpl) => t.validateCard(o, tpl);
  check('qr sans ? refusé', /\?/.test(v({ front: 'Quel gaz libère la photosynthèse', back: 'O2' }, 'qr')));
  check('qr valide', v({ front: 'Quel gaz libère-t-elle ?', back: 'Du dioxygène.' }, 'qr') === '');
  check('recto vide refusé', v({ front: '', back: 'x' }, 'qr') !== '');
  check('verso vide refusé', v({ front: 'Quoi ?', back: '' }, 'qr') !== '');
  check('phrase à trous sans ___ refusée', v({ front: 'La photosynthèse libère du gaz.', back: 'x' }, 'cloze') !== '');
  check('phrase à trous valide', v({ front: 'Elle libère du ___.', back: 'dioxygène' }, 'cloze') === '');
  check('image obligatoire', v({ front: '', back: 'Cellule' }, 'img') === 'Ajoute une image.');
  check('mot/définition court OK (ADN)', v({ front: 'ADN', back: 'Molécule support des gènes.' }, 'def') === '');
  check('verso > 200 refusé', /trop longue/.test(v({ front: 'Quoi ?', back: 'x'.repeat(201) }, 'qr')));
  check('verso = 200 accepté', v({ front: 'Quoi ?', back: 'x'.repeat(200) }, 'qr') === '');

  // ---- D) CSV
  const cards = [t.newCard({ subject: 'svt', chapter: 'Photo; "synthèse"', tag: 'definition', front: 'Quel gaz ?', back: 'Du dioxygène', explain: 'ligne1\nligne2', reversible: true }), t.newCard({ subject: 'maths', front: 'Aire du carré ?', back: 'c × c' })];
  const csv = t.toCSV(cards);
  check('CSV: BOM + en-tête', csv.startsWith('﻿matiere;chapitre;etiquette;recto;verso;explication;inversable'));
  const rows = t.parseCSV(csv);
  check('CSV: aller-retour (guillemets, ; et retour ligne)', rows.length === 3 && rows[1][1] === 'Photo; "synthèse"' && rows[1][5] === 'ligne1\nligne2' && rows[1][6] === 'oui', JSON.stringify(rows[1]));
  h = make(); const before = h.t.db.cards.length;
  const res = h.t.importCSV('Matière;Chapitre;Étiquette;Recto;Verso;Explication;Inversable\r\nSVT;Photosynthèse;Définition;Quel gaz ?;Du dioxygène;Expl;oui\r\nMaths;;Formule;Aire du carré ?;c × c;;non\r\nHistoire-Géo;;;;pas de recto;;\r\nFrançais;;;Q ?;' + 'x'.repeat(250) + ';;\r\n');
  check('import CSV: 2 ajoutées, 2 ignorées', res.added === 2 && res.skipped === 2, JSON.stringify(res));
  const imp = h.t.db.cards;
  check('import CSV: matière/étiquette/inversable reconnus (accents)', imp[0].subject === 'svt' && imp[0].tag === 'definition' && imp[0].reversible && imp[0].rev && imp[1].subject === 'maths' && imp[1].tag === 'formule' && !imp[1].reversible, JSON.stringify(imp.map(x => [x.subject, x.tag, x.reversible])));
  const res2 = h.t.importCSV('recto,verso\nQuoi ?,Ça\n'); check('import CSV: séparateur virgule + en-tête minimal', res2.added === 1);
  done();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
