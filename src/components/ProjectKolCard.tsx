import React,{useState} from 'react';
import {Check,CheckCircle2,AlertCircle,ExternalLink,ChevronDown} from 'lucide-react';
import {PRICE_FORMAT_LABELS,type PriceFormatKey} from '../types/kol';
import {assessProjectKol,type ProjectBrief} from '../domain/projectBrief';
import {formatMoneyInput} from '../utils/moneyInput';
const shortLabels:Record<PriceFormatKey,string>={post:'Post / Ảnh',video:'Video review / dài',shorts:'Clip ngắn',livestream:'Livestream',thamDuSuKien:'Tham dự sự kiện',sdha:'Sử dụng hình ảnh'};
const safeUrl=(v:any)=>typeof v==='string'&&/^https?:\/\//i.test(v)?v:undefined;
export function ProjectKolCard({profile,brief,prices,selected,disabled,selectionLabel,onSelect,badge,renderPriceEditor}:{profile:any;brief:ProjectBrief;prices?:any;selected:boolean;disabled:boolean;selectionLabel:string;onSelect?:()=>void;badge?:string;renderPriceEditor?:(format:PriceFormatKey)=>React.ReactNode}){
  const [editing,setEditing]=useState<PriceFormatKey|null>(null);
  const assessment=assessProjectKol(profile,brief);
  const needed=brief.deliverables??[];
  return <article className={'rounded-2xl border bg-white shadow-sm overflow-hidden '+(selected?'border-indigo-500 ring-2 ring-indigo-100':'border-slate-200')} aria-label={'Hồ sơ KOL '+profile.ten}>
    <div className="p-4 sm:p-5 space-y-4">
      <header className="flex items-start gap-3">
        {onSelect&&<input type="checkbox" aria-label={selectionLabel+' '+profile.ten} checked={selected} disabled={disabled} onChange={onSelect} className="mt-3 w-4 h-4 accent-indigo-600 shrink-0"/>}
        {safeUrl(profile.anhDaiDien)?<img src={profile.anhDaiDien} alt={'Ảnh '+profile.ten} className="w-12 h-12 rounded-full object-cover" referrerPolicy="no-referrer"/>:<div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-700 font-bold grid place-items-center shrink-0">{profile.ten.slice(0,2).toUpperCase()}</div>}
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h5 className="font-bold text-slate-900">{profile.ten}</h5>{badge&&<span className="rounded-full bg-slate-100 text-slate-600 px-2 py-1 text-[11px]">{badge}</span>}</div><div className="flex flex-wrap gap-1 mt-1">{profile.linhVuc?.map((c:string)=><span key={c} className="text-xs rounded-md px-2 py-0.5 bg-indigo-50 text-indigo-700">{c}</span>)}</div></div>
      </header>
      <div className="flex flex-wrap gap-2">{profile.nenTang?.map((c:any,n:number)=><div key={n} className="rounded-lg border border-slate-100 px-2.5 py-1.5 text-xs text-slate-600"><strong className="text-slate-800">{c.tenNenTang}</strong> · {formatMoneyInput(c.soFollower)} follower{safeUrl(c.linkProfile)&&<a href={safeUrl(c.linkProfile)} target="_blank" rel="noopener noreferrer" className="inline-flex ml-2 text-indigo-600" aria-label={'Mở kênh '+c.tenNenTang+' của '+profile.ten}><ExternalLink size={12}/></a>}</div>)}{!profile.nenTang?.length&&<span className="text-xs text-slate-500">Chưa có thông tin kênh</span>}</div>
      <div className={'rounded-xl p-3 border '+(assessment.matches?'bg-emerald-50/60 border-emerald-100':'bg-amber-50 border-amber-200')}><h6 className="font-semibold text-xs text-slate-800 mb-2">{assessment.hasCriteria?'Đối chiếu với brief đã duyệt':'Cần bổ sung tiêu chí để đánh giá phù hợp'}</h6><ul className="space-y-1.5 text-xs">{assessment.checks.map((c,n)=><li key={n} className="flex items-start gap-2">{c.met?<Check size={14} className="text-emerald-600 shrink-0"/>:<AlertCircle size={14} className="text-amber-600 shrink-0"/>}<span>{c.met?'Đạt: ':'Chưa đạt: '}{c.label}</span></li>)}</ul>{profile.reviewSoBo&&<p className="text-xs mt-2 text-slate-600"><strong>Ghi chú hồ sơ:</strong> {profile.reviewSoBo}</p>}{!assessment.matches&&<p className="text-xs mt-2 text-amber-800">KOL đã giữ trong danh sách nhưng chưa đáp ứng tiêu chí brief hiện tại.</p>}</div>
      <div><div className="flex justify-between items-center gap-2 mb-2"><h6 className="font-semibold text-xs text-slate-800">Giá đầu vào / đơn vị</h6><span className="text-[11px] text-indigo-700">Viền tím: brief yêu cầu</span></div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{(Object.keys(PRICE_FORMAT_LABELS) as PriceFormatKey[]).map(format=>{
          const task=needed.find(d=>d.format===format),price=prices?.[format],value=prices?price?.value:profile.bangGia?.[format];
          const status=price?.status??(value==null?'waiting':'unconfirmed');
          const box='text-left p-3 rounded-xl border min-w-0 '+(task?'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-200':'border-slate-200 bg-slate-50/60');
          const content=<><div className="font-semibold text-xs text-slate-700">{shortLabels[format]}</div><div className={'font-bold mt-1 text-sm '+(value==null?'text-amber-700':'text-slate-900')}>{value==null?'Chưa có giá':formatMoneyInput(value)+' ₫'}</div>{task&&<div className="text-[10px] text-indigo-700 font-medium mt-1">Brief yêu cầu · {task.quantity.toLocaleString('vi-VN')}{brief.deliverableScope==='campaign'?' toàn chiến dịch':' / KOL'}</div>}<div className={'text-[10px] mt-1 flex items-center gap-1 '+(status==='confirmed'?'text-emerald-700':'text-slate-500')}>{status==='confirmed'&&<CheckCircle2 size={11}/>} {status==='confirmed'?'Đã xác nhận':status==='waiting'?'Chờ bổ sung giá':'Chưa xác nhận'}</div>{price?.checkedAt&&<div className="text-[10px] mt-1 text-slate-500">{new Date(price.checkedAt).toLocaleDateString('vi-VN')}</div>}{renderPriceEditor&&<div className="text-[10px] mt-2 text-indigo-700 flex items-center gap-1">Kiểm tra giá <ChevronDown size={10}/></div>}</>;
          return renderPriceEditor?<button type="button" key={format} className={box} disabled={disabled} aria-label={'Kiểm tra giá '+PRICE_FORMAT_LABELS[format]+' của '+profile.ten} aria-expanded={editing===format} onClick={()=>setEditing(editing===format?null:format)}>{content}</button>:<div key={format} className={box}>{content}</div>;
        })}</div>
        {!needed.length&&<p className="text-xs text-slate-500 mt-2">Brief chưa xác định hạng mục cần làm. Bổ sung ở phần brief để làm nổi bật giá liên quan.</p>}
        {needed.length>0&&<p className="text-[11px] text-slate-500 mt-2">{brief.deliverableScope==='campaign'?'Số lượng hiển thị là tổng chiến dịch, chưa phân công cho từng KOL.':'Định mức theo brief; PM phân công thực tế trong phương án.'}</p>}
      </div>
      {editing&&renderPriceEditor&&<div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3"><h6 className="text-sm font-semibold mb-3">Kiểm tra giá — {PRICE_FORMAT_LABELS[editing]}</h6>{renderPriceEditor(editing)}</div>}
    </div>
  </article>;
}
