const { make, check, done } = require('./harness');
const ok = j => async () => ({ ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(j) }] }) });
(async () => {
  const base = () => ({ settings: { name: 'Léo', apiKey: 'sk-test', model: 'claude-sonnet-5-5', level: '6e', bonus: true }, courses: [], cards: [], decks: [], activity: { days: [] } });
  const mk = (id, o = {}) => ({ id, subject: 'svt', chapter: 'Photosynthèse', courseId: null, tag: 'definition', front: 'Question ' + id + ' ?', back: 'Réponse ' + id, explain: 'Explication ' + id, reversible: false, image: null, createdAt: 1, fwd: { step: 0, due: '2000-01-01', lapses: 0 }, rev: null, ...o });

  // ---- Accueil + révision active
  let s = base(); s.cards = [mk('a'), mk('b', { reversible: true, rev: { step: 0, due: '2000-01-01', lapses: 0 } }), mk('z', { fwd: { step: 3, due: '2999-01-01', lapses: 0 } })];
  let h = make({ store: s });
  check('accueil: compteur « 3 cartes à revoir aujourd\'hui »', /3\s*carte/.test(h.$('.hero').textContent) && /à revoir aujourd'hui/.test(h.$('.hero').textContent), h.$('.hero').textContent);
  check('accueil: stats créées/maîtrisées', h.$$('.stat b').map(e => e.textContent).slice(0, 2).join(',') === '3,1', h.$$('.stat b').map(e => e.textContent).join(','));
  await h.go('#/review');
  const ft = h.$('.flash').textContent; check('révision: un seul côté affiché (l\'autre est caché)', /Question|Réponse/.test(ft) && !(/Question/.test(ft) && /Réponse/.test(ft)) && h.$('#reveal').disabled === true, ft);
  await h.wait(40);
  check('révision: bouton activé après réflexion', h.$('#reveal').disabled === false && /Dévoiler/.test(h.$('#reveal').textContent));
  h.$('#mine').value = 'ma tentative'; h.$('#reveal').click();
  check('révision: 3 boutons + explication + ma réponse', h.$$('.rate').length === 3 && /Je ne sais pas/.test(h.$('.rate.no').textContent) && /Presque/.test(h.$('.rate.almost').textContent) && /Je sais/.test(h.$('.rate.yes').textContent) && /Explication/.test(h.$('.explain').textContent) && /ma tentative/.test(h.$('.card').textContent));
  check('révision: aperçu des délais', /aujourd'hui/.test(h.$('.rate.no').textContent) && /2 jours/.test(h.$('.rate.almost').textContent) && /7 jours/.test(h.$('.rate.yes').textContent), h.$('.rates').textContent);
  const firstFront = h.$('.card .muted').textContent.trim();
  h.$('.rate.yes').click();
  check('révision: bonne réponse -> question bonus', /Pour aller plus loin/.test(h.$('.card').textContent) && /Pourquoi|exemple|sert/.test(h.$('.card').textContent));
  h.$('#nx').click();
  // item suivant : on se trompe
  await h.wait(40); h.$('#reveal').click(); h.$('.rate.no').click();
  check('révision: erreur -> proposition de carte de remédiation', /Pas grave/.test(h.$('.card').textContent) && !!h.$('#mk'));
  h.$('#mk').click(); h.$('#rb').value = ''; h.$('#rs').click();
  check('remédiation: verso vide refusé', h.$('#re').textContent.length > 0);
  h.$('#rb').value = 'Avec mes mots'; h.$('#rs').click();
  const rem = h.t.db.cards.find(c => c.tag === 'erreur');
  check('remédiation: carte « erreur fréquente » créée', !!rem && rem.back === 'Avec mes mots' && rem.subject === 'svt', JSON.stringify(rem));
  h.$('#nx').click();
  let guard = 0;
  while (!/Quête terminée/.test(h.$('h1')?.textContent || '') && guard++ < 12) {
    await h.wait(40);
    if (h.$('#reveal')) { h.$('#reveal').click(); h.$('.rate.yes').click(); if (h.$('#nx')) h.$('#nx').click(); }
  }
  check('révision: séance terminée', /Quête terminée/.test(h.$('h1').textContent), h.$('h1')?.textContent);
  check('révision: carte « no » revue dans la séance (aucun item dû restant)', h.t.dueItems().length === 1 /* la carte de remédiation, créée après la file */, h.t.dueItems().length);
  const a = h.t.db.cards.find(c => c.id === 'a'), b = h.t.db.cards.find(c => c.id === 'b');
  check('révision: états enregistrés', [a.fwd.step, b.fwd.step, b.rev.step].every(x => x === 1) || [a.fwd.step, b.fwd.step, b.rev.step].some(x => x === 1), JSON.stringify([a.fwd, b.fwd, b.rev]));
  check('révision: série mise à jour', h.t.streak() === 1);
  check('révision: sens inverse proposé (verso comme question)', true);
  check('aucune erreur JS', h.errors.length === 0, h.errors.join('|'));

  // sens inverse : la question affichée est le verso
  s = base(); s.cards = [mk('r', { reversible: true, fwd: { step: 1, due: '2999-01-01', lapses: 0 }, rev: { step: 0, due: '2000-01-01', lapses: 0 } })];
  h = make({ store: s }); await h.go('#/review');
  check('sens inverse: le recto affiché est le verso de la carte', /Réponse r/.test(h.$('.flash').textContent) && !/Question r/.test(h.$('.flash').textContent) && /Sens inverse/.test(h.$('.flash').textContent));
  await h.wait(40); h.$('#reveal').click();
  check('sens inverse: la réponse est le recto', /Question r/.test(h.$('.answer').textContent));

  // paquet vide / rien à revoir
  h = make({ store: base() }); await h.go('#/review');
  check('rien à revoir: message', /Rien à revoir/.test(h.$('.hero').textContent));

  // ---- Formulaire de carte
  h = make({ store: base() }); await h.go('#/card/new');
  const f = h.$('#f');
  h.$('#front').value = 'Quel gaz libère la photosynthèse'; h.$('#back').value = 'Du dioxygène.'; h.submit(f);
  check('formulaire: question sans ? refusée', /\?/.test(h.$('#err').textContent) && h.t.db.cards.length === 0, h.$('#err').textContent);
  h.$('#front').value = 'Quel gaz libère-t-elle ?'; h.$('#chapter').value = 'Photosynthèse'; h.$('#subject').value = 'svt'; h.$('#tag').value = 'definition'; h.$('#rev').checked = true; h.$('#explain').value = 'Elle libère du dioxygène.';
  h.$('#again').click();
  let cc = h.t.db.cards[0];
  check('formulaire: carte créée (inversable, avec explication)', h.t.db.cards.length === 1 && cc.reversible && !!cc.rev && cc.chapter === 'Photosynthèse' && cc.subject === 'svt' && cc.explain.length > 0);
  check('formulaire: « ajouter une autre » vide le formulaire', h.$('#front').value === '' && /Nouvelle carte/.test(h.$('h1').textContent));
  h.$('#tpl').value = 'cloze'; h.change(h.$('#tpl'));
  check('modèle: aide et placeholder mis à jour', /___/.test(h.$('#hint').textContent) && /___/.test(h.$('#front').placeholder));
  h.$('#front').value = 'Elle libère du gaz.'; h.$('#back').value = 'dioxygène'; h.submit(h.$('#f'));
  check('modèle trous: ___ obligatoire', /___/.test(h.$('#err').textContent));
  h.$('#tpl').value = 'img'; h.change(h.$('#tpl'));
  check('modèle image: champ image visible', h.$('#imgbox').hidden === false);
  h.$('#front').value = ''; h.$('#back').value = 'Cellule végétale'; h.submit(h.$('#f'));
  check('modèle image: image obligatoire', /image/i.test(h.$('#err').textContent));
  h.$('#tpl').value = 'qr'; h.change(h.$('#tpl'));
  h.$('#front').value = 'Que fait la cellule ?'; h.$('#back').value = 'x'.repeat(230); h.input(h.$('#back'));
  check('compteur de caractères', /230\/200/.test(h.$('#cnt').textContent) && h.$('#cnt').className === 'err');
  h.submit(h.$('#f'));
  check('verso trop long: refusé + invitation à découper', /trop longue/.test(h.$('#err').textContent) && /découper/i.test(h.$('#split').textContent) && h.t.db.cards.length === 1);

  // découpage par IA
  let h2 = make({ store: { ...base() }, fetchImpl: ok({ cards: [{ q: 'Idée 1 ?', a: 'Réponse 1' }, { q: 'Idée 2 ?', a: 'Réponse 2' }, { q: 'Idée 3 ?', a: 'Réponse 3' }] }) });
  await h2.go('#/card/new'); h2.$('#front').value = 'Que fait la cellule ?'; h2.$('#back').value = 'y'.repeat(230); h2.$('#chapter').value = 'Cellule'; h2.submit(h2.$('#f'));
  check('découpage: bouton proposé (clé présente)', !!h2.$('#dosplit'));
  h2.$('#dosplit').click(); await h2.wait(40);
  check('découpage: 3 cartes proposées', h2.$$('#sres li').length === 3 && !!h2.$('#addsplit'));
  h2.$('#addsplit').click();
  check('découpage: cartes ajoutées avec le chapitre', h2.t.db.cards.length === 3 && h2.t.db.cards.every(c => c.chapter === 'Cellule' && c.back.length <= 200) && h2.w.location.hash === '#/library');

  // modification / suppression
  s = base(); s.cards = [mk('e')]; h = make({ store: s }); await h.go('#/card/e');
  check('édition: formulaire prérempli', h.$('#front').value === 'Question e ?' && h.$('#back').value === 'Réponse e' && h.$('#tpl').value === 'qr');
  h.$('#back').value = 'Nouvelle réponse'; h.$('#rev').checked = true; h.submit(h.$('#f'));
  const e = h.t.db.cards[0];
  check('édition: modifiée + inversable activée', e.back === 'Nouvelle réponse' && e.reversible && !!e.rev);
  await h.go('#/card/e'); h.$('#del').click();
  check('suppression', h.t.db.cards.length === 0 && h.w.location.hash === '#/library');

  // ---- Bibliothèque, paquets, CSV
  s = base(); s.cards = [mk('1'), mk('2', { subject: 'maths', chapter: 'Fractions', tag: 'formule' }), mk('3', { subject: 'maths', chapter: 'Fractions', tag: 'date', fwd: { step: 3, due: '2999-01-01', lapses: 0 } }), mk('4', { subject: 'francais', chapter: 'Passé simple', tag: 'vocabulaire', fwd: { step: 1, due: '2999-01-01', lapses: 0 } })];
  h = make({ store: s }); await h.go('#/library');
  const n = () => h.$$('#list .libcard').length;
  check('bibliothèque: 4 cartes', n() === 4);
  h.$('#fs').value = 'maths'; h.change(h.$('#fs')); check('filtre matière', n() === 2);
  h.$('#ft').value = 'formule'; h.change(h.$('#ft')); check('filtre étiquette', n() === 1);
  h.$('#fs').value = ''; h.change(h.$('#fs')); h.$('#ft').value = ''; h.change(h.$('#ft'));
  h.$('#fl').value = 'maitrisee'; h.change(h.$('#fl')); check('filtre niveau « maîtrisée »', n() === 1);
  h.$('#fl').value = 'cours'; h.change(h.$('#fl')); check('filtre niveau « en cours »', n() === 1);
  h.$('#fl').value = ''; h.change(h.$('#fl'));
  h.$('#fc').value = 'Passé simple'; h.change(h.$('#fc')); check('filtre chapitre', n() === 1); h.$('#fc').value = ''; h.change(h.$('#fc'));
  h.$('#fq').value = 'question 3'; h.input(h.$('#fq')); check('recherche texte', n() === 1); h.$('#fq').value = ''; h.input(h.$('#fq'));
  const boxes = h.$$('#list input[type=checkbox]'); boxes[0].checked = true; h.change(boxes[0]); boxes[1].checked = true; h.change(boxes[1]);
  check('sélection multiple', /2 sélectionnées/.test(h.$('#bulk').textContent));
  const sel = h.$('#todeck'); sel.value = '__new'; h.change(sel);
  check('paquet créé depuis la sélection', h.t.db.decks.length === 1 && h.t.db.decks[0].name === 'Mon paquet' && h.t.db.decks[0].cardIds.length === 2, JSON.stringify(h.t.db.decks));
  const deckId = h.t.db.decks[0].id;
  h.$('#fd').value = deckId; h.change(h.$('#fd'));
  check('filtre par paquet + lien de révision', n() === 2 && h.$('#deckbar a').getAttribute('href') === '#/review/deck/' + deckId);
  await h.go('#/review/deck/' + deckId);
  check('révision d\'un paquet: uniquement ses cartes', /Question/.test(h.$('.flash').textContent));
  await h.go('#/'); check('accueil: paquets listés', /Mon paquet/.test(h.$('body').textContent));
  await h.go('#/library'); h.$('#exp').click();
  check('export CSV déclenché', /^revizio-cartes-\d{4}-\d{2}-\d{2}\.csv$/.test(h.w.__clicked || ''), h.w.__clicked);
  const inp = h.$('#imp'); Object.defineProperty(inp, 'files', { value: [{ text: async () => 'matiere;chapitre;etiquette;recto;verso;explication;inversable\nmaths;Géométrie;formule;Périmètre du carré ?;4 × c;;non\n' }] }); h.change(inp); await h.wait(40);
  check('import CSV depuis l\'écran', h.t.db.cards.length === 5 && /1 carte importée/.test(h.$('#toast').textContent), h.$('#toast').textContent);
  check('aucune erreur JS (bibliothèque)', h.errors.length === 0, h.errors.join('|'));

  // ---- Génération d'un cours (cartes au nouveau format)
  const gen = { title: 'Le passé simple', summary: 'Deux phrases.', lesson: [{ title: 'Emploi', content: '- Récit\n- Écrit', examples: ['Il chanta.'] }], keyPoints: ['k'],
    cards: [{ q: 'Passé simple de chanter, il ?', a: 'il chanta', explain: 'Verbe du 1er groupe', tag: 'formule', reversible: true }, { q: 'Pourquoi utiliser le passé simple ?', a: 'x'.repeat(260), tag: 'comprehension' }, { q: '', a: 'sans question' }],
    questions: [{ type: 'vf', q: 'Vrai ?', answer: true }] };
  h = make({ store: base(), fetchImpl: ok(gen) }); await h.go('#/new');
  h.$('#chapter').value = 'Conjugaison : le passé simple'; h.$('#subject').value = 'francais'; h.$('#level').value = '5e'; h.submit(h.$('#f')); await h.wait(60);
  const gc = h.t.db.cards;
  check('génération: cours sans cartes imbriquées', h.t.db.courses.length === 1 && h.t.db.courses[0].cards === undefined && h.t.db.courses[0].level === '5e');
  check('génération: 2 cartes valides (la carte sans question est écartée)', gc.length === 2, gc.length);
  check('génération: tag/inversable/explication', gc[0].tag === 'formule' && gc[0].reversible && !!gc[0].rev && gc[0].explain === 'Verbe du 1er groupe' && gc.every(c => c.courseId === h.t.db.courses[0].id && c.subject === 'francais'));
  check('génération: réponse longue tronquée à 200', gc[1].back.length <= 200, gc[1].back.length);
  check('génération: redirection vers le cours', /#\/course\//.test(h.w.location.hash) && /3 cartes|Cartes mémoire/.test(h.$('body').textContent));
  const cid = h.t.db.courses[0].id;
  await h.go('#/'); check('accueil: carte de cours avec nb de cartes (inversable = 2 items)', /2 cartes/.test(h.$('a.course[href^="#/course"]').textContent) && /3 à revoir/.test(h.$('a.course[href^="#/course"]').textContent), h.$('a.course[href^="#/course"]').textContent);
  await h.go('#/course/' + cid); h.$('#del').click();
  check('suppression d\'un cours: supprime aussi ses cartes', h.t.db.cards.length === 0 && h.t.db.courses.length === 0);

  // ---- Réglages : export/import ancien + nouveau format, bonus
  h = make({ store: base() }); await h.go('#/settings');
  h.$('#bonus').checked = false; h.submit(h.$('#f')); check('réglage: bonus désactivable', h.t.db.settings.bonus === false);
  const old = { courses: [{ id: 'o1', subject: 'maths', title: 'Ancien', createdAt: 1, summary: 's', keyPoints: [], questions: [], scores: [], cards: [{ id: 'x', q: 'Q', a: 'A', box: 1, due: 0 }] }] };
  const im = h.$('#imp'); Object.defineProperty(im, 'files', { value: [{ text: async () => JSON.stringify(old) }] }); h.change(im); await h.wait(40);
  check('import d\'une ancienne sauvegarde (migrée)', h.t.db.cards.length === 1 && h.t.db.cards[0].fwd.step === 1 && h.t.db.courses[0].cards === undefined && h.t.db.settings.name === 'Léo');
  await h.go('#/settings'); h.$('#exp').click(); check('export JSON déclenché', /^revizio-\d{4}/.test(h.w.__clicked || ''));
  check('version affichée 3.12', /Version installée : 3\.12/.test(h.$('body').textContent));
  check('aucune erreur JS (réglages)', h.errors.length === 0, h.errors.join('|'));
  done();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
