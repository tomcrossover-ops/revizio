/* Révizio — packs de contenu prêts à l'emploi (cours, cartes, exercices déjà écrits).
   Importer un pack ne consomme AUCUN appel à l'IA. Format : voir packs/LISEZMOI.md.
   Les packs fournis sont dans le dossier packs/ du site (index.json liste les fichiers) ; on peut aussi importer un fichier. */
'use strict';

const PACK_FORMAT = 'revizio-pack';
let packIndexCache = null;

/* Un chapitre brut (format pack) → { course, cards } normalisés par les mêmes fonctions que la génération IA */
function courseFromPack(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object' || !SUBJECTS[raw.subject] || !LEVELS.includes(raw.level)) return null;
  const title = String(raw.title || raw.catalogTitle || '').trim();
  if (!title) return null;
  const course = {
    id: uid(), subject: raw.subject, level: raw.level, origin: 'pack', catalogTitle: String(raw.catalogTitle || ''), title: clip(title, 120), createdAt: now,
    summary: clip(raw.summary || '', 400), lesson: normLesson(raw.lesson), keyPoints: (Array.isArray(raw.keyPoints) ? raw.keyPoints : []).map(x => clip(x, 160)).filter(Boolean).slice(0, 10),
    questions: normQuestions(raw.questions), scores: [], skills: {}, mistakes: [], path: {}, ...courseExtras(raw),
  };
  const cards = normCards(raw.cards, { subject: course.subject, chapter: course.title, courseId: course.id });
  if (!course.lesson.length && !cards.length && !course.questions.length) return null;
  return { course, cards };
}
const sameChapter = (c, raw) => c.subject === raw.subject && c.level === raw.level && ((raw.catalogTitle && c.catalogTitle === raw.catalogTitle) || normText(c.title) === normText(raw.title || raw.catalogTitle || ''));
/* Un pack (ou un cours seul, ou une liste de cours) → fusionné dans la base, sans jamais écraser un chapitre existant.
   only = indices des chapitres à importer (facultatif). */
function importPack(data, only) {
  const list = Array.isArray(data) ? data : data && Array.isArray(data.courses) ? data.courses : data && data.subject ? [data] : null;
  if (!list) throw new Error('Ce fichier n\'est pas un pack de cours Révizio.');
  const res = { added: 0, skipped: 0, invalid: 0, cards: 0, courses: [] };
  list.forEach((raw, i) => {
    if (only && !only.includes(i)) return;
    if (db.courses.some(c => sameChapter(c, raw || {}))) { res.skipped++; return; }
    const r = courseFromPack(raw, Date.now() + i);
    if (!r) { res.invalid++; return; }
    db.courses.push(r.course); db.cards.push(...r.cards);
    res.added++; res.cards += r.cards.length; res.courses.push(r.course);
  });
  if (res.added) save();
  return res;
}
const packMsg = r => `${r.added ? `${r.added} chapitre${r.added > 1 ? 's' : ''} ajouté${r.added > 1 ? 's' : ''} (${r.cards} cartes)` : 'Rien de nouveau'}${r.skipped ? ` · ${r.skipped} déjà présent${r.skipped > 1 ? 's' : ''}` : ''}${r.invalid ? ` · ${r.invalid} ignoré${r.invalid > 1 ? 's' : ''}` : ''}`;

