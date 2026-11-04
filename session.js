/* Révizio — séance du jour : 10 étapes mélangées (entrelacées)
   40 % cartes à revoir · 30 % exercices · 20 % nouvelle notion · 10 % auto-explication.
   Elle commence par un rappel des notions fragiles et se termine par un mini-bilan avec une recommandation. */
'use strict';

const SESSION_N = 10;
const SESSION_MIX = { cards: 0.4, ex: 0.3, nw: 0.2, expl: 0.1 };
const EXPLAIN_PROMPTS = ['Pourquoi ? Explique avec tes mots.', 'Explique avec tes mots.', 'Donne un exemple.', 'À quoi cela sert-il ?'];
const STEP_LABEL = { card: '🃏 Carte à revoir', ex: '✏️ Exercice', new: '🌱 Nouvelle notion', expl: '💬 Explique' };

/* Notions fragiles (compétences à 'frag' ou 'ko') */
function fragileSkills() {
  const out = [];
  db.courses.forEach(c => Object.keys(c.skills || {}).forEach(name => { const lv = skillLevel(c, name); if (lv && lv !== 'ok') out.push({ c, name, lv }); }));
  return out.sort((a, b) => (a.lv === 'ko' ? 0 : 1) - (b.lv === 'ko' ? 0 : 1));
}
/* Exercices : d'abord les notions fragiles, puis le reste ; on varie les cours et les formats */
function pickExercises(k, avoid = new Set()) {
  if (k <= 0) return [];
  const pools = db.courses.map(c => {
    const weak = new Set(weakQuestions(c).map(q => q.id || q.q));
    const qs = (c.questions || []).filter(q => !avoid.has(q.id || q.q));
    return { c, qs: shuffle(qs).sort((a, b) => (weak.has(b.id || b.q) ? 1 : 0) - (weak.has(a.id || a.q) ? 1 : 0)) };
  }).filter(p => p.qs.length);
  // priorité aux matières des prochains jours de cours
  const prio = prepSubjects(); pools.sort((a, b) => { const r = x => { const i = prio.indexOf(x.c.subject); return i < 0 ? 99 : i; }; return r(a) - r(b); });
  const out = []; let lastType = '';
  while (out.length < k && pools.some(p => p.qs.length)) {
    let moved = false;
    for (const p of pools) {
      if (out.length >= k) break;
      if (!p.qs.length) continue;
      const j = p.qs.findIndex(q => q.type !== lastType); // évite deux fois le même format de suite
      const q = p.qs.splice(j < 0 ? 0 : j, 1)[0];
      out.push({ kind: 'ex', q, c: p.c }); lastType = q.type; moved = true;
    }
    if (!moved) break;
  }
  return out;
}
/* Nouvelle notion : une partie de leçon pas encore vue en séance + une question sur ce cours */
function pickNew(avoid = new Set()) {
  const prio = prepSubjects();
  const cs = db.courses.filter(c => c.lesson && c.lesson.length).sort((a, b) => {
    const r = x => { const i = prio.indexOf(x.subject); return i < 0 ? 99 : i; };
    const m = x => ({ decouverte: 0, encours: 1, presque: 2, maitrise: 3 }[courseMastery(x)]);
    return r(a) - r(b) || m(a) - m(b) || (a.lessonSeen || []).length - (b.lessonSeen || []).length;
  });
  const c = cs[0]; if (!c) return null;
  const seen = c.lessonSeen || [];
  let idx = c.lesson.findIndex((_, i) => !seen.includes(i));
  if (idx < 0) idx = seen.length % c.lesson.length; // tout vu : on recommence
  const untouched = (c.questions || []).filter(q => !avoid.has(q.id || q.q) && !(c.skills && c.skills[skillOf(q)]));
  const qs = untouched.length ? untouched : (c.questions || []).filter(q => !avoid.has(q.id || q.q));
  const q = qs.length ? shuffle(qs)[0] : null;
  return { section: { kind: 'new', c, idx }, ex: q ? { kind: 'ex', q, c, isNew: true } : null };
}
const explainRef = q => [q.explanation, answerText(q)].filter(Boolean).join(' ');

