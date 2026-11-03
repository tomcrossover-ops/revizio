/* Révizio — PWA de révision pour le collège. Données 100 % locales (localStorage). */
'use strict';

const SUBJECTS = {
  maths: { label: 'Maths', color: '#2563eb' },
  francais: { label: 'Français', color: '#db2777' },
  langues: { label: 'Langues vivantes', color: '#0d9488' },
  histgeo: { label: 'Histoire-Géo', color: '#d97706' },
  svt: { label: 'SVT', color: '#16a34a' },
  physique: { label: 'Physique-Chimie', color: '#7c3aed' },
  techno: { label: 'Technologie', color: '#0891b2' },
  autre: { label: 'Autre', color: '#6b7280' },
};
const LEVELS = ['6e', '5e', '4e', '3e'];
const MODELS = [
  ['claude-sonnet-5-5', 'Claude Sonnet 5.5 (recommandé)'],
  ['claude-haiku-5-5', 'Claude Haiku 5.5 (plus rapide, moins cher)'],
  ['claude-opus-5-5', 'Claude Opus 5.5 (plus précis, plus cher)'],
];
const BOX_DAYS = [0, 1, 3, 7, 14, 30]; // intervalle (jours) par boîte de Leitner
const KEY = 'revizio.v1';
const DAY = 86400000;
const APP_VERSION = '1.3'; // à garder identique à VERSION dans sw.js

/* ---------- Stockage ---------- */
let db = load();
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && d.courses) return d;
  } catch (e) { /* ignore */ }
  return { settings: { name: '', apiKey: '', model: MODELS[0][0], level: '6e' }, courses: [] };
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { toast('Stockage plein : exporte tes données depuis les Réglages.'); }
}

/* ---------- Utilitaires ---------- */
const $app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const subj = k => SUBJECTS[k] || SUBJECTS.autre;
const tag = k => `<span class="tag" style="background:${subj(k).color}">${esc(subj(k).label)}</span>`;
const getCourse = id => db.courses.find(c => c.id === id);
const dueCards = (c) => c.cards.filter(x => (x.due || 0) <= Date.now());
const allDue = () => db.courses.flatMap(c => dueCards(c).map(x => ({ course: c, card: x })));
const fmtDate = t => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 3500);
}
function avgScore(c) {
  if (!c.scores.length) return null;
  const last = c.scores.slice(-3);
  return Math.round(last.reduce((s, x) => s + x.score / x.total, 0) / last.length * 100);
}

/* ---------- Appel à l'API Claude ---------- */
const SYSTEM = `Tu es un professeur bienveillant de collège (France). À partir du cours fourni, tu produis un matériel de révision fiable, fidèle au cours, en français, adapté à un élève de collège.
Réponds UNIQUEMENT par un objet JSON valide (sans texte autour, sans balises markdown) de la forme :
{
 "title": "titre court du cours",
 "summary": "résumé clair en 3 phrases maximum",
 "keyPoints": ["notion ou définition essentielle", "..."],
 "cards": [{"q": "question courte", "a": "réponse courte"}],
 "questions": [
   {"type": "qcm", "q": "...", "choices": ["A","B","C","D"], "answer": 0, "explanation": "..."},
   {"type": "vf", "q": "affirmation", "answer": true, "explanation": "..."},
   {"type": "short", "q": "...", "answer": "réponse attendue", "explanation": "..."}
 ]
}
Règles de concision : 5 à 8 points clés de 12 mots maximum ; 10 à 14 cartes mémoire PUNCHY (question de 10 mots maximum, réponse de 8 mots maximum : un mot, une formule, une règle en une ligne, jamais de phrase explicative) ; explications de quiz en une phrase courte. Questions : 10 à 14 mélangeant qcm (4 choix, "answer" = index 0-3), vf et short. Ne pose que des questions dont la réponse se trouve dans le cours. Si le cours est illisible ou vide, renvoie {"error": "explication"}.`;

