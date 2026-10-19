import {chromium} from 'playwright-core'
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import assert from 'node:assert/strict'
const env=Object.fromEntries(readFileSync(new URL('../../backend/.env',import.meta.url),'utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)]}))
const out=new URL('../.cache/student-v32/',import.meta.url);mkdirSync(out,{recursive:true})
const browser=await chromium.launch({channel:'msedge',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'})
page.setDefaultTimeout(30000)
const base='http://127.0.0.1:4173/#',requests=[],errors=[]
page.on('request',r=>{if(r.url().includes('/api/v1/'))requests.push({method:r.method(),path:new URL(r.url()).pathname})})
page.on('pageerror',e=>errors.push(e.message))
async function ready(){await page.locator('main h1').waitFor();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('main [role=status]')).some(n=>/正在加载|正在读取|正在确认提交资格/.test(n.textContent??'')));assert.equal(await page.locator('main .state-block[role=alert]').count(),0)}
async function snapshot(name){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:fileURLToPath(new URL(name+'.png',out)),fullPage:true})}
async function reachable(locator){await locator.evaluate(n=>n.scrollIntoView({block:'center'}));assert.ok(await locator.evaluate(n=>{const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===n||n.contains(hit)}),'click target covered')}
const contrastChecks=[];
async function checkContrast(){
 const samples=await page.locator('main .workspace-heading h1,main .task-course,main .task-table-row time,main .task-status .tag,main .task-table-head,main .focus-course,main .bplus-deadline>span,main .explore-focus h2,main .record-feedback-meta,main .course-meta,main .notification-title,main .notification-content,main .calendar-chip').evaluateAll(nodes=>nodes.slice(0,80).map(n=>{
  let el=n,bg='rgb(255, 255, 255)';
  while(el){const c=getComputedStyle(el).backgroundColor;if(c!=='rgba(0, 0, 0, 0)'&&c!=='transparent'){bg=c;break}el=el.parentElement}
  return {text:n.textContent?.slice(0,30),fg:getComputedStyle(n).color,bg};
 }));
 const lum=c=>{const rgb=c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722};
 for(const sample of samples){const a=lum(sample.fg),b=lum(sample.bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);assert.ok(ratio>=4.5,'contrast '+JSON.stringify({...sample,ratio}));contrastChecks.push({...sample,ratio})}
}
const frozen=JSON.parse(readFileSync(new URL('responses.json',out),'utf8'));
const scenarios=[],enlarged=[];
let scenario='baseline';
async function settle(){await ready();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))}
try{
 await page.goto(base+'/student/home');await page.locator('#login-username').fill('student.demo');await page.locator('#login-password').fill(env.LOCAL_STUDENT_PASSWORD);await page.getByRole('button',{name:'登录',exact:true}).click();await page.waitForURL(u=>!u.hash.startsWith('#/login'));await ready();
 await page.route('**/api/v1/**',async route=>{
  if(route.request().method()!=='GET')return route.continue();
  const u=new URL(route.request().url()),key=u.pathname+u.search;
  const response=frozen[key]?null:await route.fetch();
  if(response&&!response.ok())return route.fulfill({response});
  const body=structuredClone(frozen[key]??await response.json()),d=body.data;
  if(scenario==='long'){
   if(u.pathname==='/api/v1/me/courses')d.items.forEach(c=>c.title='跨学科课程2026-10-19T16-00-003Z_ResearchMethods'.repeat(4));
   if(u.pathname==='/api/v1/me/assignments')d.items.forEach(a=>a.title='实验Project2026_多语言任务与完整任务标题'.repeat(6));
   if(/^\/api\/v1\/assignments\/[^/]+$/.test(u.pathname))d.title='实验Project2026_多语言任务与完整任务标题'.repeat(6);
  }
  if(['many','none'].includes(scenario)&&u.pathname.endsWith('/chapters')){
   const c=d.items[0];d.items=scenario==='none'?[]:Array.from({length:24},(_,i)=>({...c,id:'10000000-0000-4000-8000-'+String(i).padStart(12,'0'),number:i+1,title:'章节 '+(i+1)+' · 中英文混排Learning2026',studentProgress:i%2?null:c.studentProgress}));
  }
  if(scenario==='empty-records'){
   if(u.pathname.endsWith('/chapters'))d.items=[];
   if(u.pathname.endsWith('/learning-records')){d.summary.completedLabCount=0;d.summary.publishedFeedbackCount=0;d.recentFeedback=null;d.feedbackPage.items=[];d.feedbackPage.total=0}
  }
  if(scenario==='messages'&&u.pathname==='/api/v1/me/messages'){
   const originals=d.items;
   d.items=Array.from({length:3},(_,i)=>({...originals[i],title:i===0?'提醒':i===1?'超长标题_通知Learning2026'.repeat(12):'课程实验Project2026 '+'章节通知'.repeat(12),content:i===1?'完整正文_多语言混排_'.repeat(60)+'END_OF_MESSAGE':'请查看课程公告。'}));d.total=3;d.summary.unreadCount=d.items.filter(n=>n.readAt===null).length;
  }
  if(scenario==='empty'){
   if(['/api/v1/me/courses','/api/v1/me/assignments','/api/v1/me/messages'].includes(u.pathname)){d.items=[];d.total=0;if(d.summary?.unreadCount!==undefined)d.summary.unreadCount=0}
   if(u.pathname==='/api/v1/me/dashboard'){d.courseCount=0;d.pendingAssignmentCount=0;d.unreadMessageCount=0;d.currentLearning=null;d.otherPendingAssignments=[];d.courses=[];d.recentFeedback=null;d.recentNotice=null}
  }
  await route.fulfill({status:200,json:body});
 });
 const routes={home:'/student/home',courses:'/course',records:'/student/progress',assignments:'/student/assignments',calendar:'/student/calendar?date=2026-10-24',messages:'/student/messages'};
 for(const [name,route] of Object.entries(routes)){
  scenario='baseline';await page.goto(base+route);await page.reload();await settle();await page.setViewportSize({width:390,height:844});await settle();
  const actions=page.locator('main .button:visible,main .chapter-action:visible,main .task-line-action:visible,main .message-full summary:visible');
  for(const action of await actions.all())assert.ok((await action.boundingBox()).height>=43.5,name+' action under 44px');
  // Text-only enlargement: double measured font sizes, retaining the real 390px viewport.
  await page.evaluate(()=>{
   const styles=[...document.querySelectorAll('main *')].filter(n=>[...n.childNodes].some(c=>c.nodeType===Node.TEXT_NODE&&c.textContent.trim())||n.matches('select,input,textarea')).map(n=>[n,getComputedStyle(n).fontSize,getComputedStyle(n).lineHeight]);
   for(const [n,size,line] of styles){n.style.fontSize=parseFloat(size)*2+'px';if(line!=='normal')n.style.lineHeight=parseFloat(line)*2+'px'}
  });
  await settle();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' enlarged overflow');
  const enlargedActions=page.locator('main a:visible,main button:visible:not([disabled])');if(await enlargedActions.count())await reachable(enlargedActions.last());
  await snapshot('enlarged-text-200-'+name+'-390');enlarged.push({name,kind:'200% text-only',viewport:390,overflow:false});
 }
 // 200% equivalent layout: 1440 physical pixels / 720 CSS pixels, DPR 2.
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Emulation.setDeviceMetricsOverride',{width:720,height:500,deviceScaleFactor:2,mobile:false});
 for(const [name,route] of Object.entries(routes)){
  await page.goto(base+route);await page.reload();await settle();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' reflow overflow');
  await snapshot('reflow-200-'+name);enlarged.push({name,kind:'equivalent reflow',cssWidth:720,dpr:2,overflow:false});
 }
 await cdp.send('Emulation.clearDeviceMetricsOverride');
 for(const [kind,subset] of [['long',{home:routes.home,courses:routes.courses,assignments:routes.assignments}],['many',{records:routes.records}],['none',{records:routes.records}],['empty-records',{records:routes.records}],['empty',routes]]){
  scenario=kind;
  for(const [name,route] of Object.entries(subset)){
   await page.goto(base+route);await page.reload();await settle();
   for(const width of [1440,390]){await page.setViewportSize({width,height:width===390?844:1000});await settle();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),kind+' '+name);await snapshot('fixture-'+kind+'-'+name+'-'+width)}
   scenarios.push({kind,name});
  }
 }
 scenario='messages';await page.setViewportSize({width:1440,height:1000});await page.goto(base+routes.messages);await page.reload();await settle();
 const messageRows=page.locator('.notification-item');
 assert.equal(await messageRows.nth(0).locator('details').count(),0,'short fully-visible message has no expansion');
 assert.equal(await messageRows.nth(1).locator('details').count(),1,'long text has expansion');
 assert.equal(await messageRows.nth(2).locator('details').count(),0,'medium title fits desktop');
 await page.setViewportSize({width:320,height:844});await settle();
 await page.waitForFunction(()=>document.querySelectorAll('.notification-item')[2].querySelector('details'));
 const medium=messageRows.nth(2).locator('details');await medium.locator('summary').focus();await page.keyboard.press('Enter');
 await page.setViewportSize({width:1440,height:1000});await settle();assert.ok(await medium.getAttribute('open')!==null,'open control survives widening');
 await medium.locator('summary').focus();await page.keyboard.press('Enter');await settle();assert.equal(await medium.count(),0,'control removed when closed and fully readable');
 assert.equal(await messageRows.nth(2).locator('.notification-title').evaluate(n=>n===document.activeElement),true,'focus stays in message after control removal');
 await messageRows.nth(1).locator('summary').click();await settle();
 assert.ok((await messageRows.nth(1).locator('details p').innerText()).endsWith('END_OF_MESSAGE'));
 assert.equal(await messageRows.nth(1).locator('h3').count(),0,'expanded title is not duplicated');
 await snapshot('fixture-message-expanded-1440');
 await page.setViewportSize({width:320,height:844});await settle();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await snapshot('fixture-message-expanded-320');
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto(base+routes.assignments);await settle();
 assert.equal(await page.locator('main .button').first().evaluate(n=>getComputedStyle(n).transitionDuration),'0s');
 await page.emulateMedia({reducedMotion:'no-preference'});
 assert.ok((await page.locator('main .button').first().evaluate(n=>getComputedStyle(n).transitionDuration)).includes('0.12s'));
 assert.equal(await page.locator('main .button').first().evaluate(n=>getComputedStyle(n).transform),'none');
 assert.deepEqual(errors,[]);assert.deepEqual(requests.filter(r=>r.method!=='GET'&&r.path!=='/api/v1/auth/login'),[]);
 writeFileSync(new URL('boundaries-result.json',out),JSON.stringify({result:'PASS',scenarios,enlarged,messageClippingResizeKeyboardFocus:true,reducedMotion:true,businessWrites:0,browserErrors:errors},null,2));
 console.log('PASS: V3.2 isolated boundaries, 200% text enlargement/equivalent reflow, dynamic clipping, keyboard continuity and reduced motion.');
}finally{await browser.close()}
