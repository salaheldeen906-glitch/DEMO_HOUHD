import assert from 'node:assert/strict';
import {initial,apply,totals,today} from '../lib/domain.ts';
import {accountingReport,accountingSheets,unconfirmedSheets,syncJournal,validateEntry} from '../lib/accounting.ts';

let assertions=0;
const eq=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);assertions++};
const ok=(value,message)=>{assert.ok(value,message);assertions++};
const fails=(f,message)=>{assert.throws(f,message);assertions++};
const cents=(entries,code)=>entries.flatMap(j=>j.lines).filter(l=>l.accountCode===code).reduce((n,l)=>n+BigInt(l.debit)-BigInt(l.credit),0n);

function fixture(){
 let state=initial('Confirmed stage QA','simple');
 const [custodianId,employeeId,financeId]=state.people.map(p=>p.id);
 const finance={name:'Stage Finance',person:financeId,role:'finance'};
 const custodian={name:'Stage Custodian',person:custodianId,role:'custodian'};
 const employee={name:'Stage Employee',person:employeeId,role:'employee'};
 const owner={...finance,role:'admin',owner:true};
 const act=(type,payload,actor=owner,requestId=crypto.randomUUID())=>{const copy=structuredClone(state);apply(copy,{type,payload,requestId},actor);state=copy;return state.audit.at(-1)};
 act('project.save',{name:'Confirmed mission'});const project=state.projects[0].id;
 act('advance.create',{person:custodianId,amount:'1000',date:'2026-09-01',note:'Confirmed bank financing',method:'bank',transferRef:'BANK-STAGE',project},finance);
 const root=state.advances.at(-1).id;
 act('advance.distribute',{parent:root,person:employeeId,amount:'400',date:'2026-09-02',note:'Confirmed internal wallet transfer',method:'wallet',transferRef:'WALLET-STAGE'},custodian);
 const child=state.advances.at(-1).id;
 const save=(amount,id,category=state.categories[0].id)=>{act('expense.save',{id,advance:child,amount,date:'2026-09-03',category,note:'Stage purchase',proof:'Written stage proof'},employee);return id||state.expenses.at(-1).id};
 const submit=id=>act('expense.submit',{id},employee);
 const approve=id=>{act('expense.approve',{id},custodian);act('expense.approve',{id},finance)};
 const correct=(id,amount)=>{act('expense.approve',{id},custodian);act('expense.correct',{id,reason:'Stage correction'},finance);save(amount,id);};
 return {get state(){return state},set state(s){state=s},act,save,submit,approve,correct,finance,custodian,employee,owner,root,child,project};
}

// Confirmed spending exists before final approval; corrections append deltas.
const q=fixture();const id=q.save('100');
eq(q.state.journalEntries.filter(j=>j.sourceId===id),[],'Draft has no entry');
q.submit(id);
let expenseEntries=q.state.journalEntries.filter(j=>j.sourceId===id);
eq(expenseEntries.map(j=>j.type),['expense_submit']);
eq(expenseEntries[0].lines.map(l=>[l.accountCode,l.debit,l.credit]),[['1251',10000,0],['1201',0,10000]]);
eq(accountingReport(q.state,{advance:q.child}).difference,0n);
eq(cents(expenseEntries,'1251'),10000n);
eq(accountingReport(q.state).pending.some(p=>p.record.id===id),true,'The next approval remains pending');