const SYSTEM_GEN = `Tu es un professeur de collège expérimenté (France). Un élève te demande de préparer un cours sur un chapitre du programme officiel de l'Éducation nationale pour sa classe (6e : cycle 3 ; 5e, 4e, 3e : cycle 4).
Écris une leçon COURTE et efficace, comme la fiche de révision d'un très bon élève : va droit à l'essentiel, sans introduction, sans phrases de transition, sans répétition. Une idée par ligne, phrases de 15 mots maximum, vocabulaire simple adapté à l'âge, exemples concrets. Reste fidèle aux notions réellement au programme de cette classe ; n'invente rien. Si la demande est trop avancée ou trop simple pour cette classe, traite-la au niveau de la classe et dis-le dans "summary".
Réponds UNIQUEMENT par un objet JSON valide (sans texte autour, sans balises markdown) de la forme :
{
 "title": "titre du chapitre",
 "summary": "résumé en 2 phrases",
 "lesson": [{"title": "titre de la partie", "content": "- idée courte\\n- idée courte", "examples": ["exemple très court", "..."]}],
 "keyPoints": ["règle ou définition à retenir", "..."],
 "cards": [{"q": "question courte", "a": "réponse courte"}],
 "questions": [
   {"type": "qcm", "q": "...", "choices": ["A","B","C","D"], "answer": 0, "explanation": "..."},
   {"type": "vf", "q": "affirmation", "answer": true, "explanation": "..."},
   {"type": "short", "q": "...", "answer": "réponse attendue", "explanation": "..."}
 ]
}
Règles de concision STRICTES :
- summary : 2 phrases maximum.
- lesson : 3 à 5 parties. Chaque "content" fait 60 mots maximum, écrit en lignes courtes qui commencent par "- " (une idée par ligne), jamais de long paragraphe. 1 à 3 "examples" très courts par partie.
- keyPoints : 5 à 7 points de 12 mots maximum, à apprendre par cœur.
- cards : 10 à 14 cartes PUNCHY. "q" = 10 mots maximum. "a" = 8 mots maximum : un mot, une formule, une forme conjuguée ou une règle en une ligne, jamais de phrase explicative. Une seule notion par carte. Varie les formats (définition, exemple à compléter, forme à donner, vrai ou faux en deux mots).
- questions : 12 à 16 variées (qcm avec 4 choix et "answer" = index 0-3, vf, short), énoncé de 20 mots maximum, "explanation" d'une seule phrase courte.
Les exercices portent sur ce qui est expliqué dans la leçon et n'ont qu'une seule bonne réponse, vérifiable sans ambiguïté. Pas de LaTeX : écris les formules en texte simple. Si la demande n'a aucun rapport avec la matière ou est incompréhensible, renvoie {"error": "explication courte"}.`;

async function callClaude(content, maxTokens = 6000, system = SYSTEM) {
  const { apiKey, model } = db.settings;
  if (!apiKey) throw new Error('Ajoute ta clé API dans les Réglages.');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] }),
  });
  if (!res.ok) {
    let m = res.status + '';
    try { m = (await res.json()).error?.message || m; } catch (e) { /* ignore */ }
    if (res.status === 401) m = 'Clé API invalide.';
    throw new Error(m);
  }
  const data = await res.json();
  if (data.stop_reason === 'max_tokens') throw new Error('La réponse était trop longue et a été coupée. Réessaie, ou précise un chapitre plus petit.');
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  return parseJSON(text);
}
function parseJSON(text) {
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s < 0 || e < 0) throw new Error('Réponse inattendue de l\'IA, réessaie.');
  const obj = JSON.parse(text.slice(s, e + 1));
  if (obj.error) throw new Error(obj.error);
  return obj;
}
function normQuestions(list) {
  return (list || []).map(q => {
    if (!q || !q.q) return null;
    if (q.type === 'qcm' && Array.isArray(q.choices) && q.choices.length >= 2) {
      const idx = Number.isInteger(q.answer) ? q.answer : 0;
      return { id: uid(), type: 'qcm', q: q.q, choices: q.choices.map(String), answer: Math.min(Math.max(idx, 0), q.choices.length - 1), explanation: q.explanation || '' };
    }
    if (q.type === 'vf') return { id: uid(), type: 'qcm', q: q.q, choices: ['Vrai', 'Faux'], answer: q.answer === true || q.answer === 'true' ? 0 : 1, explanation: q.explanation || '' };
    if (q.type === 'short' && q.answer) return { id: uid(), type: 'short', q: q.q, answer: String(q.answer), explanation: q.explanation || '' };
    return null;
  }).filter(Boolean);
}
const normCards = list => (list || []).filter(c => c && c.q && c.a).map(c => ({ id: uid(), q: String(c.q), a: String(c.a), box: 0, due: 0 }));
const normLesson = list => (list || []).filter(s => s && s.title && s.content).map(s => ({ title: String(s.title), content: String(s.content), examples: Array.isArray(s.examples) ? s.examples.map(String) : [] }));

