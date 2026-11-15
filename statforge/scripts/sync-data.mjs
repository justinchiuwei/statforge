// Refresh the backend's copies after optional Python snapshot/model generation.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
for(const file of fs.readdirSync(path.join(root,'public'))){if(!file.endsWith('.json')||file==='pipeline-models.json')continue;fs.copyFileSync(path.join(root,'public',file),path.join(root,'data',file));}
console.log('Backend JSON snapshots synchronized.');
