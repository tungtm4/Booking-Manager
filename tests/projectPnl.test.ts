import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createWorkspace} from '../server/workspace';

// ===== Giai đoạn C (đợt đầu) — Dashboard P&L theo nguồn chi phí =====
// G = NET; K = G + thuế cá nhân/HKD (chi phí) + chi phí trực tiếp khác; VAT công ty
// tách riêng, L = K + VAT. Phân loại thuế EXPLICIT từ hình thức ký — không suy từ
// suất/cách tính (HKD 6,5% cộng NET vẫn là thuế chi phí). Tổng dự án chỉ theo
// phương án khách chốt; tiền hợp đồng là phạm vi riêng, đếm mỗi hợp đồng 1 lần.

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
    await mkUser('pmb',[[pidB,'pm']]);
    await mkUser('bookinga',[[pidA,'booking']]);
    const {pm,bookinga}=cookies;
    const kol=(id:string,bangGia:any)=>({id,ten:'KOL '+id,linhVuc:['Ẩm thực'],nenTang:[{tenNenTang:'TikTok',linkProfile:'',soFollower:1000}],reviewSoBo:'',bangGia});
    assert.equal((await call(`/projects/${pidA}/catalog/import`,{profiles:[
      kol('p-ca-nhan',{video:50000000}),kol('p-hkd',{video:50000000,shorts:20000000}),kol('p-congty',{video:10000000}),kol('p-hkd65',{video:10000000}),
    ]},admin)).status,200);
    assert.equal((await call('/communities',{profile:{id:'c-congty',ten:'Page Công Ty',loai:'page',nenTang:'Facebook',link:'https://facebook.com/page-ct',linhVuc:[],quyMo:1000,loaiChiSo:'followers',dichVu:[{id:'svc-post',ten:'Bài đăng',donVi:'bài',giaThamKhao:5000000,dieuKien:''}]}},admin)).status,200);
    const profBase={representative:'',taxCode:'',idNumber:'',address:'',certEmail:'',bankName:'',bankAccountName:'',bankAccountNumber:'',bankBranch:'',note:''};
    const setProfile=async(type:string,id:string,form:string,customRate:any=null,customMode:any=null)=>{
      const r=await call(`/partners/${type}/${id}/signing`,{...profBase,legalName:'Pháp lý '+id,signingForm:form,customTaxRate:customRate,customTaxMode:customMode,revision:0},admin);
      assert.equal(r.status,200,JSON.stringify(r.body));
    };
    await setProfile('kol','p-ca-nhan','ca_nhan');
    await setProfile('kol','p-hkd','hkd');
    await setProfile('kol','p-congty','cong_ty');
    await setProfile('kol','p-hkd65','hkd',6.5,'tren_net');
    await setProfile('community','c-congty','cong_ty');
    await call(`/projects/${pidA}/shortlist/add`,{ids:['p-ca-nhan','p-hkd','p-congty','p-hkd65']},pm);
    await call(`/projects/${pidA}/shortlist/add`,{partnerType:'community',ids:['c-congty']},pm);
    const confirm=async(type:string,catalogId:string,format:string,value:number)=>{
      const sl=await call(`/projects/${pidA}/shortlist`,undefined,pm);
      const row=sl.body.rows.find((r:any)=>r.partnerType===type&&r.catalogId===catalogId);
      const r=await call(`/projects/${pidA}/shortlist/${row.id}/prices`,{revision:row.revision,format,value,source:'Test C',confirm:true},pm);
      assert.equal(r.status,200,JSON.stringify(r.body));
      return row.id;
    };
    const rows:Record<string,string>={};
    rows['p-ca-nhan']=await confirm('kol','p-ca-nhan','video',50000000);
    rows['p-hkd-video']=await confirm('kol','p-hkd','video',50000000);
    rows['p-hkd']=rows['p-hkd-video'];
    {const sl=await call(`/projects/${pidA}/shortlist`,undefined,pm);const row=sl.body.rows.find((r:any)=>r.partnerType==='kol'&&r.catalogId==='p-hkd');
     const r=await call(`/projects/${pidA}/shortlist/${row.id}/prices`,{revision:row.revision,format:'shorts',value:20000000,source:'Test C',confirm:true},pm);assert.equal(r.status,200);}
    rows['p-congty']=await confirm('kol','p-congty','video',10000000);
    rows['p-hkd65']=await confirm('kol','p-hkd65','video',10000000);
    rows['c-congty']=await confirm('community','c-congty','svc-post',5000000);
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
    const applyProfile=async(qid:string,itemId:string,extra:any={})=>{
      const q=await getQuote(qid,bookinga);
      const r=await call(`/projects/${pidA}/quotes/${qid}/cost-source`,{revision:q.revision,itemId,kind:'profile',basis:'net',...extra},bookinga);
      assert.equal(r.status,200,JSON.stringify(r.body));
      return r.body.costSource;
    };
    const pmSetSell=async(qid:string,sellBy:(i:any)=>number)=>{
      const pmQ=await getQuote(qid,pm);
      const payload={...payloadOf(pmQ),items:payloadOf(pmQ).items.map((i:any)=>({...i,sellUnitPrice:sellBy(i)}))};
      const r=await call(`/projects/${pidA}/quotes/${qid}/save`,{revision:pmQ.revision,payload},pm);
      assert.equal(r.status,200,JSON.stringify(r.body));
      return r.body.quote;
    };
    const pnlOf=async(qid:string,cookie:string=pm)=>{
      const r=await call(`/projects/${pidA}/quotes/${qid}/pnl`,undefined,cookie);
      assert.equal(r.status,200,JSON.stringify(r.body));
      return r.body.pnl;
    };
    await work({call,pidA,pidB,cookies,rows,mkQuote,getQuote,itemsOf,payloadOf,applyProfile,pmSetSell,pnlOf,profBase});
  }finally{server.close();}
}

