/* Révizio — moteur d'exercices : QCM, vrai/faux, réponse courte, texte à trous, calcul mental, association, classement.
   Chaque exercice : consigne, indice facultatif, 1 ou 2 tentatives, correction immédiate (l'explication est ajoutée par l'écran appelant).
   renderExercise(q, body, done) dessine l'exercice dans `body` et appelle done(ok, {tries, hint}) quand l'élève a fini. */
'use strict';

const EX_LABEL = { qcm: 'QCM', short: 'Réponse courte', trous: 'Texte à trous', calcul: 'Calcul mental', assoc: 'Association', ordre: 'Classement', repete: 'Prononciation' };
const exLabel = q => (q.ecoute ? '🎧 Écoute · ' : '') + (EX_LABEL[q.type] || '');
const EX_TRIES = 2; // tentatives pour les réponses saisies, l'association et le classement

/* ---------- Comparaison de réponses ---------- */
const stripArticle = s => s.replace(/^(le|la|les|l|un|une|des|du|de la|d|au|aux)\s+/, '');
const normAns = s => normText(s).replace(/\b(\d+)\s+(?=\d{3}\b)/g, '$1');
function parseNum(s) {
  const n = Number(String(s ?? '').replace(/\s/g, '').replace(',', '.').replace(/[^0-9.\-+]/g, ''));
  return Number.isFinite(n) && /\d/.test(String(s)) ? n : null;
}
/* La réponse saisie correspond-elle à la réponse attendue (ou à une variante acceptée) ? */
function sameAnswer(mine, q) {
  if (q.type === 'calcul') {
    const a = parseNum(mine), b = parseNum(q.answer);
    return a !== null && b !== null && Math.abs(a - b) < 1e-9;
  }
  const m = normAns(mine);
  if (!m) return false;
  return [q.answer, ...(q.accept || [])].some(c => { const n = normAns(c); return n && (n === m || stripArticle(n) === stripArticle(m) || closeEnough(stripArticle(m), stripArticle(n))); });
}
/* Variantes tolérées pour les réponses saisies : pluriel/singulier (s, x) et une faute de frappe sur un mot de 6 lettres ou plus.
   Jamais pour les nombres (« 12 » ≠ « 13 ») ni pour les mots très courts (« mais » ≠ « mai »). */
function closeEnough(a, b) {
  if (!a || !b || /\d/.test(a + b)) return false;
  if (a === b + 's' || b === a + 's' || a === b + 'x' || b === a + 'x') return Math.min(a.length, b.length) >= 4;
  if (Math.min(a.length, b.length) < 6 || Math.abs(a.length - b.length) > 1) return false;
  return editDistanceOne(a, b);
}
function editDistanceOne(a, b) {
  if (a === b) return true;
  if (a.length === b.length) { let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++d > 1) { // une transposition compte aussi
      return d === 2 && a[i - 1] === b[i] && a[i] === b[i - 1] && a.slice(i + 1) === b.slice(i + 1) && a.slice(0, i - 1) === b.slice(0, i - 1); } return true; }
  const [l, sh] = a.length > b.length ? [a, b] : [b, a];
  for (let i = 0; i < l.length; i++) if (l.slice(0, i) + l.slice(i + 1) === sh) return true;
  return false;
}
/* Une réponse courte n'est corrigée automatiquement que si une réponse précise est attendue (variantes fournies) */
const autoChecked = q => q.type === 'trous' || q.type === 'calcul' || (q.type === 'short' && Array.isArray(q.accept) && q.accept.length > 0);
/* Indice : celui de la question, sinon première lettre + nombre de lettres (jamais la réponse) */
function hintOf(q) {
  if (q.hint) return q.hint;
  if (q.type === 'trous' || q.type === 'short') {
    const a = String(q.answer).trim(); if (!a || a.length > 24) return '';
    return `Ça commence par « ${a[0]} » (${a.replace(/\s/g, '').length} lettres).`;
  }
  return '';
}
/* Énoncé : les trous « ___ » sont mis en évidence */
/* Mots étrangers connus (cartes avec « say » + questions d'écoute) : un texte entre « » qui en fait partie reçoit ses boutons d'écoute. */
let lexCache = { key: '', map: new Map() };
function foreignLex() {
  const key = db.cards.length + '|' + db.courses.length;
  if (lexCache.key === key) return lexCache.map;
  const map = new Map();
  db.cards.forEach(c => { const t = SPEECH_LANG[c.subject] && sayText(c); if (t) map.set(c.subject + '|' + normText(t), { text: t, lang: SPEECH_LANG[c.subject] }); });
  lexCache = { key, map };
  return map;
}
const langSubject = lang => Object.keys(SPEECH_LANG).find(k => SPEECH_LANG[k] === lang) || '';
function lexFind(text, lang) { const n = normText(text); return n ? foreignLex().get(langSubject(lang) + '|' + n) || null : null; }
function qHtml(q) {
  const html = String(q.q).split(/(«[^»]{1,60}»)/).map(part => {
    if (part[0] === '«' && q.lang) { const hit = lexFind(part.slice(1, -1), q.lang); return esc(part) + (hit ? sayBtnsLang(hit.text, hit.lang) : ''); }
    return esc(part).replace(/_{2,}/g, '<span class="blank">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>');
  }).join('');
  return html + (q.ecoute && q.audio ? ' ' + sayBtnsLang(q.audio, q.lang, true) : '');
}
const levelDots = q => (q.level ? `<span class="muted" title="Difficulté" aria-label="Difficulté ${q.level} sur 3">${'●'.repeat(q.level)}${'○'.repeat(3 - q.level)}</span>` : '');
/* Réponse attendue, en texte (corrections, cartes d'erreurs) */
function answerText(q) {
  if (q.type === 'qcm') return q.choices[q.answer];
  if (q.type === 'assoc') return q.pairs.map(p => `${p[0]} → ${p[1]}`).join(' ; ');
  if (q.type === 'ordre') return q.items.join(' → ');
  return String(q.answer);
}

