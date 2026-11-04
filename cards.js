/* Révizio — écrans des cartes : révision active, création, bibliothèque/paquets. */
'use strict';

const $app = document.getElementById('app');
const sideHtml = s => (safeImg(s.image) ? `<img class="cimg" src="${safeImg(s.image)}" alt="">` : '') + (s.text ? `<div>${esc(s.text)}</div>` : '');
function sides(card, dir) {
  const f = { text: card.front, image: card.image }, b = { text: card.back, image: null };
  return dir === 'fwd' ? { q: f, a: b } : { q: b, a: f };
}
const BONUS = ['Pourquoi ? Explique avec tes mots.', 'Donne un exemple.', 'À quoi cela sert-il ?'];

/* ---------- Révision active ---------- */
function viewReview(scope, id, opts = {}) {
  let filter = () => true, title = 'Révision du jour', backHref = '#/';
  if (scope === 'course') {
    const c = getCourse(id); if (!c) { location.hash = '#/'; return; }
    filter = x => x.courseId === id; title = c.title; backHref = '#/course/' + id;
  } else if (scope === 'subject') {
    if (!SUBJECTS[id]) { location.hash = '#/'; return; }
    filter = x => x.subject === id; title = subj(id).label;
  } else if (scope === 'smart') {
    title = 'Session du jour'; backHref = '#/daily';
  } else if (scope === 'deck') {
    const d = db.decks.find(x => x.id === id); if (!d) { location.hash = '#/'; return; }
    filter = x => d.cardIds.includes(x.id); title = d.name; backHref = '#/library';
  }
  let queue = scope === 'smart' ? shuffle(smartPlan().items) : shuffle(dueItems(filter));
  if (opts.limit) queue = queue.slice(0, opts.limit); // parcours guidé : quelques cartes clés seulement
  const total = queue.length, pathCourse = opts.path && scope === 'course' ? getCourse(id) : null;
  const res = { yes: 0, almost: 0, no: 0 }; let resolved = 0, timer = null, cur = null;
  if (!total) {
    if (pathCourse) { pathCourse.path = Object.assign(pathCourse.path || {}, { cards: true }); save(); }
    $app.innerHTML = `<h1>${esc(title)}</h1><div class="card hero"><div class="big">✨</div><div>Rien à revoir aujourd'hui. Reviens demain !</div></div><div class="row">${pathCourse && pathCourse.questions.length ? `<a class="btn" href="#/quiz/${id}">Passer au test</a>` : ''}<a class="btn ghost" href="${backHref}">Retour</a></div>`;
    return;
  }
  const chips = card => `${subjChip(card.subject)} ${tagChip(card.tag)}${card.chapter ? ` <span class="muted">${esc(card.chapter)}</span>` : ''}`;
  const head = () => `<div class="row between"><span class="muted">${resolved + 1} / ${total}</span><span>${cur ? chips(cur) : ''}</span></div>
    <div class="bar" style="margin:8px 0"><i style="width:${resolved / total * 100}%"></i></div>`;

  const show = () => {
    clearTimeout(timer);
    if (!queue.length) return end();
    const { card, dir } = queue[0], sd = sides(card, dir);
    cur = card;
    $app.innerHTML = `${head()}
      <div class="card flash vis" style="--sc:${subj(card.subject).color}"><div><div class="bigemoji">${esc(cardEmoji(card))}</div>${sideHtml(sd.q)}${dir === 'rev' ? '<div class="muted" style="margin-top:12px">Sens inverse : retrouve ce qui correspond.</div>' : ''}</div></div>
      <textarea id="mine" rows="2" placeholder="Ta réponse… dans ta tête, à voix haute, ou écris-la ici"></textarea>
      <button id="reveal" style="width:100%;margin-top:10px" disabled>Réfléchis… 2</button>`;
    let n = 2;
    const tick = () => {
      const b = document.getElementById('reveal'); if (!b) return;
      if (--n > 0) { b.textContent = `Réfléchis… ${n}`; timer = setTimeout(tick, 1000); }
      else { b.disabled = false; b.textContent = 'Dévoiler la réponse'; }
    };
    timer = setTimeout(tick, 1000);
    document.getElementById('reveal').onclick = () => reveal(card, dir, document.getElementById('mine').value.trim());
  };

  const reveal = (card, dir, mine) => {
    const sd = sides(card, dir), s = stateOf(card, dir);
    $app.innerHTML = `${head()}
      <div class="card vis" style="--sc:${subj(card.subject).color}">
        <div class="bigemoji sm">${esc(cardEmoji(card))}</div>
        <div class="muted">${sideHtml(sd.q)}</div><hr>
        <div class="answer">${sideHtml(sd.a)}</div>
        ${card.explain ? `<div class="explain">${esc(card.explain)}</div>` : ''}
        ${mine ? `<div class="muted">Ta réponse : ${esc(mine)}</div>` : ''}
      </div>
      <p class="muted center">Sois honnête avec toi-même : c'est comme ça que tu progresses.</p>
      <div class="rates">
        <button class="rate no" data-r="no">Je ne sais pas<small>${previewLabel(s, 'no')}</small></button>
        <button class="rate almost" data-r="almost">Presque<small>${previewLabel(s, 'almost')}</small></button>
        <button class="rate yes" data-r="yes">Je sais<small>${previewLabel(s, 'yes')}</small></button>
      </div>`;
    document.querySelectorAll('.rate').forEach(b => b.onclick = () => rate(card, dir, b.dataset.r));
  };

  const rate = (card, dir, r) => {
    gradeItem(card, dir, r); save();
    queue.shift(); res[r]++;
    if (r === 'no') { queue.push({ card, dir }); return afterNo(card, dir); }
    resolved++;
    if (r === 'yes' && db.settings.bonus !== false) return afterYes();
    show();
  };

  const afterYes = () => {
    const q = BONUS[Math.floor(Math.random() * BONUS.length)];
    $app.innerHTML = `${head()}
      <div class="card"><b>✨ Bien joué !</b><p>Pour aller plus loin : <b>${q}</b></p><p class="muted">Réponds dans ta tête ou à voix haute.</p></div>
      <button id="nx" style="width:100%">Carte suivante</button>`;
    document.getElementById('nx').onclick = show;
  };

  const afterNo = (card, dir) => {
    const sd = sides(card, dir);
    $app.innerHTML = `${head()}
      <div class="card"><b>Pas grave !</b> Tu la reverras aujourd'hui.<hr><div class="muted">À retenir</div><div class="answer">${sideHtml(sd.a)}</div></div>
      <div id="rem"></div>
      <div class="row"><button class="ghost" id="mk" style="flex:1">Créer une carte avec mes mots</button><button id="nx" style="flex:1">Carte suivante</button></div>`;
    document.getElementById('nx').onclick = show;
    document.getElementById('mk').onclick = () => {
      document.getElementById('mk').hidden = true;
      document.getElementById('rem').innerHTML = `<div class="card">
        <label>Recto</label><textarea id="rf" rows="2">${esc(sd.q.text || '')}</textarea>
        <label>Verso : la bonne réponse, avec tes mots</label><textarea id="rb" rows="2" maxlength="${MAX_BACK}"></textarea>
        <div class="row" style="margin-top:10px"><button id="rs">Enregistrer la carte</button><span id="re" class="err"></span></div></div>`;
      document.getElementById('rs').onclick = () => {
        const o = { front: document.getElementById('rf').value, back: document.getElementById('rb').value };
        const err = validateCard(o, 'free');
        if (err) { document.getElementById('re').textContent = err; return; }
        db.cards.push(newCard({ ...o, subject: card.subject, chapter: card.chapter, courseId: card.courseId, tag: 'erreur' })); save();
        document.getElementById('rem').innerHTML = '<p class="muted">✔ Carte ajoutée à tes cartes « Erreur fréquente ».</p>';
      };
    };
  };

  const end = () => {
    if (pathCourse) { pathCourse.path = Object.assign(pathCourse.path || {}, { cards: true }); save(); }
    $app.innerHTML = `<h1>${pathCourse ? 'Cartes revues ✔' : esc(tx('session_end')) + ' ✔'}</h1>
      <div class="grid"><div class="card stat"><b>${res.yes}</b><span class="muted">Je sais</span></div><div class="card stat"><b>${res.almost}</b><span class="muted">Presque</span></div><div class="card stat"><b>${res.no}</b><span class="muted">Je ne sais pas</span></div></div>
      <div class="card">🔥 ${streak()} jour${streak() > 1 ? 's' : ''} de révision de suite · ⚡ Niv. ${levelOf(db.activity.xp)}</div>
      ${recommend() ? `<div class="card"><b>Conseil :</b> ${esc(recommend())}</div>` : ''}
      <div class="row">${pathCourse && pathCourse.questions.length ? `<a class="btn" href="#/quiz/${id}">Étape 3 : tester mon niveau</a>` : ''}${scope === 'smart' && smartPlan().questions.length ? '<a class="btn" href="#/daily/quiz">Continuer : mini-quiz</a>' : ''}<a class="btn ${(scope === 'smart' && smartPlan().questions.length) || (pathCourse && pathCourse.questions.length) ? 'ghost' : ''}" href="${backHref}">Retour</a></div>`;
  };
  show();
}

