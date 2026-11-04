/* Lance tous les tests : `cd tests && npm install && npm test` */
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
const files = fs.readdirSync(__dirname).filter(f => /^t\d+\.js$/.test(f)).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
let bad = 0;
for (const f of files) {
  const r = spawnSync('node', [path.join(__dirname, f)], { encoding: 'utf8' });
  const ok = r.status === 0; if (!ok) bad++;
  console.log((ok ? 'OK    ' : 'ÉCHEC ') + f);
  if (!ok) console.log((r.stdout + r.stderr).split('\n').filter(l => /FAIL|ÉCHEC|Error/.test(l)).join('\n'));
}
console.log(bad ? `\n${bad} fichier(s) en échec` : `\nTout passe (${files.length} fichiers)`); process.exit(bad ? 1 : 0);
