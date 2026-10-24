import {chromium} from 'playwright-core'
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
const env=Object.fromEntries(readFileSync(new URL('../../backend/.env',import.meta.url),'utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>{const at=l.indexOf('=');return[l.slice(0,at),l.slice(at+1)]}))
// Reuse existing local fixture IDs; this audit never creates or resets business data.
const fixture=JSON.parse(readFileSync(new URL('../.cache/zhixue/result.json',import.meta.url),'utf8'))
assert.equal(fixture.result,'PASS','This audit requires the existing accepted local fixture; do not regenerate data')
const root=new URL('../.cache/student-content-polish/',import.meta.url);mkdirSync(root,{recursive:true});const stage=process.argv[2]??'after';assert.ok(['before','after'].includes(stage));const out=new URL(stage+'/',root);mkdirSync(out,{recursive:true});const baseline=new URL('baseline.json',root);let epoch;try{epoch=JSON.parse(readFileSync(baseline,'utf8')).epoch}catch{epoch=Date.now();writeFileSync(baseline,JSON.stringify({epoch,baseCommit:'145d26a'}))}
const browser=await chromium.launch({channel:'msedge',headless:true}),checks=[],errors=[],responses=[]
const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Shanghai',reducedMotion:'reduce'}),page=await context.newPage()
page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(new URL(r.url()).pathname.startsWith('/api/v1/'))responses.push({path:new URL(r.url()).pathname,status:r.status()})})
const businessWrites=[];page.on('request',r=>{const path=new URL(r.url()).pathname;if(path.startsWith('/api/')&&!['GET','HEAD'].includes(r.method())&&path!=='/api/v1/auth/login')businessWrites.push({path,method:r.method()})})
async function login(){await page.goto('http://127.0.0.1:4173/#/login');await page.locator('#login-username').fill('student.demo');await page.locator('#login-password').fill(env.LOCAL_STUDENT_PASSWORD);await page.getByRole('button',{name:'登录',exact:true}).click();await page.waitForURL(u=>u.hash.includes('/student/home'))}
async function ready(){await page.locator('main h1').waitFor();await page.waitForFunction(()=>![...document.querySelectorAll('main [role=status]')].some(n=>/正在加载|正在读取|正在确认/.test(n.textContent??'')));await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))}
async function go(path){await page.goto('http://127.0.0.1:4173/#'+path);await ready();assert.equal(await page.locator('.campus-marker-stack,.vc-switcher,.vx-switcher,.home-preview-switch').count(),0);assert.equal(await page.locator('main .state-block[role=alert]').count(),0,await page.locator('main').innerText())}
async function hit(c){await c.evaluate(n=>n.scrollIntoView({block:'center'}));await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.ok(await c.evaluate(n=>{const r=n.getBoundingClientRect(),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return h===n||n.contains(h)}),'covered '+await c.innerText());assert.ok((await c.boundingBox()).height>=43.5,'touch area '+await c.innerText())}
const routes={home:'/student/home',courses:'/course',records:'/student/progress/'+fixture.offering,assignments:'/student/assignments',calendar:'/student/calendar?date=2026-11-20',messages:'/student/messages'}

try{
 await page.clock.setFixedTime(new Date(epoch));await login()
 for(const width of [1440,1024,768,430,390,375,320]){
  await page.setViewportSize({width,height:width>760?1000:844})
  for(const [name,path]of Object.entries(routes)){
   await go(path);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} ${width} overflow`)
   for(const f of [0,.5,1]){await page.evaluate(f=>scrollTo(0,(document.documentElement.scrollHeight-innerHeight)*f),f);const nav=page.locator('.mobile-primary-nav');if(await nav.isVisible()){const box=await nav.boundingBox();assert.ok(Math.abs(box.y+box.height-(width>760?1000:844))<2)}}
   const controls=page.locator('main a.button,main button:not(:disabled),main summary,main .vx-course-primary,main .task-line-action'),n=await controls.count()
   for(const i of [...new Set([0,Math.floor(n/2),n-1])])if(i>=0&&await controls.nth(i).isVisible())await hit(controls.nth(i))
   checks.push({name,width,result:'PASS'})
   if(width===1440||width===390){await page.evaluate(()=>{document.activeElement?.blur();scrollTo(0,0)});await page.screenshot({path:fileURLToPath(new URL(`${name}-${width}.png`,out)),fullPage:true});await page.screenshot({path:fileURLToPath(new URL(`${name}-${width}-viewport.png`,out))})}
  }
 }
 await page.setViewportSize({width:1440,height:1000});await go('/student/home');await page.locator('.explore-tasks').screenshot({path:fileURLToPath(new URL('home-task-detail.png',out)),style:'.workspace-topbar,.mobile-primary-nav{visibility:hidden!important}'})
 const data=await page.evaluate(async()=>{const{assignmentsApi,coursesApi}=await import('/src/api/index.ts');const a=assignmentsApi(),c=coursesApi();async function all(load){let items=[],page=1;while(true){const r=(await load(page)).data;items.push(...r.items);if(items.length>=r.total||!r.items.length)return items;page++}}return {tasks:(await all(page=>a.listMyAssignments({filter:'all',page,pageSize:100}))).map(t=>({id:t.id,title:t.title,dueAt:t.dueAt,state:t.assignmentState})),courses:(await all(page=>c.listMyCourses({status:'all',page,pageSize:100}))).map(c=>({id:c.offeringId,title:c.title,progress:c.progress.percent})),messages:(await all(page=>a.listMessages({page,pageSize:100}))).map(m=>({id:m.id,title:m.title,readAt:m.readAt}))}})
 if(stage==='after')assert.deepEqual(data,JSON.parse(readFileSync(new URL('before/data.json',root),'utf8')),'existing data must remain unchanged')
 writeFileSync(new URL('data.json',out),JSON.stringify(data,null,2));assert.deepEqual(errors,[]);assert.deepEqual(businessWrites,[]);writeFileSync(new URL('checks.json',out),JSON.stringify({checks,errors,responses,epoch,businessWrites},null,2));console.log(`PASS ${stage}: ${checks.length} viewport checks, actual scroll/targets, unchanged data snapshot`)
}finally{await browser.close()}
