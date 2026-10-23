import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createWorkspace} from '../server/workspace';
import {LatestRequestGuard} from '../src/utils/latestRequestGuard';

// Kiểm thử hành vi cho đợt sửa 4 lỗi còn tồn tại sau đợt 7 vấn đề —
// chạy trên database thử trong bộ nhớ, không chạm dữ liệu dự án thật.
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
    for(const role of ['pm','booking']){
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
const manualKol=(extra:any={})=>({id:'m1',creator:'KOL nhập tay',description:'1 video review sản phẩm',phase:'',kind:'kol',quantity:1,buyUnitPrice:5_000_000,sellUnitPrice:8_000_000,included:true,...extra});
async function saveDraft(call:any,pid:string,cookie:string,q:any,items:any[]){
  return call(`/projects/${pid}/quotes/${q.id}/save`,{revision:q.revision,payload:{items,discount:q.discount,agencyFee:q.agencyFee,taxRate:q.taxRate}},cookie);
}

test('Lỗi 1: KOL nhập tay chưa xác nhận bị chặn gửi duyệt; client giả mạo confirmed không qua được; xác nhận do server ghi mới mở cổng',()=>fixture(async({call,pid,cookies}:any)=>{
  const opt=(await call(`/projects/${pid}/options`,{name:'Phương án nhập tay'},cookies.pm)).body;
  let q=await getQuote(call,pid,cookies.pm,opt.quoteId);
  // Lưu nháp có giá mua + giá bán nhưng chưa xác nhận: lưu được.
  assert.equal((await saveDraft(call,pid,cookies.pm,q,[manualKol()])).status,200);
  q=await getQuote(call,pid,cookies.pm,opt.quoteId);
  // Gửi duyệt bị chặn ở server vì giá đầu vào chưa xác nhận.
  const blocked=await call(`/projects/${pid}/quotes/${q.id}/status`,{status:'submitted',revision:q.revision},cookies.pm);
  assert.equal(blocked.status,400);assert.equal(blocked.body.priceGate.unconfirmedBuy,1);
  // Client tự gắn buyConfirmation giả trong payload: server không tin — vẫn bị chặn.
  q=await getQuote(call,pid,cookies.pm,opt.quoteId);
  const forged=manualKol({buyConfirmation:{value:5_000_000,source:'tự khai',checkedBy:'ai-do',checkedByName:'Người lạ',checkedAt:'2020-01-01T00:00:00.000Z'}});
  assert.equal((await saveDraft(call,pid,cookies.pm,q,[forged])).status,200);
  q=await getQuote(call,pid,cookies.pm,opt.quoteId);
  assert.equal(q.items[0].buyConfirmation,undefined);
  const blocked2=await call(`/projects/${pid}/quotes/${q.id}/status`,{status:'submitted',revision:q.revision},cookies.pm);
  assert.equal(blocked2.status,400);assert.equal(blocked2.body.priceGate.unconfirmedBuy,1);
  // Xác nhận thiếu nguồn → 400. Xác nhận hợp lệ → server ghi nguồn + người + thời điểm.
  q=await getQuote(call,pid,cookies.pm,opt.quoteId);
  assert.equal((await call(`/projects/${pid}/quotes/${q.id}/confirm-buy`,{itemId:'m1',source:'',revision:q.revision},cookies.pm)).status,400);
  const confirmed=await call(`/projects/${pid}/quotes/${q.id}/confirm-buy`,{itemId:'m1',source:'Báo giá KOL gửi ngày 20/10',revision:q.revision},cookies.pm);
  assert.equal(confirmed.status,200);
  const conf=confirmed.body.quote.items[0].buyConfirmation;
  assert.equal(conf.value,5_000_000);assert.equal(conf.source,'Báo giá KOL gửi ngày 20/10');
  assert.equal(conf.checkedByName,'pm');assert.ok(Math.abs(Date.now()-new Date(conf.checkedAt).getTime())<60_000);
  // Sau xác nhận: gửi duyệt và duyệt đều qua.
  q=await getQuote(call,pid,cookies.pm,opt.quoteId);
  assert.equal((await call(`/projects/${pid}/quotes/${q.id}/status`,{status:'submitted',revision:q.revision},cookies.pm)).status,200);
  q=await getQuote(call,pid,cookies.pm,opt.quoteId);
  assert.equal((await call(`/projects/${pid}/quotes/${q.id}/status`,{status:'approved',revision:q.revision},cookies.pm)).status,200);
  // Xác nhận trên phiên bản đã duyệt → 409 (phải tạo phiên bản mới).
  q=await getQuote(call,pid,cookies.pm,opt.quoteId);
  assert.equal((await call(`/projects/${pid}/quotes/${q.id}/confirm-buy`,{itemId:'m1',source:'Nguồn khác',revision:q.revision},cookies.pm)).status,409);
}));

test('Lỗi 1: đổi giá đầu vào làm mất xác nhận; giá 0 xác nhận được; dòng bỏ tính và chi phí trực tiếp không bị chặn',()=>fixture(async({call,pid,cookies}:any)=>{
  const opt=(await call(`/projects/${pid}/options`,{name:'Phương án đổi giá'},cookies.pm)).body;
  let q=await getQuote(call,pid,cookies.pm,opt.quoteId);
  assert.equal((await saveDraft(call,pid,cookies.pm,q,[manualKol()])).status,200);
  q=await getQuote(call,pid,cookies.pm,opt.quoteId);
  assert.equal((await call(`/projects/${pid}/quotes/${q.id}/confirm-buy`,{itemId:'m1',source:'Báo giá gốc',revision:q.revision},cookies.pm)).status,200);
  // Đổi giá đầu vào 5tr → 6tr rồi lưu: xác nhận cũ bị bỏ, gửi duyệt lại bị chặn.
  q=await getQuote(call,pid,cookies.pm,opt.quoteId);
  assert.equal((await saveDraft(call,pid,cookies.pm,q,[manualKol({buyUnitPrice:6_000_000})])).status,200);
  q=await getQuote(call,pid,cookies.pm,opt.quoteId);
  assert.equal(q.items[0].buyConfirmation,undefined);
  const blocked=await call(`/projects/${pid}/quotes/${q.id}/status`,{status:'submitted',revision:q.revision},cookies.pm);
  assert.equal(blocked.status,400);assert.equal(blocked.body.priceGate.unconfirmedBuy,1);
  // Booking cũng xác nhận được giá đầu vào của dòng nhập tay (đúng vai trò giá đầu vào).
  q=await getQuote(call,pid,cookies.pm,opt.quoteId);
  assert.equal((await call(`/projects/${pid}/quotes/${q.id}/confirm-buy`,{itemId:'m1',source:'Booking kiểm tra lại',revision:q.revision},cookies.booking)).status,200);
  // Booking xem báo giá: thấy trạng thái xác nhận nhưng KHÔNG thấy giá bán.
  const bookingView=await getQuote(call,pid,cookies.booking,opt.quoteId);
  assert.equal(bookingView.items[0].buyConfirmation.source,'Booking kiểm tra lại');
  assert.ok(!('sellUnitPrice' in bookingView.items[0]));
  // Giá 0 hợp lệ và xác nhận được.
  const opt0=(await call(`/projects/${pid}/options`,{name:'Phương án giá 0'},cookies.pm)).body;
  let q0=await getQuote(call,pid,cookies.pm,opt0.quoteId);
  assert.equal((await saveDraft(call,pid,cookies.pm,q0,[manualKol({buyUnitPrice:0,sellUnitPrice:0})])).status,200);
  q0=await getQuote(call,pid,cookies.pm,opt0.quoteId);
  assert.equal((await call(`/projects/${pid}/quotes/${q0.id}/confirm-buy`,{itemId:'m1',source:'KOL hỗ trợ miễn phí',revision:q0.revision},cookies.pm)).status,200);
  q0=await getQuote(call,pid,cookies.pm,opt0.quoteId);
  assert.equal((await call(`/projects/${pid}/quotes/${q0.id}/status`,{status:'submitted',revision:q0.revision},cookies.pm)).status,200);
  // Dòng KOL chưa xác nhận nhưng bỏ tính + dòng sản xuất không cần xác nhận → gửi duyệt qua.
  const opt2=(await call(`/projects/${pid}/options`,{name:'Phương án hỗn hợp'},cookies.pm)).body;
  let q2=await getQuote(call,pid,cookies.pm,opt2.quoteId);
  const items=[manualKol({included:false}),{id:'p1',creator:'Chi phí sản xuất',description:'Thuê địa điểm quay',phase:'',kind:'production',quantity:1,buyUnitPrice:1_000_000,sellUnitPrice:2_000_000,included:true}];
  assert.equal((await saveDraft(call,pid,cookies.pm,q2,items)).status,200);
  q2=await getQuote(call,pid,cookies.pm,opt2.quoteId);
  assert.equal((await call(`/projects/${pid}/quotes/${q2.id}/status`,{status:'submitted',revision:q2.revision},cookies.pm)).status,200);
}));

test('Lỗi 2: nhập chuyển đổi phát hiện hồ sơ bị sửa/xoá/tạo trùng sau khi xem trước và không ghi đè',()=>fixture(async({call,cookies}:any)=>{
  const seed=await call('/catalog/bulk-update',{items:[
    {id:'cc-a',revision:null,profile:kolProfile('cc-a',100)},
    {id:'cc-b',revision:null,profile:kolProfile('cc-b',200)},
    {id:'cc-d',revision:null,profile:kolProfile('cc-d',400)},
  ]},cookies.admin);
  assert.equal(seed.body.added.length,3);
  const incoming=[kolProfile('cc-a',999),kolProfile('cc-b',888),kolProfile('cc-d',777),kolProfile('cc-new',300)];
  const preview=(await call('/catalog/migration/preview',{profiles:incoming},cookies.admin)).body;
  assert.equal(preview.conflicts.find((x:any)=>x.id==='cc-a').revision,1);
  const expected=Object.fromEntries([...preview.newItems.map((x:any)=>[x.id,null]),...preview.unchanged.map((x:any)=>[x.id,x.revision]),...preview.conflicts.map((x:any)=>[x.id,x.revision])]);
  // Sau xem trước: cc-a bị người khác cập nhật (revision 1 → 2), cc-d bị xoá.
  assert.equal((await call('/catalog/cc-a/update',{revision:1,profile:kolProfile('cc-a',555,{ten:'Tên server mới'})},cookies.admin)).status,200);
  assert.equal((await call('/catalog/cc-d/remove',{revision:1},cookies.admin)).status,200);
  const applied=(await call('/catalog/migration/apply',{profiles:incoming,resolutions:{'cc-a':'imported','cc-b':'imported','cc-d':'imported'},expectedRevisions:expected},cookies.admin)).body;
  assert.equal(applied.updated,1); // chỉ cc-b được ghi đè vì vẫn đúng phiên bản đã xem
  assert.equal(applied.added,1);   // cc-new vẫn thêm mới bình thường
  const staleIds=applied.stale.map((s:any)=>s.id).sort();
  assert.deepEqual(staleIds,['cc-a','cc-d']);
  let list=(await call('/catalog',undefined,cookies.admin)).body.kols;
  assert.equal(list.find((k:any)=>k.id==='cc-a').bangGia.video,555); // bản mới trên server được giữ nguyên
  assert.equal(list.find((k:any)=>k.id==='cc-b').bangGia.video,888);
  assert.ok(!list.some((k:any)=>k.id==='cc-d')); // hồ sơ đã xoá không bị tạo lại âm thầm
  // Tạo trùng ID sau xem trước: xem trước nói cc-e là mới, sau đó cc-e được tạo trên server.
  const preview2=(await call('/catalog/migration/preview',{profiles:[kolProfile('cc-e',222)]},cookies.admin)).body;
  assert.deepEqual(preview2.newItems.map((x:any)=>x.id),['cc-e']);
  await call('/catalog/bulk-update',{items:[{id:'cc-e',revision:null,profile:kolProfile('cc-e',111)}]},cookies.admin);
  const applied2=(await call('/catalog/migration/apply',{profiles:[kolProfile('cc-e',222)],resolutions:{},expectedRevisions:{'cc-e':null}},cookies.admin)).body;
  assert.equal(applied2.added,0);assert.equal(applied2.stale.length,1);
  list=(await call('/catalog',undefined,cookies.admin)).body.kols;
  assert.equal(list.find((k:any)=>k.id==='cc-e').bangGia.video,111);
  // Không gửi kèm revision đã xem trước → không áp dụng, yêu cầu xem lại.
  const applied3=(await call('/catalog/migration/apply',{profiles:[kolProfile('cc-f',123)],resolutions:{},expectedRevisions:{}},cookies.admin)).body;
  assert.equal(applied3.added,0);assert.equal(applied3.stale.length,1);
  list=(await call('/catalog',undefined,cookies.admin)).body.kols;
  assert.ok(!list.some((k:any)=>k.id==='cc-f'));
}));

test('Lỗi 4: ngày cập nhật do server ghi ở mọi đường ghi; hồ sơ không đổi không bị đổi ngày; dữ liệu cũ lệch ngày được ưu tiên ngày server',()=>fixture(async({call,pid,cookies,w}:any)=>{
  const OLD='1999-01-01T00:00:00.000Z';
  // Tạo mới qua API quản lý kho.
  const created=(await call('/catalog',{profile:kolProfile('date-x',100,{ngayCapNhat:OLD,ngayTao:'2018-05-05T00:00:00.000Z'})},cookies.admin)).body;
  let list=(await call('/catalog',undefined,cookies.admin)).body.kols;
  const dx=list.find((k:any)=>k.id===created.id);
  assert.notEqual(dx.ngayCapNhat,OLD);assert.equal(dx.ngayCapNhat,dx.updatedAt);assert.equal(dx.ngayTao,'2018-05-05T00:00:00.000Z');
  // Ghi hàng loạt: cả thêm mới lẫn cập nhật đều đóng dấu server, không lấy ngày client.
  await call('/catalog/bulk-update',{items:[{id:'date-1',revision:null,profile:kolProfile('date-1',100,{ngayCapNhat:OLD})}]},cookies.admin);
  await call('/catalog/bulk-update',{items:[{id:'date-1',revision:1,profile:kolProfile('date-1',101,{ngayCapNhat:'1998-06-06T00:00:00.000Z'})}]},cookies.admin);
  list=(await call('/catalog',undefined,cookies.admin)).body.kols;
  const d1=list.find((k:any)=>k.id==='date-1');
  assert.equal(d1.revision,2);assert.notEqual(d1.ngayCapNhat,'1998-06-06T00:00:00.000Z');assert.equal(d1.ngayCapNhat,d1.updatedAt);
  // Nhập chuyển đổi: ngày nguồn được giữ riêng ở ngayCapNhatNguon, ngày chính thức là ngày server.
  const srcDate='2001-02-03T00:00:00.000Z';
  const incoming=[kolProfile('date-2',300,{ngayCapNhat:srcDate,ngayTao:'2017-01-01T00:00:00.000Z'})];
  const appliedMig=(await call('/catalog/migration/apply',{profiles:incoming,resolutions:{},expectedRevisions:{'date-2':null}},cookies.admin)).body;
  assert.equal(appliedMig.added,1);
  list=(await call('/catalog',undefined,cookies.admin)).body.kols;
  const d2=list.find((k:any)=>k.id==='date-2');
  assert.equal(d2.ngayCapNhatNguon,srcDate);assert.notEqual(d2.ngayCapNhat,srcDate);assert.equal(d2.ngayCapNhat,d2.updatedAt);assert.equal(d2.ngayTao,'2017-01-01T00:00:00.000Z');
  // Nhập lại hồ sơ giống hệt (chỉ khác ngày): bỏ qua — revision và ngày cập nhật không đổi.
  const before={rev:d2.revision,date:d2.ngayCapNhat};
  const again={...d2,ngayCapNhat:'2005-05-05T00:00:00.000Z'};delete (again as any).revision;delete (again as any).updatedAt;
  const reApplied=(await call('/catalog/migration/apply',{profiles:[again],resolutions:{},expectedRevisions:{'date-2':before.rev}},cookies.admin)).body;
  assert.equal(reApplied.unchanged,1);assert.equal(reApplied.updated,0);
  list=(await call('/catalog',undefined,cookies.admin)).body.kols;
  const d2b=list.find((k:any)=>k.id==='date-2');
  assert.equal(d2b.revision,before.rev);assert.equal(d2b.ngayCapNhat,before.date);
  // Đường đồng bộ cũ theo dự án: thêm mới đóng dấu server; nhập lại y hệt (khác ngày) là unchanged, không tăng revision.
  const imp1=(await call(`/projects/${pid}/catalog/import`,{profiles:[kolProfile('date-3',100,{ngayCapNhat:OLD})]},cookies.admin)).body;
  assert.equal(imp1.added,1);
  const imp2=(await call(`/projects/${pid}/catalog/import`,{profiles:[kolProfile('date-3',100,{ngayCapNhat:'2005-05-05T00:00:00.000Z'})]},cookies.admin)).body;
  assert.equal(imp2.unchanged,1);assert.equal(imp2.updated,0);
  list=(await call('/catalog',undefined,cookies.admin)).body.kols;
  const d3=list.find((k:any)=>k.id==='date-3');
  assert.equal(d3.revision,1);assert.notEqual(d3.ngayCapNhat,OLD);assert.equal(d3.ngayCapNhat,d3.updatedAt);
  // Dữ liệu cũ có ngày trong hồ sơ lệch với thời điểm server: API trả ngày server.
  const row=w.db.prepare('SELECT profile_json,updated_at FROM kol_catalog WHERE id=?').get('date-3') as any;
  const legacyProfile={...JSON.parse(row.profile_json),ngayCapNhat:'1990-01-01T00:00:00.000Z'};
  w.db.prepare('UPDATE kol_catalog SET profile_json=? WHERE id=?').run(JSON.stringify(legacyProfile),'date-3');
  list=(await call('/catalog',undefined,cookies.admin)).body.kols;
  assert.equal(list.find((k:any)=>k.id==='date-3').ngayCapNhat,row.updated_at);
}));

test('Lỗi 3: bộ bảo vệ yêu cầu — phản hồi cũ, trả sai thứ tự, A → B → A, vô hiệu hoá và đóng component đều không áp dụng được',()=>{
  // Hai yêu cầu liên tiếp: chỉ yêu cầu mới nhất hiện hành, kể cả khi phản hồi cũ về sau.
  const g=new LatestRequestGuard();
  const t1=g.begin('proj::phase-a');
  const t2=g.begin('proj::phase-b');
  assert.equal(g.isCurrent(t1),false);
  assert.equal(g.isCurrent(t2),true);
  // Đổi ngữ cảnh mà chưa có yêu cầu mới: mọi token cũ đều hết hiệu lực.
  g.invalidate();
  assert.equal(g.isCurrent(t2),false);
  // A → B → A: token của lần A đầu tiên vẫn bị loại dù scope trùng với lần A sau.
  const g2=new LatestRequestGuard();
  const a1=g2.begin('proj::phase-a');
  g2.invalidate();
  const b1=g2.begin('proj::phase-b');
  g2.invalidate();
  const a2=g2.begin('proj::phase-a');
  assert.equal(g2.scopeOf(a2),'proj::phase-a');
  assert.equal(g2.isCurrent(a1),false);
  assert.equal(g2.isCurrent(b1),false);
  assert.equal(g2.isCurrent(a2),true);
  // Component đóng: không token nào còn hiệu lực.
  g2.dispose();
  assert.equal(g2.isCurrent(a2),false);
});
