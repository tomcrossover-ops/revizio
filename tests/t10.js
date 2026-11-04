const { make, check, done } = require('./harness');
const D = (y, m, d) => new Date(y, m - 1, d, 10); // heure locale
(async () => {
  const resp = { title: 'Le passé simple', summary: 's', duration: 9, objectives: ['a'], prerequisites: [], pitfalls: ['x → y'], lesson: [{ title: 'T', content: '- a', examples: [] }], keyPoints: ['k'],
    cards: Array.from({ length: 10 }, (_, i) => ({ q: 'Carte ' + i + ' ?', a: 'Rép ' + i, explain: '', tag: 'definition', emoji: i % 2 ? '📜✨' : 'abc', reversible: false })),
    questions: [{ type: 'qcm', q: 'x ?', choices: ['a', 'b', 'c', 'd'], answer: 1, explanation: 'e', skill: 'S' }] };
  let last = null;
  const fetchImpl = async (u, o) => { last = JSON.parse(o.body); return { ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(resp) }] }) }; };
  const sched = { 1: ['maths', 'francais'], 2: ['svt', 'langues'], 3: ['histgeo'], 4: ['maths', 'physique'], 5: ['francais', 'histgeo'] };
  const h = make({ store: { v: 2, settings: { apiKey: 'sk-ant-AAAAAAAAAA', level: '6e', schedule: sched }, courses: [], cards: [], decks: [], activity: { days: [] } }, fetchImpl });
  const { w, $, $$ } = h, T = h.t, S = () => T.db.settings;

  // ---- règle de planning : 2 prochains jours de cours
  const names = d => T.prepDays(d).map(x => x.name).join('+');
  check('samedi -> lundi + mardi', names(D(2026, 11, 7)) === 'lundi+mardi', names(D(2026, 11, 7)));
  check('dimanche -> demain + mardi', names(D(2026, 11, 8)) === 'demain+mardi', names(D(2026, 11, 8)));
  check('vendredi -> lundi + mardi', names(D(2026, 11, 6)) === 'lundi+mardi', names(D(2026, 11, 6)));
  check('mercredi -> demain (jeudi) + vendredi', names(D(2026, 11, 4)) === 'demain+vendredi', names(D(2026, 11, 4)));
  check('lundi -> demain + mercredi', names(D(2026, 11, 2)) === 'demain+mercredi');
  check('week-end : matières de lundi et mardi', T.prepSubjects(D(2026, 11, 7)).join() === 'maths,francais,svt,langues', T.prepSubjects(D(2026, 11, 7)).join());
  check('mercredi : matières de jeudi et vendredi', T.prepSubjects(D(2026, 11, 4)).join() === 'maths,physique,francais,histgeo');
  check('emploi du temps vide -> rien à préparer', (() => { const e = make({ store: { v: 2, settings: {}, courses: [], cards: [], decks: [], activity: { days: [] } } }); return e.t.prepDays(D(2026, 11, 7)).length === 0; })());
  check('jour sans cours sauté (mercredi vide)', (() => { const s2 = { 1: ['maths'], 4: ['svt'] }; const e = make({ store: { v: 2, settings: { schedule: s2 }, courses: [], cards: [], decks: [], activity: { days: [] } } }); return e.t.prepDays(D(2026, 11, 2)).map(x => x.name).join('+') === 'jeudi+lundi'; })());

  // ---- émojis
  check('cleanEmoji : texte refusé', T.cleanEmoji('abc') === '' && T.cleanEmoji('🌱☀️') !== '' && T.cleanEmoji('  📜 ✨ ') === '📜✨' && T.cleanEmoji('x'.repeat(30)) === '');
  check('emoji par défaut selon l\'étiquette', T.cardEmoji({ tag: 'formule' }) === '🧮' && T.cardEmoji({ tag: 'definition', emoji: '🌱' }) === '🌱');

  // ---- profil : création
  await h.go('#/');
  check('accueil : invitation à créer le profil', !!$$('a').find(a => a.getAttribute('href') === '#/profile' && a.textContent.includes('Crée ton profil')));
  await h.go('#/profile');
  check('profil : 8 avatars, 5 jours x 7 matières', $$('.av').length === 8 && $$('.tg').length === 35 && $$('.tg.on').length === 9, $$('.tg.on').length);
  $$('.av')[2].click(); $('#name').value = 'Léo'; $('#level').value = '5e';
  const tgl = (d, k) => $$('.tg').find(b => b.dataset.d === d && b.dataset.k === k);
  tgl('1', 'svt').click(); tgl('5', 'histgeo').click();
  check('emploi du temps modifié (ajout + retrait)', S().schedule['1'].includes('svt') && !S().schedule['5'].includes('histgeo'));
  h.submit($('#f')); await h.wait(10);
  check('profil enregistré', S().name === 'Léo' && S().level === '5e' && S().avatar === '🧙' && S().profileDone === true);
  check('retour accueil + avatar', w.location.hash === '#/' && $('h1').textContent.includes('Léo') && $('h1').textContent.includes('🧙'));
  S().level = '6e'; S().schedule['5'].push('histgeo'); delete S().schedule['1']; S().schedule['1'] = ['maths', 'francais'];

  // ---- accueil : « À préparer » + « Ma semaine »
  const realDate = w.Date; // on fige « samedi 7 novembre 2026 »
  class FakeDate extends realDate { constructor(...a) { if (a.length) super(...a); else super(2026, 10, 7, 10); } static now() { return new realDate(2026, 10, 7, 10).getTime(); } }
  w.Date = FakeDate;
  await h.go('#/settings'); await h.go('#/');
  check('« À préparer pour lundi et mardi »', $('.prep h2') && $('.prep h2').textContent.includes('lundi et mardi'), $('.prep h2') && $('.prep h2').textContent);
  check('4 matières à préparer', $$('.prep-row').length === 4);
  check('grille de la semaine : 5 jours, lundi+mardi en or', $$('.wd').length === 5 && $$('.wd.prep').length === 2 && $$('.wd.prep')[0].textContent.includes('Lun'));
  const sug = $$('.prep-row a').find(a => /new\?subject=maths&ch=0/.test(a.getAttribute('href')));
  check('suggestion du 1er chapitre non travaillé', !!sug && sug.textContent.includes('Nombres entiers'), $$('.prep-row a').map(a => a.getAttribute('href')).join(' '));
  check('conseil : cours manquant', $('#app').textContent.includes('tu n\'as pas encore de cours en Maths'), $('#app').textContent.slice(0, 300));

  // ---- générateur : arrivée depuis « À préparer »
  await h.go('#/new?subject=francais&ch=3');
  check('générateur prérempli (matière + chapitre)', $('#subject').value === 'francais' && $('#chsel').selectedOptions[0].textContent.includes('Types et formes'), $('#chsel').selectedOptions[0].textContent);
  check('section « J\'ai mon cours » facultative', !!$('#own') && !!$('#files') && !!$('#text'));

  // ---- génération sans fichier
  await h.go('#/new?subject=francais&ch=6');
  h.submit($('#f')); await h.wait(300);
  let c = T.db.courses[0];
  check('cours créé (catalogue)', c && c.origin === 'generated' && c.catalogTitle === 'Conjugaison : passé simple' && c.path && !c.fromImport, JSON.stringify(c && c.catalogTitle));
  check('prompt sans fichier = texte seul', last.messages[0].content.length === 1 && last.messages[0].content[0].text.includes('Notions au programme'));
  check('cartes : émojis conservés / nettoyés', T.db.cards[0].emoji === '' && T.db.cards[1].emoji === '📜✨', T.db.cards.slice(0, 2).map(x => x.emoji).join('|'));
  check('suggestion suivante : le chapitre fait est ignoré', T.suggestChapter('6e', 'francais').title !== 'Conjugaison : passé simple');

  // ---- génération avec texte collé (import facultatif)
  await h.go('#/new?subject=francais&ch=7');
  $('#text').value = 'Le futur simple se forme avec l\'infinitif + les terminaisons -ai, -as, -a, -ons, -ez, -ont. Exemple : je chanterai.';
  h.submit($('#f')); await h.wait(300);
  c = T.db.courses[1];
  const txt = last.messages[0].content.map(b => b.text).join('\n');
  check('cours importé : texte du cours + chapitre + notions envoyés', c && c.origin === 'imported' && txt.includes('Le futur simple se forme') && txt.includes('Chapitre demandé') && txt.includes('Notions au programme'), txt.slice(0, 300));

  // ---- écran du chapitre : 4 activités, leçon facultative, parcours conseillé
  const cid = T.db.courses[0].id;
  await h.go('#/course/' + cid);
  check('chapitre : 4 activités + « Commencer » conseillé = leçon', $$('.act').length === 4 && /Commencer : Relire la leçon/.test($('a.btn.big').textContent) && $$('.act').map(a => a.getAttribute('href')).join() === `#/course/${cid}/lesson,#/review/course/${cid},#/train/${cid},#/quiz/${cid}`, $$('.act').map(a => a.getAttribute('href')).join());
  check('chapitre : retour vers la matière', $('.backlink').getAttribute('href') === '#/subject/' + T.db.courses[0].subject);
  await h.go('#/train/' + cid);
  check('entraînement accessible sans avoir lu la leçon', /Quiz d'entraînement · 1 \/ \d+/.test($('#app').textContent) && /Sans note/.test($('#app').textContent), $('#app').textContent.slice(0, 80));
  await h.go('#/course/' + cid + '/lesson');
  $('#lessondone').onclick(); await h.wait(10);
  check('leçon lue : marquée (facultatif)', T.db.courses[0].path.read === true);
  c = T.db.courses[0];
  await h.go('#/path/' + c.id + '/cards');
  check('session limitée à 8 cartes', /1 \/ 8/.test($('#app').textContent), $('#app').textContent.slice(0, 60));
  check('carte très visuelle : gros émoji + couleur matière', !!$('.flash.vis .bigemoji') && /--sc:#db2777/.test($('.flash.vis').getAttribute('style')), $('.flash') && $('.flash').outerHTML.slice(0, 160));
  for (let n = 0; n < 8; n++) { await h.wait(15); $('#reveal').disabled = false; $('#reveal').click(); $$('.rate')[2].click(); const nx = $('#nx'); if (nx) nx.click(); }
  await h.wait(10);
  check('fin des cartes : cartes marquées vues + bouton test', $('h1').textContent.startsWith('Cartes revues') && T.db.courses[0].path.cards === true && !!$$('a.btn').find(a => /#\/quiz\//.test(a.getAttribute('href'))), $('#app').textContent.slice(0, 100));

  // ---- révision par matière + priorité dans la séance
  await h.go('#/review/subject/francais');
  check('révision par matière', /\d+ \/ \d+/.test($('#app').textContent) || $('#app').textContent.includes('Rien à revoir'));
  const priorityCard = T.newCard({ subject: 'svt', front: 'Carte SVT ?', back: 'oui', courseId: null });
  const otherCard = T.newCard({ subject: 'physique', front: 'Carte physique ?', back: 'oui' });
  T.db.cards = [otherCard, priorityCard]; // physique (jeudi) vs svt (mardi) : svt est dans les 2 prochains jours de cours
  check('séance du jour : matières à préparer d\'abord', T.smartPlan().items[0].card.subject === 'svt');
  w.Date = realDate;
  check('aucune erreur JS', h.errors.length === 0, h.errors.join('|'));
  done();
})();