q.correct(id,'80');
const frozen=JSON.stringify(q.state.journalEntries);
eq(q.state.expenses.find(e=>e.id===id).posted,10000,'Correction draft preserves confirmed amount');
eq(cents(q.state.journalEntries.filter(j=>j.sourceId===id),'1251'),10000n);
eq(accountingReport(q.state,{advance:q.child}).difference,0n);
q.submit(id);expenseEntries=q.state.journalEntries.filter(j=>j.sourceId===id);
eq(expenseEntries.map(j=>j.type),['expense_submit','expense_adjust']);
eq(expenseEntries.at(-1).lines.map(l=>[l.accountCode,l.debit,l.credit]),[['1201',2000,0],['1251',0,2000]]);
eq(expenseEntries.at(-1).date,today(),'Correction is dated at its confirmation');
eq(JSON.stringify(q.state.journalEntries.slice(0,-1)),frozen,'Old entries are unchanged');
eq(cents(expenseEntries,'1251'),8000n);
q.correct(id,'90');q.submit(id);
expenseEntries=q.state.journalEntries.filter(j=>j.sourceId===id);
eq(expenseEntries.at(-1).lines.map(l=>[l.accountCode,l.debit,l.credit]),[['1251',1000,0],['1201',0,1000]]);
eq(cents(expenseEntries,'1251'),9000n);
q.correct(id,'90');const noDelta=q.state.journalEntries.length;q.submit(id);
eq(q.state.journalEntries.length,noDelta,'Unchanged resubmission produces no duplicate monetary entry');
const balanceBeforeApproval=totals(q.state,q.child).balance;
q.act('expense.approve',{id},q.custodian);const request=crypto.randomUUID();q.act('expense.approve',{id},q.finance,request);
const afterApproval=JSON.stringify(q.state.journalEntries);q.act('expense.approve',{id},q.finance,request);
eq(JSON.stringify(q.state.journalEntries),afterApproval,'Repeated approval request is idempotent');
eq(totals(q.state,q.child).balance,balanceBeforeApproval,'Final approval never deducts again');
expenseEntries=q.state.journalEntries.filter(j=>j.sourceId===id);
eq(expenseEntries.at(-1).lines.map(l=>[l.accountCode,l.debit,l.credit]),[['5101',9000,0],['1251',0,9000]]);
eq(cents(expenseEntries,'1251'),0n);
eq(cents(expenseEntries,'1201'),-9000n);
eq(cents(expenseEntries,'5101'),9000n);
eq(accountingReport(q.state,{advance:q.child}).difference,0n);
fails(()=>q.act('expense.approve',{id},q.finance));

// Read-only exports are balanced and confirmed sources distinguish drafts.
const unchanged=JSON.stringify(q.state);const scoped=accountingReport(q.state,{person:q.employee.person,project:q.project});
eq(scoped.debit,scoped.credit);accountingSheets(q.state);unconfirmedSheets(q.state);
eq(JSON.stringify(q.state),unchanged,'Exports never persist their recovery work');
const confirmedSheets=accountingSheets(q.state),stageSheet=confirmedSheets.find(s=>s.name==='مراحل العمليات المؤكدة');
ok(stageSheet,'Confirmed nonmonetary stages have their own sheet');
ok(!confirmedSheets.some(s=>s.name.includes('غير مؤكدة')),'Pending report is independent');
const financeApprovalRows=stageSheet.rows.slice(1).filter(r=>r[2]===q.state.expenses.find(e=>e.id===id).ref&&r[5]==='تأكيد المراجعة أو الاعتماد'&&r[6]===q.finance.name);
ok(financeApprovalRows.some(r=>String(r[8]).includes('-A')),'Final approval links its classification entry');
ok(financeApprovalRows.every(r=>!String(r[8]).includes('-S')),'Approval never links correction entries');
const custodianReviewRows=stageSheet.rows.slice(1).filter(r=>r[2]===q.state.expenses.find(e=>e.id===id).ref&&r[5]==='تأكيد المراجعة أو الاعتماد'&&r[6]===q.custodian.name);
ok(custodianReviewRows.every(r=>!r[8]),'Rapid reviews never claim unrelated monetary entries');
const chart=confirmedSheets.find(s=>s.name==='دليل الحسابات المقترح');
ok(chart.rows.find(r=>r[0]==='1251')[2]!=='مصروف','Clearing account is not an expense account');

