/* Révizio — écrans principaux, routeur, mises à jour. (noyau : core.js · cartes : cards.js) */
'use strict';

/* ---------- Routeur ---------- */
const routes = [
  [/^\/?$/, viewHome],
  [/^\/new$/, viewGenerate],
  [/^\/import$/, viewImport],
  [/^\/course\/(\w+)$/, viewCourse],
  [/^\/review(?:\/(course|deck)\/(\w+))?$/, viewReview],
  [/^\/quiz\/(\w+)$/, viewQuiz],
  [/^\/library$/, viewLibrary],
  [/^\/card\/(\w+)$/, viewCardForm],
  [/^\/understand(?:\/(\w+))?$/, viewUnderstand],
  [/^\/settings$/, viewSettings],
];
function route() {
  const path = location.hash.replace(/^#/, '') || '/';
  const area = path === '/new' || path === '/import' ? 'new' : path.startsWith('/library') || path.startsWith('/card/') ? 'library' : path === '/settings' ? 'settings' : 'home';
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
  const hello = db.settings.name ? `Salut ${esc(db.settings.name)} 👋` : 'Bienvenue sur Révizio 👋';
  $app.innerHTML = `
    <h1>${hello}</h1>
    ${!db.settings.apiKey ? `<div class="card"><b>Première étape :</b> ajoute ta clé API dans les <a href="#/settings">Réglages</a> pour que Révizio puisse créer des cours et des cartes. Tu peux déjà <a href="#/card/new">créer des cartes à la main</a>.</div>` : ''}
    <div class="card hero">${due
      ? `<div class="big">${due}</div><div>carte${due > 1 ? 's' : ''} à revoir aujourd'hui</div><a class="btn" href="#/review">Commencer</a>`
      : `<div class="big">🎉</div><div>Rien à revoir aujourd'hui${total ? '' : ' — crée ta première carte !'}</div>`}</div>
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
    <h2>Mes cours</h2>
    ${db.courses.length ? db.courses.slice().sort((a, b) => b.createdAt - a.createdAt).map(courseCard).join('') :
      `<div class="card muted">Aucun cours pour l'instant. Choisis ta classe, une matière et un chapitre, et Révizio prépare la leçon, les cartes mémoire et le quiz.</div>`}
    ${progressBySubject()}`;
}
function courseCard(c) {
  const sc = avgScore(c), n = cardsOf(c.id).length, d = dueItems(x => x.courseId === c.id).length;
  return `<a class="card course" href="#/course/${c.id}">
    <div class="row between"><b>${esc(c.title)}</b>${subjChip(c.subject)}</div>
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
    <p class="muted">Choisis ta classe, la matière et le chapitre : Révizio prépare la leçon, des cartes mémoire et un quiz. Tu as déjà ton cours ? <a href="#/import">Importe-le plutôt</a>.</p>
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
      <div class="row" style="margin-top:14px"><button id="go" type="submit">Préparer mon cours</button><span id="st"></span></div>
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
    btn.disabled = true; st.innerHTML = '<span class="spinner"></span> Préparation du cours… (≈ 30-60 s)';
    try {
      const text = `Classe : ${level}\nMatière : ${subj(subject).label}\nChapitre demandé : ${chapter}${entry ? `\nNotions au programme de ce chapitre (reste dans ce périmètre) : ${entry[1]}` : ''}${extra ? `\nPrécisions : ${extra}` : ''}`;
      const r = await callClaude([{ type: 'text', text }], 8000, SYSTEM_GEN);
      const course = {
        id: uid(), subject, level, origin: 'generated', title: r.title || chapter, createdAt: Date.now(),
        summary: r.summary || '', lesson: normLesson(r.lesson), keyPoints: r.keyPoints || [], questions: normQuestions(r.questions), scores: [],
      };
      const cards = normCards(r.cards, { subject, chapter: course.title, courseId: course.id });
      if (!cards.length && !course.questions.length) throw new Error('Rien de généré, reformule le chapitre et réessaie.');
      db.courses.push(course); db.cards.push(...cards); save();
      toast('Cours prêt ✔'); location.hash = '#/course/' + course.id;
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
      toast('Cours ajouté ✔'); location.hash = '#/course/' + course.id;
    } catch (e) {
      st.innerHTML = `<span class="err">${esc(e.message)}</span>`; btn.disabled = false;
    }
  };
}

