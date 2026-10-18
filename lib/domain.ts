import { expenseAccount, purchaseAccounts, syncJournal, needsHistoricalClassification, type JournalEntry } from './accounting.ts';
export type State = {
    journalEntries?: JournalEntry[];
    projects?: any[];
    batches?: any[];
    comments?: any[];
    reportViews?: any[];
    settings?: any;
    name: string;
    people: any[];
    categories: any[];
    advances: any[];
    expenses: any[];
    returns: any[];
    declarations: any[];
    audit: any[];
    feedback: any[];
    requests: string[];
    archives: any[];
};
export type Actor = {
    name: string;
    person: string;
    role: string;
    owner?: boolean;
};
export const roles: Record<string, string> = { employee: 'موظف', custodian: 'مسؤول عهدة', manager: 'مدير / مراجع', finance: 'مدير مالي / محاسب', admin: 'مسؤول النظام' };
export const methods: Record<string, string> = { cash: 'نقدي', bank: 'تحويل بنكي منفّذ', wallet: 'محفظة إلكترونية — تحويل منفّذ' };
export function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
export function money(v: any) { const str = String(v).replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace('٫', '.').trim(); if (!/^\d+(\.\d{1,2})?$/.test(str))
    throw Error('اكتب مبلغًا موجبًا بمنزلتين عشريتين كحد أقصى'); const [whole, fraction = ''] = str.split('.'); const cents = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0')); if (cents <= BigInt(0) || cents > BigInt(Number.MAX_SAFE_INTEGER))
    throw Error('المبلغ غير صالح أو يتجاوز دقة الحساب'); return Number(cents); }
function date(v: string,allowFuture=false) { if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v || !allowFuture && v > today())
    throw Error('التاريخ غير صالح أو في المستقبل'); return v; }
const nextRef=(s:State,prefix:string)=>{let max=0;const records=[...s.advances,...s.expenses,...s.returns,...(s.batches||[]),...s.audit.filter(a=>a.action?.startsWith(({ADV:'advance.',EXP:'expense.',RET:'return.',SET:'batch.'} as any)[prefix])).map(a=>({ref:a.record}))];for(const x of records){const m=String(x.ref||'').match(new RegExp('^'+prefix+'-(\\d+)$'));if(m){const n=Number(m[1]);if(Number.isSafeInteger(n))max=Math.max(max,n)}}if(!Number.isSafeInteger(max+1))throw Error('تعذر تخصيص مرجع جديد');return prefix+'-'+String(max+1).padStart(3,'0')};
const id = () => crypto.randomUUID(), clean = (v: any, max = 500) => String(v ?? '').trim().slice(0, max);
const zeroMoney=(v:any)=>{const str=String(v??'').replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace('٫','.').trim();return !str||/^0+(\.0{1,2})?$/.test(str)?0:money(str)};
const normalized = (v: string) => v.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
function required(v: any) { const s = clean(v); if (!s)
    throw Error('هذا الحقل مطلوب'); return s; }
