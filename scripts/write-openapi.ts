import fs from 'node:fs';
import path from 'node:path';
import { openApiDocument } from '../shared/openapi';

const out = path.join(process.cwd(), 'docs', 'openapi.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(openApiDocument(), null, 2)}\n`);
console.log(`wrote ${path.relative(process.cwd(), out)}`);
