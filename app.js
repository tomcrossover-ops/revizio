/* Révizio — écrans principaux, routeur, mises à jour. (noyau : core.js · cartes : cards.js) */
'use strict';

/* ---------- Routeur ---------- */
const routes = [
  [/^\/?$/, viewHome],
  [/^\/courses$/, viewCourses],
  [/^\/mindmaps$/, viewMindmaps],
  [/^\/new$/, viewGenerate],
  [/^\/import$/, viewImport],
  [/^\/course\/(\w+)$/, viewCourse],
  [/^\/review(?:\/(course|deck)\/(\w+))?$/, viewReview],
  [/^\/quiz\/(\w+)$/, id => viewQuiz(id)],
  [/^\/quiz\/(\w+)\/weak$/, id => viewQuiz(id, 'weak')],
  [/^\/daily$/, viewDaily],
  [/^\/daily\/cards$/, () => viewReview('smart')],
  [/^\/daily\/quiz$/, () => viewQuiz('mini')],
  [/^\/library$/, viewLibrary],
  [/^\/card\/(\w+)$/, viewCardForm],
  [/^\/understand(?:\/(\w+))?$/, viewUnderstand],
  [/^\/settings$/, viewSettings],
];
function route() {
  const path = location.hash.replace(/^#/, '') || '/';
  const area = path === '/new' || path === '/import' ? 'new' : path === '/library' || path.startsWith('/card/') ? 'library' : path === '/settings' ? 'settings' : 'home';
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('active', a.dataset.nav === area));
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) { window.scrollTo(0, 0); return fn(...m.slice(1)); }
  }
  location.hash = '#/';
}
window.addEventListener('hashchange', route);

