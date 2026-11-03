/* Révizio — suivi des apprentissages : compétences, bilan de quiz, maîtrise des chapitres,
   révision intelligente (session du jour), recommandations et badges. Aucune donnée n'quitte l'appareil. */
'use strict';

/* ---------- Compétences (une « compétence » = la notion travaillée par une question) ---------- */
const SKILL_LV = { ok: 'Maîtrisée', frag: 'Fragile', ko: 'Non acquise' };
const SKILL_CLASS = { ok: 'lv-maitrisee', frag: 'lv-cours', ko: 'lv-revoir' };
const skillOf = q => (q && q.skill) || 'Général';
const ratioLevel = r => (r >= 0.8 ? 'ok' : r >= 0.5 ? 'frag' : 'ko');
/* niveau d'une compétence d'après ses 8 derniers résultats (null si jamais travaillée) */
function skillLevel(c, name) {
  const s = c.skills && c.skills[name];
  if (!s || !s.r || !s.r.length) return null;
  return ratioLevel(s.r.reduce((a, b) => a + b, 0) / s.r.length);
}
/* Enregistre le résultat d'un quiz : compétences, historique des erreurs, activité. results = [{q, c, ok}] */
function recordQuizResults(results) {
  results.forEach(({ q, c, ok }) => {
    if (!c) return;
    c.skills = c.skills || {}; c.mistakes = c.mistakes || [];
    const name = skillOf(q), s = c.skills[name] || (c.skills[name] = { r: [] });
    s.r.push(ok ? 1 : 0); s.r = s.r.slice(-8);
    if (!ok) {
      c.mistakes = c.mistakes.filter(m => m.q !== q.q);
      c.mistakes.push({ q: q.q, answer: answerText(q), skill: name, pitfall: q.pitfall || '', explanation: q.explanation || '', date: Date.now() });
      c.mistakes = c.mistakes.slice(-40);
    }
  });
  markActivity(); save();
}
const answerText = q => (q.type === 'qcm' ? q.choices[q.answer] : q.answer);
/* Questions « ciblées » d'un cours : compétences fragiles / non acquises, ou questions déjà ratées */
function weakQuestions(c) {
  const missed = new Set((c.mistakes || []).map(m => m.q));
  return (c.questions || []).filter(q => missed.has(q.q) || ['frag', 'ko'].includes(skillLevel(c, skillOf(q))));
}
/* Cartes « Erreur fréquente » à partir des questions ratées (sans doublon) */
function cardsFromMistakes(c, wrong) {
  const out = [];
  wrong.forEach(q => {
    const isVF = q.type === 'qcm' && q.choices.length === 2 && q.choices[0] === 'Vrai';
    const front = clip((isVF ? 'Vrai ou faux : ' : '') + q.q, 200);
    if (db.cards.some(x => x.courseId === c.id && x.front === front) || out.some(x => x.front === front)) return;
    out.push(newCard({ subject: c.subject, chapter: c.title, courseId: c.id, tag: 'erreur', front, back: clip(answerText(q), MAX_BACK), explain: clip(q.explanation || q.pitfall || '', 220) }));
  });
  db.cards.push(...out); save();
  return out.length;
}

/* ---------- Niveau de maîtrise d'un chapitre ---------- */
const MASTERY_COURSE = { decouverte: 'Découverte', encours: 'En cours', presque: 'Presque acquis', maitrise: 'Maîtrisé' };
function courseMastery(c) {
  const cs = cardsOf(c.id), sc = avgScore(c);
  const mastered = cs.filter(x => cardLevel(x) === 'maitrisee').length, share = cs.length ? mastered / cs.length : null;
  const touched = cs.some(x => x.fwd && x.fwd.last) || sc !== null;
  if (!touched) return 'decouverte';
  const parts = [sc !== null ? sc / 100 : null, share].filter(v => v !== null);
  const m = parts.reduce((a, b) => a + b, 0) / parts.length;
  if (m >= 0.8 && sc !== null) return 'maitrise';
  if (m >= 0.55) return 'presque';
  return 'encours';
}
const masteryChip = c => `<span class="chip mastery-${courseMastery(c)}">${MASTERY_COURSE[courseMastery(c)]}</span>`;

