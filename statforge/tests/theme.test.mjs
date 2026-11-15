import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function boot({saved=null,dark=false,blocked=false}={}){
 const storage=new Map(saved?[['statforge-theme',saved]]:[]),events={},root={dataset:{}},meta={content:''};
 const buttons=['light','dark'].map(theme=>({dataset:{themeChoice:theme},attributes:{},setAttribute(key,value){this.attributes[key]=value},closest(){return this}}));
 const media={matches:dark,addEventListener(name,fn){this.change=fn}};
 const document={documentElement:root,querySelector:()=>meta,querySelectorAll:()=>buttons,addEventListener(name,fn){events[name]=fn}};
 const window={addEventListener(name,fn){events[name]=fn}};
 const localStorage={getItem(key){if(blocked)throw Error('Storage blocked');return storage.get(key)??null},setItem(key,value){if(blocked)throw Error('Storage blocked');storage.set(key,value)}};
 vm.runInNewContext(fs.readFileSync('public/theme.js','utf8'),{document,window,localStorage,matchMedia:()=>media});
 return {root,meta,buttons,media,events,storage,click(theme){events.click({target:buttons.find(button=>button.dataset.themeChoice===theme)})}};
}

test('the initial theme follows the device and updates until the user chooses a mode',()=>{
 const page=boot({dark:true});assert.equal(page.root.dataset.theme,'dark');assert.equal(page.meta.content,'#121814');
 page.media.matches=false;page.media.change();assert.equal(page.root.dataset.theme,'light');
 page.click('dark');assert.equal(page.root.dataset.theme,'dark');assert.equal(page.storage.get('statforge-theme'),'dark');assert.equal(page.buttons[1].attributes['aria-pressed'],'true');
 page.media.change();assert.equal(page.root.dataset.theme,'dark');
});

test('saved preferences survive reload and the other theme can still be selected',()=>{
 const page=boot({saved:'dark',dark:false});assert.equal(page.root.dataset.theme,'dark');
 page.click('light');assert.equal(page.storage.get('statforge-theme'),'light');assert.equal(page.buttons[0].attributes['aria-pressed'],'true');assert.equal(page.buttons[1].attributes['aria-pressed'],'false');
 const reload=boot({saved:page.storage.get('statforge-theme'),dark:true});assert.equal(reload.root.dataset.theme,'light');
});

test('storage restrictions do not stop theme switching or page initialization',()=>{
 const page=boot({blocked:true});page.click('dark');page.events.DOMContentLoaded();assert.equal(page.root.dataset.theme,'dark');
});

test('theme changes sync between tabs without reacting to unrelated saved data',()=>{
 const page=boot();page.events.storage({key:'statforge-theme',newValue:'dark'});assert.equal(page.root.dataset.theme,'dark');
 page.events.storage({key:'statforge-saved',newValue:'[]'});assert.equal(page.root.dataset.theme,'dark');
 page.events.storage({key:'statforge-theme',newValue:null});assert.equal(page.root.dataset.theme,'light');
});