const snapFor=(form:string)=>({legalName:'Pháp lý mẫu',signingForm:form,representative:'',taxCode:'',idNumber:'',address:'',certEmail:'',bankName:'',bankAccountName:'',bankAccountNumber:'',bankBranch:'',note:''});

test('C đợt 1 — phân loại thuế explicit: cá nhân/HKD vào K, VAT công ty tách riêng, HKD 6,5% cộng NET vẫn là chi phí',async()=>{
  await fixture(async({call,pidA,cookies,rows,mkQuote,getQuote,itemsOf,applyProfile,pmSetSell,pnlOf}:any)=>{
    const {pm,bookinga}=cookies;
    const qid=await mkQuote('PA phân loại',[
      {shortlistId:rows['p-ca-nhan'],key:'video',quantity:1},
      {shortlistId:rows['p-hkd'],key:'video',quantity:1},
      {shortlistId:rows['p-congty'],key:'video',quantity:1},
      {shortlistId:rows['p-hkd65'],key:'video',quantity:1},
      {shortlistId:rows['c-congty'],key:'svc-post',quantity:2},
    ]);
    const q=await getQuote(qid,bookinga);
    const byPartner=(pid2:string)=>itemsOf(q).find((i:any)=>i.creator.includes(pid2.replace('p-','').replace('c-',''))||i.serviceId==='svc-post'&&pid2==='c-congty');
    const lineFor=(pred:(i:any)=>boolean)=>itemsOf(q).find(pred);
    // Cá nhân: GROSS 50tr → NET 45tr, thuế 5tr, category ca_nhan.
    const csCn=await applyProfile(qid,lineFor((i:any)=>i.shortlistId===rows['p-ca-nhan']).id,{basis:'gross',amount:50000000});
    assert.equal(csCn.taxCategory,'ca_nhan');assert.equal(csCn.net,45000000);assert.equal(csCn.tax,5000000);
    // HKD chuẩn: NET 50tr → thuế 3.763.441.
    const csHkd=await applyProfile(qid,lineFor((i:any)=>i.shortlistId===rows['p-hkd']).id,{});
    assert.equal(csHkd.taxCategory,'hkd');assert.equal(csHkd.tax,3763441);
    // Công ty: NET 10tr → VAT 800.000, category cong_ty_vat.
    const csCt=await applyProfile(qid,lineFor((i:any)=>i.shortlistId===rows['p-congty']).id,{});
    assert.equal(csCt.taxCategory,'cong_ty_vat');assert.equal(csCt.tax,800000);
    // HKD suất riêng 6,5% CỘNG TRÊN NET: thuế 650.000 nhưng category vẫn hkd (chi phí), KHÔNG phải VAT.
    const cs65=await applyProfile(qid,lineFor((i:any)=>i.shortlistId===rows['p-hkd65']).id,{});
    assert.equal(cs65.taxCategory,'hkd');assert.equal(cs65.tax,650000);assert.equal(cs65.taxMode,'tren_net');
    // Community công ty: NET 5tr x 2 = 10tr → VAT 800.000.
    const csComm=await applyProfile(qid,lineFor((i:any)=>i.kind==='community').id,{});
    assert.equal(csComm.taxCategory,'cong_ty_vat');assert.equal(csComm.net,10000000);assert.equal(csComm.tax,800000);
    await pmSetSell(qid,(i:any)=>i.kind==='community'?7000000:100000000);
    const pnl=await pnlOf(qid);
    assert.equal(pnl.netG,125000000);
    assert.equal(pnl.costTax,9413441);
    assert.equal(pnl.vatInput,1600000);
    assert.equal(pnl.otherDirectCosts,0);
    assert.equal(pnl.totalK,134413441);
    assert.equal(pnl.totalPayableL,136013441);
    assert.equal(pnl.revenueBeforeTax,463680000);
    assert.equal(pnl.profit,329266559);
    assert.ok(Math.abs(pnl.marginPercent-329266559/463680000*100)<0.001);
    assert.equal(pnl.complete,true);
    assert.equal(pnl.hasEstimates,true);
    assert.equal(pnl.committed.net,0);
    assert.equal(pnl.estimated.net,125000000);
    // Booking không nhận P&L qua API.
    assert.equal((await call(`/projects/${pidA}/quotes/${qid}/pnl`,undefined,bookinga)).status,403);
    assert.equal((await call(`/projects/${pidA}/pnl`,undefined,bookinga)).status,403);
  });
});

