/* Révizio — noyau : données, utilitaires, révision espacée, CSV, API Claude. */
'use strict';

const APP_VERSION = '2.4'; // à garder identique à VERSION dans sw.js

const SUBJECTS = {
  maths: { label: 'Maths', color: '#2563eb' },
  francais: { label: 'Français', color: '#db2777' },
  langues: { label: 'Anglais', color: '#0d9488' },
  histgeo: { label: 'Histoire-Géo', color: '#d97706' },
  svt: { label: 'SVT', color: '#16a34a' },
  physique: { label: 'Physique-Chimie', color: '#7c3aed' },
  techno: { label: 'Technologie', color: '#0891b2' },
  autre: { label: 'Autre', color: '#6b7280' },
};
const LEVELS = ['CM1', 'CM2', '6e', '5e', '4e', '3e'];
const MODELS = [
  ['claude-sonnet-5-5', 'Claude Sonnet 5.5 (recommandé)'],
  ['claude-haiku-5-5', 'Claude Haiku 5.5 (plus rapide, moins cher)'],
  ['claude-opus-5-5', 'Claude Opus 5.5 (plus précis, plus cher)'],
];
const TAGS = { definition: 'Définition', formule: 'Formule', date: 'Date', vocabulaire: 'Vocabulaire', methode: 'Méthode', erreur: 'Erreur fréquente', comprehension: 'Compréhension' };
const MASTERY = { revoir: 'À revoir', cours: 'En cours', maitrisee: 'Maîtrisée' };
const TEMPLATES = {
  qr: { label: 'Question / Réponse', front: 'Quel gaz la photosynthèse libère-t-elle ?', back: 'Du dioxygène.', hint: 'Écris une vraie question, qui se termine par « ? ».' },
  def: { label: 'Mot / Définition', front: 'Photosynthèse', back: 'La plante fabrique sa matière avec la lumière.', hint: 'Recto : le mot à définir. Verso : sa définition courte.' },
  cloze: { label: 'Phrase à trous', front: 'La photosynthèse libère du ___.', back: 'dioxygène', hint: 'Mets ___ à la place du mot à retenir, et écris ce mot au verso.' },
  exo: { label: 'Exercice / Correction', front: 'Calcule 3/4 + 1/4', back: '1 (car 4/4 = 1)', hint: 'Recto : un mini-exercice. Verso : la correction courte.' },
  img: { label: 'Image / Légende', front: 'Que représente ce schéma ?', back: 'Une cellule végétale.', hint: 'Ajoute une image, puis écris sa légende au verso.' },
};
const MAX_BACK = 200;
const KEY = 'revizio.v1'; // même clé qu'avant : les anciennes données sont migrées, pas perdues
const DAY = 86400000;

/* ---------- Utilitaires ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clip = (s, n) => { s = String(s ?? '').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
const subj = k => SUBJECTS[k] || SUBJECTS.autre;
const subjChip = k => `<span class="tag" style="background:${subj(k).color}">${esc(subj(k).label)}</span>`;
const tagChip = k => `<span class="chip">${esc(TAGS[k] || TAGS.definition)}</span>`;
const normText = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const safeImg = s => (typeof s === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s)) ? s : '';

/* ---------- Dates ---------- */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
function addDays(s, n) { const t = new Date(s + 'T12:00:00'); t.setDate(t.getDate() + n); return ymd(t); }
const fmtDate = t => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