export function initial(name: string, seed = 'simple'): State {
    const s: State = { name: clean(name, 80) || 'مساحة عُهدة', people: [], categories: ['انتقالات', 'وقود', 'أكل وشرب', 'تحميل وتنزيل', 'مشتريات', 'اتصالات', 'أخرى'].map(name => ({ id: id(), name, active: true })), advances: [], expenses: [], returns: [], declarations: [], audit: [], feedback: [], requests: [], archives: [] };
    if (seed !== 'empty') {
        s.people = [{ id: id(), name: 'أحمد — مسؤول عهدة تجريبي', team: 'التشغيل', active: true }, { id: id(), name: 'سارة — موظفة تجريبية', team: 'المبيعات', active: true }, { id: id(), name: 'محمد — مدير تجريبي', team: 'الإدارة', active: true }];
        s.people[0].managerId = s.people[2].id;
        s.people[1].managerId = s.people[2].id;
    }
    if (seed === 'example') {
        const a = id(), b = id();
        s.advances.push({ id: a, ref: 'ADV-001', person: s.people[0].id, amount: 100000, date: today(), note: 'مثال جاهز — مهمة زيارات العملاء', status: 'received', method: 'bank', transferRef: 'DEMO-BANK-001' }, { id: b, parent: a, ref: 'ADV-002', person: s.people[1].id, amount: 40000, date: today(), note: 'مصاريف انتقالات المهمة', status: 'received', method: 'wallet', transferRef: 'DEMO-WALLET-001' });
        s.expenses.push({ id: id(), ref: 'EXP-001', advance: b, person: s.people[1].id, amount: 20000, posted: 20000, date: today(), category: s.categories[0].id, note: 'مثال جاهز — انتقالات', proof: 'إثبات كتابي تجريبي', attachments: [], status: 'pending', history: [] });
        s.audit.push({ id: id(), time: new Date().toISOString(), actor: 'إعداد المثال المختار', role: 'admin', action: 'seed', record: 'ADV-001', before: '', after: 'عهدة 1000، توزيع 400، مصروف 200 — مثال مختار' });
    }
    return upgrade(s);
}
export function rootOf(s: State, a: any) { return a.parent ? s.advances.find(z => z.id === a.parent) || { id: a.parent, ref: a.parentRef, note: a.rootPurpose, person: a.rootPerson, project:a.project } : a; }
export function family(s: State, aid: string) { return s.advances.filter(a => a.id === aid || a.parent === aid); }
const posted = (a: any) => ['received', 'closed'].includes(a.status);
function localTotals(s: State, a: any) {
    const received = posted(a) ? a.amount : 0;
    const spent = s.expenses.filter(x => x.advance === a.id && x.status !== 'reversed').reduce((n, x) => n + (x.posted || 0), 0);
    const returned = s.returns.filter(x => x.advance === a.id && x.status === 'confirmed').reduce((n, x) => n + x.amount, 0);
    const internalReceived = s.returns.filter(x => x.toAdvance === a.id && x.status === 'confirmed').reduce((n, x) => n + x.amount, 0);
    const distributed = s.advances.filter(x => x.parent === a.id && posted(x)).reduce((n, x) => n + x.amount, 0);
    const reserved = s.returns.filter(x => x.advance === a.id && x.status === 'pending').reduce((n, x) => n + x.amount, 0) + s.advances.filter(x => x.parent === a.id && x.status === 'waiting').reduce((n, x) => n + x.amount, 0);
    const balance = Number(BigInt(received)+BigInt(internalReceived)-BigInt(spent)-BigInt(returned)-BigInt(distributed));
    return { received, spent, returned, balance, reserved, available: balance - reserved, distributed, internalReceived };
}
export function totals(s: State, advance?: string, person?: string) {
    if (advance) {
        const a = s.advances.find(x => x.id === advance);
        return a ? localTotals(s, a) : { received: 0, spent: 0, returned: 0, balance: 0, reserved: 0, available: 0, distributed: 0, internalReceived: 0 };
    }
    if (person) {
        return s.advances.filter(x => x.person === person).reduce((n, a) => { const t = localTotals(s, a); for (const k of Object.keys(n))
            n[k] += t[k as keyof typeof t]; return n; }, { received: 0, spent: 0, returned: 0, balance: 0, reserved: 0, available: 0, distributed: 0, internalReceived: 0 } as any);
    }
    const received = s.advances.filter(a => !a.parent && posted(a)).reduce((n, a) => n + a.amount, 0), spent = s.expenses.filter(x => x.status !== 'reversed').reduce((n, x) => n + (x.posted || 0), 0), returned = s.returns.filter(x => !x.toAdvance && x.status === 'confirmed').reduce((n, x) => n + x.amount, 0), reserved = s.returns.filter(x => !x.toAdvance && x.status === 'pending').reduce((n, x) => n + x.amount, 0);
    return { received, spent, returned, balance: received - spent - returned, reserved, available: received - spent - returned - reserved, distributed: s.advances.filter(a => a.parent && posted(a)).reduce((n, a) => n + a.amount, 0), internalReceived: s.returns.filter(x => x.toAdvance && x.status === 'confirmed').reduce((n, x) => n + x.amount, 0) };
}
export function responsibility(s: State, aid: string) { const ids = new Set(family(s, aid).map(a => a.id)); return totals({ ...s, advances: s.advances.filter(a => ids.has(a.id)), expenses: s.expenses.filter(x => ids.has(x.advance)), returns: s.returns.filter(x => ids.has(x.advance)) }); }
export function blockers(s: State, a: any) {
    const ids = new Set((a.parent ? [a] : family(s, a.id)).map(z => z.id)), b: string[] = [];
    if (a.status !== 'received')
        b.push('تأكيد الاستلام');
    if (totals(s, a.id).balance !== 0)
        b.push('تسوية الرصيد المتبقي بالمصروف أو الرد');
    if (s.expenses.some(x => ids.has(x.advance) && !['approved', 'reversed'].includes(x.status)))
        b.push('اعتماد المصروفات وحسم المسودات والتصحيح');
    if (s.returns.some(x => ids.has(x.advance) && x.status === 'pending'))
        b.push('تأكيد المرتجعات المعلقة');
    if (!a.parent && s.advances.some(x => x.parent === a.id && !['closed', 'reversed', 'cancelled'].includes(x.status)))
        b.push('إقفال عهد الموظفين التابعة');
    if ((s.batches||[]).some(z=>ids.has(z.advance)&&['submitted','correction'].includes(z.status))) b.push('حسم التسويات الجزئية المعلقة');
    return b;
}
export function canReview(s: State, x: any, actor: Actor) {
    if (!['pending', 'pending_manager', 'pending_finance'].includes(x.status)) return false;
    const a = s.advances.find(z => z.id === x.advance); if (!a) return false;
    if (actor.role === 'admin') return true;
    if (actor.person === x.person && actor.role !== 'finance') return false;
    if (x.status === 'pending_manager') return actor.role === 'manager' && x.reviewPolicy?.manager === actor.person;
    if (actor.role === 'finance') return x.status === 'pending_finance' || x.status === 'pending' && (!a.parent || x.reviewPolicy?.reviewer === 'finance');
    if (x.status !== 'pending' || x.reviewPolicy?.reviewer === 'finance') return false;
    if(a.parent&&x.reviewPolicy?.extraManager&&actor.role==='manager')return false;
    return (actor.role === 'custodian' && !!a.parent && rootOf(s, a).person === actor.person) || (actor.role === 'manager' && s.people.find(p => p.id === x.person)?.managerId === actor.person);
}
export function upgrade(s: State) { s.journalEntries ||= []; s.projects ||= []; s.batches ||= []; s.comments ||= []; s.reportViews ||= []; s.settings ||= {reviewer:'responsible', threshold:0, version:0, overdueDays:7}; return s; }
export function projectTotals(s: State, project: string) {
    const advances=s.advances.filter(a=>rootOf(s,a).project===project),ids=new Set(advances.map(a=>a.id));
    const received=advances.filter(a=>posted(a)&&(!a.parent||!ids.has(a.parent))).reduce((n,a)=>n+a.amount,0),spent=s.expenses.filter(e=>ids.has(e.advance)&&e.status!=='reversed').reduce((n,e)=>n+(e.posted||0),0),returned=s.returns.filter(r=>ids.has(r.advance)&&!ids.has(r.toAdvance)&&r.status==='confirmed').reduce((n,r)=>n+r.amount,0),internalReceived=s.returns.filter(r=>ids.has(r.toAdvance)&&!ids.has(r.advance)&&r.status==='confirmed').reduce((n,r)=>n+r.amount,0);
    return {received,spent,returned,balance:Number(BigInt(received)+BigInt(internalReceived)-BigInt(spent)-BigInt(returned)),internalReceived};
}
export function periodBalance(s: State, scope: any) {
    const ids = new Set(s.advances.filter(a => (!scope.person||a.person===scope.person) && (!scope.advance||a.id===scope.advance||a.parent===scope.advance) && (!scope.project||rootOf(s,a).project===scope.project)).map(a=>a.id));
    const rows: {date:string,value:number}[]=[];
    for (const a of s.advances) if (posted(a)) { if(ids.has(a.id))rows.push({date:a.date,value:a.amount}); if(a.parent&&ids.has(a.parent))rows.push({date:a.date,value:-a.amount}); }
    for (const e of s.expenses) if(ids.has(e.advance)&&e.status!=='reversed'&&e.posted)rows.push({date:e.date,value:-e.posted});
    for (const r of s.returns) if(r.status==='confirmed'){if(ids.has(r.advance))rows.push({date:r.date,value:-r.amount});if(ids.has(r.toAdvance))rows.push({date:r.date,value:r.amount});}
    const opening=rows.filter(r=>scope.from&&r.date<scope.from).reduce((n,r)=>n+BigInt(r.value),BigInt(0)),change=rows.filter(r=>(!scope.from||r.date>=scope.from)&&(!scope.to||r.date<=scope.to)).reduce((n,r)=>n+BigInt(r.value),BigInt(0));
    return {opening:Number(opening),change:Number(change),closing:Number(opening+change)};
}
export function visibleState(s: State, actor: Actor): State {
    upgrade(s);
    if (['finance', 'admin'].includes(actor.role))
        return { ...s, reportViews:s.reportViews!.filter(v=>v.person===actor.person), requests: [], archives: actor.role === 'admin' ? s.archives : [] };
    const allowed = (a: any) => a.person === actor.person || (actor.role === 'custodian' && rootOf(s, a).person === actor.person) || (actor.role === 'manager' && s.people.find(p => p.id === a.person)?.managerId === actor.person);
    const advances = s.advances.filter(allowed).map(a => ({ ...a, parentRef: rootOf(s, a).ref, rootPurpose: rootOf(s, a).note, rootPerson: rootOf(s, a).person })), ids = new Set(advances.map(a => a.id));
    const peopleIds = new Set([actor.person, ...advances.map(a => a.person), ...advances.map(a => rootOf(s, a).person)]);
    return { ...s, journalEntries:[], projects:s.projects!.filter(p=>advances.some(a=>rootOf(s,a).project===p.id)).map(p=>({...p,budget:0,scoped:true})), batches:s.batches!.filter(b=>ids.has(b.advance)), comments:s.comments!.filter(c=>ids.has(c.advance)), reportViews:s.reportViews!.filter(v=>v.person===actor.person), advances, expenses: s.expenses.filter(x => ids.has(x.advance)), returns: s.returns.filter(x => ids.has(x.advance) || ids.has(x.toAdvance)), people: actor.role === 'custodian' ? s.people : s.people.filter(p => peopleIds.has(p.id)), declarations: s.declarations.filter(x => peopleIds.has(x.person)), feedback: s.feedback.filter(x => x.person === actor.person), audit: s.audit.filter(x => x.person === actor.person || advances.some(a => a.ref === x.record) || s.expenses.some(e => ids.has(e.advance) && e.ref === x.record)), requests: [], archives: [] };
}
export function apply(s: State, input: any, actor: Actor) {
    upgrade(s);
    const { type, payload: p = {}, requestId } = input;
    if (!requestId || typeof requestId !== 'string')
        throw Error('رقم العملية مفقود');
    if (s.requests.includes(requestId))
        return s;
    if (!roles[actor.role])
        throw Error('الدور غير صالح');
    // Freeze recoverable legacy journals before edits to categories or source labels.
    syncJournal(s);
    const priorJournalIds = new Set((s.journalEntries || []).map(j => j.id));
    const admin = actor.role === 'admin', need = (...rs: string[]) => { if (!admin && !rs.includes(actor.role))
        throw Error('الإجراء غير متاح للدور الحالي'); }, own = (x: any) => { if (!admin && x.person !== actor.person)
        throw Error('هذه العهدة تخص شخصًا آخر'); }, find = (xs: any[]) => { const x = xs.find(x => x.id === p.id); if (!x)
        throw Error('السجل غير موجود'); return x; }, adv = (aid: string) => { const a = s.advances.find(x => x.id === aid); if (!a || a.status !== 'received' || a.settlement === 'requested')
        throw Error('اختر عهدة مستلمة ومفتوحة للصرف'); return a; };
    let record = '', before = '', after = '', x: any;
    const receipt = (a: any) => { if (a.status !== 'waiting')
        throw Error('العهدة ليست بانتظار الاستلام'); if (!a.parent || a.deliveredAt && a.receiptAt) {
        a.status = 'received';
        a.receivedAt = new Date().toISOString();
    } };
    if (type === 'person.save') {
        need('admin', 'finance');
        x = p.id ? find(s.people) : { id: id(), active: true };
        before = JSON.stringify(x);
        x.name = required(p.name);
        x.team = clean(p.team, 80);
        if (p.managerId===x.id)throw Error('اختر مديرًا آخر لهذا الشخص');
        if (p.managerId && !s.people.some(m => m.id === p.managerId))
            throw Error('المدير غير موجود');
        x.managerId = p.managerId || '';
        if (!p.id)
            s.people.push(x);
        record = x.name;
        after = JSON.stringify(x);
    }
    else if (type === 'person.toggle') {
        need('admin', 'finance');
        x = find(s.people);
        x.active = !x.active;
        record = x.name;
        after = x.active ? 'نشط' : 'غير نشط';
    }
    else if (type === 'category.save') {
        need('admin', 'finance');
        const name = required(p.name);
        if (s.categories.some(c => c.id !== p.id && normalized(c.name) === normalized(name)))
            throw Error('اسم البند موجود بالفعل');
        x = p.id ? find(s.categories) : { id: id(), active: true };
        before = x.name || '';
        x.name = name;
        if (!p.id)
            s.categories.push(x);
        record = name;
        after = name;
    }
    else if (type === 'category.toggle') {
        need('admin', 'finance');
        x = find(s.categories);
        x.active = !x.active;
        record = x.name;
        after = x.active ? 'نشط' : 'غير نشط';
    }
    else if (type === 'advance.create' || type === 'advance.distribute') {
        let parent: any;
        if (type === 'advance.distribute') {
            need('custodian', 'finance');
            parent = adv(p.parent);
            if (parent.parent)
                throw Error('التوزيع من العهدة الأساسية فقط');
            if (!admin && parent.person !== actor.person)
                throw Error('أنت لست مسؤول هذه العهدة');
        }
        else
            need('finance');
        if (!s.people.some(z => z.id === p.person && z.active))
            throw Error('اختر شخصًا نشطًا');
        if (parent && parent.person === p.person)
            throw Error('اختر موظفًا آخر للتوزيع');
        if (!parent && p.project && !s.projects!.some(z=>z.id===p.project&&z.active)) throw Error('اختر مهمة نشطة');
        const amount = money(p.amount);
        if (parent && amount > totals(s, parent.id).available)
            throw Error('مبلغ التوزيع يتجاوز المتاح لدى مسؤول العهدة');
        const method = methods[p.method] ? p.method : 'cash', transferRef = method === 'cash' ? '' : required(p.transferRef);
        x = { id: id(), ref: nextRef(s,'ADV'), person: p.person, parent: parent?.id || '', project:parent?.project || (p.project || ''), due:p.due?date(p.due,true):'', amount, date: date(p.date), note: required(p.note), method, transferRef, status: method === 'cash' ? 'waiting' : 'received' };
        s.advances.push(x);
        record = x.ref;
        after = method === 'cash' ? 'مبلغ محجوز بانتظار التسليم والاستلام' : 'تحويل منفّذ؛ المبلغ في عهدة المستلم دون خصم مصروف';
    }
    else if (type === 'advance.deliver') {
        need('custodian', 'finance');
        x = find(s.advances);
        const source = x.parent ? s.advances.find(a => a.id === x.parent) : null;
        if (!admin && (source ? source.person !== actor.person : actor.role !== 'finance'))
            throw Error('تسليم العهدة لمسؤول مصدرها فقط');
        if (posted(x))
            return s;
        if (x.status !== 'waiting')
            throw Error('لا يمكن التسليم');
        x.deliveredAt ||= new Date().toISOString();
        if (x.parent)
            receipt(x);
        record = x.ref;
        after = 'تم تأكيد التسليم؛ يلزم تأكيد الموظف أيضًا';
    }
    else if (type === 'advance.receive') {
        need('employee', 'custodian', 'manager');
        x = find(s.advances);
        own(x);
        if (posted(x))
            return s;
        if (x.status !== 'waiting')
            throw Error('لا يمكن تأكيد هذه العهدة');
        x.receiptAt ||= new Date().toISOString();
        receipt(x);
        record = x.ref;
        after = x.status === 'received' ? 'الاستلام مؤكد — أصبح المبلغ متاحًا' : 'الاستلام مسجل؛ في انتظار تأكيد مسؤول العهدة للتسليم';
    }
    else if (type === 'expense.save') {
        need('employee', 'custodian', 'manager');
        x = p.id ? find(s.expenses) : { id: id(), ref: nextRef(s,'EXP'), history: [], posted: 0, status: 'draft', attachments: [] };
        if (p.id)
            own(x);
        if (!['draft', 'correction'].includes(x.status))
            throw Error('المصروف غير قابل للتعديل');
        const a = adv(p.advance || x.advance);
        own(a);
        if (x.posted && p.advance && p.advance !== x.advance)
            throw Error('لا يمكن نقل مصروف مرسل لعهدة أخرى');
        let c = s.categories.find(c => c.id === p.category);
        if (p.category === '__new__') {
            const name = required(p.categoryName);
            c = s.categories.find(c => normalized(c.name) === normalized(name));
            if (c && !c.active)
                throw Error('البند موجود لكنه معطل؛ اطلب تفعيله');
            if (!c) {
                c = { id: id(), name, active: true, createdBy: actor.name };
                s.categories.push(c);
            }
        }
        if (!c || (!c.active && c.id !== x.category))
            throw Error('اختر بندًا أو أضف بندًا جديدًا');
        before = JSON.stringify(x);
        if(x.category && x.category!==c.id)delete x.accountCode;
        Object.assign(x, { advance: a.id, person: a.person, amount: money(p.amount), date: date(p.date), category: c.id, note: required(p.note), proof: clean(p.proof) });
        if (!p.id)
            s.expenses.push(x);
        record = x.ref;
        after = 'مسودة محفوظة؛ البند مضاف تلقائيًا إن كان جديدًا؛ الرصيد لم يتغير';
    }
    else if (type === 'expense.classify') {
        need('finance');x=find(s.expenses);
        const historical=needsHistoricalClassification(s,x);
        if(!['draft','correction','pending','pending_manager','pending_finance','approved'].includes(x.status)&&!historical)throw Error('المصروف غير قابل للتصنيف المحاسبي');
        const chosen=purchaseAccounts.find(a=>a.code===p.accountCode);if(!chosen)throw Error('الحساب المحاسبي غير صالح');
        syncJournal(s);const previous=expenseAccount(s,x);
        if(x.status==='approved'&&previous&&previous.code!==chosen.code){
            x.accountHistory ||= [];const time=new Date().toISOString();
            x.accountHistory.push({from:previous.code,to:chosen.code,date:today(),time,reason:required(p.reason)});
        }
        before=JSON.stringify({accountCode:previous?.code||''});x.accountCode=chosen.code;
        if(historical){x.legacyAccountCode=chosen.code;x.legacyClassificationReason=required(p.reason)}
        record=x.ref;after=JSON.stringify({accountCode:chosen.code,accountName:chosen.name,kind:chosen.kind,reason:x.legacyClassificationReason||p.reason||''});
    }
    else if (type === 'expense.submit') {
        need('employee', 'custodian', 'manager');
        x = find(s.expenses);
        own(x);
        if (['pending', 'pending_manager', 'pending_finance', 'approved'].includes(x.status))
            return s;
        if (!['draft', 'correction'].includes(x.status))
            throw Error('الحالة غير صالحة للإرسال');
        adv(x.advance);
        if (!clean(x.proof) && !x.attachments?.length)
            throw Error('أضف إثباتًا كتابيًا أو صورة أو ملفًا قبل الإرسال');
        const delta = x.amount - (x.posted || 0);
        if (delta > totals(s, x.advance).available)
            throw Error('المبلغ يتجاوز المتاح في هذه العهدة');
        before = String(x.posted || 0);
        x.history.push({ time: new Date().toISOString(), action: 'إرسال', amount: x.amount, oldPosted: x.posted || 0, date:x.date, category:x.category, note:x.note, proof: x.proof, attachments: [...(x.attachments || [])] });
        x.posted = x.amount;
        const policy=s.settings||{}, threshold=policy.threshold||0, manager=s.people.find(z=>z.id===x.person)?.managerId;
        if (threshold && x.amount>=threshold && (manager===x.person||!s.people.some(z=>z.id===manager&&z.active))) throw Error('عين مديرًا نشطًا لهذا الشخص للمراجعة الإضافية');
        x.reviewPolicy={version:policy.version||0,reviewer:policy.reviewer||'responsible',extraManager:!!threshold&&x.amount>=threshold,manager};
        x.status=x.reviewPolicy.extraManager&&(!s.advances.find(a=>a.id===x.advance)?.parent||x.reviewPolicy.reviewer==='finance')?'pending_manager':'pending';
        record = x.ref;
        after = String(x.posted);
    }
    else if (type === 'expense.approve' || type === 'expense.correct') {
        x = find(s.expenses);
        if (!canReview(s, x, actor))
            throw Error('المراجعة غير متاحة لك أو هذه العهدة ليست ضمن مسؤوليتك');
        if (!['pending', 'pending_manager', 'pending_finance'].includes(x.status))
            throw Error('المصروف ليس بانتظار المراجعة');
        if(type==='expense.approve'&&['admin','finance'].includes(actor.role)){
            const ac=expenseAccount(s,x);if(!ac)throw Error('حدد حساب المصروف أو الأصل أو المخزون قبل الاعتماد المالي');
            x.accountCode=ac.code;x.approvedAt=new Date().toISOString();
        }
        x.status = type === 'expense.correct' ? 'correction' : ['admin', 'finance'].includes(actor.role) ? 'approved' : actor.role==='custodian'&&x.reviewPolicy?.extraManager ? 'pending_manager' : 'pending_finance';
        x.reason = type === 'expense.correct' ? required(p.reason) : '';
        x.history.push({ time: new Date().toISOString(), actor: actor.name, action: x.status === 'approved' ? 'اعتماد مالي دون خصم' : x.status === 'pending_finance' ? 'مراجعة مسؤول العهدة — بانتظار المالية' : 'إعادة للتصحيح', reason: x.reason, amount: x.posted });
        record = x.ref;
        after = x.status === 'correction' ? x.reason : x.status === 'approved' ? 'اعتماد مالي نهائي؛ بلا خصم إضافي' : 'راجعه المسؤول؛ بانتظار اعتماد المالية';
    }
    else if (type === 'expense.delete') {
        need('employee', 'custodian', 'manager');
        x = find(s.expenses);
        own(x);
        if (x.status !== 'draft' || x.posted)
            throw Error('الحذف للمسودة قبل أول إرسال فقط');
        s.expenses = s.expenses.filter(z => z.id !== x.id);
        record = x.ref;
        after = 'حذف مسودة غير مالية';
    }
    else if (type === 'return.create') {
        need('employee', 'custodian', 'manager');
        const a = adv(p.advance);
        own(a);
        const amount = money(p.amount);
        if (amount > totals(s, a.id).available)
            throw Error('المرتجع يتجاوز المتاح في هذه العهدة');
        const toAdvance = a.parent && p.target !== 'finance' ? a.parent : '';
        x = { id: id(), ref: nextRef(s,'RET'), advance: a.id, toAdvance, person: a.person, amount, date: date(p.date), note: required(p.note), method: methods[p.method] ? p.method : 'cash', status: 'pending' };
        s.returns.push(x);
        record = x.ref;
        after = toAdvance ? 'طلب رد لمسؤول العهدة؛ بلا إقفال للتسوية' : 'طلب رد للمالية؛ الرصيد يتغير بعد تأكيد الاستلام';
    }
    else if (type === 'return.confirm') {
        need('finance', 'custodian');
        x = find(s.returns);
        if (x.status === 'confirmed')
            return s;
        if (x.status !== 'pending')
            throw Error('المرتجع غير معلق');
        const a = adv(x.advance);
        if (x.toAdvance) {
            const to = adv(x.toAdvance);
            if (!admin && (actor.role !== 'custodian' || to.person !== actor.person))
                throw Error('تأكيد الرد لمسؤول العهدة المستلم فقط');
        }
        else if (!admin && actor.role !== 'finance')
            throw Error('تأكيد الرد للمالية فقط');
        if (x.amount > totals(s, a.id).balance)
            throw Error('رصيد غير كاف');
        x.status = 'confirmed';
        x.confirmedAt = new Date().toISOString();
        record = x.ref;
        after = x.toAdvance ? 'رد داخلي مؤكد؛ زاد رصيد مسؤول العهدة بنفس المبلغ' : 'رد مؤكد للمالية؛ العهدة ما زالت مفتوحة حتى التسوية';
    }
    else if (type === 'return.cancel') {
        need('employee', 'custodian', 'finance', 'manager');
        x = find(s.returns);
        if (!admin && actor.role !== 'finance' && x.person !== actor.person && s.advances.find(a => a.id === x.toAdvance)?.person !== actor.person)
            throw Error('المرتجع ليس ضمن مسؤوليتك');
        if (x.status !== 'pending')
            throw Error('الطلب ليس معلقًا');
        x.status = 'cancelled';
        x.reason = required(p.reason);
        record = x.ref;
        after = x.reason;
    }
    else if (type === 'advance.settle') {
        need('employee', 'custodian', 'manager');
        x = find(s.advances);
        own(x);
        const b = blockers(s, x);
        if (b.length)
            throw Error(b.join('، '));
        x.settlement = 'requested';
        x.settlementRequestedAt = new Date().toISOString();
        record = x.ref;
        after = 'طلب تسوية مستقل عن رد المال؛ بانتظار المالية';
    }
    else if (type === 'advance.reopen') {
        need('employee', 'custodian', 'manager', 'finance');
        x = find(s.advances);
        if (!admin && actor.role !== 'finance')
            own(x);
        if (x.status !== 'received' || x.settlement !== 'requested')
            throw Error('العهدة ليست مقدمة للتسوية');
        x.settlement = '';
        x.settlementWithdrawReason = required(p.reason);
        record = x.ref;
        after = 'سحب طلب التسوية وإتاحة الصرف والرد: ' + x.settlementWithdrawReason;
    }
    else if (type === 'advance.close') {
        need('finance');
        x = find(s.advances);
        const b = blockers(s, x);
        if (b.length)
            throw Error(b.join('، '));
        x.status = 'closed';
        x.settlement = 'closed';
        x.closedAt = new Date().toISOString();
        record = x.ref;
        after = 'إقفال التسوية؛ بلا أثر مالي جديد';
    }
    else if (type === 'reverse') {
        need('finance');
        const xs = p.kind === 'expense' ? s.expenses : p.kind === 'return' ? s.returns : s.advances;
        x = find(xs);
        const a = s.advances.find(z => z.id === (p.kind === 'advance' ? x.id : x.advance));
        if (!a || a.status === 'closed')
            throw Error('العهدة مغلقة؛ لا تعديل مالي');
        if (a.settlement === 'requested')
            throw Error('اسحب طلب التسوية بسبب أولًا قبل عكس حركة');
        if (x.status === 'reversed')
            throw Error('تم العكس بالفعل');
        if(p.kind==='expense' && s.batches!.some(b=>['submitted','approved'].includes(b.status)&&b.lines.some((l:any)=>l.id===x.id))) throw Error('ألغ التسوية الجزئية بسبب قبل عكس مصروفها');
        const reason = required(p.reason);
        before = JSON.stringify(x);
        if (p.kind === 'advance') {
            if (!['waiting', 'received'].includes(x.status) || s.advances.some(z => z.parent === x.id && !['reversed', 'cancelled'].includes(z.status)) || s.expenses.some(z => z.advance === x.id && z.status !== 'reversed') || s.returns.some(z => z.advance === x.id && !['cancelled', 'reversed'].includes(z.status)))
                throw Error('احسم العمليات التابعة أولًا');
        }
        else if (p.kind === 'return') {
            if (x.status !== 'confirmed')
                throw Error('عكس المرتجع المؤكد فقط');
            if (x.toAdvance && s.advances.find(z => z.id === x.toAdvance)?.status === 'closed')
                throw Error('العهدة المستلمة مغلقة');
        }
        else if (!x.posted)
            throw Error('المسودة ليست حركة مالية');
        x.status = 'reversed';
        x.reversedAt = new Date().toISOString();
        x.reason = reason;
        for (const z of s.advances) {
            const t = totals(s, z.id);
            if (t.balance < 0 || t.available < 0)
                throw Error('العكس يسبب رصيدًا غير صالح؛ قد يكون المال قد استُخدم');
        }
        record = x.ref;
        after = reason;
    }
    else if(type==='project.save') {
        need('finance'); x=p.id?find(s.projects!):{id:id(),active:true}; before=JSON.stringify(x);
        x.name=required(p.name); x.budget=zeroMoney(p.budget); x.note=clean(p.note); if(!p.id)s.projects!.push(x); record=x.name;after=JSON.stringify(x);
    }
    else if(type==='project.toggle') {need('finance');x=find(s.projects!);x.active=!x.active;record=x.name;after=x.active?'نشط':'مؤرشف';}
    else if(type==='settings.save') {need('admin');if(!['responsible','finance'].includes(p.reviewer))throw Error('اختر مسار المراجعة');s.settings={reviewer:p.reviewer,threshold:zeroMoney(p.threshold),overdueDays:Math.min(90,Math.max(1,parseInt(p.overdueDays)||7)),version:(s.settings?.version||0)+1};record='POLICY';after=JSON.stringify(s.settings);}
    else if(type==='batch.create') {
        need('employee','custodian','manager','finance');const a=adv(p.advance);if(actor.role!=='finance')own(a);
        const ids=Array.isArray(p.expenses)?[...new Set(p.expenses)]:[];if(!ids.length)throw Error('اختر مصروفًا معتمدًا للتسوية الجزئية');
        const ex=ids.map(eid=>s.expenses.find(e=>e.id===eid&&e.advance===a.id&&e.status==='approved'));
        if(ex.some(e=>!e)||s.batches!.some(b=>['submitted','approved'].includes(b.status)&&b.lines.some((l:any)=>ids.includes(l.id))))throw Error('مصروف غير معتمد أو سبق تضمينه في تسوية');
        x={id:id(),ref:nextRef(s,'SET'),advance:a.id,person:a.person,date:today(),note:clean(p.note),status:'submitted',lines:ex.map(e=>({id:e.id,ref:e.ref,amount:e.posted,revision:e.history.length,proof:e.proof,attachments:e.attachments||[]})),history:[]};s.batches!.push(x);record=x.ref;after='تسوية جزئية مقدمة؛ العهدة مفتوحة والرصيد دون تغيير';
    }
    else if(type==='batch.approve'||type==='batch.correct'||type==='batch.void') {
        x=find(s.batches!);if(s.advances.find(a=>a.id===x.advance)?.status==='closed')throw Error('العهدة مغلقة؛ لا تعديل لتسويتها');if(type==='batch.void'){if(!admin&&actor.role!=='finance')own(x);if(x.status==='approved')need('finance');if(x.status==='voided')return s;x.reason=required(p.reason);x.status='voided';}
        else {need('finance');if(x.status!=='submitted')throw Error('التسوية ليست بانتظار الاعتماد');if(type==='batch.approve'&&x.lines.some((l:any)=>!s.expenses.some(e=>e.id===l.id&&e.status==='approved'&&e.posted===l.amount&&e.history.length===l.revision)))throw Error('تغير مصروف؛ أعد تقديم التسوية');x.status=type==='batch.approve'?'approved':'correction';x.reason=type==='batch.correct'?required(p.reason):'';}
        x.history.push({time:new Date().toISOString(),actor:actor.name,action:type,reason:x.reason});record=x.ref;after=x.status+' — بلا أثر مالي';
    }
    else if(type==='comment.add') {const a=s.advances.find(a=>a.id===p.advance);if(!a||!visibleState(s,actor).advances.some(z=>z.id===a.id))throw Error('العهدة غير متاحة لك');s.comments!.push({id:id(),advance:a.id,person:actor.person,actor:actor.name,text:required(p.text),time:new Date().toISOString()});record=a.ref;after=clean(p.text);}
    else if(type==='report.save') {const filters=p.filters||{},safe:any={};if(filters.from)date(filters.from);if(filters.to)date(filters.to);if(filters.from&&filters.to&&filters.from>filters.to)throw Error('تاريخ البداية يجب أن يسبق تاريخ النهاية');for(const k of ['from','to','person','advance','project','category','type','status'])safe[k]=clean(filters[k],80);x={id:id(),name:required(p.name),person:actor.person,filters:safe};s.reportViews!.push(x);record=x.name;after='عرض تقرير محفوظ';}
    else if(type==='report.delete') {x=find(s.reportViews!);own(x);s.reportViews=s.reportViews!.filter(v=>v.id!==x.id);record=x.name;after='حذف عرض التقرير فقط';}
    else if (type === 'declaration') {
        need('employee', 'custodian', 'manager');
        const d = date(p.date);
        if (s.declarations.some(x => x.person === actor.person && x.date === d))
            return s;
        s.declarations.push({ id: id(), person: actor.person, date: d });
        record = d;
        after = 'لا يوجد مصروف اليوم؛ بلا أثر مالي';
    }
    else if (type === 'feedback') {
        if (!['احتفظ', 'عدّل', 'احذف', 'ملاحظة'].includes(p.kind))
            throw Error('نوع الملاحظة غير صالح');
        s.feedback.push({ id: id(), kind: p.kind, text: required(p.text), actor: actor.name, person: actor.person, time: new Date().toISOString() });
        record = p.kind;
        after = clean(p.text);
    }
    else if (type === 'reset') {
        if (!actor.owner)
            throw Error('إعادة التهيئة للمالك فقط');
        if (p.confirm !== 'إعادة تهيئة' && p.confirm !=='RESET')
            throw Error('اكتب إعادة تهيئة للتأكيد');
        const archive = { time: new Date().toISOString(), data: { ...s, archives: [], requests: [] } }, fresh = initial(s.name, 'empty');
        fresh.people = s.people;
        fresh.archives = [...s.archives, archive];
        Object.assign(s, fresh);
        record = s.name;
        after = 'تهيئة المال والبنود مع حفظ الأشخاص والحسابات والأرشيف';
    }
    else
        throw Error('الإجراء غير معروف');
    for (const a of s.advances) {
        const t = totals(s, a.id);
        if (Object.values(t).some(n => !Number.isSafeInteger(n)) || t.available < 0)
            throw Error('رصيد غير صالح أو مبلغ يتجاوز دقة الحساب');
    }
    if (Object.values(totals(s)).some(n => !Number.isSafeInteger(n)))
        throw Error('إجمالي المبالغ يتجاوز دقة الحساب');
    s.requests.push(requestId);
    const log = { id: id(), time: new Date().toISOString(), actor: actor.name, role: actor.role, action: type, record, before, after, person: actor.person, journalIds: [] as string[] };
    s.audit.push(log);
    syncJournal(s);
    log.journalIds = (s.journalEntries || []).filter(j => !priorJournalIds.has(j.id)).map(j => j.id);
    return s;
}