test('C đợt 1 — phân bổ hợp đồng trên dòng SL 3 vẫn tính tổng 30tr (không nhân 90tr), phần chốt tách riêng',async()=>{
  await fixture(async({call,pidA,cookies,rows,mkQuote,getQuote,itemsOf,pmSetSell,pnlOf}:any)=>{
    const {bookinga}=cookies;
    const qid=await mkQuote('PA hợp đồng SL3',[{shortlistId:rows['p-hkd'],key:'video',quantity:3}]);
    const c=await call(`/projects/${pidA}/contracts`,{partnerType:'kol',partnerId:'p-hkd',contractNumber:'HD-C2',contractName:'HĐ C2',signDate:'2026-10-30',snapshot:snapFor('hkd'),money:{basis:'net',amount:50000000,taxRate:7,taxMode:'trong_gia_gop'},documentIds:[]},bookinga);
    assert.equal(c.status,200,JSON.stringify(c.body));
    assert.equal((await call(`/contracts/${c.body.contract.id}`,{revision:c.body.contract.revision,status:'signed'},bookinga)).status,200);
    const q=await getQuote(qid,bookinga);
    const line=itemsOf(q)[0];
    assert.equal(line.quantity,3);
    const applied=await call(`/projects/${pidA}/quotes/${qid}/cost-source`,{revision:q.revision,itemId:line.id,kind:'contract',contractId:c.body.contract.id,basis:'gross',amount:30000000},bookinga);
    assert.equal(applied.status,200,JSON.stringify(applied.body));
    assert.equal(applied.body.costSource.taxCategory,'hkd');
    await pmSetSell(qid,()=>100000000);
    const pnl=await pnlOf(qid);
    assert.equal(pnl.netG,27900000);
    assert.equal(pnl.costTax,2100000);
    assert.equal(pnl.totalK,30000000);
    assert.equal(pnl.totalPayableL,30000000);
    assert.equal(pnl.committed.net,27900000);assert.equal(pnl.committed.gross,30000000);
    assert.equal(pnl.estimated.net,0);
    assert.equal(pnl.revenueBeforeTax,336000000);
    assert.equal(pnl.profit,306000000);
    assert.equal(pnl.complete,true);assert.equal(pnl.hasEstimates,false);
  });
});

