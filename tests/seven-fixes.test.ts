import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createWorkspace} from '../server/workspace';
import {buildPhaseQuoteItems} from '../src/domain/phaseQuote';

// Kiểm thử hành vi cho đợt sửa 7 vấn đề — chạy trên database thử trong bộ nhớ,
// không chạm dữ liệu dự án thật.
async function fixture(work:(f:any)=>Promise<void>){
  const w=createWorkspace('',{memory:true,setupCode:'test-code'});
  const app=express();app.use(express.json());app.use('/api/workspace',w.router);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${(server.address() as any).port}/api/workspace`;
  const call=async(path:string,body?:any,cookie?:string,method?:string)=>{const r=await fetch(base+path,{method:method??(body===undefined?'GET':'POST'),headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
  try{
    await call('/auth/setup',{code:'test-code',email:'admin@example.test',name:'Admin',password:'admin-password-123'});
    const admin=(await call('/auth/login',{email:'admin@example.test',password:'admin-password-123'})).cookie;
    const pid=(await call('/projects',{name:'Dự án kiểm thử',client:'Khách',campaign:'Campaign'},admin)).body.id;
    const cookies:any={admin};
    for(const role of ['pm','booking','pm2','booking2']){
      await call('/users',{email:`${role}@example.test`,name:role,password:'temporary-password-123',role:'member'},admin);
      const temporary=(await call('/auth/login',{email:`${role}@example.test`,password:'temporary-password-123'})).cookie;
      await call('/auth/password',{currentPassword:'temporary-password-123',newPassword:'changed-password-123'},temporary);
      cookies[role]=(await call('/auth/login',{email:`${role}@example.test`,password:'changed-password-123'})).cookie;
    }
    await call(`/projects/${pid}/members`,{email:'pm@example.test',role:'pm'},admin);
    await call(`/projects/${pid}/members`,{email:'booking@example.test',role:'booking'},admin);
    await work({call,pid,cookies,w});
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));w.db.close();}
}
const kolProfile=(id:string,video:number|null,extra:any={})=>({id,ten:'KOL '+id,linhVuc:['Ẩm thực'],nenTang:[{tenNenTang:'TikTok',linkProfile:'',soFollower:1000}],reviewSoBo:'',bangGia:{video},...extra});
async function getQuote(call:any,pid:string,cookie:string,quoteId:string){
  const o=(await call(`/projects/${pid}/options`,undefined,cookie)).body;
  return o.options.flatMap((x:any)=>x.versions).find((q:any)=>q.id===quoteId);
}

test('Vấn đề 6: không tạo được Admin dự án; nhiều PM/Booking cùng dự án; Admin hệ thống không cần là thành viên',()=>fixture(async({call,pid,cookies}:any)=>{
  assert.equal((await call(`/projects/${pid}/members`,{email:'pm2@example.test',role:'admin'},cookies.admin)).status,400);
  assert.equal((await call(`/projects/${pid}/members`,{email:'pm2@example.test',role:'pm'},cookies.admin)).status,200);
  assert.equal((await call(`/projects/${pid}/members`,{email:'booking2@example.test',role:'booking'},cookies.admin)).status,200);
  const members=(await call(`/projects/${pid}/members`,undefined,cookies.admin)).body.members;
  assert.equal(members.filter((m:any)=>m.roles.includes('pm')).length,2);
  assert.equal(members.filter((m:any)=>m.roles.includes('booking')).length,2);
  assert.ok(members.every((m:any)=>!m.roles.includes('admin')));
  // Admin hệ thống không nằm trong danh sách thành viên nhưng vẫn xem/quản lý được dự án.
  assert.equal((await call(`/projects/${pid}/shortlist`,undefined,cookies.admin)).status,200);
  assert.equal((await call(`/projects/${pid}/options`,undefined,cookies.admin)).status,200);
}));

test('Vấn đề 1: nháp chứa giá chưa xác nhận được, gửi duyệt/duyệt bị chặn ở server, dòng bỏ tính không chặn, giá 0 hợp lệ',()=>fixture(async({call,pid,cookies}:any)=>{
  await call(`/projects/${pid}/catalog/import`,{profiles:[kolProfile('gate-1',5_000_000),kolProfile('gate-2',null),kolProfile('gate-0',0)]},cookies.admin);
  await call(`/projects/${pid}/shortlist/add`,{ids:['gate-1','gate-2','gate-0']},cookies.booking);
  const rows=(await call(`/projects/${pid}/shortlist`,undefined,cookies.pm)).body.rows;
  const rowOf=(cid:string)=>rows.find((r:any)=>r.catalogId===cid);
  const opt=(await call(`/projects/${pid}/options`,{name:'Phương án cổng giá'},cookies.pm)).body;

  // Đưa KOL giá chưa xác nhận vào nháp: được phép, response báo số dòng chưa xác nhận.
  const addTry=await call(`/projects/${pid}/shortlist/to-option`,{quoteId:opt.quoteId,revision:1,selections:[{id:rowOf('gate-1').id,format:'video',quantity:1}]},cookies.pm);
  assert.equal(addTry.status,200);assert.equal(addTry.body.unconfirmedPrice,1);
  // Điền giá bán rồi gửi duyệt: server chặn vì giá đầu vào chưa xác nhận.
  let q=await getQuote(call,pid,cookies.pm,opt.quoteId);
  const sellPayload={items:q.items.map((i:any)=>({...i,sellUnitPrice:8_000_000})),discount:q.discount,agencyFee:q.agencyFee,taxRate:q.taxRate};
  assert.equal((await call(`/projects/${pid}/quotes/${q.id}/save`,{revision:q.revision,payload:sellPayload},cookies.pm)).status,200);
  q=await getQuote(call,pid,cookies.pm,opt.quoteId);
  const gate=await call(`/projects/${pid}/quotes/${q.id}/status`,{status:'submitted',revision:q.revision},cookies.pm);
  assert.equal(gate.status,400);assert.equal(gate.body.priceGate.unconfirmedBuy,1);assert.equal(gate.body.priceGate.missingSell,0);
  // Booking xác nhận giá → lấy lại giá vào nháp → gửi duyệt, duyệt và chốt đều qua.
  const row1=rowOf('gate-1');
  assert.equal((await call(`/projects/${pid}/shortlist/${row1.id}/prices`,{revision:row1.revision,format:'video',value:5_000_000,source:'Creator xác nhận qua email',confirm:true},cookies.booking)).status,200);
  q=await getQuote(call,pid,cookies.pm,opt.quoteId);
  const refreshed=await call(`/projects/${pid}/quotes/${q.id}/refresh-prices`,{revision:q.revision},cookies.pm);
  assert.equal(refreshed.status,200);assert.equal(refreshed.body.unconfirmedPrice,0);
  q=await getQuote(call,pid,cookies.pm,opt.quoteId);
  assert.equal((await call(`/projects/${pid}/quotes/${q.id}/status`,{status:'submitted',revision:q.revision},cookies.pm)).status,200);
  q=await getQuote(call,pid,cookies.pm,opt.quoteId);
  assert.equal((await call(`/projects/${pid}/quotes/${q.id}/status`,{status:'approved',revision:q.revision},cookies.pm)).status,200);
  assert.equal((await call(`/projects/${pid}/quotes/${q.id}/select`,{},cookies.pm)).status,200);

  // Dòng thiếu giá nhưng KHÔNG được tính (included=false) không gây chặn.
  const optB=(await call(`/projects/${pid}/options`,{name:'Phương án dòng loại trừ'},cookies.pm)).body;
  const addB=await call(`/projects/${pid}/shortlist/to-option`,{quoteId:optB.quoteId,revision:1,selections:[{id:rowOf('gate-2').id,format:'video',quantity:1}]},cookies.pm);
  assert.equal(addB.status,200);assert.equal(addB.body.missingPrice,1);
  let qB=await getQuote(call,pid,cookies.pm,optB.quoteId);
  const payloadB={items:[...qB.items.map((i:any)=>({...i,included:false})),{id:'manual-1',creator:'Chi phí sản xuất',description:'Thuê địa điểm quay',phase:'',kind:'production',quantity:1,buyUnitPrice:1_000_000,sellUnitPrice:2_000_000,included:true}],discount:qB.discount,agencyFee:qB.agencyFee,taxRate:qB.taxRate};
  assert.equal((await call(`/projects/${pid}/quotes/${qB.id}/save`,{revision:qB.revision,payload:payloadB},cookies.pm)).status,200);
  qB=await getQuote(call,pid,cookies.pm,optB.quoteId);
  assert.equal((await call(`/projects/${pid}/quotes/${qB.id}/status`,{status:'submitted',revision:qB.revision},cookies.pm)).status,200);

  // Giá 0 là giá hợp lệ: xác nhận được và không bị coi là thiếu giá.
  const row0=rowOf('gate-0');
  assert.equal((await call(`/projects/${pid}/shortlist/${row0.id}/prices`,{revision:row0.revision,format:'video',value:0,source:'Đối tác ưu đãi miễn phí',confirm:true},cookies.booking)).status,200);
  const rowsAfter=(await call(`/projects/${pid}/shortlist`,undefined,cookies.pm)).body.rows;
  const row0After=rowsAfter.find((r:any)=>r.catalogId==='gate-0');
  assert.equal(row0After.prices.video.status,'confirmed');assert.equal(row0After.prices.video.value,0);

  // Đổi giá đầu vào làm mất xác nhận trước đó (lưu giá mới không kèm xác nhận).
  const row1After=rowsAfter.find((r:any)=>r.catalogId==='gate-1');
  assert.equal((await call(`/projects/${pid}/shortlist/${row1After.id}/prices`,{revision:row1After.revision,format:'video',value:6_000_000,source:'',confirm:false},cookies.booking)).status,200);
  const rowsFinal=(await call(`/projects/${pid}/shortlist`,undefined,cookies.pm)).body.rows;
  const row1Final=rowsFinal.find((r:any)=>r.catalogId==='gate-1');
  assert.equal(row1Final.prices.video.status,'unconfirmed');assert.equal(row1Final.prices.video.value,6_000_000);assert.equal(row1Final.prices.video.checkedBy,null);
}));

test('Vấn đề 2: tổng toàn phase phân bổ đúng tổng số lượng — 10 video × 4 KOL × 10 triệu = 100 triệu',()=>{
  const price=(value:number,status:string)=>({value,status,source:'',checkedAt:null,checkedBy:null});
  const result=buildPhaseQuoteItems([{
    name:'Phase tổng',brief:{deliverableScope:'campaign',deliverables:[{format:'video',quantity:10}]},
    rows:[1,2,3,4].map(n=>({shortlistId:'s'+n,creator:'KOL '+n,prices:{video:price(10_000_000,'confirmed')}} as any)),
  }],()=> 'item-'+Math.random());
  assert.deepEqual(result.items.map(i=>i.quantity),[3,3,2,2]);
  assert.equal(result.items.reduce((a,i)=>a+i.quantity*(i.buyUnitPrice??0),0),100_000_000);
});

test('Vấn đề 7: kho server giữ đủ trường hồ sơ, revision chống ghi đè, chỉ Admin quản lý kho',()=>fixture(async({call,cookies}:any)=>{
  const full=kolProfile('does-not-matter',7_000_000,{lienHe:{tenNguoiLienHe:'Chị A',soDienThoai:'0909000111',emailZalo:'a@example.com',ghiChu:'Ưu tiên Zalo'},lichSuHopTac:[{id:'h1',tenChienDich:'Tết 2025',thoiGian:'2025-01',formatDaLam:'Video',chiPhiThucTe:5_000_000,ketQuaLink:'',nhanXet:'Tốt'}],danhGiaHieuQua:{diem:5,nhanXet:'Hiệu quả cao'},ngayTao:'2024-05-01T00:00:00.000Z',ngayCapNhat:'1999-01-01T00:00:00.000Z',nenTang:[{id:'ch-1',tenNenTang:'TikTok',linkProfile:'https://tiktok.com/@a',soFollower:12345}]});
  assert.equal((await call('/catalog',{profile:full},cookies.pm)).status,403);
  const created=await call('/catalog',{profile:full},cookies.admin);
  assert.equal(created.status,200);assert.equal(created.body.revision,1);
  const list=(await call('/catalog',undefined,cookies.admin)).body.kols;
  const saved=list.find((k:any)=>k.id===created.body.id);
  assert.equal(saved.lienHe.soDienThoai,'0909000111');
  assert.equal(saved.lichSuHopTac.length,1);assert.equal(saved.danhGiaHieuQua.diem,5);
  assert.equal(saved.nenTang[0].id,'ch-1');
  assert.notEqual(saved.ngayCapNhat,'1999-01-01T00:00:00.000Z'); // thời điểm cập nhật do server ghi
  // Ghi bằng revision cũ bị từ chối; revision đúng thì ghi được và tăng revision.
  assert.equal((await call(`/catalog/${saved.id}/update`,{revision:99,profile:{...full,ten:'Tên mới'}},cookies.admin)).status,409);
  const upd=await call(`/catalog/${saved.id}/update`,{revision:1,profile:{...full,ten:'Tên mới'}},cookies.admin);
  assert.equal(upd.status,200);assert.equal(upd.body.revision,2);
  // Ghi hàng loạt: revision sai → xung đột; hồ sơ mới với revision null → thêm mới.
  const bulk=await call('/catalog/bulk-update',{items:[{id:saved.id,revision:1,profile:full},{id:'bulk-new',revision:null,profile:kolProfile('bulk-new',1000)}]},cookies.admin);
  assert.equal(bulk.body.conflicts.length,1);assert.deepEqual(bulk.body.added,['bulk-new']);
  // Xoá cũng kiểm tra revision.
  assert.equal((await call(`/catalog/${saved.id}/remove`,{revision:1},cookies.admin)).status,409);
  assert.equal((await call(`/catalog/${saved.id}/remove`,{revision:2},cookies.admin)).status,200);
}));

test('Vấn đề 7: nhập chuyển đổi có xem trước — không ghi đè xung đột khi chưa chọn, không xoá hồ sơ chỉ có trên server',()=>fixture(async({call,cookies}:any)=>{
  const seed=await call('/catalog/bulk-update',{items:[
    {id:'mig-a',revision:null,profile:kolProfile('mig-a',100)},
    {id:'mig-b',revision:null,profile:kolProfile('mig-b',200)},
    {id:'mig-d',revision:null,profile:kolProfile('mig-d',400)},
  ]},cookies.admin);
  assert.equal(seed.body.added.length,3);
  const incoming=[kolProfile('mig-a',100,{ngayCapNhat:'2020-01-01T00:00:00.000Z'}),kolProfile('mig-b',999),kolProfile('mig-c',300)];
  const preview=(await call('/catalog/migration/preview',{profiles:incoming},cookies.admin)).body;
  assert.deepEqual(preview.unchanged.map((x:any)=>x.id),['mig-a']); // chỉ khác ngày cập nhật → coi như giống hệt
  assert.equal(preview.conflicts.length,1);assert.equal(preview.conflicts[0].id,'mig-b');
  assert.ok(preview.conflicts[0].differentFields.includes('Bảng giá'));
  assert.deepEqual(preview.newItems.map((x:any)=>x.id),['mig-c']);
  assert.deepEqual(preview.serverOnly.map((x:any)=>x.id),['mig-d']);
  // Áp dụng không chọn gì: xung đột giữ bản server, hồ sơ mới được thêm, hồ sơ riêng server còn nguyên.
  const applied=(await call('/catalog/migration/apply',{profiles:incoming,resolutions:{}},cookies.admin)).body;
  assert.equal(applied.added,1);assert.equal(applied.keptServer,1);assert.equal(applied.updated,0);
  let list=(await call('/catalog',undefined,cookies.admin)).body.kols;
  assert.equal(list.find((k:any)=>k.id==='mig-b').bangGia.video,200);
  assert.ok(list.some((k:any)=>k.id==='mig-d'));
  // Chọn rõ "dùng bản nhập" mới ghi đè.
  const applied2=(await call('/catalog/migration/apply',{profiles:incoming,resolutions:{'mig-b':'imported'}},cookies.admin)).body;
  assert.equal(applied2.updated,1);
  list=(await call('/catalog',undefined,cookies.admin)).body.kols;
  assert.equal(list.find((k:any)=>k.id==='mig-b').bangGia.video,999);
  assert.ok(list.some((k:any)=>k.id==='mig-d'));
  // Thành viên thường không được nhập chuyển đổi.
  assert.equal((await call('/catalog/migration/preview',{profiles:incoming},cookies.pm)).status,403);
}));