/* ---------- Signaler une erreur (gardé sur l'appareil, copiable depuis Réglages) ---------- */
function addReportBtn(q, body) {
  if (!body.isConnected || body.querySelector('.reportbtn')) return;
  const b = document.createElement('button'); b.type = 'button'; b.className = 'ghost small reportbtn'; b.textContent = '⚠️ Signaler une erreur';
  const nx = body.querySelector('#nx'), anchor = nx ? (nx.closest('.actbar') || nx) : null;
  if (anchor && anchor.parentNode === body) body.insertBefore(b, anchor); else body.appendChild(b);
  b.onclick = () => {
    const c = db.courses.find(x => (x.questions || []).some(y => y.q === q.q));
    const list = db.settings.reports = db.settings.reports || [];
    list.push({ at: Date.now(), course: c ? c.title : '', subject: c ? c.subject : '', type: q.type, q: q.q, answer: answerText(q), explanation: q.explanation || '' });
    save(); b.disabled = true; b.textContent = 'Merci, signalé ✔'; toast('Signalé : tu pourras l\'envoyer depuis Réglages.');
  };
}

/* ---------- Dessin d'un exercice ---------- */
function renderExercise(q, body, done) {
  let tries = 0, hinted = false, over = false, kb = null;
  const end = ok => {
    if (over) return; over = true;
    body.querySelectorAll('.actbar').forEach(b => b.remove());
    if (kb) document.removeEventListener('keydown', kb);
    if (q.lang && q.type !== 'repete') { // après la réponse : écouter la bonne réponse dans la langue
      const t = q.audio || (() => { const a = q.type === 'qcm' ? q.choices[q.answer] : q.type === 'short' || q.type === 'trous' ? q.answer : ''; const h = a && lexFind(a, q.lang); return h ? h.text : ''; })();
      const b = t && sayBtnsLang(t, q.lang);
      if (b) body.insertAdjacentHTML('beforeend', `<div class="sayafter muted">Écoute la bonne réponse ${b}</div>`);
    }
    done(ok, { tries, hint: hinted });
    setTimeout(() => addReportBtn(q, body), 0); // après l'explication : « Signaler une erreur » juste avant « Suivant »
  };
  const hint = hintOf(q);
  const hintBox = document.createElement('div');
  const addHint = () => {
    if (!hint) return;
    hintBox.innerHTML = `<button type="button" class="ghost small" id="hintb">💡 Un indice</button>`;
    body.appendChild(hintBox);
    hintBox.querySelector('#hintb').onclick = () => { hinted = true; hintBox.innerHTML = `<div class="explain">💡 ${esc(hint)}</div>`; };
  };
  const retry = msg => { const n = body.querySelector('#fb'); if (n) n.innerHTML = `<span class="soft">${msg}</span>`; };
  const failMsg = '<span class="soft">Pas tout à fait. Essaie encore, tu peux t\'aider de l\'indice.</span>';

  /* --- Prononciation : écouter, répéter à voix haute, se juger (micro facultatif) --- */
  if (q.type === 'repete') {
    const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition), mic = !!(SR && db.settings.micro);
    body.innerHTML = `<div class="card repete"><div class="phrase">${esc(q.answer)}</div>${sayBtnsLang(q.answer, q.lang) || '<div class="muted">Lecture à voix haute indisponible ici.</div>'}</div>
      ${mic ? '<button type="button" class="ghost" id="mic" style="width:100%;margin-bottom:8px">🎤 Je répète (le micro écoute)</button>' : ''}
      <div id="fb" class="fb" role="status"></div><div class="muted" style="margin:6px 0">Écoute, répète à voix haute, puis juge-toi honnêtement.</div>
      <div class="row"><button class="ko" id="no" style="flex:1">À retravailler</button><button class="ok" id="yes" style="flex:1">Bien dit</button></div>`;
    const fb = body.querySelector('#fb'), mark = ok => { body.querySelectorAll('button').forEach(b => { b.disabled = true; }); tries = 1; end(ok); };
    body.querySelector('#yes').onclick = () => mark(true); body.querySelector('#no').onclick = () => mark(false);
    if (mic) body.querySelector('#mic').onclick = () => {
      let r; try { r = new SR(); } catch (e) { fb.innerHTML = '<span class="soft">Micro indisponible ici.</span>'; return; }
      r.lang = q.lang; r.interimResults = false; r.maxAlternatives = 3;
      fb.innerHTML = '<span class="soft">Je t\'écoute… parle maintenant.</span>';
      r.onresult = ev => {
        const heard = [...ev.results[0]].map(a => a.transcript), want = normText(q.answer).split(' ').filter(Boolean);
        const best = Math.max(...heard.map(h => { const w = new Set(normText(h).split(' ')); return want.length ? want.filter(x => w.has(x)).length / want.length : 0; }));
        fb.innerHTML = `<div class="card"><div class="muted">J'ai entendu</div><b>${esc(heard[0])}</b><div style="margin-top:6px">${best >= 0.8 ? '<span class="okmsg">✔ Très proche !</span>' : best >= 0.5 ? '<span class="soft">Presque. Réécoute et recommence.</span>' : '<span class="soft">Pas tout à fait. Réécoute puis réessaie (la reconnaissance se trompe aussi parfois).</span>'}</div></div>`;
      };
      r.onerror = ev => { fb.innerHTML = `<span class="soft">${ev.error === 'not-allowed' || ev.error === 'service-not-allowed' ? 'Micro refusé : autorise-le dans le navigateur, ou juge-toi sans micro.' : 'Je n\'ai rien entendu. Réessaie, ou juge-toi sans micro.'}</span>`; };
      try { r.start(); } catch (e) { /* déjà en cours */ }
    };
    return;
  }

  /* --- QCM / vrai-faux : un seul essai --- */
  if (q.type === 'qcm') {
    // l'ordre des choix est mélangé à chaque affichage (data-k garde l'indice d'origine), sauf « les deux », « aucune… »
    const fixed = q.choices.some(ch => /ci-dessus|toutes les|aucune|les deux|tous les/i.test(ch));
    const order = fixed ? q.choices.map((_, k) => k) : shuffle(q.choices.map((_, k) => k));
    const LET = 'ABCDEFGH';
    body.innerHTML = order.map((k, n) => `<button type="button" class="choice" data-k="${k}" aria-pressed="false"><span class="lt" aria-hidden="true">${LET[n] || n + 1}</span><span class="tx">${esc(q.choices[k])}</span></button>`).join('') + '<div class="actbar"><button type="button" id="ok" disabled style="width:100%">Valider ma réponse</button></div>';
    const chs = [...body.querySelectorAll('.choice')], okb = body.querySelector('#ok');
    let sel = -1;
    const pick = n => { // un tap choisit, un deuxième tap sur « Valider » confirme : on peut se corriger
      if (over) return; sel = n;
      chs.forEach((x, m) => { x.classList.toggle('sel', m === n); x.setAttribute('aria-pressed', m === n ? 'true' : 'false'); });
      okb.disabled = false; okb.textContent = 'Valider : ' + LET[n];
    };
    chs.forEach((b, n) => b.onclick = () => pick(n));
    okb.onclick = () => {
      if (sel < 0 || over) return;
      const b = chs[sel], k = +b.dataset.k;
      chs.forEach(x => { x.disabled = true; x.classList.remove('sel'); if (+x.dataset.k === q.answer) { x.classList.add('good'); x.insertAdjacentHTML('beforeend', '<span class="sr"> (bonne réponse)</span>'); } });
      if (k !== q.answer) { b.classList.add('bad'); b.insertAdjacentHTML('beforeend', '<span class="sr"> (ta réponse, incorrecte)</span>'); }
      tries = 1; end(k === q.answer);
    };
    kb = e => { // clavier : 1 à 4 (ou A à D) pour choisir, Entrée pour valider
      if (!body.isConnected) { document.removeEventListener('keydown', kb); return; }
      if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '')) return;
      const n = /^[1-8]$/.test(e.key) ? +e.key - 1 : LET.indexOf(String(e.key).toUpperCase());
      if (e.key.length === 1 && n >= 0 && n < chs.length) { pick(n); e.preventDefault(); } else if (e.key === 'Enter' && sel >= 0 && !over) { okb.click(); e.preventDefault(); }
    };
    document.addEventListener('keydown', kb);
    addHint(); if (hint) body.insertBefore(hintBox, body.querySelector('.actbar')); // l'indice reste au-dessus du bouton fixe
    return;
  }

  /* --- Réponse courte « à l'ancienne » (pas de variantes connues) : l'élève s'auto-corrige --- */
  if (!autoChecked(q) && q.type === 'short') {
    body.innerHTML = `<input id="ans" placeholder="Ta réponse…" autocomplete="off"><button id="chk" style="margin-top:10px;width:100%">Vérifier</button>`;
    document.getElementById('chk').onclick = () => {
      const mine = document.getElementById('ans').value.trim(); tries = 1;
      body.innerHTML = `<div class="card"><div class="muted">Ta réponse</div>${esc(mine) || '<i>(vide)</i>'}<div class="muted" style="margin-top:8px">Réponse attendue</div><b>${esc(q.answer)}</b></div>
        <div class="row"><button class="ko" id="no" style="flex:1">J'avais faux</button><button class="ok" id="yes" style="flex:1">J'avais juste</button></div>`;
      const mark = ok => { body.querySelectorAll('button').forEach(b => { b.disabled = true; }); end(ok); };
      document.getElementById('yes').onclick = () => mark(true);
      document.getElementById('no').onclick = () => mark(false);
    };
    return;
  }

  /* --- Texte à trous, calcul mental, réponse courte corrigée : 2 tentatives --- */
  if (autoChecked(q)) {
    body.innerHTML = `<input id="ans" placeholder="${q.type === 'calcul' ? 'Ton résultat…' : 'Ta réponse…'}" autocomplete="off" ${q.type === 'calcul' ? 'inputmode="decimal"' : ''}><div id="fb" class="fb" role="status"></div><div class="actbar"><button id="chk" style="width:100%">Vérifier</button></div>`;
    const inp = document.getElementById('ans'), chk = document.getElementById('chk');
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); chk.click(); } });
    chk.onclick = () => {
      const mine = inp.value.trim(); if (!mine) { retry('Écris une réponse d\'abord.'); return; }
      tries++;
      if (sameAnswer(mine, q)) {
        inp.disabled = chk.disabled = true; inp.classList.add('good');
        body.querySelector('#fb').innerHTML = tries > 1 ? '<span class="soft">✔ Bien vu, tu as trouvé à la 2e tentative !</span>' : '<span class="okmsg">✔ Bravo !</span>';
        return end(tries === 1);
      }
      if (tries < EX_TRIES) { body.querySelector('#fb').innerHTML = failMsg; if (hint && !hinted) { hinted = true; hintBox.innerHTML = `<div class="explain">💡 ${esc(hint)}</div>`; } inp.select(); return; }
      inp.disabled = chk.disabled = true; inp.classList.add('bad');
      if (q.type === 'calcul') { body.querySelector('#fb').innerHTML = `<div class="card"><b>La réponse attendue :</b> ${esc(q.answer)}</div>`; return end(false); }
      // la réponse peut être juste avec d'autres mots : l'élève tranche
      body.querySelector('#fb').innerHTML = `<div class="card"><div class="muted">Ta réponse</div>${esc(mine)}<div class="muted" style="margin-top:8px">Réponse attendue</div><b>${esc(q.answer)}</b></div>
        <div class="row"><button class="ko" id="no" style="flex:1">J'avais faux</button><button class="ok" id="yes" style="flex:1">Ma réponse est juste aussi</button></div>`;
      body.querySelector('#yes').onclick = () => { body.querySelectorAll('button').forEach(b => { b.disabled = true; }); end(true); };
      body.querySelector('#no').onclick = () => { body.querySelectorAll('button').forEach(b => { b.disabled = true; }); end(false); };
    };
    addHint(); body.insertBefore(hintBox, body.querySelector('#fb'));
    inp.focus();
    return;
  }

  /* --- Association : relier chaque élément de gauche à sa réponse --- */
  if (q.type === 'assoc') {
    // on touche un élément de gauche, puis sa réponse : pas de menu déroulant, de grandes cibles
    const rights = shuffle(q.pairs.map((p, i) => ({ t: p[1], i })));
    const val = q.pairs.map(() => null); let act = 0, locked = false;
    const draw = (marks) => {
      body.innerHTML = `<div class="card assoc2">${q.pairs.map((p, i) => `<button type="button" class="arow2${act === i ? ' act' : ''}${marks ? (marks[i] ? ' good' : ' bad') : ''}" data-i="${i}" ${locked ? 'disabled' : ''} aria-label="${esc(p[0])} : ${val[i] ? esc(val[i].t) : 'à associer'}"><span class="l">${esc(p[0])}</span><span class="r">${val[i] ? esc(val[i].t) : '…'}</span></button>`).join('')}</div>
        <div class="muted" style="margin:4px 0 6px">${locked ? '' : 'Touche un élément, puis sa réponse :'}</div>
        <div class="chipsrow">${rights.filter(x => !val.includes(x)).map(x => `<button type="button" class="choice" data-r="${x.i}" ${locked ? 'disabled' : ''}><span class="tx">${esc(x.t)}</span></button>`).join('')}</div>
        <div id="fb" class="fb" role="status"></div><div class="actbar"><button id="chk" style="width:100%" ${val.every(Boolean) && !locked ? '' : 'disabled'}>Vérifier</button></div>`;
      body.querySelectorAll('.arow2').forEach(b => b.onclick = () => { const i = +b.dataset.i; val[i] = null; act = i; draw(); }); // retoucher une ligne la vide
      body.querySelectorAll('[data-r]').forEach(b => b.onclick = () => {
        val[act] = rights.find(x => x.i === +b.dataset.r);
        const nx = val.findIndex(v => !v); act = nx < 0 ? act : nx; draw();
      });
      const fbMsg = body.querySelector('#fb'); if (marks === undefined && msg0) { fbMsg.innerHTML = msg0; msg0 = ''; }
      const chk = document.getElementById('chk');
      if (hint) body.insertBefore(hintBox, body.querySelector('#fb'));
      chk.onclick = () => {
        if (!val.every(Boolean)) return;
        tries++;
        const okRows = val.map((v, i) => v.t === q.pairs[i][1]);
        if (okRows.every(Boolean)) { locked = true; draw(okRows); body.querySelector('#fb').innerHTML = tries > 1 ? '<span class="soft">✔ Bien vu, c\'est juste à la 2e tentative !</span>' : '<span class="okmsg">✔ Bravo !</span>'; return end(tries === 1); }
        if (tries < EX_TRIES) { // les bonnes associations restent, on refait seulement les autres
          okRows.forEach((ok, i) => { if (!ok) val[i] = null; }); const nx = val.findIndex(v => !v); act = nx < 0 ? 0 : nx;
          msg0 = '<span class="soft">Certaines associations étaient fausses : elles sont vidées. Essaie encore !</span>'; draw(); return;
        }
        locked = true; q.pairs.forEach((p, i) => { val[i] = rights.find(x => x.i === i); });
        draw(okRows.map(() => true)); body.querySelector('#fb').innerHTML = '<span class="soft">Voici les bonnes associations.</span>'; end(false);
      };
    };
    let msg0 = '';
    addHint(); // crée le bouton d'indice une fois ; draw() le replace à chaque rafraîchissement
    draw();
    return;
  }

  /* --- Classement : toucher les éléments dans l'ordre --- */
  if (q.type === 'ordre') {
    let pool = shuffle(q.items.map((t, i) => ({ t, i }))); if (pool.length > 1 && pool.every((x, k) => x.i === k)) pool = pool.reverse();
    let mine = [];
    const draw = () => {
      body.innerHTML = `<div class="card"><div class="muted">Ma réponse (dans l'ordre)</div><ol class="mine">${mine.length ? mine.map(x => `<li>${esc(x.t)}</li>`).join('') : '<li class="muted">Touche les éléments ci-dessous…</li>'}</ol></div>
        <div class="chipsrow">${pool.filter(x => !mine.includes(x)).map(x => `<button class="choice" data-i="${x.i}">${esc(x.t)}</button>`).join('')}</div>
        <div id="fb" class="fb" role="status"></div>
        <div class="actbar"><div class="row"><button class="ghost" id="clr" ${mine.length ? '' : 'disabled'}>Effacer</button><button id="chk" ${mine.length === pool.length ? '' : 'disabled'} style="flex:1">Vérifier</button></div></div>`;
      body.querySelectorAll('.choice').forEach(b => b.onclick = () => { mine.push(pool.find(x => x.i === +b.dataset.i)); draw(); });
      document.getElementById('clr').onclick = () => { mine = []; draw(); };
      document.getElementById('chk').onclick = () => {
        tries++;
        const ok = mine.every((x, k) => x.i === k);
        if (ok) { body.querySelectorAll('button').forEach(b => { b.disabled = true; }); body.querySelector('#fb').innerHTML = tries > 1 ? '<span class="soft">✔ Bien vu, c\'est juste à la 2e tentative !</span>' : '<span class="okmsg">✔ Bravo !</span>'; return end(tries === 1); }
        if (tries < EX_TRIES) { mine = []; draw(); body.querySelector('#fb').innerHTML = '<span class="soft">Ce n\'est pas le bon ordre. Réessaie !</span>'; return; }
        body.querySelectorAll('button').forEach(b => { b.disabled = true; });
        body.querySelector('#fb').innerHTML = `<div class="card"><b>Le bon ordre :</b> ${esc(q.items.join(' → '))}</div>`; end(false);
      };
    };
    draw();
    return;
  }
  body.innerHTML = '<div class="muted">Exercice non reconnu.</div>'; end(false);
}

