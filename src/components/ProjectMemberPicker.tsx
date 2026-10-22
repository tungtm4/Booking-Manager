import React, {useEffect, useState} from 'react';

type Candidate = {id:string; name:string; email:string};

export function ProjectMemberPicker({projectId}: {projectId:string}) {
  const [mode,setMode]=useState<'select'|'email'>('select');
  const [candidates,setCandidates]=useState<Candidate[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);setError('');setCandidates([]);
    (async()=>{
      try{
        const response=await fetch(`/api/workspace/projects/${encodeURIComponent(projectId)}/candidates`,{signal:controller.signal});
        if(!response.ok)throw new Error('Không tải được danh sách. Bạn có thể nhập email thay thế.');
        const data=await response.json();
        if(!controller.signal.aborted)setCandidates(data.candidates);
      }catch{
        if(!controller.signal.aborted)setError('Không tải được danh sách. Bạn có thể nhập email thay thế.');
      }finally{if(!controller.signal.aborted)setLoading(false);}
    })();
    return ()=>controller.abort();
  },[projectId]);
  const field='w-full rounded-xl border border-slate-300 px-3 py-2.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400';
  return <div className="space-y-2">
    <div className="flex gap-2 text-sm">
      <button type="button" aria-pressed={mode==='select'} className={'rounded-lg px-3 py-2 '+(mode==='select'?'bg-indigo-100 text-indigo-800 font-semibold':'text-slate-600')} onClick={()=>setMode('select')}>Chọn người có sẵn</button>
      <button type="button" aria-pressed={mode==='email'} className={'rounded-lg px-3 py-2 '+(mode==='email'?'bg-indigo-100 text-indigo-800 font-semibold':'text-slate-600')} onClick={()=>setMode('email')}>Nhập email</button>
    </div>
    {mode==='select'?<label className="block text-sm font-medium">Thành viên
      <select name="email" required defaultValue="" aria-label="Chọn thành viên có sẵn" className={field} disabled={loading||Boolean(error)}>
        <option value="" disabled>{loading?'Đang tải danh sách…':'Chọn tên và email thành viên'}</option>
        {candidates.map(person=><option key={person.id} value={person.email}>{person.name} — {person.email}</option>)}
      </select>
    </label>:<label className="block text-sm font-medium">Email thành viên
      <input name="email" type="email" required placeholder="Email tài khoản đã được tạo" aria-label="Email phân công" className={field}/>
    </label>}
    {error&&<p role="status" className="text-xs text-amber-800">{error}</p>}
    {!loading&&!error&&candidates.length===0&&<p className="text-xs text-slate-500">Chưa có tài khoản đang hoạt động. Admin cần tạo tài khoản trước.</p>}
    <p className="text-xs text-slate-500">Có thể chọn lại người đã tham gia để thêm vai trò hoặc phân công. Tài khoản đã khóa không xuất hiện.</p>
  </div>;
}
