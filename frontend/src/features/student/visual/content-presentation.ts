import type {AssignmentSummaryDTO,AssignmentDetailDTO} from '../../../api/assignments'
import {beijingDay} from '../../calendar/dates'
import {byDeadline} from '../../assignments/task-presentation'

/** Calendar grouping only: preserve every task and its exact deadline. */
export function taskDayGroups<T extends AssignmentSummaryDTO>(tasks:readonly T[],now=Date.now()){
 const groups=new Map<string,{key:string;dueAt:string;context:string;tasks:T[]}>()
 for(const task of [...tasks].sort(byDeadline)){
  const key=beijingDay(task.dueAt)
  const context=key===beijingDay(new Date(now))?'今天截止':key===beijingDay(new Date(now+86400000))?'明天截止':Date.parse(task.dueAt)<=now?'已截止':'截止安排'
  const group=groups.get(key)??{key,dueAt:task.dueAt,context,tasks:[]}
  group.tasks.push(task);groups.set(key,group)
 }
 return [...groups.values()]
}

/** Visual emphasis never grants submission or changes sorting/status. */
export function taskContentTone(task:AssignmentSummaryDTO,detail?:Pick<AssignmentDetailDTO,'canSubmit'>,now=Date.now()){
 if(task.publicationState==='archived'||task.offeringStatus==='archived')return 'archived'
 if(task.assignmentState==='REVIEWED')return 'reviewed'
 if(task.assignmentState==='SUBMITTED')return 'submitted'
 if(task.overdue)return 'overdue'
 const diff=Date.parse(task.dueAt)-now
 return detail?.canSubmit===true&&diff>0&&diff<=86400000?'soon':'active'
}
