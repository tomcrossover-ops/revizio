const { make, check, done } = require('./harness');
(async () => {
  let body = null;
  const resp = { title: 'Le passé simple', summary: 'ok', lesson: [{ title: 'Formes', content: '- a\n- b', examples: ['il chanta'] }], keyPoints: ['a'],
    cards: [{ q: 'Passé simple de chanter (il) ?', a: 'il chanta', explain: '', tag: 'definition', reversible: false }],
    questions: [{ type: 'vf', q: 'x ?', answer: true, explanation: 'y' }] };
  const fetchImpl = async (u, o) => { body = JSON.parse(o.body); return { ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(resp) }] }) }; };
  const h = make({ store: { v: 2, settings: { apiKey: 'sk-test', model: 'claude-sonnet-5-5', level: '6e' }, courses: [], cards: [], decks: [], activity: { days: [] } }, fetchImpl });
  const { w, $, $$ } = h;
  // catalogue : chaque classe/matière non vide, chapitres bien formés
  const C = h.t.CATALOG; let n = 0, bad = 0;
  for (const l of Object.keys(C)) for (const s of Object.keys(C[l])) for (const c of C[l][s]) { n++; if (!c[0] || !c[1] || c.length !== 2) bad++; if (!h.t.SUBJECTS[s]) bad++; }
  check('catalogue ' + n + ' chapitres bien formés', n > 150 && bad === 0, bad);
  await h.go('#/new');
  check('select chapitre rempli (6e maths)', $$('#chsel option').length === 11, $$('#chsel option').length);
  check('notions affichées', $('#notions').textContent.includes('Au programme'));
  check('saisie libre masquée', $('#freebox').hidden === true);
  $('#subject').value = 'francais'; h.change($('#subject'));
  const opts = $$('#chsel option').map(o => o.textContent);
  check('chapitres français', opts.some(t => t.includes('passé simple')), opts.join('|'));
  $('#level').value = '3e'; h.change($('#level'));
  check('matière conservée au changement de classe', $('#subject').value === 'francais');
  check('chapitres 3e français', $$('#chsel option').some(o => o.textContent.includes('argumentation')));
  $('#level').value = '6e'; h.change($('#level'));
  const i = $$('#chsel option').findIndex(o => o.textContent.includes('Conjugaison : passé simple'));
  $('#chsel').value = String(i); h.change($('#chsel'));
  $('#extra').value = '1er groupe';
  h.submit($('#f')); await h.wait(300);
  const txt = body && body.messages[0].content[0].text;
  check('prompt contient classe/matière/chapitre', txt && txt.includes('Classe : 6e') && txt.includes('Français') && txt.includes('Chapitre demandé : Conjugaison : passé simple'), txt);
  check('prompt contient les notions', txt && txt.includes('Notions au programme') && txt.includes('verbes en -er'), txt);
  check('prompt contient précisions', txt && txt.includes('1er groupe'));
  check('cours créé', h.t.db.courses.length === 1 && h.t.db.courses[0].level === '6e', JSON.stringify(h.t.db.courses.map(c => c.level)));
  // saisie libre
  await h.go('#/new');
  $('#chsel').value = '__free'; h.change($('#chsel'));
  check('saisie libre visible', $('#freebox').hidden === false);
  $('#chapter').value = 'Les volcans'; body = null; h.submit($('#f')); await h.wait(300);
  const t2 = body && body.messages[0].content[0].text;
  check('prompt libre sans notions', t2 && t2.includes('Chapitre demandé : Les volcans') && !t2.includes('Notions au programme'), t2);
  // matière sans catalogue (techno 6e ok ; "langues" ok) -> toutes matières ont une entrée ? 
  check('aucune erreur JS', h.errors.length === 0, h.errors.join('|'));
  done();
})();
