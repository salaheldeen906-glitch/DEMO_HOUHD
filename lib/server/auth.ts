import {env} from 'cloudflare:workers';
import {roles,visibleState,type Actor,type State} from '@/lib/domain';
export const db=()=>{if(!env.DB)throw Error('الحفظ غير متاح حاليًا؛ حاول مرة أخرى');return env.DB};
export const runtime=(key:string)=>String((env as any)[key]||'');
export const username=(value:any)=>String(value||'').normalize('NFKC').replace(/\s/g,'').toLowerCase().slice(0,80);
export const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
export async function passwordHash(value:string,salt:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(value),'PBKDF2',false,['deriveBits']);return Array.from(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},key,256))).map(x=>x.toString(16).padStart(2,'0')).join('')}
export const json=(value:any,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const sessionCookieName='uhda_session_v2';
const sessionCookies=(r:Request)=>(r.headers.get('cookie')||'').split(';').map(c=>c.trim()).map(c=>{const equals=c.indexOf('=');return {name:c.slice(0,equals),value:c.slice(equals+1)}}).filter(c=>[sessionCookieName,'uhda_session'].includes(c.name)&&c.value);
export const tokenCookie=(r:Request)=>{
 const cookies=sessionCookies(r);
 return (cookies.find(c=>c.name===sessionCookieName)||cookies.find(c=>c.name==='uhda_session'))?.value||'';
};
export const tokenCookies=(r:Request)=>[...new Set(sessionCookies(r).map(c=>c.value))];
const cookieAttributes=(r:Request)=>new URL(r.url).protocol==='https:'?'SameSite=None; Secure; Partitioned':'SameSite=Lax';
const sessionCookie=(r:Request,raw:string,maxAge:number)=>`${sessionCookieName}=${raw}; Path=/; HttpOnly; ${cookieAttributes(r)}; Max-Age=${maxAge}`;
export function logoutHeaders(r:Request){const headers=new Headers({'Cache-Control':'no-store'});headers.append('Set-Cookie',sessionCookie(r,'',0));headers.append('Set-Cookie',`uhda_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${new URL(r.url).protocol==='https:'?'; Secure':''}`);return headers;}
export class SessionError extends Error {}
export const managed=(w:any)=>w.code===runtime('UHDA_OWNER_WORKSPACE_CODE');
export async function authenticate(r:Request){
 const raw=tokenCookie(r);if(!raw)throw new SessionError('ادخل باسم المستخدم وكلمة المرور');const ss=await db().prepare('SELECT * FROM sessions WHERE token = ?').bind(await hash(raw)).first<any>();if(!ss||ss.expires&&ss.expires<Date.now())throw new SessionError('انتهت الجلسة؛ ادخل مرة أخرى');
 const w=await db().prepare('SELECT * FROM workspaces WHERE id = ?').bind(ss.workspace).first<any>();if(!w)throw new SessionError('المساحة غير موجودة');const s:State=JSON.parse(w.data);
 let role=ss.owner&&managed(w)&&!ss.expires?'admin':ss.role;if(ss.account){const a=await db().prepare('SELECT * FROM accounts WHERE id=? AND workspace=?').bind(ss.account,ss.workspace).first<any>();if(!a||!a.active||a.version!==ss.version||!s.people.some(p=>p.id===a.person&&p.active))throw new SessionError('تم تغيير صلاحيات الحساب أو تعطيله؛ ادخل مجددًا');ss.person=a.person;ss.role=role=a.role;ss.name=s.people.find(p=>p.id===a.person)?.name||a.username;}
 if(managed(w)&&!ss.owner&&!ss.account)throw new SessionError('هذه مساحة المالك؛ ادخل بحساب منحك المالك صلاحياته');if(ss.owner&&managed(w)&&!roles[role])ss.role=role='admin';
 const actor:Actor={name:ss.name,person:ss.person,role:roles[role]?role:'employee',owner:!!ss.owner};return {ss,w,s,actor,managed:managed(w)};
}
export async function newSession(r:Request,w:any,name:string,person:string,role:string,owner=false,account='',version=0){const raw=crypto.randomUUID()+crypto.randomUUID();await db().prepare('INSERT INTO sessions(token,workspace,name,person,owner,role,account,version,expires) VALUES(?,?,?,?,?,?,?,?,?)').bind(await hash(raw),w.id,name,person,owner?1:0,role,account,version,Date.now()+2592000000).run();return new Response(JSON.stringify({ok:true,role}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':sessionCookie(r,raw,2592000)}})}
export function projected(ctx:any){return visibleState(ctx.s,ctx.actor)}
export function sameOrigin(r:Request){return r.headers.get('sec-fetch-site')!=='cross-site'&&(!r.headers.get('origin')||r.headers.get('origin')===new URL(r.url).origin)}
export async function auditSecurity(wid:string,actor:Actor,action:string,record:string,after:string){for(let i=0;i<8;i++){const row=await db().prepare('SELECT * FROM workspaces WHERE id=?').bind(wid).first<any>();const s=JSON.parse(row.data);s.audit.push({id:crypto.randomUUID(),time:new Date().toISOString(),actor:actor.name,role:actor.role,person:actor.person,action,record,before:'',after});if(await db().prepare('UPDATE workspaces SET data=?,revision=revision+1 WHERE id=? AND revision=? RETURNING revision').bind(JSON.stringify(s),wid,row.revision).first())return;}throw Error('تعارض مؤقت في سجل النشاط؛ حاول مجددًا')}
