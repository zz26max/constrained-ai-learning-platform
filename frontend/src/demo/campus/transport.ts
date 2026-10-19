import type { components } from '../../api/generated/schema'
import type { Transport, TransportRequest, TransportResponse } from '../../api/transport'
import { createCampusState, config, student, term, uid, type CampusState, type CampusCourse } from './data'
import { DEMO_NOW } from './clock'
import { matchesTask, byDeadline } from '../../features/assignments/task-presentation'
type S=components['schemas']
const CSRF='campus-isolated-csrf'
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const file=(v:unknown):v is S['FileDTO']=>object(v)&&typeof v.path==='string'&&typeof v.content==='string'&&v.content.length<=200000
export function courseProgress(c:CampusCourse):S['ProgressDTO']{
 const completed=c.chapters.filter(ch=>ch.studentProgress.status==='completed').length,total=c.chapters.length
 return {unit:'chapter',completed,total,percent:total?Math.round(completed/total*100):0,notConfigured:total===0,asOf:DEMO_NOW}
}
function assignmentSummary(a:S['AssignmentDetailDTO']):S['AssignmentSummaryDTO']{
 const {id,offeringId,offeringStatus,chapterId,title,type,isRequired,publicationState,description,dueAt,assignmentState,overdue,latestSubmissionId,publishedFeedbackId,unreadFeedback}=a
 return {id,offeringId,offeringStatus,chapterId,title,type,isRequired,publicationState,description,dueAt,assignmentState,overdue,latestSubmissionId,publishedFeedbackId,unreadFeedback}
}
function submissionSummary(s:S['SubmissionDetailDTO']):S['SubmissionSummaryDTO']{const {files,reflection,assignmentSnapshot,publishedFeedback,...summary}=s;return summary}
function chapterSummary(c:S['ChapterDetailDTO']):S['ChapterSummaryDTO']{const {resources,knowledgePoints,assignments,...summary}=c;return summary}
export function courseSummaries(state:CampusState):S['CourseSummaryDTO'][] {
 return state.courses.map(c=>{
  const tasks=state.assignments.filter(a=>a.offeringId===c.offering.id),current=c.chapters.find(ch=>ch.id===c.lastChapterId)??c.chapters.find(ch=>ch.studentProgress.status!=='completed')??c.chapters[0]
  return {offeringId:c.offering.id,courseId:c.offering.courseId,title:c.offering.title,mark:c.offering.mark,groupName:c.offering.groupName,termId:term.id,termLabel:term.label,status:c.offering.status,teachers:c.offering.teachers,progress:courseProgress(c),currentChapter:current?{id:current.id,title:current.title,number:current.number}:null,lastStudiedAt:c.lastStudiedAt,pendingAssignmentCount:tasks.filter(a=>matchesTask(a,'todo')).length,unreadFeedbackCount:tasks.filter(a=>a.unreadFeedback).length}
 })
}
function paginate<T>(items:T[],q:URLSearchParams){const page=Number(q.get('page')??1),pageSize=Number(q.get('pageSize')??20);return {items:items.slice((page-1)*pageSize,page*pageSize),page,pageSize,total:items.length}}
export function createCampusTransport():{transport:Transport;state:CampusState}{
 const state=createCampusState();let authenticated=true,sequence=0
 const response=(request:TransportRequest,data:unknown,status=200):TransportResponse=>({status,headers:{'content-type':'application/json','cache-control':'no-store'},bodyText:JSON.stringify({data,requestId:request.headers['X-Request-ID']??'campus-'+ ++sequence})})
 const fail=(r:TransportRequest,status:number,code:string,message:string,details:unknown={})=>({...response(r,null,status),bodyText:JSON.stringify({error:{code,message,details},requestId:r.headers['X-Request-ID']??'campus-error'})})
 const transport:Transport={async request(r,signal){
  signal?.throwIfAborted()
  const url=new URL(r.path,'http://campus.invalid'),q=url.searchParams,parts=url.pathname.split('/').filter(Boolean),last=parts.at(-1),body:unknown=r.body?JSON.parse(r.body):{}
  const operation=r.operationId
  if(operation==='getCsrfToken')return response(r,{csrfToken:CSRF})
  if(r.method!=='GET'&&r.headers['X-CSRF-Token']!==CSRF)return fail(r,403,'CSRF_INVALID','演示令牌无效，请重置演示。')
  if(operation==='login'){
   if(!object(body)||body.username!=='campus.student'||body.password!=='campus-preview')return fail(r,401,'INVALID_CREDENTIALS','仅支持演示账号campus.student / campus-preview。')
   authenticated=true;return response(r,{user:student,csrfToken:CSRF})
  }
  if(!authenticated)return fail(r,401,'UNAUTHENTICATED','演示会话已退出，请重置或重新登录。')
  if(operation==='getMe')return response(r,student)
  if(operation==='getConfig')return response(r,config)
  if(operation==='logout'){authenticated=false;return response(r,{loggedOut:true})}
  const course=state.courses.find(c=>c.offering.id===parts[3])
  const assignment=state.assignments.find(a=>a.id===(parts[2]==='assignments'?parts[3]:last))
  if(operation==='listMyCourses')return response(r,paginate(courseSummaries(state).filter(c=>(!q.get('termId')||c.termId===q.get('termId'))&&((q.get('status')??'active')==='all'||c.status===(q.get('status')??'active'))),q))
  if(operation==='getOffering'&&course)return response(r,course.offering)
  if(operation==='listChapters'&&course)return response(r,{offeringId:course.offering.id,items:course.chapters.map(ch=>chapterSummary({...ch,assignmentCount:state.assignments.filter(a=>a.chapterId===ch.id).length}))})
  const chCourse=state.courses.find(c=>c.chapters.some(ch=>ch.id===parts[3])),chapter=chCourse?.chapters.find(ch=>ch.id===parts[3])
  if(operation==='getChapter'&&chapter)return response(r,{...chapter,assignmentCount:state.assignments.filter(a=>a.chapterId===chapter.id).length,assignments:state.assignments.filter(a=>a.chapterId===chapter.id).map(assignmentSummary)})
  if(operation==='updateChapterProgress'&&chapter&&chCourse&&object(body)&&['completed','in_progress'].includes(String(body.status))){
   if(chCourse.offering.status==='archived')return fail(r,409,'OFFERING_ARCHIVED','演示历史课程只读。')
   chapter.studentProgress={status:body.status==='completed'?'completed':'in_progress',completedAt:body.status==='completed'?DEMO_NOW:null}
   return response(r,{chapterId:chapter.id,studentProgress:chapter.studentProgress,courseProgress:courseProgress(chCourse)} satisfies S['ChapterProgressDTO'])
  }
  if(operation==='recordLearningPosition'&&object(body)){
   const c=state.courses.find(c=>c.offering.id===body.offeringId),ch=c?.chapters.find(ch=>ch.id===body.chapterId)
   if(!c||!ch)return fail(r,404,'NOT_FOUND','演示章节不存在。')
   if(c.offering.status==='archived')return fail(r,409,'OFFERING_ARCHIVED','演示历史课程只读。')
   c.lastChapterId=ch.id;c.lastStudiedAt=DEMO_NOW
   return response(r,{offeringId:c.offering.id,lastChapterId:ch.id,lastStudiedAt:DEMO_NOW} satisfies S['LearningPositionDTO'])
  }
  if(operation==='listMyAssignments'){
   const filter=q.get('filter')??'all'
   if(!['all','todo','done'].includes(filter))return fail(r,422,'VALIDATION_ERROR','无效的作业筛选。')
   const scope=state.assignments.filter(a=>(!q.get('offeringId')||a.offeringId===q.get('offeringId'))&&(!q.get('termId')||q.get('termId')===term.id))
   const todo=scope.filter(a=>matchesTask(a,'todo')),done=scope.filter(a=>a.assignmentState==='SUBMITTED'||a.assignmentState==='REVIEWED')
   const items=(filter==='todo'?todo:filter==='done'?done:scope).sort(byDeadline).map(assignmentSummary)
   return response(r,{...paginate(items,q),summary:{allCount:scope.length,todoCount:todo.length,doneCount:done.length,archivedIncompleteCount:scope.length-todo.length-done.length}} satisfies S['Response_listMyAssignments']['data'])
  }
  if(operation==='getAssignment'&&assignment)return response(r,assignment)
  if(operation==='getWorkspace'&&assignment)return response(r,state.workspaces.get(assignment.id))
  if(operation==='saveWorkspace'&&assignment&&object(body)){
   const w=state.workspaces.get(assignment.id)!
   if(body.baseRevision!==w.revision)return fail(r,409,'VERSION_CONFLICT','演示版本冲突，请读取最新内容。',{currentRevision:w.revision})
   if(!Array.isArray(body.files)||!body.files.every(file)||body.files.length!==w.files.length||body.files.some(f=>!w.files.some(old=>old.path===f.path))||!w.files.some(f=>f.path===body.activeFile))return fail(r,422,'VALIDATION_ERROR','文件清单不符合演示作业要求。')
   const active=body.activeFile
   if(active!=='index.html'&&active!=='style.css'&&active!=='script.js'&&active!=='answer.sql'&&active!=='answer.md')return fail(r,422,'VALIDATION_ERROR','无效的活动文件。')
   w.files=structuredClone(body.files);w.activeFile=active;w.revision++;w.savedAt=DEMO_NOW
   if(assignment.assignmentState==='NOT_STARTED')assignment.assignmentState='IN_PROGRESS'
   return response(r,w)
  }
  if(operation==='submitAssignment'&&assignment&&object(body)){
   const w=state.workspaces.get(assignment.id)!,previous=state.submissions.find(s=>s.assignmentId===assignment.id&&s.workspaceRevision===body.workspaceRevision)
   if(previous)return response(r,submissionSummary(previous))
   if(!assignment.canSubmit)return fail(r,409,'SUBMISSION_CLOSED','此演示任务当前不可提交。')
   if(body.workspaceRevision!==w.revision)return fail(r,409,'VERSION_CONFLICT','必须提交已保存的演示版本。',{currentRevision:w.revision})
   if(typeof body.reflection!=='string'||!body.reflection.trim())return fail(r,422,'VALIDATION_ERROR','请填写提交反思。')
   const snapshot:S['SubmissionDetailDTO']={id:uid(9000+sequence++),assignmentId:assignment.id,offeringId:assignment.offeringId,attemptNumber:assignment.attemptsUsed+1,workspaceRevision:w.revision,submittedAt:DEMO_NOW,late:Date.parse(assignment.dueAt)<Date.parse(DEMO_NOW),superseded:false,feedbackStatus:'none',files:structuredClone(w.files),reflection:body.reflection,assignmentSnapshot:{title:assignment.title,requirements:structuredClone(assignment.requirements),rubric:structuredClone(assignment.rubric),maxScore:assignment.maxScore,knowledgePoints:[],contentVersion:1,dueAt:assignment.dueAt,aiPolicyVersion:null},publishedFeedback:null}
   state.submissions.filter(s=>s.assignmentId===assignment.id).forEach(s=>s.superseded=true);state.submissions.unshift(snapshot)
   assignment.latestSubmissionId=snapshot.id;assignment.assignmentState='SUBMITTED';assignment.overdue=false;assignment.attemptsUsed++
   if(assignment.attemptsUsed>=assignment.maxAttempts){assignment.canSubmit=false;assignment.submissionBlockedReason='ATTEMPT_LIMIT_REACHED'}
   return response(r,submissionSummary(snapshot),201)
  }
  if(operation==='listMySubmissions'&&assignment)return response(r,paginate(state.submissions.filter(s=>s.assignmentId===assignment.id).map(submissionSummary),q))
  if(operation==='getSubmission'){const s=state.submissions.find(s=>s.id===last);if(s)return response(r,s)}
  if(operation==='getFeedback'){const f=state.feedbacks.find(f=>f.id===last);if(f)return response(r,f)}
  if(operation==='listMessages'){
   const items=state.messages.filter(m=>(q.get('read')!=='unread'||m.readAt===null)&&(!q.get('type')||m.type===q.get('type'))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id))
   return response(r,{...paginate(items,q),summary:{unreadCount:state.messages.filter(m=>m.readAt===null).length}})
  }
  if(operation==='readMessage'){
   const m=state.messages.find(m=>m.id===parts[4]);if(m){m.readAt??=DEMO_NOW;const a=state.assignments.find(a=>a.publishedFeedbackId===m.target?.id);if(a)a.unreadFeedback=false;return response(r,{id:m.id,readAt:m.readAt} satisfies S['MessageReadDTO'])}
  }
  if(operation==='markMessagesAsRead'){
   
   for(const m of state.messages)if(m.offeringId===parts[4]&&m.readAt===null&&(!q.get('type')||m.type===q.get('type'))){m.readAt=DEMO_NOW;const a=state.assignments.find(a=>a.publishedFeedbackId===m.target?.id);if(a)a.unreadFeedback=false}
   return response(r,{markedAt:DEMO_NOW} satisfies S['MarkedReadDTO'])
  }
  if(operation==='getDashboard'){
   const tasks=state.assignments.filter(a=>matchesTask(a,'todo')).sort(byDeadline),first=tasks.find(a=>a.canSubmit),feedbacks=[...state.feedbacks].sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt))
   const data:S['DashboardDTO']={termId:term.id,termLabel:term.label,serverTime:DEMO_NOW,courseCount:state.courses.filter(c=>c.offering.status==='active').length,pendingAssignmentCount:tasks.length,unreadMessageCount:state.messages.filter(m=>m.readAt===null).length,currentLearning:first?{type:'assignment',offeringId:first.offeringId,chapterId:first.chapterId,assignmentId:first.id,title:first.title,description:first.description,assignmentType:first.type,assignmentState:first.assignmentState,dueAt:first.dueAt,overdue:first.overdue,resume:null}:null,otherPendingAssignments:tasks.filter(a=>a.id!==first?.id).slice(0,2).map(assignmentSummary),courses:courseSummaries(state).filter(c=>c.status==='active').slice(0,6),recentFeedback:feedbacks[0]??null,recentNotice:[...state.messages].filter(m=>m.type==='course_notice').sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0]??null}
   return response(r,data)
  }
  if(operation==='getMyLearningRecords'){
   const id=parts[4],c=state.courses.find(c=>c.offering.id===id);if(c){const feedbacks=state.feedbacks.filter(f=>f.offeringId===id).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));return response(r,{offeringId:c.offering.id,summary:{completedLabCount:state.submissions.filter(s=>s.offeringId===id&&!s.superseded&&state.assignments.find(a=>a.id===s.assignmentId)?.type==='web_lab').length,publishedFeedbackCount:feedbacks.length,needsPracticeCount:null},recentFeedback:feedbacks[0]??null,feedbackPage:paginate(feedbacks,q),knowledgeEvidence:[],nextRecommendation:null} satisfies S['LearningRecordsDTO'])}
  }
  if(operation==='listNotices')return response(r,paginate(state.notices.filter(n=>n.offeringId===parts[3]),q))
  if(operation==='getNotice'){const n=state.notices.find(n=>n.id===last);if(n)return response(r,n)}
  return fail(r,404,'NOT_FOUND','该对象或操作未包含在高校演示中；不会转发真实请求。')
 }}
 return {transport,state}
}
