/* Révizio — écouter la prononciation (synthèse vocale du navigateur, rien n'est envoyé nulle part).
   Les voix viennent de l'appareil : si l'italien ou le vietnamien manque, il faut l'ajouter dans les réglages de voix du système. */
'use strict';

const SPEECH_LANG = { langues: 'en-GB', italien: 'it-IT', vietnamien: 'vi-VN' };
const SPEECH_NAME = { en: "d'anglais", it: "d'italien", vi: 'de vietnamien' };
const speechOK = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';

/* Texte à lire pour une carte : le champ « say » s'il existe (say:false = jamais) ; pour l'italien seulement, à défaut, le verso s'il ressemble à de l'italien. */
const FR_ONLY = new Set(['les', 'des', 'du', 'une', 'est', 'pas', 'qui', 'que', 'dans', 'avec', 'pour', 'sur', 'au', 'aux', 'cette', 'sont', 'je', 'nous', 'vous', 'mon', 'mes', 'ton', 'verbe', 'à', 'où', 'ça']);
function speakable(t) {
  t = String(t || '').trim();
  if (!t || t.length > 90 || /[0-9«»+=→()\/]/.test(t)) return false;
  return !(t.toLowerCase().match(/[\p{L}']+/gu) || []).some(w => FR_ONLY.has(w));
}
function sayText(card) {
  if (!card || !SPEECH_LANG[card.subject] || card.say === false) return '';
  if (typeof card.say === 'string' && card.say.trim()) return card.say.trim();
  return card.subject === 'italien' && speakable(card.back) ? card.back.trim() : ''; // repli pour les cartes d'italien sans « say »
}
/* Le texte lu : on enlève ce qui n'est pas de la parole (flèches, puces, parenthèses…). */
const cleanSpeech = t => String(t).replace(/[→·=…«»()]/g, ' ').replace(/\s*:\s*/g, ', ').replace(/\s+/g, ' ').trim();

function pickVoice(lang) {
  const vs = (window.speechSynthesis.getVoices && window.speechSynthesis.getVoices()) || [], norm = v => String(v.lang || '').replace('_', '-').toLowerCase();
  const full = lang.toLowerCase(), pre = full.slice(0, 2);
  const pool = vs.filter(v => norm(v) === full).concat(vs.filter(v => norm(v).slice(0, 2) === pre));
  return { voice: pool.find(v => v.localService) || pool[0] || null, any: vs.length > 0 };
}
function speak(text, lang, slow) {
  if (!speechOK()) { toast("Ce navigateur ne sait pas lire à voix haute."); return false; }
  const { voice, any } = pickVoice(lang);
  if (!voice && any) { toast(`Aucune voix ${SPEECH_NAME[lang.slice(0, 2)] || lang} sur cet appareil. Ajoute-la dans les réglages de langue et de voix du système.`); return false; }
  const u = new window.SpeechSynthesisUtterance(cleanSpeech(text));
  u.lang = lang; if (voice) u.voice = voice; u.rate = slow ? 0.55 : 0.9;
  u.onerror = e => { if (e && e.error && e.error !== 'canceled' && e.error !== 'interrupted') toast('Lecture impossible sur cet appareil.'); };
  window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
  return true;
}
/* Deux petits boutons : lecture normale et lecture lente. */
function sayBtns(text, subject) {
  const lang = SPEECH_LANG[subject]; if (!lang || !text || !speechOK()) return '';
  const a = `data-say="${esc(text)}" data-lang="${lang}"`;
  return `<span class="sayrow"><button type="button" class="say" ${a} aria-label="Écouter : ${esc(text)}">🔊</button><button type="button" class="say" ${a} data-slow="1" aria-label="Écouter lentement : ${esc(text)}">🐢</button></span>`;
}
if (typeof document !== 'undefined') {
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('button.say[data-say]');
    if (b) { e.preventDefault(); speak(b.dataset.say, b.dataset.lang, !!b.dataset.slow); }
  });
  if (speechOK() && window.speechSynthesis.getVoices) window.speechSynthesis.getVoices(); // déclenche le chargement des voix
}