/* Fichiers : images réduites en JPEG, PDF en base64 */
function fileToB64(file) {
  return new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = ko; r.readAsDataURL(file); });
}
async function imageToJpegB64(file, max = 1600) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.85).split(',')[1];
  } finally { URL.revokeObjectURL(url); }
}
async function buildContent(files, text, subjectKey, title, extra = '') {
  const content = [];
  for (const f of files) {
    if (f.type === 'application/pdf') content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: await fileToB64(f) } });
    else if (f.type.startsWith('image/')) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: await imageToJpegB64(f) } });
  }
  const head = `Matière : ${subj(subjectKey).label}.${title ? ` Thème : ${title}.` : ''} ${extra}`;
  content.push({ type: 'text', text: head + (text ? `\n\nContenu du cours :\n${text}` : '\n\nLe cours est dans les fichiers ci-dessus.') });
  return content;
}

/* ---------- Révision espacée ---------- */
function gradeCard(card, knew) {
  card.box = knew ? Math.min(card.box + 1, BOX_DAYS.length - 1) : 0;
  card.due = Date.now() + BOX_DAYS[card.box] * DAY;
  if (!knew) card.due = Date.now() + 60 * 1000; // revient vite dans la session
}

/* ---------- Routeur ---------- */
const routes = [
  [/^\/?$/, viewHome],
  [/^\/import$/, viewImport],
  [/^\/new$/, viewGenerate],
  [/^\/course\/(\w+)$/, viewCourse],
  [/^\/cards(?:\/(\w+))?$/, viewCards],
  [/^\/quiz\/(\w+)$/, viewQuiz],
  [/^\/settings$/, viewSettings],
];
function route() {
  const path = location.hash.replace(/^#/, '') || '/';
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('active',
    (a.dataset.nav === 'home' && (path === '/' || path.startsWith('/course') || path.startsWith('/cards') || path.startsWith('/quiz'))) ||
    (a.dataset.nav === 'import' && (path === '/import' || path === '/new')) || (a.dataset.nav === 'settings' && path === '/settings')));
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) { window.scrollTo(0, 0); return fn(...m.slice(1)); }
  }
  location.hash = '#/';
}
window.addEventListener('hashchange', route);

