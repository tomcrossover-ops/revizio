/* Révizio — moteur d'exercices : QCM, vrai/faux, réponse courte, texte à trous, calcul mental, association, classement.
   Chaque exercice : consigne, indice facultatif, 1 ou 2 tentatives, correction immédiate (l'explication est ajoutée par l'écran appelant).
   renderExercise(q, body, done) dessine l'exercice dans `body` et appelle done(ok, {tries, hint}) quand l'élève a fini. */
'use strict';

const EX_LABEL = { qcm: 'QCM', short: 'Réponse courte', trous: 'Texte à trous', calcul: 'Calcul mental', assoc: 'Association', ordre: 'Classement' };
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
  return [q.answer, ...(q.accept || [])].some(c => { const n = normAns(c); return n && (n === m || stripArticle(n) === stripArticle(m)); });
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
const qHtml = q => esc(q.q).replace(/_{2,}/g, '<span class="blank">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>');
const levelDots = q => (q.level ? `<span class="muted" title="Difficulté" aria-label="Difficulté ${q.level} sur 3">${'●'.repeat(q.level)}${'○'.repeat(3 - q.level)}</span>` : '');
/* Réponse attendue, en texte (corrections, cartes d'erreurs) */
function answerText(q) {
  if (q.type === 'qcm') return q.choices[q.answer];
  if (q.type === 'assoc') return q.pairs.map(p => `${p[0]} → ${p[1]}`).join(' ; ');
  if (q.type === 'ordre') return q.items.join(' → ');
  return String(q.answer);
}

/* ---------- Dessin d'un exercice ---------- */
function renderExercise(q, body, done) {
  let tries = 0, hinted = false, over = false;
  const end = ok => { if (over) return; over = true; done(ok, { tries, hint: hinted }); };
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

  /* --- QCM / vrai-faux : un seul essai --- */
  if (q.type === 'qcm') {
    body.innerHTML = q.choices.map((ch, k) => `<button class="choice" data-k="${k}">${esc(ch)}</button>`).join('');
    body.querySelectorAll('.choice').forEach(b => b.onclick = () => {
      const k = +b.dataset.k;
      body.querySelectorAll('.choice').forEach(x => { x.disabled = true; if (+x.dataset.k === q.answer) x.classList.add('good'); });
      if (k !== q.answer) b.classList.add('bad');
      tries = 1; end(k === q.answer);
    });
    addHint();
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
    body.innerHTML = `<input id="ans" placeholder="${q.type === 'calcul' ? 'Ton résultat…' : 'Ta réponse…'}" autocomplete="off" ${q.type === 'calcul' ? 'inputmode="decimal"' : ''}><div id="fb" class="fb" role="status"></div><button id="chk" style="margin-top:10px;width:100%">Vérifier</button>`;
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
    addHint(); body.insertBefore(hintBox, chk);
    inp.focus();
    return;
  }

  /* --- Association : relier chaque élément de gauche à sa réponse --- */
  if (q.type === 'assoc') {
    const rights = shuffle(q.pairs.map(p => p[1]));
    body.innerHTML = `<div class="card assoc">${q.pairs.map((p, i) => `<div class="arow"><span>${esc(p[0])}</span><select data-i="${i}" aria-label="${esc(p[0])}"><option value="">— choisir —</option>${rights.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('')}</select></div>`).join('')}</div>
      <div id="fb" class="fb" role="status"></div><button id="chk" style="width:100%">Vérifier</button>`;
    const sels = [...body.querySelectorAll('select')], chk = document.getElementById('chk');
    chk.onclick = () => {
      if (sels.some(s => !s.value)) { body.querySelector('#fb').innerHTML = '<span class="soft">Associe chaque élément avant de vérifier.</span>'; return; }
      tries++;
      const okRows = sels.map((s, i) => s.value === q.pairs[i][1]);
      sels.forEach((s, i) => { s.classList.toggle('good', okRows[i]); s.classList.toggle('bad', !okRows[i]); });
      if (okRows.every(Boolean)) { sels.forEach(s => { s.disabled = true; }); chk.disabled = true; body.querySelector('#fb').innerHTML = tries > 1 ? '<span class="soft">✔ Bien vu, c\'est juste à la 2e tentative !</span>' : '<span class="okmsg">✔ Bravo !</span>'; return end(tries === 1); }
      if (tries < EX_TRIES) { body.querySelector('#fb').innerHTML = '<span class="soft">Certaines associations sont à revoir (en rouge). Essaie encore !</span>'; return; }
      sels.forEach((s, i) => { s.value = q.pairs[i][1]; s.disabled = true; s.classList.remove('bad'); s.classList.add('good'); }); chk.disabled = true;
      body.querySelector('#fb').innerHTML = '<span class="soft">Voici les bonnes associations.</span>'; end(false);
    };
    addHint(); body.insertBefore(hintBox, document.getElementById('fb'));
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
        <div class="row"><button class="ghost" id="clr" ${mine.length ? '' : 'disabled'}>Effacer</button><button id="chk" ${mine.length === pool.length ? '' : 'disabled'} style="flex:1">Vérifier</button></div>`;
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
