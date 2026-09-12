// Ego browser acceptance helper. All app keys use a separate test prefix.
export const QA_PREFIX='planet-acceptance.';
export const QA_SCRIPT=`(()=>{if(window.__planetQA)return;const real=window.localStorage,prefix='planet-acceptance.';window.__planetQA=true;window.__planetQAPrefix=prefix;window.__qaErrors=[];window.addEventListener('error',e=>window.__qaErrors.push(e.message));window.addEventListener('unhandledrejection',e=>window.__qaErrors.push(String(e.reason)));window.__qaCleanup=()=>{for(const key of ['gravity.sessions.v1','gravity.sessions.v1.before-planet'])real.removeItem(prefix+key);};Object.defineProperty(window,'localStorage',{value:{getItem:k=>real.getItem(prefix+k),setItem:(k,v)=>real.setItem(prefix+k,v),removeItem:k=>real.removeItem(prefix+k)}});})();`;
export async function prepare(page,{prefix=QA_PREFIX}={}){
  const marker=`${prefix}${Date.now()}`;
  const {identifier}=await page.cdp('Page.addScriptToEvaluateOnNewDocument',{source:QA_SCRIPT.replaceAll(QA_PREFIX,prefix)+`;window.__qaDocument=${JSON.stringify(marker)};`});
  try{await page.reload();await page.waitForFunction(value=>window.__qaDocument===value&&Boolean(window.planetDiagnostics),marker,{timeout:10000});}
  finally{await page.cdp('Page.removeScriptToEvaluateOnNewDocument',{identifier});}
}

export async function stable(page){await page.waitForFunction(()=>document.getAnimations().every(a=>a.playState!=='running'||a.effect?.getTiming().iterations===Infinity),undefined,{timeout:5000});}
