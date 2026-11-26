// Benennt die Einzeldatei-Variante nach dem Build um und prüft, dass sie wirklich eigenständig ist.
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('dist/standalone');
const src = path.join(dir, 'index.html'), dest = path.join(dir, 'M1_Qualifikationscockpit.html');
const html = fs.readFileSync(src, 'utf8');
if (/<script[^>]+\bsrc=|<link[^>]+rel="stylesheet"/i.test(html)) throw new Error('Einzeldatei enthält noch externe Verweise');
fs.renameSync(src, dest);
for (const f of fs.readdirSync(dir)) if (f !== path.basename(dest)) fs.rmSync(path.join(dir, f), { recursive: true, force: true });
console.log('Einzeldatei:', path.relative(process.cwd(), dest), Math.round(html.length / 1024) + ' KB');
