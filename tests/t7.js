const { make, check, done } = require('./harness');
(async () => {
  const mkQ = (i, skill, o) => ({ id: 'q' + i, type: 'qcm', q: 'Question ' + i + ' ?', choices: ['a', 'b', 'c', 'd'], answer: 1, explanation: 'Expl ' + i, skill, pitfall: i === 1 ? 'Ne pas confondre a et b' : '', ...o });
  const course = { id: 'c1', subject: 'maths', level: '6e', title: 'Fractions', createdAt: 1, summary: 's', lesson: [], keyPoints: ['k'], scores: [], skills: {}, mistakes: [], duration: 8, objectives: ['Savoir lire une fraction'], prerequisites: ['Les divisions'], pitfalls: ['Additionner les dénominateurs → garder le dénominateur'],
    questions: [mkQ(1, 'Lire une fraction'), mkQ(2, 'Lire une fraction'), mkQ(3, 'Comparer'), mkQ(4, 'Comparer'), { id: 'q5', type: 'qcm', q: 'Vrai ?', choices: ['Vrai', 'Faux'], answer: 0, explanation: 'ok', skill: 'Comparer' }, { id: 'q6', type: 'short', q: 'Réponse ?', answer: 'trois', explanation: '', skill: '' }] };
  const mkStore = () => ({ v: 2, settings: { apiKey: 'k', level: '6e' }, courses: [JSON.parse(JSON.stringify(course))], cards: [], decks: [], activity: { days: [] } });
  const h = make({ store: mkStore() }); const { $, $$, w } = h; const T = h.t;

  // ---- normalisation IA
  const nq = T.normQuestions([{ type: 'qcm', q: 'x ?', choices: ['a', 'b'], answer: 0, skill: 'Accorder le participe passé', pitfall: 'erreur' }, { type: 'vf', q: 'y', answer: true, skill: 'S' }]);
  check('normQuestions conserve skill/pitfall', nq[0].skill === 'Accorder le participe passé' && nq[0].pitfall === 'erreur' && nq[1].skill === 'S');
  const ex = T.courseExtras({ duration: '12', objectives: ['a', 'b', 'c', 'd'], prerequisites: 'oops', pitfalls: ['x'] });
  check('courseExtras', ex.duration === 12 && ex.objectives.length === 3 && ex.prerequisites.length === 0 && ex.pitfalls.length === 1);
  check('courseExtras durée absurde ignorée', T.courseExtras({ duration: 9999 }).duration === 0);

  // ---- cours enrichi
  await h.go('#/course/c1'); const ctxt = $('#app').textContent;
  check('chapitre : durée + niveau Découverte + 4 activités', ctxt.includes('8 min') && ctxt.includes('Découverte') && $$('.act').length === 4, ctxt.slice(0, 200));
  await h.go('#/course/c1/lesson'); const txt = $('#app').textContent;
  check('leçon : objectifs, prérequis, erreurs fréquentes, « Ce que tu dois retenir »', ['Savoir lire une fraction', 'Les divisions', 'Erreurs fréquentes', 'Ce que tu dois retenir'].every(s => txt.includes(s)), txt.slice(0, 200));

  // ---- quiz : on rate toutes les questions « Lire une fraction » et on réussit « Comparer »
  await h.go('#/quiz/c1');
  let guard = 0;
  while (!$('h1') || $('h1').textContent !== 'Bilan de compétence') {
    if (++guard > 30) break;
    const q = $('#app .card b') && $('#app .card b').textContent;
    if ($('.choice')) {
      const wantWrong = /Question [12] /.test(q);
      const isVF = $$('.choice').some(b => b.textContent === 'Vrai');
      const idx = isVF ? 0 : 1; // bonne réponse : index 1 (qcm) / 0 (vf)
      const pick = wantWrong ? (idx === 1 ? 0 : 1) : idx;
      ($$('.choice').find(b => +b.dataset.k === pick) || $$('.choice')[pick]).click();
    } else if ($('#chk')) { $('#ans').value = 'trois'; $('#chk').click(); $('#yes').click(); }
    const nx = $('#nx'); if (nx) nx.click();
    await h.wait(5);
  }
  check('bilan affiché', $('h1').textContent === 'Bilan de compétence', $('h1') && $('h1').textContent);
  const c = T.db.courses[0];
  check('score enregistré (6 questions)', c.scores.length === 1 && c.scores[0].total === 6, JSON.stringify(c.scores));
  check('compétence Lire une fraction = Non acquise', T.skillLevel(c, 'Lire une fraction') === 'ko');
  check('compétence Comparer = Maîtrisée', T.skillLevel(c, 'Comparer') === 'ok');
  check('compétence sans nom -> Général', T.skillLevel(c, 'Général') === 'ok');
  check('historique des erreurs : 2', c.mistakes.length === 2 && c.mistakes[0].skill === 'Lire une fraction', JSON.stringify(c.mistakes.map(m => m.q)));
  const body = $('#app').textContent;
  check('bilan : compétences et plan', body.includes('Non acquise') && body.includes('Maîtrisée') && body.includes('Mon plan de révision') && body.includes('Lire une fraction') && body.includes('relis ce point'));
  check('bilan : recommandation', body.includes('Revois « Lire une fraction » avant de refaire un bilan.'));
  check('bilan : erreur fréquente affichée', body.includes('Ne pas confondre a et b'));
  // cartes depuis les erreurs : créées automatiquement
  check('2 cartes « Erreur fréquente » créées automatiquement', T.db.cards.length === 2 && T.db.cards.every(x => x.tag === 'erreur' && x.courseId === 'c1' && x.back.length <= 200), JSON.stringify(T.db.cards.map(x => x.front)));
  check('bilan : message flashcards créées + boutons', /2 flashcards créées/.test($('#app').textContent) && !!$('#seeErr') && !!$$('a.act').find(a => /missed/.test(a.getAttribute('href'))));
  check('pas de doublon (appel direct)', T.cardsFromMistakes(c, c.questions.slice(0, 2)) === 0 && T.db.cards.length === 2);
  $('#seeErr').click(); check('revoir mes erreurs : liste affichée', !$('#errs').hidden);
  await h.go('#/quiz/c1/missed');
  check('refaire seulement les ratées : 2 questions', /Question 1 \/ 2/.test($('#app').textContent), $('#app').textContent.slice(0, 80));
  await h.go('#/course/c1');

  // ---- quiz ciblé
  const weak = T.weakQuestions(c);
  check('quiz ciblé : seulement les notions fragiles', weak.length === 2 && weak.every(q => q.skill === 'Lire une fraction'));
  await h.go('#/quiz/c1/weak'); h.w.route && 0;
  check('quiz ciblé : 2 questions', /Question 1 \/ 2/.test($('#app').textContent), $('#app').textContent.slice(0, 80));

  // ---- session du jour
  const p = T.smartPlan();
  check('plan : cartes dues (les 2 cartes d\'erreur)', p.items.length === 2);
  check('plan : questions = notions fragiles', p.questions.length === 2 && p.questions.every(x => x.q.skill === 'Lire une fraction'));
  await h.go('#/daily');
  check('page session du jour', $('#app').textContent.includes('Entraînement du jour') && $('#app').textContent.includes('2 cartes') && $('#app .btn').getAttribute('href') === '#/daily/run', $('#app').textContent.slice(0, 200));
  check('conseil du jour', $('#app').textContent.includes('Revois « Lire une fraction »'));
  await h.go('#/daily/cards');
  check('révision smart : 2 cartes', /1 \/ 2/.test($('#app').textContent), $('#app').textContent.slice(0, 80));
  // fin de séance : on répond « Je sais » aux 2 cartes
  for (let n = 0; n < 2; n++) { await h.wait(30); $('#reveal').disabled = false; $('#reveal').click(); $$('.rate')[2].click(); const nx = $('#nx'); if (nx) nx.click(); }
  await h.wait(10);
  check('fin de séance : conseil + mini-quiz proposé', $('h1').textContent.startsWith('Quête terminée') && $('#app').textContent.includes('Conseil') && !!$$('a.btn').find(a => a.getAttribute('href') === '#/daily/quiz'), $('#app').textContent.slice(0, 200));
  await h.go('#/daily/quiz');
  check('mini-quiz', /Mini-quiz · Question 1 \/ 2/.test($('#app').textContent), $('#app').textContent.slice(0, 80));
  // mini-quiz : on répond juste -> compétence remonte, aucun score de cours ajouté
  const before = T.db.courses[0].scores.length;
  for (let n = 0; n < 2; n++) { ($$('.choice').find(b => +b.dataset.k === 1) || $$('.choice')[1]).click(); $('#nx').click(); await h.wait(5); }
  check('mini-quiz : pas de note ajoutée au cours', T.db.courses[0].scores.length === before);
  check('mini-quiz : bilan', $('h1').textContent === 'Bilan');
  check('compétence en progrès (1/2 → Fragile ou mieux)', T.skillLevel(T.db.courses[0], 'Lire une fraction') !== 'ko', JSON.stringify(T.db.courses[0].skills));

  // ---- maîtrise + badges
  check('maîtrise : En cours (quiz 4/6 + cartes non maîtrisées)', ['encours', 'presque'].includes(T.courseMastery(T.db.courses[0])), T.courseMastery(T.db.courses[0]));
  const s2 = mkStore(); s2.courses[0].scores = [{ date: 1, score: 6, total: 6 }, { date: 2, score: 6, total: 6 }];
  const h2 = make({ store: s2 }); check('maîtrise : Maîtrisé (quiz 100 %, sans cartes)', h2.t.courseMastery(h2.t.db.courses[0]) === 'maitrise');
  const bd = h2.t.computeBadges(); check('badges : Quiz parfait + Chapitre terminé obtenus, pas les cartes', bd.find(b => b.id === 'q1').got && bd.find(b => b.id === 'c1').got && !bd.find(b => b.id === 'm10').got);
  await h2.go('#/'); check('accueil : badges', h2.$$('.badge.got').length === 2 && h2.$$('.badge').length === 8);
  const s3 = mkStore(); s3.activity.days = Array.from({ length: 5 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });
  const h3 = make({ store: s3 }); check('badge « 5 jours de suite »', h3.t.computeBadges().find(b => b.id === 's5').got);
  // migration d'un ancien cours (sans skills / mistakes)
  const old = mkStore(); delete old.courses[0].skills; delete old.courses[0].mistakes; delete old.courses[0].questions[0].skill;
  const h4 = make({ store: old }); await h4.go('#/course/c1'); check('ancien cours : s\'affiche sans erreur', h4.errors.length === 0 && h4.$('h1').textContent === 'Fractions', h4.errors.join('|'));
  // accueil sans rien à faire
  const h5 = make({ store: { v: 2, settings: {}, courses: [], cards: [], decks: [], activity: { days: [] } } }); await h5.go('#/daily');
  check('session du jour vide : message', h5.$('#app').textContent.includes('Rien de prioritaire'));
  check('aucune erreur JS', h.errors.length + h2.errors.length === 0, h.errors.concat(h2.errors).join('|'));
  done();
})();