/* Packs fournis avec l'appli (dossier packs/) */
async function loadPackIndex() {
  if (packIndexCache) return packIndexCache;
  try {
    const r = await fetch('packs/index.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error();
    const j = await r.json();
    packIndexCache = (Array.isArray(j.packs) ? j.packs : []).filter(p => p && /^[\w.\-]+\.json$/.test(p.file) && SUBJECTS[p.subject] && Array.isArray(p.chapters));
  } catch (e) { return []; } // hors ligne ou pas de packs : l'IA reste disponible
  return packIndexCache;
}
async function fetchPack(file) {
  if (!/^[\w.\-]+\.json$/.test(file)) throw new Error('Pack inconnu.');
  const r = await fetch('packs/' + file);
  if (!r.ok) throw new Error('Pack introuvable (es-tu connecté à Internet ?).');
  return r.json();
}
/* Un chapitre d'un pack fourni → importé puis ouvert */
async function viewPackChapter(file, idx) {
  $app.innerHTML = '<p class="muted"><span class="spinner"></span> Préparation du chapitre…</p>';
  try {
    const data = await fetchPack(file), res = importPack(data, [+idx]);
    const c = res.courses[0] || db.courses.find(x => data.courses[+idx] && sameChapter(x, data.courses[+idx]));
    if (!c) throw new Error('Chapitre introuvable dans ce pack.');
    toast(res.added ? 'Chapitre prêt, sans IA ⚡' : 'Ce chapitre est déjà là.'); location.hash = '#/course/' + c.id;
  } catch (e) { $app.innerHTML = `<div class="card"><span class="err">${esc(e.message)}</span></div><a class="btn ghost" href="#/">Retour</a>`; }
}
/* Tous les chapitres prêts d'une matière et d'une classe */
async function importReadyChapters(level, subject) {
  const idx = (await loadPackIndex()).filter(p => p.level === level && p.subject === subject);
  const tot = { added: 0, skipped: 0, invalid: 0, cards: 0, courses: [] };
  for (const p of idx) { const r = importPack(await fetchPack(p.file)); ['added', 'skipped', 'invalid', 'cards'].forEach(k => { tot[k] += r[k]; }); tot.courses.push(...r.courses); }
  return tot;
}
/* Ajout automatique des chapitres prêts d'une matière (sans clic). Un chapitre déjà traité n'est jamais rajouté
   (même si l'élève l'a supprimé ensuite) : on le retient dans db.settings.packDone. */
async function autoImportReady(level, subject) {
  const idx = (await loadPackIndex()).filter(p => p.level === level && p.subject === subject);
  const key = level + '|' + subject, done = (db.settings.packDone = db.settings.packDone || {}), seen = new Set(done[key] || []);
  const tot = { added: 0, skipped: 0, invalid: 0, cards: 0, courses: [] };
  for (const p of idx) {
    const only = p.chapters.map((t, i) => (seen.has(t) ? -1 : i)).filter(i => i >= 0);
    if (!only.length) continue;
    const r = importPack(await fetchPack(p.file), only);
    ['added', 'skipped', 'invalid', 'cards'].forEach(k => { tot[k] += r[k]; }); tot.courses.push(...r.courses);
    only.forEach(i => seen.add(p.chapters[i]));
  }
  done[key] = [...seen]; save();
  return tot;
}
/* Chapitres de langue déjà importés avant les exercices d'écoute : on leur ajoute (une seule fois) les questions d'écoute / dictée /
   prononciation du pack, et le texte à lire des cartes. Rien n'est supprimé ni modifié d'autre. Retourne le nombre de questions ajoutées. */
async function enrichAudio() {
  const todo = db.courses.filter(c => c.origin === 'pack' && SPEECH_LANG[c.subject] && !c.audioV);
  if (!todo.length) return 0;
  const idx = await loadPackIndex(); if (!idx.length) return 0;
  const files = {}; let n = 0;
  for (const c of todo) {
    const p = idx.find(x => x.level === c.level && x.subject === c.subject && x.chapters.includes(c.catalogTitle));
    const data = p && (files[p.file] = files[p.file] || await fetchPack(p.file));
    const raw = data && data.courses.find(r => sameChapter(c, r));
    if (raw) {
      const have = new Set(c.questions.map(questionKey));
      normQuestions(raw.questions).filter(q => q.audio).forEach(q => { const k = questionKey(q); if (!have.has(k)) { have.add(k); c.questions.push(q); n++; } });
      const say = new Map((raw.cards || []).filter(x => typeof x.say === 'string' && x.say).map(x => [normText(x.q), x.say]));
      db.cards.forEach(k => { if (k.courseId === c.id && k.say == null && say.has(normText(k.front))) k.say = say.get(normText(k.front)); });
    }
    c.audioV = 1;
  }
  save();
  return n;
}
/* Corrections de contenu : remplace, dans les chapitres déjà importés, une question corrigée depuis (une seule fois par correction).
   La question est retrouvée par son énoncé d'origine ; son identifiant est conservé. Retourne le nombre de questions corrigées. */
async function applyCorrections() {
  let list;
  try { const r = await fetch('packs/corrections.json'); if (!r.ok) return 0; list = (await r.json()).fixes; } catch (e) { return 0; }
  if (!Array.isArray(list)) return 0;
  const done = db.settings.fixesDone = Array.isArray(db.settings.fixesDone) ? db.settings.fixesDone : [];
  let n = 0;
  list.forEach(f => {
    if (!f || done.includes(f.id)) return;
    db.courses.filter(c => c.origin === 'pack' && c.level === f.level && c.subject === f.subject && sameChapter(c, { subject: f.subject, level: f.level, catalogTitle: f.catalogTitle, title: f.catalogTitle })).forEach(c => {
      const i = c.questions.findIndex(q => normText(q.q) === normText(f.match));
      const nq = normQuestions([f.question])[0];
      if (i >= 0 && nq) { c.questions[i] = { ...nq, id: c.questions[i].id }; n++; }
    });
    done.push(f.id);
  });
  if (n || list.length) save();
  return n;
}
/* Réglages : packs fournis + import d'un fichier */
async function packSettingsHtml() {
  const idx = await loadPackIndex();
  const sections = idx.map((p, i) => `<div class="card row between"><span><b>${esc(p.level)} · ${esc(subj(p.subject).label)}</b> <span class="muted">${p.chapters.length} chapitre${p.chapters.length > 1 ? 's' : ''}</span></span><button class="ghost small" data-pk="${i}">Ajouter</button></div>`).join('');
  return { idx, html: sections || '<div class="muted">Aucun pack fourni pour l\'instant.</div>' };
}
function bindPackSettings(idx) {
  document.querySelectorAll('[data-pk]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    try { const r = importPack(await fetchPack(idx[+b.dataset.pk].file)); toast(packMsg(r)); b.textContent = r.added ? '✔ Ajouté' : 'Déjà là'; }
    catch (e) { toast(e.message); b.disabled = false; }
  });
}
