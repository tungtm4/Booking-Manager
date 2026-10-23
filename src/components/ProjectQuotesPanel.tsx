import React,{useEffect,useRef,useState} from 'react';
import {formatMoneyInput,parseMoneyInput} from '../utils/moneyInput';
import {formatDateTimeVN} from '../utils/formatters';
import {StorageService} from '../services/storageService';

type Item={id:string;creator:string;description:string;phase:string;kind:string;quantity:number;buyUnitPrice:number|null;sellUnitPrice?:number|null;included:boolean;shortlistId?:string;format?:string;priceSnapshot?:any;buyConfirmation?:{value:number;source:string;checkedByName:string;checkedAt:string}};
async function request(path:string,body?:unknown){
  const r=await fetch('/api/workspace'+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const d=await r.json();if(r.status===401)window.dispatchEvent(new Event('workspace_session_expired'));if(!r.ok)throw new Error(d.message||'Không thực hiện được yêu cầu.');return d;
}
const field='w-full rounded-lg border border-slate-300 px-3 py-2 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-300 outline-none';
const button='rounded-lg bg-indigo-600 text-white px-3 py-2 font-semibold text-sm disabled:opacity-50';
const statusLabel:Record<string,string>={draft:'Bản nháp',submitted:'Chờ duyệt',approved:'Đã duyệt',changes_requested:'Cần chỉnh sửa'};
const money=(v:number|null|undefined)=>v==null?'Chưa đủ dữ liệu':formatMoneyInput(v)+' ₫';
// Vấn đề giá của các dòng ĐƯỢC TÍNH vào báo giá (dòng bỏ chọn không gây chặn).
// Khớp quy tắc ở server: mọi dòng KOL phải có giá đầu vào đã xác nhận — dòng từ danh sách
// xét theo priceSnapshot, dòng nhập tay xét theo buyConfirmation còn khớp giá hiện tại.
function manualBuyConfirmed(i:Item){const c=i.buyConfirmation;return !!c&&c.value===i.buyUnitPrice;}
function priceProblems(list:Item[]){
  let lines=0,missingBuy=0,missingSell=0,unconfirmedBuy=0;
  for(const i of list){
    if(!i.included)continue;let bad=false;
    if(i.buyUnitPrice===null){missingBuy++;bad=true;}
    if(i.sellUnitPrice==null){missingSell++;bad=true;}
    if(i.buyUnitPrice!==null&&i.kind==='kol'){
      if(i.priceSnapshot){if(i.priceSnapshot.status!=='confirmed'){unconfirmedBuy++;bad=true;}}
      else if(!manualBuyConfirmed(i)){unconfirmedBuy++;bad=true;}
    }
    if(bad)lines++;
  }
  return {lines,missingBuy,missingSell,unconfirmedBuy};
}

export function ProjectQuotesPanel({projectId,isAdmin,onProjectChanged}:{projectId:string;isAdmin:boolean;onProjectChanged:()=>Promise<void>}){
  const [data,setData]=useState<any>(null),[quote,setQuote]=useState<any>(null),[items,setItems]=useState<Item[]>([]);
  const [discount,setDiscount]=useState<any>({mode:'fixed',value:0}),[fee,setFee]=useState<any>({mode:'percent',value:0}),[tax,setTax]=useState(0);
  const [optionId,setOptionId]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[dirty,setDirty]=useState(false);
  const [customer,setCustomer]=useState<any>(null),[legacyId,setLegacyId]=useState('');
  const [phases,setPhases]=useState<any[]>([]),[fromName,setFromName]=useState(''),[fromPhaseIds,setFromPhaseIds]=useState<string[]>([]),[showPrint,setShowPrint]=useState(false);
  const [loadState,setLoadState]=useState<'loading'|'ready'|'error'>('loading'),[loadError,setLoadError]=useState('');
  const [confirmSources,setConfirmSources]=useState<Record<string,string>>({});
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
      <h3 className="font-semibold">Tạo phương án từ các phase (Đợt 9B)</h3>
      <p className="text-xs text-slate-500">Sinh sẵn các dòng báo giá từ danh sách KOL và brief của từng phase: brief “mỗi KOL” lấy đúng số lượng; brief “tổng toàn phase” chia tổng cho các KOL (phần dư cho các KOL đầu danh sách). Giá đầu vào lấy từ danh sách của phase — dòng thiếu giá vẫn được tạo để PM biết, nhưng báo giá chỉ gửi duyệt được khi giá đã xác nhận đủ. Giá bán để trống cho PM điền.</p>
      <div className="flex flex-wrap gap-2">
        {phases.map((ph:any)=><label key={ph.id} className="flex items-center gap-1 text-sm bg-white border rounded-lg px-2 py-1"><input type="checkbox" checked={fromPhaseIds.includes(ph.id)} onChange={()=>setFromPhaseIds(prev=>prev.includes(ph.id)?prev.filter(x=>x!==ph.id):[...prev,ph.id])}/>{ph.name}</label>)}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <input aria-label="Tên phương án tạo từ phase" className={field+' sm:w-72'} maxLength={200} value={fromName} onChange={e=>setFromName(e.target.value)} placeholder="Tên phương án, VD: Phương án từ phase — R1"/>
        <button type="button" className={button} disabled={busy||dirty||!fromPhaseIds.length||!fromName.trim()} onClick={()=>run(async()=>{const r=await request(base+'/options/from-phases',{name:fromName.trim(),phaseIds:fromPhaseIds});await refresh(r.quoteId);setNotice(`Đã tạo phương án từ phase: ${r.itemCount} dòng báo giá.${r.missingPrice?` ${r.missingPrice} dòng đang thiếu giá đầu vào.`:''}${r.unconfirmedPrice?` ${r.unconfirmedPrice} dòng giá chưa xác nhận.`:''}${r.skippedPhases?.length?` Bỏ qua phase chưa có KOL/hạng mục: ${r.skippedPhases.join(', ')}.` :''} Điền giá bán rồi lưu.`);})}>Tạo phương án từ {fromPhaseIds.length} phase</button>
      </div>
    </section>}
    {data.options.length===0?<p className="p-5 border border-dashed rounded-xl text-slate-500">Chưa có phương án. PM/Admin bổ sung thông tin chiến dịch rồi tạo phương án đầu tiên.</p>:<>
      <div className="flex gap-2 flex-wrap">{data.options.map((o:any)=><button key={o.id} className={'border px-3 py-2 rounded-lg text-sm '+(optionId===o.id?'bg-indigo-50 border-indigo-500 text-indigo-800':'bg-white')} onClick={()=>choose(o.versions[0])}>{o.name}{o.versions.some((q:any)=>q.id===data.baselineId)?' · Đã chốt':''}</button>)}</div>
      {quote&&<section className="space-y-4"><p className="text-sm text-indigo-800">Đã chọn {new Set(items.filter(i=>i.included&&i.kind==='kol').map(i=>i.shortlistId||i.creator)).size} KOL · {items.filter(i=>i.included).reduce((n,i)=>n+i.quantity,0)} đơn vị hạng mục.</p>
        <div className="flex flex-wrap items-end gap-3"><label className="text-sm">Phiên bản<select aria-label="Phiên bản báo giá" className={field} value={quote.id} onChange={e=>choose(currentOption.versions.find((q:any)=>q.id===e.target.value))}>{currentOption.versions.map((q:any)=><option key={q.id} value={q.id}>V{q.number} — {statusLabel[q.status]}</option>)}</select></label><p className="text-sm text-slate-500">{currentOption.brief}</p></div>
        {!manage&&<p className="text-sm bg-indigo-50 p-3 rounded-lg">Bạn đang xem giá đầu vào. Giá bán, phí và P&L chỉ dành cho PM/Admin.</p>}
        {manage&&data.target&&<p className="text-sm text-slate-600">Mục tiêu brief: {data.target.count??'Chưa đặt'} KOL · Ngân sách: {money(data.target.budget)} · {quote.finance?.totalWithTax==null?'Chưa đủ giá để đối chiếu':data.target.budget==null?'Chưa đặt ngân sách':quote.finance.totalWithTax>data.target.budget?'Vượt ngân sách '+money(quote.finance.totalWithTax-data.target.budget):'Còn trong ngân sách '+money(data.target.budget-quote.finance.totalWithTax)} (so với tổng sau thuế của bản đã lưu).</p>}
        {editable&&manage&&items.some(i=>i.shortlistId)&&<button className="border rounded-lg px-3 py-2 text-sm" disabled={busy||dirty} onClick={()=>{if(window.confirm('Lấy giá đầu vào và trạng thái xác nhận mới nhất từ danh sách KOL vào bản nháp này? Giá bán và số lượng giữ nguyên.'))run(async()=>{const r=await request(`${base}/quotes/${quote.id}/refresh-prices`,{revision:quote.revision});await refresh();setNotice(`Đã lấy giá mới cho ${r.updated} dòng.${r.missingPrice?` Còn ${r.missingPrice} dòng thiếu giá đầu vào.`:''}${r.unconfirmedPrice?` Còn ${r.unconfirmedPrice} dòng giá chưa xác nhận — cần Booking xác nhận trong danh sách KOL.`:''} Kiểm tra lại P&L trước khi duyệt.`);});}}>Lấy lại giá KOL mới nhất vào bản nháp</button>}
        {editable&&manage&&<button className={button} onClick={()=>{setItems(prev=>[...prev,{id:crypto.randomUUID(),creator:'',description:'',phase:'',kind:'kol',quantity:1,buyUnitPrice:null,sellUnitPrice:null,included:true}]);setDirty(true);}}>+ Thêm KOL / Chi phí trực tiếp</button>}
        <div className="overflow-x-auto border rounded-xl"><table className="w-full text-sm min-w-[750px]"><thead className="bg-slate-100"><tr><th className="p-3">Chọn</th><th className="p-3 text-left">KOL / Hạng mục</th><th className="p-3">Số lượng</th><th className="p-3">Giá đầu vào / đơn vị</th>{manage&&<><th className="p-3">Giá báo khách / đơn vị</th><th className="p-3">Chênh lệch dòng</th></>}</tr></thead><tbody>{items.map(i=><tr key={i.id} className="border-t align-top">
          <td className="p-3"><input aria-label={'Tính hạng mục '+(i.creator||'mới')} type="checkbox" checked={i.included} disabled={!editable||!manage} onChange={e=>updateItem(i.id,'included',e.target.checked)}/></td>
          <td className="p-3 space-y-2 min-w-64"><input aria-label="Tên KOL hoặc hạng mục" placeholder="Tên KOL / Buzz / Seeding" className={field} value={i.creator} disabled={!editable||!manage||Boolean(i.shortlistId)} onChange={e=>updateItem(i.id,'creator',e.target.value)}/><input aria-label="Mô tả SOW" placeholder="SOW: 1 video review, 2 clip ngắn…" className={field} value={i.description} disabled={!editable||!manage} onChange={e=>updateItem(i.id,'description',e.target.value)}/><div className="flex gap-2"><select aria-label="Loại chi phí" className={field} value={i.kind} disabled={!editable||!manage||Boolean(i.shortlistId)} onChange={e=>updateItem(i.id,'kind',e.target.value)}><option value="kol">KOL</option><option value="buzz">Buzz</option><option value="seeding">Seeding</option><option value="production">Sản xuất</option><option value="other">Khác</option></select><input aria-label="Phase" placeholder="Phase / Pillar" className={field} value={i.phase} disabled={!editable||!manage} onChange={e=>updateItem(i.id,'phase',e.target.value)}/></div></td>
          <td className="p-3 w-24"><input aria-label="Số lượng hạng mục" type="number" min={1} step={1} className={field} value={i.quantity} disabled={!editable||!manage} onChange={e=>updateItem(i.id,'quantity',Number(e.target.value))}/></td>
          <td className="p-3 min-w-40"><input aria-label={'Giá đầu vào '+(i.creator||'mới')} className={field} inputMode="numeric" placeholder="Chưa có giá" disabled={!editable||Boolean(i.shortlistId)} value={formatMoneyInput(i.buyUnitPrice??'')} onChange={e=>{const n=parseMoneyInput(e.target.value);updateItem(i.id,'buyUnitPrice',n===''?null:n);}}/><p className="text-xs text-slate-500 mt-2">{i.shortlistId?(i.buyUnitPrice===null?'Chưa có giá đầu vào · ':i.priceSnapshot?.status==='confirmed'?`Đã xác nhận${i.priceSnapshot.source?' · nguồn: '+i.priceSnapshot.source:''} · `:'Giá đầu vào chưa xác nhận · '):i.kind==='kol'?(i.buyUnitPrice===null?'Chưa có giá đầu vào · ':manualBuyConfirmed(i)?`Đã xác nhận giá đầu vào · nguồn: ${i.buyConfirmation!.source}${i.buyConfirmation!.checkedByName?' · '+i.buyConfirmation!.checkedByName:''} · ${formatDateTimeVN(i.buyConfirmation!.checkedAt)} · `:i.buyConfirmation?'Giá đã thay đổi sau khi xác nhận — cần xác nhận lại · ':'Giá đầu vào chưa xác nhận · '):''}Thành tiền: {i.buyUnitPrice===null?'Chờ giá':money(i.buyUnitPrice*i.quantity)}</p>{editable&&!i.shortlistId&&i.kind==='kol'&&i.buyUnitPrice!==null&&!manualBuyConfirmed(i)&&<div className="mt-2 space-y-1">{dirty?<p className="text-xs text-amber-700">Lưu báo giá trước, rồi xác nhận giá của dòng nhập tay này.</p>:<div className="flex gap-1"><input aria-label={'Nguồn kiểm tra giá '+(i.creator||'mới')} className={field+' text-xs'} placeholder="Nguồn kiểm tra giá…" maxLength={200} value={confirmSources[i.id]??''} onChange={e=>setConfirmSources(prev=>({...prev,[i.id]:e.target.value}))}/><button type="button" className="border rounded-lg px-2 py-1 text-xs whitespace-nowrap bg-white" disabled={busy} onClick={()=>{const src=(confirmSources[i.id]??'').trim();if(!src){setError('Nhập nguồn kiểm tra giá trước khi xác nhận.');return;}run(async()=>{const r=await request(`${base}/quotes/${quote.id}/confirm-buy`,{itemId:i.id,source:src,revision:quote.revision});await refresh(r.quote.id);setNotice(`Đã xác nhận giá đầu vào cho dòng “${i.creator||'KOL nhập tay'}”.`);});}}>Xác nhận giá</button></div>}</div>}</td>
          {manage&&<td className="p-3 min-w-40"><input aria-label={'Giá báo khách '+(i.creator||'mới')} className={field} inputMode="numeric" placeholder="PM nhập giá bán" disabled={!editable} value={formatMoneyInput(i.sellUnitPrice??'')} onChange={e=>{const n=parseMoneyInput(e.target.value);updateItem(i.id,'sellUnitPrice',n===''?null:n);}}/><p className="text-xs text-slate-500 mt-2">Thành tiền: {i.sellUnitPrice==null?'Chưa có giá bán':money(i.sellUnitPrice*i.quantity)}</p></td>}{manage&&<td className="p-3 min-w-36">{i.buyUnitPrice===null||i.sellUnitPrice==null?'Chưa đủ giá':money((i.sellUnitPrice-i.buyUnitPrice)*i.quantity)}</td>}
        </tr>)}</tbody></table>{items.length===0&&<p className="p-6 text-slate-500">Chưa có hạng mục. Thêm dòng hoặc lấy từ báo giá cũ nếu bạn là Admin.</p>}</div>
        {manage&&<div className="grid sm:grid-cols-3 gap-3"><label className="text-sm">Chiết khấu khách hàng<select aria-label="Cách chiết khấu" className={field} disabled={!editable} value={discount.mode} onChange={e=>{setDiscount({mode:e.target.value,value:0});setDirty(true);}}><option value="fixed">Số tiền VND</option><option value="percent">Phần trăm</option></select><input aria-label="Giá trị chiết khấu" className={field} disabled={!editable} inputMode="decimal" value={discount.mode==='fixed'?formatMoneyInput(discount.value):discount.value} onChange={e=>{setDiscount({...discount,value:discount.mode==='fixed'?(parseMoneyInput(e.target.value)||0):Number(e.target.value)});setDirty(true);}}/></label>
          <label className="text-sm">Agency fee — sau chiết khấu<select aria-label="Cách tính agency fee" className={field} disabled={!editable} value={fee.mode} onChange={e=>{setFee({mode:e.target.value,value:0});setDirty(true);}}><option value="percent">Phần trăm</option><option value="fixed">Số tiền VND</option></select><input aria-label="Giá trị agency fee" className={field} inputMode="decimal" disabled={!editable} value={fee.mode==='fixed'?formatMoneyInput(fee.value):fee.value} onChange={e=>{setFee({...fee,value:fee.mode==='fixed'?(parseMoneyInput(e.target.value)||0):Number(e.target.value)});setDirty(true);}}/></label>
          <label className="text-sm">Thuế suất (%) — PM xác nhận<input aria-label="Thuế suất" type="number" min={0} max={100} step="0.01" className={field} value={tax} disabled={!editable} onChange={e=>{setTax(Number(e.target.value));setDirty(true);}}/><span className="text-xs text-slate-500">Không mặc định áp dụng mức thuế cho mọi dự án.</span></label>
        </div>}
        {manage&&['draft','changes_requested','submitted'].includes(quote.status)&&(()=>{const g=priceProblems(items);return g.lines>0?<p className="text-sm bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-lg">Còn {g.lines} dòng cần xử lý trước khi gửi duyệt, duyệt hoặc chốt{g.missingBuy?` · thiếu giá đầu vào: ${g.missingBuy} dòng`:''}{g.unconfirmedBuy?` · giá đầu vào chưa xác nhận: ${g.unconfirmedBuy} dòng`:''}{g.missingSell?` · thiếu giá bán: ${g.missingSell} dòng`:''}. Dòng không được tính vào báo giá (bỏ chọn) không gây chặn.</p>:null;})()}
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
        {customer&&<section className="border rounded-xl p-5 bg-white"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">Bản xem trước báo khách</h3><button type="button" className={button} onClick={()=>setShowPrint(true)}>In / Lưu PDF</button></div><p>{customer.client} · {customer.campaign} · V{customer.version}</p><table className="w-full text-sm mt-4"><thead><tr className="border-b"><th className="text-left">Hạng mục</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead><tbody>{customerGroups.map((g:any)=>{return <React.Fragment key={g.phase||'__'}>{(g.showHeader)&&<tr className="bg-slate-50"><td colSpan={4} className="py-2 font-semibold">{g.phase?('Phase: '+g.phase):'Hạng mục khác'}</td></tr>}{g.items.map((i:any,index:number)=><tr key={index} className="border-b"><td className="py-2">{i.creator} — {i.description}</td><td className="text-center">{i.quantity}</td><td className="text-center">{money(i.sellUnitPrice)}</td><td className="text-right">{money(i.total)}</td></tr>)}{(g.showHeader)&&<tr className="border-b"><td colSpan={3} className="py-1 text-right text-xs text-slate-500">Tiểu tổng {g.phase||'nhóm'}:</td><td className="py-1 text-right font-medium">{money(g.subtotal)}</td></tr>}</React.Fragment>})}</tbody></table><div className="mt-4 text-sm text-right"><p>Chiết khấu: {money(customer.discount)}</p><p>Agency fee: {money(customer.agencyFee)}</p><p>Trước thuế: {money(customer.revenueBeforeTax)}</p><p>Thuế: {money(customer.tax)}</p><strong>Tổng thanh toán: {money(customer.totalWithTax)}</strong></div></section>}
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
                <tbody>{customerGroups.map((g:any)=>{return <React.Fragment key={g.phase||'__'}>{(g.showHeader)&&<tr className="bg-slate-100"><td colSpan={4} className="py-2 px-1 font-semibold">{g.phase?('Phase: '+g.phase):'Hạng mục khác'}</td></tr>}{g.items.map((i:any,index:number)=><tr key={index} className="border-b border-slate-200"><td className="py-2">{i.creator} — {i.description}</td><td className="text-center">{i.quantity}</td><td className="text-center">{money(i.sellUnitPrice)}</td><td className="text-right">{money(i.total)}</td></tr>)}{(g.showHeader)&&<tr className="border-b border-slate-200"><td colSpan={3} className="py-1 text-right text-xs text-slate-500">Tiểu tổng {g.phase||'nhóm'}:</td><td className="py-1 text-right font-medium">{money(g.subtotal)}</td></tr>}</React.Fragment>})}</tbody>
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
