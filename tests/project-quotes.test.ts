import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createWorkspace} from '../server/workspace';

async function fixture(work:(f:any)=>Promise<void>){
  const w=createWorkspace('',{memory:true,setupCode:'test-code'});
  const app=express();app.use(express.json());app.use('/api/workspace',w.router);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${(server.address() as any).port}/api/workspace`;
  const call=async(path:string,body?:any,cookie?:string)=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
  try{
    await call('/auth/setup',{code:'test-code',email:'admin@example.test',name:'Admin',password:'admin-password-123'});
    const admin=(await call('/auth/login',{email:'admin@example.test',password:'admin-password-123'})).cookie;
    const pid=(await call('/projects',{name:'Dự án A',client:'Khách A',campaign:'Campaign A'},admin)).body.id;
    const other=(await call('/projects',{name:'Dự án B',client:'Khách B',campaign:'Campaign B'},admin)).body.id;
    const cookies:any={admin};
    for(const role of ['pm','booking']){
      await call('/users',{email:`${role}@example.test`,name:role,password:'temporary-password-123',role:'member'},admin);
      const temporary=(await call('/auth/login',{email:`${role}@example.test`,password:'temporary-password-123'})).cookie;
      await call('/auth/password',{currentPassword:'temporary-password-123',newPassword:'changed-password-123'},temporary);
      cookies[role]=(await call('/auth/login',{email:`${role}@example.test`,password:'changed-password-123'})).cookie;
      await call(`/projects/${pid}/members`,{email:`${role}@example.test`,role},admin);
    }
    await work({call,pid,other,cookies,w});
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));w.db.close();}
}
const payload={items:[{id:'line-a',creator:'KOL A',description:'Video review',phase:'Phase 1',kind:'kol',quantity:1,buyUnitPrice:60_000_000,sellUnitPrice:100_000_000,included:true}],discount:{mode:'fixed',value:10_000_000},agencyFee:{mode:'percent',value:12},taxRate:8};

test('phương án song song, giá mua/bán và Booking không nhận dữ liệu bán',()=>fixture(async({call,pid,other,cookies}:any)=>{
  const a=await call(`/projects/${pid}/options`,{name:'Phương án A',brief:'Brief A'},cookies.pm);
  const b=await call(`/projects/${pid}/options`,{name:'Phương án B',brief:'Brief B'},cookies.pm);
  assert.equal(a.status,200);assert.equal(b.status,200);
  const initOpt=(await call(`/projects/${pid}/options`,undefined,cookies.pm)).body;
  assert.deepEqual(initOpt.options[0].versions[0].agencyFee,{mode:'percent',value:12});
  const saved=await call(`/projects/${pid}/quotes/${a.body.quoteId}/save`,{revision:1,payload},cookies.pm);
  assert.equal(saved.status,200);assert.equal(saved.body.quote.finance.agencyFee,10_800_000);assert.equal(saved.body.quote.finance.profit,40_800_000);
  const manager=await call(`/projects/${pid}/options`,undefined,cookies.pm);assert.equal(manager.body.options.length,2);
  const booking=await call(`/projects/${pid}/options`,undefined,cookies.booking);
  const q=booking.body.options[0].versions[0];assert.equal(q.items[0].buyUnitPrice,60_000_000);
  for(const key of ['finance','discount','agencyFee','taxRate'])assert.equal(key in q,false);
  assert.equal('sellUnitPrice' in q.items[0],false);
  assert.equal((await call(`/projects/${other}/options`,undefined,cookies.pm)).status,403);
  assert.equal((await call(`/projects/${other}/quotes/${a.body.quoteId}/save`,{revision:2,payload},cookies.admin)).status,404);
  assert.equal((await call(`/projects/${pid}/options`,{name:'Illegal'},cookies.booking)).status,403);
}));

test('Booking chỉ sửa giá mua, version chống ghi đè và null được giữ',()=>fixture(async({call,pid,cookies}:any)=>{
  const a=(await call(`/projects/${pid}/options`,{name:'A'},cookies.pm)).body;
  await call(`/projects/${pid}/quotes/${a.quoteId}/save`,{revision:1,payload},cookies.pm);
  assert.equal((await call(`/projects/${pid}/quotes/${a.quoteId}/save`,{revision:2,payload},cookies.booking)).status,403);
  assert.equal((await call(`/projects/${pid}/quotes/${a.quoteId}/save`,{revision:2,buyPrices:[{id:'line-a',buyUnitPrice:0,sellUnitPrice:1}]},cookies.booking)).status,400);
  const update=await call(`/projects/${pid}/quotes/${a.quoteId}/save`,{revision:2,buyPrices:[{id:'line-a',buyUnitPrice:null}]},cookies.booking);
  assert.equal(update.status,200);assert.equal(update.body.quote.items[0].buyUnitPrice,null);assert.equal('finance' in update.body.quote,false);
  assert.equal((await call(`/projects/${pid}/quotes/${a.quoteId}/save`,{revision:2,payload},cookies.pm)).status,409);
  assert.equal((await call(`/projects/${pid}/quotes/${a.quoteId}/status`,{revision:3,status:'submitted'},cookies.pm)).status,400);
}));

test('duyệt, baseline duy nhất, phiên bản bất biến và bản khách không có giá mua',()=>fixture(async({call,pid,cookies}:any)=>{
  const created=(await call(`/projects/${pid}/options`,{name:'A'},cookies.pm)).body;
  const qid=created.quoteId;
  await call(`/projects/${pid}/quotes/${qid}/save`,{revision:1,payload},cookies.pm);
  // Dòng KOL nhập tay phải có xác nhận giá đầu vào do server ghi mới gửi duyệt được (Lỗi 1).
  assert.equal((await call(`/projects/${pid}/quotes/${qid}/confirm-buy`,{itemId:'line-a',source:'Báo giá KOL A',revision:2},cookies.pm)).status,200);
  assert.equal((await call(`/projects/${pid}/quotes/${qid}/select`,{},cookies.pm)).status,400);
  assert.equal((await call(`/projects/${pid}/quotes/${qid}/status`,{revision:3,status:'submitted'},cookies.pm)).status,200);
  assert.equal((await call(`/projects/${pid}/quotes/${qid}/status`,{revision:4,status:'approved'},cookies.pm)).status,200);
  assert.equal((await call(`/projects/${pid}/quotes/${qid}/save`,{revision:5,payload},cookies.pm)).status,409);
  assert.equal((await call(`/projects/${pid}/quotes/${qid}/select`,{},cookies.booking)).status,403);
  assert.equal((await call(`/projects/${pid}/quotes/${qid}/select`,{},cookies.pm)).status,200);
  const customer=await call(`/projects/${pid}/quotes/${qid}/customer`,undefined,cookies.pm);
  assert.equal(customer.body.revenueBeforeTax,100_800_000);assert.equal(customer.body.totalWithTax,108_864_000);
  assert.ok(!JSON.stringify(customer.body).includes('buyUnitPrice'));assert.ok(!JSON.stringify(customer.body).includes('profit'));
  assert.equal((await call(`/projects/${pid}/quotes/${qid}/customer`,undefined,cookies.booking)).status,403);
  const next=(await call(`/projects/${pid}/quotes/${qid}/new-version`,{},cookies.pm)).body.quoteId;
  const list=(await call(`/projects/${pid}/options`,undefined,cookies.pm)).body;
  assert.equal(list.baselineId,qid);assert.equal(list.options[0].versions.length,2);assert.equal(list.options[0].versions[0].number,2);assert.equal(list.options[0].versions[0].id,next);
  const alt=(await call(`/projects/${pid}/options`,{name:'B'},cookies.pm)).body.quoteId;
  await call(`/projects/${pid}/quotes/${alt}/save`,{revision:1,payload},cookies.pm);
  // Phương án B dùng cùng dòng KOL nhập tay — cũng phải xác nhận giá trước khi duyệt (Lỗi 1).
  assert.equal((await call(`/projects/${pid}/quotes/${alt}/confirm-buy`,{itemId:'line-a',source:'Báo giá KOL A',revision:2},cookies.pm)).status,200);
  await call(`/projects/${pid}/quotes/${alt}/status`,{revision:3,status:'submitted'},cookies.pm);
  await call(`/projects/${pid}/quotes/${alt}/status`,{revision:4,status:'approved'},cookies.pm);
  await call(`/projects/${pid}/quotes/${alt}/select`,{},cookies.pm);
  assert.equal((await call(`/projects/${pid}/options`,undefined,cookies.pm)).body.baselineId,alt);
}));

test('dữ liệu không hợp lệ bị chặn trước khi ghi báo giá',()=>fixture(async({call,pid,cookies}:any)=>{
  const qid=(await call(`/projects/${pid}/options`,{name:'A'},cookies.pm)).body.quoteId;
  for(const bad of [{...payload,taxRate:-1},{...payload,discount:{mode:'percent',value:101}},{...payload,items:[{...payload.items[0],quantity:0}]},{...payload,items:[{...payload.items[0],buyUnitPrice:-1}]}]){
    assert.equal((await call(`/projects/${pid}/quotes/${qid}/save`,{revision:1,payload:bad},cookies.pm)).status,400);
  }
  const result=(await call(`/projects/${pid}/options`,undefined,cookies.pm)).body.options[0].versions[0];
  assert.equal(result.revision,1);assert.deepEqual(result.items,[]);
}));
