import {chromium} from 'playwright-core'
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
const env=Object.fromEntries(readFileSync(new URL('../../backend/.env',import.meta.url),'utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>{const at=l.indexOf('=');return[l.slice(0,at),l.slice(at+1)]}))
// Prerequisite: verify-zhixue.mjs creates fresh, local-only acceptance objects.
const fixture=JSON.parse(readFileSync(new URL('../.cache/zhixue/result.json',import.meta.url),'utf8'))
assert.equal(fixture.result,'PASS','Create the acceptance fixture successfully before this read/interaction audit')
const out=new URL('../.cache/student-release/',import.meta.url);mkdirSync(out,{recursive:true})
const browser=await chromium.launch({channel:'msedge',headless:true}),checks=[],errors=[],responses=[]
const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Shanghai',reducedMotion:'reduce'}),page=await context.newPage()
page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(new URL(r.url()).pathname.startsWith('/api/v1/'))responses.push({path:new URL(r.url()).pathname,status:r.status()})})
async function login(){await page.goto('http://127.0.0.1:4173/#/login');await page.locator('#login-username').fill('student.demo');await page.locator('#login-password').fill(env.LOCAL_STUDENT_PASSWORD);await page.getByRole('button',{name:'登录',exact:true}).click();await page.waitForURL(u=>u.hash.includes('/student/home'))}
async function ready(){await page.locator('main h1').waitFor();await page.waitForFunction(()=>![...document.querySelectorAll('main [role=status]')].some(n=>/正在加载|正在读取|正在确认/.test(n.textContent??'')));await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))}
async function go(path){await page.goto('http://127.0.0.1:4173/#'+path);await ready();assert.equal(await page.locator('.campus-marker-stack,.vc-switcher,.vx-switcher,.home-preview-switch').count(),0);assert.equal(await page.locator('main .state-block[role=alert]').count(),0,await page.locator('main').innerText())}
async function hit(c){await c.evaluate(n=>n.scrollIntoView({block:'center'}));await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.ok(await c.evaluate(n=>{const r=n.getBoundingClientRect(),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return h===n||n.contains(h)}),'covered '+await c.innerText());assert.ok((await c.boundingBox()).height>=43.5,'touch area '+await c.innerText())}
const routes={home:'/student/home',courses:'/course',records:'/student/progress/'+fixture.offering,assignments:'/student/assignments',calendar:'/student/calendar?date=2026-11-20',messages:'/student/messages'}
try{
 await login()
 for(const width of [1440,1024,768,430,390,375,320]){
  await page.setViewportSize({width,height:width>760?1000:844})
  for(const [name,path]of Object.entries(routes)){
   await go(path);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} ${width} overflow`)
   const scroll=[]
   for(const f of [0,.5,1]){await page.evaluate(f=>scrollTo(0,(document.documentElement.scrollHeight-innerHeight)*f),f);await page.waitForTimeout(60);const nav=page.locator('.mobile-primary-nav');if(await nav.isVisible()){const box=await nav.boundingBox();assert.ok(Math.abs(box.y+box.height-(width>760?1000:844))<2,'fixed nav position')}scroll.push(await page.evaluate(()=>scrollY))}
   const controls=page.locator('main a.button,main button:not(:disabled),main summary,main .vx-course-primary,main .task-line-action'),count=await controls.count()
   for(const i of [...new Set([0,Math.floor(count/2),count-1])])if(i>=0&&await controls.nth(i).isVisible())await hit(controls.nth(i))
   if(width<=760){const more=page.getByRole('button',{name:'更多导航',exact:true});await more.click();assert.equal(await more.getAttribute('aria-expanded'),'true');await page.keyboard.press('Escape');assert.equal(await more.getAttribute('aria-expanded'),'false')}
   checks.push({name,width,overflow:false,scroll,controlsReachable:true})
   if(width===1440||width===390){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:fileURLToPath(new URL(`${name}-${width}.png`,out)),fullPage:true});await page.screenshot({path:fileURLToPath(new URL(`${name}-${width}-viewport.png`,out))})}
  }
 }
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===1440?1000:844})
  for(const [name,path]of Object.entries({course:'/course/'+fixture.offering,chapter:`/course/${fixture.offering}/chapter/${fixture.chapter}`,assignment:'/student/assignments/'+fixture.assignments[0],workspace:'/student/workspaces/'+fixture.assignments[0],notices:`/student/offerings/${fixture.offering}/notices`})){
   await go(path);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} ${width} overflow`);await page.screenshot({path:fileURLToPath(new URL(`${name}-${width}-detail.png`,out)),fullPage:true});checks.push({name,width,scenario:'secondary real route and overflow',result:'PASS'})
  }
 }
 await go('/student/assignments');for(const label of ['已提交','已批改','全部','待完成']){await page.getByRole('button',{name:new RegExp('^'+label)}).click();await ready();assert.equal(await page.getByRole('button',{name:new RegExp('^'+label)}).getAttribute('aria-pressed'),'true')};checks.push({scenario:'assignment status filters',result:'PASS'})
 await go(routes.calendar);const event=page.locator('.vx-agenda-event').first();await event.click();await page.getByRole('dialog',{name:'日程详情'}).waitFor();await page.getByRole('link',{name:'查看作业',exact:true}).click();await ready();assert.ok(page.url().includes('/student/assignments/'));await page.goBack();await ready();assert.ok(page.url().includes('2026-11-20'));checks.push({scenario:'calendar date/dialog/assignment/back preserves selected date',result:'PASS'})
 await go(routes.records);const feedback=page.locator('.vx-feedback a').first();await feedback.click();await ready();assert.ok(page.url().includes('feedbackId='));assert.match(await page.locator('main').innerText(),/知学迁移验收反馈/);checks.push({scenario:'records opens actual published feedback',result:'PASS'})
 // No writes to existing messages: select only a notification referring to this run's fixture.
 await go('/student/messages');await page.getByRole('button',{name:'评价',exact:true}).click();await ready();const messageId=await page.evaluate(async offering=>{const result=await(await import('/src/api/index.ts')).assignmentsApi().listMessages({page:1,pageSize:20,type:'feedback'});return result.data.items.find(n=>n.offeringId===offering)?.id},fixture.offering);assert.ok(messageId,'owned feedback message must be present');const owned=page.locator(`[data-message-id="${messageId}"]`);{await owned.getByRole('button',{name:'查看评价',exact:true}).click();await page.waitForURL(u=>u.hash.includes('/student/assignments/'));await page.locator('.notification-list').waitFor({state:'detached'});await ready();assert.match(await page.locator('main').innerText(),/知学迁移验收反馈/);checks.push({scenario:'owned notification -> published feedback -> explicit read',result:'PASS'})}

 // Read-only traversal for existing accessible secondary content; never writes these objects.
 await go('/course')
 const secondary=await page.evaluate(async()=>{
  const {coursesApi,noticesApi}=await import('/src/api/index.ts');const api=coursesApi();const courses=(await api.listMyCourses({status:'all',page:1,pageSize:100})).data.items;let resource,notice;
  for(const course of courses){
   if(!notice){const rows=(await noticesApi().listNotices(course.offeringId,{page:1,pageSize:20})).data.items;if(rows[0])notice=rows[0].id}
   if(!resource){const chapters=(await api.listChapters(course.offeringId)).data.items;for(const chapter of chapters){const full=(await api.getChapter(chapter.id)).data;if(full.resources?.[0]){resource=full.resources[0].id;break}}}
   if(resource&&notice)break
  }
  return {resource,notice}
 })
 for(const width of [1440,390]){await page.setViewportSize({width,height:width===1440?1000:844});for(const [name,path]of Object.entries({...(secondary.resource?{resource:'/resource/'+secondary.resource}:{}),...(secondary.notice?{notice:'/student/notices/'+secondary.notice}:{})})){await go(path);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:fileURLToPath(new URL(`${name}-${width}-detail.png`,out)),fullPage:true});checks.push({scenario:'read-only existing secondary content',name,width,result:'PASS'})}}
 await page.setViewportSize({width:390,height:844});await go('/student/messages')
 const pattern='**/api/v1/me/messages*';await page.route(pattern,r=>r.request().method()==='GET'?r.abort('failed'):r.continue());await page.reload();await page.locator('main .state-block[role=alert]').waitFor();assert.equal(await page.locator('.notification-item').count(),0);assert.ok(!(await page.locator('main').innerText()).includes('暂无消息'));await page.screenshot({path:fileURLToPath(new URL('message-read-failure.png',out))});await page.unroute(pattern);await page.locator('main .state-block[role=alert]').getByRole('button',{name:'重新加载',exact:true}).click();await ready();assert.ok(await page.locator('.notification-item').count());checks.push({scenario:'real message read abort stays error, no mock fallback, retry recovers',result:'PASS'})
 let release;const gate=new Promise(resolve=>{release=resolve});await page.route(pattern,async r=>{if(r.request().method()==='GET'){await gate;await r.continue()}else await r.continue()});await page.reload();await page.locator('main [role=status]').waitFor();assert.equal(await page.locator('.notification-item').count(),0);release();await ready();await page.unroute(pattern);assert.ok(await page.locator('.notification-item').count());checks.push({scenario:'delayed real message response keeps loading until actual response',result:'PASS'})
 await go('/student/assignments');await page.getByRole('button',{name:/^全部/}).click();await ready();if(await page.getByRole('button',{name:'下一页',exact:true}).count()){await page.getByRole('button',{name:'下一页',exact:true}).click();await ready();assert.ok(page.url().includes('page=2'));checks.push({scenario:'real assignments next page',result:'PASS'})}
 await go('/student/messages');if(await page.getByRole('button',{name:'下一页',exact:true}).count()){await page.getByRole('button',{name:'下一页',exact:true}).click();await ready();assert.match(await page.locator('.pagination').innerText(),/第 2/);checks.push({scenario:'real notification next page',result:'PASS'})}

 await go('/student/home');const primary=page.locator('[data-home-action=primary]');const recommended=await primary.getAttribute('data-task-id');assert.ok(recommended);await page.keyboard.press('Tab');await primary.focus();assert.ok(await primary.evaluate(n=>{const s=getComputedStyle(n);return s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>=3}),'visible keyboard focus');await page.keyboard.press('Enter');await page.waitForURL(u=>u.hash.includes('/student/assignments/'+recommended));await ready();checks.push({scenario:'formal home primary keyboard focus and Enter reach actual recommended detail',result:'PASS'})
 await go('/student/messages');const full=page.locator('.message-full').first();assert.ok(await full.count());const parent=full.locator('..'),readState=await parent.getAttribute('class');await full.locator('summary').click();assert.notEqual(await full.getAttribute('open'),null);assert.equal(await parent.getAttribute('class'),readState);await full.locator('summary').click();assert.equal(await full.getAttribute('open'),null);checks.push({scenario:'formal message expand/collapse does not mark read',result:'PASS'})
 await page.setViewportSize({width:1440,height:1000});await go(routes.calendar);await page.getByRole('button',{name:'周',exact:true}).click();await ready();assert.equal(await page.locator('.vx-desktop-calendar .vx-day-cell').count(),7);await page.getByRole('button',{name:'月',exact:true}).click();await ready();assert.ok(await page.locator('.vx-desktop-calendar .vx-day-cell').count()>=28);checks.push({scenario:'formal calendar actual week/month controls',result:'PASS'})
 await page.goto('http://127.0.0.1:4173/#/teacher');await page.getByRole('heading',{name:'无权访问此入口'}).waitFor();checks.push({scenario:'student teacher route denied',result:'PASS'})
 assert.deepEqual(errors,[])
 writeFileSync(new URL('results.json',out),JSON.stringify({checks,responses,errors,fixture,realClock:new Date().toISOString()},null,2));console.log(`PASS ${checks.length} release checks, ${responses.length} real HTTP responses, no page errors`)
}catch(e){await page.screenshot({path:fileURLToPath(new URL('failure.png',out)),fullPage:true});console.error('FAILED',page.url());throw e}finally{await browser.close()}
