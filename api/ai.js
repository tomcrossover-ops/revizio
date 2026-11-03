/* Relais minimal pour les fournisseurs d'IA qui refusent les appels directs depuis un navigateur (CORS).
   - Reçoit { target, key, payload } de l'appli Révizio (même site uniquement).
   - Transmet `payload` à l'adresse FIXE du fournisseur avec la clé de l'utilisateur, puis renvoie la réponse telle quelle.
   - Ne stocke rien, ne journalise ni la clé ni le contenu. Ce n'est pas un proxy ouvert : seules 2 adresses sont possibles. */
'use strict';

const TARGETS = {
  perplexity: 'https://api.perplexity.ai/v1/agent',
  openai: 'https://api.openai.com/v1/chat/completions',
};

module.exports = async (req, res) => {
  const send = (code, obj) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(obj)); };
  if (req.method !== 'POST') return send(405, { error: { message: 'POST uniquement.' } });
  // même site uniquement : l'en-tête Origin (quand il est présent) doit correspondre à l'hôte du relais
  const origin = req.headers.origin;
  if (origin) { try { if (new URL(origin).host !== req.headers.host) return send(403, { error: { message: 'Origine refusée.' } }); } catch (e) { return send(403, { error: { message: 'Origine refusée.' } }); } }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || typeof body !== 'object') return send(400, { error: { message: 'Requête illisible.' } });
  const url = TARGETS[body.target];
  if (!url) return send(400, { error: { message: 'Fournisseur inconnu.' } });
  if (typeof body.key !== 'string' || body.key.length < 10 || body.key.length > 400) return send(401, { error: { message: 'Clé manquante.' } });
  if (!body.payload || typeof body.payload !== 'object') return send(400, { error: { message: 'Contenu manquant.' } });
  try {
    const up = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + body.key }, body: JSON.stringify(body.payload) });
    const text = await up.text();
    res.statusCode = up.status; res.setHeader('content-type', up.headers.get('content-type') || 'application/json'); res.setHeader('cache-control', 'no-store');
    res.end(text);
  } catch (e) {
    send(502, { error: { message: 'Le fournisseur est injoignable.' } });
  }
};
