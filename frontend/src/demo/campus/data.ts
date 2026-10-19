import type { components } from '../../api/generated/schema'
import { DEMO_NOW, at } from './clock'
type S=components['schemas']
export const uid=(n:number)=>'33000000-0000-4000-8000-'+String(n).padStart(12,'0')
export const student:S['UserDTO']={id:uid(1),username:'campus.student',displayName:'李晨（虚构）',roles:['student']}
export const term:S['TermDTO']={id:uid(10),label:'2026—2027 学年第一学期',startsAt:'2026-09-01T00:00:00Z',endsAt:'2027-01-31T15:59:59Z'}
const catalog=[
 {title:'Java 程序设计',mark:'JAVA',teacher:'陈思远',opened:4,read:2,last:3,chapters:['开发环境与基础语法','面向对象基础','继承、多态与接口','集合框架','异常处理与文件操作']},
 {title:'数据库原理',mark:'DB',teacher:'周雨桐',opened:5,read:3,last:4,chapters:['关系模型与数据库系统','关系代数与SQL基础','多表连接与子查询','概念模型与ER设计','事务与并发控制','索引与查询优化']},
 {title:'计算机网络',mark:'NET',teacher:'林知行',opened:3,read:0,last:0,chapters:['网络体系结构','数据链路层与局域网','网络层与TCP/IP','传输层与应用协议']},
 {title:'Web 前端开发',mark:'WEB',teacher:'王若宁',opened:4,read:4,last:4,chapters:['HTML语义与可访问性','CSS布局基础','响应式设计','DOM与事件处理','组件化开发入门']},
 {title:'软件工程基础',mark:'SE',teacher:'许明哲',opened:1,read:1,last:1,chapters:['软件过程与需求分析','用例建模与分析','设计与质量保证']},
 {title:'数据结构与算法',mark:'DSA',teacher:'赵清禾',opened:4,read:1,last:2,chapters:['算法复杂度','线性表与栈队列','树与二叉树','查找与排序','图算法','综合应用']},
 {title:'人工智能导论',mark:'AI',teacher:'沈亦辰',opened:0,read:0,last:0,chapters:['智能系统与问题求解','搜索策略','机器学习基础']},
 {title:'数字媒体技术实践',mark:'MEDIA',teacher:'唐一帆',opened:2,read:0,last:0,chapters:['视觉叙事与素材组织','交互媒体作品展示']},
]
export type CampusCourse={offering:S['OfferingDTO'];chapters:S['ChapterDetailDTO'][];lastChapterId:string|null;lastStudiedAt:string|null}
export type CampusState={courses:CampusCourse[];assignments:S['AssignmentDetailDTO'][];workspaces:Map<string,S['WorkspaceDTO']>;submissions:S['SubmissionDetailDTO'][];feedbacks:S['StudentFeedbackDTO'][];messages:S['NotificationDTO'][];notices:S['NoticeDTO'][]}
const rubric:S['RubricCriterion'][]=[{criterionId:'understanding',title:'原理理解与实现',description:'论证清晰、实现符合要求',maxScore:70},{criterionId:'expression',title:'表达与反思',description:'说明完整，反思具体',maxScore:30}]
export function createCampusState():CampusState{
 const courses:CampusCourse[]=catalog.map((c,i)=>{
  const offering:S['OfferingDTO']={id:uid(100+i),courseId:uid(200+i),title:c.title,mark:c.mark,groupName:i===7?'数媒2302班':'计算机2401班',termId:term.id,termLabel:term.label,status:i===7?'archived':'active',progressUnit:'chapter',teachers:[{id:uid(20+i),displayName:c.teacher}]}
  const chapters:S['ChapterDetailDTO'][]=c.chapters.slice(0,c.opened).map((title,j)=>({id:uid(1000+i*20+j),offeringId:offering.id,number:j+1,title,summary:'## 学习目标\n理解'+title+'的基本概念，并解释其在'+c.title+'中的作用。\n\n## 课堂实践\n以校园系统为例，先描述输入、处理过程与预期输出，再对照课堂笔记检查正常情况和异常边界。\n\n## 阅读后自检\n用自己的话复述一个核心概念；列举一个适用场景；记录一个仍需课堂讨论的问题。',isRequired:true,publicationState:'published',contentVersion:1,resourceCount:0,assignmentCount:0,studentProgress:{status:j<c.read?'completed':j+1===c.last?'in_progress':'not_started',completedAt:j<c.read?at(-24*(c.read-j)-i):null},resources:[],knowledgePoints:[],assignments:[]}))
  return {offering,chapters,lastChapterId:c.last?chapters[c.last-1]!.id:null,lastStudiedAt:c.last?at(-1-i*2):null}
 })
 const specs:[number,string,S['AssignmentType'],S['AssignmentState'],number][]=[
  [0,'面向对象程序设计：学生选课系统中的继承、多态与接口实践','text','IN_PROGRESS',8],
  [1,'SQL多表查询实验：图书借阅与读者信息统计','sql_text','IN_PROGRESS',32],
  [2,'TCP/IP协议分层与校园网数据包分析','text','NOT_STARTED',56],
  [3,'CSS响应式布局：为校园活动设计报名页面','web_lab','NOT_STARTED',104],
  [4,'软件需求分析报告：校园失物招领平台','text','NOT_STARTED',128],
  [5,'栈与队列：表达式求值与任务调度','text','IN_PROGRESS',128],
  [0,'Java集合框架练习：学生成绩统计与排序','text','NOT_STARTED',128],
  [1,'数据库概念模型设计：实验室设备借用系统','text','SUBMITTED',72],
  [2,'IPv4子网划分与路由规划','text','REVIEWED',-48],
  [3,'DOM事件与表单校验实践','web_lab','REVIEWED',-24],
  [0,'Java面向对象设计与异常边界分析','text','REVIEWED',-96],
  [5,'排序算法比较与复杂度分析','text','REVIEWED',-144],
  [4,'用例描述：图书预约的主流程与异常流程','text','SUBMITTED',56],
  [1,'关系代数与基础查询练习','sql_text','NOT_STARTED',-16],
  [0,'基础语法查错与程序阅读','text','IN_PROGRESS',-40],
  [2,'TCP/IP协议分析：一次校园网访问中的分层通信过程','text','IN_PROGRESS',-4],
  [5,'二叉树遍历与表达式树构造','text','NOT_STARTED',152],
  [3,'Web综合实践：可访问的课程作品展示页','web_lab','NOT_STARTED',344],
 ]
 const assignments:S['AssignmentDetailDTO'][]=specs.map(([ci,title,type,assignmentState,h],i)=>{
  const c=courses[ci]!,id=uid(3000+i),overdue=h<0,lateUntil=i===15?at(44):null
  const blocked=i===13||i===14,done=assignmentState==='SUBMITTED'||assignmentState==='REVIEWED'
  return {id,offeringId:c.offering.id,offeringStatus:c.offering.status,chapterId:c.chapters[[2,2,2,2,0,1,3,3,2,3,1,3,0,1,0,2,2,3][i]!]!.id,title,type,isRequired:true,publicationState:'published',description:'请结合'+c.offering.title+'的课堂案例完成练习。所有提交仅保存在本演示标签页内。',dueAt:at(h),assignmentState,overdue:overdue&&!done,latestSubmissionId:done?uid(4000+i):null,publishedFeedbackId:assignmentState==='REVIEWED'?uid(5000+i):null,unreadFeedback:assignmentState==='REVIEWED'&&i%2===0,requirements:['说明问题分析与设计思路','提交实现或实验过程，并记录一次具体反思'],estimatedMinutes:i%3===0?90:60,maxScore:100,rubric:structuredClone(rubric),knowledgePointIds:[],lateUntil,allowResubmit:true,maxAttempts:3,attemptsUsed:done?1:0,canSubmit:!blocked&&assignmentState!=='REVIEWED',submissionBlockedReason:blocked?'SUBMISSION_CLOSED':assignmentState==='REVIEWED'?'RESUBMIT_AFTER_REVIEW':null,aiPolicyVersion:null}
 })
 const files=(a:S['AssignmentDetailDTO']):S['FileDTO'][]=>a.type==='web_lab'?[{path:'index.html',content:'<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>校园作品</title><link rel="stylesheet" href="style.css"></head><body><h1>校园活动报名</h1><p>欢迎参加实践活动。</p><script src="script.js"></script></body></html>'},{path:'style.css',content:'body { font-family: sans-serif; margin: 24px; }'},{path:'script.js',content:'// 在此实现交互逻辑\n'}]:[{path:a.type==='sql_text'?'answer.sql':'answer.md',content:a.type==='sql_text'?'-- 请在这里编写查询，并解释连接条件\nSELECT * FROM books;':'# 实践记录\n\n## 问题分析\n请结合课堂内容完善分析和实现。\n'}]
 const workspaces=new Map<string,S['WorkspaceDTO']>(assignments.map(a=>[a.id,{assignmentId:a.id,revision:1,files:files(a),activeFile:a.type==='web_lab'?'index.html':a.type==='sql_text'?'answer.sql':'answer.md',savedAt:at(-2),canSave:true,saveBlockedReason:null}]))
 const feedbacks:S['StudentFeedbackDTO'][]=[]
 const submissions:S['SubmissionDetailDTO'][]=[]
 const comments=['子网划分正确，后续请为路由选择补充必要的说明。','整体完成较好，但实验报告需要进一步补充结果分析。','面向对象设计比较清晰，建议进一步改善异常处理。','算法比较充分，注意区分平均复杂度与最坏情况。']
 for(const [i,a] of assignments.entries())if(a.latestSubmissionId){
  const reviewed=a.assignmentState==='REVIEWED',dueOffset=specs[i]![4],submittedAt=reviewed?at(dueOffset-24):at(i===7?-4:-2)
  let feedback:S['StudentFeedbackDTO']|null=null
  if(reviewed){const index=[8,9,10,11].indexOf(i),score=[86,92,88,79][index]!
   feedback={id:a.publishedFeedbackId!,submissionId:a.latestSubmissionId,offeringId:a.offeringId,assignmentId:a.id,assignmentTitle:a.title,version:1,status:'published',score,maxScore:100,rubricResults:[{criterionId:'understanding',score:score-25,comment:'原理与实现符合要求。'},{criterionId:'expression',score:25,comment:'请继续完善反思与表达。'}],comment:comments[index]!,knowledgeEvaluations:[],issueTags:[],issueTagVersion:null,teacher:courses.find(c=>c.offering.id===a.offeringId)!.offering.teachers[0]!,publishedAt:at(dueOffset+12),messageId:uid(6000+i)}
   feedbacks.push(feedback)
  }
  workspaces.get(a.id)!.savedAt=submittedAt
  submissions.push({id:a.latestSubmissionId,assignmentId:a.id,offeringId:a.offeringId,attemptNumber:1,workspaceRevision:1,submittedAt,late:false,superseded:false,feedbackStatus:reviewed?'published':'none',files:structuredClone(workspaces.get(a.id)!.files),reflection:'完成了课堂要求；仍需通过更多边界案例检验实现。',assignmentSnapshot:{title:a.title,requirements:a.requirements,rubric:a.rubric,maxScore:a.maxScore,knowledgePoints:[],contentVersion:1,dueAt:a.dueAt,aiPolicyVersion:null},publishedFeedback:feedback})
 }
 const notices:S['NoticeDTO'][]=[{id:uid(7000),offeringId:uid(101),title:'数据库实验答疑安排',content:'本周一18:30—19:30在实验楼302开展SQL实验答疑。请先整理查询结果与遇到的问题。',target:null,createdAt:at(-17),recipientCount:36},{id:uid(7001),offeringId:uid(104),title:'需求分析讨论调整至周四下午',content:'本周课堂讨论调整至周四14:00，地点为教学楼B204。请携带小组需求草稿与用例清单。\n\n讨论重点是需求边界与异常流程，每组准备5分钟说明。',target:null,createdAt:at(-20),recipientCount:36},{id:uid(7002),offeringId:uid(102),title:'网络实验提交与报告说明',content:'协议分析练习保留补交窗口。请在作业详情核对截止时间，并在报告中区分观察结果与推断。',target:null,createdAt:at(-1),recipientCount:36}]
 const messages:S['NotificationDTO'][]=[]
 for(const f of feedbacks)messages.push({id:f.messageId,offeringId:f.offeringId,type:'feedback',title:'评价已发布：'+f.assignmentTitle,content:f.comment,target:{type:'feedback',id:f.id,offeringId:f.offeringId},sender:f.teacher,createdAt:f.publishedAt,readAt:assignments.find(a=>a.id===f.assignmentId)!.unreadFeedback?null:at(-1)})
 for(const i of [0,1,2,3,4,5]){const a=assignments[i]!;messages.push({id:uid(6100+i),offeringId:a.offeringId,type:'assignment_published',title:'新作业：'+a.title,content:'请结合课堂资料完成分析与实践。截止时间：'+new Date(a.dueAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+'（北京时间）。',target:{type:'assignment',id:a.id,offeringId:a.offeringId},sender:courses.find(c=>c.offering.id===a.offeringId)!.offering.teachers[0]!,createdAt:at([-20,-21,-22,-44,-45,-46][i]!),readAt:i%3===0?at(-3):null})}
 for(const [i,n] of notices.entries())messages.push({id:uid(6200+i),offeringId:n.offeringId,type:'course_notice',title:n.title,content:n.content,target:null,sender:courses.find(c=>c.offering.id===n.offeringId)!.offering.teachers[0]!,createdAt:n.createdAt,readAt:i===0?at(-2):null})
 for(const i of [0,1]){const a=assignments[i]!;messages.push({id:uid(6300+i),offeringId:a.offeringId,type:'system',title:i===0?'选课系统练习将在今天截止':'SQL实验将于明天截止',content:'请核对作业要求与当前提交资格。截止于'+new Date(a.dueAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+'（北京时间），保存练习不会自动提交。',target:{type:'assignment',id:a.id,offeringId:a.offeringId},sender:null,createdAt:at(-.5-i),readAt:null})}
 messages.push({id:uid(6400),offeringId:uid(105),type:'system',title:'算法实践资料已整理',content:'阅读本周章节后，可以对照课堂案例梳理复杂度分析方法。',target:{type:'offering',id:uid(105),offeringId:uid(105)},sender:null,createdAt:at(-52),readAt:at(-4)})
 return {courses,assignments,workspaces,submissions,feedbacks,messages,notices}
}
export const config:S['ConfigDTO']={apiVersion:'v1',serverTime:DEMO_NOW,timezone:'Asia/Shanghai',currentTermId:term.id,terms:[term],features:{aiTutoring:false,learningAnalytics:false,serverChecks:false}}