/* ---------- Création / modification d'une carte ---------- */
function viewCardForm(id) {
  const editing = id !== 'new' ? getCard(id) : null;
  if (id !== 'new' && !editing) { location.hash = '#/library'; return; }
  const c = editing || { subject: db.settings.lastSubject || 'maths', chapter: '', tag: 'definition', front: '', back: '', explain: '', reversible: false, image: null };
  let template = editing ? guessTemplate(editing) : 'qr', image = c.image || null;
  const chapters = [...new Set(db.cards.map(x => x.chapter).filter(Boolean))];
  $app.innerHTML = `
    <h1>${editing ? 'Modifier la carte' : 'Nouvelle carte'}</h1>
    <form id="f" class="card">
      <label>Modèle</label>
      <select id="tpl">${Object.entries(TEMPLATES).map(([k, v]) => `<option value="${k}" ${k === template ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
      <div class="muted" id="hint"></div>
      <div class="row2">
        <div><label>Matière</label><select id="subject">${Object.entries(SUBJECTS).map(([k, v]) => `<option value="${k}" ${k === c.subject ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
        <div><label>Étiquette</label><select id="tag">${Object.entries(TAGS).map(([k, v]) => `<option value="${k}" ${k === c.tag ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      </div>
      <label>Chapitre / thème</label>
      <input id="chapter" list="chs" value="${esc(c.chapter)}" placeholder="Ex. Photosynthèse" autocomplete="off">
      <datalist id="chs">${chapters.map(x => `<option value="${esc(x)}">`).join('')}</datalist>
      <div id="imgbox" hidden><label>Image</label><input id="file" type="file" accept="image/*"><img id="prev" class="cimg" alt="" ${image ? `src="${safeImg(image)}"` : 'hidden'}></div>
      <label>Recto (la question)</label>
      <textarea id="front" rows="2">${esc(c.front)}</textarea>
      <label>Verso (la réponse) <span class="muted" id="cnt"></span></label>
      <textarea id="back" rows="2">${esc(c.back)}</textarea>
      <label>Explication courte (facultatif)</label>
      <input id="explain" value="${esc(c.explain)}" maxlength="220">
      <label>Émoji pour illustrer (facultatif)</label>
      <input id="emoji" value="${esc(c.emoji || '')}" placeholder="Ex. 🌱☀️" maxlength="12" autocomplete="off" style="max-width:9em">
      <label class="check"><input type="checkbox" id="rev" ${c.reversible ? 'checked' : ''}> Carte inversable : réviser aussi du verso vers le recto</label>
      <div id="err" class="err"></div>
      <div id="split"></div>
      <div class="row" style="margin-top:12px">
        <button type="submit">Enregistrer</button>
        ${editing ? '' : '<button type="button" class="ghost" id="again">Enregistrer et ajouter une autre</button>'}
        ${editing ? '<button type="button" class="danger" id="del">Supprimer</button>' : ''}
        <a class="btn ghost" href="#/library">Annuler</a>
      </div>
    </form>`;
  const $ = s => document.getElementById(s);
  const applyTemplate = () => {
    const t = TEMPLATES[template];
    $('hint').textContent = t.hint; $('front').placeholder = t.front; $('back').placeholder = t.back;
    $('imgbox').hidden = template !== 'img';
  };
  const counter = () => { const n = $('back').value.length; $('cnt').textContent = `${n}/${MAX_BACK}`; $('cnt').className = n > MAX_BACK ? 'err' : 'muted'; };
  $('tpl').onchange = () => { template = $('tpl').value; applyTemplate(); };
  $('back').oninput = counter; applyTemplate(); counter();
  $('file').onchange = async ev => {
    const f = ev.target.files[0]; if (!f) return;
    try { image = await imageToJpeg(f, 480, 0.72); $('prev').src = image; $('prev').hidden = false; } catch (e) { $('err').textContent = 'Image illisible.'; }
  };
  const read = () => ({
    subject: $('subject').value, tag: $('tag').value, chapter: $('chapter').value, front: $('front').value, back: $('back').value,
    explain: $('explain').value, emoji: $('emoji').value, reversible: $('rev').checked, image: template === 'img' ? image : null,
  });
  const offerSplit = () => {
    const box = $('split');
    if (!hasAI()) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="card"><b>Carte trop longue ?</b> Une carte = une seule idée.<div class="row" style="margin-top:8px"><button type="button" id="dosplit">Découper en plusieurs cartes</button><span id="sst"></span></div><div id="sres"></div></div>';
    $('dosplit').onclick = async () => {
      $('dosplit').disabled = true; $('sst').innerHTML = '<span class="spinner"></span>';
      try {
        const o = read();
        const r = await askJSON(`Matière : ${subj(o.subject).label}\nChapitre : ${o.chapter}\nRecto : ${o.front}\nVerso : ${o.back}`, SYSTEM_SPLIT, 1500);
        const parts = (r.cards || []).filter(x => x && x.q && x.a).map(x => ({ front: clip(x.q, 200), back: clip(x.a, MAX_BACK) }));
        if (!parts.length) throw new Error('Rien à proposer, raccourcis la réponse à la main.');
        $('sst').textContent = '';
        $('sres').innerHTML = `<ul class="points">${parts.map(p => `<li><b>${esc(p.front)}</b><br>${esc(p.back)}</li>`).join('')}</ul><button type="button" id="addsplit">Ajouter ces ${parts.length} cartes</button>`;
        $('addsplit').onclick = () => {
          parts.forEach(p => db.cards.push(newCard({ ...o, ...p, explain: '', reversible: false }))); save();
          toast(`${parts.length} cartes ajoutées ✔`); location.hash = '#/library';
        };
      } catch (e) { $('sst').innerHTML = `<span class="err">${esc(e.message)}</span>`; $('dosplit').disabled = false; }
    };
  };
  const submit = again => {
    const o = read(), err = validateCard(o, template);
    $('err').textContent = err; $('split').innerHTML = '';
    if (err) { if (o.back.trim().length > MAX_BACK) offerSplit(); return; }
    db.settings.lastSubject = o.subject;
    if (editing) {
      Object.assign(editing, { ...o, emoji: cleanEmoji(o.emoji), front: o.front.trim(), back: o.back.trim(), explain: o.explain.trim(), chapter: o.chapter.trim(), image: safeImg(o.image) || null });
      if (editing.reversible && !editing.rev) editing.rev = freshState();
      if (!editing.reversible) editing.rev = null;
    } else db.cards.push(newCard(o));
    save(); toast('Carte enregistrée ✔');
    if (again) { viewCardForm('new'); } else location.hash = '#/library';
  };
  $('f').onsubmit = ev => { ev.preventDefault(); submit(false); };
  if ($('again')) $('again').onclick = () => submit(true);
  if ($('del')) $('del').onclick = () => { if (confirm('Supprimer cette carte ?')) { removeCards([editing.id]); save(); location.hash = '#/library'; } };
}

/* ---------- Bibliothèque : tri, paquets, CSV ---------- */
const lib = { subject: '', chapter: '', tag: '', level: '', deck: '', q: '', limit: 50 };
const picked = new Set();
function viewLibrary() {
  const $ = s => document.getElementById(s);
  const chapters = [...new Set(db.cards.map(c => c.chapter).filter(Boolean))].sort();
  const opt = (v, label, cur) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(label)}</option>`;
  $app.innerHTML = `
    <div class="row between"><h1>Mes cartes</h1><a class="btn" href="#/card/new">+ Carte</a></div>
    <div class="card">
      <div class="row2">
        <select id="fs">${opt('', 'Toutes les matières', lib.subject)}${Object.entries(SUBJECTS).map(([k, v]) => opt(k, v.label, lib.subject)).join('')}</select>
        <select id="fc">${opt('', 'Tous les chapitres', lib.chapter)}${chapters.map(x => opt(x, x, lib.chapter)).join('')}</select>
        <select id="ft">${opt('', 'Toutes les étiquettes', lib.tag)}${Object.entries(TAGS).map(([k, v]) => opt(k, v, lib.tag)).join('')}</select>
        <select id="fl">${opt('', 'Tous les niveaux', lib.level)}${Object.entries(MASTERY).map(([k, v]) => opt(k, v, lib.level)).join('')}</select>
        <select id="fd">${opt('', 'Tous les paquets', lib.deck)}${db.decks.map(d => opt(d.id, `Paquet : ${d.name}`, lib.deck)).join('')}</select>
        <input id="fq" type="search" placeholder="Rechercher…" value="${esc(lib.q)}">
      </div>
      <div id="deckbar"></div>
    </div>
    <div id="bulk" class="card row between"></div>
    <div id="list"></div>
    <h2>Paquets, import et export</h2>
    <div class="card row">
      <button class="ghost" id="newdeck">Créer un paquet</button>
      <button class="ghost" id="exp">Exporter en CSV</button>
      <label class="btn ghost" style="margin:0">Importer un CSV<input id="imp" type="file" accept=".csv,text/csv" hidden></label>
      <div class="muted" style="flex-basis:100%">Colonnes : matiere ; chapitre ; etiquette ; recto ; verso ; explication ; inversable (oui/non). Les images ne sont pas exportées.</div>
    </div>`;
  const filtered = () => {
    const q = normText(lib.q), deck = db.decks.find(d => d.id === lib.deck);
    return db.cards.filter(c => (!lib.subject || c.subject === lib.subject) && (!lib.chapter || c.chapter === lib.chapter) && (!lib.tag || c.tag === lib.tag)
      && (!lib.level || cardLevel(c) === lib.level) && (!deck || deck.cardIds.includes(c.id))
      && (!q || normText(`${c.front} ${c.back} ${c.chapter}`).includes(q)));
  };
  const renderList = () => {
    const all = filtered(), shown = all.slice(0, lib.limit), deck = db.decks.find(d => d.id === lib.deck);
    $('list').innerHTML = shown.length ? shown.map(c => {
      const lv = cardLevel(c);
      return `<div class="card libcard"><label class="check"><input type="checkbox" data-id="${c.id}" ${picked.has(c.id) ? 'checked' : ''}></label>
        <a href="#/card/${c.id}" class="libtxt"><b>${esc(cardEmoji(c))} ${esc(c.front || '🖼 Image')}</b><div class="muted">${esc(c.back)}</div>
        <div>${subjChip(c.subject)} ${tagChip(c.tag)} <span class="chip lv-${lv}">${MASTERY[lv]}</span>${c.reversible ? ' <span class="chip">⇄</span>' : ''}${c.chapter ? ` <span class="muted">${esc(c.chapter)}</span>` : ''}</div></a></div>`;
    }).join('') + (all.length > shown.length ? `<button class="ghost" id="more" style="width:100%">Afficher plus (${all.length - shown.length})</button>` : '')
      : `<div class="card muted">${db.cards.length ? 'Aucune carte avec ces filtres.' : 'Aucune carte pour l\'instant. Crée-en une, génère un cours, ou importe un CSV.'}</div>`;
    $('list').querySelectorAll('input[type=checkbox]').forEach(cb => cb.onchange = () => { cb.checked ? picked.add(cb.dataset.id) : picked.delete(cb.dataset.id); renderBulk(); });
    if ($('more')) $('more').onclick = () => { lib.limit += 50; renderList(); };
    $('deckbar').innerHTML = deck ? `<div class="row" style="margin-top:10px"><b>Paquet « ${esc(deck.name)} »</b> <span class="muted">${deck.cardIds.length} cartes</span>
      <a class="btn" href="#/review/deck/${deck.id}">Réviser ce paquet</a><button class="danger" id="deldeck">Supprimer le paquet</button></div>` : '';
    if ($('deldeck')) $('deldeck').onclick = () => { if (confirm('Supprimer ce paquet ? Les cartes sont conservées.')) { db.decks = db.decks.filter(d => d.id !== deck.id); lib.deck = ''; save(); viewLibrary(); } };
    renderBulk(all);
  };
  const renderBulk = all => {
    const n = picked.size;
    $('bulk').innerHTML = `<span>${all ? `${all.length} carte${all.length > 1 ? 's' : ''}` : ''} ${n ? `· <b>${n} sélectionnée${n > 1 ? 's' : ''}</b>` : ''}</span>
      <span class="row"><button class="ghost" id="all">Tout sélectionner</button>${n ? `<select id="todeck"><option value="">Ajouter au paquet…</option>${db.decks.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}<option value="__new">+ Nouveau paquet…</option></select><button class="danger" id="delsel">Supprimer</button>` : ''}</span>`;
    $('all').onclick = () => { filtered().forEach(c => picked.add(c.id)); renderList(); };
    if ($('todeck')) $('todeck').onchange = ev => {
      let deck = db.decks.find(d => d.id === ev.target.value);
      if (ev.target.value === '__new') { const name = (prompt('Nom du paquet ?', '') || '').trim(); if (!name) { ev.target.value = ''; return; } deck = { id: uid(), name, cardIds: [] }; db.decks.push(deck); }
      if (!deck) return;
      picked.forEach(i => { if (!deck.cardIds.includes(i)) deck.cardIds.push(i); });
      save(); toast(`Ajouté au paquet « ${deck.name} » ✔`); picked.clear(); viewLibrary();
    };
    if ($('delsel')) $('delsel').onclick = () => { if (confirm(`Supprimer ${picked.size} carte(s) ?`)) { removeCards([...picked]); picked.clear(); save(); viewLibrary(); } };
  };
  const bind = (id, key) => { $(id).onchange = () => { lib[key] = $(id).value; lib.limit = 50; renderList(); }; };
  bind('fs', 'subject'); bind('fc', 'chapter'); bind('ft', 'tag'); bind('fl', 'level'); bind('fd', 'deck');
  $('fq').oninput = () => { lib.q = $('fq').value; lib.limit = 50; renderList(); };
  $('newdeck').onclick = () => {
    const name = (prompt('Nom du paquet ? (ex. Contrôle de vendredi)', '') || '').trim(); if (!name) return;
    db.decks.push({ id: uid(), name, cardIds: [...picked] }); save(); toast(`Paquet « ${name} » créé ✔`); picked.clear(); viewLibrary();
  };
  $('exp').onclick = () => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([toCSV(filtered())], { type: 'text/csv;charset=utf-8' }));
    a.download = `revizio-cartes-${today()}.csv`; a.click();
  };
  $('imp').onchange = async ev => {
    try {
      const r = importCSV(await ev.target.files[0].text()); save();
      toast(`${r.added} carte${r.added > 1 ? 's' : ''} importée${r.added > 1 ? 's' : ''}${r.skipped ? `, ${r.skipped} ignorée${r.skipped > 1 ? 's' : ''}` : ''}`); viewLibrary();
    } catch (e) { toast('Fichier CSV illisible.'); }
  };
  renderList();
}
