import uuid,concurrent.futures,json as jsonlib,urllib.request,urllib.error,http.cookiejar
class Response:
 def __init__(self,r): self.status_code=r.code;self.body=r.read()
 def json(self): return jsonlib.loads(self.body)
class Session:
 def __init__(self): self.opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
 def request(self,url,data=None):
  req=urllib.request.Request(url,data=jsonlib.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json'})
  try: return Response(self.opener.open(req,timeout=30))
  except urllib.error.HTTPError as e: return Response(e)
 def get(self,url): return self.request(url)
 def post(self,url,json,timeout=30): return self.request(url,json)

BASE='http://127.0.0.1:8787/api/demo'
count=0
def chk(x):
 global count
 assert x
 count+=1
def session():
 return Session()
def post(sess,type,payload=None,role='admin',**extra):
 return sess.post(BASE,json={'type':type,'payload':payload or {},'role':role,'requestId':str(uuid.uuid4()),**extra},timeout=30)
a=session();r=post(a,'create',name='QA Owner',organization='QA shared',seed='simple');chk(r.status_code==200)
w=a.get(BASE).json();code=w['code'];p=w['state']['people'][0]['id'];manager=w['state']['people'][2]['id'];owner=w['session']['person'];chk(w['session']['owner'])
b=session();chk(post(b,'join',name='QA second',code=code).status_code==200);wb=b.get(BASE).json();assert 'code' in wb,wb;chk(wb['code']==code);chk(not b.get(BASE).json()['session']['owner'])
c=session();chk(post(c,'create',name='QA isolated',organization='QA second workspace',seed='empty').status_code==200);chk(c.get(BASE).json()['state']['advances']==[]);chk(c.get(BASE).json()['state']['people']==[])
from datetime import datetime
from zoneinfo import ZoneInfo
date=datetime.now(ZoneInfo('Africa/Cairo')).date().isoformat()
chk(post(a,'advance.create',{'person':p,'amount':'100','date':date,'note':'Concurrency QA'},'finance').status_code==200)
aid=a.get(BASE).json()['state']['advances'][0]['id'];chk(b.get(BASE).json()['state']['advances'][0]['id']==aid);chk(post(c,'advance.receive',{'id':aid},'employee').status_code==400)
chk(post(a,'persona',person=p,role='employee').status_code==200);chk(post(b,'persona',person=p,role='employee').status_code==200)
chk(post(a,'advance.receive',{'id':aid},'employee').status_code==200)
category=a.get(BASE).json()['state']['categories'][0]['id'];ids=[]
for ss in [a,b]:
 chk(post(ss,'expense.save',{'advance':aid,'amount':'80','date':date,'category':category,'note':'Race QA','proof':'written proof'},'employee').status_code==200)
 ids.append(ss.get(BASE).json()['state']['expenses'][-1]['id'])
with concurrent.futures.ThreadPoolExecutor(2) as ex:
 rs=list(ex.map(lambda pair:post(pair[0],'expense.submit',{'id':pair[1]},'employee'),zip([a,b],ids)))
chk(sorted([r.status_code for r in rs])==[200,400]);state=a.get(BASE).json()['state'];chk(sum(x['posted'] for x in state['expenses'])==8000)
chk(post(b,'reset',{'confirm':'إعادة تهيئة'},'admin').status_code==400)
accepted=next(x for x in state['expenses'] if x['posted']);rid=str(uuid.uuid4());chk(post(a,'expense.submit',{'id':accepted['id']},'employee',requestId=rid).status_code==200);chk(post(a,'expense.submit',{'id':accepted['id']},'employee',requestId=rid).status_code==200);chk(sum(x['posted'] for x in a.get(BASE).json()['state']['expenses'])==8000)
chk(post(a,'persona',person=manager,role='manager').status_code==200);chk(post(a,'expense.correct',{'id':accepted['id'],'reason':'راجع القيمة'},'manager').status_code==200)
chk(post(a,'persona',person=p,role='employee').status_code==200);chk(post(a,'expense.save',{'id':accepted['id'],'advance':aid,'amount':'50','date':date,'category':category,'note':'Correction QA','proof':'corrected proof'},'employee').status_code==200);chk(sum(x['posted'] for x in a.get(BASE).json()['state']['expenses'])==8000);chk(post(a,'expense.submit',{'id':accepted['id']},'employee').status_code==200);chk(sum(x['posted'] for x in b.get(BASE).json()['state']['expenses'])==5000)
chk(c.get(BASE).json()['state']['expenses']==[])
print(f'{count} shared storage / workspace isolation / concurrent API assertions passed')
