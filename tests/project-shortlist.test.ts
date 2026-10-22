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
const brief={text:'4 KOL ẩm thực, 10 video và 15 clip ngắn toàn chiến dịch',category:'Ẩm thực',keyword:'',platform:'',minFollowers:0,minEr:0,targetCount:4,budget:300000000};
const profiles=Array.from({length:8},(_,n)=>({id:'kol-'+n,ten:'KOL '+n,linhVuc:[n===7?'Làm đẹp':'Ẩm thực'],nenTang:[{tenNenTang:'TikTok',linkProfile:'',soFollower:200000+n}],reviewSoBo:'Nội dung review',bangGia:{video:n===0?null:1000000}}));
async function seed(f:any){const {call,pid,cookies}=f;assert.equal((await call(`/projects/${pid}/catalog/import`,{profiles},cookies.admin)).status,200);await call(`/projects/${pid}/brief`,{brief,revision:0},cookies.pm);await call(`/projects/${pid}/shortlist/add`,{ids:profiles.slice(0,7).map(p=>p.id)},cookies.booking);return (await call(`/projects/${pid}/shortlist`,undefined,cookies.booking)).body;}
test('brief chung không cắt theo số lượng, nhập không ghi đè và phân quyền dự án',()=>fixture(async(f:any)=>{
  const {call,pid,other,cookies}=f;const d=await seed(f);
  assert.equal(d.matches.length,7);assert.equal(d.brief.targetCount,4);assert.equal(d.rows.length,7);
  assert.equal(d.rows[0].prices.video.status,'waiting');assert.equal(d.rows[1].prices.video.status,'unconfirmed');
  assert.equal((await call(`/projects/${pid}/catalog/import`,{profiles},cookies.admin)).body.added,0);
  assert.equal((await call(`/projects/${pid}/brief`,{brief,revision:1},cookies.booking)).status,403);
  assert.equal((await call(`/projects/${pid}/brief`,{brief,revision:0},cookies.pm)).status,409);
  for(const path of ['/shortlist','/shortlist/add','/catalog/import'])assert.equal((await call(`/projects/${other}`+path,path==='/shortlist'?undefined:{ids:['kol-0'],profiles},cookies.booking)).status,403);
}));
test('Booking xác nhận giá, PM lấy snapshot vào A/B, khóa giá cũ và không lộ giá bán',()=>fixture(async(f:any)=>{
  const {call,pid,cookies}=f;const d=await seed(f),row=d.rows[0];
  const a=(await call(`/projects/${pid}/options`,{name:'A'},cookies.pm)).body;
  const b=(await call(`/projects/${pid}/options`,{name:'B'},cookies.pm)).body;
  const selection={quoteId:a.quoteId,revision:1,selections:[{id:row.id,format:'video',quantity:3}]};
  assert.equal((await call(`/projects/${pid}/shortlist/to-option`,selection,cookies.pm)).status,400);
  const price={revision:1,format:'video',value:2000000,source:'Creator xác nhận qua email',confirm:true};
  assert.equal((await call(`/projects/${pid}/shortlist/${row.id}/prices`,{...price,source:''},cookies.booking)).status,400);
  assert.equal((await call(`/projects/${pid}/shortlist/${row.id}/prices`,price,cookies.booking)).status,200);
  assert.equal((await call(`/projects/${pid}/shortlist/${row.id}/prices`,price,cookies.booking)).status,409);
  assert.equal((await call(`/projects/${pid}/shortlist/to-option`,selection,cookies.booking)).status,403);
  assert.equal((await call(`/projects/${pid}/shortlist/to-option`,selection,cookies.pm)).status,200);
  assert.equal((await call(`/projects/${pid}/shortlist/to-option`,{...selection,revision:2},cookies.pm)).status,409);
  assert.equal((await call(`/projects/${pid}/shortlist/to-option`,{...selection,quoteId:b.quoteId},cookies.pm)).status,200);
  let o=(await call(`/projects/${pid}/options`,undefined,cookies.pm)).body;
  let q=o.options[0].versions[0];assert.equal(q.items[0].buyUnitPrice,2000000);assert.equal(q.items[0].quantity,3);assert.equal(q.items[0].sellUnitPrice,null);
  const sell={items:q.items.map((i:any)=>({...i,buyUnitPrice:9,sellUnitPrice:4000000})),discount:{mode:'fixed',value:0},agencyFee:{mode:'percent',value:10},taxRate:0};
  assert.equal((await call(`/projects/${pid}/quotes/${q.id}/save`,{revision:2,payload:sell},cookies.pm)).body.quote.items[0].buyUnitPrice,2000000);
  const book=(await call(`/projects/${pid}/options`,undefined,cookies.booking)).body.options[0].versions[0];
  assert.equal('finance' in book,false);assert.equal('sellUnitPrice' in book.items[0],false);
  assert.equal((await call(`/projects/${pid}/quotes/${q.id}/save`,{revision:3,buyPrices:[{id:q.items[0].id,buyUnitPrice:1}]},cookies.booking)).status,403);
  await call(`/projects/${pid}/shortlist/${row.id}/prices`,{...price,revision:2,value:3000000},cookies.booking);
  q=(await call(`/projects/${pid}/options`,undefined,cookies.pm)).body.options[0].versions[0];assert.equal(q.items[0].buyUnitPrice,2000000);assert.equal(q.finance.profit,7200000);
  assert.equal((await call(`/projects/${pid}/quotes/${q.id}/refresh-prices`,{revision:q.revision},cookies.booking)).status,403);
  assert.equal((await call(`/projects/${pid}/quotes/${q.id}/refresh-prices`,{revision:q.revision-1},cookies.pm)).status,409);
  assert.equal((await call(`/projects/${pid}/quotes/${q.id}/refresh-prices`,{revision:q.revision},cookies.pm)).status,200);
  const fresh=(await call(`/projects/${pid}/options`,undefined,cookies.pm)).body;
  assert.equal(fresh.options[0].versions[0].items[0].buyUnitPrice,3000000);
  assert.equal(fresh.options[0].versions[0].items[0].sellUnitPrice,4000000);
  assert.equal(fresh.options[1].versions[0].items[0].buyUnitPrice,2000000);
}));
test('chuyển danh sách nguyên tử, chống lẫn dự án và dữ liệu giá không hợp lệ',()=>fixture(async(f:any)=>{
  const {call,pid,other,cookies}=f;const d=await seed(f),row=d.rows[1];
  const q=(await call(`/projects/${pid}/options`,{name:'A'},cookies.pm)).body;
  await call(`/projects/${pid}/shortlist/${row.id}/prices`,{revision:1,format:'video',value:0,source:'Miễn phí',confirm:true},cookies.booking);
  assert.equal((await call(`/projects/${other}/shortlist/${row.id}/prices`,{revision:2,format:'video',value:1,source:'X',confirm:true},cookies.admin)).status,404);
  const r=await call(`/projects/${pid}/shortlist/to-option`,{quoteId:q.quoteId,revision:1,selections:[{id:row.id,format:'video',quantity:1},{id:'not-in-project',format:'video',quantity:1}]},cookies.pm);assert.equal(r.status,400);
  assert.equal((await call(`/projects/${pid}/options`,undefined,cookies.pm)).body.options[0].versions[0].items.length,0);
  assert.equal((await call(`/projects/${pid}/shortlist/${row.id}/prices`,{revision:2,format:'video',value:-1,source:'X',confirm:true},cookies.booking)).status,400);
  await call(`/projects/${pid}/shortlist/${row.id}/prices`,{revision:2,format:'video',value:1000000000000,source:'Giá thử lớn',confirm:true},cookies.booking);
  assert.equal((await call(`/projects/${pid}/shortlist/to-option`,{quoteId:q.quoteId,revision:1,selections:[{id:row.id,format:'video',quantity:100000}]},cookies.pm)).status,400);
  await call(`/projects/${pid}/shortlist/${row.id}/prices`,{revision:3,format:'video',value:0,source:'Miễn phí',confirm:true},cookies.booking);
  const good=await call(`/projects/${pid}/shortlist/to-option`,{quoteId:q.quoteId,revision:1,selections:[{id:row.id,format:'video',quantity:1}]},cookies.pm);assert.equal(good.status,200);
}));

