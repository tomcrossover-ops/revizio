const { make, check, done } = require('./harness');
const fs = require('fs');
const pack = n => JSON.parse(fs.readFileSync(__dirname + '/../packs/' + n, 'utf8'));
function fakeSpeech(w, voices) {
  const spoken = [];
  w.SpeechSynthesisUtterance = function (text) { this.text = text; };
  w.speechSynthesis = { getVoices: () => voices, cancel() {}, speak: u => spoken.push(u) };
  return spoken;
}
(async () => {
  let h = make({ store: { v: 2, settings: { level: '5e', apiKey: '', name: 'Léo' }, courses: [], cards: [], decks: [], activity: { days: [] } } });
  const spoken = fakeSpeech(h.w, [{ lang: 'it-IT', name: 'Alice', localService: true }, { lang: 'vi-VN', name: 'An', localService: true }, { lang: 'en-GB', name: 'Daniel', localService: true }]);
  const T = h.t;
  T.importPack(pack('5e-italien.json')); T.importPack(pack('5e-vietnamien.json')); T.importPack(pack('6e-vietnamien.json'));
  const it = T.db.courses.find(c => c.subject === 'italien'), vi = T.db.courses.find(c => c.subject === 'vietnamien' && c.level === '5e');
  check('packs italien et vietnamien importés', !!it && !!vi && it.level === '5e');
  // leçon : boutons d'écoute sur les exemples
  await h.go('#/course/' + it.id + '/lesson'); await h.wait(60);
  const btns = h.$$('button.say');
  check('leçon d\'italien : boutons 🔊 et 🐢 sur les exemples', btns.length >= 4 && btns.some(b => b.dataset.slow) && btns.some(b => !b.dataset.slow), btns.length);
  check('boutons accessibles (aria-label)', btns.every(b => /Écouter/.test(b.getAttribute('aria-label'))));
  const normal = btns.find(b => !b.dataset.slow); normal.click(); await h.wait(10);
  check('clic : lecture en italien, vitesse normale', spoken.length === 1 && spoken[0].lang === 'it-IT' && spoken[0].rate === 0.9 && spoken[0].voice && spoken[0].voice.name === 'Alice', JSON.stringify(spoken[0]));
  btns.find(b => b.dataset.slow).click(); await h.wait(10);
  check('clic 🐢 : lecture lente', spoken.length === 2 && spoken[1].rate < 0.7);
  await h.go('#/course/' + vi.id + '/lesson'); await h.wait(60);
  h.$$('button.say')[0].click(); await h.wait(10);
  check('leçon de vietnamien : lecture en vi-VN', spoken.length === 3 && spoken[2].lang === 'vi-VN', spoken.length);
  // texte lu : symboles retirés
  T.speak('il gatto → i gatti · la penna', 'it-IT', false);
  check('texte lu sans flèches ni puces', spoken[spoken.length - 1].text === 'il gatto i gatti la penna', spoken[spoken.length - 1].text);
  // cartes
  const card = (subject, back, say) => ({ subject, back, say });
  check('carte d\'italien : verso italien lisible', T.sayText(card('italien', 'buongiorno')) === 'buongiorno');
  check('carte d\'italien : verso en français non lu', T.sayText(card('italien', 'sur l\'avant-dernière syllabe')) === '' && T.sayText(card('italien', '21')) === '');
  check('carte : say:false désactive', T.sayText(card('italien', 'tchi', false)) === '' && T.sayText(card('vietnamien', 'ngang', false)) === '');
  check('carte de vietnamien : seulement avec « say »', T.sayText(card('vietnamien', 'fantôme')) === '' && T.sayText(card('vietnamien', 'Xin chào', 'Xin chào')) === 'Xin chào');
  check('autres matières : jamais de lecture', T.sayText(card('maths', 'quatre', 'quatre')) === '');
  const vc = T.db.cards.filter(c => c.subject === 'vietnamien');
  check('cartes de vietnamien : say conservé à l\'import', vc.some(c => c.say === 'Xin chào') && vc.some(c => c.say === false));
  const ic = T.db.cards.filter(c => c.subject === 'italien');
  check('cartes d\'italien : prononciations non lues (say:false)', ic.some(c => /Prononciation de « ci »/.test(c.front) && T.sayText(c) === ''));
  // révision : bouton sur la réponse
  const c1 = vc.find(c => c.say === 'Xin chào');
  h.w.location.hash = '#/'; await h.wait(20);
  check('révision : le bouton suit la face en vietnamien', /class="sayrow"/.test(T.sayBtns('Xin chào', 'vietnamien')) && !T.sayBtns('x', 'maths'));
  // pas de voix
  h.w.speechSynthesis.getVoices = () => [{ lang: 'fr-FR', name: 'Thomas' }];
  T.speak('Xin chào', 'vi-VN', false); await h.wait(10);
  check('sans voix vietnamienne : message clair, rien n\'est lu', /Aucune voix de vietnamien/.test(h.$('#toast').textContent) && spoken.length === 4, h.$('#toast').textContent);
  // navigateur sans synthèse
  const h2 = make({ store: { v: 2, settings: { level: '5e' }, courses: [], cards: [], decks: [], activity: { days: [] } } });
  h2.t.importPack(pack('5e-italien.json')); await h2.go('#/course/' + h2.t.db.courses[0].id + '/lesson'); await h2.wait(60);
  check('sans synthèse vocale : aucun bouton, aucune erreur', h2.$$('button.say').length === 0 && h2.errors.length === 0, h2.errors.join('|'));
  check('aucune erreur JS', h.errors.length === 0, h.errors.join('|'));
  done();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
