import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createWorkspace} from '../server/workspace';
import {computeContractMoney,installmentAmountFromPercent} from '../src/domain/contractMoney';

// ===== Giai đoạn A2 — Module Hợp đồng KOL + Community =====
const PNG_1X1='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function fixture(work:(f:any)=>Promise<void>){
  const w=createWorkspace('',{memory:true,setupCode:'test-code'});
  const app=express();app.use(express.json({limit:'20mb'}));app.use('/api/workspace',w.router);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${(server.address() as any).port}/api/workspace`;
  const call=async(path:string,body?:any,cookie?:string)=>{
    const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:r.status,body:await r.json().catch(()=>({})),cookie:r.headers.get('set-cookie')?.split(';')[0]};
  };
  const raw=async(path:string,cookie?:string)=>fetch(base+path,{headers:{...(cookie?{Cookie:cookie}:{})}});
  try{
    await call('/auth/setup',{code:'test-code',email:'admin@example.test',name:'Admin',password:'admin-password-123'});
    const admin=(await call('/auth/login',{email:'admin@example.test',password:'admin-password-123'})).cookie;
    const pidA=(await call('/projects',{name:'Dự án A',client:'Khách',campaign:'A'},admin)).body.id;
    const pidB=(await call('/projects',{name:'Dự án B',client:'Khách',campaign:'B'},admin)).body.id;
    const cookies:any={admin};
    const mkUser=async(name:string,projectRoles:[string,string][])=>{
      await call('/users',{email:`${name}@example.test`,name,password:'temporary-password-123',role:'member'},admin);
      const temporary=(await call('/auth/login',{email:`${name}@example.test`,password:'temporary-password-123'})).cookie;
      await call('/auth/password',{currentPassword:'temporary-password-123',newPassword:'changed-password-123'},temporary);
      cookies[name]=(await call('/auth/login',{email:`${name}@example.test`,password:'changed-password-123'})).cookie;
      for(const [pid,role] of projectRoles)await call(`/projects/${pid}/members`,{email:`${name}@example.test`,role},admin);
    };
    await mkUser('pm',[[pidA,'pm'],[pidB,'pm']]);
    await mkUser('bookinga',[[pidA,'booking']]);
    await mkUser('bookingb',[[pidB,'booking']]);
    await mkUser('member',[]);
    const kol={id:'partner-1',ten:'KOL Mẫu',linhVuc:['Ẩm thực'],nenTang:[{tenNenTang:'TikTok',linkProfile:'',soFollower:1000}],reviewSoBo:'',bangGia:{video:1000000}};
    assert.equal((await call(`/projects/${pidA}/catalog/import`,{profiles:[kol]},admin)).status,200);
    const comm={profile:{id:'partner-1',ten:'Page Mẫu',loai:'page',nenTang:'Facebook',link:'https://facebook.com/page-mau',linhVuc:[],quyMo:1000,loaiChiSo:'followers',dichVu:[]}};
    assert.equal((await call('/communities',comm,admin)).status,200);
    // Hồ sơ A1 của KOL partner-1: đầy đủ pháp lý/ngân hàng + suất riêng 6,5% cộng trên net.
    const profile={legalName:'Nguyễn Văn Mẫu',signingForm:'hkd',representative:'',taxCode:'0123456789',idNumber:'',address:'Hà Nội',certEmail:'mau@example.test',bankName:'Vietcombank',bankAccountName:'NGUYEN VAN MAU',bankAccountNumber:'0123456789',bankBranch:'',customTaxRate:6.5,customTaxMode:'tren_net',note:''};
    assert.equal((await call('/partners/kol/partner-1/signing',{...profile,revision:0},admin)).status,200);
    // Một giấy tờ thật (PNG 1x1 giải mã được) để ghim vào hợp đồng.
    const up=await call('/partners/kol/partner-1/documents',{name:'cccd.png',mime:'image/png',dataBase64:PNG_1X1},admin);
    assert.equal(up.status,200);
    await work({call,raw,pidA,pidB,cookies,docId:up.body.document.id,profile});
  }finally{server.close();}
}

const snapFull={legalName:'Nguyễn Văn Mẫu',signingForm:'hkd',representative:'',taxCode:'0123456789',idNumber:'',address:'Hà Nội',certEmail:'mau@example.test',bankName:'Vietcombank',bankAccountName:'NGUYEN VAN MAU',bankAccountNumber:'0123456789',bankBranch:'',note:''};

test('A2 money: hàm thuần dùng chung — các ca PM chốt và chặn đầu vào xấu',()=>{
  // NET 50tr HKD 7% trong giá gộp → thuế 3.763.441, GROSS 53.763.441.
  assert.deepEqual(computeContractMoney({basis:'net',amount:50000000,taxRate:7,taxMode:'trong_gia_gop'}),{net:50000000,tax:3763441,gross:53763441});
  // GROSS 53.763.441 HKD → NET đúng 50tr.
  assert.deepEqual(computeContractMoney({basis:'gross',amount:53763441,taxRate:7,taxMode:'trong_gia_gop'}),{net:50000000,tax:3763441,gross:53763441});
  // GROSS 50tr cá nhân 10% → NET 45tr.
  assert.deepEqual(computeContractMoney({basis:'gross',amount:50000000,taxRate:10,taxMode:'trong_gia_gop'}),{net:45000000,tax:5000000,gross:50000000});
  // GROSS 10,8tr đã gồm VAT 8% → NET 10tr.
  assert.deepEqual(computeContractMoney({basis:'gross',amount:10800000,taxRate:8,taxMode:'tren_net'}),{net:10000000,tax:800000,gross:10800000});
  // NET 10tr suất riêng 6,5% cộng trên net → GROSS 10,65tr; và ngược lại.
  assert.deepEqual(computeContractMoney({basis:'net',amount:10000000,taxRate:6.5,taxMode:'tren_net'}),{net:10000000,tax:650000,gross:10650000});
  assert.deepEqual(computeContractMoney({basis:'gross',amount:10650000,taxRate:6.5,taxMode:'tren_net'}),{net:10000000,tax:650000,gross:10650000});
  // Ca đặc tả: NET 44.979.556 suất 6,5% trên net → tổng 47.903.226 (±1đ).
  const c5=computeContractMoney({basis:'net',amount:44979556,taxRate:6.5,taxMode:'tren_net'});
  assert.ok(c5&&Math.abs(c5.gross-47903226)<=1&&c5.net+c5.tax===c5.gross);
  // Không thuế: NET = GROSS.
  assert.deepEqual(computeContractMoney({basis:'net',amount:7000000,taxRate:0,taxMode:'khong_thue'}),{net:7000000,tax:0,gross:7000000});
  // Đầu vào xấu → null: âm, NaN, Infinity, số không an toàn, suất >= 100, thiếu mode.
  assert.equal(computeContractMoney({basis:'net',amount:-1,taxRate:7,taxMode:'trong_gia_gop'}),null);
  assert.equal(computeContractMoney({basis:'net',amount:Number.NaN,taxRate:7,taxMode:'trong_gia_gop'}),null);
  assert.equal(computeContractMoney({basis:'net',amount:Number.POSITIVE_INFINITY,taxRate:7,taxMode:'trong_gia_gop'}),null);
  assert.equal(computeContractMoney({basis:'net',amount:2**53,taxRate:7,taxMode:'trong_gia_gop'}),null);
  assert.equal(computeContractMoney({basis:'net',amount:1000,taxRate:100,taxMode:'trong_gia_gop'}),null);
  assert.equal(computeContractMoney({basis:'net',amount:1000,taxRate:-1,taxMode:'tren_net'}),null);
  assert.equal(computeContractMoney({basis:'net',amount:1000,taxRate:7,taxMode:'sai-mode' as any}),null);
  // % đợt thanh toán: 50% của 53.763.441 → 26.881.721 (làm tròn lên) — tầng gọi phải
  // chặn tổng các đợt vượt giá trị, không tự nuốt phần dư.
  assert.equal(installmentAmountFromPercent(53763441,50),26881721);
});

test('A2 contracts: tạo + xem hai chiều + quyền dự án + snapshot độc lập + ghim giấy tờ',async()=>{
  await fixture(async({call,raw,pidA,pidB,cookies,docId,profile})=>{
    const {admin,pm,bookinga,bookingb,member}=cookies;
    // Booking A tạo hợp đồng KOL ở dự án A: NET 50tr, HKD 7% trong giá gộp, ghim 1 giấy tờ.
    const created=await call(`/projects/${pidA}/contracts`,{partnerType:'kol',partnerId:'partner-1',contractNumber:'001/A',contractName:'HĐ mẫu',signDate:'2026-10-30',snapshot:snapFull,money:{basis:'net',amount:50000000,taxRate:7,taxMode:'trong_gia_gop'},documentIds:[docId]},bookinga);
    assert.equal(created.status,200,JSON.stringify(created.body));
    const c=created.body.contract;
    assert.equal(c.money.net,50000000);assert.equal(c.money.tax,3763441);assert.equal(c.money.gross,53763441);
    assert.equal(c.documents.length,1);assert.equal(c.status,'draft');
    // Xem hai chiều: list dự án A + list theo đối tác (bookingA thấy, bookingB không).
    const listA=await call(`/projects/${pidA}/contracts`,undefined,bookinga);
    assert.equal(listA.body.contracts.length,1);
    assert.equal((await call(`/projects/${pidA}/contracts`,undefined,bookingb)).status,403);
    const byPartnerA=await call('/partners/kol/partner-1/contracts',undefined,bookinga);
    assert.equal(byPartnerA.body.contracts.length,1);
    const byPartnerB=await call('/partners/kol/partner-1/contracts',undefined,bookingb);
    assert.equal(byPartnerB.body.contracts.length,0);
    assert.equal((await call('/partners/kol/partner-1/contracts',undefined,admin)).body.contracts.length,1);
    assert.equal((await call(`/contracts/${c.id}`,undefined,bookingb)).status,404);
    assert.equal((await call(`/contracts/${c.id}`,undefined,member)).status,404);
    // Tải giấy tờ đã ghim: đúng quyền dự án mới được; ngoài quyền → 404.
    assert.equal((await raw(`/contracts/${c.id}/documents/${docId}/content`,bookinga)).status,200);
    assert.equal((await raw(`/contracts/${c.id}/documents/${docId}/content`,bookingb)).status,404);
    // Đánh dấu đã ký → sau đó sửa tiền bị chặn 422, sửa ghi chú vẫn được.
    const signed=await call(`/contracts/${c.id}`,{revision:c.revision,status:'signed'},bookinga);
    assert.equal(signed.status,200,JSON.stringify(signed.body));
    const editMoney=await call(`/contracts/${c.id}`,{revision:signed.body.contract.revision,money:{basis:'net',amount:51000000,taxRate:7,taxMode:'trong_gia_gop'}},bookinga);
    assert.equal(editMoney.status,422);
    const editNote=await call(`/contracts/${c.id}`,{revision:signed.body.contract.revision,note:'Ghi chú sau ký'},pm);
    assert.equal(editNote.status,200);
    // Revision cũ → 409.
    assert.equal((await call(`/contracts/${c.id}`,{revision:1,note:'trễ'},pm)).status,409);
    // Sửa hồ sơ A1 không đổi snapshot của hợp đồng; giấy tờ đang ghim không xoá được.
    const profNow=await call('/partners/kol/partner-1/signing',undefined,admin);
    assert.equal((await call('/partners/kol/partner-1/signing',{...profile,legalName:'Tên Pháp Lý Khác',revision:profNow.body.profile.revision},admin)).status,200);
    const detailAfter=await call(`/contracts/${c.id}`,undefined,bookinga);
    assert.equal(detailAfter.body.contract.snapshot.legalName,'Nguyễn Văn Mẫu');
    const docNow=await call('/partners/kol/partner-1/signing',undefined,admin);
    const delDoc=await call(`/partners/kol/partner-1/documents/${docId}/delete`,{revision:docNow.body.documents[0].revision},admin);
    assert.equal(delDoc.status,409);
    // Gợi ý: PM (thấy cả hai dự án) → lần ký gần nhất; Booking B (không thấy dự án A) → hồ sơ chung.
    const sugPm=await call(`/contracts/suggestion?projectId=${pidB}&partnerType=kol&partnerId=partner-1`,undefined,pm);
    assert.equal(sugPm.body.suggestion.source,'last_contract');
    assert.equal(sugPm.body.suggestion.snapshot.legalName,'Nguyễn Văn Mẫu');
    const sugB=await call(`/contracts/suggestion?projectId=${pidB}&partnerType=kol&partnerId=partner-1`,undefined,bookingb);
    assert.equal(sugB.body.suggestion.source,'profile');
    // Hợp đồng thứ hai ở dự án B (PM tạo): nhập GROSS 53.763.441 HKD → NET 50tr.
    const c2=await call(`/projects/${pidB}/contracts`,{partnerType:'kol',partnerId:'partner-1',contractNumber:'002/B',snapshot:snapFull,money:{basis:'gross',amount:53763441,taxRate:7,taxMode:'trong_gia_gop'}},pm);
    assert.equal(c2.status,200,JSON.stringify(c2.body));
    assert.equal(c2.body.contract.money.net,50000000);
    // Giá trong kho giữ nguyên sau mọi thao tác hợp đồng.
    const catalog=await call('/catalog',undefined,admin);
    assert.equal(catalog.body.kols.find((k:any)=>k.id==='partner-1').bangGia.video,1000000);
  });
});

test('A2 contracts: chặn ký khi thiếu thông tin + chuyển trạng thái + tiền qua API + Community',async()=>{
  await fixture(async({call,pidA,cookies})=>{
    const {pm,bookinga}=cookies;
    // Nháp trống: lưu được.
    const blank=await call(`/projects/${pidA}/contracts`,{partnerType:'community',partnerId:'partner-1',snapshot:{}},bookinga);
    assert.equal(blank.status,200,JSON.stringify(blank.body));
    const bc=blank.body.contract;
    assert.equal(bc.money,null);assert.equal(bc.status,'draft');
    // Ký khi trống → 400; có pháp lý nhưng thiếu giá → 400.
    assert.equal((await call(`/contracts/${bc.id}`,{revision:bc.revision,status:'signed'},bookinga)).status,400);
    const filled=await call(`/contracts/${bc.id}`,{revision:bc.revision,snapshot:{...snapFull,signingForm:'ca_nhan'}},bookinga);
    assert.equal(filled.status,200);
    assert.equal((await call(`/contracts/${bc.id}`,{revision:filled.body.contract.revision,status:'signed'},bookinga)).status,400);
    // Nhập GROSS 50tr cá nhân 10% → NET 45tr; ký được dù KHÔNG có giấy tờ nào.
    const withMoney=await call(`/contracts/${bc.id}`,{revision:filled.body.contract.revision,money:{basis:'gross',amount:50000000,taxRate:10,taxMode:'trong_gia_gop'}},bookinga);
    assert.equal(withMoney.status,200);assert.equal(withMoney.body.contract.money.net,45000000);
    const signed=await call(`/contracts/${bc.id}`,{revision:withMoney.body.contract.revision,status:'signed'},bookinga);
    assert.equal(signed.status,200);
    // Nháp → hoàn tất không qua ký: tạo nháp khác rồi thử.
    const blank2=await call(`/projects/${pidA}/contracts`,{partnerType:'community',partnerId:'partner-1',snapshot:{}},pm);
    assert.equal((await call(`/contracts/${blank2.body.contract.id}`,{revision:1,status:'completed'},pm)).status,422);
    // Đã ký → hoàn tất được; đã ký → về nháp bị chặn.
    assert.equal((await call(`/contracts/${bc.id}`,{revision:signed.body.contract.revision,status:'draft'},pm)).status,422);
    const done=await call(`/contracts/${bc.id}`,{revision:signed.body.contract.revision,status:'completed'},pm);
    assert.equal(done.status,200);
    // Các ca tiền qua API trên Community: GROSS gồm VAT 10,8tr → NET 10tr; NET 10tr suất 6,5% → GROSS 10,65tr và đảo ngược.
    const mk=async(money:any)=>{
      const r=await call(`/projects/${pidA}/contracts`,{partnerType:'community',partnerId:'partner-1',snapshot:snapFull,money},pm);
      assert.equal(r.status,200,JSON.stringify(r.body));
      return r.body.contract.money;
    };
    assert.deepEqual(await mk({basis:'gross',amount:10800000,taxRate:8,taxMode:'tren_net'}),{basis:'gross',enteredAmount:10800000,taxRate:8,taxMode:'tren_net',net:10000000,tax:800000,gross:10800000});
    assert.equal((await mk({basis:'net',amount:10000000,taxRate:6.5,taxMode:'tren_net'})).gross,10650000);
    assert.equal((await mk({basis:'gross',amount:10650000,taxRate:6.5,taxMode:'tren_net'})).net,10000000);
    // Tiền không hợp lệ qua API: suất 100%, số âm, thiếu cách tính → 400.
    assert.equal((await call(`/projects/${pidA}/contracts`,{partnerType:'community',partnerId:'partner-1',snapshot:snapFull,money:{basis:'net',amount:1000,taxRate:100,taxMode:'trong_gia_gop'}},pm)).status,400);
    assert.equal((await call(`/projects/${pidA}/contracts`,{partnerType:'community',partnerId:'partner-1',snapshot:snapFull,money:{basis:'net',amount:-5,taxRate:7,taxMode:'trong_gia_gop'}},pm)).status,400);
    assert.equal((await call(`/projects/${pidA}/contracts`,{partnerType:'community',partnerId:'partner-1',snapshot:snapFull,money:{basis:'net',amount:1000,taxRate:7,taxMode:''}},pm)).status,400);
    // Phản hồi hợp đồng không chứa bất kỳ trường giá bán/doanh thu/lãi nào cho Booking.
    const detail=await call(`/contracts/${bc.id}`,undefined,bookinga);
    assert.ok(!/sell|giaBan|doanhThu|loiNhuan|profit|revenue/i.test(JSON.stringify(detail.body)));
    // Lịch sử được ghi: tạo + sửa + đổi trạng thái.
    assert.ok(detail.body.contract.history.length>=3);
  });
});

test('A2 installments: % chỉ là cách nhập, chặn vượt giá trị, trả một phần/đủ, làm tròn',async()=>{
  await fixture(async({call,pidA,cookies})=>{
    const {pm,bookinga,bookingb}=cookies;
    const created=await call(`/projects/${pidA}/contracts`,{partnerType:'kol',partnerId:'partner-1',snapshot:snapFull,money:{basis:'net',amount:50000000,taxRate:7,taxMode:'trong_gia_gop'}},pm);
    const c=created.body.contract; // gross 53.763.441
    // Đợt 1 theo 50% → 26.881.721 (làm tròn). Đợt 2 theo 50% nữa → tổng vượt 1đ → chặn.
    const i1=await call(`/contracts/${c.id}/installments`,{name:'Tạm ứng',percent:50,milestone:'Sau ký',expectedDate:'2026-11-05'},bookinga);
    assert.equal(i1.status,200,JSON.stringify(i1.body));
    assert.equal(i1.body.contract.installments[0].amount,26881721);
    assert.equal(i1.body.contract.totals.shortfall,26881720);
    assert.equal((await call(`/contracts/${c.id}/installments`,{name:'Đợt 2',percent:50},bookinga)).status,400);
    // Đợt 2 nhập số tiền đúng phần còn lại → đủ 100%.
    const i2=await call(`/contracts/${c.id}/installments`,{name:'Sau nghiệm thu',amount:26881720,milestone:'Sau nghiệm thu'},bookinga);
    assert.equal(i2.status,200);
    assert.equal(i2.body.contract.totals.shortfall,0);
    const inst1=i2.body.contract.installments[0],inst2=i2.body.contract.installments[1];
    // Trả vượt đợt → chặn; trả mà thiếu ngày → chặn; trả một phần → trạng thái partial.
    assert.equal((await call(`/contracts/${c.id}/installments/${inst1.id}`,{revision:inst1.revision,paidAmount:inst1.amount+1,paidDate:'2026-11-06'},bookinga)).status,400);
    assert.equal((await call(`/contracts/${c.id}/installments/${inst1.id}`,{revision:inst1.revision,paidAmount:10000000},bookinga)).status,400);
    const partial=await call(`/contracts/${c.id}/installments/${inst1.id}`,{revision:inst1.revision,paidAmount:10000000,paidDate:'2026-11-06'},bookinga);
    assert.equal(partial.status,200);
    assert.equal(partial.body.contract.installments[0].status,'partial');
    // Revision cũ của đợt → 409. Trả đủ phần còn lại → paid.
    assert.equal((await call(`/contracts/${c.id}/installments/${inst1.id}`,{revision:inst1.revision,paidAmount:1,paidDate:'2026-11-06'},bookinga)).status,409);
    const now1=partial.body.contract.installments[0];
    const full=await call(`/contracts/${c.id}/installments/${inst1.id}`,{revision:now1.revision,paidAmount:inst1.amount,paidDate:'2026-11-07'},bookinga);
    assert.equal(full.body.contract.installments[0].status,'paid');
    // Đợt đã có tiền trả không xoá được; đợt chưa trả xoá được.
    assert.equal((await call(`/contracts/${c.id}/installments/${inst1.id}/delete`,{revision:full.body.contract.installments[0].revision},pm)).status,422);
    const del=await call(`/contracts/${c.id}/installments/${inst2.id}/delete`,{revision:inst2.revision},pm);
    assert.equal(del.status,200);
    assert.equal(del.body.contract.installments.length,1);
    // Booking dự án khác không chạm được đợt thanh toán.
    assert.equal((await call(`/contracts/${c.id}/installments`,{name:'Lén',amount:1},bookingb)).status,403);
    // Hợp đồng chưa có giá: nhập đợt theo % bị chặn, theo số tiền vẫn được (nháp).
    const noPrice=await call(`/projects/${pidA}/contracts`,{partnerType:'kol',partnerId:'partner-1',snapshot:{}},pm);
    const np=noPrice.body.contract;
    assert.equal((await call(`/contracts/${np.id}/installments`,{name:'Theo %',percent:50},pm)).status,400);
    assert.equal((await call(`/contracts/${np.id}/installments`,{name:'Theo tiền',amount:1000000},pm)).status,200);
  });
});

test('A2 fix (PM review): tiền gần giới hạn an toàn — validate cả đầu ra, tính BigInt không mất chính xác',()=>{
  // NET rất lớn + suất gross-up 99,99%: thuế/GROSS vượt MAX_SAFE_INTEGER → null (trước
  // đây chỉ validate đầu vào nên đầu ra tràn số vẫn lọt).
  assert.equal(computeContractMoney({basis:'net',amount:9000000000000000,taxRate:99.99,taxMode:'trong_gia_gop'}),null);
  assert.equal(computeContractMoney({basis:'net',amount:Number.MAX_SAFE_INTEGER,taxRate:99.99,taxMode:'trong_gia_gop'}),null);
  assert.equal(computeContractMoney({basis:'net',amount:Number.MAX_SAFE_INTEGER,taxRate:99.99,taxMode:'tren_net'}),null);
  // NET 9e15 suất 10% trong giá gộp: GROSS = 1e16 vượt giới hạn → null.
  assert.equal(computeContractMoney({basis:'net',amount:9000000000000000,taxRate:10,taxMode:'trong_gia_gop'}),null);
  // Ca lớn nhưng hợp lệ — kỳ vọng đã đối chiếu bằng phép tính BigInt độc lập:
  assert.deepEqual(computeContractMoney({basis:'net',amount:8000000000000000,taxRate:10,taxMode:'trong_gia_gop'}),{net:8000000000000000,tax:888888888888889,gross:8888888888888889});
  assert.deepEqual(computeContractMoney({basis:'gross',amount:8000000000000000,taxRate:8,taxMode:'tren_net'}),{net:7407407407407407,tax:592592592592593,gross:8000000000000000});
  // % đợt thanh toán cùng chuẩn: 100% của MAX_SAFE ra đúng MAX_SAFE; 33,3333% của
  // 53.763.441 = 17.921.129; % có quá 4 chữ số thập phân → null.
  assert.equal(installmentAmountFromPercent(Number.MAX_SAFE_INTEGER,100),Number.MAX_SAFE_INTEGER);
  assert.equal(installmentAmountFromPercent(53763441,33.3333),17921129);
  assert.equal(installmentAmountFromPercent(53763441,33.33333),null);
});

test('A2 fix (PM review): hạ giá dưới tổng đợt/đã trả hoặc xoá giá khi có đợt → chặn, dữ liệu nguyên',async()=>{
  await fixture(async({call,pidA,cookies})=>{
    const {pm}=cookies;
    // Nháp giá 100tr (không thuế) + đợt 80tr + đã trả thực tế 30tr.
    const created=await call(`/projects/${pidA}/contracts`,{partnerType:'kol',partnerId:'partner-1',snapshot:snapFull,money:{basis:'net',amount:100000000,taxRate:0,taxMode:'khong_thue'}},pm);
    assert.equal(created.status,200,JSON.stringify(created.body));
    const c=created.body.contract;
    const withInst=await call(`/contracts/${c.id}/installments`,{name:'Đợt 1',amount:80000000},pm);
    assert.equal(withInst.status,200);
    const inst=withInst.body.contract.installments[0];
    const paid=await call(`/contracts/${c.id}/installments/${inst.id}`,{revision:inst.revision,paidAmount:30000000,paidDate:'2026-11-01'},pm);
    assert.equal(paid.status,200);
    const rev=paid.body.contract.revision;
    // Hạ tổng phải chi xuống 50tr (dưới tổng đợt 80tr) → 422.
    assert.equal((await call(`/contracts/${c.id}`,{revision:rev,money:{basis:'net',amount:50000000,taxRate:0,taxMode:'khong_thue'}},pm)).status,422);
    // Hạ giá đồng thời chuyển sang Đã ký → vẫn 422 (không lách qua đường đổi trạng thái).
    assert.equal((await call(`/contracts/${c.id}`,{revision:rev,money:{basis:'net',amount:50000000,taxRate:0,taxMode:'khong_thue'},status:'signed'},pm)).status,422);
    // Xoá giá (money = null) khi đang có đợt → 422.
    assert.equal((await call(`/contracts/${c.id}`,{revision:rev,money:null},pm)).status,422);
    // Dữ liệu nguyên vẹn sau cả ba lần chặn: giá 100tr, vẫn Nháp, đợt và tiền đã trả nguyên.
    const after=await call(`/contracts/${c.id}`,undefined,pm);
    assert.equal(after.body.contract.money.gross,100000000);
    assert.equal(after.body.contract.status,'draft');
    assert.equal(after.body.contract.installments[0].amount,80000000);
    assert.equal(after.body.contract.installments[0].paidAmount,30000000);
    // Hạ xuống đúng bằng tổng đợt (80tr) → được; sửa ghi chú không kèm tiền → được.
    const toEighty=await call(`/contracts/${c.id}`,{revision:after.body.contract.revision,money:{basis:'net',amount:80000000,taxRate:0,taxMode:'khong_thue'}},pm);
    assert.equal(toEighty.status,200,JSON.stringify(toEighty.body));
    assert.equal((await call(`/contracts/${c.id}`,{revision:toEighty.body.contract.revision,note:'chỉ sửa ghi chú'},pm)).status,200);
  });
});

test('A2 fix UI (PM review): sửa hợp đồng đã ký — gửi lại đúng tập giấy tờ thì được, đổi tập thì chặn',async()=>{
  await fixture(async({call,pidA,cookies,docId})=>{
    const {pm}=cookies;
    const created=await call(`/projects/${pidA}/contracts`,{partnerType:'kol',partnerId:'partner-1',snapshot:snapFull,money:{basis:'net',amount:10000000,taxRate:7,taxMode:'trong_gia_gop'},documentIds:[docId]},pm);
    assert.equal(created.status,200,JSON.stringify(created.body));
    const c=created.body.contract;
    const signed=await call(`/contracts/${c.id}`,{revision:c.revision,status:'signed'},pm);
    assert.equal(signed.status,200);
    const rev=signed.body.contract.revision;
    // Client gửi kèm documentIds Y HỆT tập đã ghim + sửa ghi chú → lưu được (trước đây luôn 422).
    const sameDocs=await call(`/contracts/${c.id}`,{revision:rev,note:'Ghi chú sau ký',documentIds:[docId]},pm);
    assert.equal(sameDocs.status,200,JSON.stringify(sameDocs.body));
    assert.equal(sameDocs.body.contract.note,'Ghi chú sau ký');
    assert.deepEqual(sameDocs.body.contract.documents.map((d:any)=>d.id),[docId]);
    // Đổi tập giấy tờ (bỏ ghim) → vẫn 422, bất biến giữ nguyên.
    assert.equal((await call(`/contracts/${c.id}`,{revision:sameDocs.body.contract.revision,documentIds:[]},pm)).status,422);
    // Không gửi documentIds + sửa ghi chú → được như trước.
    const noDocs=await call(`/contracts/${c.id}`,{revision:sameDocs.body.contract.revision,note:'Ghi chú khác'},pm);
    assert.equal(noDocs.status,200);
    assert.deepEqual(noDocs.body.contract.documents.map((d:any)=>d.id),[docId]);
  });
});
