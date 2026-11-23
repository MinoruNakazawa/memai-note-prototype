import {daysEndingToday,patientRecords,createConsultation,examTypes,actionLabels} from '../clinician-workspace/model.mjs';
export function patientSummary(workspace,id,period=7,now=new Date()) {
 const dates=daysEndingToday(period,now);const records=patientRecords(workspace,id).filter(r=>dates.includes(r.date));
 const daily=new Map();for(const r of records.slice().reverse().filter(r=>r.kind==='daily'))daily.set(r.date,r);
 const visits=workspace.visits.filter(v=>v.patientId===id&&dates.includes(v.occurredAt.slice(0,10))).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt));
 const actions=workspace.actions.filter(v=>v.patientId===id&&dates.includes(v.at.slice(0,10))).sort((a,b)=>b.at.localeCompare(a.at));
 const consultations=workspace.consultations.filter(c=>c.patientId===id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 return {dates,records,daily,latestDaily:records.find(r=>r.kind==='daily')||null,visits,actions,consultations,videos:records.filter(r=>r.videoName),attacks:records.filter(r=>r.kind==='attack')};
}
export function timelineItems(workspace,id,period=7,now=new Date()) {
 const s=patientSummary(workspace,id,period,now);
 return [
  ...s.records.map(r=>({id:`A-${r.id}`,role:'A',date:r.date,at:r.startedAt||r.createdAt||`${r.date}T12:00`,title:r.kind==='attack'?'患者の発作記録':'患者の日常記録',data:r})),
  ...s.visits.map(v=>({id:`B-${v.id}`,role:'B',date:v.occurredAt.slice(0,10),at:v.occurredAt,title:'来院・検査記録',data:v})),
  ...s.actions.map(a=>({id:`ACT-${a.id}`,role:'B',date:a.at.slice(0,10),at:a.at,title:`対応記録：${actionLabels[a.type]}`,data:a})),
 ].sort((a,b)=>b.date.localeCompare(a.date)||b.at.localeCompare(a.at));
}
export function consultationExample(workspace,now=new Date()) {
 const patient=workspace.patients.find(p=>p.source==='sample');if(!patient)return null;
 return {...createConsultation(workspace,patient.id,{author:'地域医療者B（表示例）',question:'患者の発作時記録と来院時の所見を、どのように整理して次の確認につなげるか相談したい。',nextAction:'次回の確認事項を整理し、必要な連絡は実際の診療体制で行う。',priority:'routine'},7,now),id:'expert-display-example',example:true};
}
export function examinationSummary(visit) {
 return examTypes.map(t=>({key:t.key,label:t.label,status:visit.tests?.[t.key]?.status||'',values:t.fields.filter(([key])=>visit.tests?.[t.key]?.status==='performed'&&String(visit.tests[t.key][key]??'').trim()!=='').map(([key,label])=>`${label}：${visit.tests[t.key][key]}`),note:visit.tests?.[t.key]?.note||''}));
}
