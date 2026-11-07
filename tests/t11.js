const { make, check, done } = require('./harness');
(async () => {
  const mk = st => make({ store: { v: 2, settings: Object.assign({ apiKey: 'k', level: '6e' }, st || {}), courses: [], cards: [], decks: [], activity: { days: [] } } });
  const h = mk(), { w, $, $$ } = h, T = h.t;
  const dbx = () => T.db || w.eval('db');
  // thème par défaut
  check('thème par défaut = systeme', w.document.documentElement.dataset.theme === 'systeme' && dbx().settings.theme === 'systeme');
  check('theme-color systeme', w.document.querySelector('meta[name="theme-color"]').content === '#060a14');
  await h.go('#/'); const hh1 = $('h1').textContent; await h.go('#/progress');
  check('progrès Système : fiche + quête', !!$('.status') && /Quête quotidienne/.test($('.quest').textContent) && /Niv\. 1/.test($('.status').textContent) && $('.st-rank').textContent === 'E');
  check('accueil Système : bienvenue chasseur', /chasseur/i.test(hh1));
  check('pas de vocabulaire magique', !/sorci|grimoire|magi|Académie|ensorcel/i.test($('#app').textContent), $('#app').textContent.slice(0, 200));
  // niveaux
  const lv = x => T.levelOf(x);
  check('niveaux: 0->1, 50->2, 200->3', lv(0) === 1 && lv(49) === 1 && lv(50) === 2 && lv(199) === 2 && lv(200) === 3);
  check('rangs: E,D,C,B,A,S', [1, 5, 10, 17, 25, 35].map(T.rankOf).join('') === 'EDCBAS' && T.rankOf(4) === 'E' && T.rankOf(34) === 'A');
  // XP via cartes
  const c = T.newCard({ subject: 'maths', front: 'a', back: 'b' }); dbx().cards.push(c);
  T.gradeItem(c, 'fwd', 'yes');
  check('XP carte "je sais" +10', dbx().activity.xp === 10 && dbx().activity.today.cards === 1, dbx().activity.xp);
  T.gradeItem(c, 'fwd', 'almost'); T.gradeItem(c, 'fwd', 'no');
  check('XP presque +5, raté +2', dbx().activity.xp === 17);
  // quête
  for (let i = 0; i < 9; i++) T.gradeItem(c, 'fwd', 'no');
  const qa = T.questState(); check('quête: 12 cartes comptées, pas finie (0 question)', qa.cards === 12 && !qa.done);
  const xp0 = dbx().activity.xp;
  const course = { id: 'c1', subject: 'maths', questions: [], skills: {}, mistakes: [], scores: [] };
  dbx().courses.push(course);
  const q = { type: 'vf', q: 'x ?', answer: 'Vrai', skill: 'S' };
  T.recordQuizResults([1, 2, 3].map(() => ({ q, c: course, ok: true })));
  check('quête accomplie (+50) et XP quiz (+6 x3)', T.questState().done && dbx().activity.xp === xp0 + 18 + 50, dbx().activity.xp - xp0);
  const xp1 = dbx().activity.xp; T.recordQuizResults([{ q, c: course, ok: true }]);
  check('quête pas payée deux fois', dbx().activity.xp === xp1 + 6);
  // reset au jour suivant
  dbx().activity.today.date = '2000-01-01';
  check('quête remise à zéro le lendemain', T.questState().cards === 0 && !T.questState().done);
  // level-up toast
  dbx().activity.xp = 45; T.addXP(10);
  check('toast niveau', /Niveau 2/.test(w.document.getElementById('toast').textContent));
  // sélecteur de thème
  await h.go('#/settings');
  const sel = $('#theme');
  check('réglages: 3 thèmes', !!sel && sel.options.length === 3 && sel.value === 'systeme');
  sel.value = 'anime'; h.change(sel);
  check('thème anime appliqué + sauvegardé', w.document.documentElement.dataset.theme === 'anime' && dbx().settings.theme === 'anime' && w.document.querySelector('meta[name="theme-color"]').content === '#ff7eb6');
  await h.go('#/'); const h1a = $('h1').textContent; await h.go('#/progress');
  check('anime: textes + médailles', /Bienvenue sur Révizio/.test(h1a) && /Médailles/.test($('#app').textContent) && /Motivé/.test($('.badges').textContent));
  const sel2 = (await h.go('#/settings'), $('#theme')); sel2.value = 'parchemin'; h.change(sel2);
  await h.go('#/'); const h1p = $('h1').textContent; await h.go('#/progress');
  check('parchemin: textes magiques conservés', /Académie/.test(h1p) && /Distinctions/.test($('#app').textContent) && /Apprenti assidu/.test($('.badges').textContent));
  // thème inconnu -> défaut
  const h2 = mk({ theme: 'zzz' }); check('thème inconnu -> systeme', h2.w.document.documentElement.dataset.theme === 'systeme');
  // migration ancienne sauvegarde sans xp
  const m = T.migrate({ settings: {}, activity: { days: ['2026-01-01'] } });
  check('migration: xp et quête initialisés', m.activity.xp === 0 && m.activity.today && m.settings.theme === 'systeme');
  check('aucune erreur JS', h.errors.length === 0 && h2.errors.length === 0, h.errors.join('|'));
  done();
})();