/* ---------- Accueil ---------- */
function viewHome() {
  const due = dueItems().length, total = db.cards.length;
  const mastered = db.cards.filter(c => cardLevel(c) === 'maitrisee').length, toReview = db.cards.filter(c => cardLevel(c) === 'revoir').length;
  const hello = db.settings.name ? `Salut ${esc(db.settings.name)} 🪄` : 'Bienvenue à l\'Académie Révizio 🪄';
  $app.innerHTML = `
    <h1>${hello}</h1>
    ${!db.settings.apiKey ? `<div class="card"><b>Première étape :</b> ajoute ta clé API dans les <a href="#/settings">Réglages</a> pour que Révizio puisse créer des cours et des cartes. Tu peux déjà <a href="#/card/new">créer des cartes à la main</a>.</div>` : ''}
    <div class="card hero">${due
      ? `<div class="big">${due}</div><div>carte${due > 1 ? 's' : ''} magique${due > 1 ? 's' : ''} à revoir aujourd'hui</div><a class="btn" href="#/review">Lancer la séance</a>`
      : `<div class="big">✨</div><div>Rien à revoir aujourd'hui${total ? '' : ' — crée ta première carte !'}</div>`}</div>
    ${(() => { const p = smartPlan(), rec = recommend(); return (p.items.length || p.questions.length ? `<a class="card course" href="#/daily"><div class="row between"><b>🔮 Ma séance du jour</b><span class="muted">≈ ${p.minutes} min</span></div><div class="muted">${p.items.length} carte${p.items.length > 1 ? 's' : ''} · ${p.questions.length} question${p.questions.length > 1 ? 's' : ''} sur tes notions fragiles</div></a>` : '') + (rec ? `<div class="card"><b>Conseil :</b> ${esc(rec)}</div>` : ''); })()}
    <div class="grid shortcuts">
      <a class="card tile" href="#/courses"><span class="ico">📚</span><b>Mes cours</b><span class="muted">${db.courses.length} cours</span></a>
      <a class="card tile" href="#/mindmaps"><span class="ico">🧠</span><b>Cartes mentales</b><span class="muted">${db.courses.filter(c => c.mindmap).length} carte${db.courses.filter(c => c.mindmap).length > 1 ? 's' : ''}</span></a>
      <a class="card tile" href="#/library"><span class="ico">🗂️</span><b>Mes cartes</b><span class="muted">${total} carte${total > 1 ? 's' : ''}</span></a>
    </div>
    <div class="grid">
      <div class="card stat"><b>${total}</b><span class="muted">cartes créées</span></div>
      <div class="card stat"><b>${mastered}</b><span class="muted">maîtrisées</span></div>
      <div class="card stat"><b>${toReview}</b><span class="muted">à revoir</span></div>
      <div class="card stat"><b>🔥 ${streak()}</b><span class="muted">jour${streak() > 1 ? 's' : ''} de suite</span></div>
    </div>
    <div class="row" style="margin-bottom:12px">
      <a class="btn" href="#/new">+ Nouveau cours</a>
      <a class="btn ghost" href="#/understand">Comprendre une leçon</a>
      <a class="btn ghost" href="#/card/new">+ Carte</a>
    </div>
    ${db.decks.length ? `<h2>Mes paquets</h2>${db.decks.map(d => {
      const n = dueItems(c => d.cardIds.includes(c.id)).length;
      return `<div class="card row between"><span><b>${esc(d.name)}</b> <span class="muted">${d.cardIds.length} cartes${n ? ` · ${n} à revoir` : ''}</span></span><a class="btn ghost" href="#/review/deck/${d.id}">Réviser</a></div>`;
    }).join('')}` : ''}
    ${(() => { const b = computeBadges(), n = b.filter(x => x.got).length; return `<h2>Mes distinctions <span class="muted">${n}/${b.length}</span></h2><div class="card badges">${b.map(x => `<span class="badge${x.got ? ' got' : ''}" title="${x.got ? 'Obtenu' : 'À débloquer'}"><span>${x.ico}</span><span><b>${esc(x.label)}</b><small>${esc(x.desc)}</small></span></span>`).join('')}</div>`; })()}
    <div class="row between"><h2>Derniers cours</h2>${db.courses.length > 3 ? '<a href="#/courses">Tout voir →</a>' : ''}</div>
    ${db.courses.length ? db.courses.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 3).map(courseCard).join('') :
      `<div class="card muted">Aucun cours pour l'instant. Choisis ta classe, une matière et un chapitre, et Révizio prépare la leçon, les cartes mémoire et le quiz.</div>`}
    ${progressBySubject()}`;
}
/* ---------- Bibliothèque de cours ---------- */
function viewCourses() {
  const st = { level: '', subject: '', q: '' };
  const levels = LEVELS.filter(l => db.courses.some(c => c.level === l));
  const subjects = Object.keys(SUBJECTS).filter(k => db.courses.some(c => c.subject === k));
  $app.innerHTML = `
    <div class="row between"><h1>Mes cours</h1><a class="btn" href="#/new">+ Nouveau</a></div>
    ${db.courses.length ? `<div class="row2">
      <select id="fl"><option value="">Toutes les classes</option>${levels.map(l => `<option>${l}</option>`).join('')}</select>
      <select id="fs"><option value="">Toutes les matières</option>${subjects.map(k => `<option value="${k}">${esc(SUBJECTS[k].label)}</option>`).join('')}</select>
    </div><input id="fq" placeholder="Rechercher un cours…" style="margin:10px 0" autocomplete="off">` : ''}
    <div id="list"></div>`;
  const draw = () => {
    const q = normText(st.q);
    const list = db.courses.filter(c => (!st.level || c.level === st.level) && (!st.subject || c.subject === st.subject) && (!q || normText(c.title).includes(q)))
      .sort((a, b) => b.createdAt - a.createdAt);
    document.getElementById('list').innerHTML = list.length ? list.map(courseCard).join('')
      : `<div class="card muted">${db.courses.length ? 'Aucun cours ne correspond.' : 'Aucun cours pour l\'instant. <a href="#/new">Crée ton premier cours</a> ou <a href="#/import">importe le tien</a>.'}</div>`;
  };
  if (db.courses.length) {
    document.getElementById('fl').onchange = e => { st.level = e.target.value; draw(); };
    document.getElementById('fs').onchange = e => { st.subject = e.target.value; draw(); };
    document.getElementById('fq').oninput = e => { st.q = e.target.value; draw(); };
  }
  draw();
}

/* ---------- Cartes mentales ---------- */
function viewMindmaps() {
  const withMap = db.courses.filter(c => c.mindmap).sort((a, b) => b.createdAt - a.createdAt);
  const without = db.courses.filter(c => !c.mindmap).sort((a, b) => b.createdAt - a.createdAt);
  $app.innerHTML = `
    <h1>Cartes mentales</h1>
    <p class="muted">Une carte mentale résume un chapitre en un coup d'œil. Elle se crée avec « Comprendre la leçon ».</p>
    ${withMap.map((c, i) => `<details class="card mm-item" ${i === 0 ? 'open' : ''}>
      <summary><b>${esc(c.title)}</b> ${subjChip(c.subject)}</summary>
      ${mindmapHtml(c.mindmap)}
      <div class="row" style="margin-top:10px"><a class="btn ghost" href="#/course/${c.id}">Ouvrir le cours</a><a class="btn ghost" href="#/understand/${c.id}">Refaire</a></div>
    </details>`).join('')}
    ${!withMap.length ? `<div class="card muted">Aucune carte mentale pour l'instant.${db.courses.length ? ' Choisis un cours ci-dessous pour en créer une.' : ' <a href="#/new">Crée d\'abord un cours.</a>'}</div>` : ''}
    ${without.length ? `<h2>Pas encore de carte mentale</h2>${without.map(c => `<div class="card row between"><span><b>${esc(c.title)}</b> ${subjChip(c.subject)}</span><a class="btn ghost" href="#/understand/${c.id}">Créer</a></div>`).join('')}` : ''}`;
}

function courseCard(c) {
  const sc = avgScore(c), n = cardsOf(c.id).length, d = dueItems(x => x.courseId === c.id).length;
  return `<a class="card course" href="#/course/${c.id}">
    <div class="row between"><b>${esc(c.title)}</b>${subjChip(c.subject)}</div>
    <div style="margin:2px 0">${masteryChip(c)}</div>
    <div class="muted">${c.level ? esc(c.level) + ' · ' : ''}${n} carte${n > 1 ? 's' : ''} · ${c.questions.length} question${c.questions.length > 1 ? 's' : ''}${d ? ` · <b>${d} à revoir</b>` : ''}</div>
    ${sc !== null ? `<div class="bar" style="margin-top:8px"><i style="width:${sc}%"></i></div><div class="muted">Moyenne récente : ${sc} %</div>` : ''}
  </a>`;
}
function progressBySubject() {
  const rows = Object.keys(SUBJECTS).map(k => {
    const cs = db.courses.filter(c => c.subject === k && c.scores.length);
    if (!cs.length) return '';
    const avg = Math.round(cs.reduce((s, c) => s + avgScore(c), 0) / cs.length);
    return `<div style="margin-bottom:10px"><div class="row between">${subjChip(k)}<b>${avg} %</b></div><div class="bar"><i style="width:${avg}%;background:${subj(k).color}"></i></div></div>`;
  }).join('');
  return rows ? `<h2>Progression aux quiz</h2><div class="card">${rows}</div>` : '';
}

/* ---------- Cours demandé par classe / matière / chapitre ---------- */
function fmt(s) { // lignes « - … » en puces, le reste en paragraphes
  const out = []; let list = [];
  const flush = () => { if (list.length) { out.push(`<ul class="points">${list.join('')}</ul>`); list = []; } };
  esc(s).split(/\n+/).map(l => l.trim()).filter(Boolean).forEach(l => {
    const m = l.match(/^[-•*]\s+(.*)/);
    if (m) list.push(`<li>${m[1]}</li>`); else { flush(); out.push(`<p>${l}</p>`); }
  });
  flush();
  return out.join('');
}
function lessonHtml(c) {
  if (!c.lesson || !c.lesson.length) return '';
  return `<div class="card"><h2 style="margin-top:0">La leçon</h2>
    ${c.lesson.map(s => `<h3>${esc(s.title)}</h3>${fmt(s.content)}${s.examples.length ? `<div class="explain"><b>Exemples</b><ul class="points">${s.examples.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}`).join('')}
    <p class="muted">Leçon générée par IA d'après le programme de ${esc(c.level || 'ta classe')}. Compare-la avec ton cahier : ton professeur a pu insister sur d'autres points.</p></div>`;
}
function viewGenerate() {
  const lvl = db.settings.level || '6e';
  $app.innerHTML = `
    <h1>Réviser un chapitre</h1>
    <p class="muted">Choisis ta classe, la matière et le chapitre : Révizio écrit ton grimoire : la leçon, des cartes magiques et une épreuve. Tu as déjà ton cours ? <a href="#/import">Importe-le plutôt</a>.</p>
    <form id="f" class="card">
      <label>Classe</label>
      <select id="level">${LEVELS.map(l => `<option ${l === lvl ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <label>Matière</label>
      <select id="subject"></select>
      <label>Chapitre du programme</label>
      <select id="chsel"></select>
      <div id="notions" class="muted" style="margin-top:6px"></div>
      <div id="freebox" hidden>
        <label>Ton chapitre ou ta notion</label>
        <input id="chapter" placeholder="Ex. Conjugaison : le passé simple" autocomplete="off">
      </div>
      <label>Précisions (facultatif)</label>
      <input id="extra" placeholder="Ex. surtout les verbes du 1er groupe" autocomplete="off">
      <div class="muted" style="margin-top:6px">Les chapitres suivent les programmes officiels ; l'ordre peut différer de celui de ta classe. Ton chapitre n'y est pas ? Choisis « Autre chapitre… ».</div>
      <div class="row" style="margin-top:14px"><button id="go" type="submit">Écrire mon grimoire</button><span id="st"></span></div>
    </form>`;
  const $ = id => document.getElementById(id);
  const FREE = '__free';
  const fillSubjects = () => {
    const level = $('level').value, keep = $('subject').value;
    const inCat = catalogSubjects(level);
    const keys = Object.keys(SUBJECTS).filter(k => k !== 'autre');
    $('subject').innerHTML = keys.map(k => `<option value="${k}">${esc(SUBJECTS[k].label)}</option>`).join('');
    const pick = keys.includes(keep) ? keep : (inCat[0] || keys[0]);
    $('subject').value = pick;
  };
  const fillChapters = () => {
    const list = chaptersFor($('level').value, $('subject').value);
    $('chsel').innerHTML = list.map((c, i) => `<option value="${i}">${esc(c[0])}</option>`).join('') + `<option value="${FREE}">Autre chapitre…</option>`;
    if (!list.length) $('chsel').value = FREE;
    showNotions();
  };
  const showNotions = () => {
    const list = chaptersFor($('level').value, $('subject').value), v = $('chsel').value, free = v === FREE;
    $('freebox').hidden = !free;
    $('notions').innerHTML = !free && list[+v] ? `<b>Au programme :</b> ${esc(list[+v][1])}` : '';
  };
  $('level').onchange = () => { fillSubjects(); fillChapters(); };
  $('subject').onchange = fillChapters;
  $('chsel').onchange = showNotions;
  fillSubjects(); fillChapters();
  $('f').onsubmit = async ev => {
    ev.preventDefault();
    const level = $('level').value, subject = $('subject').value;
    const list = chaptersFor(level, subject), v = $('chsel').value, entry = v === FREE ? null : list[+v];
    const chapter = entry ? entry[0] : $('chapter').value.trim(), extra = $('extra').value.trim();
    if (chapter.length < 3) return toast('Indique le chapitre à réviser.');
    db.settings.level = level; save();
    const btn = $('go'), st = $('st');
    btn.disabled = true; st.innerHTML = '<span class="spinner"></span> Le grimoire s\'écrit… (≈ 30-60 s)';
    try {
      const text = `Classe : ${level}\nMatière : ${subj(subject).label}\nChapitre demandé : ${chapter}${entry ? `\nNotions au programme de ce chapitre (reste dans ce périmètre) : ${entry[1]}` : ''}${extra ? `\nPrécisions : ${extra}` : ''}`;
      const r = await callClaude([{ type: 'text', text }], 8000, SYSTEM_GEN);
      const course = {
        id: uid(), subject, level, origin: 'generated', title: r.title || chapter, createdAt: Date.now(),
        summary: r.summary || '', lesson: normLesson(r.lesson), keyPoints: r.keyPoints || [], questions: normQuestions(r.questions), scores: [], skills: {}, mistakes: [], ...courseExtras(r),
      };
      const cards = normCards(r.cards, { subject, chapter: course.title, courseId: course.id });
      if (!cards.length && !course.questions.length) throw new Error('Rien de généré, reformule le chapitre et réessaie.');
      db.courses.push(course); db.cards.push(...cards); save();
      toast('Grimoire prêt ✨'); location.hash = '#/course/' + course.id;
    } catch (e) {
      st.innerHTML = `<span class="err">${esc(e.message)}</span>`; btn.disabled = false;
    }
  };
}

/* ---------- Import d'un cours (photo, PDF, texte) ---------- */
function viewImport() {
  $app.innerHTML = `
    <h1>Importer mon cours</h1>
    <p class="muted">Tu as ta leçon en photo, en PDF ou en texte ? Sinon, <a href="#/new">demande un chapitre du programme</a>.</p>
    <form id="f" class="card">
      <label>Matière</label>
      <select id="subject">${Object.entries(SUBJECTS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select>
      <label>Thème / titre (facultatif)</label>
      <input id="title" placeholder="Ex. Les fractions, La Révolution française…">
      <label>Photos ou PDF du cours</label>
      <input id="files" type="file" accept="image/*,application/pdf" multiple>
      <div class="muted">Sur téléphone, tu peux prendre le cahier en photo. Jusqu'à 6 fichiers.</div>
      <label>Ou colle le texte du cours</label>
      <textarea id="text" placeholder="Copie ici la leçon…"></textarea>
      <div class="row" style="margin-top:14px"><button id="go" type="submit">Générer ma fiche et mes exercices</button><span id="st"></span></div>
    </form>`;
  document.getElementById('f').onsubmit = async ev => {
    ev.preventDefault();
    const files = [...document.getElementById('files').files].slice(0, 6);
    const text = document.getElementById('text').value.trim();
    if (!files.length && text.length < 30) return toast('Ajoute un fichier ou colle un texte plus long.');
    const btn = document.getElementById('go'), st = document.getElementById('st');
    btn.disabled = true; st.innerHTML = '<span class="spinner"></span> Lecture du cours… (≈ 20-40 s)';
    try {
      const subject = document.getElementById('subject').value, title = document.getElementById('title').value.trim();
      const r = await callClaude(await buildContent(files, text, subject, title));
      const course = {
        id: uid(), subject, title: title || r.title || 'Cours sans titre', createdAt: Date.now(),
        summary: r.summary || '', keyPoints: r.keyPoints || [], questions: normQuestions(r.questions), scores: [],
      };
      const cards = normCards(r.cards, { subject, chapter: course.title, courseId: course.id });
      if (!cards.length && !course.questions.length) throw new Error('Rien de généré, essaie avec une photo plus nette.');
      db.courses.push(course); db.cards.push(...cards); save();
      toast('Grimoire ajouté ✨'); location.hash = '#/course/' + course.id;
    } catch (e) {
      st.innerHTML = `<span class="err">${esc(e.message)}</span>`; btn.disabled = false;
    }
  };
}

/* ---------- Fiche d'un cours ---------- */
function skillsCard(c) {
  const names = Object.keys(c.skills || {}).filter(n => skillLevel(c, n));
  if (!names.length) return '';
  return `<div class="card"><h2 style="margin-top:0">Mes compétences</h2>${names.map(n => { const lv = skillLevel(c, n); return `<div class="row between" style="margin-bottom:6px"><span>${esc(n)}</span><span class="chip ${SKILL_CLASS[lv]}">${SKILL_LV[lv]}</span></div>`; }).join('')}</div>`;
}
function mistakesCard(c) {
  const m = (c.mistakes || []).slice(-6).reverse();
  if (!m.length) return '';
  return `<div class="card"><h2 style="margin-top:0">Mes dernières erreurs</h2>${m.map(x => `<div style="margin-bottom:10px"><div class="muted">${fmtDate(x.date)} · ${esc(x.skill)}</div><b>${esc(x.q)}</b><div>Réponse : ${esc(x.answer)}</div></div>`).join('')}</div>`;
}
function viewCourse(id) {
  const c = getCourse(id);
  if (!c) { location.hash = '#/'; return; }
  const n = cardsOf(id).length, d = dueItems(x => x.courseId === id).length;
  $app.innerHTML = `
    <div class="row between"><h1>${esc(c.title)}</h1>${subjChip(c.subject)}</div>
    <div class="row" style="margin-bottom:12px">
      <a class="btn" href="#/review/course/${c.id}">Cartes mémoire${d ? ` (${d})` : ` · ${n}`}</a>
      <a class="btn" href="#/quiz/${c.id}">Quiz</a>
      <a class="btn ghost" href="#/understand/${c.id}">Comprendre ce chapitre</a>
    </div>
    <div class="row" style="margin-bottom:10px">${masteryChip(c)}${c.duration ? `<span class="chip">⏱ ${c.duration} min</span>` : ''}${c.level ? `<span class="chip">${esc(c.level)}</span>` : ''}</div>
    ${c.objectives && c.objectives.length ? `<div class="card"><h2 style="margin-top:0">Objectifs</h2><ul class="points">${c.objectives.map(p => `<li>${esc(p)}</li>`).join('')}</ul>${c.prerequisites && c.prerequisites.length ? `<div class="muted"><b>À connaître avant :</b> ${c.prerequisites.map(esc).join(' · ')}</div>` : ''}</div>` : ''}
    <div class="card"><h2 style="margin-top:0">Résumé</h2><p>${esc(c.summary)}</p></div>
    ${lessonHtml(c)}
    ${c.pitfalls && c.pitfalls.length ? `<div class="card"><h2 style="margin-top:0">Erreurs fréquentes</h2><ul class="points">${c.pitfalls.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>` : ''}
    <div class="card"><h2 style="margin-top:0">Ce que tu dois retenir</h2><ul class="points">${c.keyPoints.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>
    ${skillsCard(c)}
    ${c.mindmap ? `<div class="card"><h2 style="margin-top:0">Carte mentale</h2>${mindmapHtml(c.mindmap)}</div>` : ''}
    ${mistakesCard(c)}
    ${c.scores.length ? `<div class="card"><h2 style="margin-top:0">Mes quiz</h2>${c.scores.slice(-6).reverse().map(s => `<div class="row between"><span class="muted">${fmtDate(s.date)}</span><b>${s.score}/${s.total}</b></div>`).join('')}</div>` : ''}
    <div class="row" style="margin-top:8px">
      <button class="ghost" id="more">Générer d'autres exercices</button>
      <button class="danger" id="del">Supprimer ce cours</button>
      <span id="st"></span>
    </div>`;
  document.getElementById('del').onclick = () => {
    if (confirm(`Supprimer ce cours, ses ${n} carte(s) et ses exercices ?`)) {
      removeCards(cardsOf(id).map(x => x.id)); db.courses = db.courses.filter(x => x.id !== id); save(); location.hash = '#/';
    }
  };
  document.getElementById('more').onclick = async () => {
    const st = document.getElementById('st'), btn = document.getElementById('more');
    btn.disabled = true; st.innerHTML = '<span class="spinner"></span> Génération…';
    try {
      const known = cardsOf(id).map(x => x.front).concat(c.questions.map(q => q.q)).join(' | ');
      const text = `Résumé : ${c.summary}\nPoints clés :\n- ${c.keyPoints.join('\n- ')}`;
      const r = await callClaude(await buildContent([], text, c.subject, c.title, `Génère de NOUVELLES cartes et questions, différentes de celles-ci : ${known.slice(0, 2500)}`));
      db.cards.push(...normCards(r.cards, { subject: c.subject, chapter: c.title, courseId: c.id })); c.questions.push(...normQuestions(r.questions)); save();
      toast('Nouveaux exercices ajoutés ✔'); viewCourse(id);
    } catch (e) { st.innerHTML = `<span class="err">${esc(e.message)}</span>`; btn.disabled = false; }
  };
}

/* ---------- Session du jour (révision intelligente) ---------- */
function viewDaily() {
  const p = smartPlan(), rec = recommend();
  $app.innerHTML = `
    <h1>Ma séance du jour</h1>
    <p class="muted">Révizio choisit ce qui compte le plus aujourd'hui : les cartes à revoir en priorité, puis des questions sur les notions encore fragiles. Pas de répétition de ce que tu maîtrises déjà.</p>
    ${p.items.length || p.questions.length ? `<div class="card hero">
      <div class="big">≈ ${p.minutes} min</div>
      <div>${p.items.length} carte${p.items.length > 1 ? 's' : ''} à revoir · ${p.questions.length} question${p.questions.length > 1 ? 's' : ''} sur tes notions fragiles</div>
      <a class="btn" href="${p.items.length ? '#/daily/cards' : '#/daily/quiz'}">Commencer</a></div>`
    : `<div class="card hero"><div class="big">🎉</div><div>Rien de prioritaire aujourd'hui. Tu peux avancer sur un nouveau chapitre.</div></div>`}
    ${rec ? `<div class="card"><b>Conseil du jour</b><p style="margin-bottom:0">${esc(rec)}</p></div>` : ''}
    <a class="btn ghost" href="#/">Retour</a>`;
}

/* ---------- Quiz ---------- */
/* id = identifiant d'un cours ; 'mini' = mini-quiz de la session du jour ; mode 'weak' = quiz ciblé sur les notions fragiles */
function viewQuiz(id, mode) {
  const mini = id === 'mini', c = mini ? null : getCourse(id);
  let qs;
  if (mini) qs = shuffle(smartPlan().questions);
  else if (c) {
    const pool = mode === 'weak' ? weakQuestions(c) : c.questions;
    qs = shuffle(pool).slice(0, 10).map(q => ({ q, c }));
  }
  if (!qs || !qs.length) { toast(mini ? 'Aucune question fragile à retravailler, bravo !' : 'Pas de questions pour ce cours.'); location.hash = mini ? '#/daily' : '#/'; return; }
  let i = 0, score = 0; const results = [];
  const step = () => {
    if (i >= qs.length) return end();
    const { q, c: qc } = qs[i];
    $app.innerHTML = `
      <div class="row between"><span class="muted">${mode === 'weak' ? 'Quiz ciblé · ' : mini ? 'Mini-quiz · ' : ''}Question ${i + 1} / ${qs.length}</span>${subjChip(qc.subject)}</div>
      <div class="bar" style="margin:8px 0"><i style="width:${i / qs.length * 100}%"></i></div>
      <div class="card"><b>${esc(q.q)}</b></div><div id="body"></div>`;
    const body = document.getElementById('body');
    const finish = ok => {
      if (ok) score++;
      results.push({ q, c: qc, ok });
      body.insertAdjacentHTML('beforeend', `${q.explanation ? `<div class="explain">${esc(q.explanation)}</div>` : ''}${!ok && q.pitfall ? `<div class="explain"><b>Erreur fréquente :</b> ${esc(q.pitfall)}</div>` : ''}<button id="nx" style="width:100%">${i + 1 < qs.length ? 'Suivant' : 'Voir mon bilan'}</button>`);
      document.getElementById('nx').onclick = () => { i++; step(); };
    };
    if (q.type === 'qcm') {
      body.innerHTML = q.choices.map((ch, k) => `<button class="choice" data-k="${k}">${esc(ch)}</button>`).join('');
      body.querySelectorAll('.choice').forEach(b => b.onclick = () => {
        const k = +b.dataset.k;
        body.querySelectorAll('.choice').forEach(x => { x.disabled = true; if (+x.dataset.k === q.answer) x.classList.add('good'); });
        if (k !== q.answer) b.classList.add('bad');
        finish(k === q.answer);
      });
    } else {
      body.innerHTML = `<input id="ans" placeholder="Ta réponse…" autocomplete="off"><button id="chk" style="margin-top:10px;width:100%">Vérifier</button>`;
      document.getElementById('chk').onclick = () => {
        const mine = document.getElementById('ans').value.trim();
        body.innerHTML = `<div class="card"><div class="muted">Ta réponse</div>${esc(mine) || '<i>(vide)</i>'}<div class="muted" style="margin-top:8px">Réponse attendue</div><b>${esc(q.answer)}</b></div>
          <div class="row"><button class="ko" id="no" style="flex:1">J'avais faux</button><button class="ok" id="yes" style="flex:1">J'avais juste</button></div>`;
        const mark = ok => { body.querySelectorAll('button').forEach(b => { b.disabled = true; }); finish(ok); };
        document.getElementById('yes').onclick = () => mark(true);
        document.getElementById('no').onclick = () => mark(false);
      };
    }
  };
  const end = () => {
    if (!mini) c.scores.push({ date: Date.now(), score, total: qs.length, mode: mode || 'full' });
    recordQuizResults(results);
    const pct = Math.round(score / qs.length * 100), wrong = results.filter(r => !r.ok).map(r => r.q);
    const msg = pct >= 80 ? 'Magnifique, cette leçon est bien maîtrisée !' : pct >= 50 ? 'Pas mal, apprenti : quelques sortilèges à consolider.' : 'À retravailler : relis le grimoire et refais les cartes.';
    // bilan par compétence
    const groups = {};
    results.forEach(r => { const g = groups[skillOf(r.q)] || (groups[skillOf(r.q)] = { ok: 0, n: 0 }); g.n++; if (r.ok) g.ok++; });
    const rows = Object.entries(groups).map(([name, g]) => ({ name, ...g, lv: ratioLevel(g.ok / g.n) }));
    const weak = rows.filter(r => r.lv !== 'ok');
    const plan = weak.length
      ? `<ul class="points">${weak.map(r => `<li>Relis « ${esc(r.name)} » dans la leçon, puis refais ses cartes.</li>`).join('')}<li>Refais un quiz ciblé demain pour vérifier.</li></ul>`
      : '<p>Tout est acquis dans ce quiz. Reviens dans quelques jours pour confirmer.</p>';
    const reco = weak.length ? `Revois ${weak.map(r => `« ${esc(r.name)} »`).join(', ')} avant de repasser le quiz bilan.` : 'Bravo, tu peux passer au chapitre suivant.';
    const back = mini ? '#/daily' : '#/course/' + c.id;
    $app.innerHTML = `
      <h1>Bilan</h1>
      <div class="card"><div class="score">${score}/${qs.length}</div><p style="text-align:center">${msg}</p></div>
      <div class="card"><b>${reco}</b></div>
      <h2>Mes compétences</h2>
      <div class="card">${rows.map(r => `<div class="row between" style="margin-bottom:6px"><span>${esc(r.name)} <span class="muted">${r.ok}/${r.n}</span></span><span class="chip ${SKILL_CLASS[r.lv]}">${SKILL_LV[r.lv]}</span></div>`).join('')}</div>
      <h2>Mon plan de révision</h2>
      <div class="card">${plan}</div>
      <div class="row" id="acts" style="margin-bottom:12px">
        ${wrong.length && !mini ? `<button id="mk">Créer des cartes avec mes erreurs (${wrong.length})</button>` : ''}
        ${!mini && weakQuestions(c).length ? `<a class="btn ghost" href="#/quiz/${c.id}/weak" onclick="setTimeout(route,0)">Quiz ciblé</a>` : ''}
        ${!mini ? `<a class="btn ghost" href="#/quiz/${c.id}" onclick="setTimeout(route,0)">Refaire un quiz</a><a class="btn ghost" href="#/review/course/${c.id}">Réviser les cartes</a>` : ''}
        <a class="btn ghost" href="${back}">${mini ? 'Retour' : 'Retour au cours'}</a>
      </div>
      ${wrong.length ? `<h2>À revoir</h2>${wrong.map(q => `<div class="card"><b>${esc(q.q)}</b><div class="muted">Réponse : ${esc(answerText(q))}</div>${q.explanation ? `<div class="explain">${esc(q.explanation)}</div>` : ''}${q.pitfall ? `<div class="explain"><b>Erreur fréquente :</b> ${esc(q.pitfall)}</div>` : ''}</div>`).join('')}` : ''}`;
    const mk = document.getElementById('mk');
    if (mk) mk.onclick = () => {
      const n = cardsFromMistakes(c, wrong); mk.disabled = true;
      mk.textContent = n ? `✔ ${n} carte${n > 1 ? 's' : ''} ajoutée${n > 1 ? 's' : ''}` : 'Ces cartes existent déjà';
    };
  };
  step();
}

/* ---------- Réglages ---------- */
function viewSettings() {
  const s = db.settings, P = providerOf(), custom = !P.models.some(m => m[0] === s.model);
  $app.innerHTML = `
    <h1>Réglages</h1>
    <form id="f" class="card">
      <label>Prénom</label><input id="name" value="${esc(s.name)}" placeholder="Ton prénom">
      <label>Intelligence artificielle</label>
      <select id="provider">${Object.entries(PROVIDERS).map(([k, v]) => `<option value="${k}" ${P === v ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>
      <label>Clé API ${esc(P.short)}</label>
      <input id="key" type="password" value="${esc(s.apiKey)}" placeholder="${esc(P.keyPh)}" autocomplete="off">
      <div class="muted">Elle reste uniquement sur cet appareil${P.direct ? ` et n'est envoyée qu'à ${esc(P.host)}` : ` ; elle transite par le relais /api/ai de ton site jusqu'à ${esc(P.host)}, sans être conservée`}. Crée-la sur ${esc(P.docs)} et fixe-lui une limite de dépense.</div>
      ${P.files ? '' : '<div class="muted"><b>À savoir :</b> Perplexity est un moteur de recherche, moins adapté pour écrire des leçons structurées ; il ne lit pas les photos ni les PDF (colle le texte du cours). Utilise-le si tu veux comparer.</div>'}
      <label>Modèle</label>
      <select id="model">${P.models.map(([v, l]) => `<option value="${v}" ${s.model === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}<option value="__custom" ${custom ? 'selected' : ''}>Autre (saisir le nom)…</option></select>
      <input id="modelCustom" placeholder="Nom exact du modèle" value="${custom ? esc(s.model) : ''}" ${custom ? '' : 'hidden'} autocomplete="off" style="margin-top:6px">
      <label class="check"><input type="checkbox" id="bonus" ${s.bonus !== false ? 'checked' : ''}> Poser une question « pourquoi ? / exemple ? » après une bonne réponse</label>
      <div class="row" style="margin-top:14px"><button type="submit">Enregistrer</button><button type="button" class="ghost" id="test">Tester la clé</button><span id="st"></span></div>
    </form>
    <h2>Mises à jour</h2>
    <div class="card row">
      <div class="muted" style="flex-basis:100%">Version installée : ${APP_VERSION}</div>
      <button class="ghost" id="updCheck">Rechercher une mise à jour</button>
      <button class="danger" id="updForce">Forcer la mise à jour</button>
      <div class="muted" style="flex-basis:100%">« Forcer » vide le cache de l'appli et recharge la dernière version. Tes cours, tes cartes et tes réglages sont conservés.</div>
    </div>
    <h2>Sauvegarde complète</h2>
    <div class="card row">
      <button class="ghost" id="exp">Exporter mes données</button>
      <label class="btn ghost" style="margin:0">Importer<input id="imp" type="file" accept="application/json" hidden></label>
      <div class="muted" style="flex-basis:100%">Cours, cartes, paquets et statistiques. La clé API n'est pas incluse. Pour partager seulement des cartes, utilise l'export CSV dans « Cartes ».</div>
    </div>`;
  const sel = document.getElementById('model'), cm = document.getElementById('modelCustom');
  sel.onchange = () => { cm.hidden = sel.value !== '__custom'; if (!cm.hidden) cm.focus(); };
  const read = () => {
    s.name = document.getElementById('name').value.trim(); s.apiKey = document.getElementById('key').value.trim();
    s.model = sel.value === '__custom' ? (cm.value.trim() || P.models[0][0]) : sel.value; s.bonus = document.getElementById('bonus').checked; save();
  };
  document.getElementById('provider').onchange = ev => { read(); switchProvider(ev.target.value); save(); viewSettings(); };
  document.getElementById('f').onsubmit = ev => { ev.preventDefault(); read(); toast('Réglages enregistrés ✔'); };
  document.getElementById('test').onclick = async () => {
    read(); const st = document.getElementById('st'); st.innerHTML = '<span class="spinner"></span>';
    const r = await pingProvider();
    st.innerHTML = r.ok ? `<b style="color:var(--ok)">${esc(r.msg)}</b>` : `<span class="err">${esc(r.msg)}</span>`;
  };
  document.getElementById('updCheck').onclick = async () => {
    if (!swReg) return toast('Les mises à jour ne sont pas disponibles dans ce mode.');
    try {
      await swReg.update();
      if (swReg.waiting && navigator.serviceWorker.controller) showUpdate(swReg.waiting);
      else if (swReg.installing) toast('Nouvelle version en cours de téléchargement…');
      else toast('Révizio est à jour ✔');
    } catch (e) { toast('Impossible de vérifier (pas de connexion ?).'); }
  };
  document.getElementById('updForce').onclick = async () => {
    if (!confirm('Recharger la dernière version de Révizio ? Tes cours, tes cartes et tes réglages sont conservés.')) return;
    try {
      if ('serviceWorker' in navigator) await Promise.all((await navigator.serviceWorker.getRegistrations()).map(r => r.unregister()));
      if (window.caches) await Promise.all((await caches.keys()).map(k => caches.delete(k)));
    } catch (e) { /* on recharge quand même */ }
    location.reload();
  };
  document.getElementById('exp').onclick = () => {
    const blob = new Blob([JSON.stringify({ courses: db.courses, cards: db.cards, decks: db.decks, activity: db.activity, exportedAt: Date.now() }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `revizio-${today()}.json`; a.click();
  };
  document.getElementById('imp').onchange = async ev => {
    try {
      const d = JSON.parse(await ev.target.files[0].text());
      if (!Array.isArray(d.courses)) throw new Error();
      if (!confirm('Remplacer les cours, cartes et paquets actuels par ceux du fichier ?')) return;
      const m = migrate({ settings: db.settings, courses: d.courses, cards: d.cards, decks: d.decks, activity: d.activity });
      db.courses = m.courses; db.cards = m.cards; db.decks = m.decks; db.activity = m.activity;
      save(); toast('Import réussi ✔'); location.hash = '#/';
    } catch (e) { toast('Fichier invalide.'); }
  };
}

/* ---------- Mises à jour : téléchargées en arrière-plan, activées quand l'utilisateur clique ---------- */
let swReg = null, wantReload = false;
function showUpdate(worker) {
  if (document.getElementById('upd')) return;
  const b = document.createElement('div');
  b.id = 'upd'; b.className = 'update';
  b.innerHTML = '<span>Une nouvelle version de Révizio est disponible.</span><button id="updBtn">Mettre à jour</button>';
  document.body.appendChild(b);
  document.getElementById('updBtn').onclick = ev => {
    ev.target.disabled = true; ev.target.textContent = 'Mise à jour…';
    wantReload = true;
    worker.postMessage({ type: 'SKIP_WAITING' });
  };
}
function watchUpdates(reg) {
  swReg = reg;
  if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const nw = reg.installing;
    if (nw) nw.addEventListener('statechange', () => {
      if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdate(nw);
    });
  });
}
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').then(watchUpdates).catch(() => {});
  // Rechargement uniquement après un clic (évite un rechargement surprise à la première installation).
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (wantReload) location.reload(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && swReg) swReg.update().catch(() => {}); });
}
route();
