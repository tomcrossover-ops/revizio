const { make, check, done } = require('./harness');
const fs = require('fs');
const P = __dirname + '/../packs/', pack = n => JSON.parse(fs.readFileSync(P + n, 'utf8'));
const fetchImpl = async u => { const f = P + String(u).replace(/^packs\//, ''); if (!fs.existsSync(f)) return { ok: false }; const j = JSON.parse(fs.readFileSync(f, 'utf8')); return { ok: true, json: async () => j }; };
function fakeSpeech(w) { const spoken = []; w.SpeechSynthesisUtterance = function (t) { this.text = t; }; w.speechSynthesis = { getVoices: () => [{ lang: 'it-IT', name: 'A', localService: true }, { lang: 'en-GB', name: 'D', localService: true }, { lang: 'vi-VN', name: 'V', localService: true }], cancel() {}, speak: u => spoken.push(u) }; return spoken; }
const empty = { v: 2, settings: { level: '5e', apiKey: '', name: 'Léo' }, courses: [], cards: [], decks: [], activity: { days: [] } };
(async () => {
  let h = make({ store: JSON.parse(JSON.stringify(empty)), fetchImpl }); const spoken = fakeSpeech(h.w), T = h.t, D = h.w.document;
  // --- contenu des packs
  let nAudio = 0, bad = 0, types = new Set();
  fs.readdirSync(P).filter(f => !f.startsWith('fixes-') && /-(langues|italien|vietnamien|espagnol|japonais)\.json$/.test(f)).forEach(f => pack(f).courses.forEach(c => {
    const qs = T.normQuestions(c.questions); if (qs.length !== c.questions.length) bad++;
    qs.filter(q => q.audio).forEach(q => { nAudio++; types.add(q.type + (q.ecoute ? '+e' : '')); if (!q.lang || (q.type === 'repete' && q.answer !== q.audio) || (q.type === 'qcm' && (q.choices.length !== 4 || new Set(q.choices).size !== 4))) bad++; });
    if (c.questions.some(q => !q.lang)) bad++;
  }));
  check('packs de langue : questions d\'écoute valides (qcm, dictée, prononciation)', nAudio > 150 && bad === 0 && types.has('qcm+e') && types.has('short+e') && types.has('repete'), nAudio + ' ' + bad + ' ' + [...types]);
  T.importPack(pack('5e-italien.json')); T.importPack(pack('6e-langues.json'));
  const it = T.db.courses.find(c => c.subject === 'italien'), en = T.db.courses.find(c => c.subject === 'langues');
  const body = () => { D.querySelectorAll('.tb').forEach(x => x.remove()); const b = D.createElement('div'); b.className = 'tb'; D.body.appendChild(b); return b; };
  // --- écoute QCM
  const q1 = it.questions.find(q => q.ecoute && q.type === 'qcm');
  const qh = T.qHtml(q1);
  check('écoute : boutons dans l\'énoncé, texte caché aux lecteurs d\'écran', /class="say"/.test(qh) && !qh.includes('aria-label="Écouter : ') && /l'enregistrement/.test(qh) && T.exLabel(q1).startsWith('🎧'), qh.slice(0, 200));
  let b = body(), res = null; T.renderExercise(q1, b, ok => { res = ok; });
  check('écoute : pas de bouton « bonne réponse » avant de répondre', !b.querySelector('.sayafter'));
  b.querySelector('button.choice[data-k="' + q1.answer + '"]').click(); { const o = b.querySelector('#ok'); if (o) o.click(); }
  const after = b.querySelector('.sayafter button.say');
  check('écoute : après la réponse, on peut réécouter', res === true && !!after && after.dataset.say === q1.audio && after.dataset.lang === 'it-IT');
  // --- dictée
  const q2 = en.questions.find(q => q.ecoute && q.type === 'short');
  b = body(); res = null; T.renderExercise(q2, b, ok => { res = ok; });
  b.querySelector('#ans').value = q2.answer.toUpperCase().replace(/[.!?]/g, ''); b.querySelector('#chk').click();
  check('dictée : réponse acceptée (majuscules et ponctuation libres)', res === true, q2.answer);
  const q3 = it.questions.find(q => q.ecoute && q.type === 'short');
  b = body(); res = null; T.renderExercise(q3, b, ok => { res = ok; });
  b.querySelector('#ans').value = 'zzz'; b.querySelector('#chk').click(); b.querySelector('#ans').value = 'yyy'; b.querySelector('#chk').click();
  check('dictée : deux erreurs → à l\'élève de juger, réponse montrée', res === null && b.textContent.includes(q3.answer) && !!b.querySelector('#yes'));
  // --- prononciation
  const q4 = it.questions.find(q => q.type === 'repete');
  b = body(); res = null; T.renderExercise(q4, b, ok => { res = ok; });
  check('prononciation : phrase, 🔊/🐢, pas de micro par défaut', b.textContent.includes(q4.answer) && b.querySelectorAll('button.say').length === 2 && !b.querySelector('#mic'));
  b.querySelector('#no').click();
  check('prononciation : « à retravailler » enregistré comme raté', res === false);
  // micro (réglage activé)
  T.db.settings.micro = true; let rec = null;
  h.w.SpeechRecognition = function () { rec = this; this.start = () => {}; };
  b = body(); res = null; T.renderExercise(q4, b, ok => { res = ok; });
  check('micro activé : bouton 🎤', !!b.querySelector('#mic'));
  b.querySelector('#mic').click(); check('micro : langue de reconnaissance', rec && rec.lang === 'it-IT');
  rec.onresult({ results: [[{ transcript: q4.answer }]] });
  check('micro : « très proche » si le mot est reconnu, verdict laissé à l\'élève', /Très proche/.test(b.textContent) && res === null);
  b.querySelector('#mic').click(); rec.onerror({ error: 'not-allowed' }); check('micro refusé : message clair', /bloqué/.test(b.textContent) && /Autoriser/.test(b.textContent));
  T.db.settings.micro = false; delete h.w.SpeechRecognition;
  // --- mots entre « » + recto des cartes
  const w1 = T.db.cards.find(c => c.subject === 'italien' && T.sayText(c));
  const qq = { type: 'short', q: 'Que veut dire « ' + w1.back + ' » ?', answer: 'x', lang: 'it-IT' };
  check('énoncé : mot étranger connu entre « » → boutons', (T.qHtml(qq).match(/class="say"/g) || []).length === 2);
  check('énoncé : mot français ou autre matière → rien', !/class="say"/.test(T.qHtml({ ...qq, q: 'Que veut dire « bonjour » ?' })) && !/class="say"/.test(T.qHtml({ ...qq, lang: undefined })));
  const fc = { subject: 'italien', front: 'Que veut dire « ' + w1.back + ' » ?' };
  check('carte : écoute possible dès le recto', T.frontSay(fc) === T.sayText(w1) && T.frontSay({ subject: 'maths', front: w1.back }) === '');
  // --- chapitres déjà importés : enrichissement une seule fois
  const old = JSON.parse(JSON.stringify(empty)); let h2 = make({ store: old, fetchImpl }); fakeSpeech(h2.w);
  h2.t.importPack(pack('6e-langues.json'));
  const c0 = h2.t.db.courses[0]; c0.questions = c0.questions.filter(q => !q.audio); const nq = c0.questions.length;
  h2.t.db.cards.forEach(k => { delete k.say; }); delete c0.audioV; h2.t.db.courses.forEach(c => { delete c.audioV; });
  const added = await h2.t.enrichAudio();
  check('enrichissement : questions d\'écoute ajoutées aux chapitres existants', added > 0 && c0.questions.length > nq && c0.audioV === 1, added + ' ' + c0.questions.length);
  check('enrichissement : texte à lire ajouté aux cartes', h2.t.db.cards.some(k => k.say));
  check('enrichissement : une seule fois', (await h2.t.enrichAudio()) === 0 && c0.questions.length === nq + c0.questions.filter(q => q.audio).length);
  // hors ligne : rien de cassé, réessai possible
  const h3 = make({ store: JSON.parse(JSON.stringify(empty)) }); h3.t.importPack(pack('6e-langues.json')); h3.t.db.courses.forEach(c => { delete c.audioV; });
  let thrown = false; try { await h3.t.enrichAudio(); } catch (e) { thrown = true; }
  check('hors ligne : pas de drapeau posé (réessai au prochain démarrage)', !h3.t.db.courses.some(c => c.audioV) || thrown);
  // --- migration + en-têtes
  const h4 = make({ store: { ...JSON.parse(JSON.stringify(empty)), courses: [{ id: 'z', subject: 'italien', level: '5e', title: 'Z', questions: [{ id: 'q', type: 'short', q: 'a', answer: 'b' }], lesson: [], keyPoints: [], scores: [] }] } });
  check('migration : questions de langue marquées avec leur langue', h4.t.db.courses[0].questions[0].lang === 'it-IT');
  check('vercel.json : micro autorisé seulement pour le site', /microphone=\(self\)/.test(fs.readFileSync(__dirname + '/../vercel.json', 'utf8')));
  check('aucune erreur JS', h.errors.length === 0 && h2.errors.length === 0, h.errors.concat(h2.errors).join('|'));
  done();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
