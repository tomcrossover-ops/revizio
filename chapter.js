/* Révizio — parcours « matière → chapitre → activité ».
   Écran d'une matière, écran d'un chapitre (4 activités au choix, la leçon est facultative),
   leçon, quiz d'entraînement (sans note, répétable, erreurs → flashcards + exercices ciblés). */
'use strict';

const qid = q => q.id || q.q;
const backLink = (href, label) => `<a class="backlink" href="${href}">← ${esc(label)}</a>`;
const plural = (n, s, p = s + 's') => `${n} ${n > 1 ? p : s}`;
const TRAIN_N = 8, TARGET_N = 5, BILAN_MAX = 15, BILAN_MIN = 10;

/* ---------- Écran d'une matière : mes chapitres + chapitres du programme ---------- */
function viewSubject(key) {
  if (!SUBJECTS[key] || key === 'autre') { location.hash = '#/'; return; }
  const s = subj(key), lvl = db.settings.level || '6e';
  const mine = db.courses.filter(c => c.subject === key).sort((a, b) => b.createdAt - a.createdAt);
  const cat = chaptersFor(lvl, key).map((ch, i) => ({ i, title: ch[0], notions: ch[1] })).filter(ch => !db.courses.some(c => c.subject === key && c.catalogTitle === ch.title));
  $app.innerHTML = `${backLink('#/', 'Accueil')}
    <div class="row between"><h1>${esc(s.emoji)} ${esc(s.label)}</h1><select id="lvl" aria-label="Classe" style="width:auto">${LEVELS.map(l => `<option ${l === lvl ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    ${mine.length ? `<h2>Mes chapitres</h2>${mine.map(courseCard).join('')}` : ''}
    <h2>Chapitres du programme · ${esc(lvl)}</h2>
    ${cat.length && hasAI() ? cat.map(ch => `<a class="card course" data-title="${esc(ch.title)}" href="#/new?subject=${key}&level=${encodeURIComponent(lvl)}&ch=${ch.i}&go=1" style="--sc:${s.color}"><div class="row between"><b>${esc(ch.title)}</b><span class="chip">✨ Préparer</span></div><div class="muted">${esc(clip(ch.notions, 110))}</div></a>`).join('')
      : `<div class="card muted">${!chaptersFor(lvl, key).length ? 'Pas de chapitres prédéfinis pour cette classe.' : cat.length ? 'Pas de chapitre prêt pour cette classe. Reviens plus tard !' : 'Tous les chapitres du programme sont déjà là. Bravo !'}</div>`}
    ${hasAI() ? `<a class="btn ghost" href="#/new?subject=${key}&level=${encodeURIComponent(lvl)}">Autre chapitre…</a>` : ''}`;
  document.getElementById('lvl').onchange = ev => { db.settings.level = ev.target.value; save(); viewSubject(key); };
  // chapitres déjà écrits (packs) : ajoutés directement, sans clic ni IA
  autoImportReady(lvl, key).then(r => {
    if (r.added && location.hash === '#/subject/' + key) { toast(packMsg(r)); viewSubject(key); }
  }).catch(() => {});
}

/* ---------- Écran d'un chapitre : « Choisis ce que tu veux faire » ---------- */
function chapterGroups(c) {
  const g = { ok: [], frag: [], ko: [], none: [] };
  [...new Set((c.questions || []).map(skillOf))].forEach(n => g[skillLevel(c, n) || 'none'].push(n));
  return g;
}
function recommended(c) {
  const due = dueItems(x => x.courseId === c.id, { all: true }).length;
  const touched = Object.keys(c.skills || {}).length || c.scores.length || cardsOf(c.id).some(x => x.fwd && x.fwd.last);
  if (!touched && !(c.path || {}).read) return c.lesson && c.lesson.length ? 'lesson' : (c.questions.length ? 'train' : 'cards');
  if (due) return 'cards';
  if (c.questions.length && !c.trained) return 'train';
  if (weakQuestions(c).length) return 'target';
  return c.questions.length ? 'bilan' : 'cards';
}
function chapterActions(c) {
  const id = c.id, n = cardsOf(id).length, due = dueItems(x => x.courseId === id, { all: true }).length, qn = (c.questions || []).length;
  const tn = Math.min(TRAIN_N, qn), bn = Math.min(BILAN_MAX, qn);
  return {
    lesson: { ico: '📖', label: 'Relire la leçon', sub: `≈ ${c.duration || 5} min · facultatif`, href: `#/course/${id}/lesson`, ok: !!((c.lesson && c.lesson.length) || c.summary) },
    cards: { ico: '🃏', label: 'Réviser avec des flashcards', sub: due ? `${plural(due, 'carte')} à revoir aujourd'hui · ≈ ${Math.max(1, Math.round(due * 0.5))} min` : n ? `${plural(n, 'carte')} · rien à revoir aujourd'hui` : 'Pas encore de cartes', href: `#/review/course/${id}`, ok: n > 0 },
    train: { ico: '✏️', label: 'Quiz d\'entraînement', sub: `${plural(tn, 'question')} · sans note · ≈ ${Math.max(2, Math.round(tn * 0.8))} min`, href: `#/train/${id}`, ok: qn > 0 },
    bilan: { ico: '🎯', label: 'Bilan de compétence', sub: `${plural(bn, 'question')} · ≈ ${Math.max(3, Math.round(bn * 0.9))} min`, href: `#/quiz/${id}`, ok: qn > 0 },
    target: { ico: '🎯', label: 'Exercices ciblés', sub: `Sur tes notions fragiles · ≈ 4 min`, href: `#/train/${id}/target`, ok: qn > 0 },
  };
}
async function generateMore(c, focus) {
  const known = cardsOf(c.id).map(x => x.front).concat(c.questions.map(q => q.q)).join(' | ');
  const text = `Résumé : ${c.summary}\nPoints clés :\n- ${(c.keyPoints || []).join('\n- ')}`;
  const r = await callClaude(await buildContent([], text, c.subject, c.title, `Génère de NOUVELLES cartes et questions, différentes de celles-ci : ${known.slice(0, 2500)}${focus ? ` Concentre-toi sur ces notions : ${focus}.` : ''}`));
  const cards = normCards(r.cards, { subject: c.subject, chapter: c.title, courseId: c.id }), qs = normQuestions(r.questions);
  db.cards.push(...cards); c.questions.push(...qs); save();
  return { cards: cards.length, questions: qs.length };
}
function viewCourse(id) {
  const c = getCourse(id);
  if (!c) { location.hash = '#/'; return; }
  c.lastOpened = Date.now(); save(); // sert à classer « Derniers cours »
  const A = chapterActions(c), rec = recommended(c), g = chapterGroups(c), hasQ = c.questions.length > 0;
  const recA = A[rec], mistakes = (c.mistakes || []).slice(-3).reverse();
  const act = k => { const a = A[k]; const cls = `act${k === rec || (rec === 'target' && k === 'train') ? ' rec' : ''}${a.ok ? '' : ' off'}`; const inner = `<span class="ai">${a.ico}</span><span class="at"><b>${esc(a.label)}</b><small>${esc(a.sub)}</small></span>${k === rec ? '<span class="star">Conseillé</span>' : ''}`; return a.ok ? `<a class="${cls}" href="${a.href}">${inner}</a>` : `<div class="${cls}" aria-disabled="true">${inner}</div>`; };
  const list = (title, cls, arr) => arr.length ? `<div class="gr"><span class="chip ${cls}">${title} (${arr.length})</span> <span class="muted">${arr.map(esc).join(' · ')}</span></div>` : '';
  $app.innerHTML = `
    ${backLink('#/subject/' + c.subject, subj(c.subject).label)}
    <div class="row between"><h1>${esc(c.title)}</h1>${subjChip(c.subject)}</div>
    <div class="row" style="margin-bottom:10px">${masteryChip(c)}${c.level ? `<span class="chip">${esc(c.level)}</span>` : ''}${c.duration ? `<span class="chip">📖 ${c.duration} min</span>` : ''}</div>
    ${recA && recA.ok ? `<a class="btn big" href="${recA.href}">▶ Commencer : ${esc(recA.label)}</a>` : ''}
    <h2>Choisis ce que tu veux faire</h2>
    <div class="acts">${act('lesson')}${act('cards')}${act('train')}${act('bilan')}</div>
    ${hasQ ? `<h2>Où j'en suis</h2><div class="card">
      ${list('✔ Maîtrisées', 'lv-maitrisee', g.ok)}${list('⚠ Fragiles', 'lv-cours', g.frag)}${list('✖ Non acquises', 'lv-revoir', g.ko)}${list('○ Pas encore travaillées', '', g.none)}
      ${c.scores.length ? `<div class="muted" style="margin-top:8px">Mes bilans : ${c.scores.slice(-4).reverse().map(s => `${s.score}/${s.total} (${fmtDate(s.date)})`).join(' · ')}</div>` : ''}</div>` : ''}
    ${mistakes.length ? `<h2>Mes dernières erreurs</h2><div class="card">${mistakes.map(x => `<div style="margin-bottom:8px"><div class="muted">${fmtDate(x.date)} · ${esc(x.skill)}</div><b>${esc(x.q)}</b><div>Réponse : ${esc(x.answer)}</div></div>`).join('')}${weakQuestions(c).length ? `<a class="btn ghost" href="#/train/${id}/target">Exercices ciblés</a>` : ''}</div>` : ''}
    <div class="row" style="margin-top:12px">
      ${hasAI() ? `<button class="ghost" id="more">Générer d'autres exercices</button>` : ''}
      <button class="danger" id="del">Supprimer ce chapitre</button>
      <span id="st"></span>
    </div>`;
  document.getElementById('del').onclick = () => {
    if (confirm(`Supprimer ce chapitre, ses ${cardsOf(id).length} carte(s) et ses exercices ?`)) {
      removeCards(cardsOf(id).map(x => x.id)); db.courses = db.courses.filter(x => x.id !== id); save(); location.hash = '#/subject/' + c.subject;
    }
  };
  const moreBtn = document.getElementById('more');
  if (moreBtn) moreBtn.onclick = async () => {
    const st = document.getElementById('st'), btn = document.getElementById('more');
    btn.disabled = true; st.innerHTML = '<span class="spinner"></span> Génération…';
    try { await generateMore(c); toast('Nouveaux exercices ajoutés ✔'); viewCourse(id); }
    catch (e) { st.innerHTML = `<span class="err">${esc(e.message)}</span>`; btn.disabled = false; }
  };
}

/* ---------- La leçon (facultative) ---------- */
function viewLesson(id) {
  const c = getCourse(id);
  if (!c) { location.hash = '#/'; return; }
  $app.innerHTML = `
    ${backLink('#/course/' + id, 'Chapitre')}
    <div class="row between"><h1>${esc(c.title)}</h1>${subjChip(c.subject)}</div>
    ${c.objectives && c.objectives.length ? `<div class="card"><h2 style="margin-top:0">Objectifs</h2><ul class="points">${c.objectives.map(p => `<li>${esc(p)}</li>`).join('')}</ul>${c.prerequisites && c.prerequisites.length ? `<div class="muted"><b>À connaître avant :</b> ${c.prerequisites.map(esc).join(' · ')}</div>` : ''}</div>` : ''}
    <div class="card"><h2 style="margin-top:0">Résumé</h2><p>${esc(c.summary)}</p></div>
    ${lessonHtml(c)}
    ${c.pitfalls && c.pitfalls.length ? `<div class="card"><h2 style="margin-top:0">Erreurs fréquentes</h2><ul class="points">${c.pitfalls.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>` : ''}
    <div class="card"><h2 style="margin-top:0">Ce que tu dois retenir</h2><ul class="points">${(c.keyPoints || []).map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>
    <a class="btn big" href="#/course/${id}" id="lessondone">J'ai fini : choisir une activité</a>`;
  document.getElementById('lessondone').onclick = () => { if (!(c.path || {}).read) { c.path = Object.assign(c.path || {}, { read: true }); addXP(XP_GAIN.read); save(); } };
}

/* ---------- Quiz d'entraînement : sans note, sans chrono, répétable ---------- */
function pickTrain(c, n) {
  const last = new Set(c.lastTrain || []);
  let pool = c.questions.slice();
  const fresh = pool.filter(q => !last.has(qid(q)));
  if (fresh.length >= Math.min(n, pool.length)) pool = fresh; // on évite de reposer les mêmes questions
  const weak = new Set(weakQuestions(c).map(qid));
  pool = shuffle(pool);
  const picked = pool.filter(q => weak.has(qid(q))).slice(0, Math.ceil(n / 2));
  pool.forEach(q => { if (picked.length < n && !picked.includes(q)) picked.push(q); });
  // varier les formats : on évite deux fois le même type de suite quand c'est possible
  const out = []; let lastType = '';
  const rest = shuffle(picked);
  while (rest.length) { const j = rest.findIndex(q => q.type !== lastType); const q = rest.splice(j < 0 ? 0 : j, 1)[0]; out.push(q); lastType = q.type; }
  return out;
}
function remediationNote(c, q) {
  const skill = skillOf(q), m = (c.mistakes || []).slice().reverse().find(x => x.skill === skill);
  const txt = m ? (m.pitfall || m.explanation) : q.pitfall;
  return `<div class="explain">📌 <b>Rappel : ${esc(skill)}</b>${txt ? ` — ${esc(txt)}` : ''}</div>`;
}
function viewTrain(id, mode) {
  const c = getCourse(id);
  if (!c) { location.hash = '#/'; return; }
  const target = mode === 'target';
  let qs;
  if (target) {
    const weak = shuffle(weakQuestions(c)), last = new Set(c.lastTrain || []), fresh = weak.filter(q => !last.has(qid(q)));
    qs = (fresh.length >= 3 ? fresh : weak).slice(0, TARGET_N);
  } else qs = pickTrain(c, TRAIN_N);
  if (!qs.length) { toast(target ? 'Aucune notion fragile : bravo !' : 'Pas de questions pour ce chapitre.'); location.hash = '#/course/' + id; return; }
  c.lastTrain = qs.map(qid);
  let i = 0; const results = [];
  const title = target ? 'Exercices ciblés' : 'Quiz d\'entraînement';
  const step = () => {
    if (i >= qs.length) return end();
    const q = qs[i];
    $app.innerHTML = `${backLink('#/course/' + id, 'Chapitre')}
      <div class="row between"><span class="muted">${title} · ${i + 1} / ${qs.length}</span><span class="chip">Sans note</span></div>
      <div class="bar" style="margin:8px 0"><i style="width:${i / qs.length * 100}%"></i></div>
      ${target ? remediationNote(c, q) : ''}
      <div class="card"><b>${qHtml(q)}</b><div class="muted" style="margin-top:4px;font-size:.8rem">${exLabel(q)} ${levelDots(q)}</div></div><div id="body"></div>`;
    const body = document.getElementById('body');
    renderExercise(q, body, ok => {
      results.push({ q, c, ok });
      body.insertAdjacentHTML('beforeend', `${q.explanation ? `<div class="explain">${esc(q.explanation)}</div>` : ''}${!ok && q.pitfall ? `<div class="explain"><b>Erreur fréquente :</b> ${esc(q.pitfall)}</div>` : ''}<button id="nx" class="big" style="width:100%;margin-top:10px">${i + 1 < qs.length ? 'Suivant' : 'Voir mes résultats'}</button>`);
      document.getElementById('nx').onclick = () => { i++; step(); };
    });
  };
  const end = () => {
    recordQuizResults(results); c.trained = true;
    const wrong = results.filter(r => !r.ok).map(r => r.q), okN = results.length - wrong.length;
    const made = wrong.length ? cardsFromMistakes(c, wrong) : 0; // les erreurs deviennent des flashcards, sans rien demander
    const groups = {};
    results.forEach(r => { const g = groups[skillOf(r.q)] || (groups[skillOf(r.q)] = { ok: 0, n: 0 }); g.n++; if (r.ok) g.ok++; });
    const rows = Object.entries(groups).map(([name, x]) => ({ name, ...x, lv: ratioLevel(x.ok / x.n) }));
    const good = rows.filter(r => r.lv === 'ok'), weak = rows.filter(r => r.lv !== 'ok');
    const sentence = !weak.length ? `Tu maîtrises ${good.map(r => `« ${esc(r.name)} »`).join(', ')}. Tu peux tenter le bilan de compétence.`
      : `${good.length ? `Tu maîtrises ${good.map(r => `« ${esc(r.name)} »`).join(', ')}. ` : ''}Revois ${weak.map(r => `« ${esc(r.name)} »`).join(', ')}.`;
    $app.innerHTML = `${backLink('#/course/' + id, 'Chapitre')}
      <h1>${title} terminé ✔</h1>
      <div class="card"><div class="score">${okN} bonne${okN > 1 ? 's' : ''} réponse${okN > 1 ? 's' : ''} sur ${results.length}</div><p style="text-align:center;margin-bottom:0">${sentence}</p></div>
      ${wrong.length ? `<div class="card">🃏 ${made ? `<b>${plural(made, 'flashcard')} créée${made > 1 ? 's' : ''}</b> à partir de tes erreurs.` : 'Tes erreurs sont déjà dans tes flashcards.'} Elles reviendront dans tes révisions.</div>` : ''}
      <div class="card">
        ${good.length ? `<div class="gr"><span class="chip lv-maitrisee">✔ Réussies</span> <span class="muted">${good.map(r => esc(r.name)).join(' · ')}</span></div>` : ''}
        ${weak.length ? `<div class="gr"><span class="chip lv-revoir">À revoir</span> <span class="muted">${weak.map(r => esc(r.name)).join(' · ')}</span></div>` : ''}
      </div>
      <div class="acts" id="acts">
        ${wrong.length ? `<button class="act" id="seeErr"><span class="ai">🔍</span><span class="at"><b>Revoir mes erreurs</b><small>${plural(wrong.length, 'question')} avec explication</small></span></button>` : ''}
        ${weakQuestions(c).length ? `<button class="act rec" id="targ"><span class="ai">🎯</span><span class="at"><b>Exercices ciblés</b><small>5 exercices sur tes notions fragiles</small></span></button>` : ''}
        <button class="act" id="again"><span class="ai">🔁</span><span class="at"><b>Recommencer</b><small>Un nouveau quiz tout de suite</small></span></button>
        ${hasAI() ? `<button class="act" id="gen"><span class="ai">✨</span><span class="at"><b>Nouvelles questions</b><small>L'IA en crée sur ${weak.length ? 'tes notions à revoir' : 'ce chapitre'}</small></span></button>` : ''}
        <a class="act" href="#/review/course/${id}"><span class="ai">🃏</span><span class="at"><b>Mes flashcards</b><small>Réviser les cartes du chapitre</small></span></a>
      </div><div id="gst"></div>
      <div id="errs" hidden>${wrong.map(q => `<div class="card"><b>${qHtml(q)}</b><div class="muted">Réponse : ${esc(answerText(q))}</div>${q.explanation ? `<div class="explain">${esc(q.explanation)}</div>` : ''}${q.pitfall ? `<div class="explain"><b>Erreur fréquente :</b> ${esc(q.pitfall)}</div>` : ''}</div>`).join('')}</div>
      <a class="btn ghost" href="#/course/${id}">Retour au chapitre</a>`;
    const se = document.getElementById('seeErr');
    if (se) se.onclick = () => { const e = document.getElementById('errs'); e.hidden = !e.hidden; if (!e.hidden && e.scrollIntoView) e.scrollIntoView({ behavior: 'smooth' }); };
    const tg = document.getElementById('targ'); if (tg) tg.onclick = () => viewTrain(id, 'target');
    document.getElementById('again').onclick = () => viewTrain(id);
    const genBtn = document.getElementById('gen');
    if (genBtn) genBtn.onclick = async () => {
      const b = document.getElementById('gen'), st = document.getElementById('gst'); b.disabled = true; st.innerHTML = '<span class="spinner"></span> Création de nouvelles questions…';
      try { const r = await generateMore(c, weak.map(x => x.name).join(', ')); toast(`${plural(r.questions, 'question')} ajoutée${r.questions > 1 ? 's' : ''} ✔`); viewTrain(id); }
      catch (e) { st.innerHTML = `<span class="err">${esc(e.message)}</span>`; b.disabled = false; }
    };
  };
  step();
}
