const { make, check, done } = require('./harness');
const fs = require('fs'), dir = __dirname + '/../';
const DAY = 864e5;
const st = (extra = {}, nCards = 12) => ({ v: 2, settings: Object.assign({ level: '6e', apiKey: 'k', name: 'Léo' }, extra), courses: [], decks: [], activity: { days: [] },
  cards: Array.from({ length: nCards }, (_, i) => ({ id: 'c' + i, q: 'q' + i, a: 'a' + i, subject: 'maths', level: '6e', createdAt: 1 })) });
(async () => {
  // --- rappel de sauvegarde
  let h = make({ store: st({}, 2) }); await h.go('#/'); await h.wait(60);
  check('sauvegarde : pas de rappel quand il n\'y a presque rien à perdre', !h.$('#bk'));
  h = make({ store: st() }); await h.go('#/'); await h.wait(60);
  check('sauvegarde : rappel affiché (données, jamais sauvegardé)', !!h.$('#bk') && /jamais sauvegardé/.test(h.$('#bk').textContent));
  h.$('#bkLater').click(); await h.wait(40);
  check('sauvegarde : « Plus tard » masque le rappel et le repousse ~7 jours', !h.$('#bk') && h.t.db.settings.backupSnooze > Date.now() + 6 * DAY);
  h = make({ store: st({ lastBackup: Date.now() - 3 * DAY }) }); await h.go('#/'); await h.wait(60);
  check('sauvegarde : pas de rappel si sauvegarde récente', !h.$('#bk'));
  h = make({ store: st({ lastBackup: Date.now() - 20 * DAY }) }); await h.go('#/'); await h.wait(60);
  check('sauvegarde : rappel si sauvegarde ancienne (> 14 jours)', !!h.$('#bk'));
  h = make({ store: st({ backupSnooze: Date.now() + 2 * DAY }) }); await h.go('#/'); await h.wait(60);
  check('sauvegarde : pas de rappel pendant le report', !h.$('#bk'));
  h = make({ store: st() }); await h.go('#/'); await h.wait(60);
  h.w.URL.createObjectURL = () => 'blob:x'; h.w.HTMLAnchorElement.prototype.click = function () {};
  h.$('#bkNow').click(); await h.wait(60);
  check('sauvegarde : « Sauvegarder maintenant » enregistre la date et masque le rappel', Date.now() - h.t.db.settings.lastBackup < 5000 && !h.$('#bk'));
  await h.go('#/settings'); await h.wait(60);
  check('réglages : date de dernière sauvegarde affichée', /Dernière sauvegarde/.test(h.$('#app').textContent));

  // --- en-têtes de sécurité
  const v = JSON.parse(fs.readFileSync(dir + 'vercel.json', 'utf8'));
  const all = Object.fromEntries(v.headers.find(x => x.source === '/(.*)').headers.map(x => [x.key, x.value]));
  const csp = all['Content-Security-Policy'] || '';
  check('en-têtes : CSP sans unsafe-inline ni unsafe-eval pour les scripts', /script-src 'self'(;|$)/.test(csp) && !/unsafe-eval/.test(csp));
  check('en-têtes : CSP limite les connexions à soi, Anthropic et OpenAI', /connect-src 'self' https:\/\/api\.anthropic\.com https:\/\/api\.openai\.com(;|$)/.test(csp));
  check('en-têtes : pas d\'intégration en iframe, pas d\'objet', /frame-ancestors 'none'/.test(csp) && /object-src 'none'/.test(csp));
  check('en-têtes : nosniff, referrer, HSTS, permissions', all['X-Content-Type-Options'] === 'nosniff' && all['Referrer-Policy'] === 'no-referrer' && /max-age=/.test(all['Strict-Transport-Security']) && /camera=\(\)/.test(all['Permissions-Policy']));
  check('en-têtes : sw.js jamais mis en cache par le navigateur', v.headers.some(x => x.source === '/sw.js' && x.headers.some(k => k.key === 'Cache-Control' && /no-cache/.test(k.value))));
  check('vercel.json : fonction api/ai conservée', v.functions && v.functions['api/ai.js'].maxDuration === 60);
  // la CSP interdit les gestionnaires en ligne : il ne doit plus en rester
  const srcs = ['index.html', 'app.js', 'chapter.js', 'cards.js', 'session.js', 'learn.js', 'exercise.js', 'pack.js', 'catalog.js', 'theme.js'].map(f => [f, fs.readFileSync(dir + f, 'utf8')]);
  const inl = srcs.filter(([f, s]) => /\son(click|change|input|submit|load|error|keydown)\s*=\s*["']/.test(s)).map(x => x[0]);
  check('aucun gestionnaire d\'événement en ligne (onclick=…)', inl.length === 0, inl.join());
  check('aucune balise <script> en ligne', !/<script(?![^>]*\ssrc=)[^>]*>/.test(srcs[0][1]));
  done();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