/* ---------- Fiche d'un cours ---------- */
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
    <div class="card"><h2 style="margin-top:0">Résumé</h2><p>${esc(c.summary)}</p></div>
    ${lessonHtml(c)}
    <div class="card"><h2 style="margin-top:0">À retenir</h2><ul class="points">${c.keyPoints.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>
    ${c.mindmap ? `<div class="card"><h2 style="margin-top:0">Carte mentale</h2>${mindmapHtml(c.mindmap)}</div>` : ''}
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

/* ---------- Quiz ---------- */
function viewQuiz(id) {
  const c = getCourse(id);
  if (!c || !c.questions.length) { toast('Pas de questions pour ce cours.'); location.hash = '#/'; return; }
  const qs = shuffle(c.questions).slice(0, 10);
  let i = 0, score = 0; const wrong = [];
  const step = () => {
    if (i >= qs.length) return end();
    const q = qs[i];
    $app.innerHTML = `
      <div class="row between"><span class="muted">Question ${i + 1} / ${qs.length}</span>${subjChip(c.subject)}</div>
      <div class="bar" style="margin:8px 0"><i style="width:${i / qs.length * 100}%"></i></div>
      <div class="card"><b>${esc(q.q)}</b></div><div id="body"></div>`;
    const body = document.getElementById('body');
    const finish = ok => {
      if (ok) score++; else wrong.push(q);
      body.insertAdjacentHTML('beforeend', `${q.explanation ? `<div class="explain">${esc(q.explanation)}</div>` : ''}<button id="nx" style="width:100%">${i + 1 < qs.length ? 'Suivant' : 'Voir mon score'}</button>`);
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
    c.scores.push({ date: Date.now(), score, total: qs.length }); markActivity(); save();
    const pct = Math.round(score / qs.length * 100);
    const msg = pct >= 80 ? 'Excellent, la leçon est bien acquise !' : pct >= 50 ? 'Pas mal, quelques points à consolider.' : 'À retravailler : relis la fiche et refais les cartes.';
    $app.innerHTML = `
      <h1>Résultat</h1>
      <div class="card"><div class="score">${score}/${qs.length}</div><p style="text-align:center">${msg}</p></div>
      ${wrong.length ? `<h2>À revoir</h2>${wrong.map(q => `<div class="card"><b>${esc(q.q)}</b><div class="muted">Réponse : ${esc(q.type === 'qcm' ? q.choices[q.answer] : q.answer)}</div>${q.explanation ? `<div class="explain">${esc(q.explanation)}</div>` : ''}</div>`).join('')}` : ''}
      <div class="row"><a class="btn" href="#/quiz/${c.id}" onclick="setTimeout(route,0)">Refaire un quiz</a><a class="btn ghost" href="#/course/${c.id}">Retour au cours</a></div>`;
  };
  step();
}

/* ---------- Réglages ---------- */
function viewSettings() {
  const s = db.settings;
  $app.innerHTML = `
    <h1>Réglages</h1>
    <form id="f" class="card">
      <label>Prénom</label><input id="name" value="${esc(s.name)}" placeholder="Ton prénom">
      <label>Clé API Anthropic</label>
      <input id="key" type="password" value="${esc(s.apiKey)}" placeholder="sk-ant-…" autocomplete="off">
      <div class="muted">Elle reste uniquement sur cet appareil et n'est envoyée qu'à api.anthropic.com. Crée-la sur console.anthropic.com et fixe-lui une limite de dépense.</div>
      <label>Modèle</label>
      <select id="model">${MODELS.map(([v, l]) => `<option value="${v}" ${s.model === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
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
  const read = () => { s.name = document.getElementById('name').value.trim(); s.apiKey = document.getElementById('key').value.trim(); s.model = document.getElementById('model').value; s.bonus = document.getElementById('bonus').checked; save(); };
  document.getElementById('f').onsubmit = ev => { ev.preventDefault(); read(); toast('Réglages enregistrés ✔'); };
  document.getElementById('test').onclick = async () => {
    read(); const st = document.getElementById('st'); st.innerHTML = '<span class="spinner"></span>';
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': s.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model: s.model, max_tokens: 5, messages: [{ role: 'user', content: 'Dis ok' }] }) });
      st.innerHTML = r.ok ? '<b style="color:var(--ok)">Clé valide ✔</b>' : `<span class="err">Échec (${r.status})</span>`;
    } catch (e) { st.innerHTML = '<span class="err">Réseau indisponible</span>'; }
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
