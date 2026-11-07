/* Révizio — écrans principaux, routeur, mises à jour. (noyau : core.js · cartes : cards.js) */
'use strict';

/* ---------- Routeur ---------- */
const routes = [
  [/^\/?$/, viewHome],
  [/^\/courses$/, viewCourses],
  [/^\/revise$/, viewRevise],
  [/^\/progress$/, viewProgress],
  [/^\/new(?:\?(.*))?$/, viewGenerate],
  [/^\/profile$/, viewProfile],
  [/^\/path\/(\w+)\/cards$/, id => viewReview('course', id, { path: true, limit: 8 })],
  [/^\/import$/, viewImport],
  [/^\/subject\/(\w+)$/, viewSubject],
  [/^\/pack\/([\w.\-]+)\/(\d+)$/, viewPackChapter],
  [/^\/course\/(\w+)$/, viewCourse],
  [/^\/course\/(\w+)\/lesson$/, viewLesson],
  [/^\/train\/(\w+)$/, id => viewTrain(id)],
  [/^\/train\/(\w+)\/target$/, id => viewTrain(id, 'target')],
  [/^\/review(?:\/(course|deck|subject)\/(\w+))?$/, (s, i) => viewReview(s, i)],
  [/^\/quiz\/(\w+)$/, id => viewQuiz(id)],
  [/^\/quiz\/(\w+)\/weak$/, id => viewQuiz(id, 'weak')],
  [/^\/quiz\/(\w+)\/missed$/, id => viewQuiz(id, 'missed')],
  [/^\/daily$/, viewDaily],
  [/^\/daily\/run$/, viewSession],
  [/^\/daily\/cards$/, () => viewReview('smart')],
  [/^\/daily\/quiz$/, () => viewQuiz('mini')],
  [/^\/library$/, viewLibrary],
  [/^\/card\/(\w+)$/, viewCardForm],
  [/^\/settings$/, viewSettings],
];
/* Menus qui dépendent de l'IA : visibles seulement avec une clé API */
function syncAiUi() { document.querySelectorAll('[data-ai]').forEach(a => { a.hidden = !hasAI(); }); }
function route() {
  const path = location.hash.replace(/^#/, '') || '/';
  const area = /^\/(courses|new|import|course\/)/.test(path) ? 'courses' : /^\/(revise|library|card\/|subject\/|pack\/|review|daily|path\/)/.test(path) ? 'revise' : path === '/progress' ? 'progress' : path === '/settings' || path === '/profile' ? 'settings' : 'home';
  syncAiUi();
  document.body.classList.toggle('focus', /^\/(quiz\/|train\/|daily\/run$|daily\/quiz$)/.test(path)); // pendant un exercice : pas de menu, un bouton Quitter
  if ((path.startsWith('/new') || path === '/import') && !hasAI()) { location.hash = '#/'; return; } // pages de création : réservées à l'IA
  document.querySelectorAll('nav a').forEach(a => { const on = a.dataset.nav === area; a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) { window.scrollTo(0, 0); return fn(...m.slice(1)); }
  }
  location.hash = '#/';
}
/* Accessibilité : titre de l'onglet, focus sur le contenu à chaque changement d'écran, étiquettes des champs */
function enhanceA11y() {
  const app = document.getElementById('app'); if (!app) return;
  app.querySelectorAll('label:not([for])').forEach(l => {
    if (l.querySelector('input,select,textarea')) return;
    const n = l.nextElementSibling; if (n && /^(INPUT|SELECT|TEXTAREA)$/.test(n.tagName) && n.id) l.htmlFor = n.id;
  });
  app.querySelectorAll('input,select,textarea').forEach(el => {
    if (el.type === 'hidden' || el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby') || (el.labels && el.labels.length)) return;
    const t = el.getAttribute('placeholder') || el.title || (el.tagName === 'SELECT' && el.options[0] ? el.options[0].textContent : '');
    if (t) el.setAttribute('aria-label', t.trim());
  });
}
let a11yQueued = false;
function queueA11y() { guardNext(); if (a11yQueued) return; a11yQueued = true; setTimeout(() => { a11yQueued = false; enhanceA11y(); }, 0); }
if (typeof MutationObserver !== 'undefined') new MutationObserver(queueA11y).observe(document.getElementById('app'), { childList: true, subtree: true });
function announceScreen() {
  const h = document.querySelector('#app h1, #app h2');
  document.title = (h && h.textContent.trim() ? h.textContent.trim() + ' · ' : '') + 'Révizio';
  const app = document.getElementById('app'); if (app && app.focus) app.focus({ preventScroll: true });
}
document.addEventListener('click', e => { // bouton « Quitter » d'un exercice : confirmation, puis retour
  const q = e.target.closest && e.target.closest('[data-quit]'); if (!q) return;
  e.preventDefault();
  if (window.confirm(q.dataset.msg || 'Quitter cet exercice ?')) location.hash = q.dataset.quit;
});
/* Garde anti double-tap : un bouton « Suivant » qui vient d'apparaître ne répond qu'après 0,45 s */
function guardNext() {
  if (window.REVIZIO_NOGUARD) return;
  document.querySelectorAll('#app #nx:not([data-g])').forEach(b => { b.dataset.g = '1'; b.disabled = true; setTimeout(() => { b.disabled = false; }, 450); });
}
window.addEventListener('hashchange', route);
window.addEventListener('hashchange', () => setTimeout(announceScreen, 60));

/* ---------- Choisir une matière (point d'entrée principal) ---------- */
function subjectGrid() {
  const prep = prepSubjects();
  return `<h2 style="margin-top:.4em">Choisis une matière</h2><div class="grid subjgrid">${Object.keys(SUBJECTS).filter(k => k !== 'autre').map(k => {
    const s = SUBJECTS[k], n = db.courses.filter(c => c.subject === k).length;
    return `<a class="card tile subj" href="#/subject/${k}" style="--sc:${s.color}"><span class="ico">${s.emoji}</span><b>${esc(s.short)}</b><span class="muted">${n ? plural(n, 'chapitre') : 'à découvrir'}</span>${prep.includes(k) ? '<span class="prepflag" title="À préparer pour les prochains jours de cours">⭐</span>' : ''}</a>`;
  }).join('')}</div>`;
}

/* ---------- Fiche du joueur : niveau, rang, XP, stats, quête du jour ---------- */
function statusHtml() {
  const p = playerStats(), q = questState();
  const bar = (v, max) => `<span class="qbar"><i style="width:${Math.min(100, Math.round(v / max * 100))}%"></i></span>`;
  return `<section class="card status" aria-label="${esc(tx('status_title'))}">
      <div class="st-head">
        <span class="st-av">${esc(db.settings.avatar || '🥷')}</span>
        <div class="st-id"><b>${esc(db.settings.name || tx('title_name'))}</b><small>${esc(tx('title_name'))}</small></div>
        <div class="st-rank" title="Rang">${p.rank}</div>
      </div>
      <div class="st-lv"><b>Niv. ${p.level}</b><span class="xpbar" role="progressbar" aria-valuenow="${p.pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${p.pct}%"></i></span><small>${p.into}/${p.need} XP</small></div>
      <div class="st-stats">
        <span><small>Mémoire</small><b>${p.memoire}</b></span>
        <span><small>Savoir</small><b>${p.savoir}</b></span>
        <span><small>Endurance</small><b>${p.endurance}</b></span>
      </div>
      <div class="quest${q.done ? ' done' : ''}">
        <div class="row between"><b>${q.done ? '🏅' : '🎯'} ${esc(tx('quest_title'))}</b><span class="muted">${q.done ? 'Accomplie ✔ +' + XP_GAIN.quest + ' XP' : '+' + XP_GAIN.quest + ' XP'}</span></div>
        <div class="qline"><span>Réviser ${QUEST.cards} cartes</span>${bar(q.cards, QUEST.cards)}<small>${Math.min(q.cards, QUEST.cards)}/${QUEST.cards}</small></div>
        <div class="qline"><span>Répondre à ${QUEST.qs} questions</span>${bar(q.qs, QUEST.qs)}<small>${Math.min(q.qs, QUEST.qs)}/${QUEST.qs}</small></div>
      </div>
    </section>`;
}

/* ---------- Accueil ---------- */
function exportData() {
  const blob = new Blob([JSON.stringify(backupData(), null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `revizio-${today()}.json`; a.click();
  db.settings.lastBackup = Date.now(); save(); toast('Sauvegarde enregistrée ✔');
}
/* Une seule action principale : cartes dues → séance du jour → reprendre le dernier chapitre → choisir une matière */
function nextStep() {
  const due = dueItems().length;
  if (due) return { href: '#/review', ico: '🃏', title: `Réviser ${due} carte${due > 1 ? 's' : ''}`, sub: `À revoir aujourd'hui · ≈ ${Math.max(1, Math.round(due * 0.4))} min` };
  const S = buildSession();
  if (S.total) { const rec = recommend(); return { href: '#/daily', ico: '🎯', title: tx('daily_title'), sub: `≈ ${S.minutes} min · ${S.total} étapes${rec ? ' · ' + rec : ''}` }; }
  const last = db.courses.filter(c => courseMastery(c) !== 'maitrise').sort((x, y) => lastSeen(y) - lastSeen(x))[0];
  if (last) return { href: '#/course/' + last.id, ico: '▶️', title: 'Reprendre mon chapitre', sub: last.title };
  return { href: '#/revise', ico: '📘', title: 'Choisir une matière', sub: 'Commence par un chapitre de ton programme' };
}
const homeSubjectKeys = () => { // matières de l'emploi du temps (et celles déjà travaillées) ; les autres sont repliées
  const all = Object.keys(SUBJECTS).filter(k => k !== 'autre');
  if (!hasSchedule()) return { main: all, other: [] };
  const week = new Set(); WEEK.forEach(([d]) => subjectsOfDay(d).forEach(k => week.add(k)));
  const main = all.filter(k => week.has(k) || db.courses.some(c => c.subject === k));
  return { main, other: all.filter(k => !main.includes(k)) };
};
function subjTiles(keys) {
  const prep = prepSubjects();
  return `<div class="grid subjgrid">${keys.map(k => {
    const s = SUBJECTS[k], n = db.courses.filter(c => c.subject === k).length;
    return `<a class="card tile subj" href="#/subject/${k}" style="--sc:${s.color}"><span class="ico">${s.emoji}</span><b>${esc(s.short)}</b><span class="muted">${n ? plural(n, 'chapitre') : 'à découvrir'}</span>${prep.includes(k) ? '<span class="prepflag" title="À préparer pour les prochains jours de cours">⭐</span>' : ''}</a>`;
  }).join('')}</div>`;
}
function homeBanner() { // un seul bandeau à la fois, toujours fermable
  if (!db.settings.profileDone && !(db.settings.profileSnooze > Date.now())) return `<div class="card banner" id="pf" role="region" aria-label="Profil"><div><b>👤 Crée ton profil</b><div class="muted">Ta classe et ton emploi du temps : Révizio te dit quoi préparer.</div></div><div class="row"><a class="btn small" href="#/profile">Créer</a><button class="ghost small" id="pfLater" aria-label="Masquer">✕</button></div></div>`;
  if (backupDue()) return `<div class="card banner" id="bk" role="region" aria-label="Rappel de sauvegarde"><div><b>💾 Pense à sauvegarder</b><div class="muted">${db.settings.lastBackup ? 'Dernière sauvegarde : ' + fmtDate(db.settings.lastBackup) + '.' : 'Tu n\'as encore jamais sauvegardé.'}</div></div><div class="row"><button class="small" id="bkNow">Sauvegarder</button><button class="ghost small" id="bkLater" aria-label="Plus tard">✕</button></div></div>`;
  return '';
}
function viewHome() {
  const hello = db.settings.name ? `Salut ${esc(db.settings.name)} ${esc(db.settings.avatar || '🥷')}` : `${esc(tx('hello_new'))} ${esc(db.settings.avatar || '🥷')}`;
  const n = nextStep(), p = playerStats(), sj = homeSubjectKeys(), total = db.cards.length;
  $app.innerHTML = `
    <h1>${hello}</h1>
    <a class="card hero go" href="${n.href}" id="go1"><span class="ico">${n.ico}</span><span class="gt"><b>${esc(n.title)}</b><small>${esc(n.sub)}</small></span><span class="arrow" aria-hidden="true">›</span></a>
    <a class="statusline" href="#/progress" aria-label="Voir mes progrès"><span class="st-av">${esc(db.settings.avatar || '🥷')}</span><b>Niv. ${p.level}</b><span class="xpbar" role="progressbar" aria-valuenow="${p.pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${p.pct}%"></i></span><span>🔥 ${streak()}</span><span class="arrow" aria-hidden="true">›</span></a>
    ${homeBanner()}
    <h2>Matières</h2>
    ${subjTiles(sj.main)}
    ${sj.other.length ? `<details class="others"><summary>Autres matières (${sj.other.length})</summary>${subjTiles(sj.other)}</details>` : ''}
    <div class="grid shortcuts">
      <a class="card tile" href="#/courses"><span class="ico">📚</span><b>Mes cours</b><span class="muted">${db.courses.length} cours</span></a>
      <a class="card tile" href="#/library"><span class="ico">🗂️</span><b>Mes cartes</b><span class="muted">${total} carte${total > 1 ? 's' : ''}</span></a>
    </div>`;
  const bkNow = document.getElementById('bkNow'), bkLater = document.getElementById('bkLater'), pfLater = document.getElementById('pfLater');
  if (bkNow) bkNow.onclick = () => { exportData(); viewHome(); };
  if (bkLater) bkLater.onclick = () => { db.settings.backupSnooze = Date.now() + BACKUP_SNOOZE_DAYS * 864e5; save(); viewHome(); };
  if (pfLater) pfLater.onclick = () => { db.settings.profileSnooze = Date.now() + 7 * 864e5; save(); viewHome(); };
}
/* ---------- Réviser : emploi du temps, toutes les matières, paquets ---------- */
function viewRevise() {
  const due = dueItems().length, reserve = reserveCount();
  $app.innerHTML = `
    <h1>Réviser</h1>
    <div class="card hero">${due
      ? `<div class="big">${due}</div><div>carte${due > 1 ? 's' : ''} à revoir aujourd'hui</div><a class="btn" href="#/review">${esc(tx('session_btn'))}</a>`
      : `<div class="big">✨</div><div>Rien à revoir aujourd'hui${db.cards.length ? '' : ' — crée ta première carte !'}</div>`}
      ${reserve ? `<div class="muted" style="margin-top:8px">+ ${reserve} nouvelle${reserve > 1 ? 's' : ''} carte${reserve > 1 ? 's' : ''} arrivent les prochains jours (${NEW_PER_DAY} par jour)</div>` : ''}</div>
    ${(() => { const S = buildSession(), rec = recommend(); return (S.total ? `<a class="card course" href="#/daily"><div class="row between"><b>🎯 ${esc(tx('daily_title'))}</b><span class="muted">≈ ${S.minutes} min</span></div><div class="muted">${S.total} étapes mélangées : ${S.counts.cards} carte${S.counts.cards > 1 ? 's' : ''} · ${S.counts.ex} exercice${S.counts.ex > 1 ? 's' : ''} · ${S.counts.nw} nouvelle notion · ${S.counts.expl} explication</div></a>` : '') + (rec ? `<div class="card"><b>Conseil :</b> ${esc(rec)}</div>` : ''); })()}
    <h2>Toutes les matières</h2>
    ${subjTiles(Object.keys(SUBJECTS).filter(k => k !== 'autre'))}
    ${prepHtml()}
    ${db.decks.length ? `<h2>Mes paquets</h2>${db.decks.map(d => {
      const n = dueItems(c => d.cardIds.includes(c.id)).length;
      return `<div class="card row between"><span><b>${esc(d.name)}</b> <span class="muted">${d.cardIds.length} cartes${n ? ` · ${n} à revoir` : ''}</span></span><a class="btn ghost" href="#/review/deck/${d.id}">Réviser</a></div>`;
    }).join('')}` : ''}
    <div class="row" style="margin:12px 0"><a class="btn ghost" href="#/library">🗂️ Mes cartes</a><a class="btn ghost" href="#/card/new">+ Carte</a></div>`;
}
/* ---------- Progrès : fiche, quête, chiffres, médailles, moyennes ---------- */
function viewProgress() {
  const total = db.cards.length;
  const mastered = db.cards.filter(c => cardLevel(c) === 'maitrisee').length, toReview = db.cards.filter(c => cardLevel(c) === 'revoir' && !(isPackCard(c) && dirsOf(c).every(d => isNewState(stateOf(c, d))))).length;
  $app.innerHTML = `
    <h1>Mes progrès</h1>
    ${statusHtml()}
    <div class="grid">
      <div class="card stat"><b>${total}</b><span class="muted">cartes créées</span></div>
      <div class="card stat"><b>${mastered}</b><span class="muted">maîtrisées</span></div>
      <div class="card stat"><b>${toReview}</b><span class="muted">à revoir</span></div>
      <div class="card stat"><b>🔥 ${streak()}</b><span class="muted">jour${streak() > 1 ? 's' : ''} de suite</span></div>
    </div>
    ${progressBySubject()}
    ${(() => { const b = computeBadges(), n = b.filter(x => x.got).length; return `<h2>${esc(tx('badges_title'))} <span class="muted">${n}/${b.length}</span></h2><div class="card badges">${b.map(x => `<span class="badge${x.got ? ' got' : ''}" title="${x.got ? 'Obtenu' : 'À débloquer'}"><span>${x.ico}</span><span><b>${esc(x.label)}</b><small>${esc(x.desc)}</small></span></span>`).join('')}</div>`; })()}`;
}
/* ---------- Bibliothèque de cours ---------- */
const lastSeen = c => c.lastOpened || c.createdAt || 0;
function viewCourses() {
  const st = { level: '', subject: '', q: '' };
  const levels = LEVELS.filter(l => db.courses.some(c => c.level === l));
  const subjects = Object.keys(SUBJECTS).filter(k => db.courses.some(c => c.subject === k));
  $app.innerHTML = `
    <div class="row between"><h1>Mes cours</h1>${hasAI() ? '<a class="btn" href="#/new">+ Nouveau</a>' : ''}</div>
    ${db.courses.length ? `<div class="row2">
      <select id="fl"><option value="">Toutes les classes</option>${levels.map(l => `<option>${l}</option>`).join('')}</select>
      <select id="fs"><option value="">Toutes les matières</option>${subjects.map(k => `<option value="${k}">${esc(SUBJECTS[k].label)}</option>`).join('')}</select>
    </div><input id="fq" placeholder="Rechercher un cours…" style="margin:10px 0" autocomplete="off">` : ''}
    <div id="list"></div>`;
  const draw = () => {
    const q = normText(st.q);
    const list = db.courses.filter(c => (!st.level || c.level === st.level) && (!st.subject || c.subject === st.subject) && (!q || normText(c.title).includes(q)))
      .sort((a, b) => lastSeen(b) - lastSeen(a));
    document.getElementById('list').innerHTML = list.length ? list.map(courseCard).join('')
      : `<div class="card muted">${db.courses.length ? 'Aucun cours ne correspond.' : (hasAI() ? 'Aucun cours pour l\'instant. <a href="#/new">Crée ton premier cours</a> ou <a href="#/import">importe le tien</a>.' : 'Aucun cours pour l\'instant. Ouvre une matière depuis l\'accueil : les chapitres prêts s\'ajoutent tout seuls.')}</div>`;
  };
  if (db.courses.length) {
    document.getElementById('fl').onchange = e => { st.level = e.target.value; draw(); };
    document.getElementById('fs').onchange = e => { st.subject = e.target.value; draw(); };
    document.getElementById('fq').oninput = e => { st.q = e.target.value; draw(); };
  }
  draw();
}

/* ---------- Emploi du temps : « À préparer » et « Ma semaine » ---------- */
function prepHtml() {
  if (!hasSchedule()) return db.settings.profileDone ? `<div class="card"><b>📅 Emploi du temps</b><div class="muted">Indique tes matières de la semaine pour que Révizio te dise quoi préparer en priorité.</div><a class="btn ghost" href="#/profile" style="margin-top:8px">Remplir mon emploi du temps</a></div>` : '';
  const level = db.settings.level || '6e', now = new Date(), today = now.getDay(), days = prepDays(now), subjects = prepSubjects(now);
  const rows = subjects.map(k => {
    const due = dueItems(x => x.subject === k).length, has = db.courses.some(c => c.subject === k), sug = suggestChapter(level, k);
    return `<div class="prep-row"><div class="row between">${subjChip(k)}<span class="muted">${has ? (due ? `<b>${due} carte${due > 1 ? 's' : ''} à revoir</b>` : 'à jour') : 'aucun cours'}</span></div>
      <div class="row" style="margin-top:6px">${due ? `<a class="btn small" href="#/review/subject/${k}">Réviser</a>` : ''}${hasAI() ? (sug ? `<a class="btn ghost small" href="#/new?subject=${k}&ch=${sug.i}">Chapitre suivant : ${esc(sug.title)}</a>` : `<a class="btn ghost small" href="#/new?subject=${k}">Nouveau chapitre</a>`) : `<a class="btn ghost small" href="#/subject/${k}">Ouvrir les chapitres</a>`}</div></div>`;
  }).join('');
  const prepDow = days.map(d => d.dow);
  const grid = `<div class="week">${WEEK.map(([d, n]) => `<div class="wd${d === today ? ' today' : ''}${prepDow.includes(d) ? ' prep' : ''}"><b>${n.slice(0, 3)}</b>${subjectsOfDay(d).map(k => `<span class="ws" style="--sc:${SUBJECTS[k].color}" title="${esc(SUBJECTS[k].label)}">${SUBJECTS[k].emoji}<small>${esc(SUBJECTS[k].short)}</small></span>`).join('')}</div>`).join('')}</div>`;
  return `<div class="card prep"><div class="row between"><h2 style="margin:0">📅 À préparer pour ${esc(prepLabel(now))}</h2><a href="#/profile">Modifier</a></div>
    <div class="muted" style="margin:6px 0 10px">Les 2 prochains jours de cours : Révizio met ces matières en tête de ta séance.</div>${rows}${grid}</div>`;
}
function courseCard(c) {
  const sc = avgScore(c), n = cardsOf(c.id).length, d = dueItems(x => x.courseId === c.id, { all: true }).filter(it => !(isPackCard(it.card) && isNewState(stateOf(it.card, it.dir)))).length;
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
const stepsHtml = s => (s.steps || []).length ? `<ol class="steps">${s.steps.map(x => { const i = x.indexOf(' : '); return i > 0 && i < 60 ? `<li><b>${esc(x.slice(0, i))}</b> : ${esc(x.slice(i + 3))}</li>` : `<li>${esc(x)}</li>`; }).join('')}</ol>` : '';
const lessonBody = (s, subject) => `${fmt(s.content)}${stepsHtml(s)}${(s.examples || []).length ? `<div class="explain"><b>Exemples</b><ul class="points">${s.examples.map(e => `<li>${esc(e)}${sayBtns(e, subject)}</li>`).join('')}</ul></div>` : ''}`;
function lessonHtml(c) {
  if (!c.lesson || !c.lesson.length) return '';
  return `<div class="card"><h2 style="margin-top:0">La leçon</h2>
    ${[...c.lesson.filter(s => s.method), ...c.lesson.filter(s => !s.method)].map(s => s.method ? `<div class="methodbox"><h3>🧭 ${esc(s.title)}</h3>${lessonBody(s, c.subject)}</div>` : `<h3>${esc(s.title)}</h3>${lessonBody(s, c.subject)}`).join('')}
    <p class="muted">Leçon générée par IA d'après le programme de ${esc(c.level || 'ta classe')}. Compare-la avec ton cahier : ton professeur a pu insister sur d'autres points.</p></div>`;
}
function viewGenerate(query) {
  const q = Object.fromEntries(new URLSearchParams(query || '')), lvl = db.settings.level || '6e';
  $app.innerHTML = `
    <h1>Réviser un chapitre</h1>
    <p class="muted">Choisis ta classe, la matière et le chapitre. Révizio prépare ton cours : la leçon, quelques cartes visuelles, puis un test pour mesurer ton niveau.</p>
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
      <details id="own" style="margin-top:12px"><summary><b>📷 J'ai mon cours</b> <span class="muted">(photo, PDF ou texte — facultatif)</span></summary>
        <div class="muted" style="margin:6px 0">La leçon s'appuiera sur le cours de ton professeur. Sans fichier, elle suit le programme.</div>
        <input id="files" type="file" accept="image/*,application/pdf" multiple>
        <div class="muted">Sur téléphone, prends ton cahier en photo. Jusqu'à 6 fichiers.</div>
        <textarea id="text" placeholder="…ou colle le texte de ton cours ici" style="margin-top:8px"></textarea>
      </details>
      <label>Précisions (facultatif)</label>
      <input id="extra" placeholder="Ex. surtout les verbes du 1er groupe" autocomplete="off">
      <div class="muted" style="margin-top:6px">Les chapitres suivent les programmes officiels ; l'ordre peut différer de celui de ta classe. Ton chapitre n'y est pas ? Choisis « Autre chapitre… ».</div>
      <div class="row" style="margin-top:14px"><button id="go" type="submit">${esc(tx('gen_btn'))}</button><span id="st"></span></div>
    </form>`;
  const $ = id => document.getElementById(id);
  const FREE = '__free';
  const fillSubjects = () => {
    const keep = $('subject').value, keys = Object.keys(SUBJECTS).filter(k => k !== 'autre');
    $('subject').innerHTML = keys.map(k => `<option value="${k}">${esc(SUBJECTS[k].emoji + ' ' + SUBJECTS[k].label)}</option>`).join('');
    $('subject').value = keys.includes(keep) ? keep : (catalogSubjects($('level').value)[0] || keys[0]);
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
  if (LEVELS.includes(q.level)) $('level').value = q.level;
  fillSubjects();
  if (SUBJECTS[q.subject] && q.subject !== 'autre') $('subject').value = q.subject; // arrivée depuis « À préparer »
  fillChapters();
  if (q.ch !== undefined && chaptersFor($('level').value, $('subject').value)[+q.ch]) { $('chsel').value = String(+q.ch); showNotions(); }
  $('f').onsubmit = async ev => {
    ev.preventDefault();
    const level = $('level').value, subject = $('subject').value;
    const list = chaptersFor(level, subject), v = $('chsel').value, entry = v === FREE ? null : list[+v];
    const chapter = entry ? entry[0] : $('chapter').value.trim(), extra = $('extra').value.trim();
    if (chapter.length < 3) return toast('Indique le chapitre à réviser.');
    const files = [...$('files').files].slice(0, 6), pasted = $('text').value.trim(), own = files.length > 0 || pasted.length >= 30;
    db.settings.level = level; save();
    const btn = $('go'), st = $('st');
    btn.disabled = true; st.innerHTML = `<span class="spinner"></span> ${own ? 'Lecture de ton cours…' : tx('gen_wait')} (≈ 30-70 s)`;
    try {
      const head = `Classe : ${level}\nMatière : ${subj(subject).label}\nChapitre demandé : ${chapter}${entry ? `\nNotions au programme de ce chapitre (reste dans ce périmètre) : ${entry[1]}` : ''}${extra ? `\nPrécisions : ${extra}` : ''}`;
      let content;
      if (own) { content = await buildContent(files, pasted, subject, chapter, `Classe : ${level}.${entry ? ` Notions au programme : ${entry[1]}.` : ''} ${extra}`); content[content.length - 1].text = head + '\n\n' + content[content.length - 1].text; }
      else content = [{ type: 'text', text: head }];
      const r = await callClaude(content, 8000, SYSTEM_GEN);
      const course = {
        id: uid(), subject, level, origin: own ? 'imported' : 'generated', catalogTitle: entry ? entry[0] : '', title: r.title || chapter, createdAt: Date.now(),
        summary: r.summary || '', lesson: normLesson(r.lesson), keyPoints: r.keyPoints || [], questions: normQuestions(r.questions), scores: [], skills: {}, mistakes: [], path: {}, ...courseExtras(r),
      };
      const cards = normCards(r.cards, { subject, chapter: course.title, courseId: course.id });
      if (!cards.length && !course.questions.length) throw new Error('Rien de généré, reformule le chapitre et réessaie.');
      db.courses.push(course); db.cards.push(...cards); save();
      toast(tx('gen_done')); location.hash = '#/course/' + course.id;
    } catch (e) {
      st.innerHTML = `<span class="err">${esc(e.message)}</span>`; btn.disabled = false;
    }
  };
  if (q.go === '1' && db.settings.apiKey) $('f').dispatchEvent(new Event('submit', { cancelable: true })); // arrivée depuis l'écran d'une matière : on prépare tout de suite
}

/* ---------- Profil : avatar, prénom, classe, emploi du temps ---------- */
const AVATARS = ['🥷', '🦸', '🧙', '🧝', '🐉', '🦊', '🐺', '🐱'];
function viewProfile() {
  const s = db.settings, first = !s.profileDone, keys = Object.keys(SUBJECTS).filter(k => k !== 'autre');
  $app.innerHTML = `
    <h1>${first ? 'Crée ton profil' : 'Mon profil'}</h1>
    <form id="f" class="card">
      <label>Ton avatar</label>
      <div class="avatars">${AVATARS.map(a => `<button type="button" class="av${a === s.avatar ? ' on' : ''}" data-a="${a}" aria-pressed="${a === s.avatar}">${a}</button>`).join('')}</div>
      <label>Prénom</label><input id="name" value="${esc(s.name)}" placeholder="Ton prénom" autocomplete="off">
      <label>Classe</label>
      <select id="level">${LEVELS.map(l => `<option ${l === (s.level || '6e') ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <h2>Mon emploi du temps</h2>
      <div class="muted">Coche les matières de chaque jour. Révizio te fait préparer en priorité les matières des <b>2 prochains jours de cours</b> : le week-end, ce sont celles de lundi et mardi ; le mercredi, celles de jeudi et vendredi.</div>
      <div id="tt">${WEEK.map(([d, n]) => `<div class="ttrow"><b>${n}</b><div class="chips">${keys.map(k => { const on = subjectsOfDay(d).includes(k); return `<button type="button" class="tg${on ? ' on' : ''}" data-d="${d}" data-k="${k}" aria-pressed="${on}" style="--sc:${SUBJECTS[k].color}">${SUBJECTS[k].emoji} ${esc(SUBJECTS[k].short)}</button>`; }).join('')}</div></div>`).join('')}</div>
      <div class="row" style="margin-top:14px"><button type="submit">${first ? 'Commencer' : 'Enregistrer'}</button>${first ? '' : '<a class="btn ghost" href="#/">Annuler</a>'}</div>
    </form>`;
  const sched = s.schedule = s.schedule || {};
  document.querySelectorAll('.av').forEach(b => b.onclick = () => {
    s.avatar = b.dataset.a; save(); document.querySelectorAll('.av').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
  });
  document.querySelectorAll('.tg').forEach(b => b.onclick = () => {
    const d = b.dataset.d, k = b.dataset.k, list = sched[d] || (sched[d] = []), i = list.indexOf(k);
    if (i < 0) list.push(k); else list.splice(i, 1);
    save();
    b.classList.toggle('on', i < 0); b.setAttribute('aria-pressed', i < 0);
  });
  document.getElementById('f').onsubmit = ev => {
    ev.preventDefault();
    s.name = document.getElementById('name').value.trim(); s.level = document.getElementById('level').value; s.profileDone = true; save();
    toast('Profil enregistré ✨'); location.hash = '#/';
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
      toast(tx('gen_done')); location.hash = '#/course/' + course.id;
    } catch (e) {
      st.innerHTML = `<span class="err">${esc(e.message)}</span>`; btn.disabled = false;
    }
  };
}

/* ---------- Session du jour (révision intelligente) ---------- */
function viewDaily() {
  const S = buildSession(), rec = recommend();
  $app.innerHTML = `
    <h1>${esc(tx('daily_title'))}</h1>
    <p class="muted">Une séance de 10 à 15 minutes qui mélange les formats : <b>40 %</b> de cartes à revoir, <b>30 %</b> d'exercices, <b>20 %</b> de nouvelle notion et <b>10 %</b> d'explication avec tes mots. Elle commence par un rappel de tes notions fragiles et finit par un mini-bilan.</p>
    ${S.total ? `<div class="card hero">
      <div class="big">≈ ${S.minutes} min</div>
      <div>${S.total} étapes : ${S.counts.cards} carte${S.counts.cards > 1 ? 's' : ''} · ${S.counts.ex} exercice${S.counts.ex > 1 ? 's' : ''} · ${S.counts.nw} nouvelle notion · ${S.counts.expl} explication</div>
      <a class="btn" href="#/daily/run">Commencer</a></div>`
    : `<div class="card hero"><div class="big">🎉</div><div>Rien de prioritaire aujourd'hui. Tu peux avancer sur un nouveau chapitre.</div></div>`}
    ${rec ? `<div class="card"><b>Conseil du jour</b><p style="margin-bottom:0">${esc(rec)}</p></div>` : ''}
    <a class="btn ghost" href="#/">Retour</a>`;
}

/* ---------- Quiz ---------- */
/* id = identifiant d'un cours ; 'mini' = mini-quiz de la session du jour ; mode 'weak' = quiz ciblé sur les notions fragiles */
function viewQuiz(id, mode) {
  const mini = id === 'mini', c = mini ? null : getCourse(id);
  let qs;
  if (mini) qs = uniqueQs(shuffle(smartPlan().questions), x => x.q);
  else if (c) {
    let pool;
    if (mode === 'weak') pool = weakQuestions(c);
    else if (mode === 'missed') { const ids = new Set(c.lastMissed || []); pool = c.questions.filter(q => ids.has(qid(q))); }
    else { // bilan : 10 à 15 questions, différentes de celles du bilan précédent quand c'est possible
      const last = new Set(c.lastBilan || []), fresh = c.questions.filter(q => !last.has(qid(q)));
      pool = fresh.length >= Math.min(BILAN_MIN, c.questions.length) ? fresh : c.questions;
    }
    qs = (mode === 'weak' || mode === 'missed' ? uniqueQs(shuffle(pool)).slice(0, 10) : pickWithMethod(pool, BILAN_MAX)).map(q => ({ q, c }));
    if (!mode) c.lastBilan = qs.map(x => qid(x.q));
  }
  if (!qs || !qs.length) { toast(mini ? 'Aucune question fragile à retravailler, bravo !' : 'Pas de questions pour ce cours.'); location.hash = mini ? '#/daily' : '#/'; return; }
  let i = 0, score = 0; const results = [];
  const backTo = mini ? '#/daily' : '#/course/' + c.id;
  const draft0 = !mini && !mode && c.bilanDraft; // bilan interrompu : on propose de le reprendre
  if (draft0) {
    const map = new Map(c.questions.map(q => [qid(q), q])), d = draft0;
    if (d.i > 0 && d.i <= d.ids.length && d.ids.every(id => map.has(id)) && window.confirm(`Reprendre ton bilan là où tu t'es arrêté (question ${Math.min(d.i + 1, d.ids.length)} sur ${d.ids.length}) ?\nOK = reprendre, Annuler = nouveau bilan.`)) {
      qs = d.ids.map(id => ({ q: map.get(id), c })); i = d.i; score = d.score; c.lastBilan = d.ids.slice();
      d.res.forEach(r => results.push({ q: map.get(r.id), c, ok: r.ok }));
    } else { c.bilanDraft = null; save(); }
  }
  const step = () => {
    if (i >= qs.length) return end();
    const { q, c: qc } = qs[i];
    $app.innerHTML = `
      <div class="qhead"><span class="muted">${mode === 'weak' ? 'Quiz ciblé · ' : mode === 'missed' ? 'Questions ratées · ' : mini ? 'Mini-quiz · ' : 'Bilan de compétence · '}Question ${i + 1} / ${qs.length}</span><span class="row" style="gap:8px;flex-wrap:nowrap">${subjChip(qc.subject)}<button type="button" class="ghost small quit" data-quit="${backTo}" data-msg="${!mini && !mode ? 'Quitter le bilan ? Ta progression est gardée : tu pourras le reprendre.' : 'Quitter ? Tes réponses de cette série ne seront pas comptées.'}">✕ Quitter</button></span></div>
      <div class="bar" style="margin:8px 0"><i style="width:${i / qs.length * 100}%"></i></div>
      <div class="card"><b>${qHtml(q)}</b><div class="muted" style="margin-top:4px;font-size:.8rem">${exLabel(q)} ${levelDots(q)}</div></div><div id="body"></div>`;
    const body = document.getElementById('body');
    const finish = ok => {
      if (ok) score++;
      results.push({ q, c: qc, ok });
      if (!mini && !mode) { c.bilanDraft = { ids: qs.map(x => qid(x.q)), i: i + 1, score, res: results.map(r => ({ id: qid(r.q), ok: r.ok })) }; save(); } // progression gardée
      body.insertAdjacentHTML('beforeend', `${q.explanation ? `<div class="explain">${esc(q.explanation)}</div>` : ''}${!ok && q.pitfall ? `<div class="explain"><b>Erreur fréquente :</b> ${esc(q.pitfall)}</div>` : ''}<button id="nx" style="width:100%">${i + 1 < qs.length ? 'Suivant' : 'Voir mon bilan'}</button>`);
      document.getElementById('nx').onclick = () => { i++; step(); };
    };
    renderExercise(q, body, ok => finish(ok));
  };
  const end = () => {
    if (c && c.bilanDraft) { c.bilanDraft = null; save(); }
    if (!mini && !mode) c.scores.push({ date: Date.now(), score, total: qs.length, mode: 'full' });
    recordQuizResults(results);
    const pct = Math.round(score / qs.length * 100), wrong = results.filter(r => !r.ok).map(r => r.q);
    if (!mini && (!mode || mode === 'missed')) { c.lastMissed = wrong.map(qid); save(); }
    const made = !mini && wrong.length ? cardsFromMistakes(c, wrong) : 0; // les erreurs deviennent des flashcards automatiquement
    const msg = pct >= 80 ? 'Magnifique, cette leçon est bien maîtrisée !' : pct >= 50 ? 'Pas mal : quelques notions à consolider.' : 'À retravailler : on va cibler ce qui pose problème.';
    // analyse par compétence : maîtrisée / fragile / non acquise
    const groups = {};
    results.forEach(r => { const g = groups[skillOf(r.q)] || (groups[skillOf(r.q)] = { ok: 0, n: 0 }); g.n++; if (r.ok) g.ok++; });
    const rows = Object.entries(groups).map(([name, g]) => ({ name, ...g, lv: ratioLevel(g.ok / g.n) }));
    const weak = rows.filter(r => r.lv !== 'ok').sort((x, y) => (x.lv === 'ko' ? 0 : 1) - (y.lv === 'ko' ? 0 : 1));
    const plan = weak.length
      ? `<ol class="points">${weak.map(r => `<li><b>${esc(r.name)}</b> <span class="chip ${SKILL_CLASS[r.lv]}">${SKILL_LV[r.lv]}</span> — relis ce point, puis refais ses exercices.</li>`).join('')}<li>Refais un bilan avec de nouvelles questions pour vérifier.</li></ol>`
      : '<p>Tout est acquis dans ce bilan. Reviens dans quelques jours pour confirmer.</p>';
    const reco = weak.length ? `Revois ${weak.map(r => `« ${esc(r.name)} »`).join(', ')} avant de refaire un bilan.` : 'Bravo, tu peux passer au chapitre suivant.';
    const back = mini ? '#/daily' : '#/course/' + c.id;
    $app.innerHTML = `
      ${mini ? '' : backLink(back, 'Chapitre')}
      <h1>${mini ? 'Bilan' : mode === 'weak' ? 'Quiz ciblé terminé' : mode === 'missed' ? 'Questions ratées : bilan' : 'Bilan de compétence'}</h1>
      <div class="card"><div class="score">${score}/${qs.length}</div><p style="text-align:center">${msg}</p></div>
      ${!mini && !mode && pct === 100 ? '<div class="card">👑 <b>Chapitre validé !</b> Bilan réussi à 100 % : ce chapitre est considéré comme maîtrisé.</div>' : ''}
      <div class="card"><b>${reco}</b></div>
      ${made ? `<div class="card">🃏 <b>${plural(made, 'flashcard')} créée${made > 1 ? 's' : ''}</b> à partir de tes erreurs. Elles reviendront dans tes révisions.</div>` : ''}
      <h2>Mes compétences</h2>
      <div class="card">${rows.map(r => `<div class="row between" style="margin-bottom:6px"><span>${esc(r.name)} <span class="muted">${r.ok}/${r.n}</span></span><span class="chip ${SKILL_CLASS[r.lv]}">${SKILL_LV[r.lv]}</span></div>`).join('')}</div>
      <h2>Mon plan de révision</h2>
      <div class="card">${plan}</div>
      <div class="acts" id="acts">
        ${wrong.length ? `<button class="act" id="seeErr"><span class="ai">🔍</span><span class="at"><b>Revoir mes erreurs</b><small>${plural(wrong.length, 'question')} avec explication</small></span></button>` : ''}
        ${!mini && wrong.length ? `<a class="act" href="#/quiz/${c.id}/missed" data-reroute><span class="ai">↩️</span><span class="at"><b>Refaire seulement les questions ratées</b></span></a>` : ''}
        ${!mini && weakQuestions(c).length ? `<a class="act rec" href="#/train/${c.id}/target"><span class="ai">🎯</span><span class="at"><b>Exercices ciblés</b><small>Sur tes notions fragiles</small></span></a>` : ''}
        ${!mini ? `<a class="act" href="#/quiz/${c.id}" data-reroute><span class="ai">🔁</span><span class="at"><b>Nouveau bilan</b><small>Avec des questions différentes</small></span></a><a class="act" href="#/review/course/${c.id}"><span class="ai">🃏</span><span class="at"><b>Mes flashcards</b></span></a>` : ''}
      </div>
      <a class="btn ghost" href="${back}">${mini ? 'Retour' : 'Retour au chapitre'}</a>
      <div id="errs" hidden>${wrong.map(q => `<div class="card"><b>${qHtml(q)}</b><div class="muted">Réponse : ${esc(answerText(q))}</div>${q.explanation ? `<div class="explain">${esc(q.explanation)}</div>` : ''}${q.pitfall ? `<div class="explain"><b>Erreur fréquente :</b> ${esc(q.pitfall)}</div>` : ''}</div>`).join('')}</div>`;
    const se = document.getElementById('seeErr');
    if (se) se.onclick = () => { const e = document.getElementById('errs'); e.hidden = !e.hidden; if (!e.hidden && e.scrollIntoView) e.scrollIntoView({ behavior: 'smooth' }); };
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
      <label>Apparence</label>
      <select id="theme">${Object.entries(THEMES).map(([k, v]) => `<option value="${k}" ${(THEMES[s.theme] ? s.theme : DEFAULT_THEME) === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>
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
      <label class="check"><input type="checkbox" id="micro" ${s.micro ? 'checked' : ''}> Activer le micro pour les exercices de prononciation <span class="muted">(facultatif : ton navigateur écoute et transcrit ta voix, parfois via le service de reconnaissance vocale de son éditeur. Rien n'est enregistré par Révizio.)</span></label>
      <div class="row" style="margin-top:14px"><button type="submit">Enregistrer</button><button type="button" class="ghost" id="test">Tester la clé</button><span id="st"></span></div>
    </form>
    <h2>Mises à jour</h2>
    <div class="card row">
      <div class="muted" style="flex-basis:100%">Version installée : ${APP_VERSION}</div>
      <button class="ghost" id="updCheck">Rechercher une mise à jour</button>
      <button class="danger" id="updForce">Forcer la mise à jour</button>
      <div class="muted" style="flex-basis:100%">« Forcer » vide le cache de l'appli et recharge la dernière version. Tes cours, tes cartes et tes réglages sont conservés.</div>
    </div>
    <h2>Cours prêts à l'emploi <span class="muted">sans IA</span></h2>
    <div class="card"><div class="muted" style="margin-bottom:8px">Des chapitres déjà écrits (leçon, cartes, exercices) : les ajouter ne coûte aucun appel à l'IA. Ils sont aussi proposés directement dans chaque matière.</div>
      <div id="packs"><span class="muted">Chargement…</span></div>
      <label class="btn ghost" style="margin:10px 0 0">Importer un fichier de cours (.json)<input id="impPack" type="file" accept="application/json" multiple hidden></label></div>
    ${(db.settings.reports || []).length ? `<h2>Erreurs signalées <span class="muted">${db.settings.reports.length}</span></h2><div class="card row"><div class="muted" style="flex-basis:100%">Questions que tu as trouvées bizarres. Copie la liste et envoie-la pour qu'elles soient corrigées.</div><button class="ghost" id="repCopy">Copier la liste</button><button class="danger" id="repClear">Vider</button></div>` : ''}
    <h2>Sauvegarde complète</h2>
    <div class="card row">
      <button class="ghost" id="exp">Exporter mes données</button>
      <label class="btn ghost" style="margin:0">Importer<input id="imp" type="file" accept="application/json" hidden></label>
      <div class="muted" style="flex-basis:100%">Cours, cartes, paquets, statistiques, profil et emploi du temps. La clé API n'est pas incluse. À l'import, tu peux fusionner (rien n'est supprimé) ou remplacer. ${db.settings.lastBackup ? 'Dernière sauvegarde : ' + fmtDate(db.settings.lastBackup) + '. ' : ''}Pour partager seulement des cartes, utilise l'export CSV dans « Cartes ».</div>
    </div>`;
  const sel = document.getElementById('model'), cm = document.getElementById('modelCustom');
  sel.onchange = () => { cm.hidden = sel.value !== '__custom'; if (!cm.hidden) cm.focus(); };
  const read = () => {
    s.name = document.getElementById('name').value.trim(); s.apiKey = document.getElementById('key').value.trim();
    s.model = sel.value === '__custom' ? (cm.value.trim() || P.models[0][0]) : sel.value; s.bonus = document.getElementById('bonus').checked; s.micro = document.getElementById('micro').checked; save(); syncAiUi();
  };
  document.getElementById('theme').onchange = ev => { s.theme = ev.target.value; save(); applyTheme(); toast('Apparence changée ✔'); };
  document.getElementById('provider').onchange = ev => { read(); switchProvider(ev.target.value); save(); viewSettings(); };
  document.getElementById('f').onsubmit = ev => { ev.preventDefault(); read(); toast('Réglages enregistrés ✔'); };
  document.getElementById('test').onclick = async () => {
    read(); const st = document.getElementById('st'); st.innerHTML = '<span class="spinner"></span>';
    const r = await pingProvider();
    st.innerHTML = r.ok ? `<b style="color:var(--ok)">${esc(r.msg)}</b>` : `<span class="err">${esc(r.msg)}</span>`;
  };
  const rc = document.getElementById('repCopy'), rx = document.getElementById('repClear');
  if (rc) rc.onclick = async () => {
    const txt = db.settings.reports.map((r, i) => `${i + 1}. [${r.subject || '?'} / ${r.course || '?'}] ${r.q}\n   Réponse attendue : ${r.answer}`).join('\n');
    try { await navigator.clipboard.writeText(txt); toast('Liste copiée ✔'); } catch (e) { toast('Copie impossible : ' + e.message); }
  };
  if (rx) rx.onclick = () => { if (window.confirm('Vider la liste des erreurs signalées ?')) { db.settings.reports = []; save(); viewSettings(); } };
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
  packSettingsHtml().then(p => { const el = document.getElementById('packs'); if (el) { el.innerHTML = p.html; bindPackSettings(p.idx); } });
  document.getElementById('impPack').onchange = async ev => {
    const tot = { added: 0, skipped: 0, invalid: 0, cards: 0 };
    try {
      for (const f of ev.target.files) { const r = importPack(JSON.parse(await f.text())); ['added', 'skipped', 'invalid', 'cards'].forEach(k => { tot[k] += r[k]; }); }
      toast(packMsg(tot));
    } catch (e) { toast(e.message && !/JSON/.test(e.message) ? e.message : 'Fichier invalide.'); }
    ev.target.value = '';
  };
  document.getElementById('exp').onclick = exportData;
  document.getElementById('imp').onchange = async ev => {
    try {
      const d = JSON.parse(await ev.target.files[0].text());
      if (!Array.isArray(d.courses)) throw new Error();
      const merge = confirm('Fusionner cette sauvegarde avec tes données actuelles ?\n\nOK : fusionner (ajoute ce qui manque, ne supprime rien).\nAnnuler : autres choix.');
      if (!merge && !confirm('Remplacer toutes tes données actuelles (cours, cartes, paquets, statistiques, profil) par celles du fichier ?')) return;
      const r = applyBackup(d, merge ? 'merge' : 'replace');
      toast(merge ? `Fusion réussie ✔ ${r.courses} cours, ${r.cards} cartes ajoutés` + (r.skipped ? ` (${r.skipped} déjà présents)` : '') : 'Import réussi ✔'); location.hash = '#/';
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
  // Pas de gestionnaires en ligne (la CSP les interdit) : délégation d'événements.
  document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('a[data-reroute], a.skip');
    if (!t) return;
    if (t.classList.contains('skip')) { e.preventDefault(); document.getElementById('app').focus(); } else setTimeout(route, 0);
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && swReg) swReg.update().catch(() => {}); });
}
route();
applyCorrections().catch(() => 0).then(() => enrichAudio()).then(n => { if (n) toast('🎧 Exercices d\'écoute ajoutés à tes chapitres de langues'); }).catch(() => {}); // hors ligne : on réessaiera au prochain démarrage