/* ---------- Stockage + migration (cartes de l'ancienne version rangées dans les cours) ---------- */
const freshState = () => ({ step: 0, due: today(), lapses: 0 });
function migrate(d) {
  d = d && typeof d === 'object' ? d : {};
  d.settings = Object.assign({ name: '', apiKey: '', model: MODELS[0][0], level: '6e', bonus: true }, d.settings || {});
  d.courses = Array.isArray(d.courses) ? d.courses : [];
  d.cards = Array.isArray(d.cards) ? d.cards : [];
  d.decks = Array.isArray(d.decks) ? d.decks : [];
  d.activity = d.activity && Array.isArray(d.activity.days) ? d.activity : { days: [] };
  d.courses.forEach(c => {
    c.scores = c.scores || []; c.questions = c.questions || []; c.keyPoints = c.keyPoints || [];
    if (Array.isArray(c.cards)) {
      c.cards.forEach(x => {
        if (!x || !x.q || !x.a) return;
        const step = !x.box ? 0 : x.box >= 4 ? 3 : Math.min(x.box, 2);
        d.cards.push({
          id: x.id || uid(), subject: c.subject, chapter: c.title || '', courseId: c.id, tag: 'definition',
          front: String(x.q), back: clip(x.a, MAX_BACK), explain: '', reversible: false, image: null, createdAt: c.createdAt || Date.now(),
          fwd: { step, due: x.due && x.due > Date.now() ? ymd(new Date(x.due)) : today(), lapses: 0 }, rev: null,
        });
      });
      delete c.cards;
    }
  });
  return d;
}
let db = load();
function load() {
  try { return migrate(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return migrate({}); }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { toast('Stockage plein : exporte tes données depuis les Réglages.'); }
}
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 3500);
}
const getCourse = id => db.courses.find(c => c.id === id);
const getCard = id => db.cards.find(c => c.id === id);
const cardsOf = courseId => db.cards.filter(c => c.courseId === courseId);

/* ---------- Cartes ---------- */
function newCard(o) {
  const tag = TAGS[o.tag] ? o.tag : 'definition';
  const c = {
    id: uid(), subject: SUBJECTS[o.subject] ? o.subject : 'autre', chapter: String(o.chapter || '').trim(), courseId: o.courseId || null,
    tag, front: String(o.front || '').trim(), back: String(o.back || '').trim(), explain: String(o.explain || '').trim(),
    reversible: !!o.reversible, image: safeImg(o.image) || null, createdAt: Date.now(), fwd: freshState(), rev: null,
  };
  if (c.reversible) c.rev = freshState();
  return c;
}
function validateCard(o, template = 'free') {
  const front = String(o.front || '').trim(), back = String(o.back || '').trim();
  if (template === 'img') { if (!o.image) return 'Ajoute une image.'; }
  else {
    const min = template === 'def' ? 2 : template === 'free' ? 3 : 4;
    if (front.length < min) return 'Écris un recto clair : une vraie question ou un mot à définir.';
  }
  if (template === 'qr' && !/\?\s*$/.test(front)) return 'Formule une vraie question qui se termine par « ? ».';
  if (template === 'cloze' && !/_{3,}|…/.test(front)) return 'Mets ___ à la place du mot à retenir.';
  if (!back) return 'Ajoute la réponse au verso.';
  if (back.length > MAX_BACK) return `Réponse trop longue (${back.length}/${MAX_BACK} caractères). Raccourcis-la ou découpe la carte.`;
  return '';
}
function guessTemplate(c) {
  if (c.image) return 'img';
  if (/_{3,}|…/.test(c.front)) return 'cloze';
  if (/\?\s*$/.test(c.front)) return 'qr';
  return 'def';
}
function normCards(list, ctx) {
  return (list || []).map(c => {
    if (!c || !c.q || !c.a) return null;
    return newCard({ subject: ctx.subject, chapter: ctx.chapter, courseId: ctx.courseId, tag: c.tag, front: clip(c.q, 200), back: clip(c.a, MAX_BACK), explain: clip(c.explain || '', 220), reversible: !!c.reversible });
  }).filter(Boolean);
}
function removeCards(ids) {
  const set = new Set(ids);
  db.cards = db.cards.filter(c => !set.has(c.id));
  db.decks.forEach(d => { d.cardIds = d.cardIds.filter(i => !set.has(i)); });
}

/* ---------- Répétition espacée ----------
   « Je ne sais pas » : le jour même (étape 0) · « Presque » : 2 jours (l'étape ne progresse pas)
   « Je sais » : 7 jours, puis 21 jours, puis 2 mois (étape 3 = maîtrisée).
   Raté après avoir été acquis : retour au début du cycle (étape 0). */
