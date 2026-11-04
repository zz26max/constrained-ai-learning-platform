// Real services + explicit client fault injection; no mocked successful responses.
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'
import { loadAcceptanceConfig, validateFixture, validateFixtureRecords } from './browser-acceptance-config.mjs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
const config = loadAcceptanceConfig()
if (!config.fixturePath) throw new Error('Set BROWSER_ACCEPTANCE_FIXTURE to the successful main-run result.json')
const fixture = validateFixture(JSON.parse(readFileSync(config.fixturePath,'utf8')),config)
const out = join(dirname(config.fixturePath),'boundaries-'+randomUUID())
mkdirSync(out,{recursive:true})
const report={at:new Date().toISOString(),target:config.base,runId:fixture.runId,result:'IN_PROGRESS',checks:[],skipped:[],writes:['fixture web workspace edits','fixture text assignment archive','normal sessions/audit/learning events']}
const checkpoint=()=>writeFileSync(join(out,'boundaries.json'),JSON.stringify(report,null,2))
const step=name=>{report.currentStep=name;checkpoint()}
checkpoint()
const { chromium } = await import('playwright-core')
const browser=await chromium.launch(config.launchOptions)
const ctx=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'})
const page=await ctx.newPage();page.setDefaultTimeout(config.timeout)
const errors=[]
ctx.on('page',p=>{p.setDefaultTimeout(config.timeout);p.on('pageerror',e=>errors.push(e.message))})
page.on('pageerror',e=>errors.push(e.message))
const base=config.base+'#'
const api=async(p,path,method='GET')=>p.evaluate(async({path,method})=>{const h={Accept:'application/json'};if(method!=='GET'){const r=await fetch('/api/v1/auth/csrf-token');h['X-CSRF-Token']=(await r.json()).data.csrfToken}const write=method==='POST';if(write)h['Content-Type']='application/json';const r=await fetch('/api/v1'+path,{method,headers:h,...(write?{body:'{}'}:{})});const data=await r.json();return {status:r.status,data:data.data}},{path,method})
async function login(p,role){await p.goto(base+'/login');await p.locator('#login-username').fill(config.credentials[role].username);await p.locator('#login-password').fill(config.credentials[role].password);await p.getByRole('button',{name:'登录',exact:true}).click();await p.waitForURL(u=>!u.hash.startsWith('#/login'),{waitUntil:'domcontentloaded'})}
async function nav(p,path){await p.goto(base+path);await p.locator('main h1').waitFor();await p.waitForFunction(()=>!Array.from(document.querySelectorAll('[role=status]')).some(n=>n.textContent?.trim()==='正在加载…'))}
const saved=async(p)=>p.waitForFunction(async id=>{
  const response=await fetch('/api/v1/assignments/'+id+'/workspace')
  if(!response.ok)return false
  const workspace=(await response.json()).data
  return workspace.files.find(file=>file.path==='index.html')?.content===document.querySelector('textarea.workspace-editor')?.value && /^r\d+$/.test(document.querySelector('.save-st')?.textContent?.trim()||'')
},fixture.assignments[0],{polling:250})
const workspace='/student/workspaces/'+fixture.assignments[0]
try{
  // Authenticate the teacher and validate server-side ownership before editing any fixture.
  step('validate main-run fixture against real server')
  await login(page,'teacher')
  const owned=await api(page,'/offerings/'+fixture.offering)
  assert.equal(owned.status,200)
  const records=await Promise.all(fixture.assignments.map(id=>api(page,'/assignments/'+id)))
  records.forEach(record=>assert.equal(record.status,200))
  validateFixtureRecords(fixture,owned.data,records.map(record=>record.data))
  assert.equal((await api(page,'/auth/logout','POST')).status,200)
  step('dual-window conflict and explicit merge')
  await login(page,'student');await nav(page,workspace);await page.locator('textarea.workspace-editor').waitFor()
  const second=await ctx.newPage();await nav(second,workspace)
  await second.locator('textarea.workspace-editor').fill('<h1>第二窗口已保存 '+Date.now()+'</h1>');await saved(second)
  await page.locator('textarea.workspace-editor').fill('<h1>第一窗口本地保留</h1>')
  await page.locator('main [role=alert]').filter({hasText:'工作区已被修改，本地内容已保留。请读取服务端版本并比较。'}).first().waitFor()
  assert.equal(await page.locator('textarea.workspace-editor').inputValue(),'<h1>第一窗口本地保留</h1>')
  await page.getByRole('button',{name:'读取服务端并恢复保存',exact:true}).click()
  await page.getByRole('button',{name:'确认保存编辑器中的合并结果',exact:true}).click();await saved(page);await second.close()
  step('slow network latest edit')
  const pattern='**/api/v1/assignments/'+fixture.assignments[0]+'/workspace'
  await page.route(pattern,async route=>{if(route.request().method()==='PUT')await new Promise(r=>setTimeout(r,800));await route.continue()})
  const started=page.waitForRequest(r=>r.method()==='PUT'&&r.url().endsWith('/workspace'))
  await page.locator('textarea.workspace-editor').fill('<h1>慢网络第一稿</h1>');await started
  await page.locator('textarea.workspace-editor').fill('<h1>慢网络最新稿</h1>');await saved(page)
  assert.equal((await api(page,'/assignments/'+fixture.assignments[0]+'/workspace')).data.files.find(f=>f.path==='index.html').content,'<h1>慢网络最新稿</h1>')
  await page.unroute(pattern)
  // Exercise the existing isolated preview with hostile student content.
  step('hostile content preview isolation and reset')
  const probe='<script>let a;try{parent.document.body;a="leaked"}catch{a="blocked"}document.body.textContent="parent:"+a;try{parent.localStorage.length;document.body.textContent+=" storage:leaked"}catch{document.body.textContent+=" storage:blocked"}</script>'
  await page.locator('textarea.workspace-editor').fill(probe);await saved(page)
  await page.getByRole('button',{name:'运行',exact:true}).click()
  const frame=page.frameLocator('iframe[title="学生作品隔离预览"]')
  await frame.getByText('parent:blocked storage:blocked',{exact:true}).waitFor()
  await page.getByRole('button',{name:'重置',exact:true}).click();assert.equal(await page.locator('iframe').count(),0)
  step('aborted save and leave cancellation')
  await page.route(pattern,route=>route.request().method()==='PUT'?route.abort('failed'):route.continue())
  await page.locator('textarea.workspace-editor').fill('<h1>保存失败保留内容</h1>');await page.locator('main [role=alert]').first().waitFor()
  await page.locator('nav[aria-label="主导航"]').getByRole('link',{name:'消息通知',exact:true}).click()
  await page.getByRole('dialog',{name:'还有未保存的内容'}).waitFor()
  await page.getByRole('button',{name:'留在页面',exact:true}).click()
  assert.equal(await page.locator('textarea.workspace-editor').inputValue(),'<h1>保存失败保留内容</h1>')
  await page.unroute(pattern)
  await page.getByRole('button',{name:'读取服务端并恢复保存',exact:true}).click()
  const merge=page.getByRole('button',{name:'确认保存编辑器中的合并结果',exact:true})
  if(await merge.count())await merge.click();await saved(page)
  // Revoke this actual browser session, then ensure another identity sees no retained draft.
  step('session expiry and different identity')
  assert.equal((await api(page,'/auth/logout','POST')).status,200)
  await page.locator('textarea.workspace-editor').fill('<h1>上一用户的私有草稿</h1>')
  await page.locator('#login-username').waitFor()
  await page.locator('#login-username').fill(config.credentials.teacher.username);await page.locator('#login-password').fill(config.credentials.teacher.password)
  await page.getByRole('button',{name:'登录',exact:true}).click();await page.waitForURL(u=>!u.hash.startsWith('#/login'),{waitUntil:'domcontentloaded'})
  assert.ok(!(await page.locator('body').innerText()).includes('上一用户的私有草稿'))
  step('archive fixture and verify readonly and cross-class denial')
  const teacher=page
  if(records[2].data.publicationState!=='archived') assert.equal((await api(teacher,'/teacher/assignments/'+fixture.assignments[2]+'/archive','POST')).status,200)
  const studentCtx=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'})
  const student=await studentCtx.newPage();student.setDefaultTimeout(config.timeout);student.on('pageerror',e=>errors.push(e.message));await login(student,'student')
  await nav(student,'/student/workspaces/'+fixture.assignments[2]);await student.locator('textarea.workspace-editor').waitFor();assert.equal(await student.locator('textarea.workspace-editor').isDisabled(),true)
  const mine=(await api(student,'/me/courses?status=all&page=1&pageSize=100')).data.items.map(c=>c.offeringId)
  const foreign=(await api(teacher,'/teacher/offerings?page=1&pageSize=100')).data.items.find(c=>!mine.includes(c.id))
  if(foreign){const denied=await api(student,'/offerings/'+foreign.id);assert.ok([403,404].includes(denied.status));report.checks.push('cross-class denial')}else report.skipped.push('cross-class denial: no accessible teacher offering outside student memberships')
  step('responsive loaded screenshots')
  for(const width of [1440,1024,390]){
    await teacher.setViewportSize({width,height:1000});await student.setViewportSize({width,height:1000})
    for(const[p,path,label]of[[teacher,'/teacher/offerings/'+fixture.offering,'teacher-ready'],[student,'/student/calendar?date='+fixture.calendarDate,'calendar-ready'],[student,'/student/home','home-ready']]){await nav(p,path);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:join(out,label+'-'+width+'.png'),fullPage:true})}
    await nav(teacher,'/teacher/assignments/'+fixture.assignments[0]);await teacher.getByRole('button',{name:'查看与批阅',exact:true}).click();await teacher.locator('#feedback-score').waitFor();await teacher.screenshot({path:join(out,'drawer-ready-'+width+'.png'),fullPage:false});await teacher.keyboard.press('Escape')
    if(width===390){await student.getByRole('button',{name:'更多导航',exact:true}).click();await student.locator('.workspace-sidebar.is-open').waitFor();await student.keyboard.press('Escape');assert.equal(await student.locator('.workspace-sidebar.is-open').count(),0)}
  }
  assert.deepEqual(errors,[])
  report.checks.push('real dual-window 409 and explicit merge','slow network latest edit preserved','aborted save preserves input and leave cancel','Web preview parent/storage blocked and reset','real session logout then different identity no draft leakage','archived assignment readonly','loaded screenshots 1440/1024/390; mobile menu Escape')
  report.currentStep='completed';report.result=report.skipped.length?'PASS_WITH_SKIPS':'PASS';report.browserErrors=errors;checkpoint()
  console.log(report.result+': boundary results and screenshots: '+out)
}catch(e){report.result='FAIL';checkpoint();console.error('Boundary acceptance failed; partial report: '+out);await page.screenshot({path:join(out,'boundary-failure.png'),fullPage:false}).catch(()=>{});process.exitCode=1}finally{await browser.close()}
