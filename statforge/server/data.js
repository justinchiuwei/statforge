import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const cache=new Map();
export function readJson(name){
 if(!/^(?:players|data|league-games|history-\d+)\.json$/.test(name))throw new Error('Unsupported data file');
 if(cache.has(name))return cache.get(name);
 try{const value=JSON.parse(readFileSync(join(process.cwd(),'data',name),'utf8'));cache.set(name,value);return value}
 catch(error){if(error.code==='ENOENT'&&name.startsWith('history-'))return {};throw error}
}
