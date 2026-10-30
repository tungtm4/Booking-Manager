import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createWorkspace} from '../server/workspace';

// ===== Giai đoạn B (đợt đầu) — Nguồn chi phí đầu vào trên dòng báo giá =====
// Quy tắc PM: (1) chưa có hợp đồng → ước tính từ hồ sơ kho, ghi rõ "Chưa chốt hợp
// đồng"; (2) có hợp đồng → Booking CHỦ ĐỘNG phân bổ, không tự ghi đè bản đã duyệt;
// (3) giá bán do PM nhập, không tự đổi theo giá đầu vào. Giá cũ chưa rõ NET/GROSS
// phải xác nhận — không mặc định NET, không mặc định không thuế.

async function fixture(work:(f:any)=>Promise<void>){
  const w=createWorkspace('',{memory:true,setupCode:'test-code'});
  const app=express();app.use(express.json({limit:'20mb'}));app.use('/api/workspace',w.router);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${(server.address() as any).port}/api/workspace`;
  const call=async(path:string,body?:any,cookie?:string)=>{
    const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:r.status,body:await r.json().catch(()=>({})),cookie:r.headers.get('set-cookie')?.split(';')[0]};
  };
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
    const {pm,bookinga}=cookies;
    // Kho: KOL-1 (video 50tr, shorts 20tr), KOL-2 (video 30tr), Community partner-1.
    const kol1={id:'partner-1',ten:'KOL Một',linhVuc:['Ẩm thực'],nenTang:[{tenNenTang:'TikTok',linkProfile:'',soFollower:1000}],reviewSoBo:'',bangGia:{video:50000000,shorts:20000000}};
    const kol2={id:'partner-2',ten:'KOL Hai',linhVuc:['Ẩm thực'],nenTang:[{tenNenTang:'TikTok',linkProfile:'',soFollower:2000}],reviewSoBo:'',bangGia:{video:30000000}};
    assert.equal((await call(`/projects/${pidA}/catalog/import`,{profiles:[kol1,kol2]},admin)).status,200);
    const comm={profile:{id:'partner-1',ten:'Page Mẫu',loai:'page',nenTang:'Facebook',link:'https://facebook.com/page-mau',linhVuc:[],quyMo:1000,loaiChiSo:'followers',dichVu:[{id:'svc-post',ten:'Bài đăng',donVi:'bài',giaThamKhao:5000000,dieuKien:''}]}};
    assert.equal((await call('/communities',comm,admin)).status,200);
    // Hồ sơ ký kết A1: KOL-1 = HKD không suất riêng (preset 7% trong giá gộp);
    // Community = công ty (VAT 8% cộng trên net). KOL-2 KHÔNG có hồ sơ.
    const profBase={representative:'',taxCode:'',idNumber:'',address:'',certEmail:'',bankName:'',bankAccountName:'',bankAccountNumber:'',bankBranch:'',note:''};
    assert.equal((await call('/partners/kol/partner-1/signing',{...profBase,legalName:'Hộ KD Một',signingForm:'hkd',customTaxRate:null,customTaxMode:null,revision:0},admin)).status,200);
    assert.equal((await call('/partners/community/partner-1/signing',{...profBase,legalName:'Công Ty Mẫu',signingForm:'cong_ty',customTaxRate:null,customTaxMode:null,revision:0},admin)).status,200);
    // Đưa đối tác vào dự án A + xác nhận giá shortlist.
    await call(`/projects/${pidA}/shortlist/add`,{ids:['partner-1','partner-2']},pm);
    await call(`/projects/${pidA}/shortlist/add`,{partnerType:'community',ids:['partner-1']},pm);
    const sl=await call(`/projects/${pidA}/shortlist`,undefined,pm);
    const rowOf=(type:string,catalogId:string)=>sl.body.rows.find((r:any)=>r.partnerType===type&&r.catalogId===catalogId);
    const confirmPrice=async(row:any,format:string,value:number)=>{const r=await call(`/projects/${pidA}/shortlist/${row.id}/prices`,{revision:row.revision,format,value,source:'Kiểm chứng test',confirm:true},pm);assert.equal(r.status,200,JSON.stringify(r.body));row.revision+=1;};
    await confirmPrice(rowOf('kol','partner-1'),'video',50000000);
    await confirmPrice(rowOf('kol','partner-1'),'shorts',20000000);
    await confirmPrice(rowOf('community','partner-1'),'svc-post',5000000);
    const mkQuote=async(name:string,allocations:any[])=>{
      const r=await call(`/projects/${pidA}/options/from-phases`,{name,allocations},pm);
      assert.equal(r.status,200,JSON.stringify(r.body));
      return r.body.quoteId as string;
    };
    const getQuote=async(quoteId:string,cookie:string)=>{
      const d=await call(`/projects/${pidA}/options`,undefined,cookie);
      for(const o of d.body.options)for(const v of o.versions)if(v.id===quoteId)return v;
      return null;
    };
    const itemsOf=(q:any)=>q.items??q.payload.items;
    const payloadOf=(q:any)=>q.payload??{client:q.client,campaign:q.campaign,items:q.items,discount:q.discount,agencyFee:q.agencyFee,taxRate:q.taxRate};
    await work({call,pidA,pidB,cookies,sl,rowOf,mkQuote,getQuote,itemsOf,payloadOf,profBase});
  }finally{server.close();}
}

test('B đợt 1 — ước tính từ hồ sơ kho (KOL): snapshot độc lập, basis bắt buộc xác nhận, giá bán không lộ cho Booking',async()=>{
  await fixture(async({call,pidA,cookies,mkQuote,getQuote,itemsOf,payloadOf,profBase}:any)=>{
    const {admin,pm,bookinga}=cookies;
    const qid=await mkQuote('PA hồ sơ',[{shortlistId:(await call(`/projects/${pidA}/shortlist`,undefined,pm)).body.rows.find((r:any)=>r.partnerType==='kol'&&r.catalogId==='partner-1').id,key:'video',quantity:1}]);
    let q=await getQuote(qid,bookinga);
    const line=itemsOf(q)[0];
    assert.equal(line.buyUnitPrice,50000000);
    // Booking xem tuỳ chọn nguồn: thấy hồ sơ HKD 7% trong giá gộp, chưa có hợp đồng.
    const opts=await call(`/projects/${pidA}/quotes/${qid}/cost-options?itemId=${line.id}`,undefined,bookinga);
    assert.equal(opts.status,200,JSON.stringify(opts.body));
    assert.equal(opts.body.partner.id,'partner-1');
    assert.equal(opts.body.profile.taxRate,7);assert.equal(opts.body.profile.taxMode,'trong_gia_gop');assert.equal(opts.body.profile.taxSource,'form');
    assert.equal(opts.body.contracts.length,0);
    assert.ok(!JSON.stringify(opts.body).includes('sellUnitPrice'));
    // Áp dụng nguồn hồ sơ: NET 50tr HKD → thuế 3.763.441, GROSS 53.763.441, Dự kiến.
    const applied=await call(`/projects/${pidA}/quotes/${qid}/cost-source`,{revision:q.revision,itemId:line.id,kind:'profile',basis:'net'},bookinga);
    assert.equal(applied.status,200,JSON.stringify(applied.body));
    assert.equal(applied.body.costSource.net,50000000);
    assert.equal(applied.body.costSource.tax,3763441);
    assert.equal(applied.body.costSource.gross,53763441);
    assert.equal(applied.body.costSource.status,'du_kien');
    assert.equal(applied.body.previous,null);
    // Revision cũ → 409.
    assert.equal((await call(`/projects/${pidA}/quotes/${qid}/cost-source`,{revision:q.revision,itemId:line.id,kind:'profile',basis:'net'},bookinga)).status,409);
    // Đổi hồ sơ A1 (sang suất riêng 6,5% trên net) KHÔNG đổi snapshot đã lưu.
    const profNow=await call('/partners/kol/partner-1/signing',undefined,admin);
    assert.equal((await call('/partners/kol/partner-1/signing',{...profBase,legalName:'Hộ KD Một',signingForm:'hkd',customTaxRate:6.5,customTaxMode:'tren_net',revision:profNow.body.profile.revision},admin)).status,200);
    q=await getQuote(qid,bookinga);
    assert.equal(itemsOf(q)[0].costSource.gross,53763441);
    assert.equal(itemsOf(q)[0].costSource.taxRate,7);
    // PM đổi số lượng dòng → nguồn ước tính (suy từ tổng dòng) mất hiệu lực; giá bán PM nhập giữ nguyên.
    const pmQ=await getQuote(qid,pm);
    const payload={...payloadOf(pmQ),items:payloadOf(pmQ).items.map((i:any)=>({...i,quantity:2,sellUnitPrice:80000000}))};
    const saved=await call(`/projects/${pidA}/quotes/${qid}/save`,{revision:pmQ.revision,payload},pm);
    assert.equal(saved.status,200,JSON.stringify(saved.body));
    q=await getQuote(qid,bookinga);
    assert.equal(itemsOf(q)[0].costSource,undefined);
    // Booking không nhận giá bán/doanh thu/P&L qua bất kỳ API nào của báo giá.
    const bookingJson=JSON.stringify(q);
    assert.ok(!bookingJson.includes('sellUnitPrice')&&!bookingJson.includes('80000000')&&!bookingJson.includes('agencyFee'));
    // Booking gửi payload đầy đủ (chạm giá bán) → 403 như trước.
    assert.equal((await call(`/projects/${pidA}/quotes/${qid}/save`,{revision:q.revision,payload},bookinga)).status,403);
  });
});

test('B đợt 1 — dòng tay (không gắn kho): profile bị chặn, tự xác nhận bắt buộc basis + thuế rõ ràng',async()=>{
  await fixture(async({call,pidA,cookies,mkQuote,getQuote,itemsOf,payloadOf}:any)=>{
    const {pm,bookinga}=cookies;
    const sl=await call(`/projects/${pidA}/shortlist`,undefined,pm);
    const row=sl.body.rows.find((r:any)=>r.partnerType==='kol'&&r.catalogId==='partner-2');
    const qid=await mkQuote('PA dòng tay',[{shortlistId:row.id,key:'video',quantity:1}]);
    // KOL-2 không có hồ sơ ký kết → nguồn hồ sơ bị chặn với lý do rõ ràng.
    let q=await getQuote(qid,bookinga);
    const line2=itemsOf(q)[0];
    const profTry=await call(`/projects/${pidA}/quotes/${qid}/cost-source`,{revision:q.revision,itemId:line2.id,kind:'profile',basis:'net'},bookinga);
    assert.equal(profTry.status,400);
    assert.match(profTry.body.message,/chưa có hồ sơ ký kết/);
    // Thêm dòng tay bằng PM save, rồi thử các nguồn trên dòng tay.
    const pmQ=await getQuote(qid,pm);
    const manual={id:'manual-1',creator:'Đối tác tay',description:'Video review',phase:'',kind:'kol',quantity:1,buyUnitPrice:10000000,sellUnitPrice:null,included:false};
    const payload={...payloadOf(pmQ),items:[...payloadOf(pmQ).items,manual]};
    const saved=await call(`/projects/${pidA}/quotes/${qid}/save`,{revision:pmQ.revision,payload},pm);
    assert.equal(saved.status,200,JSON.stringify(saved.body));
    q=await getQuote(qid,bookinga);
    // Dòng tay: cost-options không có đối tác/hồ sơ/hợp đồng.
    const opts=await call(`/projects/${pidA}/quotes/${qid}/cost-options?itemId=manual-1`,undefined,bookinga);
    assert.equal(opts.body.partner,null);assert.equal(opts.body.profile,null);assert.equal(opts.body.contracts.length,0);
    // Tự xác nhận thiếu basis → 400; mode thuế sai → 400.
    assert.equal((await call(`/projects/${pidA}/quotes/${qid}/cost-source`,{revision:q.revision,itemId:'manual-1',kind:'estimate',amount:10000000,taxRate:8,taxMode:'tren_net'},bookinga)).status,400);
    assert.equal((await call(`/projects/${pidA}/quotes/${qid}/cost-source`,{revision:q.revision,itemId:'manual-1',kind:'estimate',basis:'net',amount:10000000,taxRate:8,taxMode:'sai-mode'},bookinga)).status,400);
    // Tự xác nhận đầy đủ: NET 10tr + VAT 8% trên net → GROSS 10,8tr (ca làm tròn A2).
    const est=await call(`/projects/${pidA}/quotes/${qid}/cost-source`,{revision:q.revision,itemId:'manual-1',kind:'estimate',basis:'net',amount:10000000,taxRate:8,taxMode:'tren_net'},bookinga);
    assert.equal(est.status,200,JSON.stringify(est.body));
    assert.equal(est.body.costSource.gross,10800000);assert.equal(est.body.costSource.tax,800000);assert.equal(est.body.costSource.status,'du_kien');
    // Booking đổi giá đầu vào của dòng → nguồn ước tính bị huỷ (không còn khớp tổng dòng).
    const bkQ=await getQuote(qid,bookinga);
    const bkSave=await call(`/projects/${pidA}/quotes/${qid}/save`,{revision:bkQ.revision,buyPrices:[{id:'manual-1',buyUnitPrice:11000000}]},bookinga);
    assert.equal(bkSave.status,200,JSON.stringify(bkSave.body));
    q=await getQuote(qid,bookinga);
    assert.equal(itemsOf(q).find((i:any)=>i.id==='manual-1').costSource,undefined);
  });
});

const snap={legalName:'Hộ KD Một',signingForm:'hkd',representative:'',taxCode:'',idNumber:'',address:'',certEmail:'',bankName:'',bankAccountName:'',bankAccountNumber:'',bankBranch:'',note:''};

test('B đợt 1 — phân bổ hợp đồng: đúng dự án/đối tác/trạng thái, tổng phân bổ không vượt hợp đồng, không nhân toàn bộ cho từng dòng',async()=>{
  await fixture(async({call,pidA,pidB,cookies,mkQuote,getQuote,itemsOf,payloadOf}:any)=>{
    const {pm,bookinga}=cookies;
    const mkContract=async(pid:string,partnerId:string,number:string,sign:boolean)=>{
      const c=await call(`/projects/${pid}/contracts`,{partnerType:'kol',partnerId,contractNumber:number,contractName:'HĐ '+number,signDate:'2026-10-30',snapshot:snap,money:{basis:'net',amount:50000000,taxRate:7,taxMode:'trong_gia_gop'},documentIds:[]},bookinga);
      assert.equal(c.status,200,JSON.stringify(c.body));
      if(sign){const s=await call(`/contracts/${c.body.contract.id}`,{revision:c.body.contract.revision,status:'signed'},bookinga);assert.equal(s.status,200,JSON.stringify(s.body));return s.body.contract;}
      return c.body.contract;
    };
    // Booking của dự án A không tạo được hợp đồng ở dự án B — dùng PM (có quyền cả hai).
    const mkContractPm=async(pid:string,partnerId:string,number:string)=>{
      const c=await call(`/projects/${pid}/contracts`,{partnerType:'kol',partnerId,contractNumber:number,contractName:'HĐ '+number,signDate:'2026-10-30',snapshot:snap,money:{basis:'net',amount:50000000,taxRate:7,taxMode:'trong_gia_gop'},documentIds:[]},pm);
      assert.equal(c.status,200,JSON.stringify(c.body));
      const s=await call(`/contracts/${c.body.contract.id}`,{revision:c.body.contract.revision,status:'signed'},pm);
      assert.equal(s.status,200,JSON.stringify(s.body));return s.body.contract;
    };
    const cDraft=await mkContract(pidA,'partner-1','HD-NHAP',false);
    const cMain=await mkContract(pidA,'partner-1','HD-CHINH',true);
    assert.equal(cMain.money.gross,53763441);assert.equal(cMain.money.tax,3763441);
    const cOtherPartner=await mkContract(pidA,'partner-2','HD-KHAC',true);
    const cOtherProject=await mkContractPm(pidB,'partner-1','HD-DUANB');
    const cCancelled=await mkContract(pidA,'partner-1','HD-HUY',false);
    assert.equal((await call(`/contracts/${cCancelled.id}`,{revision:cCancelled.revision,status:'cancelled'},bookinga)).status,200);
    // Phương án: 2 dòng cùng KOL-1 (video + shorts) + 1 dòng KOL-2.
    const sl=await call(`/projects/${pidA}/shortlist`,undefined,pm);
    const row1=sl.body.rows.find((r:any)=>r.partnerType==='kol'&&r.catalogId==='partner-1');
    const row2=sl.body.rows.find((r:any)=>r.partnerType==='kol'&&r.catalogId==='partner-2');
    const qid=await mkQuote('PA hợp đồng',[
      {shortlistId:row1.id,key:'video',quantity:1},
      {shortlistId:row1.id,key:'shorts',quantity:1},
      {shortlistId:row2.id,key:'video',quantity:1},
    ]);
    let q=await getQuote(qid,bookinga);
    const [lineVideo,lineShorts]=itemsOf(q);
    // cost-options: hợp đồng nháp không áp dụng được; đã ký thì được, kèm số còn lại.
    const opts=await call(`/projects/${pidA}/quotes/${qid}/cost-options?itemId=${lineVideo.id}`,undefined,bookinga);
    const byId=(id:string)=>opts.body.contracts.find((c:any)=>c.id===id);
    assert.equal(byId(cDraft.id).applicable,false);
    assert.equal(byId(cMain.id).applicable,true);
    assert.equal(byId(cMain.id).remaining,53763441);
    // Áp dụng hợp đồng nháp / huỷ / khác đối tác / khác dự án → đều 400.
    for(const bad of [cDraft.id,cCancelled.id,cOtherPartner.id,cOtherProject.id]){
      const r=await call(`/projects/${pidA}/quotes/${qid}/cost-source`,{revision:q.revision,itemId:lineVideo.id,kind:'contract',contractId:bad,basis:'gross',amount:1000000},bookinga);
      assert.equal(r.status,400,`contract ${bad}: ${JSON.stringify(r.body)}`);
    }
    // Phân bổ GROSS 30tr cho dòng video: NET 27,9tr, thuế 2,1tr, trạng thái ĐÃ CHỐT.
    const a1=await call(`/projects/${pidA}/quotes/${qid}/cost-source`,{revision:q.revision,itemId:lineVideo.id,kind:'contract',contractId:cMain.id,basis:'gross',amount:30000000},bookinga);
    assert.equal(a1.status,200,JSON.stringify(a1.body));
    assert.equal(a1.body.costSource.net,27900000);assert.equal(a1.body.costSource.tax,2100000);assert.equal(a1.body.costSource.gross,30000000);
    assert.equal(a1.body.costSource.status,'chot');assert.equal(a1.body.costSource.contractNumber,'HD-CHINH');
    q=await getQuote(qid,bookinga);
    // Phân bổ tiếp 30tr cho dòng shorts → vượt tổng hợp đồng → 400, dữ liệu nguyên.
    const over=await call(`/projects/${pidA}/quotes/${qid}/cost-source`,{revision:q.revision,itemId:lineShorts.id,kind:'contract',contractId:cMain.id,basis:'gross',amount:30000000},bookinga);
    assert.equal(over.status,400);assert.match(over.body.message,/vượt giá trị hợp đồng/);
    q=await getQuote(qid,bookinga);
    assert.equal(itemsOf(q)[1].costSource,undefined);
    // Phân bổ đúng phần còn lại 23.763.441 → tổng phân bổ = đúng giá trị hợp đồng.
    const a2=await call(`/projects/${pidA}/quotes/${qid}/cost-source`,{revision:q.revision,itemId:lineShorts.id,kind:'contract',contractId:cMain.id,basis:'gross',amount:23763441},bookinga);
    assert.equal(a2.status,200,JSON.stringify(a2.body));
    const opts2=await call(`/projects/${pidA}/quotes/${qid}/cost-options?itemId=${lineVideo.id}`,undefined,bookinga);
    assert.equal(opts2.body.contracts.find((c:any)=>c.id===cMain.id).remaining,0);
    // PM đổi số lượng dòng có nguồn hợp đồng → phân bổ được GIỮ (độc lập với đơn giá).
    const pmQ=await getQuote(qid,pm);
    const payload={...payloadOf(pmQ),items:payloadOf(pmQ).items.map((i:any)=>i.id===lineVideo.id?{...i,quantity:3}:i)};
    assert.equal((await call(`/projects/${pidA}/quotes/${qid}/save`,{revision:pmQ.revision,payload},pm)).status,200);
    q=await getQuote(qid,bookinga);
    assert.equal(itemsOf(q).find((i:any)=>i.id===lineVideo.id).costSource.gross,30000000);
  });
});

test('B đợt 1 — Community ước tính từ hồ sơ + bản đã duyệt & bản khách bất biến',async()=>{
  await fixture(async({call,pidA,cookies,mkQuote,getQuote,itemsOf,payloadOf}:any)=>{
    const {pm,bookinga}=cookies;
    const sl=await call(`/projects/${pidA}/shortlist`,undefined,pm);
    const rowC=sl.body.rows.find((r:any)=>r.partnerType==='community'&&r.catalogId==='partner-1');
    const rowK=sl.body.rows.find((r:any)=>r.partnerType==='kol'&&r.catalogId==='partner-1');
    const qid=await mkQuote('PA duyệt',[
      {shortlistId:rowC.id,key:'svc-post',quantity:2},
      {shortlistId:rowK.id,key:'video',quantity:1},
    ]);
    let q=await getQuote(qid,bookinga);
    const lineC=itemsOf(q).find((i:any)=>i.kind==='community');
    // Ước tính Community từ hồ sơ công ty: NET mặc định = 5tr x 2 = 10tr → VAT 8% → GROSS 10,8tr.
    const est=await call(`/projects/${pidA}/quotes/${qid}/cost-source`,{revision:q.revision,itemId:lineC.id,kind:'profile',basis:'net'},bookinga);
    assert.equal(est.status,200,JSON.stringify(est.body));
    assert.equal(est.body.costSource.net,10000000);assert.equal(est.body.costSource.tax,800000);assert.equal(est.body.costSource.gross,10800000);
    assert.equal(est.body.costSource.status,'du_kien');
    // PM nhập giá bán rồi gửi duyệt + duyệt.
    const pmQ=await getQuote(qid,pm);
    const payload={...payloadOf(pmQ),items:payloadOf(pmQ).items.map((i:any)=>({...i,sellUnitPrice:i.kind==='community'?7000000:80000000}))};
    const saved=await call(`/projects/${pidA}/quotes/${qid}/save`,{revision:pmQ.revision,payload},pm);
    assert.equal(saved.status,200,JSON.stringify(saved.body));
    const revAfterSave=saved.body.quote.revision;
    const sub=await call(`/projects/${pidA}/quotes/${qid}/status`,{revision:revAfterSave,status:'submitted'},pm);
    assert.equal(sub.status,200,JSON.stringify(sub.body));
    // Đã gửi duyệt: không sửa được nguồn chi phí nữa.
    assert.equal((await call(`/projects/${pidA}/quotes/${qid}/cost-source`,{revision:revAfterSave+1,itemId:lineC.id,kind:'estimate',basis:'net',amount:1000000,taxRate:0,taxMode:'khong_thue'},bookinga)).status,409);
    const appr=await call(`/projects/${pidA}/quotes/${qid}/status`,{revision:revAfterSave+1,status:'approved'},pm);
    assert.equal(appr.status,200,JSON.stringify(appr.body));
    // Bản khách: chỉ giá bán + chiết khấu/fee/thuế đầu ra hiện có; KHÔNG có nguồn chi phí/NET/giá đầu vào.
    const cust=await call(`/projects/${pidA}/quotes/${qid}/customer`,undefined,pm);
    assert.equal(cust.status,200,JSON.stringify(cust.body));
    const custJson=JSON.stringify(cust.body);
    assert.ok(!custJson.includes('costSource')&&!custJson.includes('buyUnitPrice')&&!custJson.includes('53763441'));
    // Tổng khách: (7tr x 2 + 80tr) = 94tr; fee 12% trên tổng sau chiết khấu (0) = 11.280.000; thuế đầu ra 0% → 105.280.000.
    assert.equal(cust.body.subtotal,94000000);
    assert.equal(cust.body.totalWithTax,105280000);
    // Tạo phiên bản mới từ bản đã duyệt: bản duyệt giữ nguyên snapshot + tổng khách.
    const nv=await call(`/projects/${pidA}/quotes/${qid}/new-version`,{},pm);
    assert.equal(nv.status,200,JSON.stringify(nv.body));
    const cust2=await call(`/projects/${pidA}/quotes/${qid}/customer`,undefined,pm);
    assert.equal(cust2.body.totalWithTax,105280000);
    const approvedQ=await getQuote(qid,pm);
    assert.equal(itemsOf(approvedQ).find((i:any)=>i.kind==='community').costSource.gross,10800000);
  });
});

test('B đợt 1 (fix PM) — PM save đổi ràng buộc đối tác/kind/type/shortlistId thì HUỶ nguồn cũ; giữ nguyên ràng buộc thì hợp đồng giữ nguyên',async()=>{
  await fixture(async({call,pidA,cookies,mkQuote,getQuote,itemsOf,payloadOf}:any)=>{
    const {pm,bookinga}=cookies;
    const sl=await call(`/projects/${pidA}/shortlist`,undefined,pm);
    const row1=sl.body.rows.find((r:any)=>r.partnerType==='kol'&&r.catalogId==='partner-1');
    const row2=sl.body.rows.find((r:any)=>r.partnerType==='kol'&&r.catalogId==='partner-2');
    const qid=await mkQuote('PA fix binding',[
      {shortlistId:row1.id,key:'video',quantity:1},
      {shortlistId:row1.id,key:'shorts',quantity:1},
    ]);
    // Hợp đồng đã ký cho KOL-1 + phân bổ 30tr GROSS vào dòng video.
    const c=await call(`/projects/${pidA}/contracts`,{partnerType:'kol',partnerId:'partner-1',contractNumber:'HD-FIX',contractName:'HĐ fix',signDate:'2026-10-30',snapshot:snap,money:{basis:'net',amount:50000000,taxRate:7,taxMode:'trong_gia_gop'},documentIds:[]},bookinga);
    assert.equal(c.status,200,JSON.stringify(c.body));
    const signedC=await call(`/contracts/${c.body.contract.id}`,{revision:c.body.contract.revision,status:'signed'},bookinga);
    assert.equal(signedC.status,200);
    const lineOf=async()=>{const q=await getQuote(qid,bookinga);return {q,video:itemsOf(q).find((i:any)=>i.format==='video'),shorts:itemsOf(q).find((i:any)=>i.format==='shorts')};};
    const applyContract=async()=>{
      const {q,video}=await lineOf();
      const r=await call(`/projects/${pidA}/quotes/${qid}/cost-source`,{revision:q.revision,itemId:video.id,kind:'contract',contractId:c.body.contract.id,basis:'gross',amount:30000000},bookinga);
      assert.equal(r.status,200,JSON.stringify(r.body));
    };
    const pmSave=async(mutate:(items:any[])=>any[])=>{
      const pmQ=await getQuote(qid,pm);
      const payload={...payloadOf(pmQ),items:mutate(payloadOf(pmQ).items.map((i:any)=>({...i})))};
      const r=await call(`/projects/${pidA}/quotes/${qid}/save`,{revision:pmQ.revision,payload},pm);
      assert.equal(r.status,200,JSON.stringify(r.body));
      return r.body.quote;
    };
    await applyContract();
    // (1) Cùng id nhưng payload đổi shortlistId sang KOL-2 → nguồn hợp đồng bị huỷ,
    // không copy phân bổ của KOL-1 sang ràng buộc mới.
    await pmSave(items=>items.map(i=>i.format==='video'?{...i,shortlistId:row2.id}:i));
    let cur=await lineOf();
    assert.equal(cur.video.costSource,undefined);
    // (2) Client tự nhét costSource giả trong payload → server không tin, vẫn trống.
    await pmSave(items=>items.map(i=>i.format==='video'?{...i,costSource:{kind:'contract',status:'chot',contractId:'gia',contractNumber:'GIA',basis:'gross',amount:999,taxRate:0,taxMode:'khong_thue',net:999,tax:0,gross:999}}:i));
    cur=await lineOf();
    assert.equal(cur.video.costSource,undefined);
    // (3) Gắn lại hợp đồng, PM đổi partnerType của dòng → huỷ nguồn.
    await applyContract();
    await pmSave(items=>items.map(i=>i.format==='video'?{...i,partnerType:'community'}:i));
    cur=await lineOf();
    assert.equal(cur.video.costSource,undefined);
    // (4) Gắn lại, PM đổi kind của dòng → huỷ nguồn.
    await applyContract();
    await pmSave(items=>items.map(i=>i.format==='video'?{...i,kind:'community'}:i));
    cur=await lineOf();
    assert.equal(cur.video.costSource,undefined);
    // (5) Gắn lại, PM chỉ đổi SỐ LƯỢNG (ràng buộc nguyên) → nguồn hợp đồng GIỮ NGUYÊN
    // tổng phân bổ 30tr, không nhân theo số lượng mới.
    await applyContract();
    const savedQty=await pmSave(items=>items.map(i=>i.format==='video'?{...i,quantity:3}:i));
    const videoSaved=savedQty.items.find((i:any)=>i.format==='video');
    assert.equal(videoSaved.quantity,3);
    assert.equal(videoSaved.costSource.gross,30000000);
    assert.equal(videoSaved.costSource.kind,'contract');
    // (6) Nguồn hồ sơ ở dòng shorts cũng bị huỷ khi đổi ràng buộc (partnerType).
    const qNow=await getQuote(qid,bookinga);
    const shortsLine=itemsOf(qNow).find((i:any)=>i.format==='shorts');
    const prof=await call(`/projects/${pidA}/quotes/${qid}/cost-source`,{revision:qNow.revision,itemId:shortsLine.id,kind:'profile',basis:'net',amount:20000000},bookinga);
    assert.equal(prof.status,200,JSON.stringify(prof.body));
    await pmSave(items=>items.map(i=>i.format==='shorts'?{...i,partnerType:'community'}:i));
    cur=await lineOf();
    assert.equal(cur.shorts.costSource,undefined);
  });
});