/* ---------- Vue : accueil ---------- */
function viewHome() {
  const due = allDue().length;
  const hello = db.settings.name ? `Salut ${esc(db.settings.name)} 👋` : 'Bienvenue sur Révizio 👋';
  const noKey = !db.settings.apiKey;
  $app.innerHTML = `
    <h1>${hello}</h1>
    ${noKey ? `<div class="card"><b>Première étape :</b> ajoute ta clé API dans les <a href="#/settings">Réglages</a> pour que Révizio puisse créer des fiches et des exercices à partir de tes cours.</div>` : ''}
    <div class="grid">
      <div class="card stat"><b>${db.courses.length}</b><span class="muted">cours</span></div>
      <div class="card stat"><b>${due}</b><span class="muted">cartes à revoir</span></div>
      <div class="card stat"><b>${db.courses.reduce((n, c) => n + c.scores.length, 0)}</b><span class="muted">quiz faits</span></div>
    </div>
    ${due ? `<a class="btn" href="#/cards" style="display:block;margin-bottom:12px">Réviser les ${due} cartes du jour</a>` : ''}
    <div class="row between"><h2>Mes cours</h2><a class="btn" href="#/new">+ Nouveau cours</a></div>
    ${db.courses.length ? db.courses.slice().sort((a, b) => b.createdAt - a.createdAt).map(courseCard).join('') :
      `<div class="card muted">Aucun cours pour l'instant. Choisis ta classe, une matière et un chapitre, et Révizio prépare la leçon, les cartes mémoire et le quiz.</div>`}
    ${progressBySubject()}
  `;
}
function courseCard(c) {
  const sc = avgScore(c), d = dueCards(c).length;
  return `<a class="card course" href="#/course/${c.id}">
    <div class="row between"><b>${esc(c.title)}</b>${tag(c.subject)}</div>
    <div class="muted">${c.level ? esc(c.level) + ' · ' : ''}${c.cards.length} cartes · ${c.questions.length} questions${d ? ` · <b>${d} à revoir</b>` : ''}</div>
    ${sc !== null ? `<div class="bar" style="margin-top:8px"><i style="width:${sc}%"></i></div><div class="muted">Moyenne récente : ${sc} %</div>` : ''}
  </a>`;
}
function progressBySubject() {
  const rows = Object.keys(SUBJECTS).map(k => {
    const cs = db.courses.filter(c => c.subject === k && c.scores.length);
    if (!cs.length) return '';
    const avg = Math.round(cs.reduce((s, c) => s + avgScore(c), 0) / cs.length);
    return `<div style="margin-bottom:10px"><div class="row between">${tag(k)}<b>${avg} %</b></div><div class="bar"><i style="width:${avg}%;background:${subj(k).color}"></i></div></div>`;
  }).join('');
  return rows ? `<h2>Progression par matière</h2><div class="card">${rows}</div>` : '';
}

/* ---------- Vue : cours demandé par classe / matière / chapitre ---------- */
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
      <select id="subject">${Object.entries(SUBJECTS).filter(([k]) => k !== 'autre').map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select>
      <label>Chapitre ou notion</label>
      <input id="chapter" placeholder="Ex. Conjugaison : le passé simple" autocomplete="off">
      <label>Précisions (facultatif)</label>
      <input id="extra" placeholder="Ex. surtout les verbes du 1er groupe" autocomplete="off">
      <div class="row" style="margin-top:14px"><button id="go" type="submit">Préparer mon cours</button><span id="st"></span></div>
    </form>`;
  document.getElementById('f').onsubmit = async ev => {
    ev.preventDefault();
    const level = document.getElementById('level').value, subject = document.getElementById('subject').value;
    const chapter = document.getElementById('chapter').value.trim(), extra = document.getElementById('extra').value.trim();
    if (chapter.length < 3) return toast('Indique le chapitre à réviser.');
    db.settings.level = level; save();
    const btn = document.getElementById('go'), st = document.getElementById('st');
    btn.disabled = true; st.innerHTML = '<span class="spinner"></span> Préparation du cours… (≈ 30-60 s)';
    try {
      const text = `Classe : ${level}\nMatière : ${subj(subject).label}\nChapitre demandé : ${chapter}${extra ? `\nPrécisions : ${extra}` : ''}`;
      const r = await callClaude([{ type: 'text', text }], 8000, SYSTEM_GEN);
      const course = {
        id: uid(), subject, level, origin: 'generated', title: r.title || chapter, createdAt: Date.now(),
        summary: r.summary || '', lesson: normLesson(r.lesson), keyPoints: r.keyPoints || [],
        cards: normCards(r.cards), questions: normQuestions(r.questions), scores: [],
      };
      if (!course.cards.length && !course.questions.length) throw new Error('Rien de généré, reformule le chapitre et réessaie.');
      db.courses.push(course); save();
      toast('Cours prêt ✔'); location.hash = '#/course/' + course.id;
    } catch (e) {
      st.innerHTML = `<span class="err">${esc(e.message)}</span>`; btn.disabled = false;
    }
  };
}