test('C đợt 1 — thiếu nguồn/loại thuế → chưa kết luận, chỉ cộng phần đã biết; xác nhận loại thuế thì hết thiếu',async()=>{
  await fixture(async({call,pidA,cookies,rows,mkQuote,getQuote,itemsOf,applyProfile,pmSetSell,pnlOf}:any)=>{
    const {bookinga}=cookies;
    const qid=await mkQuote('PA thiếu dữ liệu',[
      {shortlistId:rows['p-ca-nhan'],key:'video',quantity:1},
      {shortlistId:rows['p-hkd'],key:'video',quantity:1},
    ]);
    let q=await getQuote(qid,bookinga);
    const hkdLine=itemsOf(q).find((i:any)=>i.shortlistId===rows['p-hkd']);
    // Estimate KHÔNG kèm loại thuế (như snapshot B cũ) → taxCategory unknown.
    const est=await call(`/projects/${pidA}/quotes/${qid}/cost-source`,{revision:q.revision,itemId:hkdLine.id,kind:'estimate',basis:'net',amount:10000000,taxRate:10,taxMode:'trong_gia_gop'},bookinga);
    assert.equal(est.status,200,JSON.stringify(est.body));
    assert.equal(est.body.costSource.taxCategory,'unknown');
    await pmSetSell(qid,()=>50000000);
    let pnl=await pnlOf(qid);
    assert.equal(pnl.complete,false);
    assert.equal(pnl.profit,null);assert.equal(pnl.marginPercent,null);
    assert.equal(pnl.netG,10000000);
    assert.equal(pnl.unknownTax,1111111);
    assert.equal(pnl.missingLines.length,2);
    assert.ok(pnl.missingLines.some((x:any)=>x.reason==='no_source'));
    assert.ok(pnl.missingLines.some((x:any)=>x.reason==='unknown_tax_category'));
    // Xác nhận loại thuế với revision cũ → 409; đúng revision → đạt, thuế vào K.
    q=await getQuote(qid,bookinga);
    assert.equal((await call(`/projects/${pidA}/quotes/${qid}/cost-source/tax-category`,{revision:q.revision-1,itemId:hkdLine.id,taxCategory:'ca_nhan'},bookinga)).status,409);
    const conf=await call(`/projects/${pidA}/quotes/${qid}/cost-source/tax-category`,{revision:q.revision,itemId:hkdLine.id,taxCategory:'ca_nhan'},bookinga);
    assert.equal(conf.status,200,JSON.stringify(conf.body));
    pnl=await pnlOf(qid);
    assert.equal(pnl.unknownTax,0);assert.equal(pnl.costTax,1111111);
    assert.equal(pnl.complete,false);
    // Gắn nguồn cho dòng còn thiếu → đầy đủ: G = 45tr + 10tr, K = 55tr + 5tr + 1.111.111.
    const cnLine=(await getQuote(qid,bookinga)).items.find((i:any)=>i.shortlistId===rows['p-ca-nhan']);
    await applyProfile(qid,cnLine.id,{basis:'gross',amount:50000000});
    pnl=await pnlOf(qid);
    assert.equal(pnl.complete,true);
    assert.equal(pnl.netG,55000000);
    assert.equal(pnl.totalK,61111111);
    assert.equal(pnl.revenueBeforeTax,112000000);
    assert.equal(pnl.profit,50888889);
  });
});

