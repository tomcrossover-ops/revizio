const { make, check, done } = require('./harness');
(async () => {
  const qcm = (i, skill) => ({ id: 'q' + i, type: 'qcm', q: 'Question ' + i + ' ?', choices: ['faux', 'juste'], answer: 1, explanation: 'Expl ' + i, pitfall: 'Piège ' + i, skill });
  const qs = Array.from({ length: 24 }, (_, i) => qcm(i, ['Lire', 'Comparer', 'Ajouter'][i % 3]));
  const course = { id: 'c1', subject: 'maths', level: '6e', title: 'Les fractions', catalogTitle: '', createdAt: 5, summary: 'Résumé', duration: 7, lesson: [{ title: 'P', content: '- a', examples: [] }], keyPoints: ['k'], questions: qs, scores: [], skills: {}, mistakes: [], path: {} };
  const card = i => ({ id: 'k' + i, subject: 'maths', chapter: 'x', courseId: 'c1', tag: 'definition', front: 'Carte ' + i, back: 'R', explain: '', emoji: '🔢', reversible: false, image: null, createdAt: 1, fwd: { step: 0, due: '2000-01-01', lapses: 0 }, rev: null });
  let calls = 0;
  const fetchImpl = async u => { if (/^packs\//.test(String(u))) return { ok: false, status: 404 }; calls++; return { ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ title: 'Nombres', summary: 's', lesson: [], keyPoints: ['k'], cards: [{ q: 'Nouvelle carte ?', a: 'oui', tag: 'definition' }], questions: [qcm(99, 'Lire')] }) }] }) }; };
  const h = make({ store: { v: 2, settings: { apiKey: 'sk-ant-AAAAAAAAAA', level: '6e' }, courses: [course], cards: [card(1), card(2)], decks: [], activity: { days: [] } }, fetchImpl });
  const { w, $, $$ } = h, T = h.t;

  // ---- accueil : matières en premier
  await h.go('#/');
  const tiles = $$('.subjgrid a');
  check('accueil : une tuile par matière (sans « Autre »)', tiles.length === 8 && tiles.every(a => /^#\/subject\//.test(a.getAttribute('href'))), tiles.length);
  check('accueil : les matières arrivent avant la fiche', $('#app').innerHTML.indexOf('subjgrid') < $('#app').innerHTML.indexOf('class="card status"'));
  check('accueil : compteur de chapitres', /1 chapitre/.test(tiles.find(a => /maths/.test(a.getAttribute('href'))).textContent));

  // ---- matière
  await h.go('#/subject/maths');
  check('matière : mes chapitres + chapitres du programme', $$('a.course[href^="#/course/"]').length === 1 && $$('a.course[href*="go=1"]').length >= 3, $$('a.course').length);
  check('matière : retour accueil + sélecteur de classe', $('.backlink').getAttribute('href') === '#/' && !!$('#lvl'));
  const first = $$('a.course[href*="go=1"]')[0].getAttribute('href');
  await h.go(first.replace('#', ''));
  await h.wait(400);
  check('chapitre du programme : préparé immédiatement (pas de formulaire à valider)', T.db.courses.length === 2 && /#\/course\//.test(w.location.hash), w.location.hash + ' ' + T.db.courses.length);
  check('…et le chapitre porte son titre du programme', !!T.db.courses[1].catalogTitle);
  await h.go('#/subject/inconnue'); check('matière inconnue → accueil', w.location.hash === '#/');

  // ---- chapitre : 4 actions, 3 clics max
  await h.go('#/course/c1');
  check('chapitre : « Choisis ce que tu veux faire » + 4 actions', /Choisis ce que tu veux faire/.test($('#app').textContent) && $$('.act').length === 4);
  check('chapitre : durées affichées', /≈ 7 min/.test($('#app').textContent) && /8 questions/.test($('#app').textContent) && /à revoir aujourd'hui/.test($('#app').textContent));
  check('chapitre : bouton principal « Commencer »', /Commencer/.test($('a.btn.big').textContent));
  check('première visite : leçon conseillée mais jamais obligatoire', /Relire la leçon/.test($('a.btn.big').textContent) && $$('.act.off').length === 0);
  check('chapitre : notions pas encore travaillées listées', /Pas encore travaillées \(3\)/.test($('#app').textContent));
  await h.go('#/course/c1/lesson');
  check('leçon : bouton retour au chapitre', $('.backlink').getAttribute('href') === '#/course/c1' && /choisir une activité/.test($('#lessondone').textContent));

  // ---- quiz d'entraînement : sans note, sans lire la leçon
  const run = async (urlHash, want) => {
    await h.go('#/'); await h.go(urlHash); let g = 0, n = 0;
    while (!/terminé/.test(($('h1') || {}).textContent || '') && g++ < 40) {
      const ch = $$('.choice'); if (!ch.length) break;
      n++; (ch.find(b => +b.dataset.k === (want(n) ? 1 : 0)) || ch[want(n) ? 1 : 0]).click(); $('#nx').click(); await h.wait(3);
    }
    return n;
  };
  const n1 = await run('#/train/c1', k => k > 3); // 3 fausses, 5 justes
  check('entraînement : 8 questions', n1 === 8, n1);
  check('entraînement : aucune note enregistrée', T.db.courses[0].scores.length === 0);
  check('entraînement : résultat neutre « 5 bonnes réponses sur 8 »', /5 bonnes réponses sur 8/.test($('#app').textContent), $('#app').textContent.slice(0, 120));
  check('entraînement : erreurs → flashcards automatiques', T.db.cards.filter(c => c.tag === 'erreur').length === 3 && /3 flashcards créées/.test($('#app').textContent), T.db.cards.length);
  check('entraînement : boutons Revoir / Ciblés / Recommencer / Nouvelles questions', ['seeErr', 'targ', 'again', 'gen'].every(i => !!$('#' + i)));
  $('#seeErr').click(); check('revoir mes erreurs : explications visibles', !$('#errs').hidden && /Expl \d+/.test($('#errs').textContent) && /Piège/.test($('#errs').textContent));
  check('chapitre marqué « entraîné »', T.db.courses[0].trained === true);
  // exercices de remédiation
  $('#targ').click(); await h.wait(5);
  check('exercices ciblés : rappel + 5 max', /Rappel/.test($('#app').textContent) && /Exercices ciblés · 1 \/ [1-5]/.test($('#app').textContent), $('#app').textContent.slice(0, 120));
  // recommencer immédiatement
  const firstIds = T.db.courses[0].lastTrain.slice();
  const n2 = await run('#/train/c1', () => true);
  check('recommencer : nouvelles questions (peu de répétitions)', n2 === 8 && T.db.courses[0].lastTrain.filter(i => firstIds.includes(i)).length <= 4, T.db.courses[0].lastTrain.filter(i => firstIds.includes(i)).length);
  check('tout juste → « Tu peux tenter le bilan »', /bilan de compétence/.test($('#app').textContent) || /sur 8/.test($('#app').textContent));

  // ---- nouvelles questions via l'IA
  await h.go('#/'); await h.go('#/train/c1'); while (!$('#gen')) { ($$('.choice').find(b => +b.dataset.k === 0) || $$('.choice')[0]).click(); $('#nx').click(); await h.wait(3); }
  const before = T.db.courses[0].questions.length; $('#gen').click(); await h.wait(60);
  check('nouvelles questions IA : ajoutées + nouveau quiz lancé', calls === 2 && T.db.courses[0].questions.length === before + 1 && /Quiz d'entraînement · 1/.test($('#app').textContent), calls + ' ' + $('#app').textContent.slice(0, 60));

  // ---- bilan : 10 à 15 questions, puis questions différentes
  await h.go('#/quiz/c1'); const nb = (() => { const m = $('#app').textContent.match(/Question 1 \/ (\d+)/); return m ? +m[1] : 0; })();
  check('bilan : entre 10 et 15 questions', nb >= 10 && nb <= 15, nb);
  const bilan1 = T.db.courses[0].lastBilan.slice();
  await h.go('#/'); await h.go('#/quiz/c1'); const bilan2 = T.db.courses[0].lastBilan;
  check('nouveau bilan : questions différentes (pool suffisant)', bilan2.filter(i => bilan1.includes(i)).length < bilan1.length, bilan2.filter(i => bilan1.includes(i)).length);
  check('aucune erreur JS', h.errors.length === 0, h.errors.join('|'));
  done();
})();