test('hạng mục brief giữ tổng campaign / mỗi KOL, bỏ ER cũ và kiểm tra dữ liệu',()=>fixture(async(f:any)=>{
  const {call,pid,cookies,w}=f;
  await call(`/projects/${pid}/catalog/import`,{profiles:profiles.map((p:any)=>({...p,engagementRate:0}))},cookies.admin);
  // Mô phỏng bản lưu từ phiên bản trước: minEr cao không được loại KOL.
  w.db.prepare('INSERT INTO project_briefs VALUES (?,?,1)').run(pid,JSON.stringify({...brief,minEr:99}));
  const legacy=(await call(`/projects/${pid}/shortlist`,undefined,cookies.booking)).body;
  assert.equal(legacy.matches.length,7);assert.equal('minEr' in legacy.brief,false);assert.equal('engagementRate' in legacy.matches[0],false);
  assert.deepEqual(legacy.brief.deliverables,[]);
  const tasks=[{format:'video',quantity:10},{format:'shorts',quantity:15}];
  assert.equal((await call(`/projects/${pid}/brief`,{revision:1,brief:{...brief,deliverableScope:'campaign',deliverables:tasks}},cookies.pm)).status,200);
  const shared=(await call(`/projects/${pid}/shortlist`,undefined,cookies.booking)).body;
  assert.deepEqual(shared.brief.deliverables,tasks);assert.equal(shared.brief.deliverableScope,'campaign');
  assert.equal(shared.brief.targetCount,4);assert.equal(shared.matches.length,7);
  for(const deliverables of [[{format:'video',quantity:0}],[{format:'bad',quantity:1}],[{format:'video',quantity:1.5}],[tasks[0],tasks[0]]])assert.equal((await call(`/projects/${pid}/brief`,{revision:2,brief:{...brief,deliverables}},cookies.pm)).status,400);
  const perKol=[{format:'video',quantity:1},{format:'shorts',quantity:2}];
  assert.equal((await call(`/projects/${pid}/brief`,{revision:2,brief:{...brief,deliverableScope:'per_kol',deliverables:perKol}},cookies.pm)).status,200);
  assert.deepEqual((await call(`/projects/${pid}/shortlist`,undefined,cookies.pm)).body.brief.deliverables,perKol);
}));
