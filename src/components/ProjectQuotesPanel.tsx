import React,{useEffect,useRef,useState} from 'react';
import {formatMoneyInput,parseMoneyInput} from '../utils/moneyInput';
import {formatDateTimeVN} from '../utils/formatters';
import {StorageService} from '../services/storageService';
import {PRICE_FORMAT_LABELS} from '../types/kol';
import {computeContractMoney} from '../domain/contractMoney';

type Item={id:string;creator:string;description:string;phase:string;kind:string;quantity:number;buyUnitPrice:number|null;sellUnitPrice?:number|null;included:boolean;shortlistId?:string;format?:string;priceSnapshot?:any;buyConfirmation?:{value:number;source:string;checkedByName:string;checkedAt:string};partnerType?:string;serviceId?:string;serviceName?:string;unit?:string;conditions?:string;note?:string;needsBuyConfirmation?:boolean;commentInfo?:{briefTargetTotal:number|null;scopeNote:string;includedNote:string;pricingMode?:'per_comment'|'package';commentsPerPackage?:number|null;includedComments?:number|null};acceptedQty?:number|null;costSource?:any};
async function request(path:string,body?:unknown){
  const r=await fetch('/api/workspace'+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const d=await r.json();if(r.status===401)window.dispatchEvent(new Event('workspace_session_expired'));if(!r.ok)throw new Error(d.message||'Không thực hiện được yêu cầu.');return d;
}
const field='w-full rounded-lg border border-slate-300 px-3 py-2 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-300 outline-none';
const button='rounded-lg bg-indigo-600 text-white px-3 py-2 font-semibold text-sm disabled:opacity-50';
const statusLabel:Record<string,string>={draft:'Bản nháp',submitted:'Chờ duyệt',approved:'Đã duyệt',changes_requested:'Cần chỉnh sửa'};
const money=(v:number|null|undefined)=>v==null?'Chưa đủ dữ liệu':formatMoneyInput(v)+' ₫';
// Vấn đề giá của các dòng ĐƯỢC TÍNH vào báo giá (dòng bỏ chọn không gây chặn).
// Khớp quy tắc ở server: mọi dòng KOL/Community và dòng dịch vụ comment thuê ngoài phải
// có giá đầu vào đã xác nhận — dòng từ danh sách xét theo priceSnapshot, dòng nhập tay
// xét theo buyConfirmation còn khớp giá hiện tại.
function manualBuyConfirmed(i:Item){const c=i.buyConfirmation;return !!c&&c.value===i.buyUnitPrice;}
function needsConfirm(i:Item){return i.kind==='kol'||i.kind==='community'||i.needsBuyConfirmation===true;}
function isCommentLine(i:Item){
  if(i.commentInfo)return true;
  const text=`${i.creator} ${i.description} ${i.serviceName??''}`;
  return (i.partnerType==='service'||i.kind==='seeding'||i.kind==='buzz')&&/comment|bình luận/i.test(text);
}
function isCommentPkg(i:Item){
  if(i.commentInfo?.pricingMode==='package')return true;
  const isGoi=typeof i.unit==='string'&&/^(gói|goi)$/i.test(i.unit.trim());
  return isCommentLine(i)&&isGoi;
}
function priceProblems(list:Item[]){
  let lines=0,missingBuy=0,missingSell=0,unconfirmedBuy=0,incompletePackages=0;
  for(const i of list){
    if(!i.included)continue;let bad=false;
    if(i.buyUnitPrice===null){missingBuy++;bad=true;}
    if(i.sellUnitPrice==null){missingSell++;bad=true;}
    if(i.buyUnitPrice!==null&&needsConfirm(i)){
      if(i.priceSnapshot){if(i.priceSnapshot.status!=='confirmed'){unconfirmedBuy++;bad=true;}}
      else if(!manualBuyConfirmed(i)){unconfirmedBuy++;bad=true;}
    }
    // Gói comment thiếu số comment mỗi gói hoặc ghi chú phạm vi: bản nháp vẫn lưu
    // được nhưng bị chặn khi gửi duyệt (khớp cổng ở server).
    if(isCommentLine(i)){
      if(isCommentPkg(i)){
        if(!(i.commentInfo?.commentsPerPackage&&i.commentInfo.commentsPerPackage>=1)||!i.commentInfo?.scopeNote?.trim()){incompletePackages++;bad=true;}
      }else if(!i.commentInfo?.pricingMode&&(!i.unit||!/^comment$/i.test(i.unit.trim()))){
        incompletePackages++;bad=true;
      }
    }
    if(bad)lines++;
  }
  return {lines,missingBuy,missingSell,unconfirmedBuy,incompletePackages};
}


const TAX_MODE_LABEL:Record<string,string>={trong_gia_gop:'Thuế nằm trong giá gộp (trừ trong tổng)',tren_net:'Cộng trên NET',khong_thue:'Không thuế'};
const SIGNING_FORM_LABEL:Record<string,string>={ca_nhan:'Cá nhân',hkd:'Hộ kinh doanh',cong_ty:'Công ty'};
// Giai đoạn B (đợt đầu): gắn ĐỔI nguồn chi phí đầu vào cho một dòng KOL/Community.
// Booking chủ động chọn nguồn và bấm áp dụng — hệ thống không tự ghi đè. Nguồn hợp
// đồng là phân bổ một PHẦN giá trị hợp đồng, xem trước NET/thuế/tổng chi trước khi
// áp dụng; server là nơi tính lại cuối cùng.
function CostSourceDialog({projectId,quoteId,revision,item,onClose,onApplied}:{projectId:string;quoteId:string;revision:number;item:Item;onClose:()=>void;onApplied:()=>void}){
  const [opts,setOpts]=useState<any>(null),[loadErr,setLoadErr]=useState('');
  const [tab,setTab]=useState<'contract'|'profile'|'estimate'>('contract');
  const [contractId,setContractId]=useState('');
  const [basis,setBasis]=useState<'net'|'gross'>('net');
  const [amount,setAmount]=useState<number|''>('');
  const [preset,setPreset]=useState('hkd');
  const [taxRate,setTaxRate]=useState<number|''>(7);
  const [taxMode,setTaxMode]=useState('trong_gia_gop');
  const [busy,setBusy]=useState(false),[err,setErr]=useState('');
  useEffect(()=>{
    request(`/projects/${projectId}/quotes/${quoteId}/cost-options?itemId=${item.id}`).then(d=>{
      setOpts(d);setAmount(d.lineBuyTotal??'');
      const first=(d.contracts??[]).find((c:any)=>c.applicable);
      if(first){setContractId(first.id);setTab('contract');}
      else if(d.profile&&d.profile.taxRate!==null)setTab('profile');
      else setTab('estimate');
    }).catch(e=>setLoadErr(e instanceof Error?e.message:'Không tải được tuỳ chọn nguồn chi phí.'));
  },[]);
  const cur=item.costSource;
  const selContract=(opts?.contracts??[]).find((c:any)=>c.id===contractId);
  const ownAlloc=cur&&cur.kind==='contract'&&cur.contractId===contractId?cur.gross:0;
  const preview=(()=>{
    const amt=typeof amount==='number'?amount:Number(amount);
    if(!Number.isFinite(amt)||amt===''as any)return null;
    if(tab==='contract'&&selContract)return computeContractMoney({basis,amount:amt,taxRate:selContract.taxRate,taxMode:selContract.taxMode});
    if(tab==='profile'&&opts?.profile&&opts.profile.taxRate!==null)return computeContractMoney({basis,amount:amt,taxRate:opts.profile.taxRate,taxMode:opts.profile.taxMode});
    if(tab==='estimate')return computeContractMoney({basis,amount:amt,taxRate:typeof taxRate==='number'?taxRate:Number(taxRate),taxMode:taxMode as any});
    return null;
  })();
  const overContract=tab==='contract'&&selContract&&preview?preview.gross>(selContract.remaining+ownAlloc):false;
  async function apply(){
    setBusy(true);setErr('');
    try{
      const body:any={revision,itemId:item.id,kind:tab};
      if(tab==='contract'){body.contractId=contractId;body.basis=basis;body.amount=Number(amount);}
      if(tab==='profile'){body.basis=basis;if(amount!=='')body.amount=Number(amount);}
      if(tab==='estimate'){body.basis=basis;body.amount=Number(amount);body.taxRate=Number(taxRate);body.taxMode=taxMode;}
      await request(`/projects/${projectId}/quotes/${quoteId}/cost-source`,body);
      onApplied();
    }catch(e){setErr(e instanceof Error?e.message:'Không áp dụng được nguồn chi phí.');}
    finally{setBusy(false);}
  }
  async function clearSource(){
    setBusy(true);setErr('');
    try{await request(`/projects/${projectId}/quotes/${quoteId}/cost-source/clear`,{revision,itemId:item.id});onApplied();}
    catch(e){setErr(e instanceof Error?e.message:'Không xoá được nguồn chi phí.');}
    finally{setBusy(false);}
  }
  const basisRadios=<div className="flex flex-wrap gap-3 text-sm">
    <label className="flex items-center gap-1"><input type="radio" name="cs-basis" checked={basis==='net'} onChange={()=>setBasis('net')}/> Số tiền là NET (đối tác thực nhận)</label>
    <label className="flex items-center gap-1"><input type="radio" name="cs-basis" checked={basis==='gross'} onChange={()=>setBasis('gross')}/> Số tiền là GROSS (tổng phải chi, đã gồm thuế)</label>
  </div>;
  const amountInput=<label className="text-sm block">Số tiền<input aria-label="Số tiền nguồn chi phí" className={field} inputMode="numeric" value={amount===''?'':formatMoneyInput(amount)} onChange={e=>{const n=parseMoneyInput(e.target.value);setAmount(n===''?'':n);}} placeholder="Nhập số tiền"/></label>;
  return <div className="fixed inset-0 z-50 bg-black/40 overflow-y-auto">
    <div className="max-w-2xl mx-auto my-8 bg-white rounded-xl shadow p-5 space-y-4 mx-3 sm:mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div><h3 className="font-bold">Nguồn chi phí — {item.creator}</h3><p className="text-xs text-slate-500">{item.description} · Số lượng {item.quantity.toLocaleString('vi-VN')} · Giá đầu vào hiện tại: {item.buyUnitPrice===null?'chưa có':money(item.buyUnitPrice*item.quantity)+' (thành tiền dòng)'}</p></div>
        <button type="button" className="border rounded-lg px-2 py-1 text-sm" onClick={onClose}>Đóng</button>
      </div>
      {loadErr&&<p role="alert" className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{loadErr}</p>}
      {!opts&&!loadErr&&<p className="text-slate-500 text-sm">Đang tải tuỳ chọn nguồn chi phí…</p>}
      {opts&&<>
        <div className="bg-slate-50 border rounded-lg p-3 text-sm">
          <p className="font-semibold">Nguồn hiện tại của dòng {cur?'':'— chưa gắn'}</p>
          {cur&&<><p>{cur.kind==='contract'?`Đã chốt theo hợp đồng ${cur.contractNumber||''}`:cur.kind==='profile'?'Dự kiến từ hồ sơ kho — Chưa chốt hợp đồng':'Dự kiến tự xác nhận — Chưa chốt hợp đồng'}</p>
          <p className="text-slate-600">NET {money(cur.net)} · Thuế {money(cur.tax)} · Tổng phải chi {money(cur.gross)}</p>
          <button type="button" className="border rounded-lg px-2 py-1 text-xs bg-white mt-1" disabled={busy} onClick={clearSource}>Xoá nguồn chi phí</button></>}
        </div>
        <div className="flex gap-2 text-sm">
          {(['contract','profile','estimate'] as const).map(t=><button key={t} type="button" className={`border rounded-lg px-3 py-1.5 ${tab===t?'bg-indigo-600 text-white':'bg-white'}`} onClick={()=>setTab(t)}>{t==='contract'?'Từ hợp đồng':t==='profile'?'Ước tính từ hồ sơ kho':'Tự xác nhận'}</button>)}
        </div>
        {tab==='contract'&&<div className="space-y-3">
          {!opts.partner&&<p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">Dòng này chưa gắn đối tác trong kho (dòng nhập tay) nên không lấy được chi phí từ hợp đồng. Hãy dùng dòng từ danh sách đối tác của dự án, hoặc dùng nguồn Tự xác nhận.</p>}
          {opts.partner&&(opts.contracts??[]).length===0&&<p className="text-sm text-slate-600">Đối tác này chưa có hợp đồng nào trong dự án. Khi chưa có hợp đồng, dùng nguồn “Ước tính từ hồ sơ kho” (trạng thái Dự kiến — Chưa chốt hợp đồng).</p>}
          {(opts.contracts??[]).map((c:any)=><label key={c.id} className={`block border rounded-lg p-3 text-sm ${c.applicable?'':'opacity-60'}`}>
            <span className="flex items-center gap-2"><input type="radio" name="cs-contract" disabled={!c.applicable} checked={contractId===c.id} onChange={()=>setContractId(c.id)}/><strong>HĐ {c.number||'(chưa có số)'}</strong> — {c.name} · {c.statusLabel}</span>
            {c.gross!==null?<span className="block text-slate-600 mt-1">Tổng phải chi của hợp đồng: {money(c.gross)} · Đã phân bổ trong phương án này: {money(c.allocatedInQuote)} · Còn lại: {money(c.remaining)}</span>:<span className="block text-slate-600 mt-1">Hợp đồng chưa có giá trị.</span>}
            {!c.applicable&&<span className="block text-amber-700 mt-1">Chưa dùng được: chỉ hợp đồng Đã ký hoặc Hoàn tất mới là nguồn chi phí chốt.</span>}
          </label>)}
          {selContract&&selContract.applicable&&<div className="space-y-2">
            <p className="text-sm text-slate-600">Hợp đồng là TỔNG chi phí của đối tác trong dự án — nhập phần phân bổ cho dòng này, hệ thống không tự lấy toàn bộ hợp đồng và không tự chia đều. Thuế theo hợp đồng: {selContract.taxRate}% · {TAX_MODE_LABEL[selContract.taxMode]??selContract.taxMode}.</p>
            {basisRadios}{amountInput}
            {overContract&&<p className="text-sm text-red-700">Phân bổ vượt phần còn lại của hợp đồng ({money(selContract.remaining+ownAlloc)}). Giảm số phân bổ.</p>}
          </div>}
        </div>}
        {tab==='profile'&&<div className="space-y-3 text-sm">
          {!opts.partner&&<p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">Dòng này chưa gắn đối tác trong kho nên không có hồ sơ ký kết để ước tính.</p>}
          {opts.partner&&!opts.profile&&<p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">Đối tác chưa có hồ sơ ký kết trong kho. Bổ sung hồ sơ ký kết ở hồ sơ đối tác, hoặc dùng nguồn Tự xác nhận.</p>}
          {opts.profile&&opts.profile.taxRate===null&&<p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">Hồ sơ ký kết chưa đủ dữ liệu thuế: cần hình thức ký hoặc suất thuế riêng kèm cách tính. Bổ sung hồ sơ, hoặc dùng nguồn Tự xác nhận với thông số bạn nhập.</p>}
          {opts.profile&&opts.profile.taxRate!==null&&<div className="space-y-2">
            <p>{opts.profile.legalName||'—'} · Hình thức ký: {SIGNING_FORM_LABEL[opts.profile.signingForm]??opts.profile.signingForm} · Thuế: {opts.profile.taxRate}% · {TAX_MODE_LABEL[opts.profile.taxMode]??opts.profile.taxMode}{opts.profile.taxSource==='custom'?' (suất riêng trong hồ sơ)':' (theo hình thức ký)'}</p>
            <p className="text-amber-800 font-medium">Kết quả là chi phí DỰ KIẾN — Chưa chốt hợp đồng. Giá cũ chưa rõ NET/GROSS phải xác nhận ở bước dưới, hệ thống không mặc định là NET.</p>
            {basisRadios}{amountInput}
            <p className="text-xs text-slate-500">Để trống số tiền sẽ lấy theo thành tiền giá đầu vào hiện tại của dòng ({opts.lineBuyTotal===null?'chưa có giá đầu vào':money(opts.lineBuyTotal)}).</p>
          </div>}
        </div>}
        {tab==='estimate'&&<div className="space-y-3 text-sm">
          <p>Khi chưa có hợp đồng và hồ sơ chưa đủ: tự xác nhận bản chất số tiền và thông số thuế. Hệ thống không mặc định giá cũ là NET và không mặc định “không thuế” — chọn đúng trường hợp của bạn.</p>
          {basisRadios}{amountInput}
          <div className="grid sm:grid-cols-3 gap-2">
            <label className="text-sm">Trường hợp thuế<select aria-label="Trường hợp thuế" className={field} value={preset} onChange={e=>{const v=e.target.value;setPreset(v);if(v==='ca_nhan'){setTaxRate(10);setTaxMode('trong_gia_gop');}else if(v==='hkd'){setTaxRate(7);setTaxMode('trong_gia_gop');}else if(v==='cong_ty'){setTaxRate(8);setTaxMode('tren_net');}else if(v==='rieng_65'){setTaxRate(6.5);setTaxMode('tren_net');}else if(v==='khong_thue'){setTaxRate(0);setTaxMode('khong_thue');}}}><option value="ca_nhan">Cá nhân 10% trong giá gộp</option><option value="hkd">HKD 7% trong giá gộp</option><option value="cong_ty">Công ty VAT 8% trên NET</option><option value="rieng_65">Suất riêng 6,5% trên NET</option><option value="khong_thue">Không thuế</option><option value="tuy_chinh">Tuỳ chỉnh…</option></select></label>
            <label className="text-sm">Suất thuế (%)<input aria-label="Suất thuế" className={field} inputMode="decimal" disabled={preset!=='tuy_chinh'} value={taxRate} onChange={e=>setTaxRate(e.target.value===''?'':Number(e.target.value))}/></label>
            <label className="text-sm">Cách tính<select aria-label="Cách tính thuế" className={field} disabled={preset!=='tuy_chinh'} value={taxMode} onChange={e=>setTaxMode(e.target.value)}><option value="trong_gia_gop">Thuế nằm trong giá gộp</option><option value="tren_net">Cộng trên NET</option><option value="khong_thue">Không thuế</option></select></label>
          </div>
        </div>}
        {preview&&<div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-sm">
          <p className="font-semibold">Sau khi áp dụng {cur?'(thay nguồn hiện tại)':''}</p>
          <p>NET {money(preview.net)} · Thuế {money(preview.tax)} · Tổng phải chi {money(preview.gross)} — {tab==='contract'?'trạng thái: ĐÃ CHỐT (theo hợp đồng)':'trạng thái: DỰ KIẾN — Chưa chốt hợp đồng'}</p>
          {cur&&<p className="text-slate-600">Trước đó: NET {money(cur.net)} · Thuế {money(cur.tax)} · Tổng phải chi {money(cur.gross)}</p>}
        </div>}
        {err&&<p role="alert" className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{err}</p>}
        <div className="flex gap-2 justify-end">
          <button type="button" className="border rounded-lg px-3 py-2 text-sm" onClick={onClose}>Huỷ</button>
          <button type="button" className={button} disabled={busy||!preview||overContract||(tab==='contract'&&!(selContract&&selContract.applicable))||(tab==='profile'&&!(opts.profile&&opts.profile.taxRate!==null))} onClick={apply}>Áp dụng nguồn chi phí</button>
        </div>
      </>}
    </div>
  </div>;
}

export function ProjectQuotesPanel({projectId,isAdmin,onProjectChanged}:{projectId:string;isAdmin:boolean;onProjectChanged:()=>Promise<void>}){
  const [data,setData]=useState<any>(null),[quote,setQuote]=useState<any>(null),[items,setItems]=useState<Item[]>([]);
  const [discount,setDiscount]=useState<any>({mode:'fixed',value:0}),[fee,setFee]=useState<any>({mode:'percent',value:0}),[tax,setTax]=useState(0);
  const [optionId,setOptionId]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[dirty,setDirty]=useState(false);
  const [customer,setCustomer]=useState<any>(null),[legacyId,setLegacyId]=useState('');
  const [phases,setPhases]=useState<any[]>([]),[fromName,setFromName]=useState(''),[fromPhaseIds,setFromPhaseIds]=useState<string[]>([]),[showPrint,setShowPrint]=useState(false);
  // Phân bổ do PM chọn (rowId:key -> số lượng) + dòng dịch vụ comment thuê ngoài.
  const [shortlistRows,setShortlistRows]=useState<any[]>([]);
  const [alloc,setAlloc]=useState<Record<string,number>>({});
  const [commentLines,setCommentLines]=useState<any[]>([]);
  const [commentDraft,setCommentDraft]=useState<any>({phase:'',vendor:'',scopeNote:'',mode:'per_comment',quantity:'',commentsPerPackage:'',buyUnitPrice:'',sellUnitPrice:'',includedNote:''});
  const [loadState,setLoadState]=useState<'loading'|'ready'|'error'>('loading'),[loadError,setLoadError]=useState('');
  const [confirmSources,setConfirmSources]=useState<Record<string,string>>({});
  const [costItemId,setCostItemId]=useState<string|null>(null);
  const loadSeqRef=useRef(0);
  const base=`/projects/${projectId}`;
  function loadQuote(q:any){setQuote(q);setItems(q?.items??[]);setDiscount(q?.discount??{mode:'fixed',value:0});setFee(q?.agencyFee??{mode:'percent',value:0});setTax(q?.taxRate??0);setDirty(false);setCustomer(null);}
  async function refresh(preferred?:string){
    let result:any;
    try{result=await request(base+'/options');}
    catch{setError('Không tải lại được dữ liệu báo giá mới nhất. Dữ liệu đang hiển thị và các chỉnh sửa chưa lưu vẫn được giữ nguyên.');return;}
    setData(result);setLoadState('ready');
    // Tải phase độc lập: lỗi ở phần phase không làm mất báo giá đã tải.
    request(base+'/phases').then(r=>{setPhases(r.phases??[]);setFromPhaseIds(prev=>prev.length?prev:(r.phases??[]).map((x:any)=>x.id));}).catch(()=>{});
    request(base+'/shortlist').then(r=>setShortlistRows(r.rows??[])).catch(()=>{});
    const all=result.options.flatMap((o:any)=>o.versions);
    const selected=all.find((q:any)=>q.id===(preferred??quote?.id))??all[0]??null;
    loadQuote(selected);setOptionId(selected?.optionId??'');
  }
  async function loadInitial(){
    const seq=++loadSeqRef.current;
    setLoadState('loading');setLoadError('');
    try{
      const d=await request(base+'/options');
      if(seq!==loadSeqRef.current)return;
      setData(d);const first=d.options[0]?.versions[0]??null;loadQuote(first);setOptionId(first?.optionId??'');setLoadState('ready');
    }catch(e){
      if(seq!==loadSeqRef.current)return;
      setLoadError(e instanceof Error?e.message:'Không thể tải dữ liệu.');setLoadState('error');
    }
    request(base+'/phases').then(r=>{if(seq===loadSeqRef.current){setPhases(r.phases??[]);setFromPhaseIds((r.phases??[]).map((x:any)=>x.id));}}).catch(()=>{});
    request(base+'/shortlist').then(r=>{if(seq===loadSeqRef.current)setShortlistRows(r.rows??[]);}).catch(()=>{});
  }
  useEffect(()=>{setData(null);loadQuote(null);setError('');setNotice('');loadInitial();},[projectId]);
  async function run(work:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await work();}catch(e){setError(e instanceof Error?e.message:'Không thể xử lý.');}finally{setBusy(false);}}
  if(!data)return loadState==='error'
    ? <div className="py-6 space-y-3"><p role="alert" className="p-3 bg-red-50 text-red-700 rounded-lg">Không tải được phương án và báo giá của dự án này. {loadError}</p><button type="button" className="border rounded-lg px-3 py-2 text-sm" onClick={()=>loadInitial()}>Thử tải lại</button></div>
    : <div className="py-6 text-slate-500">Đang tải phương án và báo giá…</div>;
  const manage=data.canManage;
  const editable=quote&&['draft','changes_requested'].includes(quote.status);
  const currentOption=data.options.find((o:any)=>o.id===optionId);
  const baseline=data.options.flatMap((o:any)=>o.versions).find((q:any)=>q.id===data.baselineId);
  const customerGroups=(()=>{if(!customer)return [] as any[];const groups:any[]=[];for(const i of customer.items){const key=i.phase??'';let g=groups.find(x=>x.phase===key);if(!g){g={phase:key,items:[],subtotal:0};groups.push(g);}g.items.push(i);g.subtotal+=(i.total??0);}const multi=groups.length>1;for(const g of groups)g.showHeader=multi||Boolean(g.phase);return groups;})();
  function updateItem(id:string,key:string,value:unknown){setItems(prev=>prev.map(i=>i.id===id?{...i,[key]:value}:i));setDirty(true);}
  // Ô nguồn chi phí trong cột giá đầu vào (chỉ dòng KOL/Community): tóm tắt NET/thuế/
  // tổng chi + trạng thái Dự kiến/Đã chốt; số liệu này là đầu vào nội bộ, không vào P&L
  // hiện tại và không xuất hiện ở bản khách.
  function costCell(i:Item){
    if(i.kind!=='kol'&&i.kind!=='community')return null;
    const cs=i.costSource;
    return <div className="mt-2 border-t border-slate-200 pt-2 space-y-1">
      {cs?<>
        <p className="text-xs font-semibold">{cs.kind==='contract'?`Chi phí ĐÃ CHỐT · HĐ ${cs.contractNumber||''}`:cs.kind==='profile'?'Chi phí DỰ KIẾN từ hồ sơ kho':'Chi phí DỰ KIẾN · tự xác nhận'}</p>
        {cs.status==='du_kien'&&<p className="text-xs text-amber-700 font-medium">Chưa chốt hợp đồng</p>}
        <p className="text-xs text-slate-600">NET {money(cs.net)} · Thuế {money(cs.tax)} · Tổng phải chi {money(cs.gross)}</p>
      </>:<p className="text-xs text-slate-500">Chưa gắn nguồn chi phí (NET/thuế/tổng phải chi).</p>}
      {editable&&(dirty?<p className="text-xs text-amber-700">Lưu báo giá trước, rồi gắn nguồn chi phí.</p>:<button type="button" className="border rounded-lg px-2 py-1 text-xs bg-white" disabled={busy} onClick={()=>setCostItemId(i.id)}>{cs?'Đổi nguồn chi phí':'Gắn nguồn chi phí'}</button>)}
    </div>;
  }
  const costItem=items.find(i=>i.id===costItemId)??null;
  function choose(q:any){if(dirty&&!window.confirm('Các chỉnh sửa chưa lưu sẽ bị bỏ. Tiếp tục chuyển phiên bản?'))return;loadQuote(q);setOptionId(q.optionId);}
  async function save(){
    const body=manage?{revision:quote.revision,payload:{items,discount,agencyFee:fee,taxRate:tax}}:{revision:quote.revision,buyPrices:items.map(i=>({id:i.id,buyUnitPrice:i.buyUnitPrice}))};
    const saved=await request(`${base}/quotes/${quote.id}/save`,body);await refresh(saved.quote.id);setNotice('Đã lưu báo giá lên dự án.');
  }
  const legacyQuotes=isAdmin?StorageService.getQuotes():[];
  return <div className="space-y-6 mt-6 border-t border-slate-200 pt-6">
    <div><h2 className="text-xl font-bold">Phương án KOL & Báo giá</h2><p className="text-sm text-slate-500">Chọn KOL từ tab Brief & Danh sách KOL vào phương án. Bản nháp được phép còn thiếu giá hoặc giá chưa xác nhận; gửi duyệt/duyệt/chốt chỉ khi các dòng được tính đã đủ giá và giá đầu vào đã xác nhận. Mỗi phương án là một lựa chọn cho khách. Các phiên bản là lịch sử chỉnh sửa của lựa chọn đó.</p></div>
    {error&&<p role="alert" className="bg-red-50 text-red-700 p-3 rounded-lg">{error}</p>}
    {notice&&<p role="status" className="bg-emerald-50 text-emerald-800 p-3 rounded-lg">{notice}</p>}
    <section className="rounded-xl bg-slate-50 p-4"><h3 className="font-semibold mb-3">Thông tin chiến dịch</h3>
      {manage?<form key={JSON.stringify(data.project)} className="grid md:grid-cols-3 gap-3" onSubmit={e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.currentTarget));run(async()=>{await request(base+'/details',body);await refresh();await onProjectChanged();setNotice('Đã cập nhật dự án. Bản báo giá đã duyệt giữ thông tin tại thời điểm chốt.');});}}>
        <label className="text-sm">Tên dự án<input className={field} name="name" required maxLength={200} defaultValue={data.project.name}/></label>
        <label className="text-sm">Khách hàng / Nhãn hàng<input className={field} name="client" required maxLength={200} defaultValue={data.project.client}/></label>
        <label className="text-sm">Tên chiến dịch<input className={field} name="campaign" required maxLength={200} defaultValue={data.project.campaign}/></label>
        <button className={button} disabled={busy||dirty}>Lưu thông tin dự án</button>
      </form>:<p>{data.project.client||'Chưa nhập khách hàng'} · {data.project.campaign}</p>}
    </section>
    {manage&&<div className="grid sm:grid-cols-3 gap-3">
      <div className="p-4 rounded-xl border bg-indigo-50"><p className="text-xs text-indigo-800">Phương án đã chốt</p><strong>{baseline?data.options.find((o:any)=>o.id===baseline.optionId)?.name+' · V'+baseline.number:'Chưa chốt'}</strong></div>
      <div className="p-4 rounded-xl border"><p className="text-xs text-slate-500">Doanh thu trước thuế đã chốt</p><strong>{baseline?money(baseline.finance.revenueBeforeTax):'Chưa có baseline'}</strong></div>
      <div className="p-4 rounded-xl border"><p className="text-xs text-slate-500">Lợi nhuận dự kiến đã chốt</p><strong>{baseline?money(baseline.finance.profit):'Chưa có baseline'}</strong></div>
    </div>}
    {manage&&<form className="grid sm:grid-cols-3 gap-3 p-4 border rounded-xl" onSubmit={e=>{e.preventDefault();const form=e.currentTarget;const body=Object.fromEntries(new FormData(form));run(async()=>{const result=await request(base+'/options',body);form.reset();await refresh(result.quoteId);setNotice('Đã tạo phương án mới với báo giá V1.');});}}>
      <label className="text-sm">Tên phương án<input name="name" required maxLength={200} placeholder="Phương án A — KOL chủ lực" className={field}/></label>
      <label className="text-sm sm:col-span-2">Ghi chú riêng phương án<textarea name="brief" maxLength={10000} placeholder="Hướng lựa chọn KOL của phương án; brief chung nằm ở danh sách dự án" className={field}/></label>
      <button className={button} disabled={busy||dirty}>Tạo phương án KOL</button>
    </form>}
    {manage&&phases.length>0&&<section className="p-4 border border-indigo-200 bg-indigo-50/50 rounded-xl space-y-3">
      <h3 className="font-semibold">Tạo phương án từ phase — theo phân bổ PM chọn</h3>
      <p className="text-xs text-slate-500">Danh sách sơ bộ chỉ là ỨNG VIÊN: hệ thống không tự đưa toàn bộ ứng viên vào phương án và không tự chia đều SOW. PM chọn đối tác, dịch vụ/hạng mục và số lượng thực tế cho từng dòng; tổng chi phí của phương án lấy từ phân bổ này. KPI của brief (topics/comments/buzz) là mục tiêu đối chiếu — không tự thành dòng chi phí.</p>
      <div className="flex flex-wrap gap-2">
        {phases.map((ph:any)=><label key={ph.id} className="flex items-center gap-1 text-sm bg-white border rounded-lg px-2 py-1"><input type="checkbox" checked={fromPhaseIds.includes(ph.id)} onChange={()=>setFromPhaseIds(prev=>prev.includes(ph.id)?prev.filter(x=>x!==ph.id):[...prev,ph.id])}/>{ph.name}</label>)}
      </div>
      {fromPhaseIds.map(pid2=>{
        const ph=phases.find((x:any)=>x.id===pid2);if(!ph)return null;
        const rows=shortlistRows.filter((r:any)=>(r.phaseId??phases[0]?.id)===ph.id);
        const b=ph.brief;
        const allocOf=(rowId:string,key:string)=>alloc[rowId+':'+key]??0;
        const sumAlloc=(pred:(r:any,key:string)=>boolean)=>rows.reduce((a,r)=>a+Object.keys(alloc).filter(k=>{const [rid,...rest]=k.split(':');return rid===r.id&&pred(r,rest.join(':'));}).reduce((x,k)=>x+(alloc[k]??0),0),0);
        const targetLines:string[]=[];
        if(b){
          for(const d of b.deliverables??[]){if(b.deliverableScope!=='campaign')continue;const allocated=sumAlloc((r,key)=>r.partnerType!=='community'&&key===d.format);targetLines.push(`${PRICE_FORMAT_LABELS[d.format as keyof typeof PRICE_FORMAT_LABELS]??d.format}: đã phân bổ ${allocated.toLocaleString('vi-VN')} / mục tiêu ${d.quantity.toLocaleString('vi-VN')}${allocated<d.quantity?` (còn thiếu ${(d.quantity-allocated).toLocaleString('vi-VN')})`:allocated>d.quantity?` (vượt ${(allocated-d.quantity).toLocaleString('vi-VN')})`:' (đủ)'}`);}
          for(const s of b.services??[]){if(s.scope!=='phase')continue;const allocated=sumAlloc((r,key)=>{if(r.partnerType!=='community')return false;const svc=(r.profile.dichVu??[]).find((x:any)=>x.id===key);return !!svc&&(svc.ten.toLowerCase().includes(s.name.toLowerCase())||s.name.toLowerCase().includes(svc.ten.toLowerCase()));});targetLines.push(`Dịch vụ ${s.name}: đã phân bổ ${allocated.toLocaleString('vi-VN')} / mục tiêu ${s.quantity.toLocaleString('vi-VN')}${allocated<s.quantity?` (còn thiếu ${(s.quantity-allocated).toLocaleString('vi-VN')})`:allocated>s.quantity?` (vượt ${(allocated-s.quantity).toLocaleString('vi-VN')})`:' (đủ)'}`);}
          if(b.kpiTopics){const allocated=sumAlloc((r,key)=>{if(r.partnerType!=='community')return key==='post';const svc=(r.profile.dichVu??[]).find((x:any)=>x.id===key);const n=(svc?.ten??'').toLowerCase();return n.includes('đăng bài')||n.includes('bài đăng');});targetLines.push(`Bài viết (topics — KPI): đã phân bổ ${allocated.toLocaleString('vi-VN')} / mục tiêu ${b.kpiTopics.toLocaleString('vi-VN')}`);}
          if(b.kpiComments)targetLines.push(`Comments (KPI): mục tiêu ${b.kpiComments.toLocaleString('vi-VN')} — chỉ mua qua dòng dịch vụ comment bên dưới, theo số lượng bạn chọn`);
          if(b.kpiBuzz)targetLines.push(`Buzz (KPI): mục tiêu ${b.kpiBuzz.toLocaleString('vi-VN')} (like + share + comment; comments đã nằm trong buzz)`);
        }
        return <div key={ph.id} className="bg-white border rounded-xl p-3 space-y-2">
          <p className="text-sm font-semibold">{ph.name} <span className="font-normal text-slate-500">· {rows.length} ứng viên trong danh sách sơ bộ</span></p>
          {targetLines.length>0&&<ul className="text-xs text-slate-600 space-y-0.5">{targetLines.map((t,i)=><li key={i}>· {t}</li>)}</ul>}
          {!rows.length&&<p className="text-xs text-slate-500">Phase chưa có ứng viên. Thêm đối tác vào danh sách sơ bộ ở tab Brief & Danh sách đối tác.</p>}
          {rows.map((r:any)=>{
            const isComm=r.partnerType==='community';
            const keys=isComm?(r.profile.dichVu??[]).map((s:any)=>({key:s.id,label:s.ten+' ('+s.donVi+')'})):(b?.deliverables?.length?b.deliverables.map((d:any)=>({key:d.format,label:PRICE_FORMAT_LABELS[d.format as keyof typeof PRICE_FORMAT_LABELS]??d.format})):Object.entries(PRICE_FORMAT_LABELS).map(([k,v])=>({key:k,label:v})));
            return <div key={r.id} className="border-t pt-2">
              <p className="text-sm font-medium">{r.profile.ten} <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100">{isComm?'Community':'KOL'}</span></p>
              {isComm&&!(r.profile.dichVu??[]).length&&<p className="text-xs text-slate-500">Chưa có dịch vụ trong hồ sơ — bổ sung bảng giá ở Kho Community.</p>}
              <div className="flex flex-wrap gap-2 mt-1">
                {keys.map(({key,label}:{key:string;label:string})=>{
                  const price=r.prices?.[key];
                  return <label key={key} className="text-xs bg-slate-50 border rounded-lg px-2 py-1.5">
                    {label} · {price?(price.value===null?'chưa có giá':formatMoneyInput(price.value)+' ₫'+(price.status==='confirmed'?' · đã xác nhận':' · chưa xác nhận')):'—'}
                    <input aria-label={`Phân bổ ${label} cho ${r.profile.ten}`} className="block w-24 mt-1 rounded border border-slate-300 px-2 py-1 bg-white" type="number" min={0} step={1} value={alloc[r.id+':'+key]??''} placeholder="0 = không phân bổ" onChange={e=>{const v=e.target.value===''?0:Math.max(0,Math.floor(Number(e.target.value)||0));setAlloc(prev=>({...prev,[r.id+':'+key]:v}));}}/>
                  </label>;
                })}
              </div>
            </div>;
          })}
        </div>;
      })}
      <div className="bg-white border rounded-xl p-3 space-y-2">
        <p className="text-sm font-semibold">Dịch vụ comment thuê ngoài (tuỳ chọn, theo phase)</p>
        <p className="text-xs text-slate-500">Tổng comments mục tiêu của brief, số comments thuê ngoài và số đã nghiệm thu là ba con số khác nhau. Không mặc định mua toàn bộ mục tiêu; không tự chia đều cho từng bài. Nếu gói Community đã bao gồm comments, ghi rõ ở ô “phần đã bao gồm” để tránh tính trùng.</p>
        <div className="grid sm:grid-cols-3 gap-2">
          <label className="text-xs">Phase áp dụng
            <select aria-label="Phase cho dòng comment" className={field} value={commentDraft.phase} onChange={e=>setCommentDraft({...commentDraft,phase:e.target.value})}>
              <option value="">Chọn phase…</option>
              {phases.filter((ph:any)=>fromPhaseIds.includes(ph.id)).map((ph:any)=><option key={ph.id} value={ph.name}>{ph.name}{ph.brief?.kpiComments?` (mục tiêu ${ph.brief.kpiComments.toLocaleString('vi-VN')} comments)`:''}</option>)}
            </select>
          </label>
          <label className="text-xs">Nhà cung cấp
            <input aria-label="Nhà cung cấp comment" className={field} value={commentDraft.vendor} onChange={e=>setCommentDraft({...commentDraft,vendor:e.target.value})} maxLength={200} placeholder="Tên nhà cung cấp dịch vụ comment"/>
          </label>
          <label className="text-xs">Cách tính giá
            <select aria-label="Cách tính giá comment" className={field} value={commentDraft.mode} onChange={e=>setCommentDraft({...commentDraft,mode:e.target.value})}>
              <option value="per_comment">Theo số comment (đơn giá/comment)</option>
              <option value="package">Giá gói (phạm vi ghi ở ghi chú)</option>
            </select>
          </label>
          {commentDraft.mode==='per_comment'&&<label className="text-xs">Số comments thuê ngoài (bạn chọn)
            <input aria-label="Số comments thuê ngoài" className={field} type="number" min={0} step={1} value={commentDraft.quantity} onChange={e=>setCommentDraft({...commentDraft,quantity:e.target.value})} placeholder="VD: 8000"/>
          </label>}
          {commentDraft.mode==='package'&&<><label className="text-xs">Số gói
            <input aria-label="Số gói comment" className={field} type="number" min={1} step={1} value={commentDraft.quantity} onChange={e=>setCommentDraft({...commentDraft,quantity:e.target.value})} placeholder="VD: 2"/>
          </label>
          <label className="text-xs">Số comment bao gồm trong mỗi gói *
            <input aria-label="Số comment mỗi gói" className={field} type="number" min={1} step={1} value={commentDraft.commentsPerPackage} onChange={e=>setCommentDraft({...commentDraft,commentsPerPackage:e.target.value})} placeholder="VD: 4000 — lưu bằng trường riêng"/>
          </label></>}
          <label className="text-xs">{commentDraft.mode==='package'?'Giá đầu vào / gói (VND)':'Đơn giá đầu vào / comment (VND)'}
            <input aria-label="Giá đầu vào dịch vụ comment" className={field} inputMode="numeric" value={formatMoneyInput(commentDraft.buyUnitPrice)} onChange={e=>setCommentDraft({...commentDraft,buyUnitPrice:parseMoneyInput(e.target.value)})} placeholder="Để trống = chưa có giá"/>
          </label>
          <label className="text-xs">Giá bán {commentDraft.mode==='package'?'/ gói (VND)':'/ comment (VND)'}
            <input aria-label="Giá bán dịch vụ comment" className={field} inputMode="numeric" value={formatMoneyInput(commentDraft.sellUnitPrice)} onChange={e=>setCommentDraft({...commentDraft,sellUnitPrice:parseMoneyInput(e.target.value)})} placeholder="PM nhập"/>
          </label>
          <label className="text-xs sm:col-span-2">Phạm vi / nhóm bài áp dụng
            <input aria-label="Phạm vi dòng comment" className={field} value={commentDraft.scopeNote} onChange={e=>setCommentDraft({...commentDraft,scopeNote:e.target.value})} maxLength={1000} placeholder={commentDraft.mode==='package'?'Bắt buộc với gói — VD: Phân bổ trên 100 bài trong tháng 11':'VD: Áp dụng cho 100 bài seeding Threads của phase'}/>
          </label>
          <label className="text-xs">Phần gói đã bao gồm (tránh tính trùng)
            <input aria-label="Phần đã bao gồm trong gói comment" className={field} value={commentDraft.includedNote} onChange={e=>setCommentDraft({...commentDraft,includedNote:e.target.value})} maxLength={1000} placeholder="VD: Đã gồm trong gói Community X — không cộng trùng"/>
          </label>
        </div>
        {commentDraft.mode==='per_comment'&&Number(commentDraft.quantity)>0&&(commentDraft.buyUnitPrice===''||commentDraft.buyUnitPrice===null)
          ?<p className="text-xs text-slate-500">Ước tính tham khảo theo khoảng 800–1.000 ₫/comment (do bạn cung cấp, chưa phải giá xác nhận): {money(Number(commentDraft.quantity)*800)} – {money(Number(commentDraft.quantity)*1000)} cho {Number(commentDraft.quantity).toLocaleString('vi-VN')} comments.</p>
          :commentDraft.mode==='per_comment'&&Number(commentDraft.quantity)>0&&typeof commentDraft.buyUnitPrice==='number'
            ?<p className="text-xs text-slate-500">Chi phí mua dự kiến: {money(Number(commentDraft.quantity)*commentDraft.buyUnitPrice)} ({Number(commentDraft.quantity).toLocaleString('vi-VN')} comments × {formatMoneyInput(commentDraft.buyUnitPrice)} ₫) — giá vẫn cần xác nhận trong bản nháp sau khi tạo.</p>:null}
        {commentDraft.mode==='package'&&Number(commentDraft.quantity)>0&&Number(commentDraft.commentsPerPackage)>0&&<p className="text-xs text-slate-500">Tổng comment thuê theo gói: {Number(commentDraft.quantity).toLocaleString('vi-VN')} gói × {Number(commentDraft.commentsPerPackage).toLocaleString('vi-VN')} comment/gói = {(Number(commentDraft.quantity)*Number(commentDraft.commentsPerPackage)).toLocaleString('vi-VN')} comment.{typeof commentDraft.buyUnitPrice==='number'?` Thành tiền mua = số gói × giá gói = ${money(Number(commentDraft.quantity)*commentDraft.buyUnitPrice)} (không nhân số comment vào giá gói).`:''}</p>}
        <button type="button" className="border rounded-lg px-3 py-2 text-sm bg-white" disabled={!commentDraft.phase||!commentDraft.vendor.trim()||!(Number(commentDraft.quantity)>0)||(commentDraft.mode==='package'&&(!(Number(commentDraft.commentsPerPackage)>0)||!commentDraft.scopeNote.trim()))} onClick={()=>{setCommentLines(prev=>[...prev,{phase:commentDraft.phase,vendor:commentDraft.vendor.trim(),scopeNote:commentDraft.scopeNote,pricingMode:commentDraft.mode,quantity:Number(commentDraft.quantity),commentsPerPackage:commentDraft.mode==='package'?Number(commentDraft.commentsPerPackage):null,buyUnitPrice:commentDraft.buyUnitPrice===''||commentDraft.buyUnitPrice===null?null:commentDraft.buyUnitPrice,sellUnitPrice:commentDraft.sellUnitPrice===''||commentDraft.sellUnitPrice===null?null:commentDraft.sellUnitPrice,includedNote:commentDraft.includedNote}]);setCommentDraft({phase:'',vendor:'',scopeNote:'',mode:'per_comment',quantity:'',commentsPerPackage:'',buyUnitPrice:'',sellUnitPrice:'',includedNote:''});}}>Thêm dòng comment vào phương án</button>
        {commentLines.length>0&&<ul className="text-xs space-y-1">{commentLines.map((c:any,idx:number)=><li key={idx} className="flex flex-wrap gap-2 items-center bg-slate-50 border rounded-lg px-2 py-1"><span><strong>{c.vendor}</strong> · {c.phase} · {c.pricingMode==='package'?`${c.quantity.toLocaleString('vi-VN')} gói × ${(c.commentsPerPackage??0).toLocaleString('vi-VN')} comment/gói = ${(c.quantity*(c.commentsPerPackage??0)).toLocaleString('vi-VN')} comment`:c.quantity.toLocaleString('vi-VN')+' comments'} · mua: {c.buyUnitPrice==null?'chưa có giá':money(c.buyUnitPrice*c.quantity)} · bán: {c.sellUnitPrice==null?'chưa nhập':money(c.sellUnitPrice*c.quantity)}</span><button type="button" className="text-red-700 underline" onClick={()=>setCommentLines(prev=>prev.filter((_,i)=>i!==idx))}>Bỏ</button></li>)}</ul>}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <input aria-label="Tên phương án tạo từ phân bổ" className={field+' sm:w-72'} maxLength={200} value={fromName} onChange={e=>setFromName(e.target.value)} placeholder="Tên phương án, VD: Phương án A — phân bổ R1"/>
        <button type="button" className="border rounded-lg px-3 py-2 text-sm bg-white" disabled={busy||dirty||!fromPhaseIds.length} onClick={()=>run(async()=>{const r=await request(base+'/options/suggest-allocations',{phaseIds:fromPhaseIds});const next:Record<string,number>={};for(const a of r.allocations??[])next[a.shortlistId+':'+a.key]=a.quantity;setAlloc(prev=>({...prev,...next}));setNotice(`Đã điền GỢI Ý phân bổ (${(r.allocations??[]).length} dòng) vào biểu phân bổ bên trên — đây mới là bản nháp gợi ý, chưa áp dụng. Kiểm tra, sửa số lượng rồi bấm “Tạo phương án từ phân bổ đã chọn”.`);})}>Gợi ý phân bổ (xem trước, không tự áp dụng)</button>
        <button type="button" className={button} disabled={busy||dirty||!fromPhaseIds.length||!fromName.trim()} onClick={()=>run(async()=>{
          const allocations=Object.entries(alloc).filter(([,q])=>q>0).map(([k,q])=>{const [shortlistId,...rest]=k.split(':');return {shortlistId,key:rest.join(':'),quantity:q};}).filter(a=>{const row=shortlistRows.find(r=>r.id===a.shortlistId);const phId=row?.phaseId??phases[0]?.id;return phId&&fromPhaseIds.includes(phId);});
          if(!allocations.length&&!commentLines.length){setError('Hãy phân bổ ít nhất một đối tác/dịch vụ (số lượng lớn hơn 0) hoặc thêm một dòng dịch vụ comment trước khi tạo phương án.');return;}
          const r=await request(base+'/options/from-phases',{name:fromName.trim(),allocations,commentLines});
          const mismatches=(r.reconciliation??[]).filter((x:any)=>x.difference!==0).map((x:any)=>`${x.phase} — ${x.label}: đã phân bổ ${x.allocated.toLocaleString('vi-VN')} / mục tiêu ${x.target.toLocaleString('vi-VN')} (${x.difference<0?'thiếu':'vượt'} ${Math.abs(x.difference).toLocaleString('vi-VN')})`);
          await refresh(r.quoteId);setAlloc({});setCommentLines([]);
          setNotice(`Đã tạo phương án từ phân bổ của PM: ${r.itemCount} dòng báo giá.${r.missingPrice?` ${r.missingPrice} dòng đang thiếu giá đầu vào.`:''}${r.unconfirmedPrice?` ${r.unconfirmedPrice} dòng giá chưa xác nhận.`:''}${mismatches.length?' Đối chiếu mục tiêu — '+mismatches.join('; ')+'.':' Đối chiếu mục tiêu: các hạng mục đã phân bổ khớp mục tiêu.'} Điền giá bán rồi lưu.`);
        })}>Tạo phương án từ phân bổ đã chọn</button>
      </div>
    </section>}
    {data.options.length===0?<p className="p-5 border border-dashed rounded-xl text-slate-500">Chưa có phương án. PM/Admin bổ sung thông tin chiến dịch rồi tạo phương án đầu tiên.</p>:<>
      <div className="flex gap-2 flex-wrap">{data.options.map((o:any)=><button key={o.id} className={'border px-3 py-2 rounded-lg text-sm '+(optionId===o.id?'bg-indigo-50 border-indigo-500 text-indigo-800':'bg-white')} onClick={()=>choose(o.versions[0])}>{o.name}{o.versions.some((q:any)=>q.id===data.baselineId)?' · Đã chốt':''}</button>)}</div>
      {quote&&<section className="space-y-4"><p className="text-sm text-indigo-800">Đã chọn {new Set(items.filter(i=>i.included&&i.kind==='kol').map(i=>i.shortlistId||i.creator)).size} KOL · {new Set(items.filter(i=>i.included&&i.kind==='community').map(i=>i.shortlistId||i.creator)).size} Community · {items.filter(i=>i.included).reduce((n,i)=>n+i.quantity,0)} đơn vị hạng mục.</p>
        <div className="flex flex-wrap items-end gap-3"><label className="text-sm">Phiên bản<select aria-label="Phiên bản báo giá" className={field} value={quote.id} onChange={e=>choose(currentOption.versions.find((q:any)=>q.id===e.target.value))}>{currentOption.versions.map((q:any)=><option key={q.id} value={q.id}>V{q.number} — {statusLabel[q.status]}</option>)}</select></label><p className="text-sm text-slate-500">{currentOption.brief}</p></div>
        {!manage&&<p className="text-sm bg-indigo-50 p-3 rounded-lg">Bạn đang xem giá đầu vào. Giá bán, phí và P&L chỉ dành cho PM/Admin.</p>}
        {manage&&data.target&&<p className="text-sm text-slate-600">Mục tiêu brief: {data.target.count??'Chưa đặt'} KOL · Ngân sách: {money(data.target.budget)} · {quote.finance?.totalWithTax==null?'Chưa đủ giá để đối chiếu':data.target.budget==null?'Chưa đặt ngân sách':quote.finance.totalWithTax>data.target.budget?'Vượt ngân sách '+money(quote.finance.totalWithTax-data.target.budget):'Còn trong ngân sách '+money(data.target.budget-quote.finance.totalWithTax)} (so với tổng sau thuế của bản đã lưu).</p>}
        {editable&&manage&&items.some(i=>i.shortlistId)&&<button className="border rounded-lg px-3 py-2 text-sm" disabled={busy||dirty} onClick={()=>{if(window.confirm('Lấy giá đầu vào và trạng thái xác nhận mới nhất từ danh sách KOL vào bản nháp này? Giá bán và số lượng giữ nguyên.'))run(async()=>{const r=await request(`${base}/quotes/${quote.id}/refresh-prices`,{revision:quote.revision});await refresh();setNotice(`Đã lấy giá mới cho ${r.updated} dòng.${r.missingPrice?` Còn ${r.missingPrice} dòng thiếu giá đầu vào.`:''}${r.unconfirmedPrice?` Còn ${r.unconfirmedPrice} dòng giá chưa xác nhận — cần Booking xác nhận trong danh sách KOL.`:''} Kiểm tra lại P&L trước khi duyệt.`);});}}>Lấy lại giá KOL mới nhất vào bản nháp</button>}
        {editable&&manage&&<button className={button} onClick={()=>{setItems(prev=>[...prev,{id:crypto.randomUUID(),creator:'',description:'',phase:'',kind:'kol',quantity:1,buyUnitPrice:null,sellUnitPrice:null,included:true}]);setDirty(true);}}>+ Thêm KOL / Chi phí trực tiếp</button>}
        <div className="overflow-x-auto border rounded-xl"><table className="w-full text-sm min-w-[750px]"><thead className="bg-slate-100"><tr><th className="p-3">Chọn</th><th className="p-3 text-left">KOL / Hạng mục</th><th className="p-3">Số lượng</th><th className="p-3">Giá đầu vào / đơn vị</th>{manage&&<><th className="p-3">Giá báo khách / đơn vị</th><th className="p-3">Chênh lệch dòng</th></>}</tr></thead><tbody>{items.map(i=><tr key={i.id} className="border-t align-top">
          <td className="p-3"><input aria-label={'Tính hạng mục '+(i.creator||'mới')} type="checkbox" checked={i.included} disabled={!editable||!manage} onChange={e=>updateItem(i.id,'included',e.target.checked)}/></td>
          <td className="p-3 space-y-2 min-w-64"><input aria-label="Tên KOL hoặc hạng mục" placeholder="Tên KOL / Buzz / Seeding" className={field} value={i.creator} disabled={!editable||!manage||Boolean(i.shortlistId)} onChange={e=>updateItem(i.id,'creator',e.target.value)}/><input aria-label="Mô tả SOW" placeholder="SOW: 1 video review, 2 clip ngắn…" className={field} value={i.description} disabled={!editable||!manage} onChange={e=>updateItem(i.id,'description',e.target.value)}/>{manage&&<textarea aria-label={'Ghi chú hạng mục '+(i.creator||'mới')} placeholder="Ghi chú hạng mục — XUẤT CHO KHÁCH: phạm vi/điều kiện của dòng này (để trống thì không hiển thị)" className={field+' text-xs whitespace-pre-line'} rows={2} value={i.note??''} disabled={!editable} onChange={e=>updateItem(i.id,'note',e.target.value)}/>}<div className="flex gap-2"><select aria-label="Loại chi phí" className={field} value={i.kind} disabled={!editable||!manage||Boolean(i.shortlistId)} onChange={e=>updateItem(i.id,'kind',e.target.value)}><option value="kol">KOL</option><option value="community">Community</option><option value="buzz">Buzz</option><option value="seeding">Seeding</option><option value="production">Sản xuất</option><option value="other">Khác</option></select><input aria-label="Phase" placeholder="Phase / Pillar" className={field} value={i.phase} disabled={!editable||!manage} onChange={e=>updateItem(i.id,'phase',e.target.value)}/></div>{(i.serviceName||i.unit||i.conditions)&&<p className="text-xs text-slate-500">{i.partnerType==='community'?'Community':i.partnerType==='service'?'Dịch vụ thuê ngoài':''}{i.serviceName?` · Dịch vụ: ${i.serviceName}`:''}{i.unit?` · Đơn vị: ${i.unit}`:''}{i.conditions?` · Điều kiện: ${i.conditions}`:''}</p>}{isCommentLine(i)&&<div className="text-xs text-slate-500 space-y-1"><p>Comment thuê ngoài — tổng mục tiêu của brief: {i.commentInfo?.briefTargetTotal!=null?i.commentInfo.briefTargetTotal.toLocaleString('vi-VN')+' comments':'chưa đặt'}; số mua ở dòng này do PM chọn, không tự lấy theo mục tiêu.{i.commentInfo?.includedNote?` Gói đã bao gồm: ${i.commentInfo.includedNote} — phần đã gồm không cộng trùng.`:''}</p>{isCommentPkg(i)?<p>Cách tính: <strong>theo gói</strong> — {i.quantity.toLocaleString('vi-VN')} gói × {i.commentInfo?.commentsPerPackage?i.commentInfo.commentsPerPackage.toLocaleString('vi-VN')+' comment/gói':'Chưa xác định số comment/gói'} = {i.commentInfo?.commentsPerPackage?(i.quantity*i.commentInfo.commentsPerPackage).toLocaleString('vi-VN')+' comment thuê':'Chưa xác định khối lượng comment'}. Thành tiền = số gói × giá gói (không nhân số comment vào giá gói).</p>:i.commentInfo?.pricingMode==='per_comment'||(!i.commentInfo?.pricingMode&&i.unit==='comment')?<p>Cách tính: <strong>theo comment</strong> — {i.quantity.toLocaleString('vi-VN')} comment thuê × đơn giá/comment.</p>:<p>Cách tính: <strong>Chưa xác định</strong> — vui lòng chọn cách tính bên dưới (theo gói hoặc theo comment).</p>}{isCommentPkg(i)&&(!(i.commentInfo?.commentsPerPackage&&i.commentInfo.commentsPerPackage>=1)||!i.commentInfo?.scopeNote?.trim())&&<p className="text-amber-700 font-medium">Gói comment còn thiếu {!(i.commentInfo?.commentsPerPackage&&i.commentInfo.commentsPerPackage>=1)?'số comment bao gồm trong mỗi gói':''}{(!(i.commentInfo?.commentsPerPackage&&i.commentInfo.commentsPerPackage>=1)&&!i.commentInfo?.scopeNote?.trim())?' và ':''}{!i.commentInfo?.scopeNote?.trim()?'ghi chú phạm vi':''} — bổ sung ngay bên dưới trước khi gửi duyệt; hệ thống không tự suy đoán.</p>}{!isCommentPkg(i)&&!i.commentInfo?.pricingMode&&(!i.unit||!/^comment$/i.test(i.unit.trim()))&&<p className="text-amber-700 font-medium">Dòng comment chưa có cách tính (theo gói hoặc theo comment) — bổ sung bên dưới trước khi gửi duyệt.</p>}{manage&&editable&&<div className="grid grid-cols-3 gap-1"><label className="block">Cách tính<select aria-label={'Cách tính comment '+(i.creator||'mới')} className={field+' mt-0.5'} value={isCommentPkg(i)?'package':i.commentInfo?.pricingMode==='per_comment'?'per_comment':''} onChange={e=>{const m=e.target.value as 'package'|'per_comment'|'';updateItem(i.id,'commentInfo',{...(i.commentInfo??{briefTargetTotal:null,scopeNote:'',includedNote:''}),...(m?{pricingMode:m}:{})});if(m==='package')updateItem(i.id,'unit','gói');else if(m==='per_comment')updateItem(i.id,'unit','comment');}}><option value="">-- Chọn cách tính --</option><option value="package">Theo gói</option><option value="per_comment">Theo comment</option></select></label>{isCommentPkg(i)&&<label className="block">Số comment trong mỗi gói<input aria-label={'Số comment mỗi gói '+(i.creator||'mới')} className={field+' mt-0.5'} type="number" min={1} step={1} value={i.commentInfo?.commentsPerPackage??''} placeholder="Bắt buộc với gói" onChange={e=>updateItem(i.id,'commentInfo',{...i.commentInfo,commentsPerPackage:e.target.value===''?null:Number(e.target.value)})}/></label>}<label className={isCommentPkg(i)?"block":"block col-span-2"}>Phạm vi áp dụng (ghi chú phạm vi)<input aria-label={'Phạm vi dòng comment '+(i.creator||'mới')} className={field+' mt-0.5'} value={i.commentInfo?.scopeNote??''} placeholder="VD: Phân bổ trên 100 bài trong tháng 11" maxLength={1000} onChange={e=>updateItem(i.id,'commentInfo',{...i.commentInfo,scopeNote:e.target.value})}/></label></div>}</div>}{manage&&editable&&<label className="block text-xs text-slate-500">Đã nghiệm thu (số lượng thực tế, nếu đã triển khai)<input aria-label={'Số lượng nghiệm thu '+(i.creator||'mới')} className={field+' mt-1'} type="number" min={0} step={1} value={i.acceptedQty??''} placeholder="Chưa nghiệm thu" onChange={e=>updateItem(i.id,'acceptedQty',e.target.value===''?null:Number(e.target.value))}/></label>}</td>
          <td className="p-3 w-24"><input aria-label="Số lượng hạng mục" type="number" min={1} step={1} className={field} value={i.quantity} disabled={!editable||!manage} onChange={e=>updateItem(i.id,'quantity',Number(e.target.value))}/></td>
          <td className="p-3 min-w-40"><input aria-label={'Giá đầu vào '+(i.creator||'mới')} className={field} inputMode="numeric" placeholder="Chưa có giá" disabled={!editable||Boolean(i.shortlistId)} value={formatMoneyInput(i.buyUnitPrice??'')} onChange={e=>{const n=parseMoneyInput(e.target.value);updateItem(i.id,'buyUnitPrice',n===''?null:n);}}/><p className="text-xs text-slate-500 mt-2">{i.shortlistId?(i.buyUnitPrice===null?'Chưa có giá đầu vào · ':i.priceSnapshot?.status==='confirmed'?`Đã xác nhận${i.priceSnapshot.source?' · nguồn: '+i.priceSnapshot.source:''} · `:'Giá đầu vào chưa xác nhận · '):needsConfirm(i)?(i.buyUnitPrice===null?'Chưa có giá đầu vào · ':manualBuyConfirmed(i)?`Đã xác nhận giá đầu vào · nguồn: ${i.buyConfirmation!.source}${i.buyConfirmation!.checkedByName?' · '+i.buyConfirmation!.checkedByName:''} · ${formatDateTimeVN(i.buyConfirmation!.checkedAt)} · `:i.buyConfirmation?'Giá đã thay đổi sau khi xác nhận — cần xác nhận lại · ':'Giá đầu vào chưa xác nhận · '):''}Thành tiền: {i.buyUnitPrice===null?'Chờ giá':money(i.buyUnitPrice*i.quantity)}</p>{editable&&!i.shortlistId&&needsConfirm(i)&&i.buyUnitPrice!==null&&!manualBuyConfirmed(i)&&<div className="mt-2 space-y-1">{dirty?<p className="text-xs text-amber-700">Lưu báo giá trước, rồi xác nhận giá của dòng nhập tay này.</p>:<div className="flex gap-1"><input aria-label={'Nguồn kiểm tra giá '+(i.creator||'mới')} className={field+' text-xs'} placeholder="Nguồn kiểm tra giá…" maxLength={200} value={confirmSources[i.id]??''} onChange={e=>setConfirmSources(prev=>({...prev,[i.id]:e.target.value}))}/><button type="button" className="border rounded-lg px-2 py-1 text-xs whitespace-nowrap bg-white" disabled={busy} onClick={()=>{const src=(confirmSources[i.id]??'').trim();if(!src){setError('Nhập nguồn kiểm tra giá trước khi xác nhận.');return;}run(async()=>{const r=await request(`${base}/quotes/${quote.id}/confirm-buy`,{itemId:i.id,source:src,revision:quote.revision});await refresh(r.quote.id);setNotice(`Đã xác nhận giá đầu vào cho dòng “${i.creator||'dòng nhập tay'}”.`);});}}>Xác nhận giá</button></div>}</div>}{costCell(i)}</td>
          {manage&&<td className="p-3 min-w-40"><input aria-label={'Giá báo khách '+(i.creator||'mới')} className={field} inputMode="numeric" placeholder="PM nhập giá bán" disabled={!editable} value={formatMoneyInput(i.sellUnitPrice??'')} onChange={e=>{const n=parseMoneyInput(e.target.value);updateItem(i.id,'sellUnitPrice',n===''?null:n);}}/><p className="text-xs text-slate-500 mt-2">Thành tiền: {i.sellUnitPrice==null?'Chưa có giá bán':money(i.sellUnitPrice*i.quantity)}</p></td>}{manage&&<td className="p-3 min-w-36">{i.buyUnitPrice===null||i.sellUnitPrice==null?'Chưa đủ giá':money((i.sellUnitPrice-i.buyUnitPrice)*i.quantity)}</td>}
        </tr>)}</tbody></table>{items.length===0&&<p className="p-6 text-slate-500">Chưa có hạng mục. Thêm dòng hoặc lấy từ báo giá cũ nếu bạn là Admin.</p>}</div>
        {manage&&<div className="grid sm:grid-cols-3 gap-3"><label className="text-sm">Chiết khấu khách hàng<select aria-label="Cách chiết khấu" className={field} disabled={!editable} value={discount.mode} onChange={e=>{setDiscount({mode:e.target.value,value:0});setDirty(true);}}><option value="fixed">Số tiền VND</option><option value="percent">Phần trăm</option></select><input aria-label="Giá trị chiết khấu" className={field} disabled={!editable} inputMode="decimal" value={discount.mode==='fixed'?formatMoneyInput(discount.value):discount.value} onChange={e=>{setDiscount({...discount,value:discount.mode==='fixed'?(parseMoneyInput(e.target.value)||0):Number(e.target.value)});setDirty(true);}}/></label>
          <label className="text-sm">Agency fee — sau chiết khấu<select aria-label="Cách tính agency fee" className={field} disabled={!editable} value={fee.mode} onChange={e=>{setFee({mode:e.target.value,value:0});setDirty(true);}}><option value="percent">Phần trăm</option><option value="fixed">Số tiền VND</option></select><input aria-label="Giá trị agency fee" className={field} inputMode="decimal" disabled={!editable} value={fee.mode==='fixed'?formatMoneyInput(fee.value):fee.value} onChange={e=>{setFee({...fee,value:fee.mode==='fixed'?(parseMoneyInput(e.target.value)||0):Number(e.target.value)});setDirty(true);}}/></label>
          <label className="text-sm">Thuế suất (%) — PM xác nhận<input aria-label="Thuế suất" type="number" min={0} max={100} step="0.01" className={field} value={tax} disabled={!editable} onChange={e=>{setTax(Number(e.target.value));setDirty(true);}}/><span className="text-xs text-slate-500">Không mặc định áp dụng mức thuế cho mọi dự án.</span></label>
        </div>}
        {manage&&['draft','changes_requested','submitted'].includes(quote.status)&&(()=>{const g=priceProblems(items);return g.lines>0?<p className="text-sm bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-lg">Còn {g.lines} dòng cần xử lý trước khi gửi duyệt, duyệt hoặc chốt{g.missingBuy?` · thiếu giá đầu vào: ${g.missingBuy} dòng`:''}{g.unconfirmedBuy?` · giá đầu vào chưa xác nhận: ${g.unconfirmedBuy} dòng`:''}{g.missingSell?` · thiếu giá bán: ${g.missingSell} dòng`:''}{g.incompletePackages?` · gói comment thiếu số comment mỗi gói hoặc ghi chú phạm vi: ${g.incompletePackages} dòng (bổ sung ngay trong dòng dịch vụ)`:''}. Dòng không được tính vào báo giá (bỏ chọn) không gây chặn.</p>:null;})()}
        {manage&&quote&&!editable&&(()=>{const g=priceProblems(items);return g.lines>0?<p className="text-sm bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-lg">Phiên bản V{quote.number} ({statusLabel[quote.status]}) còn {g.lines} dòng chưa đạt điều kiện giá hiện tại — có thể do dữ liệu cũ chưa có thông tin xác nhận giá đầu vào. Phiên bản đã gửi/duyệt/chốt không sửa được: hãy bấm “Tạo phiên bản mới” để bổ sung xác nhận giá rồi gửi duyệt lại.</p>:null;})()}
        <div className="flex flex-wrap gap-2">
          {editable&&<button className={button} disabled={busy||!dirty} onClick={()=>run(save)}>Lưu {manage?'báo giá':'giá đầu vào'}</button>}
          <button className="border px-3 py-2 rounded-lg text-sm" disabled={busy} onClick={()=>{if(!dirty||window.confirm('Bỏ các chỉnh sửa chưa lưu và tải lại?'))run(()=>refresh());}}>Tải lại dữ liệu</button>
          {manage&&<><button className="border px-3 py-2 rounded-lg text-sm" disabled={busy||dirty} onClick={()=>run(async()=>{const d=await request(`${base}/quotes/${quote.id}/new-version`,{});await refresh(d.quoteId);setNotice('Đã tạo phiên bản mới; bản trước được giữ nguyên.');})}>Tạo phiên bản mới</button>
            {editable&&<button className={button} disabled={busy||dirty} onClick={()=>run(async()=>{await request(`${base}/quotes/${quote.id}/status`,{status:'submitted',revision:quote.revision});await refresh();})}>Gửi duyệt</button>}
            {quote.status==='submitted'&&<><button className={button} disabled={busy} onClick={()=>run(async()=>{await request(`${base}/quotes/${quote.id}/status`,{status:'approved',revision:quote.revision});await refresh();})}>Duyệt báo giá</button><button className="border px-3 py-2 rounded-lg" disabled={busy} onClick={()=>run(async()=>{await request(`${base}/quotes/${quote.id}/status`,{status:'changes_requested',revision:quote.revision});await refresh();})}>Yêu cầu chỉnh sửa</button></>}
            {quote.status==='approved'&&<><button className={button} disabled={busy||data.baselineId===quote.id} onClick={()=>{if(window.confirm('Xác nhận khách đã chọn phương án này? Đây sẽ là baseline duy nhất của dự án.'))run(async()=>{await request(`${base}/quotes/${quote.id}/select`,{});await refresh();setNotice('Đã chốt phương án và phiên bản cho dự án.');});}}>Chốt phương án khách chọn</button><button className="border rounded-lg px-3 py-2" disabled={busy} onClick={()=>run(async()=>setCustomer(await request(`${base}/quotes/${quote.id}/customer`)))}>Xem bản báo khách</button></>}
          </>}
        </div>
        {dirty&&<p className="text-sm text-amber-800">Có chỉnh sửa chưa lưu. Tổng phía dưới là kết quả của bản đã lưu gần nhất.</p>}
        {manage&&quote.finance&&<section className="bg-indigo-50 border border-indigo-100 rounded-xl p-5"><h3 className="font-bold mb-3">P&L dự kiến — {currentOption.name} / V{quote.number}</h3><div className="grid sm:grid-cols-2 gap-2 text-sm">{[['Tổng hạng mục báo khách',quote.finance.knownSellTotal],['Chiết khấu khách hàng',quote.finance.discount],['Cơ sở tính agency fee',quote.finance.feeBase],['Agency fee',quote.finance.agencyFee],['Doanh thu trước thuế',quote.finance.revenueBeforeTax],['Chi phí đầu vào đã biết',quote.finance.knownBuyTotal],['Lợi nhuận dự kiến',quote.finance.profit],['Thuế',quote.finance.tax],['Tổng khách thanh toán',quote.finance.totalWithTax]].map(([label,value])=><div key={label as string} className="flex justify-between gap-4"><span>{label}</span><strong>{money(value as number|null)}</strong></div>)}</div><p className="text-sm mt-3">Biên lợi nhuận: {quote.finance.marginPercent===null?'Chưa đủ dữ liệu':quote.finance.marginPercent.toLocaleString('vi-VN',{maximumFractionDigits:2})+'%'} · Thiếu giá mua: {quote.finance.missingBuy} · Thiếu giá bán: {quote.finance.missingSell} · Giá đầu vào chưa xác nhận: {priceProblems(quote.items??[]).unconfirmedBuy}</p><p className="text-xs text-slate-500 mt-2">P&L từng phương án không cộng dồn. Chi phí thực tế, hợp đồng và thanh toán sẽ được bổ sung ở bước sau.</p></section>}
        {isAdmin&&editable&&<section className="border rounded-xl p-4 space-y-3"><h3 className="font-semibold">Lấy hạng mục từ SOW cũ trên trình duyệt</h3><p className="text-xs text-slate-500">Chỉ sao chép vào phương án đang mở, không xóa bản cũ. Giữ giá SOW cũ là giá báo khách; giá đầu vào để trống chờ xác nhận. Không sao chép chiết khấu/phụ phí cũ tự động.</p><select aria-label="Chọn báo giá cũ" className={field} value={legacyId} onChange={e=>setLegacyId(e.target.value)}><option value="">Chọn báo giá cũ…</option>{legacyQuotes.map(q=><option key={q.id} value={q.id}>{q.tenChienDich} — {q.maBaoGia}</option>)}</select><button className="border rounded-lg px-3 py-2 text-sm" disabled={!legacyId||busy} onClick={()=>{const old=legacyQuotes.find(q=>q.id===legacyId);if(!old)return;setItems(prev=>[...prev,...old.items.map(i=>({id:crypto.randomUUID(),creator:i.kolName,description:i.formatLabel+(i.ghiChu?' · '+i.ghiChu:''),phase:'',kind:'kol',quantity:i.soLuong,buyUnitPrice:null,sellUnitPrice:i.donGia,included:true}))]);setDirty(true);setLegacyId('');setNotice('Đã lấy các dòng vào bản nháp. Kiểm tra rồi bấm Lưu báo giá.');}}>Lấy hạng mục vào phương án này</button></section>}
        {customer&&<section className="border rounded-xl p-5 bg-white"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">Bản xem trước báo khách</h3><button type="button" className={button} onClick={()=>setShowPrint(true)}>In / Lưu PDF</button></div><p>{customer.client} · {customer.campaign} · V{customer.version}</p><table className="w-full text-sm mt-4"><thead><tr className="border-b"><th className="text-left">Hạng mục</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead><tbody>{customerGroups.map((g:any)=>{return <React.Fragment key={g.phase||'__'}>{(g.showHeader)&&<tr className="bg-slate-50"><td colSpan={4} className="py-2 font-semibold">{g.phase?('Phase: '+g.phase):'Hạng mục khác'}</td></tr>}{g.items.map((i:any,index:number)=><tr key={index} className="border-b"><td className="py-2">{i.creator} — {i.description}{i.note&&<span className="block text-xs text-slate-500 whitespace-pre-line mt-0.5">{i.note}</span>}{i.commentsIncluded!==undefined&&<span className="block text-xs text-slate-500 mt-0.5">Tổng số comment bao gồm: {i.commentsIncluded!==null?i.commentsIncluded.toLocaleString('vi-VN'):'Chưa xác định'}{i.scopeNote?` · Phạm vi: ${i.scopeNote}`:''}</span>}</td><td className="text-center">{i.quantity}{i.unit?' '+i.unit:''}</td><td className="text-center">{money(i.sellUnitPrice)}</td><td className="text-right">{money(i.total)}</td></tr>)}{(g.showHeader)&&<tr className="border-b"><td colSpan={3} className="py-1 text-right text-xs text-slate-500">Tiểu tổng {g.phase||'nhóm'}:</td><td className="py-1 text-right font-medium">{money(g.subtotal)}</td></tr>}</React.Fragment>})}</tbody></table><div className="mt-4 text-sm text-right"><p>Chiết khấu: {money(customer.discount)}</p><p>Agency fee: {money(customer.agencyFee)}</p><p>Trước thuế: {money(customer.revenueBeforeTax)}</p><p>Thuế: {money(customer.tax)}</p><strong>Tổng thanh toán: {money(customer.totalWithTax)}</strong></div></section>}
        {costItem&&quote&&<CostSourceDialog projectId={projectId} quoteId={quote.id} revision={quote.revision} item={costItem} onClose={()=>setCostItemId(null)} onApplied={async()=>{setCostItemId(null);await refresh(quote.id);setNotice('Đã áp dụng nguồn chi phí cho dòng. Số liệu là snapshot — hồ sơ/hợp đồng đổi sau này không tự đổi dòng đã lưu.');}}/>}
        {showPrint&&customer&&<div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto print:bg-white print:overflow-visible">
          <style>{`@media print{body *{visibility:hidden}.quote-print-doc,.quote-print-doc *{visibility:visible}.quote-print-doc{position:absolute;inset:0;padding:0!important}@page{margin:14mm}}`}</style>
          <div className="min-h-full py-6 px-3">
            <div className="max-w-3xl mx-auto mb-3 flex justify-between items-center print:hidden">
              <span className="text-white font-semibold text-sm">Bản in báo giá — {customer.campaign} · V{customer.version}</span>
              <span className="flex gap-2"><button type="button" className={button} onClick={()=>window.print()}>In / Lưu PDF</button><button type="button" className="rounded-lg bg-white px-3 py-2 text-sm font-semibold" onClick={()=>setShowPrint(false)}>Đóng</button></span>
            </div>
            <div className="quote-print-doc max-w-3xl mx-auto bg-white text-slate-800 p-8 sm:p-10 shadow print:shadow-none">
              <h1 className="text-xl font-bold">BÁO GIÁ CHIẾN DỊCH</h1>
              <p className="text-sm mt-1">Khách hàng: <strong>{customer.client}</strong> · Chiến dịch: <strong>{customer.campaign}</strong> · Phiên bản: V{customer.version}</p>
              <table className="w-full text-sm mt-5">
                <thead><tr className="border-b-2 border-slate-700"><th className="text-left py-2">Hạng mục</th><th className="py-2">SL</th><th className="py-2">Đơn giá</th><th className="text-right py-2">Thành tiền</th></tr></thead>
                <tbody>{customerGroups.map((g:any)=>{return <React.Fragment key={g.phase||'__'}>{(g.showHeader)&&<tr className="bg-slate-100"><td colSpan={4} className="py-2 px-1 font-semibold">{g.phase?('Phase: '+g.phase):'Hạng mục khác'}</td></tr>}{g.items.map((i:any,index:number)=><tr key={index} className="border-b border-slate-200"><td className="py-2">{i.creator} — {i.description}{i.note&&<span className="block text-xs text-slate-500 whitespace-pre-line mt-0.5">{i.note}</span>}{i.commentsIncluded!==undefined&&<span className="block text-xs text-slate-500 mt-0.5">Tổng số comment bao gồm: {i.commentsIncluded!==null?i.commentsIncluded.toLocaleString('vi-VN'):'Chưa xác định'}{i.scopeNote?` · Phạm vi: ${i.scopeNote}`:''}</span>}</td><td className="text-center">{i.quantity}{i.unit?' '+i.unit:''}</td><td className="text-center">{money(i.sellUnitPrice)}</td><td className="text-right">{money(i.total)}</td></tr>)}{(g.showHeader)&&<tr className="border-b border-slate-200"><td colSpan={3} className="py-1 text-right text-xs text-slate-500">Tiểu tổng {g.phase||'nhóm'}:</td><td className="py-1 text-right font-medium">{money(g.subtotal)}</td></tr>}</React.Fragment>})}</tbody>
              </table>
              <div className="mt-5 text-sm text-right space-y-1">
                <p>Chiết khấu: {money(customer.discount)}</p>
                <p>Agency fee: {money(customer.agencyFee)}</p>
                <p>Trước thuế: {money(customer.revenueBeforeTax)}</p>
                <p>Thuế ({customer.taxRate}%): {money(customer.tax)}</p>
                <p className="text-base"><strong>Tổng thanh toán: {money(customer.totalWithTax)}</strong></p>
              </div>
            </div>
          </div>
        </div>}
      </section>}
    </>}
  </div>;
}
