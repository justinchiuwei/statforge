import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';

test('packaged data resolves relative to its module with a different working directory',()=>{
 const moduleUrl=new URL('../server/data.js',import.meta.url).href;
 const script=`const {readJson}=await import(${JSON.stringify(moduleUrl)});console.log(readJson('players.json').players.length);`;
 const output=execFileSync(process.execPath,['--input-type=module','-e',script],{cwd:tmpdir(),encoding:'utf8'});
 assert.equal(Number(output.trim()),526);
});
