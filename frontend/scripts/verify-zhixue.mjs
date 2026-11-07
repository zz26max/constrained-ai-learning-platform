// Real-browser acceptance. Reads ignored local demo credentials in memory; never logs them.
import { chromium } from 'playwright-core'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
const env=Object.fromEntries(readFileSync(new URL('../../backend/.env',import.meta.url),'utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>{const at=l.indexOf('=');return [l.slice(0,at),l.slice(at+1)]}))
const out=new URL('../.cache/zhixue/',import.meta.url);mkdirSync(out,{recursive:true})
const base='http://127.0.0.1:4173/'
const shotPath=name=>fileURLToPath(new URL(name,out))
const browser=await chromium.launch({channel:'msedge',headless:true})
const errors=[]
const contexts=[]
async function login(role){const ctx=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});contexts.push(ctx);const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(45000);p.on('dialog',d=>d.accept());p.on('response',r=>{if(new URL(r.url()).pathname.startsWith('/api/v1/auth/')||new URL(r.url()).pathname==='/api/v1/me/config') console.log(role+' auth HTTP '+r.status()+' '+new URL(r.url()).pathname)});await p.goto(base+'#/login');await p.locator('#login-username').fill(role+'.demo');await p.locator('#login-password').fill(env['LOCAL_'+role.toUpperCase()+'_PASSWORD']);await p.getByRole('button',{name:'登录',exact:true}).click();await p.waitForURL(u=>!u.hash.startsWith('#/login'),{waitUntil:'domcontentloaded'});console.log(role+' signed in');return p}
async function nav(p,path){await p.goto(base+'#'+path);await p.locator('main h1').waitFor()}
async function api(p,path,method='GET',body){return p.evaluate(async({path,method,body})=>{let token='';if(method!=='GET'){const r=await fetch('/api/v1/auth/csrf-token');token=(await r.json()).data.csrfToken}const r=await fetch('/api/v1'+path,{method,credentials:'include',headers:method==='GET'?{}:{'Content-Type':'application/json','X-CSRF-Token':token},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await r.json();if(!r.ok)throw new Error(method+' '+path+' '+r.status+' '+value.error?.code);return value.data},{path,method,body})}
let teacher,student,offering,chapter,assignments=[]
const prefix='教学闭环验收 '+new Date().toISOString().replace(/[:.]/g,'-')
const dueDate=new Date(Date.now()+14*86400000)
const localDateTime=date=>new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16)
async function archiveOffering(expectedStatus) {
  await nav(teacher,'/teacher/offerings/'+offering)
  await teacher.getByRole('button',{name:'归档教学班',exact:true}).click()
  const dialog=teacher.getByRole('dialog')
  await dialog.getByLabel('我确认归档这个教学班',{exact:true}).check()
  const response=teacher.waitForResponse(r=>r.url().endsWith('/'+offering+'/archive')&&r.request().method()==='POST')
  await dialog.getByRole('button',{name:'确认归档',exact:true}).click()
  const result=await response;assert.equal(result.status(),expectedStatus)
  if(expectedStatus===409){
    assert.equal((await result.json()).error.code,'ARCHIVE_PENDING_REVIEWS')
    await dialog.getByRole('button',{name:'取消',exact:true}).click()
  } else {
    await dialog.waitFor({state:'hidden'})
    assert.equal((await result.json()).data.status,'archived')
  }
}
writeFileSync(new URL('result.json',out),JSON.stringify({at:new Date().toISOString(),result:'RUNNING'},null,2))
try {
  teacher=await login('teacher')
  await teacher.getByRole('button',{name:'创建教学班',exact:true}).click()
  await teacher.locator('input[name="base-course"]').first().check()
  await teacher.locator('#offering-title').fill(prefix)
  await teacher.locator('#offering-group').fill('知学界面验收班')
  await teacher.getByRole('dialog').getByRole('button',{name:'创建教学班',exact:true}).click()
  await teacher.waitForURL(/teacher\/offerings\/[a-f0-9-]+$/)
  offering=teacher.url().split('/offerings/')[1]
  await teacher.getByRole('button',{name:'创建章节草稿',exact:true}).click()
  await teacher.locator('#chapter-title').fill('第一章 · 真实接口与学习实践')
  await teacher.locator('#chapter-summary').fill('阅读资料并完成三类作业，使用知学界面完成真实教学闭环。')
  await teacher.getByRole('button',{name:'创建草稿',exact:true}).click()
  await teacher.getByRole('button',{name:'发布章节',exact:true}).click()
  await teacher.getByRole('dialog').getByRole('button',{name:'确认',exact:true}).click()
  await teacher.getByText('章节已发布').first().waitFor().catch(()=>{})
  const chapters=await api(teacher,'/teacher/offerings/'+offering+'/chapters');chapter=chapters.items[0].id
  await teacher.getByRole('button',{name:'邀请码',exact:true}).click()
  await teacher.getByRole('button',{name:'创建邀请码',exact:true}).click()
  await teacher.locator('#invite-expiry').fill(localDateTime(dueDate))
  await teacher.getByRole('dialog').getByRole('button',{name:'创建邀请码',exact:true}).click()
  const invite=await teacher.locator('.teacher-secret code').innerText()
  await teacher.getByRole('button',{name:'已保存，关闭',exact:true}).click()
  student=await login('student')
  await nav(student,'/course');await student.getByRole('button',{name:'加入课程',exact:true}).click()
  await student.getByRole('dialog').getByRole('textbox').fill(invite)
  await student.getByRole('dialog').getByRole('button',{name:'确认加入',exact:true}).click()
  await student.getByRole('dialog').waitFor({state:'hidden'})
  await nav(student,'/course/'+offering+'/chapter/'+chapter)
  await student.getByRole('button',{name:'确认已阅读',exact:true}).click()
  await student.getByRole('button',{name:'已确认阅读',exact:true}).waitFor()
  for(const type of ['web_lab','sql_text','text']) {
    await nav(teacher,'/teacher/offerings/'+offering+'/assignments/new')
    await teacher.locator('#title').fill(prefix+' '+type)
    if(type!=='web_lab'){await teacher.locator('#assignment-type').selectOption(type);await teacher.getByRole('button',{name:'确认切换类型',exact:true}).click()}
    await teacher.locator('#description').fill('使用真实接口验证 '+type+' 保存、提交与批阅。')
    await teacher.locator('#chapter').selectOption(chapter)
    await teacher.locator('fieldset.surface>fieldset').first().locator('textarea').last().fill('完成作品并说明学习过程。')
    await teacher.locator('#dueAt').fill(localDateTime(dueDate))
    await teacher.getByRole('button',{name:'保存',exact:true}).click()
    await teacher.waitForURL(/teacher\/assignments\/[a-f0-9-]+$/)
    const id=teacher.url().split('/assignments/')[1];assignments.push(id)
    await nav(teacher,'/teacher/offerings/'+offering+'/assignments')
    const [publication]=await Promise.all([teacher.waitForResponse(r=>r.url().endsWith('/'+id+'/publish')&&r.request().method()==='POST'),teacher.getByRole('button',{name:'发布',exact:true}).click()]);assert.equal(publication.status(),200)
    await teacher.getByRole('heading',{name:'已发布作业',exact:true}).waitFor()
    await nav(student,'/student/workspaces/'+id)
    await student.locator('textarea.workspace-editor').fill(type==='web_lab'?'<h1>知学真实提交</h1>':type==='sql_text'?'SELECT 1 AS verified;':'# 知学真实作品\n这是本轮前端接入的保存与提交验收。')
    await student.getByRole('button',{name:'提交作业',exact:true}).click()
    await student.locator('#reflection').fill('我通过真实作品验证了保存、提交和教师反馈的完整流程。')
    await student.getByLabel('我确认提交这个版本',{exact:true}).check()
    await student.getByRole('button',{name:'确认提交',exact:true}).click()
    await student.waitForURL(/student\/assignments\/[a-f0-9-]+$/)
    await archiveOffering(409)
    await nav(teacher,'/teacher/assignments/'+id)
    await teacher.getByRole('button',{name:'查看与批阅',exact:true}).click()
    await teacher.locator('dialog.feedback-drawer[open]').waitFor()
    await teacher.locator('#feedback-score').fill('90')
    await teacher.locator('#feedback-comment').fill('知学迁移验收反馈：作品完整，继续保持。')
    await teacher.locator('[id^="rubric-score-"]').fill('90')
    await teacher.getByRole('button',{name:'保存草稿',exact:true}).click()
    await teacher.getByText('反馈草稿已保存',{exact:true}).waitFor()
    await student.reload();await student.getByText('知学迁移验收反馈：作品完整，继续保持。',{exact:true}).waitFor({timeout:500}).then(()=>{throw new Error('Draft leaked')},()=>{})
    await teacher.getByRole('button',{name:'发布并完成',exact:true}).click()
    await teacher.getByRole('button',{name:'确认发布',exact:true}).click()
    await teacher.locator('dialog.feedback-drawer').waitFor({state:'hidden'})
    await student.reload();await student.getByText('知学迁移验收反馈：作品完整，继续保持。',{exact:true}).waitFor()
  }
  for(const width of [1440,1024,390]) {
    await teacher.setViewportSize({width,height:1000});await student.setViewportSize({width,height:1000})
    for(const [p,path,label] of [[student,'/student/home','home'],[student,'/course/'+offering,'course'],[student,'/student/calendar?date='+localDateTime(dueDate).slice(0,10),'calendar'],[teacher,'/teacher/offerings/'+offering,'teacher'],[teacher,'/teacher/assignments/'+assignments[0],'submission']]){
      await nav(p,path);await p.waitForFunction(()=>!Array.from(document.querySelectorAll('[role="status"]')).some(n=>n.textContent?.trim()==='正在加载…'));await p.mouse.move(0,0)
      assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+' overflow '+width)
      assert.equal(await p.locator('nav[aria-label="主导航"] [aria-current="page"]').count(),1)
      await p.screenshot({path:shotPath(label+'-'+width+'.png'),fullPage:true})
    }
    await teacher.getByRole('button',{name:'查看与批阅',exact:true}).click();await teacher.locator('dialog.feedback-drawer[open]').waitFor();await teacher.locator('#feedback-score').waitFor();const footer=await teacher.locator('.feedback-actions').boundingBox();assert.ok(footer.y+footer.height<=1001);await teacher.screenshot({path:shotPath('drawer-'+width+'.png'),fullPage:false});await teacher.keyboard.press('Escape')
  }
  await nav(student,'/student/messages');await student.getByText('反馈',{exact:false}).first().waitFor()
  await nav(student,'/student/progress/'+offering)
  await student.getByText('知学迁移验收反馈：作品完整，继续保持。',{exact:true}).first().waitFor()
  await archiveOffering(200)
  await nav(student,'/student/assignments/'+assignments[0])
  await student.getByText('知学迁移验收反馈：作品完整，继续保持。',{exact:true}).waitFor()
  const archivedDetail=await api(student,'/assignments/'+assignments[0])
  assert.equal(archivedDetail.canSubmit,false)
  assert.equal(archivedDetail.submissionBlockedReason,'OFFERING_ARCHIVED')
  await student.screenshot({path:shotPath('archived-feedback.png'),fullPage:true})
  await nav(student,'/student/workspaces/'+assignments[0])
  await student.locator('textarea.workspace-editor').waitFor()
  assert.equal(await student.locator('textarea.workspace-editor').isDisabled(),true)
  assert.equal(await student.getByRole('button',{name:'提交作业',exact:true}).isDisabled(),true)
  assert.deepEqual(errors,[])
  writeFileSync(new URL('result.json',out),JSON.stringify({at:new Date().toISOString(),offering,chapter,assignments,result:'PASS',scenarios:['teacher creates offering/chapter and publishes','student joins and completes chapter','web/sql/text immediate submit','draft isolation and published feedback','calendar real data','1440/1024/390 no overflow','drawer footer and Escape','pending reviews reject offering archive via UI','learning records show published feedback','reviewed offering archives via UI; historical feedback remains readable and new submission is blocked','archived workspace disables editor and submit'],browserErrors:errors},null,2))
  console.log('PASS: real teaching/student flows, three workspace types, draft/publication, calendar and responsive screenshots. Fixture IDs saved in ignored .cache/zhixue/result.json.')
} catch(error) {
  writeFileSync(new URL('result.json',out),JSON.stringify({at:new Date().toISOString(),offering,chapter,assignments,result:'FAIL',error:error.message,browserErrors:errors},null,2))
  console.error('Acceptance step error:',error.message)
  if(teacher) await teacher.screenshot({path:shotPath('failure-teacher.png'),fullPage:true}).catch(()=>{})
  if(student) await student.screenshot({path:shotPath('failure-student.png'),fullPage:true}).catch(()=>{})
  console.error('Browser acceptance failed; screenshots in .cache/zhixue.');throw error
} finally {await browser.close()}
