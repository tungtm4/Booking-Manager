import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {readFileSync} from 'node:fs';
import {createWorkspace} from '../server/workspace';

// SOW theo từng creator trong phase (anh chốt 04/11/2026): chốt ở Bước 3 (endpoint
// /shortlist/:rowId/sow), gợi ý phân bổ chỉ theo SOW. MÔ HÌNH PHÍ MỚI (anh chốt tiếp
// 04/11/2026): SOW chỉ còn hạng mục + số lượng — KHÔNG còn "kèm theo"; Story không
// sinh dòng báo giá (ghi vào ghi chú nội bộ của dòng creator); mọi dòng phân bổ là
// dòng giá bình thường, phí cụ thể gõ tại bảng phân bổ, ghi chú nội bộ đi theo dòng
// vào phương án và không xuất bản khách.
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
const sowA=[{key:'video',qty:1},{key:'story',qty:3},{key:'sdha',qty:1}];
test('SOW: chốt ở Bước 3 chỉ gồm hạng mục + số lượng (không còn kèm theo), revision chống ghi đè, key lạ bị chặn',()=>fixture(async(f:any)=>{
  const {call,pid,cookies}=f;const {rows}=await seed(f);const rowA=rows.find((r:any)=>r.catalogId==='a');
  assert.equal(rowA.sow,null);
  const ok=await call(`/projects/${pid}/shortlist/${rowA.id}/sow`,{revision:rowA.revision,sow:sowA},cookies.booking);
  assert.equal(ok.status,200);
  const d=(await call(`/projects/${pid}/shortlist`,undefined,cookies.pm)).body;
  const saved=d.rows.find((r:any)=>r.id===rowA.id);
  assert.equal(saved.sow.length,3);
  assert.deepEqual(saved.sow.find((e:any)=>e.key==='story'),{key:'story',qty:3},'Story lưu như hạng mục thường, không còn trường included');
  assert.ok(saved.sow.every((e:any)=>!('included' in e)),'Mọi hạng mục SOW đều không còn trường included');
  assert.equal(saved.sow.find((e:any)=>e.key==='video').qty,1);
  assert.equal((await call(`/projects/${pid}/shortlist/${rowA.id}/sow`,{revision:rowA.revision,sow:sowA},cookies.booking)).status,409);
  const fresh=(await call(`/projects/${pid}/shortlist`,undefined,cookies.pm)).body.rows.find((r:any)=>r.id===rowA.id);
  // Payload kiểu cũ (còn included) vẫn nhận nhưng server tự bỏ trường đó khi lưu.
  const legacy=await call(`/projects/${pid}/shortlist/${rowA.id}/sow`,{revision:fresh.revision,sow:[{key:'video',qty:2,included:true}]},cookies.booking);
  assert.equal(legacy.status,200);
  const afterLegacy=(await call(`/projects/${pid}/shortlist`,undefined,cookies.pm)).body.rows.find((r:any)=>r.id===rowA.id);
  assert.deepEqual(afterLegacy.sow,[{key:'video',qty:2}],'included trong payload cũ bị lược bỏ khi lưu');
  assert.equal((await call(`/projects/${pid}/shortlist/${rowA.id}/sow`,{revision:afterLegacy.revision,sow:[{key:'reels',qty:1}]},cookies.booking)).status,400);
  assert.equal((await call(`/projects/${pid}/shortlist/${rowA.id}/sow`,{revision:afterLegacy.revision,sow:[{key:'video',qty:0}]},cookies.booking)).status,400);
}));
test('Gợi ý phân bổ: chỉ theo SOW của từng creator; chưa chốt thì theo brief như cũ',()=>fixture(async(f:any)=>{
  const {call,pid,cookies}=f;const {phaseId,rows}=await seed(f);const rowA=rows.find((r:any)=>r.catalogId==='a'),rowB=rows.find((r:any)=>r.catalogId==='b');
  await call(`/projects/${pid}/shortlist/${rowA.id}/sow`,{revision:rowA.revision,sow:sowA},cookies.pm);
  const r=await call(`/projects/${pid}/options/suggest-allocations`,{phaseIds:[phaseId]},cookies.pm);
  assert.equal(r.status,200);
  const mine=(id:string)=>Object.fromEntries(r.body.allocations.filter((a:any)=>a.shortlistId===id).map((a:any)=>[a.key,a.quantity]));
  assert.deepEqual(mine(rowA.id),{video:1,sdha:1},'A: chỉ hạng mục tính tiền trong SOW (video 1 theo SOW, không phải 2 của brief; sdha là dòng giá bình thường) — Story KHÔNG được gợi ý thành dòng phân bổ');
  assert.deepEqual(mine(rowB.id),{video:2,sdha:1},'B chưa chốt SOW: gợi ý theo brief như cũ');
}));
test('Tạo phương án: Story bị chặn (không phải dòng tính tiền); hạng mục từng kèm theo nay là dòng giá thường; ghi chú nội bộ đi theo dòng và sống qua lần lưu',()=>fixture(async(f:any)=>{
  const {call,pid,cookies}=f;const {rows}=await seed(f);const rowA=rows.find((r:any)=>r.catalogId==='a');
  await call(`/projects/${pid}/shortlist/${rowA.id}/sow`,{revision:rowA.revision,sow:sowA},cookies.pm);
  const bad=await call(`/projects/${pid}/options/from-phases`,{name:'PA lỗi',allocations:[{shortlistId:rowA.id,key:'story',quantity:1}]},cookies.pm);
  assert.equal(bad.status,400,'Story không sinh dòng báo giá — ghi vào ghi chú nội bộ');
  let priceRow=(await call(`/projects/${pid}/shortlist`,undefined,cookies.pm)).body.rows.find((r:any)=>r.id===rowA.id);
  assert.equal((await call(`/projects/${pid}/shortlist/${rowA.id}/prices`,{revision:priceRow.revision,format:'video',value:10_000_000,source:'Creator xác nhận',confirm:true},cookies.booking)).status,200);
  priceRow=(await call(`/projects/${pid}/shortlist`,undefined,cookies.pm)).body.rows.find((r:any)=>r.id===rowA.id);
  assert.equal((await call(`/projects/${pid}/shortlist/${rowA.id}/prices`,{revision:priceRow.revision,format:'sdha',value:9_000_000,source:'Phí chốt tại phân bổ',confirm:true},cookies.pm)).status,200);
  const created=await call(`/projects/${pid}/options/from-phases`,{name:'PA SOW',allocations:[
    {shortlistId:rowA.id,key:'video',quantity:1,sellUnitPrice:15_000_000,internalNote:'FOC 2 story trước khi livestream 2 ngày'},
    {shortlistId:rowA.id,key:'sdha',quantity:1,sellUnitPrice:12_000_000},
  ]},cookies.pm);
  assert.equal(created.status,200);assert.equal(created.body.missingPrice,0);assert.equal(created.body.unconfirmedPrice,0);
  const opts=(await call(`/projects/${pid}/options`,undefined,cookies.pm)).body.options;
  const q=opts[0].versions[0];
  assert.equal(q.items.find((i:any)=>i.format==='story'),undefined,'Không có dòng Story trong phương án');
  const video=q.items.find((i:any)=>i.format==='video');
  assert.equal(video.buyUnitPrice,10_000_000);assert.equal(video.internalNote,'FOC 2 story trước khi livestream 2 ngày','Ghi chú nội bộ từ phân bổ đi theo dòng');
  const sdha=q.items.find((i:any)=>i.format==='sdha');
  assert.equal(sdha.bundled,undefined,'SDHA không còn là dòng kèm theo');assert.equal(sdha.buyUnitPrice,9_000_000);assert.equal(sdha.sellUnitPrice,12_000_000);
  const saved=await call(`/projects/${pid}/quotes/${q.id}/save`,{revision:q.revision,payload:{items:q.items,discount:{mode:'fixed',value:0},agencyFee:{mode:'percent',value:12},taxRate:0}},cookies.pm);
  assert.equal(saved.status,200);
  const q2=(await call(`/projects/${pid}/options`,undefined,cookies.pm)).body.options[0].versions[0];
  assert.equal(q2.items.find((i:any)=>i.format==='video').internalNote,'FOC 2 story trước khi livestream 2 ngày','Ghi chú nội bộ không bị rơi khi lưu bản nháp (cleanItems phải giữ trường này)');
  const submit=await call(`/projects/${pid}/quotes/${q2.id}/status`,{status:'submitted',revision:q2.revision},cookies.pm);
  assert.equal(submit.status,200,'Đủ giá + đã xác nhận thì cổng giá cho qua');
}));
test('Giá báo khách điền ngay tại phân bổ mang thẳng vào phương án cho MỌI dòng; giá sai bị chặn',()=>fixture(async(f:any)=>{
  const {call,pid,cookies}=f;const {rows}=await seed(f);const rowA=rows.find((r:any)=>r.catalogId==='a');
  const bad=await call(`/projects/${pid}/options/from-phases`,{name:'PA lỗi giá',allocations:[{shortlistId:rowA.id,key:'video',quantity:1,sellUnitPrice:-5}]},cookies.pm);
  assert.equal(bad.status,400);
  const created=await call(`/projects/${pid}/options/from-phases`,{name:'PA có giá bán',allocations:[
    {shortlistId:rowA.id,key:'video',quantity:2,sellUnitPrice:15_000_000},
    {shortlistId:rowA.id,key:'sdha',quantity:1,sellUnitPrice:12_000_000},
  ]},cookies.pm);
  assert.equal(created.status,200);
  const q=(await call(`/projects/${pid}/options`,undefined,cookies.pm)).body.options[0].versions[0];
  assert.equal(q.items.find((i:any)=>i.format==='video').sellUnitPrice,15_000_000,'giá bán từ phân bổ vào đúng dòng phương án');
  assert.equal(q.items.find((i:any)=>i.format==='sdha').sellUnitPrice,12_000_000,'SDHA là dòng giá bình thường — giá bán điền ở phân bổ được tôn trọng');
}));
test('UI: Bước 3 có chốt SOW không còn tick kèm theo; phân bổ có ô phí + cột ghi chú nội bộ, Story không sinh dòng',()=>{
  const panel=readFileSync(new URL('../src/components/ProjectShortlistPanel.tsx',import.meta.url),'utf8');
  assert.ok(panel.includes('Chốt SOW'),'Bước 3 phải có nút chốt SOW');
  assert.ok(panel.includes('/sow`'),'Bước 3 phải gọi endpoint SOW');
  assert.ok(!panel.includes('Kèm theo (không tính tiền riêng)'),'Bước 3 không còn tick Kèm theo trong SOW');
  const quotes=readFileSync(new URL('../src/components/ProjectQuotesPanel.tsx',import.meta.url),'utf8');
  assert.ok(quotes.includes('Chưa chốt SOW'),'phân bổ phải nhắc creator chưa chốt SOW');
  assert.ok(quotes.includes('Chỉ xổ dòng theo SOW đã chốt ở Bước 3'),'phân bổ phải nói rõ nguồn dòng');
  assert.ok(quotes.includes('sellAlloc')&&quotes.includes('Điền giá bán'),'bảng phân bổ phải có cột điền giá báo khách ngay tại chỗ');
  assert.ok(quotes.includes('saveAllocFee')&&quotes.includes('Phí chốt tại phân bổ'),'bảng phân bổ phải có ô gõ phí đầu vào, lưu vào hồ sơ giá với nguồn Phí chốt tại phân bổ');
  assert.ok(quotes.includes('Ghi chú (nội bộ)')&&quotes.includes('noteAlloc'),'bảng phân bổ phải có cột Ghi chú nội bộ theo dòng');
  assert.ok(quotes.includes("if(key==='story')continue;"),'Story không được sinh dòng phân bổ');
  const excelSrc=quotes.slice(quotes.indexOf('async function exportQuoteExcel'),quotes.indexOf('// Vấn đề giá'));
  assert.ok(!excelSrc.includes('internalNote'),'Xuất Excel bản khách TUYỆT ĐỐI không chứa ghi chú nội bộ');
});