test('C đợt 1 — tổng dự án chỉ theo bản chốt; tiền hợp đồng đếm 1 lần, thiếu kế hoạch, ngoài phạm vi, huỷ tách riêng; bản khách bất biến',async()=>{
  await fixture(async({call,pidA,pidB,cookies,rows,mkQuote,getQuote,itemsOf,pmSetSell}:any)=>{
    const {pm,bookinga,pmb,admin}=cookies;
    const qid=await mkQuote('PA chốt',[
      {shortlistId:rows['p-hkd'],key:'video',quantity:1},
      {shortlistId:rows['p-hkd'],key:'shorts',quantity:1},
    ]);
    const mkContract=async(partnerId:string,form:string,number:string,money:any,sign=true)=>{
      const c=await call(`/projects/${pidA}/contracts`,{partnerType:'kol',partnerId,contractNumber:number,contractName:'HĐ '+number,signDate:'2026-10-30',snapshot:snapFor(form),money,documentIds:[]},bookinga);
      assert.equal(c.status,200,JSON.stringify(c.body));
      if(sign){const s=await call(`/contracts/${c.body.contract.id}`,{revision:c.body.contract.revision,status:'signed'},bookinga);assert.equal(s.status,200,JSON.stringify(s.body));return s.body.contract;}
      return c.body.contract;
    };
    const c1=await mkContract('p-hkd','hkd','HD-CASH-1',{basis:'net',amount:50000000,taxRate:7,taxMode:'trong_gia_gop'});
    const c2=await mkContract('p-congty','cong_ty','HD-CASH-2',{basis:'net',amount:10000000,taxRate:8,taxMode:'tren_net'});
    const c3=await mkContract('p-ca-nhan','ca_nhan','HD-CASH-3',{basis:'net',amount:90000000,taxRate:10,taxMode:'trong_gia_gop'});
    assert.equal((await call(`/contracts/${c3.id}`,{revision:c3.revision,status:'cancelled'},bookinga)).status,200);
    await mkContract('p-congty','cong_ty','HD-CASH-4',{basis:'net',amount:10000000,taxRate:8,taxMode:'tren_net'},false);
    // Phân bổ C1 vào 2 dòng của PA chốt (20tr + 10tr).
    let q=await getQuote(qid,bookinga);
    for(const [format,amount] of [['video',20000000],['shorts',10000000]] as const){
      const line=itemsOf(q).find((i:any)=>i.format===format);
      const r=await call(`/projects/${pidA}/quotes/${qid}/cost-source`,{revision:q.revision,itemId:line.id,kind:'contract',contractId:c1.id,basis:'gross',amount},bookinga);
      assert.equal(r.status,200,JSON.stringify(r.body));
      q=await getQuote(qid,bookinga);
    }
    // Đợt thanh toán: C1 lên kế hoạch 20tr và trả đủ 20tr (thiếu kế hoạch so với 53.763.441); C2 đủ 10,8tr và trả đủ.
    const addInst=async(cid:string,amount:number)=>{
      const r=await call(`/contracts/${cid}/installments`,{name:'Đợt 1',milestone:'Theo HĐ',expectedDate:'2026-11-01',amount},bookinga);
      assert.equal(r.status,200,JSON.stringify(r.body));
      return r.body.contract.installments[0];
    };
    const inst1=await addInst(c1.id,20000000);
    assert.equal((await call(`/contracts/${c1.id}/installments/${inst1.id}`,{revision:inst1.revision,paidAmount:20000000,paidDate:'2026-11-02'},bookinga)).status,200);
    const inst2=await addInst(c2.id,10800000);
    assert.equal((await call(`/contracts/${c2.id}/installments/${inst2.id}`,{revision:inst2.revision,paidAmount:10800000,paidDate:'2026-11-02'},bookinga)).status,200);
    // Phương án thay thế (không được cộng vào tổng dự án).
    const qAlt=await mkQuote('PA thay thế',[{shortlistId:rows['p-ca-nhan'],key:'video',quantity:1}]);
    // Duyệt + chốt PA chính làm baseline.
    const saved=await pmSetSell(qid,()=>100000000);
    const sub=await call(`/projects/${pidA}/quotes/${qid}/status`,{revision:saved.revision,status:'submitted'},pm);
    assert.equal(sub.status,200,JSON.stringify(sub.body));
    const appr=await call(`/projects/${pidA}/quotes/${qid}/status`,{revision:saved.revision+1,status:'approved'},pm);
    assert.equal(appr.status,200,JSON.stringify(appr.body));
    assert.equal((await call(`/projects/${pidA}/quotes/${qid}/select`,{},pm)).status,200);
    const proj=await call(`/projects/${pidA}/pnl`,undefined,pm);
    assert.equal(proj.status,200,JSON.stringify(proj.body));
    assert.equal(proj.body.baseline.quoteId,qid);
    assert.equal(proj.body.baseline.pnl.netG,27900000);
    assert.equal(proj.body.baseline.pnl.totalK,30000000);
    assert.equal(proj.body.options.length,2);
    // Tiền hợp đồng: đếm mỗi HĐ 1 lần (C1 xuất hiện ở 2 dòng vẫn chỉ tính 1 lần).
    const cash=proj.body.cash;
    assert.equal(cash.totals.gross,64563441);
    assert.equal(cash.totals.planned,30800000);
    assert.equal(cash.totals.paid,30800000);
    assert.equal(cash.totals.remaining,33763441);
    assert.equal(cash.totals.missingPlan,1);
    assert.equal(cash.totals.outsideSelectedCount,1);
    assert.equal(cash.totals.outsideSelectedGross,10800000);
    assert.equal(cash.cancelled.length,1);
    assert.equal(cash.draftCount,1);
    const c1Cash=cash.contracts.find((c:any)=>c.id===c1.id);
    assert.equal(c1Cash.planComplete,false);assert.equal(c1Cash.remaining,33763441);assert.equal(c1Cash.referencedBySelected,true);
    // Bản khách của bản chốt: chỉ phía bán, tổng không đổi vì C.
    const cust=await call(`/projects/${pidA}/quotes/${qid}/customer`,undefined,pm);
    assert.equal(cust.status,200);
    assert.equal(cust.body.totalWithTax,224000000);
    assert.ok(!JSON.stringify(cust.body).includes('costSource')&&!JSON.stringify(cust.body).includes('netG'));
    // Huỷ C2: số P&L lịch sử của bản chốt KHÔNG đổi; tiền hợp đồng chuyển C2 sang nhóm huỷ.
    const c2Now=await call(`/contracts/${c2.id}`,undefined,bookinga);
    assert.equal((await call(`/contracts/${c2.id}`,{revision:c2Now.body.contract.revision,status:'cancelled'},bookinga)).status,200);
    const proj2=await call(`/projects/${pidA}/pnl`,undefined,pm);
    assert.equal(proj2.body.baseline.pnl.netG,27900000);
    assert.equal(proj2.body.baseline.pnl.totalK,30000000);
    assert.equal(proj2.body.cash.totals.gross,53763441);
    assert.equal(proj2.body.cash.cancelled.length,2);
    // Quyền: Booking 403, PM dự án khác 403, Admin 200. Dự án B chưa chốt → baseline null.
    assert.equal((await call(`/projects/${pidA}/pnl`,undefined,bookinga)).status,403);
    assert.equal((await call(`/projects/${pidA}/pnl`,undefined,pmb)).status,403);
    assert.equal((await call(`/projects/${pidA}/pnl`,undefined,admin)).status,200);
    const projB=await call(`/projects/${pidB}/pnl`,undefined,pm);
    assert.equal(projB.status,200);
    assert.equal(projB.body.baseline,null);
  });
});