const YES_DAYS = [7, 21, 60, 60];
const dirsOf = c => (c.reversible ? ['fwd', 'rev'] : ['fwd']);
function stateOf(c, dir) { if (!c[dir]) c[dir] = freshState(); return c[dir]; }
function nextInterval(s, rating) {
  if (rating === 'no') return { step: 0, days: 0 };
  if (rating === 'almost') return { step: Math.min(s.step, 2), days: 2 };
  return { step: Math.min(s.step + 1, 3), days: YES_DAYS[Math.min(s.step, 3)] };
}
function previewLabel(s, rating) {
  const n = nextInterval(s, rating).days;
  return n === 0 ? "aujourd'hui" : n < 30 ? `dans ${n} jour${n > 1 ? 's' : ''}` : `dans ${Math.round(n / 30)} mois`;
}
function markActivity() {
  const t = today();
  if (!db.activity.days.includes(t)) db.activity.days.push(t);
  db.activity.days = db.activity.days.slice(-400);
}
function gradeItem(card, dir, rating) {
  const s = stateOf(card, dir), n = nextInterval(s, rating);
  if (rating === 'no') s.lapses = (s.lapses || 0) + 1;
  s.step = n.step; s.due = addDays(today(), n.days); s.last = today();
  markActivity();
}
function dueItems(filter = () => true) {
  const t = today();
  return db.cards.filter(filter).flatMap(c => dirsOf(c).filter(d => stateOf(c, d).due <= t).map(dir => ({ card: c, dir })));
}
function cardLevel(c) {
  const m = Math.min(...dirsOf(c).map(d => stateOf(c, d).step));
  return m === 0 ? 'revoir' : m >= 3 ? 'maitrisee' : 'cours';
}
function streak() {
  const days = new Set(db.activity.days); let d = today(), n = 0;
  if (!days.has(d)) d = addDays(d, -1);
  while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}
function avgScore(c) {
  if (!c.scores.length) return null;
  const last = c.scores.slice(-3);
  return Math.round(last.reduce((s, x) => s + x.score / x.total, 0) / last.length * 100);
}

