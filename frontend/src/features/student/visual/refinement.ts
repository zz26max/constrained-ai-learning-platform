import type { ChapterSummaryDTO } from '../../../api/courses'
import type { AssignmentDetailDTO } from '../../../api/assignments'

/** Published API results provide the entry; progress changes wording, never permissions. */
export function chapterEntry(chapter:Pick<ChapterSummaryDTO,'publicationState'|'studentProgress'>){
 if(chapter.publicationState!=='published')return {allowed:false,label:chapter.publicationState==='draft'?'尚未开放':'暂不可访问',hint:'当前内容未开放，请返回课程目录查看安排。'}
 const status=chapter.studentProgress?.status
 return {allowed:true,label:status==='completed'?'复习章节':status==='in_progress'?'继续阅读':status==='not_started'?'开始阅读':'查看章节',hint:status==null?'阅读状态未提供，可打开章节查看。':''}
}

/** Group equal instants for presentation only; retain every independent assignment. */
export function deadlineGroups<T extends {id:string;dueAt:string}>(items:readonly T[]){
 const groups=new Map<number,{key:number;dueAt:string;items:T[]}>()
 for(const item of [...items].sort((a,b)=>Date.parse(a.dueAt)-Date.parse(b.dueAt)||a.id.localeCompare(b.id))){
  const key=Date.parse(item.dueAt),group=groups.get(key)??{key,dueAt:item.dueAt,items:[]}
  group.items.push(item);groups.set(key,group)
 }
 return [...groups.values()]
}

export function submissionLabel(detail:Pick<AssignmentDetailDTO,'canSubmit'|'overdue'|'assignmentState'>|undefined){
 if(!detail||typeof detail.canSubmit!=='boolean')return '提交资格未确认'
 if(!detail.canSubmit)return '暂不可提交'
 if(detail.overdue)return '允许补交'
 return detail.assignmentState==='SUBMITTED'?'可再次提交':'可提交'
}
