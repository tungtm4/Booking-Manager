import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createWorkspace} from '../server/workspace';

// ===== UX-1 — Test API THẬT qua HTTP (không mock, không INSERT SQL trực tiếp) =====
// Bao phủ các hành vi UX-1 kiểm chứng ở tầng API:
// 1) Admin tạo dự án kèm khách hàng/chiến dịch, gán nhiều PM/Booking; phạm vi dự án
//    cách ly đúng người (user ngoài dự án không thấy, không mở được).
// 2) Endpoint P&L của dự án trả totalK/totalPayableL đúng và KHÔNG có trường
//    costGross (lỗi UX-1 vòng 1: UI đọc costGross nên chi phí luôn trống);
//    Booking bị 403 ở endpoint P&L.
// 3) Dữ liệu báo giá phía Booking bị tước giá bán (sellUnitPrice) ở serializer thật.

async function boot(){
  const w=createWorkspace('',{memory:true,setupCode:'test-code'});
  const app=express();app.use(express.json({limit:'20mb'}));app.use('/api/workspace',w.router);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${(server.address() as any).port}/api/workspace`;
  const call=async(path:string,body?:any,cookie?:string)=>{
    const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:r.status,body:await r.json().catch(()=>({})),cookie:r.headers.get('set-cookie')?.split(';')[0]};
  };
  await call('/auth/setup',{code:'test-code',email:'admin@ux1.test',name:'Admin',password:'admin-password-123'});
  const admin=(await call('/auth/login',{email:'admin@ux1.test',password:'admin-password-123'})).cookie;
  const mkUser=async(email:string)=>{
    await call('/users',{email,name:email,password:'temporary-password-123',role:'member'},admin);
    const tmp=(await call('/auth/login',{email,password:'temporary-password-123'})).cookie;
    await call('/auth/password',{currentPassword:'temporary-password-123',newPassword:'changed-password-123'},tmp);
    return (await call('/auth/login',{email,password:'changed-password-123'})).cookie;
  };
  return {server,call,admin,mkUser};
}

test('UX-1.1 Admin tạo dự án (client/campaign) + gán 1 PM, 2 Booking; user ngoài dự án bị cách ly',async()=>{
  const {server,call,admin,mkUser}=await boot();
  try{
    const pm=await mkUser('pm@ux1.test');
    await mkUser('booking1@ux1.test');await mkUser('booking2@ux1.test');
    const outsider=await mkUser('outsider@ux1.test');
    const created=await call('/projects',{name:'Dự án UX-1',client:'Khách Hàng A',campaign:'Chiến Dịch B'},admin);
    assert.equal(created.status,200,JSON.stringify(created.body));
    const pid=created.body.id;
    for(const [email,role] of [['pm@ux1.test','pm'],['booking1@ux1.test','booking'],['booking2@ux1.test','booking']] as const){
      const r=await call(`/projects/${pid}/members`,{email,role},admin);
      assert.equal(r.status,200,`gán ${email}: ${JSON.stringify(r.body)}`);
    }
    const members=await call(`/projects/${pid}/members`,undefined,admin);
    assert.equal(members.status,200);
    assert.equal(members.body.members.length,3,'đúng 3 thành viên đã gán');
    const pmList=await call('/projects',undefined,pm);
    const mine=pmList.body.projects.find((p:any)=>p.id===pid);
    assert.ok(mine,'PM thấy dự án được gán');
    assert.equal(mine.client_name,'Khách Hàng A');
    assert.equal(mine.campaign_name,'Chiến Dịch B');
    assert.equal(mine.canManage,true,'PM có quyền quản lý dự án');
    const outList=await call('/projects',undefined,outsider);
    assert.ok(!outList.body.projects.some((p:any)=>p.id===pid),'user ngoài dự án KHÔNG thấy dự án trong danh sách');
    const outMembers=await call(`/projects/${pid}/members`,undefined,outsider);
    assert.ok(outMembers.status>=400,`user ngoài dự án mở thẳng phải bị chặn (status=${outMembers.status})`);
  }finally{server.close();}
});

// Dựng 1 dự án có bản chốt với 1 dòng KOL công ty (NET 10tr, VAT 8%) — dùng cho 2 test dưới.
async function seedPnlProject(){
  const ctx=await boot();
  const {call,admin,mkUser}=ctx;
  const pm=(await mkUser('pm@ux1.test'))!;
  const booking=(await mkUser('booking@ux1.test'))!;
  const pid=(await call('/projects',{name:'Dự án P&L UX-1',client:'Khách',campaign:'Camp'},admin)).body.id;
  await call(`/projects/${pid}/members`,{email:'pm@ux1.test',role:'pm'},admin);
  await call(`/projects/${pid}/members`,{email:'booking@ux1.test',role:'booking'},admin);
  const kol={id:'kol-ux1-ct',ten:'KOL Công Ty UX1',linhVuc:['Ẩm thực'],nenTang:[{tenNenTang:'TikTok',linkProfile:'',soFollower:40000}],reviewSoBo:'',bangGia:{video:10000000}};
  assert.equal((await call(`/projects/${pid}/catalog/import`,{profiles:[kol]},admin)).status,200);
  const profBase={representative:'',taxCode:'',idNumber:'',address:'',certEmail:'',bankName:'',bankAccountName:'',bankAccountNumber:'',bankBranch:'',note:''};
  assert.equal((await call('/partners/kol/kol-ux1-ct/signing',{...profBase,legalName:'Công Ty UX1',signingForm:'cong_ty',customTaxRate:null,customTaxMode:null,revision:0},admin)).status,200);
  const phase=await call(`/projects/${pid}/phases`,{name:'Phase 1',kind:'creator',budget:200000000,brief:{text:'Brief',deliverableScope:'campaign',deliverables:[{format:'video',quantity:10}],services:[],platforms:['TikTok']}},pm);
  assert.equal(phase.status,200,JSON.stringify(phase.body));
  await call(`/projects/${pid}/shortlist/add`,{ids:['kol-ux1-ct']},pm);
  const sl=await call(`/projects/${pid}/shortlist`,undefined,pm);
  const row=sl.body.rows.find((r:any)=>r.catalogId==='kol-ux1-ct');
  assert.ok(row,'có dòng shortlist');
  assert.equal((await call(`/projects/${pid}/shortlist/${row.id}/prices`,{revision:row.revision,format:'video',value:10000000,source:'Test UX-1',confirm:true},pm)).status,200);
  const opt=await call(`/projects/${pid}/options/from-phases`,{name:'Phương án UX-1',allocations:[{shortlistId:row.id,key:'video',quantity:1}]},pm);
  const qid=opt.body.quoteId;assert.ok(qid,'tạo được báo giá');
  const getQ=async(cookie:string)=>{
    const d=await call(`/projects/${pid}/options`,undefined,cookie);
    for(const o of d.body.options)for(const v of o.versions)if(v.id===qid)return v;
    return null;
  };
  let q=await getQ(booking);
  const cs=await call(`/projects/${pid}/quotes/${qid}/cost-source`,{revision:q.revision,itemId:q.items[0].id,kind:'profile',basis:'net'},booking);
  assert.equal(cs.status,200,JSON.stringify(cs.body));
  const qPm=await getQ(pm);
  const payload={client:qPm.client,campaign:qPm.campaign,items:qPm.items.map((i:any)=>({...i,sellUnitPrice:50000000})),discount:qPm.discount,agencyFee:qPm.agencyFee,taxRate:qPm.taxRate};
  const saved=await call(`/projects/${pid}/quotes/${qid}/save`,{revision:qPm.revision,payload},pm);
  assert.equal(saved.status,200,JSON.stringify(saved.body));
  await call(`/projects/${pid}/quotes/${qid}/status`,{revision:saved.body.quote.revision,status:'submitted'},pm);
  await call(`/projects/${pid}/quotes/${qid}/status`,{revision:saved.body.quote.revision+1,status:'approved'},pm);
  assert.equal((await call(`/projects/${pid}/quotes/${qid}/select`,{},pm)).status,200);
  return {...ctx,pid,pm,booking,qid,getQ};
}

test('UX-1.2 P&L dự án: totalK/totalPayableL đúng, KHÔNG có costGross; Booking bị 403',async()=>{
  const {server,call,pid,pm,booking}=await seedPnlProject();
  try{
    const r=await call(`/projects/${pid}/pnl`,undefined,pm);
    assert.equal(r.status,200,JSON.stringify(r.body));
    assert.ok(r.body.baseline,'có bản chốt');
    const pnl=r.body.baseline.pnl;
    assert.equal(pnl.totalK,10000000,'K = NET 10tr (công ty, VAT không vào K)');
    assert.equal(pnl.totalPayableL,10800000,'L = K + VAT 8% của 10tr');
    assert.ok(!('costGross' in pnl),'payload P&L KHÔNG được có trường costGross');
    const rb=await call(`/projects/${pid}/pnl`,undefined,booking);
    assert.equal(rb.status,403,'Booking gọi P&L dự án phải 403');
  }finally{server.close();}
});

test('UX-1.3 Booking xem báo giá: thấy giá đầu vào, KHÔNG thấy giá bán',async()=>{
  const {server,booking,getQ}=await seedPnlProject();
  try{
    const q=await getQ(booking);
    assert.ok(q,'Booking mở được báo giá của dự án mình thuộc');
    assert.equal(q.items.length,1);
    assert.equal(q.items[0].buyUnitPrice,10000000,'Booking thấy giá đầu vào');
    assert.equal(q.items[0].sellUnitPrice,undefined,'Booking KHÔNG được thấy giá bán');
    assert.ok(!JSON.stringify(q).includes('"sellUnitPrice":50000000'),'toàn payload Booking không chứa giá bán 50tr');
  }finally{server.close();}
});