/* ---------- CSV (séparateur « ; », ouvrable dans Excel) ---------- */
const CSV_COLS = ['matiere', 'chapitre', 'etiquette', 'recto', 'verso', 'explication', 'inversable'];
function toCSV(cards) {
  const cell = s => { s = String(s ?? ''); return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rows = [CSV_COLS.join(';')];
  cards.filter(c => c.front).forEach(c => rows.push([subj(c.subject).label, c.chapter, TAGS[c.tag], c.front, c.back, c.explain, c.reversible ? 'oui' : 'non'].map(cell).join(';')));
  return '﻿' + rows.join('\r\n');
}
function parseCSV(text) {
  text = String(text).replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const delim = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; rows.push(row); row = []; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}
function importCSV(text) {
  const rows = parseCSV(text); let cols = CSV_COLS, start = 0, added = 0, skipped = 0;
  if (rows.length && rows[0].map(h => normText(h).replace(/\s/g, '')).includes('recto')) { cols = rows[0].map(h => normText(h).replace(/\s/g, '')); start = 1; }
  const subjMap = {}; Object.entries(SUBJECTS).forEach(([k, v]) => { subjMap[normText(k)] = k; subjMap[normText(v.label)] = k; });
  subjMap[normText('Langues vivantes')] = 'langues'; // anciens exports CSV
  const tagMap = {}; Object.entries(TAGS).forEach(([k, v]) => { tagMap[normText(k)] = k; tagMap[normText(v)] = k; });
  for (let r = start; r < rows.length; r++) {
    const o = {}; cols.forEach((k, i) => { o[k] = (rows[r][i] || '').trim(); });
    const card = { front: o.recto, back: o.verso };
    if (validateCard(card, 'free')) { skipped++; continue; }
    db.cards.push(newCard({
      subject: subjMap[normText(o.matiere)] || 'autre', chapter: o.chapitre, tag: tagMap[normText(o.etiquette)] || 'definition',
      front: o.recto, back: o.verso, explain: o.explication, reversible: /^(oui|1|true|vrai|x|yes)$/i.test(o.inversable || ''),
    }));
    added++;
  }
  return { added, skipped };
}

/* ---------- Appel à l'API Claude ---------- */
const CARD_RULES = `Chaque carte = UNE seule idée. Format : {"q": "recto : question claire, 10 mots maximum", "a": "verso : réponse courte (8 mots maximum pour une carte de mémoire, 25 mots maximum pour une carte de compréhension, jamais plus de 200 caractères)", "explain": "une phrase d'explication de 150 caractères maximum", "tag": "definition | formule | date | vocabulaire | methode | erreur | comprehension", "reversible": true ou false}.
"reversible" = true seulement quand la réponse est une notion identifiable à retrouver depuis la question (terme ↔ définition, mot ↔ traduction, date ↔ événement, formule ↔ nom). Environ un quart des cartes sont des cartes de COMPRÉHENSION (tag "comprehension") : « Pourquoi … ? », « À quoi sert … ? », « Donne un exemple de … ». Les autres cartes sont de la mémoire (définitions, formules, dates, vocabulaire, méthodes). Pas de phrases de remplissage.`;

const SYSTEM = `Tu es un professeur bienveillant de collège (France). À partir du cours fourni, tu produis un matériel de révision fiable, fidèle au cours, en français, adapté à un élève de collège.
Réponds UNIQUEMENT par un objet JSON valide (sans texte autour, sans balises markdown) de la forme :
{
 "title": "titre court du cours",
 "summary": "résumé clair en 3 phrases maximum",
 "keyPoints": ["notion ou définition essentielle", "..."],
 "cards": [{"q": "...", "a": "...", "explain": "...", "tag": "definition", "reversible": false}],
 "questions": [
   {"type": "qcm", "q": "...", "choices": ["A","B","C","D"], "answer": 0, "explanation": "..."},
   {"type": "vf", "q": "affirmation", "answer": true, "explanation": "..."},
   {"type": "short", "q": "...", "answer": "réponse attendue", "explanation": "..."}
 ]
}
Règles de concision : 5 à 8 points clés de 12 mots maximum ; 10 à 14 cartes ; explications de quiz en une phrase courte. Questions : 10 à 14 mélangeant qcm (4 choix, "answer" = index 0-3), vf et short. Ne pose que des questions dont la réponse se trouve dans le cours.
${CARD_RULES}
Si le cours est illisible ou vide, renvoie {"error": "explication"}.`;

const SYSTEM_GEN = `Tu es un professeur expérimenté de primaire et de collège (France). Un élève te demande de préparer un cours sur un chapitre du programme officiel de l'Éducation nationale pour sa classe (CM1, CM2, 6e : cycle 3 ; 5e, 4e, 3e : cycle 4). Pour CM1 et CM2, utilise un vocabulaire encore plus simple, des phrases très courtes et des exemples du quotidien d'un enfant de 9 à 11 ans.
Écris une leçon COURTE et efficace, comme la fiche de révision d'un très bon élève : va droit à l'essentiel, sans introduction, sans phrases de transition, sans répétition. Une idée par ligne, phrases de 15 mots maximum, vocabulaire simple adapté à l'âge, exemples concrets. Reste fidèle aux notions réellement au programme de cette classe ; n'invente rien. Si des "Notions au programme" sont indiquées, la leçon, les cartes et les questions couvrent exactement ce périmètre, sans en sortir. Si la demande est trop avancée ou trop simple pour cette classe, traite-la au niveau de la classe et dis-le dans "summary".
Réponds UNIQUEMENT par un objet JSON valide (sans texte autour, sans balises markdown) de la forme :
{
 "title": "titre du chapitre",
 "summary": "résumé en 2 phrases",
 "lesson": [{"title": "titre de la partie", "content": "- idée courte\\n- idée courte", "examples": ["exemple très court", "..."]}],
 "keyPoints": ["règle ou définition à retenir", "..."],
 "cards": [{"q": "...", "a": "...", "explain": "...", "tag": "definition", "reversible": false}],
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
- cards : 10 à 14 cartes. ${CARD_RULES}
- questions : 12 à 16 variées (qcm avec 4 choix et "answer" = index 0-3, vf, short), énoncé de 20 mots maximum, "explanation" d'une seule phrase courte.
Les exercices portent sur ce qui est expliqué dans la leçon et n'ont qu'une seule bonne réponse, vérifiable sans ambiguïté. Pas de LaTeX : écris les formules en texte simple. Si la demande n'a aucun rapport avec la matière ou est incompréhensible, renvoie {"error": "explication courte"}.`;

const SYSTEM_SPLIT = `Tu aides un collégien à découper une carte de révision trop longue en plusieurs cartes courtes. Chaque carte porte UNE seule idée.
Réponds UNIQUEMENT par un objet JSON valide : {"cards": [{"q": "question claire terminée par ?", "a": "réponse de 200 caractères maximum"}]}
Règles : 2 à 6 cartes, fidèles au texte fourni (n'ajoute aucune information), questions précises et indépendantes les unes des autres. Si le texte ne se découpe pas, renvoie {"error": "explication courte"}.`;

const SYSTEM_UNDERSTAND = `Tu es un professeur de collège bienveillant (France). Un élève a expliqué avec ses propres mots une notion de cours. Tu évalues sa compréhension et tu l'aides à combler ses manques. Tutoie l'élève.
Réponds UNIQUEMENT par un objet JSON valide de la forme :
{
 "keywords": [{"w": "mot-clé attendu", "alt": ["synonyme ou variante acceptée"], "found": true}],
 "feedback": "2 phrases maximum : ce qui est juste, puis ce qui manque ou est faux, ton encourageant",
 "cards": [{"q": "...", "a": "...", "explain": "...", "tag": "definition", "reversible": false}],
 "mindmap": {"center": "notion centrale", "branches": [{"label": "idée", "children": ["mot", "mot"]}]}
}
Règles :
- keywords : 5 à 8 mots-clés ESSENTIELS de la notion, "found" = true seulement si l'élève exprime correctement l'idée (même avec d'autres mots).
- cards : 3 à 5 cartes courtes sur les points MANQUANTS ou FAUX (si tout est acquis, 3 cartes de compréhension : pourquoi, exemple, utilité). ${CARD_RULES}
- mindmap : 3 à 6 branches, 2 à 4 enfants par branche, mots ou groupes de mots de 4 mots maximum, qui relient les notions du chapitre.
Si l'explication est vide ou sans rapport avec le chapitre, renvoie {"error": "explication courte"}.`;

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
const askJSON = (text, system, maxTokens) => callClaude([{ type: 'text', text }], maxTokens, system);
function parseJSON(text) {
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s < 0 || e < 0) throw new Error('Réponse inattendue de l\'IA, réessaie.');
  let obj;
  try { obj = JSON.parse(text.slice(s, e + 1)); } catch (err) { throw new Error('Réponse illisible de l\'IA, réessaie.'); }
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
const normLesson = list => (list || []).filter(s => s && s.title && s.content).map(s => ({ title: String(s.title), content: String(s.content), examples: Array.isArray(s.examples) ? s.examples.map(String) : [] }));
function normMindmap(m) {
  if (!m || !m.center) return null;
  const branches = (Array.isArray(m.branches) ? m.branches : []).filter(b => b && b.label).slice(0, 6)
    .map(b => ({ label: clip(b.label, 40), children: (Array.isArray(b.children) ? b.children : []).slice(0, 5).map(x => clip(x, 40)) }));
  return branches.length ? { center: clip(m.center, 40), branches } : null;
}

/* Fichiers : images réduites en JPEG, PDF en base64 */
function fileToB64(file) {
  return new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = ko; r.readAsDataURL(file); });
}
async function imageToJpeg(file, max = 1600, quality = 0.85) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', quality);
  } finally { URL.revokeObjectURL(url); }
}
async function buildContent(files, text, subjectKey, title, extra = '') {
  const content = [];
  for (const f of files) {
    if (f.type === 'application/pdf') content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: await fileToB64(f) } });
    else if (f.type.startsWith('image/')) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: (await imageToJpeg(f)).split(',')[1] } });
  }
  const head = `Matière : ${subj(subjectKey).label}.${title ? ` Thème : ${title}.` : ''} ${extra}`;
  content.push({ type: 'text', text: head + (text ? `\n\nContenu du cours :\n${text}` : '\n\nLe cours est dans les fichiers ci-dessus.') });
  return content;
}
