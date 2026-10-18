import type { State } from './domain';
import type { Sheet } from './xlsx';

export type Account = { code:string; name:string; kind:'cash'|'advance'|'expense'|'asset'|'inventory'|'clearing' };
export const accounts:Account[] = [
 {code:'1101',name:'الخزينة',kind:'cash'}, {code:'1102',name:'البنك',kind:'cash'}, {code:'1103',name:'المحفظة الإلكترونية',kind:'cash'},
 {code:'1201',name:'عهد الموظفين ومسؤولي العهد',kind:'advance'}, {code:'1251',name:'مصروفات ومشتريات مؤكدة تحت المراجعة',kind:'clearing'}, {code:'1301',name:'المخزون',kind:'inventory'},
 {code:'1501',name:'أجهزة ومعدات',kind:'asset'}, {code:'1502',name:'أصول ثابتة أخرى',kind:'asset'},
 {code:'5101',name:'مصروف انتقالات',kind:'expense'}, {code:'5102',name:'مصروف وقود',kind:'expense'},
 {code:'5103',name:'مصروف أكل وشرب',kind:'expense'}, {code:'5104',name:'مصروف تحميل وتنزيل',kind:'expense'},
 {code:'5105',name:'مشتريات مستهلكة كمصروف',kind:'expense'}, {code:'5106',name:'مصروف اتصالات',kind:'expense'},
 {code:'5199',name:'مصروفات أخرى',kind:'expense'}
];
export const purchaseAccounts=accounts.filter(a=>['expense','asset','inventory'].includes(a.kind));
const defaultAccounts:Record<string,string>={'انتقالات':'5101','وقود':'5102','أكل وشرب':'5103','تحميل وتنزيل':'5104','اتصالات':'5106','أخرى':'5199'};
export const account=(code:string)=>accounts.find(a=>a.code===code);
export function expenseAccount(s:State,e:any){
 if(e.accountCode) return purchaseAccounts.find(a=>a.code===e.accountCode);
 const frozen=(s.journalEntries||[]).findLast(j=>j.sourceKind==='expense'&&j.sourceId===e.id&&['expense','reclass'].includes(j.type));
 if(frozen)return purchaseAccounts.find(a=>a.code===frozen.lines[0].accountCode);
 const c=s.categories.find(c=>c.id===e.category);
 return purchaseAccounts.find(a=>a.code===defaultAccounts[c?.name?.trim()]);
}
export type JournalLine={accountCode:string;accountName:string;debit:number;credit:number;person:string;advance:string};
export type JournalEntry={id:string;ref:string;sourceKind:string;sourceId:string;sourceRef:string;type:string;date:string;operationDate:string;recordedAt:string;person:string;advance:string;rootAdvance:string;project:string;category:string;description:string;provenance:string;lines:JournalLine[]};
export type AccountingScope={from?:string;to?:string;person?:string;advance?:string;project?:string};
export const journalTypes:Record<string,string>={advance:'صرف عهدة من المالية',distribution:'توزيع داخلي',expense_submit:'صرف مؤكد تحت المراجعة',expense_adjust:'تأكيد فرق تصحيح الصرف',expense:'اعتماد مصروف أو شراء',return:'رد للمالية',internal_return:'رد لمسؤول العهدة',reclass:'إعادة تصنيف محاسبي',reversal:'عكس قيد محاسبي'};
const cairoDate=(time:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time));
const sourceAdvance=(s:State,x:any,kind:string)=>kind==='advance'?x:s.advances.find(a=>a.id===x.advance);
const root=(s:State,a:any)=>a?.parent?s.advances.find(z=>z.id===a.parent)||a:a;
const cashAccount=(method:string)=>method==='bank'?'1102':method==='wallet'?'1103':'1101';
function line(code:string,value:number,debit:boolean,a:any):JournalLine{
 const ac=account(code);if(!ac)throw Error('الحساب المحاسبي غير صالح');
 if(!Number.isSafeInteger(value)||value<=0)throw Error('مبلغ القيد المحاسبي غير صالح');
 return {accountCode:code,accountName:ac.name,debit:debit?value:0,credit:debit?0:value,person:a?.person||'',advance:code==='1201'?a?.id||'':''};
}
function reverseBefore(s:State,x:any){
 const log=[...s.audit].reverse().find(a=>a.action==='reverse'&&a.record===x.ref&&a.before);
 if(!log)return null;
 try{const old=JSON.parse(log.before);return old.id===x.id?{old,time:log.time}:null}catch{return null}
}
export function needsHistoricalClassification(s:State,x:any){
 const old=x.status==='reversed'?reverseBefore(s,x)?.old:null;
 return !!old&&old.status==='approved'&&!(s.journalEntries||[]).some(j=>j.id==='expense:'+x.id)&&!expenseAccount(s,{...old,accountCode:old.accountCode||x.legacyAccountCode});
}
function confirmedTime(s:State,x:any,kind:string){
 const time=kind==='expense'?x.approvedAt||x.history?.findLast((h:any)=>h.action==='اعتماد مالي دون خصم')?.time:kind==='return'?x.confirmedAt:x.receivedAt;
 if(time)return time;
 const actions=kind==='advance'?['advance.create','advance.distribute','advance.receive','advance.deliver']:kind==='expense'?['expense.approve']:['return.confirm'];
 return [...s.audit].reverse().find(a=>a.record===x.ref&&actions.includes(a.action))?.time||'';
}
function entry(s:State,x:any,kind:string,type:string,id:string,lines:JournalLine[],date=x.date,recordedAt=''):JournalEntry{
 const a=sourceAdvance(s,x,kind),r=root(s,a);
 return {id,ref:'JE-'+x.ref+(type==='reversal'?'-R':type==='reclass'?'-C'+id.split(':').at(-1):type==='expense_adjust'?'-S'+id.split(':').at(-1):id.endsWith(':approve')?'-A':''),sourceKind:kind,sourceId:x.id,sourceRef:x.ref,type,date,operationDate:x.date,recordedAt,person:x.person,advance:a?.id||'',rootAdvance:r?.id||'',project:r?.project||'',category:kind==='expense'?x.category||'':'',description:x.note||'',provenance:recordedAt?'موثق بسجل الإجراء':'سجل سابق؛ وقت التأكيد غير متاح',lines};
}
/** Append-only journal. Export uses a copy; operations persist this after validation. */
export function syncJournal(s:State){
 s.journalEntries ||= [];
 const ids=new Set(s.journalEntries.map(j=>j.id));
 const add=(j:JournalEntry)=>{if(!ids.has(j.id)){validateEntry(j);s.journalEntries!.push(j);ids.add(j.id)}};
 for(const kind of ['advance','expense','return'])for(const current of kind==='advance'?s.advances:kind==='expense'?s.expenses:s.returns){
  const reversal=current.status==='reversed'?reverseBefore(s,current):null;
  const x=reversal?{...reversal.old,accountCode:reversal.old.accountCode||current.legacyAccountCode}:current,baseId=kind+':'+current.id;
  const qualifies=kind==='advance'?['received','closed'].includes(x.status):kind==='expense'?x.posted>0:x.status==='confirmed';
  if(!qualifies&&!ids.has(baseId))continue;
  const a=sourceAdvance(s,x,kind);if(!a)continue;
  if(kind==='expense'){
   const existing=s.journalEntries.find(j=>j.id===baseId);
   // Preserve previously saved direct-approved journals without another cash posting.
   const staged=existing?.type==='expense_submit'||!existing&&x.status!=='approved';
   if(staged){
    const submitted=(x.history||[]).map((h:any,i:number)=>({h,i})).filter(({h}:{h:any})=>h.action==='إرسال');
    if(!submitted.length)submitted.push({h:{amount:x.posted,oldPosted:0,date:x.date},i:0});
    const first=submitted[0].h;
    if(first.oldPosted&&!ids.has(baseId))add({...entry(s,x,kind,'expense_submit',baseId,[line('1251',first.oldPosted,true,a),line('1201',first.oldPosted,false,a)],x.date),provenance:'سجل سابق؛ تفاصيل مرحلة الصرف غير متاحة'});
    for(const [position,{h,i}] of submitted.entries()){
     const delta=h.amount-(h.oldPosted||0);if(!delta)continue;
     const firstPosting=position===0&&!h.oldPosted,stageId=firstPosting?baseId:baseId+':submit:'+i;
     const stage={...x,date:h.date||x.date,category:h.category||x.category,note:h.note||x.note};
     const date=firstPosting?(h.date||x.date):h.time?cairoDate(h.time):h.date||x.date;
     const lines=delta>0?[line('1251',delta,true,a),line('1201',delta,false,a)]:[line('1201',-delta,true,a),line('1251',-delta,false,a)];
     add({...entry(s,stage,kind,firstPosting?'expense_submit':'expense_adjust',stageId,lines,date,h.time||''),provenance:h.date?'موثق بسجل الإجراء':'سجل سابق؛ تفاصيل مرحلة الصرف غير متاحة'});
    }
    if(x.status==='approved'){
     const code=x.accountHistory?.[0]?.from||expenseAccount(s,x)?.code;
     const when=confirmedTime(s,x,kind);
     if(code)add(entry(s,x,kind,'expense',baseId+':approve',[line(code,x.posted,true,a),line('1251',x.posted,false,a)],when?cairoDate(when):x.date,when));
    }
   }else if(!ids.has(baseId)&&x.status==='approved'){
    const code=x.accountHistory?.[0]?.from||expenseAccount(s,x)?.code;
    if(code)add(entry(s,x,kind,'expense',baseId,[line(code,x.posted,true,a),line('1201',x.posted,false,a)],x.date,confirmedTime(s,x,kind)));
   }
   if(!ids.has(baseId))continue;
   for(const [i,h] of (x.accountHistory||[]).entries())add({...entry(s,x,kind,'reclass',baseId+':class:'+i,[line(h.to,x.posted,true,a),line(h.from,x.posted,false,a)],h.date,h.time),description:h.reason});
   if(current.status==='reversed'&&!ids.has(baseId+':reverse')){
    const when=current.reversedAt||reversal?.time;if(!when)continue;
    const net=new Map<string,{line:JournalLine;value:bigint}>();
    for(const j of s.journalEntries.filter(j=>j.sourceKind==='expense'&&j.sourceId===x.id&&j.type!=='reversal'))for(const l of j.lines){const key=l.accountCode+'|'+l.person+'|'+l.advance,b=net.get(key)||{line:l,value:BigInt(0)};b.value+=BigInt(l.debit)-BigInt(l.credit);net.set(key,b)}
    const lines=[...net.values()].filter(b=>b.value!==BigInt(0)).map(b=>({...b.line,debit:b.value<BigInt(0)?Number(-b.value):0,credit:b.value>BigInt(0)?Number(b.value):0}));
    add({...entry(s,x,kind,'reversal',baseId+':reverse',lines,cairoDate(when),when),description:current.reason||''});
   }
   continue;
  }
  let lines:JournalLine[]=[],type=kind;
  if(!ids.has(baseId)){
   if(kind==='advance'){
    const parent=x.parent?s.advances.find(a=>a.id===x.parent):null;if(x.parent&&!parent)continue;
    type=x.parent?'distribution':'advance';lines=[line('1201',x.amount,true,x),line(x.parent?'1201':cashAccount(x.method),x.amount,false,parent||x)];
   }else if(kind==='return'){
    const dest=x.toAdvance?s.advances.find(z=>z.id===x.toAdvance):null;if(x.toAdvance&&!dest)continue;
    type=x.toAdvance?'internal_return':'return';lines=[line(x.toAdvance?'1201':cashAccount(x.method),x.amount,true,dest||a),line('1201',x.amount,false,a)];
   }
   add(entry(s,x,kind,type,baseId,lines,x.date,confirmedTime(s,x,kind)));
  }
  if(current.status==='reversed'&&ids.has(baseId)){
   const original=s.journalEntries.find(j=>j.id===baseId)!;
   const when=current.reversedAt||reversal?.time;if(!when)continue;
   const latest=kind==='expense'?(x.accountHistory?.at(-1)?.to||original.lines[0].accountCode):'';
   const reversedLines=kind==='expense'?[line('1201',x.posted,true,a),line(latest,x.posted,false,a)]:original.lines.map(l=>({...l,debit:l.credit,credit:l.debit}));
   add({...entry(s,x,kind,'reversal',baseId+':reverse',reversedLines,cairoDate(when),when),description:current.reason||''});
  }
 }
 return s.journalEntries;
}
export function validateEntry(j:JournalEntry){
 if(!j.lines.length)throw Error('القيد المحاسبي بلا أطراف');
 let debit=BigInt(0),credit=BigInt(0);
 for(const l of j.lines){if(!account(l.accountCode)||![l.debit,l.credit].every(v=>Number.isSafeInteger(v)&&v>=0)||!!l.debit===!!l.credit)throw Error('طرف القيد المحاسبي غير صالح');debit+=BigInt(l.debit);credit+=BigInt(l.credit)}
 if(debit!==credit)throw Error('القيد المحاسبي غير متوازن');
}
const match=(s:State,j:JournalEntry,f:AccountingScope,dates=true)=>(!dates||(!f.from||j.date>=f.from)&&(!f.to||j.date<=f.to))&&(!f.person||j.person===f.person||j.lines.some(l=>l.person===f.person))&&(!f.advance||j.advance===f.advance||j.rootAdvance===f.advance||j.lines.some(l=>l.advance===f.advance))&&(!f.project||j.project===f.project);
function recordMatch(s:State,x:any,kind:string,f:AccountingScope,dates=true){
 const a=sourceAdvance(s,x,kind),r=root(s,a),to=kind==='return'?s.advances.find(a=>a.id===x.toAdvance):null;
 return (!dates||(!f.from||x.date>=f.from)&&(!f.to||x.date<=f.to))&&(!f.person||x.person===f.person||kind==='advance'&&s.advances.find(z=>z.id===x.parent)?.person===f.person||to?.person===f.person)&&(!f.advance||a?.id===f.advance||r?.id===f.advance||to?.id===f.advance)&&(!f.project||r?.project===f.project);
}
/** Numeric cells below Excel's precision limit; otherwise exact decimal text. */
export function excelMoney(cents:number|bigint):string|number{
 const n=BigInt(cents),abs=n<BigInt(0)?-n:n;
 const decimal=(n<BigInt(0)?'-':'')+(abs/BigInt(100))+'.'+String(abs%BigInt(100)).padStart(2,'0');
 return abs<=BigInt(999999999999999)?Number(decimal):decimal;
}
export function accountingReport(s:State,scope:AccountingScope={}){
 const copy={...s,journalEntries:[...(s.journalEntries||[])]};
 const all=syncJournal(copy),entries=all.filter(j=>match(s,j,scope));
 const pending:{kind:string;record:any;reason:string}[]=[],sources:{kind:string;record:any}[]=[];
 for(const kind of ['advance','expense','return'])for(const x of kind==='advance'?s.advances:kind==='expense'?s.expenses:s.returns){
  if(recordMatch(s,x,kind,scope)||entries.some(j=>j.sourceKind===kind&&j.sourceId===x.id))sources.push({kind,record:x});
  const oldReversal=kind==='expense'&&needsHistoricalClassification(copy,x)?reverseBefore(s,x):null;
  if(!recordMatch(s,x,kind,scope)&&!(oldReversal&&recordMatch(s,{...x,date:cairoDate(oldReversal.time)},kind,scope)))continue;
  const reason=kind==='advance'?x.status==='waiting'?'بانتظار تأكيد التسليم والاستلام':'':kind==='return'?x.status==='pending'?'بانتظار تأكيد استلام المرتجع':'':oldReversal?'شراء معكوس سابقًا؛ يحتاج تصنيف الأصل والعكس':x.status==='approved'&&!all.some(j=>j.sourceId===x.id&&j.sourceKind==='expense'&&j.type==='expense')?'معتمد؛ يحتاج تحديد الحساب المحاسبي':!['approved','reversed'].includes(x.status)?x.status==='draft'?'مسودة غير مؤكدة؛ بلا قيد':x.status==='correction'?'التصحيح لم يؤكد؛ آخر صرف مؤكد محفوظ':'الصرف مؤكد؛ المراجعة أو الاعتماد لم يؤكد بعد':'';
  if(reason){pending.push({kind,record:x,reason});if(!sources.some(r=>r.kind===kind&&r.record.id===x.id))sources.push({kind,record:x})}
 }
 for(const a of s.advances.filter(a=>a.status==='received'&&a.settlement==='requested')){
  const record={...a,advance:a.id,amount:0,date:a.settlementRequestedAt?cairoDate(a.settlementRequestedAt):a.date,status:'requested'};
  if(recordMatch(s,record,'settlement',scope))pending.push({kind:'settlement',record,reason:'بانتظار اعتماد وإقفال التسوية؛ بلا أثر مالي جديد'});
 }
 for(const b of (s.batches||[]).filter(b=>['submitted','correction'].includes(b.status))){
  const when=b.history?.at(-1)?.time,record={...b,date:when?cairoDate(when):b.date,amount:b.lines.reduce((n:number,l:any)=>n+l.amount,0)};
  if(recordMatch(s,record,'batch',scope))pending.push({kind:'batch',record,reason:b.status==='correction'?'تسوية جزئية بانتظار التصحيح؛ بلا أثر مالي جديد':'تسوية جزئية بانتظار الاعتماد؛ بلا أثر مالي جديد'});
 }
 let debit=BigInt(0),credit=BigInt(0);
 for(const j of entries){validateEntry(j);for(const l of j.lines){debit+=BigInt(l.debit);credit+=BigInt(l.credit)}}
 const scopedIds=new Set(s.advances.filter(a=>(!scope.person||a.person===scope.person)&&(!scope.advance||a.id===scope.advance||a.parent===scope.advance)&&(!scope.project||root(s,a)?.project===scope.project)).map(a=>a.id));
 let bookBalance=BigInt(0),operational=BigInt(0);
 for(const j of all)for(const l of j.lines)if(l.accountCode==='1201'&&scopedIds.has(l.advance))bookBalance+=BigInt(l.debit)-BigInt(l.credit);
 for(const a of s.advances)if(['received','closed'].includes(a.status)){if(scopedIds.has(a.id))operational+=BigInt(a.amount);if(scopedIds.has(a.parent))operational-=BigInt(a.amount)}
 for(const e of s.expenses)if(scopedIds.has(e.advance)&&e.status!=='reversed')operational-=BigInt(e.posted||0);
 for(const r of s.returns)if(r.status==='confirmed'){if(scopedIds.has(r.advance))operational-=BigInt(r.amount);if(scopedIds.has(r.toAdvance))operational+=BigInt(r.amount)}
 return {entries,allEntries:all,pending,sources,debit,credit,bookBalance,operational,difference:bookBalance-operational};
}
export function accountingSheets(s:State,scope:AccountingScope={},tx:(text:string)=>string=text=>text):Sheet[]{
 const r=accountingReport(s,scope),person=(id:string)=>s.people.find(p=>p.id===id)?.name||'',ref=(id:string)=>s.advances.find(a=>a.id===id)?.ref||'',project=(id:string)=>s.projects?.find(p=>p.id===id)?.name||'',category=(id:string)=>s.categories.find(c=>c.id===id)?.name||'';
 const summary:Sheet={name:tx('ملخص القيود'),rows:[['عُهدة',tx('تصدير قيود محاسبية تجريبي')],[tx('من تاريخ'),scope.from||tx('الكل')],[tx('إلى تاريخ'),scope.to||tx('الكل')],[tx('الشخص'),person(scope.person||'')||tx('الكل')],[tx('العهدة'),ref(scope.advance||'')||tx('الكل')],[tx('المشروع'),project(scope.project||'')||tx('الكل')],[tx('العملة'),'EGP'],[tx('عدد القيود'),r.entries.length],[tx('إجمالي المدين'),excelMoney(r.debit)],[tx('إجمالي الدائن'),excelMoney(r.credit)],[tx('فرق التوازن'),excelMoney(r.debit-r.credit)],[tx('عدد المراحل غير المؤكدة'),r.pending.length],[tx('رصيد العهد المحاسبي الحالي في النطاق'),excelMoney(r.bookBalance)],[tx('رصيد العهد التشغيلي الحالي في النطاق'),excelMoney(r.operational)],[tx('فرق الرصيد للمراجعة'),excelMoney(r.difference)],[tx('أساس التصدير'),tx('الصرف الأول حسب تاريخ العملية؛ التصحيح والاعتماد والعكس حسب تاريخ تأكيد المرحلة. المقارنة بين الأرصدة الحالية لا تتبع فترة التقرير.')],[tx('التصنيف'),tx('الحسابات مقترحة داخلية؛ لا تحددها IFRS. تصنيف الشراء يحدده المالية، ولا ينشئ سجل أصول أو حركة مخزون.')],[tx('الفلاتر'),tx('تصدير القيود يتبع الفترة والشخص والعهدة والمشروع. فلاتر حالة التشغيل والبند والنوع والبحث تخص التقرير التشغيلي.')],[tx('دقة Excel'),tx('المبالغ ذات أكثر من 15 رقمًا معنويًا محفوظة كنص عشري دقيق.')],[tx('النطاق'),tx('الحركات المؤكدة في جميع مراحلها؛ الصرف قيد المراجعة في حساب مؤقت، والاعتماد ينقله للتصنيف النهائي. غير المؤكد في تنزيل مستقل.')]]};
 const journals:Sheet={name:tx('القيود المحاسبية'),rows:[[tx('رقم القيد'),tx('التاريخ المحاسبي'),tx('وقت التأكيد أو الاعتماد'),tx('مرجع العملية'),tx('نوع القيد'),tx('كود الحساب'),tx('الحساب'),tx('المدين'),tx('الدائن'),tx('الشخص'),tx('العهدة'),tx('المشروع'),tx('البند'),tx('البيان'),tx('مصدر السجل')],...r.entries.flatMap(j=>j.lines.map(l=>[j.ref,j.date,j.recordedAt,j.sourceRef,tx(journalTypes[j.type]),l.accountCode,tx(l.accountName),excelMoney(l.debit),excelMoney(l.credit),person(l.person),ref(l.advance)||ref(j.advance),project(j.project),category(j.category),j.description,tx(j.provenance)]))]};
 const detail:Sheet={name:tx('العمليات الأصلية'),rows:[[tx('مرجع العملية'),tx('نوع الحركة'),tx('تاريخ الطلب أو المسودة الحالي'),tx('الشخص'),tx('العهدة'),tx('المبلغ المؤكد'),tx('مبلغ الطلب أو المسودة الحالي'),tx('الحالة الحالية'),tx('الحساب المحاسبي'),tx('الوصف الحالي'),tx('الإثبات الحالي'),tx('عدد المرفقات')],...r.sources.filter(({kind,record:x})=>r.entries.some(j=>j.sourceKind===kind&&j.sourceId===x.id)).map(({kind,record:x})=>[x.ref,tx(kind==='expense'?'مصروف أو شراء':kind==='return'?'مرتجع':'عهدة'),x.date,person(x.person),ref(kind==='advance'?x.id:x.advance),excelMoney(kind==='expense'?x.posted||0:x.amount),excelMoney(x.amount),tx(statusName(x.status)),kind==='expense'?tx(expenseAccount(s,x)?.name||'يحتاج تصنيفًا محاسبيًا'):'',x.note,x.proof||'',x.attachments?.length||0])]};
 const balances=new Map<string,{debit:bigint;credit:bigint}>();for(const j of r.entries)for(const l of j.lines){const b=balances.get(l.accountCode)||{debit:BigInt(0),credit:BigInt(0)};b.debit+=BigInt(l.debit);b.credit+=BigInt(l.credit);balances.set(l.accountCode,b)}
 const movement:Sheet={name:tx('حركة الحسابات'),rows:[[tx('كود الحساب'),tx('الحساب'),tx('إجمالي المدين'),tx('إجمالي الدائن'),tx('صافي حركة الفترة')],...accounts.filter(a=>balances.has(a.code)).map(a=>{const b=balances.get(a.code)!;return[a.code,tx(a.name),excelMoney(b.debit),excelMoney(b.credit),excelMoney(b.debit-b.credit)]})]};
 const chart:Sheet={name:tx('دليل الحسابات المقترح'),rows:[[tx('كود الحساب'),tx('الحساب'),tx('طبيعة الحساب')],...accounts.map(a=>[a.code,tx(a.name),tx(a.kind==='cash'?'نقد وبنوك':a.kind==='advance'?'عهد':a.kind==='clearing'?'حساب وسيط تحت المراجعة':a.kind==='asset'?'أصل ثابت':a.kind==='inventory'?'مخزون':'مصروف')])]};
 return [summary,journals,confirmedStageSheet(s,scope,r.entries,r.allEntries,tx),detail,movement,chart];
}
const stageActions:Record<string,string>={'advance.create':'تسجيل صرف العهدة','advance.distribute':'تسجيل التوزيع','advance.deliver':'تأكيد التسليم','advance.receive':'تأكيد الاستلام','expense.submit':'تأكيد الصرف وإرساله','expense.approve':'تأكيد المراجعة أو الاعتماد','expense.correct':'تأكيد الإعادة للتصحيح','expense.classify':'تأكيد التصنيف المحاسبي','return.confirm':'تأكيد استلام المرتجع','advance.settle':'تقديم التسوية','advance.reopen':'سحب طلب التسوية','advance.close':'اعتماد وإقفال التسوية','batch.create':'تقديم تسوية جزئية','batch.approve':'اعتماد تسوية جزئية','batch.correct':'إعادة تسوية جزئية','batch.void':'إلغاء تسوية جزئية بسبب','reverse':'عكس قيد محاسبي'};
function confirmedStageSheet(s:State,scope:AccountingScope,entries:JournalEntry[],allEntries:JournalEntry[],tx:(text:string)=>string):Sheet{
 const person=(id:string)=>s.people.find(p=>p.id===id)?.name||'',ref=(id:string)=>s.advances.find(a=>a.id===id)?.ref||'';
 const rows:(string|number)[][]=[];
 const linkedIds=new Set<string>();
 for(const log of s.audit){
  if(!stageActions[log.action])continue;
  const found=[{kind:'advance',xs:s.advances},{kind:'expense',xs:s.expenses},{kind:'return',xs:s.returns},{kind:'batch',xs:s.batches||[]}].map(v=>({kind:v.kind,record:v.xs.find(x=>x.ref===log.record)})).find(v=>v.record);
  if(!found)continue;
  const date=cairoDate(log.time);if(!recordMatch(s,{...found.record,date},found.kind,scope))continue;
  // New actions carry exact causal links. Older records use only compatible actions,
  // never every nearby entry: rapid review clicks must not inherit another stage's posting.
  const types=log.action==='expense.submit'?['expense_submit','expense_adjust']:log.action==='expense.approve'&&['finance','admin'].includes(log.role)?['expense']:log.action==='expense.classify'?['reclass']:log.action==='reverse'?['reversal']:log.action==='return.confirm'?['return','internal_return']:['advance.create','advance.distribute','advance.deliver','advance.receive'].includes(log.action)?['advance','distribution']:[];
  const linked=Array.isArray(log.journalIds)?allEntries.filter(j=>log.journalIds.includes(j.id)):allEntries.filter(j=>!linkedIds.has(j.id)&&j.sourceId===found.record.id&&types.includes(j.type)&&j.recordedAt&&Math.abs(Date.parse(j.recordedAt)-Date.parse(log.time))<1000).sort((a,b)=>Math.abs(Date.parse(a.recordedAt)-Date.parse(log.time))-Math.abs(Date.parse(b.recordedAt)-Date.parse(log.time))).slice(0,1);
  linked.forEach(j=>linkedIds.add(j.id));
  rows.push([date,log.time,log.record,person(found.record.person),ref(found.kind==='advance'?found.record.id:found.record.advance),tx(stageActions[log.action]),log.actor,tx(log.role),linked.map(j=>j.ref).join(' | '),tx(linked.length?linked.some(j=>entries.some(e=>e.id===j.id))?'مرحلة لها قيد مالي':'مرحلة لها قيد مالي خارج فترة التقرير':'تأكيد مرحلة؛ بلا أثر مالي جديد')]);
 }
 for(const j of entries)if(!rows.some(row=>String(row[8]).split(' | ').includes(j.ref)))rows.push([j.date,j.recordedAt,j.sourceRef,person(j.person),ref(j.advance),tx(journalTypes[j.type]),'', '',j.ref,tx(j.provenance)]);
 return {name:tx('مراحل العمليات المؤكدة'),rows:[[tx('تاريخ المرحلة'),tx('وقت الإجراء'),tx('مرجع العملية'),tx('الشخص'),tx('العهدة'),tx('المرحلة المؤكدة'),tx('الفاعل'),tx('الصلاحية'),tx('القيد المرتبط'),tx('الأثر المحاسبي')],...rows.sort((a,b)=>String(a[0]).localeCompare(String(b[0]))||String(a[1]).localeCompare(String(b[1]))) ]};
}
export function unconfirmedSheets(s:State,scope:AccountingScope={},tx:(text:string)=>string=text=>text):Sheet[]{
 const r=accountingReport(s,scope),person=(id:string)=>s.people.find(p=>p.id===id)?.name||'',ref=(id:string)=>s.advances.find(a=>a.id===id)?.ref||'';
 return [{name:tx('ملخص غير المؤكد'),rows:[[tx('التقرير'),tx('القيمة')],[tx('من تاريخ'),scope.from||tx('الكل')],[tx('إلى تاريخ'),scope.to||tx('الكل')],[tx('الشخص'),person(scope.person||'')||tx('الكل')],[tx('العهدة'),ref(scope.advance||'')||tx('الكل')],[tx('عدد المراحل غير المؤكدة'),r.pending.length],[tx('التوضيح'),tx('هذا التقرير للمراحل المنتظرة فقط. قد تكون للعملية مرحلة صرف مؤكدة موجودة بالفعل في ملف القيود؛ لا تعاد إضافة المبلغ.')]]},
 {name:tx('عمليات ومراحل غير مؤكدة'),rows:[[tx('مرجع العملية'),tx('نوع الحركة'),tx('التاريخ'),tx('الشخص'),tx('العهدة'),tx('مبلغ الطلب أو المسودة'),tx('آخر مبلغ صرف مؤكد'),tx('الحالة الحالية'),tx('المرحلة المنتظرة'),tx('الحساب المقترح'),tx('الوصف')],...r.pending.map(({kind,record:x,reason})=>[x.ref,tx(kind==='expense'?'مصروف أو شراء':kind==='return'?'مرتجع':kind==='settlement'?'تسوية نهائية':kind==='batch'?'تسوية جزئية':'عهدة'),x.date,person(x.person),ref(kind==='advance'?x.id:x.advance),excelMoney(x.amount),excelMoney(kind==='expense'&&x.status!=='reversed'?x.posted||0:0),tx(statusName(x.status)),tx(reason),kind==='expense'?tx(expenseAccount(s,x)?.name||''):'',x.note])]}];
}
function statusName(status:string){return ({waiting:'بانتظار التسليم / الاستلام',received:'عهدة مفتوحة',closed:'تمت التسوية',draft:'مسودة',pending:'بانتظار المراجعة',pending_finance:'بانتظار اعتماد المالية',pending_manager:'بانتظار المراجعة الإضافية',approved:'معتمد ماليًا',correction:'مطلوب تصحيح',confirmed:'رد مؤكد',cancelled:'ملغى',reversed:'معكوس',requested:'بانتظار اعتماد التسوية',submitted:'بانتظار اعتماد التسوية الجزئية'} as Record<string,string>)[status]||status}