/* ---------- Vue : import d'un cours ---------- */
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
        summary: r.summary || '', keyPoints: r.keyPoints || [], cards: normCards(r.cards), questions: normQuestions(r.questions), scores: [],
      };
      if (!course.cards.length && !course.questions.length) throw new Error('Rien de généré, essaie avec une photo plus nette.');
      db.courses.push(course); save();
      toast('Cours ajouté ✔'); location.hash = '#/course/' + course.id;
    } catch (e) {
      st.innerHTML = `<span class="err">${esc(e.message)}</span>`; btn.disabled = false;
    }
  };
}

/* ---------- Vue : fiche d'un cours ---------- */
function viewCourse(id) {
  const c = getCourse(id);
  if (!c) { location.hash = '#/'; return; }
  const d = dueCards(c).length;
  $app.innerHTML = `
    <div class="row between"><h1>${esc(c.title)}</h1>${tag(c.subject)}</div>
    <div class="row" style="margin-bottom:12px">
      <a class="btn" href="#/cards/${c.id}">Cartes mémoire${d ? ` (${d})` : ''}</a>
      <a class="btn" href="#/quiz/${c.id}">Quiz</a>
    </div>
    <div class="card"><h2 style="margin-top:0">Résumé</h2><p>${esc(c.summary)}</p></div>
    ${lessonHtml(c)}
    <div class="card"><h2 style="margin-top:0">À retenir</h2><ul class="points">${c.keyPoints.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>
    ${c.scores.length ? `<div class="card"><h2 style="margin-top:0">Mes quiz</h2>${c.scores.slice(-6).reverse().map(s => `<div class="row between"><span class="muted">${fmtDate(s.date)}</span><b>${s.score}/${s.total}</b></div>`).join('')}</div>` : ''}
    <div class="row" style="margin-top:8px">
      <button class="ghost" id="more">Générer d'autres exercices</button>
      <button class="danger" id="del">Supprimer ce cours</button>
      <span id="st"></span>
    </div>`;
  document.getElementById('del').onclick = () => {
    if (confirm('Supprimer ce cours et ses exercices ?')) { db.courses = db.courses.filter(x => x.id !== c.id); save(); location.hash = '#/'; }
  };
  document.getElementById('more').onclick = async () => {
    const st = document.getElementById('st'), btn = document.getElementById('more');
    btn.disabled = true; st.innerHTML = '<span class="spinner"></span> Génération…';
    try {
      const known = c.questions.map(q => q.q).join(' | ');
      const text = `Résumé : ${c.summary}\nPoints clés :\n- ${c.keyPoints.join('\n- ')}`;
      const r = await callClaude(await buildContent([], text, c.subject, c.title, `Génère de NOUVELLES cartes et questions, différentes de celles-ci : ${known.slice(0, 2500)}`));
      c.cards.push(...normCards(r.cards)); c.questions.push(...normQuestions(r.questions)); save();
      toast('Nouveaux exercices ajoutés ✔'); viewCourse(id);
    } catch (e) { st.innerHTML = `<span class="err">${esc(e.message)}</span>`; btn.disabled = false; }
  };
}

/* ---------- Vue : cartes mémoire ---------- */
function viewCards(courseId) {
  let queue = courseId
    ? dueCards(getCourse(courseId) || { cards: [] }).map(card => ({ course: getCourse(courseId), card }))
    : allDue();
  queue = shuffle(queue);
  const total = queue.length; let done = 0, knewN = 0;
  if (!total) {
    $app.innerHTML = `<h1>Cartes mémoire</h1><div class="card">🎉 Rien à revoir pour l'instant. Reviens demain !</div><a class="btn ghost" href="#/">Retour</a>`;
    return;
  }
  const show = () => {
    if (!queue.length) {
      $app.innerHTML = `<h1>Séance terminée 🎉</h1><div class="card"><div class="score">${knewN}/${total}</div><p class="muted" style="text-align:center">cartes sues du premier coup</p></div><a class="btn" href="#/">Accueil</a>`;
      return;
    }
    const { course, card } = queue[0];
    $app.innerHTML = `
      <div class="row between"><span class="muted">${done + 1} / ${total}</span>${tag(course.subject)}</div>
      <div class="bar" style="margin:8px 0"><i style="width:${done / total * 100}%"></i></div>
      <div class="card flash" id="fl"><div><div>${esc(card.q)}</div><div class="muted" style="margin-top:14px">Touche pour voir la réponse</div></div></div>
      <div id="act"></div>`;
    document.getElementById('fl').onclick = () => {
      document.getElementById('fl').innerHTML = `<div><div class="muted">${esc(card.q)}</div><div class="a" style="margin-top:10px">${esc(card.a)}</div></div>`;
      document.getElementById('act').innerHTML = `<div class="row"><button class="ko" id="no" style="flex:1">À revoir</button><button class="ok" id="yes" style="flex:1">Je savais</button></div>`;
      const next = knew => {
        gradeCard(card, knew); save(); queue.shift();
        if (knew) { done++; if (!card._retry) knewN++; } else { card._retry = true; queue.push({ course, card }); }
        show();
      };
      document.getElementById('yes').onclick = () => next(true);
      document.getElementById('no').onclick = () => next(false);
    };
  };
  show();
}

