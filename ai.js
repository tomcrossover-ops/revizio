/* Révizio — fournisseurs d'IA : Claude (Anthropic), ChatGPT (OpenAI) et Perplexity.
   La clé de chaque fournisseur est saisie dans les Réglages et reste sur l'appareil.
   - Anthropic et OpenAI sont appelés directement depuis le navigateur.
   - Perplexity refuse les appels directs depuis un navigateur (CORS) : la requête passe par la petite
     fonction /api/ai de ton propre site (voir api/ai.js), qui ne conserve rien. Elle sert aussi de
     secours pour OpenAI si le navigateur bloque l'appel direct. */
'use strict';

const PROVIDERS = {
  anthropic: {
    label: 'Claude (Anthropic)', short: 'Anthropic', keyPh: 'sk-ant-…', host: 'api.anthropic.com', docs: 'console.anthropic.com',
    models: [['claude-sonnet-5-5', 'Claude Sonnet 5.5 (recommandé)'], ['claude-haiku-5-5', 'Claude Haiku 5.5 (plus rapide, moins cher)'], ['claude-opus-5-5', 'Claude Opus 5.5 (plus précis, plus cher)']],
    files: true, direct: true,
  },
  openai: {
    label: 'ChatGPT (OpenAI)', short: 'OpenAI', keyPh: 'sk-…', host: 'api.openai.com', docs: 'platform.openai.com/api-keys',
    models: [['gpt-5-mini', 'GPT-5 mini (rapide, économique)'], ['gpt-5', 'GPT-5 (plus précis)']],
    files: true, direct: true,
  },
  perplexity: {
    label: 'Perplexity (expérimental)', short: 'Perplexity', keyPh: 'pplx-…', host: 'api.perplexity.ai', docs: 'perplexity.ai/settings/api',
    models: [['fast', 'Rapide (« fast »)'], ['medium', 'Équilibré (« medium »)'], ['high', 'Approfondi (« high »)']],
    files: false, direct: false,
  },
};
const providerOf = () => PROVIDERS[db.settings.provider] || PROVIDERS.anthropic;

/* Enregistre le fournisseur actif dans son profil, puis bascule sur un autre (chaque fournisseur garde sa clé et son modèle). */
function switchProvider(name) {
  const s = db.settings; if (!PROVIDERS[name]) return;
  s.profiles = s.profiles || {};
  s.profiles[s.provider || 'anthropic'] = { apiKey: s.apiKey, model: s.model };
  const p = s.profiles[name] || {};
  s.provider = name; s.apiKey = p.apiKey || ''; s.model = p.model || PROVIDERS[name].models[0][0];
}

/* ---------- Conversion du contenu (format Anthropic -> format OpenAI) ---------- */
function toOpenAIContent(content) {
  return content.map(b => {
    if (b.type === 'text') return { type: 'text', text: b.text };
    if (b.type === 'image') return { type: 'image_url', image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } };
    if (b.type === 'document') return { type: 'file', file: { filename: 'cours.pdf', file_data: `data:application/pdf;base64,${b.source.data}` } };
    return null;
  }).filter(Boolean);
}

/* ---------- Requêtes ---------- */
async function postProvider(name, headers, url, payload) {
  const P = PROVIDERS[name];
  const viaProxy = () => fetch('api/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ target: name, key: db.settings.apiKey, payload }) });
  if (!P.direct) return viaProxy();
  try {
    return await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(payload) });
  } catch (e) { // blocage réseau/CORS : on tente par le relais du site
    if (name === 'anthropic') throw e;
    return viaProxy();
  }
}
async function readError(res, name) {
  let m = res.status + '';
  try { const j = await res.json(); m = (j.error && (j.error.message || j.error)) || j.message || m; } catch (e) { /* ignore */ }
  if (res.status === 401 || res.status === 403) m = 'Clé API invalide ou sans droit (' + PROVIDERS[name].short + ').';
  if (res.status === 404 && name !== 'anthropic') m = 'Relais /api/ai introuvable : l\'appli doit être publiée sur Vercel avec le dossier api (voir README).';
  if (res.status === 413) m = 'Fichiers trop lourds pour le relais : utilise moins de photos ou colle le texte.';
  return new Error(typeof m === 'string' ? m : JSON.stringify(m));
}
/* L'IA n'est proposée que si une clé API est renseignée */
const hasAI = () => !!String((db.settings && db.settings.apiKey) || '').trim();
const TOO_LONG = 'La réponse était trop longue et a été coupée. Réessaie, ou précise un chapitre plus petit.';