/* ---------- Révision intelligente : session quotidienne de 10 à 15 minutes ---------- */
const SMART_CARDS = 12, SMART_QUESTIONS = 5;
function smartPlan() {
  // cartes dues : d'abord les plus fragiles (beaucoup d'échecs, étape basse), jamais une file infinie
  const items = dueItems().sort((a, b) => {
    const sa = stateOf(a.card, a.dir), sb = stateOf(b.card, b.dir);
    return (sb.lapses || 0) - (sa.lapses || 0) || sa.step - sb.step;
  }).slice(0, SMART_CARDS);
  // questions : uniquement sur les notions fragiles, réparties entre les cours
  const pools = db.courses.map(c => ({ c, qs: shuffle(weakQuestions(c)) })).filter(p => p.qs.length);
  const questions = []; let k = 0;
  while (questions.length < SMART_QUESTIONS && pools.some(p => p.qs.length > k)) {
    pools.forEach(p => { if (p.qs[k] && questions.length < SMART_QUESTIONS) questions.push({ q: p.qs[k], c: p.c }); });
    k++;
  }
  return { items, questions, minutes: Math.max(3, Math.round(items.length * 0.5 + questions.length * 1)) };
}

/* ---------- Recommandation claire (accueil, fin de séance, fin de quiz) ---------- */
function recommend() {
  let weakest = null;
  db.courses.forEach(c => Object.keys(c.skills || {}).forEach(name => {
    const lv = skillLevel(c, name);
    if (lv && lv !== 'ok' && (!weakest || (lv === 'ko' && weakest.lv !== 'ko'))) weakest = { c, name, lv };
  }));
  if (weakest) return `Revois « ${weakest.name} » (${weakest.c.title}) avant de repasser le quiz bilan.`;
  const due = dueItems();
  if (due.length) {
    const byCourse = {}; due.forEach(i => { byCourse[i.card.courseId] = (byCourse[i.card.courseId] || 0) + 1; });
    const top = Object.entries(byCourse).sort((a, b) => b[1] - a[1])[0], c = getCourse(top[0]);
    return c ? `Fais d'abord tes cartes de « ${c.title} » : ${top[1]} à revoir aujourd'hui.` : `Fais tes ${due.length} cartes à revoir aujourd'hui.`;
  }
  const todo = db.courses.filter(c => c.questions.length && courseMastery(c) !== 'maitrise' && !c.scores.length)[0];
  if (todo) return `Passe le quiz de « ${todo.title} » pour savoir où tu en es.`;
  return db.courses.length ? 'Tout est à jour, bravo ! Choisis un nouveau chapitre ou reviens demain.' : '';
}

/* ---------- Badges (sobres, sans comparaison avec d'autres élèves) ---------- */
function computeBadges() {
  const mastered = db.cards.filter(c => cardLevel(c) === 'maitrisee').length;
  const done = db.courses.filter(c => courseMastery(c) === 'maitrise').length;
  const best = Math.max(streak(), 0);
  const perfect = db.courses.some(c => c.scores.some(s => s.total >= 5 && s.score === s.total));
  return [
    { id: 's5', ico: '🔥', label: '5 jours de suite', got: best >= 5 },
    { id: 's20', ico: '🔥', label: '20 jours de suite', got: best >= 20 },
    { id: 'm10', ico: '🧠', label: '10 cartes maîtrisées', got: mastered >= 10 },
    { id: 'm50', ico: '🧠', label: '50 cartes maîtrisées', got: mastered >= 50 },
    { id: 'm100', ico: '🧠', label: '100 cartes maîtrisées', got: mastered >= 100 },
    { id: 'q1', ico: '✅', label: 'Quiz parfait', got: perfect },
    { id: 'c1', ico: '🎓', label: 'Chapitre terminé', got: done >= 1 },
    { id: 'c5', ico: '🎓', label: '5 chapitres terminés', got: done >= 5 },
  ];
}