/* ---------- Vue : quiz ---------- */
function viewQuiz(id) {
  const c = getCourse(id);
  if (!c || !c.questions.length) { toast('Pas de questions pour ce cours.'); location.hash = '#/'; return; }
  const qs = shuffle(c.questions).slice(0, 10);
  let i = 0, score = 0; const wrong = [];
  const step = () => {
    if (i >= qs.length) return end();
    const q = qs[i];
    $app.innerHTML = `
      <div class="row between"><span class="muted">Question ${i + 1} / ${qs.length}</span>${tag(c.subject)}</div>
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
    c.scores.push({ date: Date.now(), score, total: qs.length }); save();
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

/* ---------- Vue : réglages ---------- */
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
      <div class="row" style="margin-top:14px"><button type="submit">Enregistrer</button><button type="button" class="ghost" id="test">Tester la clé</button><span id="st"></span></div>
    </form>
    <h2>Mises à jour</h2>
    <div class="card row">
      <div class="muted" style="flex-basis:100%">Version installée : ${APP_VERSION}</div>
      <button class="ghost" id="updCheck">Rechercher une mise à jour</button>
      <button class="danger" id="updForce">Forcer la mise à jour</button>
      <div class="muted" style="flex-basis:100%">« Forcer » vide le cache de l'appli et recharge la dernière version. Tes cours et tes réglages sont conservés.</div>
    </div>
    <h2>Sauvegarde</h2>
    <div class="card row">
      <button class="ghost" id="exp">Exporter mes données</button>
      <label class="btn ghost" style="margin:0">Importer<input id="imp" type="file" accept="application/json" hidden></label>
      <div class="muted" style="flex-basis:100%">La clé API n'est pas incluse dans l'export.</div>
    </div>`;
  const read = () => { s.name = document.getElementById('name').value.trim(); s.apiKey = document.getElementById('key').value.trim(); s.model = document.getElementById('model').value; save(); };
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
    if (!confirm('Recharger la dernière version de Révizio ? Tes cours et tes réglages sont conservés.')) return;
    try {
      if ('serviceWorker' in navigator) await Promise.all((await navigator.serviceWorker.getRegistrations()).map(r => r.unregister()));
      if (window.caches) await Promise.all((await caches.keys()).map(k => caches.delete(k)));
    } catch (e) { /* on recharge quand même */ }
    location.reload();
  };
  document.getElementById('exp').onclick = () => {
    const blob = new Blob([JSON.stringify({ courses: db.courses, exportedAt: Date.now() }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `revizio-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };
  document.getElementById('imp').onchange = async ev => {
    try {
      const d = JSON.parse(await ev.target.files[0].text());
      if (!Array.isArray(d.courses)) throw new Error();
      if (!confirm('Remplacer les cours actuels par ceux du fichier ?')) return;
      db.courses = d.courses; save(); toast('Import réussi ✔'); location.hash = '#/';
    } catch (e) { toast('Fichier invalide.'); }
  };
}

/* ---------- Démarrage ---------- */
/* Mises à jour : la nouvelle version est téléchargée en arrière-plan, puis activée quand l'utilisateur clique. */
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
