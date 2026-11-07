const { make, check, done } = require('./harness');
const fs = require('fs');
const P = __dirname + '/../packs/', pack = n => JSON.parse(fs.readFileSync(P + n, 'utf8'));
const fetchImpl = async u => { const f = P + String(u).replace(/^packs\//, ''); if (!fs.existsSync(f)) return { ok: false }; const j = JSON.parse(fs.readFileSync(f, 'utf8')); return { ok: true, json: async () => j }; };
(async () => {
  // tous les packs : chaque chapitre dont la méthode est écrite respecte la structure (étapes, ordre, cartes)
  { let nm = 0, bad = '';
    fs.readdirSync(P).filter(f => /^(CM|\d)/.test(f)).forEach(f => pack(f).courses.forEach(c => { const m = c.lesson.find(s => s.method); if (!m) return; nm++;
      const o = c.questions.filter(q => q.type === 'ordre' && /^méthode/.test(q.skill)); const k = (c.cards || []).filter(x => x.tag === 'methode');
      if (m.steps.length < 4 || o.length !== 1 || o[0].items.length !== m.steps.length || k.length !== 1 || !/^1\. /.test(k[0].a) || k[0].say !== false) bad += f + ':' + c.catalogTitle + ' '; }));
    check('tous packs : ' + nm + ' chapitres avec méthode, étapes/ordre/carte cohérents', nm >= 200 && !bad, bad); }
  const pk = pack('6e-francais.json');
  check('pack 6e Français : chaque chapitre a une méthode en ≥ 4 étapes', pk.courses.length === 11 && pk.courses.every(c => { const m = c.lesson.find(s => s.method); return m && m.steps.length >= 4 && m.steps.length <= 6 && m.content; }));
  check('pack 6e Français : exercices de méthode (ordre des étapes + applications) dans chaque chapitre', pk.courses.every(c => { const mq = c.questions.filter(q => /^méthode/.test(q.skill)); return mq.length >= 5 && mq.some(q => q.type === 'ordre') && mq.filter(q => q.type !== 'ordre').length >= 4; }));
  check('l\'ordre des étapes de la méthode correspond au nombre d\'étapes', pk.courses.every(c => { const m = c.lesson.find(s => s.method), o = c.questions.find(q => q.type === 'ordre' && /^méthode/.test(q.skill)); return o && o.items.length === m.steps.length; }));
  check('plus de section « Méthode » générique en doublon', pk.courses.every(c => c.lesson.filter(s => s.method || /^Méthode/.test(s.title)).length === 1));
  const st = () => ({ v: 2, settings: { level: '6e', apiKey: '', name: 'Léo' }, courses: [], cards: [], decks: [], activity: { days: [] } });
  const h = make({ store: st(), fetchImpl }), T = h.t; await h.wait(80);
  T.importPack(pk);
  const c0 = T.db.courses.find(c => c.catalogTitle === 'Sujet et verbe');
  check('import : la méthode et ses étapes sont conservées', c0.lesson.some(s => s.method && s.steps.length === 5));
  check('import : pas de doublon de questions', new Set(c0.questions.map(q => q.q)).size === c0.questions.length);
  // élève qui avait déjà importé l'ancienne version : la mise à jour ajoute la méthode, une seule fois
  T.db.courses.forEach(c => { c.lesson = c.lesson.filter(s => !s.method); c.lesson.push({ title: 'Méthode', content: 'ancienne', examples: [] }); c.questions = c.questions.filter(q => !/^méthode/.test(q.skill)); });
  T.db.cards = T.db.cards.filter(k => k.tag !== 'methode');
  const before = T.db.courses.reduce((n, c) => n + c.questions.length, 0);
  T.db.settings.fixesDone = (T.db.settings.fixesDone || []).filter(x => x !== 'v323-methods-francais-6e');
  await T.applyCorrections();
  const after = T.db.courses.reduce((n, c) => n + c.questions.length, 0);
  check('mise à jour : méthode remplacée, exercices de méthode ajoutés', T.db.courses.every(c => c.lesson.filter(s => s.method).length === 1 && !c.lesson.some(s => s.title === 'Méthode' && !s.method)) && after - before >= 11 * 5, (after - before) + ' ajoutées');
  check('mise à jour : une carte « méthode » par chapitre (répétition espacée)', T.db.cards.filter(k => k.tag === 'methode').length === 11 && T.db.cards.filter(k => k.tag === 'methode').every(k => /^Les étapes de la méthode/.test(k.front)));
  check('mise à jour : marquée faite, non rejouée', T.db.settings.fixesDone.includes('v323-methods-francais-6e'));
  T.db.settings.fixesDone = T.db.settings.fixesDone.filter(x => x !== 'v323-methods-francais-6e'); await T.applyCorrections();
  check('mise à jour rejouée : aucun doublon', T.db.courses.reduce((n, c) => n + c.questions.length, 0) === after);
  // affichage
  await h.go('#/course/' + c0.id + '/lesson'); await h.wait(30);
  check('leçon : encadré 🧭 Méthode en premier, étapes numérotées', !!h.$('.methodbox') && h.$$('.methodbox ol.steps li').length === 5 && h.$('#app').innerHTML.indexOf('methodbox') < h.$('#app').innerHTML.indexOf('<h3>Trouver le sujet'));
  const pool = Array.from({ length: 30 }, (_, i) => ({ type: 'qcm', q: 'Q' + i, choices: ['a', 'b'], answer: 0, skill: i < 6 ? 'méthode : x' : 'autre' }));
  let okB = true; for (let k = 0; k < 40; k++) { const r = T.pickWithMethod(pool, 15); if (r.length !== 15 || r.filter(T.isMethodQ).length < 3 || new Set(r.map(x => x.q)).size !== 15) okB = false; }
  check('bilan : toujours ≥ 3 questions de méthode, 15 questions, sans doublon', okB);
  check('bilan : chapitre sans méthode → tirage normal', T.pickWithMethod(pool.slice(6), 10).length === 10);
  check('aucune erreur JS', h.errors.length === 0, h.errors.join('|'));
  done();
})();