async function callClaude(content, maxTokens = 6000, system = SYSTEM) { // nom conservé : fonctionne avec le fournisseur choisi
  const { apiKey, model } = db.settings, name = db.settings.provider in PROVIDERS ? db.settings.provider : 'anthropic', P = PROVIDERS[name];
  if (!apiKey) throw new Error('Ajoute ta clé API dans les Réglages.');
  if (!P.files && content.some(b => b.type !== 'text')) throw new Error(`${P.short} ne lit pas les photos ni les PDF : colle le texte du cours, ou choisis Claude ou ChatGPT dans les Réglages.`);
  let text;
  if (name === 'anthropic') {
    const res = await postProvider(name, { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      'https://api.anthropic.com/v1/messages', { model, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] });
    if (!res.ok) throw await readError(res, name);
    const data = await res.json();
    if (data.stop_reason === 'max_tokens') throw new Error(TOO_LONG);
    text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  } else if (name === 'openai') {
    const reasoning = /^(gpt-5|o\d)/.test(model) && !/chat/.test(model);
    const payload = { model, messages: [{ role: 'system', content: system }, { role: 'user', content: toOpenAIContent(content) }], response_format: { type: 'json_object' } };
    payload.max_completion_tokens = reasoning ? maxTokens + 3000 : maxTokens; // les modèles « raisonneurs » comptent leur réflexion dans le plafond
    if (/^gpt-5/.test(model) && !/chat/.test(model)) payload.reasoning_effort = 'minimal';
    const res = await postProvider(name, { authorization: 'Bearer ' + apiKey }, 'https://api.openai.com/v1/chat/completions', payload);
    if (!res.ok) throw await readError(res, name);
    const data = await res.json(), ch = (data.choices || [])[0] || {};
    if (ch.finish_reason === 'length') throw new Error(TOO_LONG);
    text = (ch.message && ch.message.content) || '';
  } else {
    const payload = { effort: model, instructions: system, input: [{ type: 'message', role: 'user', content: content.map(b => b.text).join('\n\n') }], max_output_tokens: maxTokens };
    const res = await postProvider(name, {}, '', payload);
    if (!res.ok) throw await readError(res, name);
    const data = await res.json();
    text = data.output_text || (data.output || []).flatMap(o => (o.content || []).map(c => c.text || '')).join('');
    text = text.replace(/\[\d{1,2}\]/g, ''); // marqueurs de citations
  }
  return parseJSON(text);
}

/* Test de la clé : une toute petite requête */
async function pingProvider() {
  const { apiKey, model } = db.settings, name = db.settings.provider in PROVIDERS ? db.settings.provider : 'anthropic';
  if (!apiKey) return { ok: false, msg: 'Saisis d\'abord une clé.' };
  try {
    let res;
    if (name === 'anthropic') res = await postProvider(name, { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, 'https://api.anthropic.com/v1/messages', { model, max_tokens: 5, messages: [{ role: 'user', content: 'Dis ok' }] });
    else if (name === 'openai') res = await postProvider(name, { authorization: 'Bearer ' + apiKey }, 'https://api.openai.com/v1/chat/completions', { model, max_completion_tokens: /^gpt-5/.test(model) ? 200 : 5, ...(/^gpt-5/.test(model) ? { reasoning_effort: 'minimal' } : {}), messages: [{ role: 'user', content: 'Dis ok' }] });
    else res = await postProvider(name, {}, '', { effort: model, input: 'Dis ok', max_output_tokens: 20 });
    if (res.ok) return { ok: true, msg: 'Clé valide ✔' };
    return { ok: false, msg: (await readError(res, name)).message };
  } catch (e) { return { ok: false, msg: 'Réseau indisponible ou appel bloqué par le navigateur.' }; }
}
