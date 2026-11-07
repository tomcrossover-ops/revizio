/* Révizio — écouter la prononciation (synthèse vocale du navigateur, rien n'est envoyé nulle part).
   Les voix viennent de l'appareil : si l'italien, le vietnamien, l'espagnol ou le japonais manque, il faut l'ajouter dans les réglages de voix du système. */
'use strict';

const SPEECH_NAME = { en: "d'anglais", it: "d'italien", vi: 'de vietnamien', es: "d'espagnol", ja: 'de japonais' };
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
let _utt = null; // référence gardée : certains navigateurs (Chrome) ramassent l'énoncé en cours et coupent le son
function speak(text, lang, slow) {
  if (!speechOK()) { toast("Ce navigateur ne sait pas lire à voix haute."); return false; }
  const { voice, any } = pickVoice(lang);
  if (!voice && any) { toast(`Aucune voix ${SPEECH_NAME[lang.slice(0, 2)] || lang} sur cet appareil. Ajoute-la dans les réglages de langue et de voix du système.`); return false; }
  const ss = window.speechSynthesis, u = new window.SpeechSynthesisUtterance(cleanSpeech(text));
  u.lang = lang; if (voice) u.voice = voice; u.rate = slow ? 0.55 : 0.9;
  let started = false;
  u.onstart = () => { started = true; };
  u.onerror = e => { if (e && e.error && e.error !== 'canceled' && e.error !== 'interrupted') toast('Lecture impossible sur cet appareil.'); };
  _utt = u;
  const go = () => {
    try { if (ss.paused && ss.resume) ss.resume(); } catch (e) { /* ignoré */ }
    ss.speak(u);
    // rien n'a démarré au bout de 2 s : on le dit au lieu de rester muet
    setTimeout(() => { if (!started && _utt === u && !ss.speaking) toast("Pas de son. Vérifie le volume, que le téléphone n'est pas en mode silencieux, et qu'une voix est installée."); }, 2000);
  };
  if (ss.speaking || ss.pending) { ss.cancel(); setTimeout(go, 80); } else go(); // annuler puis parler aussitôt échoue sur Android : on laisse respirer
  return true;
}
/* Deux petits boutons : lecture normale et lecture lente. */
function sayBtnsLang(text, lang, hide) {
  if (!lang || !text || !speechOK()) return '';
  const a = `data-say="${esc(text)}" data-lang="${lang}"`, n1 = hide ? "Écouter l'enregistrement" : `Écouter : ${esc(text)}`, n2 = hide ? "Écouter l'enregistrement lentement" : `Écouter lentement : ${esc(text)}`;
  return `<span class="sayrow"><button type="button" class="say" ${a} aria-label="${n1}">🔊${hide ? ' Écouter' : ''}</button><button type="button" class="say" ${a} data-slow="1" aria-label="${n2}">🐢${hide ? ' Lent' : ''}</button></span>`;
}
const sayBtns = (text, subject) => sayBtnsLang(text, SPEECH_LANG[subject]);
if (typeof document !== 'undefined') {
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('button.say[data-say]');
    if (b) { e.preventDefault(); speak(b.dataset.say, b.dataset.lang, !!b.dataset.slow); }
  });
  if (speechOK() && window.speechSynthesis.getVoices) window.speechSynthesis.getVoices(); // déclenche le chargement des voix
}
