// Real services + explicit client fault injection; no mocked successful responses.
import { chromium } from 'playwright-core'
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const env=Object.fromEntries(readFileSync(new URL('../../backend/.env',import.meta.url),'utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)]}))
const fixture=JSON.parse(readFileSync(new URL('../.cache/zhixue/result.json',import.meta.url),'utf8'))
const out=new URL('../.cache/zhixue/',import.meta.url);mkdirSync(out,{recursive:true})
const browser=await chromium.launch({channel:'msedge',headless:true})
const ctx=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'})
const page=await ctx.newPage();page.setDefaultTimeout(30000)
const base='http://127.0.0.1:4173/#'
const api=async(p,path,method='GET')=>p.evaluate(async({path,method})=>{let h={};if(method!=='GET'){const r=await fetch('/api/v1/auth/csrf-token');h['X-CSRF-Token']=(await r.json()).data.csrfToken}const r=await fetch('/api/v1'+path,{method,headers:h});const data=await r.json();return {status:r.status,data:data.data}},{path,method})
async function login(p,role){await p.goto(base+'/login');await p.locator('#login-username').fill(role+'.demo');await p.locator('#login-password').fill(env['LOCAL_'+role.toUpperCase()+'_PASSWORD']);await p.getByRole('button',{name:'登录',exact:true}).click();await p.waitForURL(u=>!u.hash.startsWith('#/login'),{waitUntil:'domcontentloaded'})}
async function nav(p,path){await p.goto(base+path);await p.locator('main h1').waitFor();await p.waitForFunction(()=>!Array.from(document.querySelectorAll('[role=status]')).some(n=>n.textContent?.trim()==='正在加载…'))}
const saved=async(p)=>p.getByText(/已保存 · 版本/).first().waitFor()
const workspace='/student/workspaces/'+fixture.assignments[0]
try{
  await login(page,'student');await nav(page,workspace);await page.locator('textarea.workspace-editor').waitFor()
  const second=await ctx.newPage();await nav(second,workspace)
  await second.locator('textarea.workspace-editor').fill('<h1>第二窗口已保存 '+Date.now()+'</h1>');await saved(second)
  await page.locator('textarea.workspace-editor').fill('<h1>第一窗口本地保留</h1>')
  await page.locator('main [role=alert]').filter({hasText:'工作区已被修改，本地内容已保留。请读取服务端版本并比较。'}).first().waitFor()
  assert.equal(await page.locator('textarea.workspace-editor').inputValue(),'<h1>第一窗口本地保留</h1>')
  await page.getByRole('button',{name:'读取服务端并恢复保存',exact:true}).click()
  await page.getByRole('button',{name:'确认保存编辑器中的合并结果',exact:true}).click();await saved(page);await second.close()
  const pattern='**/api/v1/assignments/'+fixture.assignments[0]+'/workspace'
  await page.route(pattern,async route=>{if(route.request().method()==='PUT')await new Promise(r=>setTimeout(r,800));await route.continue()})
  const started=page.waitForRequest(r=>r.method()==='PUT'&&r.url().endsWith('/workspace'))
  await page.locator('textarea.workspace-editor').fill('<h1>慢网络第一稿</h1>');await started
  await page.locator('textarea.workspace-editor').fill('<h1>慢网络最新稿</h1>');await saved(page)
  assert.equal((await api(page,'/assignments/'+fixture.assignments[0]+'/workspace')).data.files.find(f=>f.path==='index.html').content,'<h1>慢网络最新稿</h1>')
  await page.unroute(pattern)
  // Exercise the existing isolated preview with hostile student content.
  const probe='<script>let a;try{parent.document.body;a="leaked"}catch{a="blocked"}document.body.textContent="parent:"+a;try{parent.localStorage.length;document.body.textContent+=" storage:leaked"}catch{document.body.textContent+=" storage:blocked"}</script>'
  await page.locator('textarea.workspace-editor').fill(probe);await saved(page)
  await page.getByRole('button',{name:'预览当前内容',exact:true}).click()
  const frame=page.frameLocator('iframe[title="学生作品隔离预览"]')
  await frame.getByText('parent:blocked storage:blocked',{exact:true}).waitFor()
  await page.getByRole('button',{name:'重置预览',exact:true}).click();assert.equal(await page.locator('iframe').count(),0)
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
  assert.equal((await api(page,'/auth/logout','POST')).status,200)
  await page.locator('textarea.workspace-editor').fill('<h1>上一用户的私有草稿</h1>')
  await page.locator('#login-username').waitFor()
  await page.locator('#login-username').fill('teacher.demo');await page.locator('#login-password').fill(env.LOCAL_TEACHER_PASSWORD)
  await page.getByRole('button',{name:'登录',exact:true}).click();await page.waitForURL(u=>!u.hash.startsWith('#/login'),{waitUntil:'domcontentloaded'})
  assert.ok(!(await page.locator('body').innerText()).includes('上一用户的私有草稿'))
  const teacher=page
  assert.equal((await api(teacher,'/teacher/assignments/'+fixture.assignments[2]+'/archive','POST')).status,200)
  const studentCtx=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'})
  const student=await studentCtx.newPage();student.setDefaultTimeout(30000);await login(student,'student')
  await nav(student,'/student/workspaces/'+fixture.assignments[2]);await student.locator('textarea.workspace-editor').waitFor();assert.equal(await student.locator('textarea.workspace-editor').isDisabled(),true)
  const mine=(await api(student,'/me/courses?status=all&page=1&pageSize=100')).data.items.map(c=>c.offeringId)
  const foreign=(await api(teacher,'/teacher/offerings?page=1&pageSize=100')).data.items.find(c=>!mine.includes(c.id))
  if(foreign){const denied=await api(student,'/offerings/'+foreign.id);assert.ok([403,404].includes(denied.status))}
  for(const width of [1440,1024,390]){
    await teacher.setViewportSize({width,height:1000});await student.setViewportSize({width,height:1000})
    for(const[p,path,label]of[[teacher,'/teacher/offerings/'+fixture.offering,'teacher-ready'],[student,'/student/calendar?date=2026-11-20','calendar-ready'],[student,'/student/home','home-ready']]){await nav(p,path);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:fileURLToPath(new URL(label+'-'+width+'.png',out)),fullPage:true})}
    await nav(teacher,'/teacher/assignments/'+fixture.assignments[0]);await teacher.getByRole('button',{name:'查看与批阅',exact:true}).click();await teacher.locator('#feedback-score').waitFor();await teacher.screenshot({path:fileURLToPath(new URL('drawer-ready-'+width+'.png',out)),fullPage:false});await teacher.keyboard.press('Escape')
    if(width===390){await student.getByRole('button',{name:'打开导航',exact:true}).click();await student.locator('.workspace-sidebar.is-open').waitFor();await student.keyboard.press('Escape');assert.equal(await student.locator('.workspace-sidebar.is-open').count(),0)}
  }
  writeFileSync(new URL('boundaries.json',out),JSON.stringify({at:new Date().toISOString(),result:'PASS',scenarios:['real dual-window 409 and explicit merge','slow network latest edit preserved','aborted save preserves input and leave cancel','Web preview parent/storage blocked and reset','real session logout then different identity no draft leakage','archived assignment readonly','cross-class denial','loaded screenshots 1440/1024/390; mobile menu Escape']},null,2))
  console.log('PASS: real dual-window conflict, delayed writes, aborted save, preview isolation, session change, archive readonly, cross-class denial; loaded screenshots.')
}catch(e){console.error(e.message);await page.screenshot({path:fileURLToPath(new URL('boundary-failure.png',out)),fullPage:false}).catch(()=>{});throw e}finally{await browser.close()}
