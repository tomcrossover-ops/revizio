/* Révizio — noyau : données, utilitaires, révision espacée, CSV, API Claude. */
'use strict';

const APP_VERSION = '3.28'; // à garder identique à VERSION dans sw.js

const SUBJECTS = {
  maths: { label: 'Maths', short: 'Maths', emoji: '➗', color: '#2563eb' },
  francais: { label: 'Français', short: 'Franç.', emoji: '📖', color: '#db2777' },
  langues: { label: 'Anglais', short: 'Anglais', emoji: '🇬🇧', color: '#0d9488' },
  italien: { label: 'Italien', short: 'Italien', emoji: '🇮🇹', color: '#4f46e5' },
  vietnamien: { label: 'Vietnamien', short: 'Vietnam.', emoji: '🇻🇳', color: '#b91c1c' },
  espagnol: { label: 'Espagnol', short: 'Espagnol', emoji: '🇪🇸', color: '#ea580c' },
  japonais: { label: 'Japonais', short: 'Japonais', emoji: '🇯🇵', color: '#be185d' },
  histgeo: { label: 'Histoire-Géo', short: 'Hist-Géo', emoji: '🌍', color: '#d97706' },
  svt: { label: 'SVT', short: 'SVT', emoji: '🌱', color: '#16a34a' },
  physique: { label: 'Physique-Chimie', short: 'Phys-Chi', emoji: '⚗️', color: '#7c3aed' },
  techno: { label: 'Technologie', short: 'Techno', emoji: '🛠️', color: '#0891b2' },
  autre: { label: 'Autre', short: 'Autre', emoji: '✨', color: '#6b7280' },
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
/* Doublons dans une même série : même énoncé (ou même audio) ne sort qu'une fois. */
const kNorm = s => String(s ?? '').toLowerCase().normalize('NFC').replace(/[\s.,;:!?'"«»]+/g, ' ').trim(); // garde les symboles, exposants et caractères non latins
/* Bilan : au moins 3 questions de méthode (quand le chapitre en a), le reste tiré au hasard */
const isMethodQ = q => /^méthode/.test(q.skill || '');
function pickWithMethod(list, max) {
  const u = uniqueQs(shuffle(list)), m = u.filter(isMethodQ).slice(0, Math.min(3, max)), rest = u.filter(q => !m.includes(q));
  return shuffle(m.concat(rest.slice(0, Math.max(0, max - m.length))));
}
const qKey = q => q.audio ? 'a:' + kNorm(q.audio) : q.type === 'repete' ? 'a:' + kNorm(q.answer) : (q.type === 'assoc' ? kNorm(q.q) + '|' + kNorm(JSON.stringify(q.pairs)) : q.type === 'ordre' ? kNorm(q.q) + '|' + kNorm(JSON.stringify(q.items)) : kNorm(q.q));
const uniqueQs = (list, get = x => x) => { const seen = new Set(); return list.filter(x => { const k = qKey(get(x)); if (seen.has(k)) return false; seen.add(k); return true; }); };
const normText = s => String(s ?? '').toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const safeImg = s => (typeof s === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s)) ? s : '';

/* ---------- Dates ---------- */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
/* Rappel de sauvegarde : seulement s'il y a de quoi perdre, et pas plus d'une fois par semaine si on repousse. */
const SPEECH_LANG = { langues: 'en-GB', italien: 'it-IT', vietnamien: 'vi-VN', espagnol: 'es-ES', japonais: 'ja-JP' };
const SPEECH_LANGS = Object.values(SPEECH_LANG);
const BACKUP_EVERY_DAYS = 14, BACKUP_SNOOZE_DAYS = 7;
function backupDue(now = Date.now()) {
  const s = db.settings, DAY = 864e5;
  const hasData = db.cards.length >= 10 || db.activity.days.length >= 3 || db.courses.length >= 3;
  return hasData && now - (s.lastBackup || 0) > BACKUP_EVERY_DAYS * DAY && now > (s.backupSnooze || 0);
}
function addDays(s, n) { const t = new Date(s + 'T12:00:00'); t.setDate(t.getDate() + n); return ymd(t); }
const fmtDate = t => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

/* ---------- Stockage + migration (cartes de l'ancienne version rangées dans les cours) ---------- */
const freshState = () => ({ step: 0, due: today(), lapses: 0 });
function migrate(d) {
  d = d && typeof d === 'object' ? d : {};
  d.settings = Object.assign({ name: '', provider: 'anthropic', profiles: {}, avatar: '🥷', theme: 'systeme', schedule: {}, profileDone: false, apiKey: '', model: MODELS[0][0], level: '6e', bonus: true, lastBackup: 0, backupSnooze: 0, micro: false }, d.settings || {});
  if (!d.settings.schedule || typeof d.settings.schedule !== 'object') d.settings.schedule = {};
  d.courses = Array.isArray(d.courses) ? d.courses : [];
  d.courses.forEach(c => { const L = SPEECH_LANG[c && c.subject]; if (L && Array.isArray(c.questions)) c.questions.forEach(q => { if (q && !q.lang) q.lang = L; }); }); // questions de langue : langue de lecture
  d.cards = Array.isArray(d.cards) ? d.cards : [];
  d.decks = Array.isArray(d.decks) ? d.decks : [];
  d.activity = d.activity && Array.isArray(d.activity.days) ? d.activity : { days: [] };
  if (typeof d.activity.xp !== 'number') d.activity.xp = 0;
  if (!d.activity.today || typeof d.activity.today !== 'object') d.activity.today = { date: '', cards: 0, qs: 0, done: false };
  d.courses.forEach(c => {
    c.scores = c.scores || []; c.questions = c.questions || []; c.keyPoints = c.keyPoints || [];
    c.skills = c.skills || {}; c.mistakes = c.mistakes || [];
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
/* ---------- Sauvegarde complète ---------- */
const BACKUP_SETTINGS = ['name', 'avatar', 'theme', 'schedule', 'profileDone', 'level', 'bonus', 'micro', 'packDone', 'reports']; // jamais la clé API
function backupData() {
  const settings = {}; BACKUP_SETTINGS.forEach(k => { if (db.settings[k] !== undefined) settings[k] = db.settings[k]; });
  return { format: 'revizio-backup', version: 2, app: APP_VERSION, exportedAt: Date.now(), settings, courses: db.courses, cards: db.cards, decks: db.decks, activity: db.activity };
}
/* mode « replace » : remplace cours, cartes, paquets, statistiques (et le profil si la sauvegarde en contient un).
   mode « merge » : ajoute seulement ce qui manque (jamais de suppression, l'existant gagne). Retourne des compteurs. */
function applyBackup(d, mode) {
  if (!d || !Array.isArray(d.courses)) throw new Error('Fichier invalide.');
  const m = migrate({ settings: db.settings, courses: d.courses, cards: d.cards, decks: d.decks, activity: d.activity });
  const inc = d.settings && typeof d.settings === 'object' ? d.settings : null, res = { courses: 0, cards: 0, decks: 0, skipped: 0 };
  const takeSettings = all => { if (!inc) return; BACKUP_SETTINGS.forEach(k => { if (inc[k] === undefined || k === 'packDone') return; if (all || (k === 'schedule' && !Object.keys(db.settings.schedule || {}).length)) db.settings[k] = inc[k]; });
    if (inc.packDone && typeof inc.packDone === 'object') { const cur = db.settings.packDone = db.settings.packDone || {}; Object.keys(inc.packDone).forEach(key => { cur[key] = [...new Set([...(cur[key] || []), ...(Array.isArray(inc.packDone[key]) ? inc.packDone[key] : [])])]; }); } };
  if (mode === 'replace') {
    db.courses = m.courses; db.cards = m.cards; db.decks = m.decks; db.activity = m.activity;
    res.courses = m.courses.length; res.cards = m.cards.length; res.decks = m.decks.length;
    takeSettings(true);
  } else {
    const dup = new Set();
    m.courses.forEach(c => {
      const same = db.courses.some(x => x.id === c.id) || (c.origin === 'pack' && db.courses.some(x => sameChapter(x, c)));
      if (same) { dup.add(c.id); res.skipped++; } else { db.courses.push(c); res.courses++; }
    });
    const haveCard = new Set(db.cards.map(c => c.id));
    m.cards.forEach(c => { if (haveCard.has(c.id) || (c.courseId && dup.has(c.courseId))) return; db.cards.push(c); haveCard.add(c.id); res.cards++; });
    const haveDeck = new Set(db.decks.map(x => x.id));
    m.decks.forEach(x => { if (haveDeck.has(x.id)) return; db.decks.push({ ...x, cardIds: (x.cardIds || []).filter(id => haveCard.has(id)) }); res.decks++; });
    db.activity.days = [...new Set([...db.activity.days, ...m.activity.days])].sort().slice(-400);
    db.activity.xp = Math.max(db.activity.xp || 0, m.activity.xp || 0);
    takeSettings(!db.settings.profileDone && !!inc && !!inc.profileDone);
  }
  if (res.courses) db.settings.fixesDone = []; // des chapitres anciens sont arrivés : on rejoue les corrections de contenu (sans effet si déjà à jour)
  save();
  return res;
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
const TAG_EMOJI = { definition: '📖', formule: '🧮', date: '📅', vocabulaire: '🔤', methode: '🧭', erreur: '⚠️', comprehension: '💡' };
/* 1 à 3 émojis qui illustrent la carte (jamais de texte) */
function cleanEmoji(s) {
  const t = String(s || '').trim();
  if (!t || t.length > 16 || /[A-Za-z0-9À-ÿ]/.test(t)) return '';
  return [...t.replace(/\s+/g, '')].slice(0, 6).join('');
}
const cardEmoji = c => c.emoji || TAG_EMOJI[c.tag] || '✨';
function newCard(o) {
  const tag = TAGS[o.tag] ? o.tag : 'definition';
  const c = {
    id: uid(), subject: SUBJECTS[o.subject] ? o.subject : 'autre', chapter: String(o.chapter || '').trim(), courseId: o.courseId || null,
    tag, front: String(o.front || '').trim(), back: String(o.back || '').trim(), explain: String(o.explain || '').trim(),
    reversible: !!o.reversible, image: safeImg(o.image) || null, emoji: cleanEmoji(o.emoji), say: o.say === false ? false : (typeof o.say === 'string' && o.say.trim() ? o.say.trim().slice(0, 120) : undefined), createdAt: Date.now(), fwd: freshState(), rev: null,
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
/* Retire les doublons (même contenu, même réponse) en gardant le premier */
const dedupe = (list, keyOf) => { const seen = new Set(); return list.filter(x => { const k = keyOf(x); if (seen.has(k)) return false; seen.add(k); return true; }); };
const rawKey = v => String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim(); // garde les symboles : « 2+2 » ≠ « 2×2 »
const cardKey = c => rawKey(c.front) + '|' + rawKey(c.back);
const questionKey = q => { const { id, explanation, hint, level, skill, pitfall, ...rest } = q; return JSON.stringify(rest, (k, v) => typeof v === 'string' ? rawKey(v) : v); };
function normCards(list, ctx) {
  return dedupe((list || []).map(c => {
    if (!c || !c.q || !c.a) return null;
    return newCard({ subject: ctx.subject, chapter: ctx.chapter, courseId: ctx.courseId, tag: c.tag, front: clip(c.q, 200), back: clip(c.a, MAX_BACK), explain: clip(c.explain || '', 220), reversible: !!c.reversible, emoji: c.emoji, say: c.say });
  }).filter(Boolean), cardKey);
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
  if (!s.last && !s.first) s.first = today(); // jour où la carte est vue pour la première fois
  if (rating === 'no') s.lapses = (s.lapses || 0) + 1;
  s.step = n.step; s.due = addDays(today(), n.days); s.last = today();
  markActivity();
  if (typeof onCardGraded === 'function') onCardGraded(rating);
}
/* Les cartes des chapitres prêts (packs) arrivent par petites doses : NEW_PER_DAY nouvelles cartes par jour,
   en commençant par les chapitres déjà entamés. Les autres cartes (créées à la main ou par l'IA) ne sont pas limitées. */
const NEW_PER_DAY = 12;
const isPackCard = c => { const co = c.courseId && getCourse(c.courseId); return !!co && co.origin === 'pack'; };
const isNewState = s => !s.last;
function newQuota() {
  const t = today();
  let seen = 0;
  db.cards.forEach(c => dirsOf(c).forEach(d => { if (isPackCard(c) && stateOf(c, d).first === t) seen++; }));
  return Math.max(0, NEW_PER_DAY - seen);
}
/* cartes nouvelles autorisées aujourd'hui : clés « id|sens » ; chapitres entamés d'abord, puis par ancienneté */
function newAllowedKeys() {
  const started = new Set(db.cards.filter(c => dirsOf(c).some(d => !isNewState(stateOf(c, d)))).map(c => c.courseId));
  const cand = [];
  db.cards.forEach((c, i) => { if (isPackCard(c)) dirsOf(c).forEach(dir => { if (isNewState(stateOf(c, dir))) cand.push({ c, dir, i }); }); });
  const created = id => (getCourse(id) || {}).createdAt || 0;
  cand.sort((a, b) => (started.has(b.c.courseId) ? 1 : 0) - (started.has(a.c.courseId) ? 1 : 0) || created(a.c.courseId) - created(b.c.courseId) || a.i - b.i);
  return new Set(cand.slice(0, newQuota()).map(x => x.c.id + '|' + x.dir));
}
/* opts.all : toutes les cartes dues, sans limite (révision explicite d'un chapitre) */
function dueItems(filter = () => true, opts = {}) {
  const t = today(), allowed = opts.all ? null : newAllowedKeys();
  return db.cards.filter(filter).flatMap(c => dirsOf(c).filter(d => {
    const s = stateOf(c, d);
    if (s.due > t) return false;
    return !allowed || !isPackCard(c) || !isNewState(s) || allowed.has(c.id + '|' + d);
  }).map(dir => ({ card: c, dir })));
}
/* nouvelles cartes encore « en réserve » (pas encore proposées) */
function reserveCount() {
  const allowed = newAllowedKeys();
  let n = 0;
  db.cards.forEach(c => { if (isPackCard(c)) dirsOf(c).forEach(d => { const s = stateOf(c, d); if (isNewState(s) && s.due <= today() && !allowed.has(c.id + '|' + d)) n++; }); });
  return n;
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
const CARD_RULES = `Chaque carte = UNE seule idée. Format : {"q": "recto : question claire, 10 mots maximum", "a": "verso : réponse courte (8 mots maximum pour une carte de mémoire, 25 mots maximum pour une carte de compréhension, jamais plus de 200 caractères)", "explain": "une phrase d'explication de 150 caractères maximum", "tag": "definition | formule | date | vocabulaire | methode | erreur | comprehension", "emoji": "1 à 2 émojis qui illustrent visuellement la notion (ex. 🌱☀️ pour la photosynthèse), jamais de texte", "reversible": true ou false}.
"reversible" = true seulement quand la réponse est une notion identifiable à retrouver depuis la question (terme ↔ définition, mot ↔ traduction, date ↔ événement, formule ↔ nom). Environ un quart des cartes sont des cartes de COMPRÉHENSION (tag "comprehension") : « Pourquoi … ? », « À quoi sert … ? », « Donne un exemple de … ». Les autres cartes sont de la mémoire (définitions, formules, dates, vocabulaire, méthodes). Pas de phrases de remplissage.`;

const SYSTEM = `Tu es un professeur bienveillant de collège (France). À partir du cours fourni, tu produis un matériel de révision fiable, fidèle au cours, en français, adapté à un élève de collège.
Réponds UNIQUEMENT par un objet JSON valide (sans texte autour, sans balises markdown) de la forme :
{
 "title": "titre court du cours",
 "summary": "résumé clair en 3 phrases maximum",
 "keyPoints": ["notion ou définition essentielle", "..."],
 "cards": [{"q": "...", "a": "...", "explain": "...", "tag": "definition", "reversible": false}],
 "questions": [
   {"type": "qcm", "q": "...", "choices": ["A","B","C","D"], "answer": 0, "explanation": "...", "skill": "compétence"},
   {"type": "vf", "q": "affirmation", "answer": true, "explanation": "...", "skill": "compétence"},
   {"type": "short", "q": "...", "answer": "réponse attendue", "accept": ["variante acceptée"], "explanation": "...", "skill": "compétence"},
   {"type": "trous", "q": "phrase avec ___ à la place du mot manquant", "answer": "mot", "accept": [], "hint": "piste courte", "explanation": "...", "skill": "compétence", "level": 1},
   {"type": "assoc", "q": "Associe …", "pairs": [["à gauche", "à droite"], ["...", "..."]], "explanation": "...", "skill": "compétence"},
   {"type": "ordre", "q": "Remets dans l'ordre …", "items": ["1er", "2e", "3e"], "explanation": "...", "skill": "compétence"},
   {"type": "calcul", "q": "7 × 8 = ?", "answer": "56", "explanation": "...", "skill": "compétence"}
 ]
}
Types d'exercices : "trous" = UN seul mot ou nombre manquant (___ dans q), "assoc" = 3 à 5 paires dont les éléments de droite sont tous différents, "ordre" = 3 à 5 étapes ou éléments donnés dans le BON ordre (l'appli les mélange), "calcul" = calcul mental avec un résultat numérique (mathématiques et sciences seulement). "short" : réponse de 1 à 3 mots avec 1 à 3 variantes dans "accept" (singulier/pluriel, synonyme). "hint" (facultatif) = piste courte qui ne donne pas la réponse ; "level" = difficulté de 1 (facile) à 3 (difficile). Varie les types : au moins 3 types différents dans le quiz, et seulement ceux qui ont du sens pour la matière.
"skill" = la compétence travaillée par la question, en 2 à 4 mots ; 3 à 5 compétences différentes pour tout le quiz.
Règles de concision : 5 à 8 points clés de 12 mots maximum ; 10 à 14 cartes ; explications de quiz en une phrase courte. Questions : 10 à 14 mélangeant qcm (4 choix, "answer" = index 0-3), vf et short. Ne pose que des questions dont la réponse se trouve dans le cours.
${CARD_RULES}
Si le cours est illisible ou vide, renvoie {"error": "explication"}.`;

const SYSTEM_GEN = `Tu es un professeur expérimenté de primaire et de collège (France). Un élève te demande de préparer un cours sur un chapitre du programme officiel de l'Éducation nationale pour sa classe (CM1, CM2, 6e : cycle 3 ; 5e, 4e, 3e : cycle 4). Pour CM1 et CM2, utilise un vocabulaire encore plus simple, des phrases très courtes et des exemples du quotidien d'un enfant de 9 à 11 ans.
Écris une leçon COURTE et efficace, comme la fiche de révision d'un très bon élève : va droit à l'essentiel, sans introduction, sans phrases de transition, sans répétition. Une idée par ligne, phrases de 15 mots maximum, vocabulaire simple adapté à l'âge, exemples concrets. Reste fidèle aux notions réellement au programme de cette classe ; n'invente rien. Si le cours de l'élève est fourni (photos, PDF ou texte), appuie-toi dessus en priorité : reste fidèle à ce qu'il contient et ne le complète qu'avec les notions du programme qui manquent. Si des "Notions au programme" sont indiquées, la leçon, les cartes et les questions couvrent exactement ce périmètre, sans en sortir. Si la demande est trop avancée ou trop simple pour cette classe, traite-la au niveau de la classe et dis-le dans "summary".
Réponds UNIQUEMENT par un objet JSON valide (sans texte autour, sans balises markdown) de la forme :
{
 "title": "titre du chapitre",
 "summary": "résumé en 2 phrases",
 "duration": 10,
 "objectives": ["Je sais … (verbe d'action)", "..."],
 "prerequisites": ["notion à connaître avant", "..."],
 "pitfalls": ["Erreur fréquente → ce qu'il faut faire", "..."],
 "lesson": [{"title": "titre de la partie", "content": "- idée courte\\n- idée courte", "examples": ["exemple très court", "..."]}],
 "keyPoints": ["règle ou définition à retenir", "..."],
 "cards": [{"q": "...", "a": "...", "explain": "...", "tag": "definition", "emoji": "🌱", "reversible": false}],
 "questions": [
   {"type": "qcm", "q": "...", "choices": ["A","B","C","D"], "answer": 0, "explanation": "...", "skill": "compétence", "pitfall": "erreur fréquente"},
   {"type": "vf", "q": "affirmation", "answer": true, "explanation": "...", "skill": "compétence"},
   {"type": "short", "q": "...", "answer": "réponse attendue", "accept": ["variante acceptée"], "explanation": "...", "skill": "compétence"},
   {"type": "trous", "q": "phrase avec ___ à la place du mot manquant", "answer": "mot", "accept": [], "hint": "piste courte", "explanation": "...", "skill": "compétence", "level": 1},
   {"type": "assoc", "q": "Associe …", "pairs": [["à gauche", "à droite"], ["...", "..."]], "explanation": "...", "skill": "compétence"},
   {"type": "ordre", "q": "Remets dans l'ordre …", "items": ["1er", "2e", "3e"], "explanation": "...", "skill": "compétence"},
   {"type": "calcul", "q": "7 × 8 = ?", "answer": "56", "explanation": "...", "skill": "compétence"}
 ]
}
Types d'exercices : "trous" = UN seul mot ou nombre manquant (___ dans q), "assoc" = 3 à 5 paires dont les éléments de droite sont tous différents, "ordre" = 3 à 5 étapes ou éléments donnés dans le BON ordre (l'appli les mélange), "calcul" = calcul mental avec un résultat numérique (mathématiques et sciences seulement). "short" : réponse de 1 à 3 mots avec 1 à 3 variantes dans "accept" (singulier/pluriel, synonyme). "hint" (facultatif) = piste courte qui ne donne pas la réponse ; "level" = difficulté de 1 (facile) à 3 (difficile). Varie les types : au moins 3 types différents dans le quiz, et seulement ceux qui ont du sens pour la matière.
Règles de concision STRICTES :
- duration : minutes nécessaires pour lire la leçon (entier de 5 à 20).
- objectives : 2 à 3 objectifs d'apprentissage de 12 mots maximum, commençant par un verbe (« Savoir… », « Reconnaître… »).
- prerequisites : 0 à 3 notions à connaître avant ce chapitre (tableau vide s'il n'y en a pas).
- pitfalls : 2 à 3 erreurs fréquentes des élèves sur ce chapitre, chacune avec la bonne façon de faire (« Erreur → Correction », 20 mots maximum).
- skill (sur chaque question) : la compétence travaillée en 2 à 4 mots (ex. « Accorder le participe passé »). Utilise 3 à 5 compétences différentes pour tout le quiz, plusieurs questions par compétence. "pitfall" (facultatif) : l'erreur fréquente que la question vise, en une phrase.
- summary : 2 phrases maximum.
- lesson : 3 à 5 parties. Chaque "content" fait 60 mots maximum, écrit en lignes courtes qui commencent par "- " (une idée par ligne), jamais de long paragraphe. 1 à 3 "examples" très courts par partie.
- keyPoints : 5 à 7 points de 12 mots maximum, à apprendre par cœur.
- cards : 10 à 14 cartes. ${CARD_RULES}
- questions : 12 à 16 variées (qcm avec 4 choix et "answer" = index 0-3, vf, short, trous, assoc, ordre, calcul), énoncé de 20 mots maximum, "explanation" d'une seule phrase courte.
Les mauvaises réponses d'un qcm sont plausibles (erreurs réelles d'élèves), jamais absurdes. Les exercices portent sur ce qui est expliqué dans la leçon et n'ont qu'une seule bonne réponse, vérifiable sans ambiguïté. Pas de LaTeX : écris les formules en texte simple. Si la demande n'a aucun rapport avec la matière ou est incompréhensible, renvoie {"error": "explication courte"}.`;

const SYSTEM_SPLIT = `Tu aides un collégien à découper une carte de révision trop longue en plusieurs cartes courtes. Chaque carte porte UNE seule idée.
Réponds UNIQUEMENT par un objet JSON valide : {"cards": [{"q": "question claire terminée par ?", "a": "réponse de 200 caractères maximum"}]}
Règles : 2 à 6 cartes, fidèles au texte fourni (n'ajoute aucune information), questions précises et indépendantes les unes des autres. Si le texte ne se découpe pas, renvoie {"error": "explication courte"}.`;

/* callClaude() (appel à l'IA choisie dans les Réglages : Claude, ChatGPT ou Perplexity) est défini dans ai.js */
const askJSON = (text, system, maxTokens) => callClaude([{ type: 'text', text }], maxTokens, system);
function parseJSON(text) {
  text = String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json)?/g, '');
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s < 0 || e < 0) throw new Error('Réponse inattendue de l\'IA, réessaie.');
  let obj;
  try { obj = JSON.parse(text.slice(s, e + 1)); } catch (err) { throw new Error('Réponse illisible de l\'IA, réessaie.'); }
  if (obj.error) throw new Error(obj.error);
  return obj;
}
function normQuestions(list) {
  return dedupe((list || []).map(q => {
    if (!q || !q.q) return null;
    const lv = Math.round(Number(q.level));
    const meta = { skill: q.skill ? clip(String(q.skill), 40) : '', pitfall: q.pitfall ? clip(String(q.pitfall), 160) : '' };
    if (q.hint) meta.hint = clip(String(q.hint), 120);
    if (lv >= 1 && lv <= 3) meta.level = lv;
    if (SPEECH_LANGS.includes(q.lang)) { meta.lang = q.lang; if (typeof q.audio === 'string' && q.audio.trim()) { meta.audio = clip(q.audio.trim(), 120); if (q.ecoute) meta.ecoute = true; } }
    const accept = Array.isArray(q.accept) ? q.accept.map(x => clip(String(x), 60)).filter(Boolean).slice(0, 4) : [];
    const expl = q.explanation || '';
    if (q.type === 'qcm' && Array.isArray(q.choices) && q.choices.length >= 2) {
      const idx = Number.isInteger(q.answer) ? q.answer : 0;
      return { id: uid(), type: 'qcm', q: q.q, choices: q.choices.map(String), answer: Math.min(Math.max(idx, 0), q.choices.length - 1), explanation: expl, ...meta };
    }
    if (q.type === 'vf') return { id: uid(), type: 'qcm', q: q.q, choices: ['Vrai', 'Faux'], answer: q.answer === true || q.answer === 'true' ? 0 : 1, explanation: expl, ...meta };
    if (q.type === 'assoc' && Array.isArray(q.pairs)) {
      const pairs = q.pairs.filter(p => Array.isArray(p) && p.length >= 2 && p[0] && p[1]).map(p => [clip(String(p[0]), 50), clip(String(p[1]), 50)]).slice(0, 5);
      if (pairs.length >= 2 && new Set(pairs.map(p => p[1])).size === pairs.length) return { id: uid(), type: 'assoc', q: q.q, pairs, explanation: expl, ...meta };
      return null;
    }
    if (q.type === 'ordre' && Array.isArray(q.items)) {
      const items = q.items.map(x => clip(String(x), 60)).filter(Boolean).slice(0, 6);
      return items.length >= 3 && new Set(items).size === items.length ? { id: uid(), type: 'ordre', q: q.q, items, explanation: expl, ...meta } : null;
    }
    if (q.type === 'repete' && meta.audio) return { id: uid(), type: 'repete', q: q.q, answer: meta.audio, explanation: expl, ...meta };
    if (q.type === 'calcul' && q.answer !== undefined && q.answer !== null && Number.isFinite(Number(String(q.answer).replace(',', '.').replace(/\s/g, '')))) return { id: uid(), type: 'calcul', q: q.q, answer: String(q.answer), explanation: expl, ...meta };
    if (q.type === 'trous' && q.answer && /_{2,}/.test(q.q)) return { id: uid(), type: 'trous', q: q.q, answer: String(q.answer), accept, explanation: expl, ...meta };
    if ((q.type === 'short' || q.type === 'trous' || q.type === 'calcul') && q.answer) return { id: uid(), type: 'short', q: q.q, answer: String(q.answer), ...(accept.length ? { accept } : {}), explanation: expl, ...meta };
    return null;
  }).filter(Boolean), questionKey);
}
/* Champs pédagogiques d'un cours généré : durée, objectifs, prérequis, erreurs fréquentes */
const strList = (a, n, len) => (Array.isArray(a) ? a : []).map(x => clip(String(x || ''), len)).filter(Boolean).slice(0, n);
function courseExtras(r) {
  const d = Math.round(Number(r.duration));
  return { duration: d >= 3 && d <= 60 ? d : 0, objectives: strList(r.objectives, 3, 110), prerequisites: strList(r.prerequisites, 3, 90), pitfalls: strList(r.pitfalls, 3, 160) };
}
const normLesson = list => (list || []).filter(s => s && s.title && s.content).map(s => ({ title: String(s.title), content: String(s.content), examples: Array.isArray(s.examples) ? s.examples.map(String) : [], ...(Array.isArray(s.steps) && s.steps.length ? { steps: s.steps.map(x => clip(String(x), 400)).slice(0, 8), method: true } : {}) }));
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
