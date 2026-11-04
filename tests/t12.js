const { make, check, done } = require('./harness');
(async () => {
  const mkq = o => Object.assign({ explanation: 'Parce que.', skill: 'S' }, o);
  const h0 = make({}), T0 = h0.t;
  // ---- normalisation des nouveaux types
  const nq = T0.normQuestions([
    { type: 'trous', q: 'La capitale est ___.', answer: 'Paris', accept: ['paris'], hint: 'ville lumière', level: 2, skill: 'Géo' },
    { type: 'trous', q: 'Sans trou', answer: 'x' },
    { type: 'calcul', q: '7 × 8 = ?', answer: '56' }, { type: 'calcul', q: 'x', answer: 'abc' },
    { type: 'assoc', q: 'Associe', pairs: [['a', '1'], ['b', '2'], ['c', '3']] }, { type: 'assoc', q: 'doublon', pairs: [['a', '1'], ['b', '1']] },
    { type: 'ordre', q: 'Ordre', items: ['un', 'deux', 'trois'] }, { type: 'ordre', q: 'trop court', items: ['a', 'b'] },
    { type: 'short', q: 'Court', answer: 'soleil', accept: ['le soleil'] }, { type: 'vf', q: 'Vrai ?', answer: true },
  ]);
  const types = nq.map(q => q.type).join();
  check('normQuestions : types valides gardés, invalides rejetés', types === 'trous,short,calcul,short,assoc,ordre,short,qcm', types);
  const tr = nq[0]; check('trous : accept, hint, level', tr.accept[0] === 'paris' && tr.hint === 'ville lumière' && tr.level === 2);
  // ---- comparaison de réponses
  const same = T0.sameAnswer;
  check('réponse : accents/majuscules/article', same('  PARIS ', tr) && same('la Paris', tr) && !same('Lyon', tr));
  check('calcul : virgule/espaces', same('56', { type: 'calcul', answer: '56' }) && same('1,5', { type: 'calcul', answer: '1.5' }) && !same('55', { type: 'calcul', answer: '56' }));
  check('short avec variantes', same('Le Soleil', { type: 'short', answer: 'soleil', accept: ['étoile'] }) && same('étoile', { type: 'short', answer: 'soleil', accept: ['étoile'] }));
  // ---- mots-clés
  const ref = 'La photosynthèse permet aux plantes de fabriquer du dioxygène avec la lumière';
  check('mots-clés : bon', T0.keywordFeedback('les plantes fabriquent du dioxygène grâce à la lumière', ref).level === 'ok');
  check('mots-clés : partiel', T0.keywordFeedback('les plantes aiment le soleil', ref).level === 'partiel');
  check('mots-clés : rien (bienveillant)', /Merci/.test(T0.keywordFeedback('je ne sais pas trop bien', ref).msg));
  check('mots-clés : vide', T0.keywordFeedback('ok', ref).level === 'vide');

  // ---- rendu des exercices dans le DOM
  const mk = () => make({ store: { v: 2, settings: {}, courses: [], cards: [], decks: [], activity: { days: [] } } });
  const run = async (q, act) => { const h = mk(); const body = h.w.document.createElement('div'); h.w.document.body.appendChild(body); let res = null; h.t.renderExercise(q, body, (ok, m) => { res = { ok, ...m }; }); await act(h, body, () => res); return res; };
  const $b = (b, s) => b.querySelector(s);
  let r = await run(mkq({ type: 'trous', q: 'La capitale est ___.', answer: 'Paris', accept: [] }), async (h, b) => { $b(b, '#ans').value = 'paris'; $b(b, '#chk').click(); });
  check('trous : bonne réponse 1er essai', r && r.ok === true && r.tries === 1);
  r = await run(mkq({ type: 'trous', q: 'La capitale est ___.', answer: 'Paris', accept: [], hint: 'Ville' }), async (h, b, g) => { $b(b, '#ans').value = 'Lyon'; $b(b, '#chk').click(); check('trous : 1er échec → pas terminé + indice affiché', g() === null && /Essaie encore/.test(b.textContent) && /Ville/.test(b.textContent)); $b(b, '#ans').value = 'Paris'; $b(b, '#chk').click(); });
  check('trous : réussi au 2e essai = ok false (honnête) mais terminé', r && r.ok === false && r.tries === 2);
  r = await run(mkq({ type: 'trous', q: 'La capitale est ___.', answer: 'Paris' }), async (h, b) => { for (const v of ['a', 'b']) { $b(b, '#ans').value = v; $b(b, '#chk').click(); } $b(b, '#yes').click(); });
  check('trous : 2 échecs → l\'élève peut valider « ma réponse est juste aussi »', r && r.ok === true);
  r = await run(mkq({ type: 'calcul', q: '7 × 8 = ?', answer: '56' }), async (h, b) => { for (const v of ['1', '2']) { $b(b, '#ans').value = v; $b(b, '#chk').click(); } });
  check('calcul : 2 échecs → correction, ok false', r && r.ok === false && /56/.test('56'));
  r = await run(mkq({ type: 'assoc', q: 'Associe', pairs: [['a', '1'], ['b', '2'], ['c', '3']] }), async (h, b) => { b.querySelectorAll('select').forEach((s, i) => { s.value = ['1', '2', '3'][i]; }); $b(b, '#chk').click(); });
  check('association juste', r && r.ok === true);
  r = await run(mkq({ type: 'assoc', q: 'Associe', pairs: [['a', '1'], ['b', '2']] }), async (h, b, g) => { const ss = b.querySelectorAll('select'); ss[0].value = '2'; ss[1].value = '1'; $b(b, '#chk').click(); check('association fausse → 2e chance', g() === null && b.querySelectorAll('select.bad').length === 2); $b(b, '#chk').click(); });
  check('association : 2 échecs → corrigé', r && r.ok === false);
  r = await run(mkq({ type: 'ordre', q: 'Ordre', items: ['un', 'deux', 'trois'] }), async (h, b) => { for (const t of ['un', 'deux', 'trois']) { [...b.querySelectorAll('.choice')].find(x => x.textContent === t).click(); } $b(b, '#chk').click(); });
  check('classement juste', r && r.ok === true && r.tries === 1);
  r = await run(mkq({ type: 'ordre', q: 'Ordre', items: ['un', 'deux', 'trois'] }), async (h, b, g) => { for (let k = 0; k < 2; k++) { for (const t of ['trois', 'deux', 'un']) { [...b.querySelectorAll('.choice')].find(x => x.textContent === t).click(); } $b(b, '#chk').click(); } });
  check('classement : 2 échecs → bon ordre montré', r && r.ok === false);
  r = await run(mkq({ type: 'qcm', q: 'Q', choices: ['a', 'b'], answer: 1 }), async (h, b) => { [...b.querySelectorAll('.choice')].find(x => x.textContent === 'a').click(); });
  check('qcm : un seul essai', r && r.ok === false && r.tries === 1);
  r = await run(mkq({ type: 'short', q: 'Q', answer: 'long' }), async (h, b) => { $b(b, '#ans').value = 'x'; $b(b, '#chk').click(); $b(b, '#yes').click(); });
  check('short sans variantes : auto-correction par l\'élève (ancien mode)', r && r.ok === true);
  check('answerText : assoc et ordre', T0.answerText({ type: 'assoc', pairs: [['a', '1'], ['b', '2']] }) === 'a → 1 ; b → 2' && T0.answerText({ type: 'ordre', items: ['x', 'y', 'z'] }) === 'x → y → z');

  // ---- séance du jour 40/30/20/10
  const lesson = [0, 1, 2].map(i => ({ title: 'Partie ' + i, content: '- idée', examples: ['ex'] }));
  const qs = (pref) => [mkq({ type: 'qcm', q: pref + ' q1', choices: ['a', 'b'], answer: 0, skill: pref + 'A' }), mkq({ type: 'trous', q: pref + ' ___ q2', answer: 'x', skill: pref + 'B' }), mkq({ type: 'calcul', q: pref + ' q3', answer: '4', skill: pref + 'A' }), mkq({ type: 'assoc', q: pref + ' q4', pairs: [['a', '1'], ['b', '2']], skill: pref + 'B' }), mkq({ type: 'ordre', q: pref + ' q5', items: ['a', 'b', 'c'], skill: pref + 'C' }), mkq({ type: 'qcm', q: pref + ' q6', choices: ['a', 'b'], answer: 1, skill: pref + 'C' })].map((q, i) => Object.assign(q, { id: pref + i }));
  const course = (id, subject, pref) => ({ id, subject, level: '6e', title: 'Cours ' + id, createdAt: 1, summary: 's', lesson, keyPoints: ['Un point clé important'], questions: qs(pref), scores: [], skills: {}, mistakes: [], path: {} });
  const card = i => ({ id: 'k' + i, subject: 'maths', chapter: 'Ch', courseId: 'c1', tag: 'definition', front: 'Carte ' + i + ' ?', back: 'Rép ' + i, explain: '', emoji: '🔢', reversible: false, image: null, createdAt: 1, fwd: { step: 0, due: '2000-01-01', lapses: i }, rev: null });
  const store = { v: 2, settings: { name: 'Léo', apiKey: 'k', level: '6e' }, courses: [course('c1', 'maths', 'M'), course('c2', 'francais', 'F')], cards: Array.from({ length: 8 }, (_, i) => card(i)), decks: [], activity: { days: [] } };
  const h = make({ store }), T = h.t, { w, $, $$ } = h;
  const S = T.buildSession();
  check('séance : 10 étapes, proportions 4/3/2/1', S.total === 10 && S.counts.cards === 4 && S.counts.ex === 3 && S.counts.nw === 2 && S.counts.expl === 1, JSON.stringify(S.counts) + S.total);
  const kinds = S.steps.map(s => s.kind + (s.isNew ? '*' : '')).join(' ');
  check('séance : la question « nouvelle notion » suit sa leçon', /new ex\*/.test(kinds), kinds);
  check('séance : formats mélangés (pas 3 cartes d\'affilée)', !/card card card/.test(kinds), kinds);
  check('séance : auto-explication après un exercice', /ex expl/.test(kinds), kinds);
  // dégradations
  const hEmpty = make({ store: { v: 2, settings: {}, courses: [], cards: [], decks: [], activity: { days: [] } } });
  check('séance vide quand rien à faire', hEmpty.t.buildSession().total === 0);
  const hNoCards = make({ store: Object.assign({}, store, { cards: [] }) });
  const S2 = hNoCards.t.buildSession(); check('sans carte due : places données aux exercices', S2.counts.cards === 0 && S2.total >= 8, JSON.stringify(S2.counts));
  // déroulé complet
  await h.go('#/daily');
  check('écran séance : 40/30/20/10 + bouton', /40 %/.test($('#app').textContent) && $('#app .btn').getAttribute('href') === '#/daily/run');
  await h.go('#/daily/run');
  check('intro : rappel des notions fragiles', /Rappel des notions fragiles/.test($('#app').textContent) && !!$('#go'));
  $('#go').click();
  let guard = 0; const seen = new Set(); const xp0 = T.db.activity.xp;
  while (!/Mini-bilan|Quête terminée/.test($('h1') ? $('h1').textContent : '') && guard++ < 40) {
    const lab = ($('.steptag') || {}).textContent || ''; seen.add(lab);
    if ($('#reveal')) { $('#reveal').disabled = false; $('#reveal').click(); $$('.rate')[2].click(); }
    else if ($('#chk') && $('#mine')) { $('#mine').value = 'Un point clé très important expliqué'; $('#chk').click(); $('#nx').click(); }
    else if ($('#body')) { const b = $('#body'); const c = b.querySelector('.choice'); if (c && !b.querySelector('select') && !b.querySelector('.mine')) c.click(); else if (b.querySelector('#ans')) { b.querySelector('#ans').value = 'x'; b.querySelector('#chk').click(); if (b.querySelector('#ans') && !b.querySelector('#ans').disabled) { b.querySelector('#ans').value = 'y'; b.querySelector('#chk').click(); } const no = b.querySelector('#no'); if (no) no.click(); } else if (b.querySelector('select')) { b.querySelectorAll('select').forEach((s, i) => { s.selectedIndex = 1; }); b.querySelector('#chk').click(); if (!b.querySelector('select').disabled) b.querySelector('#chk').click(); } else if (b.querySelector('.mine')) { for (let k = 0; k < 2; k++) { b.querySelectorAll('.choice').forEach(x => x.click()); const cc = b.querySelector('#chk'); if (cc && !cc.disabled) cc.click(); } } const nx = $('#nx'); if (nx) nx.click(); }
    else if ($('#nx')) $('#nx').click();
    await h.wait(5);
  }
  check('séance terminée en moins de 40 actions', guard < 40, $('h1') && $('h1').textContent);
  const txt = $('#app').textContent;
  check('mini-bilan : cartes, exercices, recommandation, XP', /cartes sues/.test(txt) && /exercices réussis/.test(txt) && /Recommandation/.test(txt) && /XP/.test(txt), txt.slice(0, 200));
  check('XP gagnée pendant la séance', T.db.activity.xp > xp0);
  check('cartes notées (4 cartes revues)', T.db.cards.filter(c => c.fwd.last).length === 4);
  check('partie de leçon marquée comme vue', T.db.courses.some(c => (c.lessonSeen || []).length === 1));
  check('étapes variées vues', seen.size >= 3, [...seen].join('|'));
  check('aucune erreur JS', h.errors.length === 0 && hEmpty.errors.length === 0, h.errors.join('|'));
  done();
})();