// An action confirmed today can reference a financial entry dated in an earlier period.
const currentPeriod={from:today(),to:today()},initialPosting=expenseEntries.find(j=>j.type==='expense_submit');
eq(accountingReport(q.state,currentPeriod).entries.some(j=>j.id===initialPosting.id),false,'Old accounting entry does not enter current period totals');
const currentStageRows=accountingSheets(q.state,currentPeriod).find(s=>s.name==='مراحل العمليات المؤكدة').rows.slice(1);
const oldPostingStage=currentStageRows.find(r=>r[2]===initialPosting.sourceRef&&r[5]==='تأكيد الصرف وإرساله'&&r[8]===initialPosting.ref);
ok(oldPostingStage,'Current action keeps its causal link to the old-period entry');
ok(String(oldPostingStage[9]).includes('خارج'),'Stage label explains that its financial entry is outside the period');

// Reversing confirmed spending before approval restores only its posted amount.
const unapproved=q.save('5');q.submit(unapproved);
const beforeReverse=totals(q.state,q.child).balance;q.act('reverse',{id:unapproved,kind:'expense',reason:'Confirmed spending canceled before final approval'},q.finance);
const pendingEntries=q.state.journalEntries.filter(j=>j.sourceId===unapproved);
eq(pendingEntries.map(j=>j.type),['expense_submit','reversal']);
eq(cents(pendingEntries,'1251'),0n);eq(cents(pendingEntries,'1201'),0n);
eq(totals(q.state,q.child).balance,beforeReverse+500);
eq(accountingReport(q.state).difference,0n);
eq(accountingReport(q.state).pending.some(p=>p.record.id===unapproved),false);

// Approved reclassification and reversal preserve every original entry.
const original=structuredClone(q.state.journalEntries.filter(j=>j.sourceId===id));
q.act('expense.classify',{id,accountCode:'1501',reason:'Capital equipment'},q.finance);
eq(totals(q.state,q.child).balance,balanceBeforeApproval);
q.act('reverse',{id,kind:'expense',reason:'Equipment canceled'},q.finance);
const reversed=q.state.journalEntries.filter(j=>j.sourceId===id);
eq(reversed.slice(0,original.length),original);
eq(cents(reversed,'1251'),0n);eq(cents(reversed,'1201'),0n);eq(cents(reversed,'5101'),0n);eq(cents(reversed,'1501'),0n);
for(const entry of q.state.journalEntries)validateEntry(entry);
eq(accountingReport(q.state).difference,0n);

// Legacy persisted direct-approved journals keep their original treatment.
const legacy=fixture();const old=legacy.save('20');legacy.submit(old);legacy.approve(old);
const stagedApproval=legacy.state.journalEntries.find(j=>j.sourceId===old&&j.type==='expense');
const direct={...structuredClone(stagedApproval),id:'expense:'+old,ref:'JE-'+legacy.state.expenses.find(e=>e.id===old).ref,date:'2026-09-03',lines:[{...stagedApproval.lines[0]},{...stagedApproval.lines[1],accountCode:'1201',accountName:'عهد الموظفين ومسؤولي العهد',advance:legacy.child}]};
legacy.state.journalEntries=legacy.state.journalEntries.filter(j=>j.sourceId!==old);legacy.state.journalEntries.push(direct);
const oldBytes=JSON.stringify(direct);syncJournal(legacy.state);
eq(legacy.state.journalEntries.filter(j=>j.sourceId===old).length,1,'No new submission entry for existing direct approval');
eq(JSON.stringify(legacy.state.journalEntries.find(j=>j.sourceId===old)),oldBytes);
eq(accountingReport(legacy.state).difference,0n);
const legacyRows=accountingSheets(legacy.state).find(s=>s.name==='مراحل العمليات المؤكدة').rows.slice(1);
ok(legacyRows.some(r=>r[8]===direct.ref),'Legacy direct entry remains represented');

