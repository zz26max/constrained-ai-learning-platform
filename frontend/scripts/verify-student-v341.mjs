import {chromium} from 'playwright-core'
import {mkdirSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import assert from 'node:assert/strict'
const out=new URL('../.cache/student-v341/',import.meta.url)
mkdirSync(new URL('comparison/',out),{recursive:true})
mkdirSync(new URL('details/',out),{recursive:true})
mkdirSync(new URL('current/',out),{recursive:true})
const browser=await chromium.launch({channel:'msedge',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1000},timezoneId:'Asia/Shanghai',reducedMotion:'reduce'})
page.setDefaultTimeout(15000)
const base='http://127.0.0.1:4174/campus.html?explore=v34#',checks=[],errors=[],network=[],metrics=[],contrast=[]
page.on('pageerror',e=>errors.push(e.message))
page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))network.push(r.url())})
async function ready(){await page.locator('main h1').waitFor();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('main [role=status]')).some(n=>/正在加载|正在读取|正在确认/.test(n.textContent??'')));assert.equal(await page.locator('main .state-block[role=alert]').count(),0,await page.locator('main').innerText())}
async function go(path,version='v341'){await page.goto(base+path+(path.includes('?')?'&':'?')+'visual='+version);await page.reload();await ready()}
async function version(value){await page.getByRole('button',{name:({v33:'V3.3 对照',v34:'V3.4 预览',v341:'V3.4.1 精修'})[value],exact:true}).click();await ready();assert.equal(await page.locator('.vx-page').count(),value==='v33'?0:1)}
async function snap(name){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:fileURLToPath(new URL(name+'.png',out)),fullPage:true})}
async function fingerprint(){return page.evaluate(async()=>{const api=await import('/src/api/index.ts');return JSON.stringify(await Promise.all([api.coursesApi().listMyCourses({status:'all',pageSize:100}),api.assignmentsApi().listMyAssignments({filter:'all',pageSize:100})]).then(items=>items.map(i=>i.data)))})}
async function reachable(target){await target.evaluate(n=>n.scrollIntoView({block:'center'}));assert.ok(await target.evaluate(n=>{const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===n||n.contains(hit)}),'covered target: '+await target.innerText())}
async function measureContrast(){
 const samples=await page.locator('.vx-page h1,.vx-page h2,.vx-page h3,.vx-page .vx-muted,.vx-page .vx-node-caption,.vx-page .vx-text-action,.vx-page .vx-course-topline,.vx-page .vx-position,.vx-page .vx-agenda-course,.vx-page .vx-agenda-meta,.vx-page .vx-calendar-chip,.vx-page .vx-day-heading>span,.vx-page .vx-week-day span').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>{let e=n,bg='rgb(255, 255, 255)';while(e){const c=getComputedStyle(e).backgroundColor;if(c!=='rgba(0, 0, 0, 0)'&&c!=='transparent'){bg=c;break}e=e.parentElement}return{text:n.textContent?.slice(0,40),fg:getComputedStyle(n).color,bg}}))
 const lum=c=>{const rgb=c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722}
 for(const s of samples){const a=lum(s.fg),b=lum(s.bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);assert.ok(ratio>=4.5,JSON.stringify({...s,ratio}));contrast.push({...s,ratio})}
}
try{
 for(const [name,path] of Object.entries({records:'/student/progress/33000000-0000-4000-8000-000000000100',courses:'/course',calendar:'/student/calendar?date=2026-10-24'})){
  await go(path,'v33');const initial=await fingerprint()
  for(const v of ['v33','v34','v341']){
   if(v!=='v33')await version(v)
   assert.equal(await fingerprint(),initial,'version switching must preserve all scenario data')
   for(const width of [1440,1024,430,390,375,320]){
    await page.setViewportSize({width,height:width>760?1000:844});await page.evaluate(()=>scrollTo(0,0))
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name}/${v}/${width} overflow`)
    if(width===1440||width===390){await snap(`comparison/${name}-${v}-${width}`);if(v==='v341')await snap(`current/${name}-${width===1440?'desktop':'mobile'}`)}
    const actions=page.locator('main a:visible, main button:visible:not(:disabled)')
    if(await actions.count()){await reachable(actions.first());await reachable(actions.last())}
    if(name==='courses')metrics.push({page:name,version:v,width,firstCardHeight:await page.locator(v==='v33'?'.course-row':'.vx-course-sheet').first().evaluate(n=>n.getBoundingClientRect().height)})
    if(v==='v341'&&[1440,390].includes(width)){
     await measureContrast()
     const selectors={records:width===1440?'.vx-path':'.vx-path>li[data-state=in_progress]',courses:'.vx-course-sheet',calendar:width===1440?'.vx-day-cell.selected':'.vx-week-strip'}
     await page.locator(selectors[name]).first().screenshot({path:fileURLToPath(new URL(`details/${name}-${width}.png`,out))})
    }
    checks.push({page:name,version:v,width,overflow:false,actionsReachable:true})
   }
  }
 }
 // Reading labels describe the API state; the action does not grant new permissions.
 await go('/student/progress/33000000-0000-4000-8000-000000000100')
 assert.equal(await page.locator('.vx-path>li[data-state=completed]').first().getByRole('link',{name:'复习章节',exact:false}).count(),1)
 assert.equal(await page.locator('.vx-path>li[data-state=in_progress]').getByRole('link',{name:'继续阅读',exact:false}).count(),1)
 await page.locator('.vx-path>li[data-state=not_started]').getByRole('link',{name:'开始阅读',exact:false}).click();await ready();assert.match(await page.locator('main h1').innerText(),/集合框架/)
 await page.goBack();await ready();assert.equal(await page.locator('.vx-path>li').count(),4)
 checks.push({scenario:'review/continue/start labels and actual chapter entry/back',result:'PASS'})
 // Same instant is one visual heading, but every assignment remains independently addressable.
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:width>760?1000:844});await go('/student/calendar?date=2026-10-24')
  assert.equal(await page.locator('.vx-time-groups>li').count(),1);assert.match(await page.locator('.vx-deadline-heading').innerText(),/18:00/)
  assert.equal(await page.locator('.vx-deadline-heading time').count(),1);assert.equal(await page.locator('.vx-agenda-event').count(),3)
  const ids=await page.locator('.vx-agenda-event').evaluateAll(ns=>ns.map(n=>n.dataset.taskId));assert.equal(new Set(ids).size,3)
  await page.locator('.vx-agenda').evaluate(n=>{const top=document.querySelector('.campus-marker-stack').getBoundingClientRect().height+document.querySelector('.workspace-topbar').getBoundingClientRect().height+12;scrollBy(0,n.getBoundingClientRect().top-top)})
  await page.locator('.vx-agenda').screenshot({path:fileURLToPath(new URL(`details/agenda-${width}.png`,out))})
  await go('/student/calendar?date=2026-10-19');assert.equal(await page.locator('.vx-time-groups>li').count(),2)
  assert.equal(await page.locator('.vx-eligibility').filter({hasText:'允许补交'}).count(),1)
  const today=page.locator(width>760?'.vx-date-button[aria-current=date]':'.vx-week-day[aria-current=date]');assert.equal(await today.getAttribute('aria-pressed'),'true')
  if(width<=760){const sizes=await page.locator('.vx-week-day').evaluateAll(ns=>ns.map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})));assert.ok(sizes.every(s=>s.width>=44&&s.height>=44),JSON.stringify(sizes));checks.push({width,scenario:'seven date targets >=44x44',sizes})}
  await go('/student/calendar?date=2026-10-20');assert.equal(await page.locator('.vx-time-groups>li').count(),1);assert.equal(await page.locator('.vx-agenda-event').count(),1)
  checks.push({width,scenario:'same-time/multiple-time/single task grouping and today-selected combination',result:'PASS'})
 }
 await go('/student/calendar?date=2026-10-18');assert.equal(await page.locator('.vx-eligibility').filter({hasText:'暂不可提交'}).count(),2)
 await go('/student/home');await page.evaluate(async()=>{const api=(await import('/src/api/index.ts')).assignmentsApi(),original=api.getAssignment.bind(api);let fail=true;api.getAssignment=async(...args)=>{if(fail){fail=false;throw new Error('独立故障注入：资格读取失败')}return original(...args)}});await page.evaluate(()=>{location.hash='/student/calendar?date=2026-10-24'});await ready();assert.equal(await page.locator('.vx-eligibility').filter({hasText:'提交资格未确认'}).count(),3);await page.getByRole('button',{name:'重新确认资格',exact:false}).click();await ready();assert.equal(await page.locator('.vx-eligibility').filter({hasText:'可提交'}).count(),3);checks.push({scenario:'eligibility uses actual detail; failed read stays unknown; explicit retry succeeds',result:'PASS'})
 // The shared course filter survives comparison without changing underlying data.
 await go('/course');await page.getByRole('combobox',{name:/课程状态/}).selectOption('all');await ready();assert.equal(await page.locator('.vx-course-sheet').count(),8)
 await version('v33');assert.equal(await page.locator('.course-row').count(),8);await version('v34');assert.equal(await page.locator('.vx-course-sheet').count(),8);await version('v341');assert.equal(await page.locator('.vx-course-sheet').count(),8)
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===1440?1000:844})
  await go('/course');await page.getByRole('link',{name:'学习课程：数据库原理',exact:true}).click();await ready();assert.match(await page.locator('main h1').innerText(),/概念模型与ER设计/)
  await page.getByRole('button',{name:'确认已阅读',exact:true}).click();await page.getByRole('button',{name:'已确认阅读',exact:true}).waitFor()
  await page.evaluate(()=>{location.hash='/student/progress/33000000-0000-4000-8000-000000000101'});await ready();assert.match(await page.locator('.vx-reading-total').innerText(),/4/)
  const modified=await fingerprint();await version('v33');assert.match(await page.locator('.record-section').first().innerText(),/4 \/ 5/);assert.equal(await fingerprint(),modified);await version('v34');assert.equal(await fingerprint(),modified);await version('v341');assert.equal(await fingerprint(),modified)
  await page.getByRole('link',{name:'复习章节',exact:false}).first().click();await ready();await page.goBack();await ready();assert.match(page.url(),/000000000101/)
  await go('/student/progress/33000000-0000-4000-8000-000000000100');await page.getByRole('link',{name:'Java面向对象设计与异常边界分析',exact:false}).click();await ready();await page.getByText('面向对象设计比较清晰，建议进一步改善异常处理。',{exact:true}).waitFor()
  await go('/student/calendar?date=2026-10-24');assert.equal(await page.locator('.vx-agenda-event').count(),3)
  await page.locator('.vx-agenda-event').first().click();await page.getByRole('dialog').getByRole('link',{name:'查看作业'}).click();await ready();await page.goBack();await ready();assert.match(page.url(),/date=2026-10-24/)
  await page.locator('.vx-agenda-event').first().click();await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0)
  await go('/student/calendar?date=2026-10-26');await page.getByRole('button',{name:'查看该日日程',exact:false}).click();await ready();assert.match(page.url(),/date=2026-11-02/)
  checks.push({width,scenario:'continue learning/read persistence across versions/review/feedback/calendar detail/back/Escape/next deadline',result:'PASS'})
 }
 await page.setViewportSize({width:1440,height:1000});await go('/student/calendar?date=2026-10-24');await page.getByRole('button',{name:'周',exact:true}).click();await ready();assert.equal(await page.locator('.vx-day-cell').count(),7);await snap('details/calendar-week')
 await page.setViewportSize({width:320,height:844});await go('/student/calendar?date=2026-10-24');await page.getByRole('button',{name:'下一周',exact:true}).click();await ready();assert.match(page.url(),/date=2026-10-31/)
 for(const [suffix,count] of [['104',1],['106',0],['102',3]]){await go('/student/progress/33000000-0000-4000-8000-000000000'+suffix);assert.equal(await page.locator('.vx-path>li').count(),count);await snap('details/record-'+suffix);await page.setViewportSize({width:1440,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await snap('details/record-'+suffix+'-desktop');await page.setViewportSize({width:320,height:844})}
 // Test-only content injection: separate from the unchanged V3.3 fixture source.
 await go('/student/home');await page.evaluate(async()=>{const api=(await import('/src/api/index.ts')).coursesApi(),original=api.listChapters.bind(api);api.listChapters=async(...args)=>{const result=await original(...args),sample=result.data.items[0];result.data.items=Array.from({length:12},(_,i)=>({...structuredClone(sample),id:'44000000-0000-4000-8000-'+String(i).padStart(12,'0'),number:i+1,title:'边界测试：复杂校园系统中的章节标题与异常边界分析'.repeat(2),studentProgress:{status:i<4?'completed':i===4?'in_progress':'not_started',completedAt:null}}));return result}})
 await page.evaluate(()=>{location.hash='/student/progress/33000000-0000-4000-8000-000000000100'});await ready();assert.equal(await page.locator('.vx-path>li').count(),12);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await reachable(page.locator('.vx-path .vx-text-action').last());await snap('details/boundary-12-long-chapters')
 await page.setViewportSize({width:1440,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await snap('details/boundary-12-long-chapters-desktop');await page.setViewportSize({width:320,height:844})
 await go('/student/home');await page.evaluate(async()=>{const api=(await import('/src/api/index.ts')).coursesApi(),original=api.listMyCourses.bind(api);api.listMyCourses=async(...args)=>{const r=await original(...args);r.data.items[0].title+='：边界测试中的跨学科校园系统设计、实现与应用分析'.repeat(3);return r}});await page.evaluate(()=>{location.hash='/course'});await ready();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await reachable(page.locator('.vx-course-primary').last());await snap('details/boundary-long-course')
 await go('/student/home');await page.evaluate(async()=>{const api=(await import('/src/api/index.ts')).coursesApi(),original=api.listMyCourses.bind(api);api.listMyCourses=async(...args)=>{const r=await original(...args);r.data.items[0].title='独立渲染边界：36个开放章节';r.data.items[0].progress={...r.data.items[0].progress,total:36,completed:18,percent:50};return r}});await page.evaluate(()=>{location.hash='/course'});await ready();assert.equal(await page.locator('.vx-course-sheet').first().locator('.vx-segments i').count(),1);assert.match(await page.locator('.vx-course-sheet').first().innerText(),/36/);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await snap('details/boundary-36-progress')
 // Synthetic rendering fixture only: exercise feedback pagination, never a real demo result.
 await go('/student/home');await page.evaluate(async()=>{const api=(await import('/src/api/index.ts')).dashboardApi(),original=api.getMyLearningRecords.bind(api);api.getMyLearningRecords=async(id,q,...options)=>{const r=await original(id,q,...options),seed=r.data.recentFeedback,page=q?.page??1,items=Array.from({length:12},(_,i)=>({...structuredClone(seed),id:'55000000-0000-4000-8000-'+String(i).padStart(12,'0'),assignmentTitle:'独立排版夹具：较多教师评价与长标题反馈 '+(i+1)}));return {...r,data:{...r.data,summary:{...r.data.summary,publishedFeedbackCount:12},recentFeedback:items[0],feedbackPage:{items:items.slice((page-1)*10,page*10),page,pageSize:10,total:12}}}}});await page.evaluate(()=>{location.hash='/student/progress/33000000-0000-4000-8000-000000000100'});await ready();assert.equal(await page.locator('.vx-feedback-history li').count(),9);await page.getByRole('button',{name:'下一页',exact:true}).click();await ready();assert.equal(await page.locator('.vx-feedback-history li').count(),2);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await snap('details/boundary-many-feedback');checks.push({scenario:'separate rendering fixtures: 36 chapter ratio and 12 feedback pagination',result:'PASS'})
 // Empty-course and failed-read states remain explicit rather than masquerading as success.
 await go('/student/home');await page.evaluate(async()=>{const api=(await import('/src/api/index.ts')).coursesApi(),original=api.listMyCourses.bind(api);api.listMyCourses=async(...args)=>{const r=await original(...args);return {...r,data:{...r.data,items:[],total:0}}}});await page.evaluate(()=>{location.hash='/course'});await ready();assert.match(await page.locator('main').innerText(),/暂无符合条件/)
 await go('/student/home');await page.evaluate(async()=>{(await import('/src/api/index.ts')).coursesApi().listMyCourses=async()=>{throw new Error('V3.4测试故障注入：课程读取失败')}});await page.evaluate(()=>{location.hash='/course'});await page.locator('main [role=alert]').waitFor();assert.equal(await page.locator('.vx-course-sheet').count(),0);await snap('details/boundary-read-error')
 await go('/student/home');await page.evaluate(async()=>{(await import('/src/api/index.ts')).coursesApi().listMyCourses=()=>new Promise(()=>{})});await page.evaluate(()=>{location.hash='/course'});await page.locator('main [role=status]').filter({hasText:'正在加载'}).waitFor();assert.equal(await page.locator('.vx-course-sheet').count(),0);await snap('details/boundary-loading')
 for(const [name,path] of Object.entries({courses:'/course',records:'/student/progress/33000000-0000-4000-8000-000000000100',calendar:'/student/calendar?date=2026-10-24'})){
  await go(path);await page.evaluate(()=>{const samples=[...document.querySelectorAll('main *')].map(e=>[e,parseFloat(getComputedStyle(e).fontSize),parseFloat(getComputedStyle(e).lineHeight)]);for(const [e,f,l] of samples){e.style.setProperty('font-size',f*2+'px','important');if(l)e.style.setProperty('line-height',l*2+'px','important')}})
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await reachable(page.locator('main a:visible,main button:visible:not(:disabled)').last());await snap('details/text-200-'+name)
  checks.push({page:name,width:320,scenario:'200% text and line-height enlargement; page overflow and last action',result:'PASS'})
  await page.setViewportSize({width:720,height:1000});await go(path);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks.push({page:name,width:720,scenario:'720 CSS px reflow',result:'PASS'});await page.setViewportSize({width:320,height:844})
 }
 await go('/student/progress/33000000-0000-4000-8000-000000000100');await page.getByRole('button',{name:'V3.3 对照',exact:true}).focus();assert.ok(await page.getByRole('button',{name:'V3.3 对照',exact:true}).evaluate(n=>getComputedStyle(n).outlineStyle!=='none'));await page.keyboard.press('Enter');await ready();assert.equal(await page.locator('.vx-page').count(),0);await page.getByRole('button',{name:'V3.4 预览',exact:true}).focus();await page.keyboard.press('Enter');await ready();assert.equal(await page.locator('.vx-path>li').count(),4);await page.getByRole('button',{name:'V3.4.1 精修',exact:true}).focus();await page.keyboard.press('Enter');await ready();assert.equal(await page.locator('.vx-refined').count(),1);checks.push({scenario:'three-version keyboard switch and visible focus',result:'PASS'})
 await go('/course');await page.getByRole('button',{name:'更多导航',exact:true}).click();await page.getByRole('navigation',{name:'主导航',exact:true}).getByRole('link',{name:'学习日历',exact:true}).click();await ready();assert.equal(await page.locator('.vx-calendar').count(),1);await page.getByRole('button',{name:'更多导航',exact:true}).click();await page.keyboard.press('Escape');assert.equal(await page.getByRole('button',{name:'更多导航',exact:true}).getAttribute('aria-expanded'),'false');checks.push({scenario:'mobile more navigation, calendar and Escape',result:'PASS'})
 // Non-target pages keep their original component and computed styling.
 for(const path of ['/student/home','/student/assignments','/student/messages']){await go(path);const before=await page.locator('main').innerText();await page.getByRole('button',{name:'V3.3 对照',exact:true}).click();await ready();assert.equal(await page.locator('main').innerText(),before);assert.equal(await page.locator('.vx-page').count(),0)}
 assert.deepEqual(errors,[]);assert.deepEqual(network,[])
 writeFileSync(new URL('result.json',out),JSON.stringify({checks,metrics,contrast,errors,network},null,2))
 const cards=Object.entries({records:'学习记录',courses:'我的课程',calendar:'学习日历'}).map(([key,label])=>`<section><h2>${label}</h2>${[1440,390].map(width=>`<h3>${width===1440?'桌面':'手机'} · ${width}px</h3><div class="pair">${['v33','v34','v341'].map(v=>`<a href="comparison/${key}-${v}-${width}.png"><strong>${v.toUpperCase()}</strong><img src="comparison/${key}-${v}-${width}.png" alt="${label} ${v}" loading="lazy"></a>`).join('')}</div>`).join('')}</section>`).join('')
 const detailLinks=['records-1440','records-390','courses-1440','courses-390','calendar-1440','calendar-390','record-104','record-106','boundary-12-long-chapters','boundary-long-course','boundary-loading','boundary-read-error','text-200-records','text-200-courses','text-200-calendar'].map(n=>`<li><a href="details/${n}.png">${n}</a></li>`).join('')
 writeFileSync(new URL('index.html',out),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>知学V3.4.1三版本对照</title><style>body{font:16px/1.7 system-ui;color:#192c4d;background:#f4f6fb;margin:32px}main{max-width:1440px;margin:auto}section{padding:24px;background:white;margin:24px 0;border:1px solid #d9e1ed;border-radius:12px}.pair{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px}a{color:#2853bc}img{display:block;width:100%;height:600px;object-fit:contain;object-position:top;border:1px solid #ddd}@media(max-width:700px){.pair{grid-template-columns:1fr}body{margin:16px}}</style><main><h1>知学V3.4.1 · 视觉精修</h1><p>同一日期、同一数据、同一状态与视口。依次为V3.3、V3.4、V3.4.1。点击查看原图；18张三版本对照图位于comparison；current仅精修版6张。未替换正式页面。</p>${cards}<section><h2>组件与边界证据</h2><ul>${detailLinks}</ul><p><a href="result.json">验证记录</a></p><p>边界注入仅用于自动测试，不属于正常演示数据。</p></section></main></html>`)
 console.log('PASS: V3.4.1 three-version same-state comparison, '+checks.length+' check records; '+contrast.length+' contrast samples, min '+Math.min(...contrast.map(s=>s.ratio)).toFixed(2)+':1; no real API calls')
}catch(e){console.error('FAILED',page.url(),(await page.locator('main').innerText()).slice(0,2000));await snap('failure');throw e}finally{await browser.close()}
