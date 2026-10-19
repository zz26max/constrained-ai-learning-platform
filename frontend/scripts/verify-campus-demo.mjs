import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const out=new URL('../.cache/student-v33/',import.meta.url)
mkdirSync(new URL('current/',out),{recursive:true})
const browser=await chromium.launch({channel:'msedge',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce',timezoneId:'Asia/Shanghai'})
const base='http://127.0.0.1:4174/campus.html#'
const network=[],errors=[],checks=[],flows=[]
page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))network.push(r.url())})
page.on('pageerror',e=>errors.push(e.message))
async function ready(){await page.locator('main h1').waitFor();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('main [role=status]')).some(n=>/正在加载|正在读取|正在确认提交资格/.test(n.textContent??'')));assert.equal(await page.locator('main .state-block[role=alert]').count(),0,await page.locator('main').innerText())}
async function go(path){await page.goto(base+path);await page.reload();await ready()}
async function snap(name){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:fileURLToPath(new URL(name+'.png',out)),fullPage:true})}
try{
 for(const [name,path] of Object.entries({home:'/student/home',courses:'/course',records:'/student/progress/33000000-0000-4000-8000-000000000100',assignments:'/student/assignments',calendar:'/student/calendar?date=2026-10-19',messages:'/student/messages'})){
  await go(path)
  for(const width of [1440,1024,430,390,375,320]){
   await page.setViewportSize({width,height:width>760?1000:844})
   await page.evaluate(()=>scrollTo(0,0))
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} overflow ${width}`)
   if(width===1440||width===390)await page.screenshot({path:fileURLToPath(new URL(`current/${name}-${width===1440?'desktop':'mobile'}.png`,out)),fullPage:true})
   const targets=page.locator('main a.button,main button:not(:disabled)')
   for(const target of [targets.first(),targets.last()])if(await target.isVisible()){
    await target.evaluate(n=>n.scrollIntoView({block:'center'}))
    assert.ok(await target.evaluate(n=>{const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===n||n.contains(hit)}),`${name} covered target ${width}`)
   }
   checks.push({page:name,width,overflow:false,targetsReachable:true})
  }
 }
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===1440?1000:844})
  await go('/student/home')
  const task=page.locator('main a').filter({hasText:'继续作答'}).first()
  await task.click();await ready()
  assert.match(await page.locator('main').innerText(),/学生选课系统/)
  await page.getByRole('link',{name:'进入工作区',exact:true}).click();await ready()
  await page.locator('textarea.workspace-editor').fill('# 选课系统设计\n以接口描述选课行为，并检验重复选课边界。')
  await page.getByRole('button',{name:'提交作业',exact:true}).click()
  await page.locator('#reflection').fill('以接口约束行为，使用边界示例检查重复选课。')
  await page.getByRole('checkbox',{name:'我确认提交这个版本'}).check()
  await page.getByRole('button',{name:'确认提交',exact:true}).click()
  await page.waitForURL(u=>u.hash.includes('/student/assignments/'));await ready();assert.match(await page.locator('main').innerText(),/已提交/)
  await snap(`submitted-${width}`)
  // SPA navigation preserves the isolated state; page.goto would reset it.
  await page.evaluate(()=>{location.hash='/student/assignments'})
  await ready();assert.match(await page.locator('main').innerText(),/已提交/)
  flows.push({task:'A',width,result:'PASS',path:'首页近期任务→选课系统→工作区→保存并提交→列表'})
  await go('/student/home')
  await page.getByRole('link',{name:'查看全部待办',exact:false}).click();await ready()
  assert.match(await page.locator('main').innerText(),/待完成|待处理/)
  flows.push({task:'B',width,result:'PASS',path:'首页→查看全部待办→资格分组'})
  await go('/course')
  const card=page.locator('.course-row').filter({hasText:'数据库原理'})
  await card.getByRole('link',{name:'学习课程：数据库原理',exact:true}).click();await ready()
  assert.match(await page.locator('main h1').innerText(),/概念模型与ER设计/)
  await page.getByRole('button',{name:'确认已阅读',exact:true}).click()
  await page.getByRole('button',{name:'已确认阅读',exact:true}).waitFor()
  flows.push({task:'C',width,result:'PASS',path:'课程→数据库原理→第4章→确认阅读'})
  await page.evaluate(()=>{location.hash='/course'});await ready()
  assert.match(await page.locator('.course-row').filter({hasText:'数据库原理'}).innerText(),/4 \/ 5/)
  await go('/student/progress')
  await page.locator('main select').selectOption('33000000-0000-4000-8000-000000000104');await ready();assert.equal(await page.locator('.record-chapters li').count(),1);await page.getByRole('link',{name:'复习章节',exact:false}).click();await ready();assert.match(await page.locator('main h1').innerText(),/软件过程与需求分析/);flows.push({task:'D',width,result:'PASS',path:'学习记录→软件工程基础→已阅读章节→复习'})
  await snap(`records-state-${width}`)
  await go('/student/messages')
  await page.getByRole('button',{name:'查看评价',exact:true}).first().click();await ready();await page.getByText('整体完成较好，但实验报告需要进一步补充结果分析。',{exact:true}).waitFor();await snap(`feedback-${width}`);flows.push({task:'E',width,result:'PASS',path:'消息→评价通知→对应作业→提交快照与教师评价'})
  await go('/student/calendar?date=2026-10-24')
  assert.equal(await page.locator('.agenda-event').count(),3);await page.locator('.agenda-event').first().click();await page.getByRole('dialog').getByRole('link',{name:'查看作业',exact:true}).click();await ready();assert.match(await page.locator('main h1').innerText(),/软件需求分析|栈与队列|集合/);flows.push({task:'F',width,result:'PASS',path:'日历10月24日→三项日程→详情→对应作业'})
 }
 await page.setViewportSize({width:320,height:844})
 await go('/student/messages')
 const full=page.locator('.message-full').first()
 await full.locator('summary').click();assert.notEqual(await full.getAttribute('open'),null)
 await snap('message-expanded-320')
 const unread=page.locator('.notification-item.unread').first()
 const unreadId=await unread.getAttribute('data-message-id')
 await unread.getByRole('button',{name:'标为已读',exact:true}).click()
 await page.locator(`[data-message-id="${unreadId}"]:not(.unread)`).waitFor()
 for(const [suffix,expected] of [['104','1 / 1'],['106','暂无已发布章节'],['102','0 / 3']]){
  await go('/student/progress/33000000-0000-4000-8000-000000000'+suffix)
  assert.ok((await page.locator('main').innerText()).includes(expected))
  await snap('record-case-'+suffix)
 }
 await go('/student/calendar?date=2026-10-26')
 await page.getByRole('button',{name:'查看该日日程',exact:false}).click();await ready()
 assert.match(page.url(),/date=2026-11-02/)
 await go('/student/calendar?date=2026-11-02')
 assert.equal(await page.locator('.agenda-event').count(),1)
 await snap('calendar-cross-month')
 await page.setViewportSize({width:1440,height:1000})
 await go('/student/calendar?date=2026-10-24')
 await page.getByRole('button',{name:'周',exact:true}).click()
 assert.match(page.url(),/view=week/)
 await snap('calendar-week')
 checks.push({scenario:'messages expand/read, one/many/no chapter records, empty calendar next date, cross month and week switch',result:'PASS'})
 assert.deepEqual(network,[],'preview must not send any real API request')
 assert.deepEqual(errors,[])
 writeFileSync(new URL('result.json',out),JSON.stringify({checks,flows,network,errors},null,2))
 console.log(JSON.stringify({checks:checks.length,flows,network,errors},null,2))
}catch(error){console.error('FAILED URL',page.url(),(await page.locator('main').innerText()).slice(-5000));await snap('failure');throw error}finally{await browser.close()}