// Recover legacy pending history, including seeded sources without history.
const seed=initial('Legacy pending recovery','example');const seedBefore=JSON.stringify(seed);const recovered=accountingReport(seed);
eq(recovered.entries.filter(j=>j.sourceKind==='expense').map(j=>j.type),['expense_submit']);
eq(recovered.difference,0n);eq(recovered.pending.length,1);eq(JSON.stringify(seed),seedBefore);
const migration=fixture();const pending=migration.save('100');migration.submit(pending);migration.correct(pending,'80');migration.submit(pending);
delete migration.state.journalEntries;
const migrated=accountingReport(migration.state);
eq(migrated.entries.filter(j=>j.sourceId===pending).map(j=>j.type),['expense_submit','expense_adjust']);
eq(cents(migrated.entries.filter(j=>j.sourceId===pending),'1251'),8000n);eq(migrated.difference,0n);
eq(migration.state.journalEntries,undefined);

// Unsaved correction amount appears only as a draft/request, not confirmed spend.
migration.correct(pending,'60');
const sourceSheet=accountingSheets(migration.state).find(s=>s.name==='العمليات الأصلية');
const sourceRow=sourceSheet.rows.slice(1).find(r=>r[0]===migration.state.expenses.find(e=>e.id===pending).ref);
const confirmedColumn=sourceSheet.rows[0].findIndex(h=>h==='آخر مبلغ صرف مؤكد'||h==='المبلغ المؤكد'||h==='المبلغ');
ok(confirmedColumn>=0,'Source sheet exposes confirmed amount');eq(sourceRow[confirmedColumn],80,'Confirmed source uses posted amount, not edited60 draft');
const pendingRows=unconfirmedSheets(migration.state).flatMap(s=>s.rows.slice(1));
ok(pendingRows.some(r=>r[0]===migration.state.expenses.find(e=>e.id===pending).ref&&r.includes(60)&&r.includes(80)),'Separate pending report distinguishes draft from confirmed amount');

// Pending nonmonetary partial/final settlements are included independently.
const settlement=fixture();const paid=settlement.save('40');settlement.submit(paid);settlement.approve(paid);
const financialBefore=JSON.stringify(settlement.state.journalEntries);
settlement.act('batch.create',{advance:settlement.child,expenses:[paid],note:'Partial settlement review'},settlement.employee);
const batch=settlement.state.batches.at(-1);
eq(JSON.stringify(settlement.state.journalEntries),financialBefore,'Submitting partial settlement has no financial entry');
ok(accountingReport(settlement.state).pending.some(p=>p.record.id===batch.id),'Submitted partial settlement is pending');
ok(unconfirmedSheets(settlement.state).flatMap(s=>s.rows).some(r=>r[0]===batch.ref),'Independent report includes partial settlement');
settlement.act('batch.correct',{id:batch.id,reason:'Clarify evidence'},settlement.finance);
ok(accountingReport(settlement.state).pending.some(p=>p.record.id===batch.id),'Returned partial settlement remains pending');
settlement.act('batch.void',{id:batch.id,reason:'Replace partial request'},settlement.finance);
eq(accountingReport(settlement.state).pending.some(p=>p.record.id===batch.id),false);
settlement.act('return.create',{advance:settlement.child,amount:'360',date:today(),note:'Return remaining balance'},settlement.employee);
const returned=settlement.state.returns.at(-1).id;settlement.act('return.confirm',{id:returned},settlement.custodian);
settlement.act('advance.settle',{id:settlement.child},settlement.employee);
const pendingFinal=accountingReport(settlement.state).pending;
ok(pendingFinal.some(p=>p.record.id===settlement.child&&p.reason.includes('تسوية')),'Final settlement approval is a pending stage');
ok(unconfirmedSheets(settlement.state).flatMap(s=>s.rows).some(r=>r[0]===settlement.state.advances.find(a=>a.id===settlement.child).ref),'Independent report includes final settlement');
const beforeClosure=JSON.stringify(settlement.state.journalEntries);settlement.act('advance.close',{id:settlement.child},settlement.finance);
eq(JSON.stringify(settlement.state.journalEntries),beforeClosure,'Settlement closure has no new financial entry');
eq(accountingReport(settlement.state).pending.some(p=>p.record.id===settlement.child),false);
eq(accountingReport(settlement.state).difference,0n);

console.log(`${assertions} confirmed-stage, correction, migration, causal-link, source-export and pending-settlement assertions passed`);
