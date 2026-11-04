import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {readFileSync} from 'node:fs';
import {createWorkspace} from '../server/workspace';

// SOW theo từng creator trong phase (anh chốt 04/11/2026): chốt ở Bước 3 (endpoint
// /shortlist/:rowId/sow), gợi ý phân bổ chỉ theo SOW, dòng kèm theo (kể cả Story)
// vào phương án với giá 0 + snapshot đã xác nhận và KHÔNG chặn cổng giá.
async function fixture(work:(f:any)=>Promise<void>){
  const w=createWorkspace('',{memory:true,setupCode:'test-code'});
  const app=express();app.use(express.json());app.use('/api/workspace',w.router);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${(server.address() as any).port}/api/workspace`;
  const call=async(path:string,body?:any,cookie?:string)=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
  try{
    await call('/auth/setup',{code:'test-code',email:'admin@example.test',name:'Admin',password:'admin-password-123'});
    const admin=(await call('/auth/login',{email:'admin@example.test',password:'admin-password-123'})).cookie;
    const pid=(await call('/projects',{name:'Dự án SOW',client:'Khách SOW',campaign:'Campaign SOW'},admin)).body.id;
    const cookies:any={admin};
    for(const role of ['pm','booking']){
      await call('/users',{email:`${role}@example.test`,name:role,password:'temporary-password-123',role:'member'},admin);
      const temporary=(await call('/auth/login',{email:`${role}@example.test`,password:'temporary-password-123'})).cookie;
      await call('/auth/password',{currentPassword:'temporary-password-123',newPassword:'changed-password-123'},temporary);
      cookies[role]=(await call('/auth/login',{email:`${role}@example.test`,password:'changed-password-123'})).cookie;
      await call(`/projects/${pid}/members`,{email:`${role}@example.test`,role},admin);
    }
    await work({call,pid,cookies});
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));w.db.close();}
}
const briefBase:any={text:'Brief SOW',category:'',keyword:'',platform:'',minFollowers:0,targetCount:null,budget:null,deliverableScope:'per_kol',deliverables:[{format:'video',quantity:2},{format:'sdha',quantity:1}],partnerType:null,kpiTopics:null,kpiComments:null,kpiBuzz:null,pillars:[],services:[]};
const kol=(id:string)=>({id,ten:'KOL '+id,linhVuc:['Giải trí'],nenTang:[{tenNenTang:'TikTok',linkProfile:'',soFollower:100000}],reviewSoBo:'',bangGia:{video:10_000_000,sdha:9_000_000}});
async function seed(f:any){
  const {call,pid,cookies}=f;
  assert.equal((await call(`/projects/${pid}/catalog/import`,{profiles:[kol('a'),kol('b')]},cookies.admin)).status,200);
  const ph=await call(`/projects/${pid}/phases`,{name:'Phase SOW',kind:'creator',brief:briefBase},cookies.pm);
  assert.equal(ph.status,200);
  assert.equal((await call(`/projects/${pid}/shortlist/add`,{ids:['a','b'],phaseId:ph.body.id},cookies.booking)).status,200);
  const d=(await call(`/projects/${pid}/shortlist`,undefined,cookies.pm)).body;
  return {phaseId:ph.body.id,rows:d.rows};
}
const sowA=[{key:'video',qty:1,included:false},{key:'story',qty:3,included:false},{key:'sdha',qty:1,included:true}];
test('SOW: chốt ở Bước 3, Story tự thành kèm theo, revision chống ghi đè, key lạ bị chặn',()=>fixture(async(f:any)=>{
  const {call,pid,cookies}=f;const {rows}=await seed(f);const rowA=rows.find((r:any)=>r.catalogId==='a');
  assert.equal(rowA.sow,null);
  const ok=await call(`/projects/${pid}/shortlist/${rowA.id}/sow`,{revision:rowA.revision,sow:sowA},cookies.booking);
  assert.equal(ok.status,200);
  const d=(await call(`/projects/${pid}/shortlist`,undefined,cookies.pm)).body;
  const saved=d.rows.find((r:any)=>r.id===rowA.id);
  assert.equal(saved.sow.length,3);
  assert.equal(saved.sow.find((e:any)=>e.key==='story').included,true,'Story luôn là hạng mục kèm theo');
  assert.equal(saved.sow.find((e:any)=>e.key==='video').qty,1);
  assert.equal((await call(`/projects/${pid}/shortlist/${rowA.id}/sow`,{revision:rowA.revision,sow:sowA},cookies.booking)).status,409);
  const fresh=(await call(`/projects/${pid}/shortlist`,undefined,cookies.pm)).body.rows.find((r:any)=>r.id===rowA.id);
  assert.equal((await call(`/projects/${pid}/shortlist/${rowA.id}/sow`,{revision:fresh.revision,sow:[{key:'reels',qty:1,included:false}]},cookies.booking)).status,400);
  assert.equal((await call(`/projects/${pid}/shortlist/${rowA.id}/sow`,{revision:fresh.revision,sow:[{key:'video',qty:0,included:false}]},cookies.booking)).status,400);
}));
test('Gợi ý phân bổ: chỉ theo SOW của từng creator; chưa chốt thì theo brief như cũ',()=>fixture(async(f:any)=>{
  const {call,pid,cookies}=f;const {phaseId,rows}=await seed(f);const rowA=rows.find((r:any)=>r.catalogId==='a'),rowB=rows.find((r:any)=>r.catalogId==='b');
  await call(`/projects/${pid}/shortlist/${rowA.id}/sow`,{revision:rowA.revision,sow:sowA},cookies.pm);
  const r=await call(`/projects/${pid}/options/suggest-allocations`,{phaseIds:[phaseId]},cookies.pm);
  assert.equal(r.status,200);
  const mine=(id:string)=>Object.fromEntries(r.body.allocations.filter((a:any)=>a.shortlistId===id).map((a:any)=>[a.key,a.quantity]));
  assert.deepEqual(mine(rowA.id),{video:1,story:3,sdha:1},'A: video theo SOW (1, không phải 2 của brief), story + sdha kèm theo theo SOW');
  assert.deepEqual(mine(rowB.id),{video:2,sdha:1},'B chưa chốt SOW: gợi ý theo brief như cũ');
}));
test('Tạo phương án: dòng kèm theo giá 0, snapshot đã xác nhận, không chặn cổng giá; Story không kèm theo bị chặn',()=>fixture(async(f:any)=>{
  const {call,pid,cookies}=f;const {rows}=await seed(f);const rowA=rows.find((r:any)=>r.catalogId==='a');
  await call(`/projects/${pid}/shortlist/${rowA.id}/sow`,{revision:rowA.revision,sow:sowA},cookies.pm);
  const bad=await call(`/projects/${pid}/options/from-phases`,{name:'PA lỗi',allocations:[{shortlistId:rowA.id,key:'story',quantity:1}]},cookies.pm);
  assert.equal(bad.status,400);
  const priceRow=(await call(`/projects/${pid}/shortlist`,undefined,cookies.pm)).body.rows.find((r:any)=>r.id===rowA.id);
  assert.equal((await call(`/projects/${pid}/shortlist/${rowA.id}/prices`,{revision:priceRow.revision,format:'video',value:10_000_000,source:'Creator xác nhận',confirm:true},cookies.booking)).status,200);
  const created=await call(`/projects/${pid}/options/from-phases`,{name:'PA SOW',allocations:[
    {shortlistId:rowA.id,key:'video',quantity:1},
    {shortlistId:rowA.id,key:'story',quantity:3,included:true},
    {shortlistId:rowA.id,key:'sdha',quantity:1,included:true},
  ]},cookies.pm);
  assert.equal(created.status,200);assert.equal(created.body.missingPrice,0);assert.equal(created.body.unconfirmedPrice,0);
  const opts=(await call(`/projects/${pid}/options`,undefined,cookies.pm)).body.options;
  const q=opts[0].versions[0];
  const story=q.items.find((i:any)=>i.format==='story');
  assert.equal(story.bundled,true);assert.equal(story.buyUnitPrice,0);assert.equal(story.sellUnitPrice,0);assert.equal(story.priceSnapshot.status,'confirmed');
  const sdha=q.items.find((i:any)=>i.format==='sdha');
  assert.equal(sdha.bundled,true);assert.equal(sdha.buyUnitPrice,0);
  const payload={...q,payload:undefined,items:q.items.map((i:any)=>i.format==='video'?{...i,sellUnitPrice:15_000_000}:i),discount:{mode:'fixed',value:0},agencyFee:{mode:'percent',value:12},taxRate:0};
  const saved=await call(`/projects/${pid}/quotes/${q.id}/save`,{revision:q.revision,payload:{items:payload.items,discount:payload.discount,agencyFee:payload.agencyFee,taxRate:0}},cookies.pm);
  assert.equal(saved.status,200);
  const q2=(await call(`/projects/${pid}/options`,undefined,cookies.pm)).body.options[0].versions[0];
  assert.equal(q2.items.find((i:any)=>i.format==='story').bundled,true,'bundled được giữ sau khi lưu bản nháp');
  const submit=await call(`/projects/${pid}/quotes/${q2.id}/status`,{status:'submitted',revision:q2.revision},cookies.pm);
  assert.equal(submit.status,200,'cổng giá không chặn dòng kèm theo');
}));
test('UI: Bước 3 có chốt SOW, phân bổ gom nhóm + nhắc chưa chốt SOW',()=>{
  const panel=readFileSync(new URL('../src/components/ProjectShortlistPanel.tsx',import.meta.url),'utf8');
  assert.ok(panel.includes('Chốt SOW'),'Bước 3 phải có nút chốt SOW');
  assert.ok(panel.includes('/sow`'),'Bước 3 phải gọi endpoint SOW');
  const quotes=readFileSync(new URL('../src/components/ProjectQuotesPanel.tsx',import.meta.url),'utf8');
  assert.ok(quotes.includes('Chưa chốt SOW'),'phân bổ phải nhắc creator chưa chốt SOW');
  assert.ok(quotes.includes('Kèm theo'),'phân bổ phải hiện nhãn kèm theo');
  assert.ok(quotes.includes('Chỉ xổ dòng theo SOW đã chốt ở Bước 3'),'phân bổ phải nói rõ nguồn dòng');
});