/* ---------- Auto-explication : comparer les mots de l'élève aux mots-clés attendus ---------- */
const STOP5 = new Set(['cette', 'comme', 'alors', 'parce', 'quand', 'leurs', 'entre', 'aussi', 'ainsi', 'donc', 'elles', 'nous', 'vous', 'sont', 'avec', 'pour', 'dans', 'plus', 'tout', 'tous', 'faire', 'fait', 'etre', 'avoir', 'peut', 'peuvent', 'celui', 'celle', 'chaque', 'autre', 'autres', 'sans', 'sous', 'dont', 'mais', 'etant', 'lorsque', 'puisque', 'quelque', 'toute', 'toutes']);
const stem = w => w.slice(0, 5);
function keywordsOf(text, max = 6) {
  const seen = new Set(), out = [];
  normText(text).split(' ').filter(w => w.length >= 5 && !STOP5.has(w) && !/^\d+$/.test(w)).forEach(w => { if (!seen.has(stem(w))) { seen.add(stem(w)); out.push(w); } });
  return out.sort((a, b) => b.length - a.length).slice(0, max);
}
/* mine = texte de l'élève, ref = explication de référence. Retourne le niveau et un message bienveillant. */
function keywordFeedback(mine, ref) {
  const words = normText(mine).split(' ').filter(Boolean);
  const kws = keywordsOf(ref), have = new Set(words.map(stem));
  const found = kws.filter(k => have.has(stem(k))), missing = kws.filter(k => !have.has(stem(k)));
  let level, msg;
  if (words.length < 3) { level = 'vide'; msg = 'Essaie d\'écrire une phrase avec tes mots, même courte : expliquer aide à retenir.'; }
  else if (!kws.length || found.length / kws.length >= 0.5) { level = 'ok'; msg = found.length ? `Très bien, tu as retrouvé l'essentiel (${found.join(', ')}) !` : 'Très bien, merci d\'avoir expliqué avec tes mots !'; }
  else if (found.length) { level = 'partiel'; msg = `Bon début ! Tu as parlé de ${found.join(', ')}. Pense aussi à : ${missing.slice(0, 3).join(', ')}.`; }
  else { level = 'rien'; msg = `Merci d'avoir essayé ! Compare avec l'explication ci-dessous et pense à : ${missing.slice(0, 3).join(', ')}.`; }
  return { level, msg, found, missing, words: words.length };
}
