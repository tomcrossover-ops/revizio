const { make, check, done } = require('./harness'); const fs = require('fs');
(async () => {
  const P = require('path').join(__dirname, '..', 'packs') + '/';
  const fetchImpl = async u => { const f = P + String(u).replace(/^packs\//, '').split('?')[0]; if (!fs.existsSync(f)) return { ok: false, status: 404 }; const txt = fs.readFileSync(f, 'utf8'); return { ok: true, status: 200, json: async () => JSON.parse(txt) }; };
  const h = make({ store: { v: 2, settings: { level: '6e', apiKey: '' }, courses: [], cards: [], decks: [], activity: { days: [] } }, fetchImpl });
  const T = h.t;
  for (const k of ['maths', 'francais', 'histgeo']) { await h.go('#/subject/' + k); await h.wait(300); }
  check('chapitres importés', T.db.courses.length > 20 && T.db.cards.length > 150, T.db.courses.length + '/' + T.db.cards.length);
  const due = T.dueItems().length;
  check('nouvelles cartes limitées à ' + 12 + ' par jour', due === 12, due);
  check('« tout » disponible pour un chapitre', T.dueItems(c => c.courseId === T.db.courses[0].id, { all: true }).length === T.db.cards.filter(c => c.courseId === T.db.courses[0].id).length);
  // on étudie les cartes proposées : de nouvelles n'apparaissent PAS le même jour
  T.dueItems().forEach(it => T.gradeItem(it.card, it.dir, 'yes'));
  check('quota épuisé : plus de nouvelles cartes aujourd\'hui', T.dueItems().length === 0, T.dueItems().length);
  check('réserve > 0', T.reserveCount() > 100, T.reserveCount());
  // « je ne sais pas » reste dû le jour même
  const T2 = h.t; const x = T2.db.cards[0]; T2.gradeItem(x, 'fwd', 'no');
  // lendemain : on remonte les dates
  T.db.cards.forEach(c => ['fwd', 'rev'].forEach(d => { if (c[d]) { c[d].first = c[d].first ? '2000-01-01' : c[d].first; c[d].due = c[d].due > '2000-01-01' && c[d].last ? '2000-01-02' : c[d].due; } }));
  const next = T.dueItems();
  const newOnes = next.filter(it => !it.card.fwd.last).length;
  check('le lendemain : encore ' + 12 + ' nouvelles cartes', newOnes === 12, newOnes);
  const started = new Set(T.db.cards.filter(c => c.fwd.last).map(c => c.courseId));
  const fromStarted = next.filter(it => !it.card.fwd.last && started.has(it.card.courseId)).length;
  check('chapitres déjà commencés servis en premier', fromStarted >= Math.min(newOnes, T.db.cards.filter(c => started.has(c.courseId) && !c.fwd.last).length), fromStarted);
  // QCM : l'ordre est mélangé à l'affichage
  const qc = T.db.courses.find(c => c.questions.some(q => q.type === 'qcm' && q.choices.length === 4 && !q.choices.some(x => /ci-dessus|toutes les|aucune|les deux|tous les/i.test(x))));
  const qq = qc.questions.find(q => q.type === 'qcm' && q.choices.length === 4 && !q.choices.some(x => /ci-dessus|toutes les|aucune|les deux|tous les/i.test(x)));
  const body = h.w.document.createElement('div'); h.w.document.body.appendChild(body);
  const seen = new Set(); let okMap = true;
  for (let i = 0; i < 40; i++) {
    T.renderExercise(qq, body, () => {});
    const btns = [...body.querySelectorAll('.choice')]; seen.add(btns.map(b => b.dataset.k).join(''));
    if (btns.some(b => b.querySelector('.tx').textContent !== qq.choices[+b.dataset.k])) okMap = false;
  }
  check('QCM : ordre des choix mélangé (' + seen.size + ' ordres vus)', seen.size > 5, seen.size);
  check('QCM : data-k garde la bonne correspondance', okMap);
  check('aucune erreur JS', h.errors.length === 0, h.errors.join('|'));
  done();
})();
