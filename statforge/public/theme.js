// Apply the preference before styles load so a saved dark theme does not flash light.
(() => {
 const key='statforge-theme',valid=value=>value==='light'||value==='dark';
 const media=typeof matchMedia==='function'?matchMedia('(prefers-color-scheme: dark)'):null;
 let preference=null;
 try{const saved=localStorage.getItem(key);if(valid(saved))preference=saved}catch{}
 const systemTheme=()=>media?.matches?'dark':'light';
 function apply(theme){
  document.documentElement.dataset.theme=theme;
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.content=theme==='dark'?'#121814':'#f5f5f0';
  document.querySelectorAll('[data-theme-choice]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.themeChoice===theme)));
 }
 apply(preference||systemTheme());
 document.addEventListener('DOMContentLoaded',()=>apply(preference||systemTheme()));
 document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-theme-choice]'),theme=button?.dataset.themeChoice;
  if(!valid(theme))return;
  preference=theme;apply(theme);
  try{localStorage.setItem(key,theme)}catch{}
 });
 media?.addEventListener?.('change',()=>{if(!preference)apply(systemTheme())});
 window.addEventListener('storage',event=>{
  if(event.key!==key&&event.key!==null)return;
  preference=valid(event.newValue)?event.newValue:null;apply(preference||systemTheme());
 });
})();
