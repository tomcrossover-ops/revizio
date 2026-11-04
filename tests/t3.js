const { make, check, done } = require('./harness'); const fs = require('fs'), vm = require('vm');
const dir = require('path').join(__dirname, '..') + '/';
(async () => {
  const mkSw = ({ waiting, controller }) => { const st = { reloads: 0, unreg: 0, deleted: [], posted: [], listeners: {} };
    st.worker = { postMessage: m => st.posted.push(m) };
    st.reg = { waiting: waiting ? st.worker : null, installing: null, updated: 0, addEventListener() {}, update: async () => { st.reg.updated++; } };
    st.sw = { controller: controller ? {} : null, register: async () => st.reg, addEventListener: (t, f) => { st.listeners[t] = f; }, getRegistrations: async () => [{ unregister: async () => { st.unreg++; } }] };
    return st; };
  const withReloadCount = (h, st) => { h.errors.push = function (m) { if (/navigation/i.test(m)) st.reloads++; return Array.prototype.push.call(this, m); }; };

  let st = mkSw({ waiting: true, controller: true }); let h = make({ sw: st.sw }); withReloadCount(h, st); await h.wait(40);
  check('mise à jour en attente -> bannière', !!h.$('#upd') && /nouvelle version/i.test(h.$('#upd').textContent));
  st.listeners.controllerchange(); await h.wait(20); check('pas de rechargement avant le clic', st.reloads === 0);
  h.$('#updBtn').click(); await h.wait(10);
  check('clic -> SKIP_WAITING envoyé', JSON.stringify(st.posted) === '[{"type":"SKIP_WAITING"}]' && /Mise à jour…/.test(h.$('#updBtn').textContent));
  st.listeners.controllerchange(); await h.wait(20); check('rechargement après activation', st.reloads === 1, st.reloads);

  st = mkSw({ waiting: false, controller: true }); h = make({ sw: st.sw, store: { settings: { name: 'A' }, courses: [], cards: [{ id: 'k', subject: 'maths', front: 'Q ?', back: 'R', tag: 'definition', fwd: { step: 0, due: '2000-01-01', lapses: 0 } }] } }); withReloadCount(h, st); await h.wait(40);
  check('rien en attente -> pas de bannière', !h.$('#upd'));
  await h.go('#/settings');
  h.$('#updCheck').click(); await h.wait(30); check('« Rechercher » -> à jour', st.reg.updated === 1 && /à jour/.test(h.$('#toast').textContent));
  st.reg.waiting = st.worker; h.$('#updCheck').click(); await h.wait(30); check('« Rechercher » avec version en attente -> bannière', !!h.$('#upd'));
  h.$('#updForce').click(); await h.wait(50);
  check('« Forcer » : désinscrit le SW, vide les caches, recharge', st.unreg === 1 && st.reloads === 1);
  check('« Forcer » : cartes et réglages conservés', h.t.db.cards.length === 1 && h.t.db.settings.name === 'A' && !!h.w.localStorage.getItem('revizio.v1'));

  st = mkSw({ waiting: true, controller: false }); h = make({ sw: st.sw }); withReloadCount(h, st); await h.wait(40); st.listeners.controllerchange(); await h.wait(20);
  check('première installation: ni bannière ni rechargement', !h.$('#upd') && st.reloads === 0);

  // ---- service worker
  const handlers = {}; let skipped = 0, cached = [];
  const ctx = { self: { addEventListener: (t, f) => { handlers[t] = f; }, skipWaiting: () => { skipped++; }, clients: { claim: async () => {} } },
    caches: { open: async () => ({ addAll: async a => { cached = a; } }), keys: async () => [], delete: async () => {}, match: async () => {} }, URL, location: { origin: 'http://localhost' }, fetch: async () => {} };
  vm.createContext(ctx); const swSrc = fs.readFileSync(dir + 'sw.js', 'utf8'); vm.runInContext(swSrc, ctx);
  let p; handlers.install({ waitUntil: x => { p = x; } }); await p;
  check('SW: pas de skipWaiting automatique', skipped === 0);
  handlers.message({ data: { type: 'SKIP_WAITING' } }); check('SW: skipWaiting sur demande', skipped === 1);
  const appV = fs.readFileSync(dir + 'core.js', 'utf8').match(/APP_VERSION = '([^']+)'/)[1], swV = vm.runInContext('VERSION', ctx);
  check(`versions identiques (app ${appV} / sw ${swV})`, appV === swV && vm.runInContext('CACHE', ctx) === 'revizio-' + swV);
  const missing = cached.filter(f => f !== './' && !fs.existsSync(dir + f));
  check('SW: tous les fichiers du cache hors ligne existent', missing.length === 0, missing.join(','));
  const html = fs.readFileSync(dir + 'index.html', 'utf8'); const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  check('index.html: scripts dans l\'ordre core, catalog, cards, app et tous en cache hors ligne', scripts.join() === 'core.js,theme.js,ai.js,catalog.js,learn.js,exercise.js,cards.js,session.js,pack.js,chapter.js,app.js' && scripts.every(s => cached.includes(s)), scripts.join());
  check('index.html: lien « Cartes » dans la navigation', /href="#\/library"/.test(html));
  done();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
