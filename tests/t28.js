const { make, check, done } = require('./harness');
(async () => {
  const mkq = o => Object.assign({ explanation: 'Parce que.', skill: 'S' }, o);
  const h = make({ store: { v: 2, settings: {}, courses: [], cards: [], decks: [], activity: { days: [] } } });
  h.w.REVIZIO_NOAUTOOK = true; // test dédié : on valide nous-mêmes
  const body = h.w.document.createElement('div'); h.w.document.body.appendChild(body);
  let res = null;
  h.t.renderExercise(mkq({ type: 'qcm', q: 'Q', choices: ['a', 'b', 'c'], answer: 0 }), body, (ok, m) => { res = { ok, ...m }; });
  const ch = [...body.querySelectorAll('.choice')], okb = body.querySelector('#ok');
  check('qcm : badges A/B/C et bouton Valider désactivé au départ', ch.length === 3 && ch.every((c, i) => c.querySelector('.lt').textContent === 'ABC'[i]) && okb.disabled);
  ch[1].click();
  check('qcm : toucher un choix ne valide pas', res === null && !okb.disabled && ch[1].classList.contains('sel'));
  ch[2].click();
  check('qcm : on peut changer d\'avis avant de valider', res === null && ch[2].classList.contains('sel') && !ch[1].classList.contains('sel'));
  const goodIdx = ch.findIndex(c => c.querySelector('.tx').textContent === 'a');
  ch[goodIdx].click(); okb.click();
  check('qcm : Valider enregistre la réponse', res && res.ok === true && res.tries === 1);
  // clavier
  res = null; const b2 = h.w.document.createElement('div'); h.w.document.body.appendChild(b2);
  h.t.renderExercise(mkq({ type: 'qcm', q: 'Q2', choices: ['a', 'b'], answer: 1 }), b2, (ok, m) => { res = { ok, ...m }; });
  const c2 = [...b2.querySelectorAll('.choice')], gi = c2.findIndex(c => c.querySelector('.tx').textContent === 'b');
  const key = k => h.w.document.dispatchEvent(new h.w.KeyboardEvent('keydown', { key: k, bubbles: true }));
  key(String(gi + 1)); check('clavier : un chiffre choisit', res === null && c2[gi].classList.contains('sel'));
  key('Enter'); check('clavier : Entrée valide', res && res.ok === true);
  // majuscules supprimées
  const css = require('fs').readFileSync(__dirname + '/../styles.css', 'utf8');
  check('css : les choix ne sont pas en majuscules', !/\.choice[^{}]*\{[^}]*text-transform\s*:\s*uppercase/.test(css));
  check('css : barre d\'action fixe', /\.actbar/.test(css));
  done();
})();
