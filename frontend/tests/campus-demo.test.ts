/// <reference types="node" />
import { describe, it, expect, vi } from 'vitest'
import { createCampusTransport, courseSummaries } from '../src/demo/campus/transport'
import { DEMO_NOW, DEMO_EPOCH, installCampusClock } from '../src/demo/campus/clock'
import type { TransportRequest } from '../src/api/transport'
import { mkdirSync, writeFileSync } from 'node:fs'

function setup(){
 const demo=createCampusTransport()
 const call=async(operationId:string,path:string,body?:unknown)=>{
  const r:TransportRequest={operationId,path,method:body===undefined?'GET':'POST',headers:{'X-CSRF-Token':'campus-isolated-csrf'},...(body===undefined?{}:{body:JSON.stringify(body)})}
  const response=await demo.transport.request(r)
  return {status:response.status,...JSON.parse(response.bodyText)}
 }
 return {...demo,call}
}
describe('isolated campus scenario',()=>{
 it('exports successful wire envelopes for independent OpenAPI schema verification',async()=>{
  const {state,transport}=setup(),samples:{operationId:string;envelope:unknown}[]=[]
  async function capture(operationId:string,path:string,body?:unknown){const r=await transport.request({operationId,path,method:body===undefined?'GET':'POST',headers:{'X-CSRF-Token':'campus-isolated-csrf'},...(body===undefined?{}:{body:JSON.stringify(body)})});expect(r.status).toBeLessThan(300);samples.push({operationId,envelope:JSON.parse(r.bodyText)})}
  for(const [op,path] of [['getCsrfToken','/api/v1/auth/csrf-token'],['getMe','/api/v1/me'],['getConfig','/api/v1/me/config'],['getDashboard','/api/v1/me/dashboard'],['listMyCourses','/api/v1/me/courses?status=all'],['listMyAssignments','/api/v1/me/assignments'],['listMessages','/api/v1/me/messages']])await capture(op!,path!)
  for(const c of state.courses){await capture('getOffering','/api/v1/offerings/'+c.offering.id);await capture('listChapters','/api/v1/offerings/'+c.offering.id+'/chapters');await capture('getMyLearningRecords','/api/v1/me/offerings/'+c.offering.id+'/learning-records');for(const ch of c.chapters)await capture('getChapter','/api/v1/chapters/'+ch.id)}
  for(const a of state.assignments){await capture('getAssignment','/api/v1/assignments/'+a.id);await capture('getWorkspace','/api/v1/assignments/'+a.id+'/workspace');await capture('listMySubmissions','/api/v1/assignments/'+a.id+'/submissions')}
  for(const f of state.feedbacks)await capture('getFeedback','/api/v1/me/feedback/'+f.id)
  for(const s of state.submissions)await capture('getSubmission','/api/v1/submissions/'+s.id)
  for(const n of state.notices)await capture('getNotice','/api/v1/notices/'+n.id)
  await capture('listNotices','/api/v1/offerings/'+state.courses[1]!.offering.id+'/notices')
  const a=state.assignments[0]!,c=state.courses[0]!
  await capture('saveWorkspace','/api/v1/assignments/'+a.id+'/workspace',{baseRevision:1,files:state.workspaces.get(a.id)!.files,activeFile:'answer.md'})
  await capture('submitAssignment','/api/v1/assignments/'+a.id+'/submissions',{workspaceRevision:2,reflection:'核对接口职责与异常边界。'})
  await capture('readMessage','/api/v1/me/messages/'+state.messages[0]!.id+'/read',{})
  await capture('markMessagesAsRead','/api/v1/me/offerings/'+c.offering.id+'/messages/mark-read',{})
  await capture('updateChapterProgress','/api/v1/chapters/'+c.chapters[2]!.id+'/progress',{status:'completed'})
  await capture('recordLearningPosition','/api/v1/me/learning-position',{offeringId:c.offering.id,chapterId:c.chapters[2]!.id})
  await capture('logout','/api/v1/auth/logout',{})
  await capture('login','/api/v1/auth/login',{username:'campus.student',password:'campus-preview'})
  mkdirSync('.cache/student-v33',{recursive:true});writeFileSync('.cache/student-v33/contract-samples.json',JSON.stringify(samples,null,2))
 })
 it('contains varied courses, linked assignments, feedback and stable dates',()=>{
  const {state}=setup(),courses=courseSummaries(state)
  expect(courses).toHaveLength(8);expect(state.assignments).toHaveLength(18);expect(state.messages).toHaveLength(16);expect(state.feedbacks).toHaveLength(4)
  expect(new Set(courses.map(c=>c.progress.percent))).toEqual(new Set([0,25,50,60,100]))
  expect(courses.find(c=>c.mark==='AI')?.progress.notConfigured).toBe(true)
  expect(state.courses.find(c=>c.offering.mark==='SE')?.chapters).toHaveLength(1)
  for(const a of state.assignments){const c=state.courses.find(c=>c.offering.id===a.offeringId)!;expect(c.chapters.some(ch=>ch.id===a.chapterId)).toBe(true);expect(a.canSubmit).toBe(a.submissionBlockedReason===null)}
  for(const f of state.feedbacks){const s=state.submissions.find(s=>s.id===f.submissionId)!;expect(s.assignmentId).toBe(f.assignmentId);expect(Date.parse(f.publishedAt)).toBeGreaterThan(Date.parse(s.submittedAt));expect(Date.parse(f.publishedAt)).toBeLessThan(DEMO_EPOCH);expect(state.messages.find(m=>m.id===f.messageId)?.target?.id).toBe(f.id)}
  for(const m of state.messages){expect(Date.parse(m.createdAt)).toBeLessThan(DEMO_EPOCH);if(m.target?.type==='assignment')expect(state.assignments.some(a=>a.id===m.target?.id)).toBe(true)}
  expect(state.assignments.some(a=>a.dueAt.startsWith('2026-11'))).toBe(true)
 })
 it('saves and submits a frozen snapshot; rejects blocked work and stale revisions',async()=>{
  const {state,call}=setup(),a=state.assignments[0]!,w=state.workspaces.get(a.id)!,path='/api/v1/assignments/'+a.id
  const saved=await call('saveWorkspace',path+'/workspace',{baseRevision:1,activeFile:'answer.md',files:[{path:'answer.md',content:'class Course {}'}]})
  expect(saved.status).toBe(200);expect(saved.data.revision).toBe(2)
  expect((await call('saveWorkspace',path+'/workspace',{baseRevision:1})).error.code).toBe('VERSION_CONFLICT')
  const submitted=await call('submitAssignment',path+'/submissions',{workspaceRevision:2,reflection:'比较接口与继承的责任边界。'})
  expect(submitted.status).toBe(201);expect(a.assignmentState).toBe('SUBMITTED')
  w.files[0]!.content='later edit'
  expect(state.submissions.find(s=>s.id===submitted.data.id)?.files[0]?.content).toBe('class Course {}')
  const blocked=state.assignments[13]!
  expect((await call('submitAssignment','/api/v1/assignments/'+blocked.id+'/submissions',{workspaceRevision:1,reflection:'不允许补交'})).status).toBe(409)
 })
 it('allows the seeded late window and keeps derived counts consistent',async()=>{
  const {state,call}=setup(),a=state.assignments[15]!
  const before=(await call('getDashboard','/api/v1/me/dashboard')).data.pendingAssignmentCount
  const s=await call('submitAssignment','/api/v1/assignments/'+a.id+'/submissions',{workspaceRevision:1,reflection:'补充实验分析'})
  expect(s.data.late).toBe(true)
  expect((await call('getDashboard','/api/v1/me/dashboard')).data.pendingAssignmentCount).toBe(before-1)
 })
 it('keeps canonical todo/done counts independent of pagination and filter',async()=>{
  const {call}=setup()
  const all=(await call('listMyAssignments','/api/v1/me/assignments')).data
  const todo=(await call('listMyAssignments','/api/v1/me/assignments?filter=todo&pageSize=5&page=2')).data
  const done=(await call('listMyAssignments','/api/v1/me/assignments?filter=done')).data
  expect(all.summary).toEqual({allCount:18,todoCount:12,doneCount:6,archivedIncompleteCount:0})
  expect(todo.summary).toEqual(all.summary);expect(done.summary).toEqual(all.summary)
  expect(todo.items).toHaveLength(5);expect(done.items).toHaveLength(6)
  expect(done.items.every((a:{assignmentState:string})=>['SUBMITTED','REVIEWED'].includes(a.assignmentState))).toBe(true)
 })
 it('updates message unread state and reading progress only inside this instance',async()=>{
  const {state,call}=setup(),m=state.messages.find(m=>m.type==='feedback'&&!m.readAt)!
  const result=await call('readMessage','/api/v1/me/messages/'+m.id+'/read',{})
  expect(result.data).toEqual({id:m.id,readAt:DEMO_NOW})
  expect(state.assignments.find(a=>a.publishedFeedbackId===m.target?.id)?.unreadFeedback).toBe(false)
  const c=state.courses[0]!,ch=c.chapters[2]!
  const progress=await call('updateChapterProgress','/api/v1/chapters/'+ch.id+'/progress',{status:'completed'})
  expect(progress.data.courseProgress.completed).toBe(3)
  expect(createCampusTransport().state.courses[0]?.chapters[2]?.studentProgress.status).toBe('in_progress')
 })
 it('never falls back to fetch for unsupported operations',async()=>{
  const fetch=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('real network forbidden'))
  try{const {call}=setup();expect((await call('unknown','/api/v1/teacher/anything')).status).toBe(404);expect(fetch).not.toHaveBeenCalled()}finally{fetch.mockRestore()}
 })
 it('fixes all Date entry points without changing explicit timestamps',()=>{
  const original=globalThis.Date
  try{installCampusClock();expect(Date.now()).toBe(DEMO_EPOCH);expect(new Date().toISOString()).toBe(DEMO_NOW);expect(new Date('2020-01-01').getUTCFullYear()).toBe(2020);expect(Date()).toBe(new Date().toString())}finally{globalThis.Date=original}
 })
})