/* Construit la séance : { steps, counts, minutes, weak } */
function buildSession(n = SESSION_N) {
  const dueAll = smartDue();
  const want = { cards: Math.round(n * SESSION_MIX.cards), ex: Math.round(n * SESSION_MIX.ex), nw: Math.round(n * SESSION_MIX.nw), expl: n - Math.round(n * SESSION_MIX.cards) - Math.round(n * SESSION_MIX.ex) - Math.round(n * SESSION_MIX.nw) };
  const nwPick = pickNew();
  const hasQuestions = db.courses.some(c => (c.questions || []).length);
  // disponibilités
  const avail = { cards: dueAll.length, ex: db.courses.reduce((s, c) => s + (c.questions || []).length, 0), nw: nwPick ? 1 : 0, expl: hasQuestions || db.courses.some(c => (c.keyPoints || []).length) ? 1 : 0 };
  const nwSteps = nwPick ? (nwPick.ex ? 2 : 1) : 0;
  const take = { cards: Math.min(want.cards, avail.cards), ex: Math.min(want.ex, avail.ex), nw: nwSteps ? Math.min(want.nw, nwSteps) : 0, expl: Math.min(want.expl, avail.expl) };
  // les places libres vont d'abord aux cartes, puis aux exercices
  let free = n - (take.cards + take.ex + take.nw + take.expl);
  while (free > 0 && (take.cards < avail.cards || take.ex < avail.ex)) {
    if (take.cards < avail.cards) { take.cards++; free--; }
    if (free > 0 && take.ex < avail.ex) { take.ex++; free--; }
  }
  const nwUsed = nwSteps && take.nw > 0;
  const cards = dueAll.slice(0, take.cards).map(it => ({ kind: 'card', card: it.card, dir: it.dir }));
  const avoid = new Set(nwUsed && nwPick.ex ? [nwPick.ex.q.id || nwPick.ex.q.q] : []);
  const exs = pickExercises(take.ex, avoid);
  // l'auto-explication suit un exercice (ou, à défaut, porte sur un point clé)
  let explain = null;
  if (take.expl) {
    const src = exs.length ? exs[exs.length - 1] : null;
    if (src) explain = { kind: 'expl', q: src.q, c: src.c, prompt: EXPLAIN_PROMPTS[Math.floor(Math.random() * EXPLAIN_PROMPTS.length)] };
    else {
      const c = db.courses.find(x => (x.keyPoints || []).length);
      if (c) { const kp = shuffle(c.keyPoints)[0]; explain = { kind: 'expl', q: { q: kp, explanation: kp, type: 'short', answer: '' }, c, prompt: 'Explique avec tes mots.' }; }
    }
  }
  // unités à entrelacer : cartes, exercices (le dernier emmène son auto-explication), bloc « nouvelle notion »
  const units = { card: cards.map(x => [x]), ex: exs.map((x, i) => (i === exs.length - 1 && explain ? [x, explain] : [x])), nw: nwUsed ? [[nwPick.section].concat(nwPick.ex && take.nw > 1 ? [nwPick.ex] : [])] : [] };
  if (explain && !exs.length) units.ex.push([explain]);
  const totals = { card: units.card.length, ex: units.ex.length, nw: units.nw.length };
  const ordered = []; let last = '';
  while (units.card.length + units.ex.length + units.nw.length) {
    // on prend la catégorie la plus « en retard » par rapport à sa part, différente de la précédente si possible
    const cands = ['card', 'ex', 'nw'].filter(k => units[k].length).sort((a, b) => units[b].length / totals[b] - units[a].length / totals[a]);
    const k = cands.find(x => x !== last) || cands[0];
    ordered.push(...units[k].shift()); last = k;
  }
  const weak = fragileSkills().slice(0, 4);
  const steps = ordered;
  const counts = { cards: take.cards, ex: steps.filter(s => s.kind === 'ex' && !s.isNew).length, nw: steps.filter(s => s.kind === 'new' || s.isNew).length, expl: steps.filter(s => s.kind === 'expl').length };
  const minutes = Math.max(2, Math.round(counts.cards * 0.5 + counts.ex * 1 + counts.nw * 1.2 + counts.expl * 1));
  return { steps, counts, minutes, weak, total: steps.length };
}
/* cartes dues, les plus fragiles et les matières des prochains jours de cours d'abord */
function smartDue() {
  const prio = prepSubjects();
  const rank = x => { const i = prio.indexOf(x.card.subject); return i < 0 ? 99 : i; };
  return dueItems().sort((a, b) => { const sa = stateOf(a.card, a.dir), sb = stateOf(b.card, b.dir); return rank(a) - rank(b) || (sb.lapses || 0) - (sa.lapses || 0) || sa.step - sb.step; });
}

