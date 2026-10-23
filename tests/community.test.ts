import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createWorkspace} from '../server/workspace';
import {briefKpiOf,pillarPostCounts} from '../src/domain/community';
import {calculateProjectFinance} from '../src/domain/projectFinance';
import {detectCommunityColumns,parseVietnameseCount,rowsToCommunityProfiles,DEFAULT_PRICE_CONDITIONS,DEFAULT_PRICE_SERVICE_NAME} from '../src/utils/communityImport';

// Kiểm thử hành vi Community — chạy trên database thử trong bộ nhớ,
// KHÔNG chạm dữ liệu dự án thật và không nhập dữ liệu thật vào kho.
async function fixture(work:(f:any)=>Promise<void>){
  const w=createWorkspace('',{memory:true,setupCode:'test-code'});
  const app=express();app.use(express.json());app.use('/api/workspace',w.router);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${(server.address() as any).port}/api/workspace`;
  const call=async(path:string,body?:any,cookie?:string,method?:string)=>{const r=await fetch(base+path,{method:method??(body===undefined?'GET':'POST'),headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
  try{
    await call('/auth/setup',{code:'test-code',email:'admin@example.test',name:'Admin',password:'admin-password-123'});
    const admin=(await call('/auth/login',{email:'admin@example.test',password:'admin-password-123'})).cookie;
    const pid=(await call('/projects',{name:'Dự án Community',client:'Khách A',campaign:'Campaign A'},admin)).body.id;
    const cookies:any={admin};
    for(const role of ['pm','booking']){
      await call('/users',{email:`${role}@example.test`,name:role,password:'temporary-password-123',role:'member'},admin);
      const temporary=(await call('/auth/login',{email:`${role}@example.test`,password:'temporary-password-123'})).cookie;
      await call('/auth/password',{currentPassword:'temporary-password-123',newPassword:'changed-password-123'},temporary);
      cookies[role]=(await call('/auth/login',{email:`${role}@example.test`,password:'changed-password-123'})).cookie;
      await call(`/projects/${pid}/members`,{email:`${role}@example.test`,role},admin);
    }
    await work({call,pid,cookies,w});
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));w.db.close();}
}

const SVC_POST={id:'svc_post',ten:'Đăng bài ảnh (nội dung khách hàng cung cấp)',moTa:'',donVi:'bài',giaThamKhao:7_500_000,dieuKien:'Nội dung do khách hàng cung cấp; chưa gồm sản xuất nội dung, comment, like/share và KPI buzz.',nguon:'Sheet tham chiếu',ngayCapNhat:''};
const commProfile=(id:string,extra:any={})=>({id,ten:'Page '+id,loai:'page',nenTang:'Facebook',link:'https://facebook.com/'+id,linhVuc:['Giải trí'],quyMo:1_300_000,loaiChiSo:'followers',lienHe:{tenNguoiLienHe:'',soDienThoai:'',emailZalo:'',ghiChu:''},dichVu:[{...SVC_POST}],...extra});
const kolProfile=(id:string,extra:any={})=>({id,ten:'KOL '+id,linhVuc:['Giải trí'],nenTang:[{tenNenTang:'Facebook',linkProfile:'',soFollower:1000}],reviewSoBo:'',bangGia:{post:2_600_000,video:10_000_000},...extra});
const briefBase:any={text:'Brief seeding La Vie',category:'',keyword:'',platform:'Facebook',minFollowers:0,targetCount:null,budget:null,deliverableScope:'campaign',deliverables:[],partnerType:null,kpiTopics:null,kpiComments:null,kpiBuzz:null,pillars:[],services:[]};

async function firstPhase(call:any,pid:string,cookie:string){
  let phases=(await call(`/projects/${pid}/phases`,undefined,cookie)).body.phases;
  if(!phases.length){
    // Dự án tạo sau khi server khởi động chưa có phase (phase mặc định chỉ được tạo
    // bởi migration lúc khởi động cho dự án đã tồn tại) — tạo một phase để làm việc.
    await call(`/projects/${pid}/phases`,{name:'Phase Seeding',kind:'other'},cookie);
    phases=(await call(`/projects/${pid}/phases`,undefined,cookie)).body.phases;
  }
  assert.ok(phases.length>=1,'phải có ít nhất một phase để làm việc');
  return phases[0];
}
async function getQuote(call:any,pid:string,cookie:string,quoteId:string){
  const o=(await call(`/projects/${pid}/options`,undefined,cookie)).body;
  return o.options.flatMap((x:any)=>x.versions).find((q:any)=>q.id===quoteId);
}

test('Kho Community: chỉ Admin quản lý, revision chống ghi đè, ngày do server ghi, followers/members không tự đổi',()=>fixture(async({call,cookies}:any)=>{
  assert.equal((await call('/communities',{profile:commProfile('c1')},cookies.pm)).status,403);
  const created=await call('/communities',{profile:commProfile('c1',{linkInsight:'Null'})},cookies.admin);
  assert.equal(created.status,200);assert.equal(created.body.revision,1);
  await call('/communities',{profile:commProfile('g1',{loai:'group',loaiChiSo:'members',quyMo:500_000,link:'https://facebook.com/groups/g1'})},cookies.admin);
  // Booking tra cứu được kho nhưng không sửa được.
  const list=(await call('/communities',undefined,cookies.booking)).body.communities;
  assert.equal(list.length,2);
  const c1=list.find((c:any)=>c.id==='c1');
  assert.equal(c1.loaiChiSo,'followers');assert.equal(c1.quyMo,1_300_000);
  assert.equal('linkInsight' in c1,false); // "Null" không phải link insight hợp lệ
  assert.ok(typeof c1.ngayCapNhat==='string'&&c1.ngayCapNhat.length>0); // server ghi ngày cập nhật
  const g1=list.find((c:any)=>c.id==='g1');
  assert.equal(g1.loai,'group');assert.equal(g1.loaiChiSo,'members');assert.equal(g1.quyMo,500_000);
  // Revision cũ bị chặn; revision đúng ghi được và tăng revision.
  assert.equal((await call('/communities/c1/update',{profile:commProfile('c1',{ten:'Tên mới'}),revision:99},cookies.admin)).status,409);
  const upd=await call('/communities/c1/update',{profile:commProfile('c1',{ten:'Tên mới'}),revision:1},cookies.admin);
  assert.equal(upd.status,200);assert.equal(upd.body.revision,2);
  assert.equal((await call('/communities/c1/remove',{revision:1},cookies.admin)).status,409);
  assert.equal((await call('/communities/c1/remove',{revision:2},cookies.admin)).status,200);
}));

test('Import Community (hàm thuần): bỏ dòng tiêu đề nhóm/liên hệ/trống, số kiểu Việt, insight Null bị loại, giá thành dịch vụ riêng',()=>{
  const header=['NO.','FANPAGE/GROUP','LINK','FOLLOWERS','LOẠI','CHỦ ĐỀ','INSIGHT','BÀI ĐĂNG ẢNH/VIDEO (Do Khách hàng cung cấp)'];
  const mapping=detectCommunityColumns(header) as any;
  assert.deepEqual([mapping.ten,mapping.link,mapping.quyMo,mapping.loai,mapping.chuDe,mapping.insight,mapping.gia],[1,2,3,4,5,6,7]);
  assert.equal(parseVietnameseCount('1.300.000'),1_300_000);
  assert.equal(parseVietnameseCount('1,300,000'),1_300_000);
  assert.equal(parseVietnameseCount('500K'),500_000);
  const rows:any[][]=[
    ['BÁO GIÁ BOOKING FANPAGE/GROUP TRUYỀN THÔNG'],
    header,
    ['MASS AUDIENCE'],
    ['1','Page Giải Trí','https://facebook.com/giaitri','1.300.000','Fanpage','Giải trí','Null','7.500.000'],
    ['2','Group Phim Hay','https://facebook.com/groups/phimhay','500.000','Group','Phim','https://drive.google.com/insight-phim','5.000.000'],
    ['','Liên hệ booking: 0909 000 111','','','','','',''],
    [],
  ];
  const {profiles,skipped}=rowsToCommunityProfiles(rows,mapping,{metricMode:'theo_loai',priceServiceName:DEFAULT_PRICE_SERVICE_NAME,priceConditions:DEFAULT_PRICE_CONDITIONS,sourceName:'Sheet tham chiếu',dataStartIndex:2});
  assert.equal(profiles.length,2);
  assert.ok(skipped.length>=3); // tiêu đề nhóm + liên hệ + dòng trống
  const [p1,p2]=profiles;
  assert.equal(p1.quyMo,1_300_000);assert.equal(p1.loaiChiSo,'followers');assert.equal(p1.loai,'page');
  assert.equal(p1.linkInsight,undefined);
  assert.equal(p1.dichVu.length,1);assert.equal(p1.dichVu[0].giaThamKhao,7_500_000);assert.equal(p1.dichVu[0].donVi,'bài');
  assert.ok(p1.dichVu[0].dieuKien.includes('chưa gồm sản xuất nội dung'));
  assert.equal(p2.loai,'group');assert.equal(p2.loaiChiSo,'members');assert.equal(p2.quyMo,500_000); // số giữ nguyên, không đổi đơn vị chỉ số
  assert.equal(p2.linkInsight,'https://drive.google.com/insight-phim');
  assert.notEqual(p1.id,p2.id);assert.ok(p1.id.startsWith('comm_')); // định danh từ link chuẩn hoá, không theo tên
});

test('Import API: xem trước phân loại mới/xung đột, khớp theo link, áp dụng kiểm tra đúng revision đã xem trước',()=>fixture(async({call,cookies}:any)=>{
  const incoming=commProfile('imp-1');
  const preview=await call('/communities/import/preview',{profiles:[incoming]},cookies.admin);
  assert.equal(preview.status,200);assert.equal(preview.body.newItems.length,1);assert.equal(preview.body.newItems[0].revision,null);
  const applied=await call('/communities/import/apply',{profiles:preview.body.resolvedProfiles,resolutions:{},expectedRevisions:{'imp-1':null}},cookies.admin);
  assert.equal(applied.status,200);assert.equal(applied.body.added,1);
  // Server thay đổi sau xem trước -> áp dụng bản xem trước cũ bị ghi nhận stale, không ghi đè.
  const changed=commProfile('imp-1',{ten:'Bản nhập khác'});
  const preview2=await call('/communities/import/preview',{profiles:[changed]},cookies.admin);
  assert.equal(preview2.body.conflicts.length,1);assert.equal(preview2.body.conflicts[0].revision,1);
  await call('/communities/imp-1/update',{profile:commProfile('imp-1',{ten:'Bản server mới hơn'}),revision:1},cookies.admin);
  const staleApply=await call('/communities/import/apply',{profiles:preview2.body.resolvedProfiles,resolutions:{'imp-1':'imported'},expectedRevisions:{'imp-1':1}},cookies.admin);
  assert.equal(staleApply.status,200);assert.equal(staleApply.body.stale.length,1);assert.equal(staleApply.body.stale[0].id,'imp-1');
  const after=(await call('/communities',undefined,cookies.admin)).body.communities.find((c:any)=>c.id==='imp-1');
  assert.equal(after.ten,'Bản server mới hơn');assert.equal(after.revision,2);
  // Khớp theo link nền tảng đã chuẩn hoá: ID khác nhưng link trùng -> gắn vào hồ sơ server hiện có.
  const byLink=commProfile('id-khac-hoan-toan',{link:'https://facebook.com/imp-1/',ten:'Tên theo link'});
  const preview3=await call('/communities/import/preview',{profiles:[byLink]},cookies.admin);
  assert.equal(preview3.body.newItems.length,0);
  assert.equal(preview3.body.resolvedProfiles[0].id,'imp-1');
  assert.equal(preview3.body.conflicts[0].matchedBy,'link');
}));

test('Brief mở rộng: loại đối tác/KPI/pillar/dịch vụ lưu được; tổng pillar > 100% bị chặn; pillar chia đúng tổng bài',()=>fixture(async({call,pid,cookies}:any)=>{
  const ph=await firstPhase(call,pid,cookies.pm);
  const brief={...briefBase,partnerType:'community',kpiTopics:100,kpiComments:8_000,kpiBuzz:24_000,
    pillars:[{name:'Lifestyle',percent:40},{name:'Product review',percent:60}],
    services:[{name:'Đăng bài ảnh',unit:'bài',quantity:100,scope:'phase'}]};
  const r=await call(`/projects/${pid}/phases/${ph.id}`,{revision:ph.revision,brief},cookies.pm,'PATCH');
  assert.equal(r.status,200);
  const after=(await call(`/projects/${pid}/phases`,undefined,cookies.pm)).body.phases[0];
  assert.equal(after.brief.partnerType,'community');
  assert.equal(after.brief.kpiTopics,100);assert.equal(after.brief.kpiComments,8_000);assert.equal(after.brief.kpiBuzz,24_000);
  assert.deepEqual(after.brief.services,[{name:'Đăng bài ảnh',unit:'bài',quantity:100,scope:'phase'}]);
  // KPI giữ tách bạch: buzz là mục tiêu riêng, comments không bị cộng lặp vào buzz.
  const kpi=briefKpiOf(after.brief);
  assert.deepEqual(kpi,{topics:100,comments:8_000,buzz:24_000});
  // 100 bài với pillar 40/60 -> đúng 40/60 bài toàn phase.
  assert.deepEqual(pillarPostCounts(100,after.brief.pillars).map((p:any)=>p.posts),[40,60]);
  const bad=await call(`/projects/${pid}/phases/${ph.id}`,{revision:after.revision,brief:{...brief,pillars:[{name:'A',percent:70},{name:'B',percent:50}]}},cookies.pm,'PATCH');
  assert.equal(bad.status,400);
}));

test('Danh sách sơ bộ: Community lấy từ kho Community; không tự phát sinh chi phí 260 triệu từ 100 bài x giá Post Creator',()=>fixture(async({call,pid,cookies}:any)=>{
  await call('/communities',{profile:commProfile('c1')},cookies.admin);
  const kolId=(await call('/catalog',{profile:kolProfile('k1')},cookies.admin)).body.id; // server tự cấp ID cho KOL mới
  const ph=await firstPhase(call,pid,cookies.pm);
  await call(`/projects/${pid}/phases/${ph.id}`,{revision:ph.revision,brief:{...briefBase,kpiTopics:100,deliverables:[{format:'post',quantity:100}]}},cookies.pm,'PATCH');
  const addComm=await call(`/projects/${pid}/shortlist/add`,{ids:['c1'],partnerType:'community'},cookies.pm);
  assert.equal(addComm.status,200);assert.equal(addComm.body.added,1);
  const addKol=await call(`/projects/${pid}/shortlist/add`,{ids:[kolId]},cookies.pm);
  assert.equal(addKol.body.added,1);
  const sl=await call(`/projects/${pid}/shortlist`,undefined,cookies.pm);
  assert.equal(sl.body.communityCount,1);
  assert.ok(sl.body.communityMatches.some((c:any)=>c.id==='c1'));
  const commRow=sl.body.rows.find((r:any)=>r.partnerType==='community');
  assert.ok(commRow);assert.equal(commRow.prices.svc_post.value,7_500_000);assert.equal(commRow.prices.svc_post.status,'unconfirmed');
  // Danh sách sơ bộ chỉ là ứng viên: phản hồi không chứa bất kỳ tổng chi phí tự tính nào
  // (bẫy cũ: 100 bài x 2.600.000 giá Post Creator = 260.000.000).
  assert.equal(JSON.stringify(sl.body).includes('260000000'),false);
  assert.equal(JSON.stringify(sl.body).includes('totalCost'),false);
}));

test('Tạo phương án từ phase: không phân bổ thì bị chặn; PM phân bổ 40+60 đối chiếu đúng mục tiêu 100; giá lấy đúng dịch vụ Community',()=>fixture(async({call,pid,cookies}:any)=>{
  await call('/communities',{profile:commProfile('c1')},cookies.admin);
  await call('/communities',{profile:commProfile('c2')},cookies.admin);
  const ph=await firstPhase(call,pid,cookies.pm);
  await call(`/projects/${pid}/phases/${ph.id}`,{revision:ph.revision,brief:{...briefBase,kpiTopics:100,services:[{name:'Đăng bài ảnh',unit:'bài',quantity:100,scope:'phase'}]}},cookies.pm,'PATCH');
  await call(`/projects/${pid}/shortlist/add`,{ids:['c1','c2'],partnerType:'community'},cookies.pm);
  const rows=(await call(`/projects/${pid}/shortlist`,undefined,cookies.pm)).body.rows;
  const r1=rows.find((r:any)=>r.catalogId==='c1'),r2=rows.find((r:any)=>r.catalogId==='c2');
  // Không phân bổ -> server từ chối, không âm thầm đưa toàn bộ ứng viên vào.
  assert.equal((await call(`/projects/${pid}/options/from-phases`,{name:'PA trống',allocations:[]},cookies.pm)).status,400);
  // Gợi ý phân bổ chỉ là bản nháp: không tạo phương án nào.
  const before=(await call(`/projects/${pid}/options`,undefined,cookies.pm)).body.options.length;
  const suggest=await call(`/projects/${pid}/options/suggest-allocations`,{phaseIds:[ph.id]},cookies.pm);
  assert.equal(suggest.status,200);
  assert.equal(suggest.body.allocations.reduce((a:number,x:any)=>a+x.quantity,0),100);
  assert.equal((await call(`/projects/${pid}/options`,undefined,cookies.pm)).body.options.length,before);
  // PM phân bổ 40 + 60.
  const made=await call(`/projects/${pid}/options/from-phases`,{name:'Phương án A',allocations:[
    {shortlistId:r1.id,key:'svc_post',quantity:40},
    {shortlistId:r2.id,key:'svc_post',quantity:60},
  ]},cookies.pm);
  assert.equal(made.status,200);assert.equal(made.body.itemCount,2);
  const svcRecon=made.body.reconciliation.find((x:any)=>x.label.includes('Đăng bài ảnh'));
  assert.deepEqual([svcRecon.target,svcRecon.allocated,svcRecon.difference],[100,100,0]);
  const topicsRecon=made.body.reconciliation.find((x:any)=>x.label.includes('topics'));
  assert.deepEqual([topicsRecon.target,topicsRecon.allocated],[100,100]);
  const q=await getQuote(call,pid,cookies.pm,made.body.quoteId);
  assert.ok(q.items.every((i:any)=>i.kind==='community'&&i.buyUnitPrice===7_500_000&&i.unit==='bài'&&i.serviceName===SVC_POST.ten));
  assert.equal(q.items.reduce((a:number,i:any)=>a+i.quantity,0),100);
  // Phân bổ vượt mục tiêu được đối chiếu rõ (+20), không tự cắt về mục tiêu.
  const over=await call(`/projects/${pid}/options/from-phases`,{name:'Phương án vượt',allocations:[
    {shortlistId:r1.id,key:'svc_post',quantity:70},
    {shortlistId:r2.id,key:'svc_post',quantity:50},
  ]},cookies.pm);
  assert.equal(over.body.reconciliation.find((x:any)=>x.label.includes('Đăng bài ảnh')).difference,20);
}));

test('Cổng giá Community: chưa xác nhận bị chặn gửi duyệt; xác nhận ở danh sách -> lấy lại giá -> gửi duyệt/duyệt được; bản khách không lộ giá mua',()=>fixture(async({call,pid,cookies}:any)=>{
  await call('/communities',{profile:commProfile('c1')},cookies.admin);
  await call(`/projects/${pid}/shortlist/add`,{ids:['c1'],partnerType:'community'},cookies.pm);
  const row=(await call(`/projects/${pid}/shortlist`,undefined,cookies.pm)).body.rows[0];
  const opt=(await call(`/projects/${pid}/options`,{name:'PA cổng giá'},cookies.pm)).body;
  const toOpt=await call(`/projects/${pid}/shortlist/to-option`,{quoteId:opt.quoteId,revision:1,selections:[{id:row.id,format:'svc_post',quantity:10}]},cookies.pm);
  assert.equal(toOpt.status,200);
  let q=await getQuote(call,pid,cookies.pm,opt.quoteId);
  const payload={items:q.items.map((i:any)=>({...i,sellUnitPrice:9_000_000})),discount:q.discount,agencyFee:q.agencyFee,taxRate:q.taxRate};
  const saved=await call(`/projects/${pid}/quotes/${opt.quoteId}/save`,{revision:q.revision,payload},cookies.pm);
  assert.equal(saved.status,200);
  q=await getQuote(call,pid,cookies.pm,opt.quoteId);
  const blocked=await call(`/projects/${pid}/quotes/${opt.quoteId}/status`,{revision:q.revision,status:'submitted'},cookies.pm);
  assert.equal(blocked.status,400);assert.ok(blocked.body.priceGate);
  // Xác nhận giá dịch vụ tại danh sách dự án rồi lấy lại giá vào bản nháp.
  const rowNow=(await call(`/projects/${pid}/shortlist`,undefined,cookies.pm)).body.rows[0];
  assert.equal((await call(`/projects/${pid}/shortlist/${row.id}/prices`,{revision:rowNow.revision,format:'svc_post',value:7_500_000,source:'Báo giá Community gửi',confirm:true},cookies.booking)).status,200);
  q=await getQuote(call,pid,cookies.pm,opt.quoteId);
  assert.equal((await call(`/projects/${pid}/quotes/${opt.quoteId}/refresh-prices`,{revision:q.revision},cookies.pm)).status,200);
  q=await getQuote(call,pid,cookies.pm,opt.quoteId);
  assert.equal((await call(`/projects/${pid}/quotes/${opt.quoteId}/status`,{revision:q.revision,status:'submitted'},cookies.pm)).status,200);
  q=await getQuote(call,pid,cookies.pm,opt.quoteId);
  assert.equal((await call(`/projects/${pid}/quotes/${opt.quoteId}/status`,{revision:q.revision,status:'approved'},cookies.pm)).status,200);
  const customer=await call(`/projects/${pid}/quotes/${opt.quoteId}/customer`,undefined,cookies.pm);
  assert.equal(customer.status,200);
  assert.equal(customer.body.items[0].unit,'bài');
  assert.equal(JSON.stringify(customer.body).includes('7500000'),false); // không lộ giá mua
  assert.equal(JSON.stringify(customer.body).includes('buyUnitPrice'),false);
}));

test('Dịch vụ comment thuê ngoài: 8.000 x 900 = 7,2 triệu; cổng xác nhận riêng; chưa chọn thuê ngoài thì không phát sinh chi phí comment',()=>fixture(async({call,pid,cookies}:any)=>{
  // Số học comment ở tầng tài chính: 800/1.000/900 đ x 8.000 comments.
  for(const [unit,total] of [[800,6_400_000],[1_000,8_000_000],[900,7_200_000]] as const){
    const f=calculateProjectFinance({items:[{quantity:8_000,buyUnitPrice:unit,sellUnitPrice:1_200,included:true}],discount:{mode:'fixed',value:0},agencyFee:{mode:'percent',value:0}});
    assert.equal(f.knownBuyTotal,total);
  }
  await call('/communities',{profile:commProfile('c1')},cookies.admin);
  const ph=await firstPhase(call,pid,cookies.pm);
  await call(`/projects/${pid}/phases/${ph.id}`,{revision:ph.revision,brief:{...briefBase,kpiTopics:100,kpiComments:8_000,services:[{name:'Đăng bài ảnh',unit:'bài',quantity:100,scope:'phase'}]}},cookies.pm,'PATCH');
  await call(`/projects/${pid}/shortlist/add`,{ids:['c1'],partnerType:'community'},cookies.pm);
  const row=(await call(`/projects/${pid}/shortlist`,undefined,cookies.pm)).body.rows[0];
  // Chỉ phân bổ bài đăng, KHÔNG chọn thuê comment -> phương án không có dòng comment
  // dù brief đặt mục tiêu 8.000 comments (mục tiêu không tự thành chi phí).
  const noComment=await call(`/projects/${pid}/options/from-phases`,{name:'Không thuê comment',allocations:[{shortlistId:row.id,key:'svc_post',quantity:100}]},cookies.pm);
  assert.equal(noComment.status,200);
  const qNo=await getQuote(call,pid,cookies.pm,noComment.body.quoteId);
  assert.equal(qNo.items.some((i:any)=>i.kind==='seeding'),false);
  // PM chủ động thuê toàn bộ 8.000 comments với giá nhà cung cấp xác nhận 900 đ/comment.
  const made=await call(`/projects/${pid}/options/from-phases`,{name:'Có thuê comment',allocations:[],commentLines:[
    {phase:ph.name,vendor:'Đơn vị Comment A',scopeNote:'Áp dụng cho 100 bài của phase',includedNote:'',pricingMode:'per_comment',quantity:8_000,buyUnitPrice:900,sellUnitPrice:1_200},
  ]},cookies.pm);
  assert.equal(made.status,200);assert.equal(made.body.itemCount,1);
  const q=await getQuote(call,pid,cookies.pm,made.body.quoteId);
  const line=q.items[0];
  assert.equal(line.kind,'seeding');assert.equal(line.partnerType,'service');assert.equal(line.quantity,8_000);
  assert.equal(line.commentInfo.briefTargetTotal,8_000); // mục tiêu brief chỉ để đối chiếu
  assert.equal(q.finance.knownBuyTotal,7_200_000);
  // Booking thấy giá mua nhưng không thấy giá bán/P&L.
  const bookingQuote=await getQuote(call,pid,cookies.booking,made.body.quoteId);
  assert.equal(bookingQuote.items[0].buyUnitPrice,900);
  assert.equal('sellUnitPrice' in bookingQuote.items[0],false);
  assert.equal('finance' in bookingQuote,false);
  // Chưa xác nhận giá -> gửi duyệt bị chặn; xác nhận do server ghi -> gửi duyệt được.
  const blocked=await call(`/projects/${pid}/quotes/${made.body.quoteId}/status`,{revision:q.revision,status:'submitted'},cookies.pm);
  assert.equal(blocked.status,400);
  const confirmed=await call(`/projects/${pid}/quotes/${made.body.quoteId}/confirm-buy`,{itemId:line.id,source:'Tin nhắn nhà cung cấp xác nhận 900đ/comment',revision:q.revision},cookies.pm);
  assert.equal(confirmed.status,200);
  assert.equal(confirmed.body.quote.items[0].buyConfirmation.value,900);
  const q2=await getQuote(call,pid,cookies.pm,made.body.quoteId);
  assert.equal((await call(`/projects/${pid}/quotes/${made.body.quoteId}/status`,{revision:q2.revision,status:'submitted'},cookies.pm)).status,200);
}));
