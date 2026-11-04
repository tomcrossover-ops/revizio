const { make, check, done } = require('./harness');
const proxy = require('../api/ai.js');
const COURSE = { title: 'T', summary: 's', lesson: [], keyPoints: ['k'], cards: [], questions: [] };
(async () => {
  const calls = [];
  let mode = 'ok';
  const fetchImpl = async (url, o) => {
    const body = JSON.parse(o.body); calls.push({ url, headers: o.headers, body });
    if (mode === 'cors' && /api\.openai\.com/.test(url)) throw new TypeError('Failed to fetch');
    if (url === 'api/ai') return { ok: true, status: 200, json: async () => (body.target === 'perplexity' ? { output_text: '```json\n' + JSON.stringify(COURSE) + '\n```[1]' } : { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(COURSE) } }] }) };
    if (/openai/.test(url)) return { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: mode === 'length' ? 'length' : 'stop', message: { content: JSON.stringify(COURSE) } }] }) };
    return { ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(COURSE) }] }) };
  };
  const h = make({ store: { v: 2, settings: { apiKey: 'sk-ant-AAAAAAAAAA', model: 'claude-sonnet-5-5', level: '6e' }, courses: [], cards: [], decks: [], activity: { days: [] } }, fetchImpl });
  const { w, $, $$ } = h, T = h.t, S = () => T.db.settings;
  check('migration : fournisseur par défaut = anthropic', S().provider === 'anthropic');

  // --- Anthropic inchangé
  await T.callClaude([{ type: 'text', text: 'hi' }], 100, 'sys');
  check('Anthropic : URL + en-têtes', calls[0].url === 'https://api.anthropic.com/v1/messages' && calls[0].headers['x-api-key'] === 'sk-ant-AAAAAAAAAA' && calls[0].headers['anthropic-version'], JSON.stringify(calls[0]));

  // --- bascule vers OpenAI : chaque fournisseur garde sa clé
  await h.go('#/settings');
  check('réglages : 3 fournisseurs', $$('#provider option').length === 3);
  $('#provider').value = 'openai'; h.change($('#provider')); await h.wait(10);
  check('bascule : clé Anthropic mise de côté, champ vide', S().provider === 'openai' && S().apiKey === '' && S().profiles.anthropic.apiKey === 'sk-ant-AAAAAAAAAA' && $('#key').value === '');
  check('bascule : modèles OpenAI proposés', $$('#model option').map(o => o.value).join() === 'gpt-5-mini,gpt-5,__custom', $$('#model option').map(o => o.value).join());
  check('bascule : libellé de la clé', $('#app').textContent.includes('Clé API OpenAI') && $('#app').textContent.includes('api.openai.com'));
  $('#key').value = 'sk-openai-BBBBBBBB'; $('#model').value = '__custom'; h.change($('#model'));
  check('modèle personnalisé : champ affiché', $('#modelCustom').hidden === false);
  $('#modelCustom').value = 'gpt-4.1'; h.submit($('#f')); await h.wait(5);
  check('modèle personnalisé enregistré', S().model === 'gpt-4.1' && S().apiKey === 'sk-openai-BBBBBBBB');
  await h.go('#/'); await h.go('#/settings');
  check('réaffichage : modèle perso conservé', $('#model').value === '__custom' && $('#modelCustom').value === 'gpt-4.1');
  $('#provider').value = 'anthropic'; h.change($('#provider')); await h.wait(10);
  check('retour sur Anthropic : clé retrouvée', S().apiKey === 'sk-ant-AAAAAAAAAA' && S().model === 'claude-sonnet-5-5');
  $('#provider').value = 'openai'; h.change($('#provider')); await h.wait(10);
  check('retour sur OpenAI : clé et modèle retrouvés', S().apiKey === 'sk-openai-BBBBBBBB' && S().model === 'gpt-4.1');

  // --- OpenAI : format de requête
  const call = T.callClaude; calls.length = 0;
  await call([{ type: 'text', text: 'Bonjour' }], 1000, 'Système JSON');
  let c = calls[0];
  check('OpenAI : URL directe + Bearer', c.url === 'https://api.openai.com/v1/chat/completions' && c.headers.authorization === 'Bearer sk-openai-BBBBBBBB');
  check('OpenAI : messages system+user, json_object', c.body.messages[0].role === 'system' && c.body.messages[1].content[0].text === 'Bonjour' && c.body.response_format.type === 'json_object');
  check('OpenAI (gpt-4.1) : max_completion_tokens exact, pas de reasoning_effort', c.body.max_completion_tokens === 1000 && !('reasoning_effort' in c.body) && !('max_tokens' in c.body));
  S().model = 'gpt-5-mini'; calls.length = 0; await call([{ type: 'text', text: 'x' }], 1000, 's');
  check('OpenAI (gpt-5) : reasoning minimal + marge', calls[0].body.reasoning_effort === 'minimal' && calls[0].body.max_completion_tokens === 4000);
  // image + PDF
  calls.length = 0;
  await call([{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } }, { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'BBBB' } }, { type: 'text', text: 'cours' }], 500, 's');
  const parts = calls[0].body.messages[1].content;
  check('OpenAI : image et PDF convertis', parts[0].type === 'image_url' && parts[0].image_url.url === 'data:image/jpeg;base64,AAAA' && parts[1].type === 'file' && parts[1].file.file_data === 'data:application/pdf;base64,BBBB' && parts[2].type === 'text');
  mode = 'length'; let err = ''; try { await call([{ type: 'text', text: 'x' }], 100, 's'); } catch (e) { err = e.message; }
  check('OpenAI : réponse coupée -> message clair', /trop longue/.test(err), err);
  // repli par le relais si le navigateur bloque (CORS)
  mode = 'cors'; calls.length = 0;
  const r = await call([{ type: 'text', text: 'x' }], 100, 's');
  check('OpenAI : appel bloqué -> repli par /api/ai', calls.length === 2 && calls[1].url === 'api/ai' && calls[1].body.target === 'openai' && calls[1].body.key === 'sk-openai-BBBBBBBB' && r.title === 'T', JSON.stringify(calls.map(x => x.url)));
  mode = 'ok';

  // --- Perplexity : toujours par le relais
  await h.go('#/settings'); $('#provider').value = 'perplexity'; h.change($('#provider')); await h.wait(10);
  check('Perplexity : avertissement affiché', $('#app').textContent.includes('moteur de recherche') && $('#app').textContent.includes('/api/ai'));
  check('Perplexity : modèles = niveaux d\'effort', $$('#model option').map(o => o.value).slice(0, 3).join() === 'fast,medium,high');
  $('#key').value = 'pplx-CCCCCCCCCC'; h.submit($('#f')); await h.wait(5);
  calls.length = 0; const rp = await call([{ type: 'text', text: 'Cours' }], 900, 'Sys');
  c = calls[0];
  check('Perplexity : requête vers /api/ai (jamais en direct)', calls.length === 1 && c.url === 'api/ai' && c.body.target === 'perplexity' && c.body.key === 'pplx-CCCCCCCCCC');
  check('Perplexity : charge utile Agent API', c.body.payload.effort === 'fast' && c.body.payload.instructions === 'Sys' && c.body.payload.max_output_tokens === 900 && c.body.payload.input[0].content === 'Cours', JSON.stringify(c.body.payload));
  check('Perplexity : bloc ```json et [1] nettoyés', rp.title === 'T');
  err = ''; try { await call([{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AA' } }, { type: 'text', text: 'x' }], 100, 's'); } catch (e) { err = e.message; }
  check('Perplexity : photo refusée avec message clair', /ne lit pas les photos/.test(err), err);
  const pg = await T.pingProvider(); check('test de clé Perplexity', pg.ok === true);
  S().apiKey = ''; err = ''; try { await call([{ type: 'text', text: 'x' }], 100, 's'); } catch (e) { err = e.message; }
  check('sans clé -> message', /clé API/.test(err));

  // --- JSON : <think> retiré
  check('parseJSON ignore <think>', T.parseJSON('<think>{"a":1}</think>{"title":"ok"}').title === 'ok');

  // --- relais serveur (api/ai.js)
  const mkRes = () => { const r = { headers: {}, setHeader(k, v) { r.headers[k] = v; }, end(t) { r.body = t; } }; return r; };
  const realFetch = global.fetch; let seen = null; global.fetch = async (u, o) => { seen = { u, o }; return { status: 200, headers: { get: () => 'application/json' }, text: async () => '{"ok":1}' }; };
  const run = async (req) => { const res = mkRes(); await proxy(req, res); return res; };
  let res = await run({ method: 'POST', headers: { host: 'revizio.app', origin: 'https://revizio.app' }, body: { target: 'perplexity', key: 'pplx-1234567890', payload: { a: 1 } } });
  check('relais : transmet à l\'adresse fixe avec Bearer', res.statusCode === 200 && seen.u === 'https://api.perplexity.ai/v1/agent' && seen.o.headers.authorization === 'Bearer pplx-1234567890' && JSON.parse(seen.o.body).a === 1 && res.body === '{"ok":1}');
  res = await run({ method: 'POST', headers: { host: 'revizio.app', origin: 'https://evil.example' }, body: { target: 'perplexity', key: 'pplx-1234567890', payload: {} } });
  check('relais : autre origine refusée (403)', res.statusCode === 403);
  seen = null; res = await run({ method: 'POST', headers: { host: 'revizio.app' }, body: { target: 'http://evil.example', key: 'pplx-1234567890', payload: {} } });
  check('relais : adresse libre refusée (400), rien transmis', res.statusCode === 400 && seen === null);
  res = await run({ method: 'GET', headers: {} }); check('relais : GET refusé (405)', res.statusCode === 405);
  res = await run({ method: 'POST', headers: { host: 'x' }, body: { target: 'openai', key: 'x', payload: {} } }); check('relais : clé absente (401)', res.statusCode === 401);
  res = await run({ method: 'POST', headers: { host: 'x' }, body: JSON.stringify({ target: 'openai', key: 'sk-1234567890', payload: { m: 1 } }) }); check('relais : corps texte accepté', res.statusCode === 200 && seen.u === 'https://api.openai.com/v1/chat/completions');
  global.fetch = async () => { throw new Error('down'); }; res = await run({ method: 'POST', headers: { host: 'x' }, body: { target: 'openai', key: 'sk-1234567890', payload: {} } }); check('relais : fournisseur injoignable (502)', res.statusCode === 502);
  global.fetch = realFetch;
  check('aucune erreur JS', h.errors.length === 0, h.errors.join('|'));
  done();
})();