/* ---------- Écran « séance du jour » ---------- */
function viewSession() {
  const S = buildSession();
  if (!S.steps.length) { toast('Rien de prioritaire aujourd\'hui : crée ou révise un cours.'); location.hash = '#/daily'; return; }
  const total = S.total, res = { yes: 0, almost: 0, no: 0 }, exResults = [], explained = [], xp0 = db.activity.xp;
  let i = -1, timer = null;
  const head = st => `<div class="row between"><span class="muted">Étape ${i + 1} / ${total}</span><span><span class="tag steptag">${STEP_LABEL[st.kind]}</span> ${st.c ? subjChip(st.c.subject) : st.card ? subjChip(st.card.subject) : ''}</span></div>
    <div class="bar" style="margin:8px 0"><i style="width:${i / total * 100}%"></i></div>`;

  const intro = () => {
    const wk = S.weak;
    $app.innerHTML = `<h1>${esc(tx('daily_title'))}</h1>
      <div class="card"><b>🔎 Rappel des notions fragiles</b>
      ${wk.length ? `<ul class="points">${wk.map(w => `<li>${esc(w.name)} <span class="muted">(${esc(w.c.title)})</span> <span class="chip ${SKILL_CLASS[w.lv]}">${SKILL_LV[w.lv]}</span></li>`).join('')}</ul><p class="muted" style="margin-bottom:0">Garde-les en tête : elles reviennent dans cette séance.</p>` : '<p style="margin-bottom:0">Aucune notion fragile pour l\'instant. On avance et on entretient ce que tu sais.</p>'}</div>
      <div class="card"><div class="mixrow"><span>🃏 ${S.counts.cards} carte${S.counts.cards > 1 ? 's' : ''}</span><span>✏️ ${S.counts.ex} exercice${S.counts.ex > 1 ? 's' : ''}</span><span>🌱 ${S.counts.nw} nouvelle notion</span><span>💬 ${S.counts.expl} explication</span></div><div class="muted" style="margin-top:6px">≈ ${S.minutes} min · ${total} étapes mélangées</div></div>
      <button id="go" style="width:100%">Commencer</button>`;
    document.getElementById('go').onclick = next;
  };

  const next = () => { clearTimeout(timer); i++; if (i >= total) return finish(); const st = S.steps[i]; ({ card: cardStep, ex: exStep, new: newStep, expl: explStep })[st.kind](st); };
  const goBtn = (label = 'Étape suivante') => `<button id="nx" style="width:100%;margin-top:10px">${i + 1 >= total ? 'Voir mon mini-bilan' : label}</button>`;

  /* --- carte à revoir --- */
  const cardStep = st => {
    const { card, dir } = st, sd = sides(card, dir);
    $app.innerHTML = `${head(st)}
      <div class="card flash vis" style="--sc:${subj(card.subject).color}"><div><div class="bigemoji">${esc(cardEmoji(card))}</div>${sideHtml(sd.q)}${dir === 'rev' ? '<div class="muted" style="margin-top:12px">Sens inverse : retrouve ce qui correspond.</div>' : ''}</div></div>
      <textarea id="mine" rows="2" placeholder="Ta réponse… dans ta tête, à voix haute, ou écris-la ici"></textarea>
      <button id="reveal" style="width:100%;margin-top:10px" disabled>Réfléchis… 2</button>`;
    let n = 2;
    const tick = () => { const b = document.getElementById('reveal'); if (!b) return; if (--n > 0) { b.textContent = `Réfléchis… ${n}`; timer = setTimeout(tick, 1000); } else { b.disabled = false; b.textContent = 'Dévoiler la réponse'; } };
    timer = setTimeout(tick, 1000);
    document.getElementById('reveal').onclick = () => {
      const mine = document.getElementById('mine').value.trim(), s = stateOf(card, dir);
      $app.innerHTML = `${head(st)}
        <div class="card vis" style="--sc:${subj(card.subject).color}"><div class="bigemoji sm">${esc(cardEmoji(card))}</div><div class="muted">${sideHtml(sd.q)}</div><hr><div class="answer">${sideHtml(sd.a)}</div>${card.explain ? `<div class="explain">${esc(card.explain)}</div>` : ''}${mine ? `<div class="muted">Ta réponse : ${esc(mine)}</div>` : ''}</div>
        <p class="muted center">Sois honnête avec toi-même : c'est comme ça que tu progresses.</p>
        <div class="rates"><button class="rate no" data-r="no">Je ne sais pas<small>${previewLabel(s, 'no')}</small></button><button class="rate almost" data-r="almost">Presque<small>${previewLabel(s, 'almost')}</small></button><button class="rate yes" data-r="yes">Je sais<small>${previewLabel(s, 'yes')}</small></button></div>`;
      document.querySelectorAll('.rate').forEach(b => b.onclick = () => { gradeItem(card, dir, b.dataset.r); save(); res[b.dataset.r]++; next(); });
    };
  };

  /* --- exercice --- */
  const exStep = st => {
    const { q, c } = st;
    $app.innerHTML = `${head(st)}<div class="card"><b>${qHtml(q)}</b><div class="muted" style="margin-top:4px;font-size:.8rem">${EX_LABEL[q.type] || ''} ${levelDots(q)}${st.isNew ? ' · sur la notion qui vient d\'être vue' : ''}</div></div><div id="body"></div>`;
    const body = document.getElementById('body');
    renderExercise(q, body, ok => {
      exResults.push({ q, c, ok });
      body.insertAdjacentHTML('beforeend', `${q.explanation ? `<div class="explain">${esc(q.explanation)}</div>` : ''}${!ok && q.pitfall ? `<div class="explain"><b>Erreur fréquente :</b> ${esc(q.pitfall)}</div>` : ''}${goBtn()}`);
      document.getElementById('nx').onclick = next;
    });
  };

  /* --- nouvelle notion : une partie de leçon à lire --- */
  const newStep = st => {
    const { c, idx } = st, sec = c.lesson[idx];
    $app.innerHTML = `${head(st)}<div class="card"><h2 style="margin-top:0">${esc(sec.title)}</h2><div class="muted" style="margin:-6px 0 8px">${esc(c.title)}</div>${lessonBody(sec, c.subject)}</div>
      <button id="nx" style="width:100%">J'ai compris${S.steps[i + 1] && S.steps[i + 1].isNew ? ' — une question' : ''}</button>`;
    document.getElementById('nx').onclick = () => { c.lessonSeen = Array.from(new Set([...(c.lessonSeen || []), idx])); addXP(XP_GAIN.section); save(); next(); };
  };

  /* --- auto-explication : comparer ses mots aux mots-clés attendus --- */
  const explStep = st => {
    const { q, c } = st;
    $app.innerHTML = `${head(st)}<div class="card"><div class="muted">${esc(c.title)}</div><b>${esc(q.q)}</b>${q.type !== 'short' || q.answer ? `<div class="muted" style="margin-top:6px">Réponse : ${esc(answerText(q))}</div>` : ''}<p style="margin-bottom:0"><b>${esc(st.prompt)}</b></p></div>
      <textarea id="mine" rows="3" placeholder="Écris avec tes mots…"></textarea>
      <button id="chk" style="width:100%;margin-top:10px">Voir la comparaison</button>`;
    document.getElementById('chk').onclick = () => {
      const mine = document.getElementById('mine').value.trim(), ref = explainRef(q), fb = keywordFeedback(mine, ref);
      if (fb.level !== 'vide') { explained.push(fb); addXP(XP_GAIN.explain); }
      $app.innerHTML = `${head(st)}<div class="card"><b>${esc(st.prompt)}</b>${mine ? `<p class="muted">Ta réponse : ${esc(mine)}</p>` : ''}<div class="explain">${esc(fb.msg)}</div>${ref ? `<hr><div class="muted">Explication de référence</div><div>${esc(ref)}</div>` : ''}</div>${goBtn()}`;
      document.getElementById('nx').onclick = next;
    };
  };

  /* --- mini-bilan --- */
  const finish = () => {
    recordQuizResults(exResults); markActivity(); save();
    const ok = exResults.filter(r => r.ok).length, wrong = exResults.filter(r => !r.ok);
    const groups = {};
    exResults.forEach(r => { const g = groups[skillOf(r.q)] || (groups[skillOf(r.q)] = { ok: 0, n: 0 }); g.n++; if (r.ok) g.ok++; });
    const rows = Object.entries(groups).map(([name, g]) => ({ name, ...g, lv: ratioLevel(g.ok / g.n) }));
    const gain = db.activity.xp - xp0, rec = recommend(), q = questState();
    $app.innerHTML = `<h1>${esc(tx('session_end'))} ✔</h1>
      <div class="grid">
        <div class="card stat"><b>${res.yes + res.almost + res.no ? res.yes + '/' + (res.yes + res.almost + res.no) : '–'}</b><span class="muted">cartes sues</span></div>
        <div class="card stat"><b>${exResults.length ? ok + '/' + exResults.length : '–'}</b><span class="muted">exercices réussis</span></div>
        <div class="card stat"><b>${S.counts.nw ? '1' : '0'}</b><span class="muted">notion découverte</span></div>
        <div class="card stat"><b>+${gain}</b><span class="muted">XP · Niv. ${levelOf(db.activity.xp)}</span></div>
      </div>
      ${explained.length ? `<div class="card">💬 Explication : ${esc(explained[explained.length - 1].level === 'ok' ? 'tu as retrouvé l\'essentiel, bravo !' : 'tu es sur la bonne voie, continue d\'expliquer avec tes mots.')}</div>` : ''}
      ${rows.length ? `<h2>Mes compétences</h2><div class="card">${rows.map(r => `<div class="row between" style="margin-bottom:6px"><span>${esc(r.name)} <span class="muted">${r.ok}/${r.n}</span></span><span class="chip ${SKILL_CLASS[r.lv]}">${SKILL_LV[r.lv]}</span></div>`).join('')}</div>` : ''}
      <div class="card"><b>🎯 Recommandation :</b> ${esc(rec || 'Tout est à jour, bravo ! Reviens demain.')}</div>
      <div class="card">🔥 ${streak()} jour${streak() > 1 ? 's' : ''} de suite · ${q.done ? '🏅 ' + esc(tx('quest_title')) + ' accomplie' : '🎯 ' + esc(tx('quest_title')) + ' : ' + Math.min(q.cards, QUEST.cards) + '/' + QUEST.cards + ' cartes, ' + Math.min(q.qs, QUEST.qs) + '/' + QUEST.qs + ' questions'}</div>
      <div class="row" id="acts">${wrong.length ? `<button id="mk">Créer des cartes avec mes erreurs (${wrong.length})</button>` : ''}<a class="btn ghost" href="#/">Retour à l'accueil</a></div>`;
    const mk = document.getElementById('mk');
    if (mk) mk.onclick = () => {
      let n = 0; const byC = new Map(); wrong.forEach(r => { if (!byC.has(r.c)) byC.set(r.c, []); byC.get(r.c).push(r.q); });
      byC.forEach((qs, c) => { n += cardsFromMistakes(c, qs); });
      mk.disabled = true; mk.textContent = n ? `✔ ${n} carte${n > 1 ? 's' : ''} ajoutée${n > 1 ? 's' : ''}` : 'Ces cartes existent déjà';
    };
  };
  intro();
}
