import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const input=path.join(root,'public'),output=path.join(root,'dist');
fs.rmSync(output,{recursive:true,force:true});fs.cpSync(input,output,{recursive:true});
const html=fs.readFileSync(path.join(input,'index.html'),'utf8').replace(/(src|href)="(theme\.js|engine\.js|pipeline-ui\.js|markets\.js|ev-ui\.js|app\.js|styles\.css|workspace\.css)"/g,(_match,attribute,file)=>{
 const body=fs.readFileSync(path.join(input,file));
 return `${attribute}="${file}?v=${createHash('sha256').update(body).digest('hex').slice(0,12)}"`;
});
fs.writeFileSync(path.join(output,'index.html'),html);
// Fail the build if a frontend script changes while being packaged.
for(const file of ['theme.js','engine.js','pipeline-ui.js','markets.js','ev-ui.js','app.js','styles.css','workspace.css']){
 if(!fs.readFileSync(path.join(input,file)).equals(fs.readFileSync(path.join(output,file))))throw Error('Build changed '+file);
}
for(const file of ['players.json','data.json','league-games.json'])JSON.parse(fs.readFileSync(path.join(root,'data',file),'utf8'));
console.log('Built dist/ with versioned frontend assets. Backend: api/*.js (Vercel Node.js Functions).');
