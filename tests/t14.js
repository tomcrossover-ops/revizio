const { make, check, done } = require('./harness'); const fs = require('fs');
(async () => {
  const P = require('path').join(__dirname, '..', 'packs') + '/';
  const fetchImpl = async u => { const f = P + String(u).replace(/^packs\//, '').split('?')[0]; if (!fs.existsSync(f)) return { ok: false, status: 404 }; const txt = fs.readFileSync(f, 'utf8'); return { ok: true, status: 200, json: async () => JSON.parse(txt) }; };
  const h = make({ store: { v: 2, settings: { level: '6e' }, courses: [], cards: [], decks: [], activity: { days: [] } }, fetchImpl });
  const { w, $, $$ } = h, T = h.t;
  const idx = JSON.parse(fs.readFileSync(P + 'index.json', 'utf8')).packs;
  // chaque chapitre du pack existe dans le catalogue et se valide sans perte
  for (const p of idx) {
    const data = JSON.parse(fs.readFileSync(P + p.file, 'utf8'));
    const cat = T.CATALOG[p.level][p.subject].map(x => x[0]);
    check(p.file + ' : titres = catalogue', data.courses.every(c => cat.includes(c.catalogTitle)), data.courses.map(c => c.catalogTitle).filter(t => !cat.includes(t)).join('|'));
    data.courses.forEach(c => {
      const r = T.courseFromPack(c);
      check(p.file + ' / ' + c.title + ' : rien perdu', r && r.course.questions.length === c.questions.length && r.cards.length === c.cards.length && r.course.lesson.length === c.lesson.length, r && [r.course.questions.length, c.questions.length, r.cards.length, c.cards.length].join());
      check('  ' + c.title + ' : ≥8 cartes, ≥8 questions, ≥3 types', c.cards.length >= 8 && c.questions.length >= 8 && new Set(c.questions.map(q => q.type)).size >= 3, c.cards.length + '/' + c.questions.length);
    });
  }
  // fusion sans doublon
  const data = JSON.parse(fs.readFileSync(P + '6e-maths.json', 'utf8'));
  let r = T.importPack(data); check('import : tout ajouté', r.added === data.courses.length && T.db.cards.length === r.cards, JSON.stringify(r));
  r = T.importPack(data); check('réimport : tout ignoré, pas de doublon', r.added === 0 && r.skipped === data.courses.length && T.db.courses.length === data.courses.length);
  // UI : écran matière
  await h.go('#/subject/maths'); await h.wait(100);
  check('matière : chapitres déjà importés listés', $$('a.course[href^="#/course/"]').length === data.courses.length);
  // import d'un chapitre depuis le catalogue (base vide)
  const h2 = make({ store: { v: 2, settings: { level: '6e' }, courses: [], cards: [], decks: [], activity: { days: [] } }, fetchImpl });
  await h2.go('#/subject/maths'); await h2.wait(100);
  await h2.wait(300);
  check('matière : chapitres prêts ajoutés automatiquement', h2.t.db.courses.length === data.courses.length && h2.t.db.courses.every(c => c.origin === 'pack'), h2.t.db.courses.length);
  check('plus de bouton ni de lien pack', !h2.$('#readyall') && h2.$$('a.course[href^="#/pack/"]').length === 0);
  // un chapitre supprimé n'est pas rajouté
  const gone = h2.t.db.courses.pop(); 
  await h2.go('#/'); await h2.go('#/subject/maths'); await h2.wait(300);
  check('chapitre supprimé non réajouté', h2.t.db.courses.length === data.courses.length - 1 && !h2.t.db.courses.some(c => c.id === gone.id), h2.t.db.courses.length);
  // Réglages
  await h2.go('#/settings'); await h2.wait(100);
  check('réglages : section packs listée', h2.$$('[data-pk]').length === idx.length);
  // fichier invalide
  let err = ''; try { T.importPack({ foo: 1 }); } catch (e) { err = e.message; } check('fichier invalide refusé', /pack/.test(err));
  check('aucune erreur JS', h.errors.length === 0 && h2.errors.length === 0, [...h.errors, ...h2.errors].join('|'));
  done();
})();
