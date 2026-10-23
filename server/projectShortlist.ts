import type {Router} from 'express';
import type {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {emptyProjectBrief,readProjectBrief,assessProjectKol} from '../src/domain/projectBrief';
import {calculateProjectFinance} from '../src/domain/projectFinance';
import {PRICE_FORMAT_LABELS} from '../src/types/kol';
const formats=Object.keys(PRICE_FORMAT_LABELS);
const money=(v:any)=>v===null||(Number.isSafeInteger(v)&&v>=0&&v<=1e12);
const str=(v:any,max=1000)=>typeof v==='string'&&v.trim().length<=max;
function validTotals(p:any){try{const f=calculateProjectFinance(p);return f.revenueBeforeTax===null||Number.isSafeInteger(f.revenueBeforeTax+Math.round(f.revenueBeforeTax*p.taxRate/100));}catch{return false;}}
export function installProjectShortlist(router:Router,db:DatabaseSync,access:(u:any,id:string,manage?:boolean)=>boolean,audit:(a:string|null,b:string,c:string)=>unknown){
  db.exec(`CREATE TABLE IF NOT EXISTS kol_catalog(id TEXT NOT NULL,organization_id TEXT NOT NULL,profile_json TEXT NOT NULL,PRIMARY KEY(id,organization_id));
    CREATE TABLE IF NOT EXISTS project_briefs(project_id TEXT PRIMARY KEY REFERENCES projects(id),payload_json TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS project_shortlist(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),catalog_id TEXT NOT NULL,profile_json TEXT NOT NULL,prices_json TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,UNIQUE(project_id,catalog_id));`);
  // Kho KOL server là nguồn chính duy nhất (Vấn đề 7): mỗi hồ sơ có revision chống ghi đè
  // và thời điểm cập nhật do server ghi. Cột được thêm an toàn trên database cũ.
  const catalogCols=(db.prepare('PRAGMA table_info(kol_catalog)').all() as any[]).map((r:any)=>r.name);
  if(!catalogCols.includes('revision'))db.exec('ALTER TABLE kol_catalog ADD COLUMN revision INTEGER NOT NULL DEFAULT 1');
  if(!catalogCols.includes('updated_at'))db.exec("ALTER TABLE kol_catalog ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''");
  db.exec(`CREATE TABLE IF NOT EXISTS project_phases(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),name TEXT NOT NULL,kind TEXT NOT NULL DEFAULT 'other',description TEXT NOT NULL DEFAULT '',budget INTEGER,sort_order INTEGER NOT NULL DEFAULT 0,brief_json TEXT,revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT '');`);
  const slCols=(db.prepare(`PRAGMA table_info(project_shortlist)`).all() as any[]).map((r:any)=>r.name);
  if(!slCols.includes('phase_id'))db.exec(`ALTER TABLE project_shortlist ADD COLUMN phase_id TEXT`);
  // Migration Đợt 9: dự án chưa có phase nào → tạo phase mặc định giữ brief + shortlist hiện tại.
  const phaseless=db.prepare('SELECT p.id FROM projects p WHERE NOT EXISTS (SELECT 1 FROM project_phases ph WHERE ph.project_id=p.id)').all() as any[];
  for(const p of phaseless){
    const b=db.prepare('SELECT payload_json FROM project_briefs WHERE project_id=?').get(p.id) as any;
    const phaseId=randomUUID();const now=new Date().toISOString();
    db.prepare('INSERT INTO project_phases(id,project_id,name,kind,description,budget,sort_order,brief_json,revision,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,1,?,?)').run(phaseId,p.id,'Phase 1 — Tổng hợp','other','',null,0,b?.payload_json??null,now,now);
    db.prepare('UPDATE project_shortlist SET phase_id=? WHERE project_id=? AND phase_id IS NULL').run(phaseId,p.id);
  }
  const optStr=(v:any,max:number)=>v===undefined||v===null?'':(typeof v==='string'&&v.length<=max?v:null);
  function sanitizeContact(v:any){
    // Luôn chuẩn hoá về đủ 4 trường (kể cả khi hồ sơ nguồn thiếu hẳn liên hệ) để hồ sơ
    // đọc từ server rồi nhập lại không bị lệch dạng {} so với dạng đầy đủ.
    if(v===undefined||v===null)return {tenNguoiLienHe:'',soDienThoai:'',emailZalo:'',ghiChu:''};
    if(typeof v!=='object'||Array.isArray(v))return undefined;
    const tenNguoiLienHe=optStr(v.tenNguoiLienHe,200),soDienThoai=optStr(v.soDienThoai,50),emailZalo=optStr(v.emailZalo,200),ghiChu=optStr(v.ghiChu,1000);
    if([tenNguoiLienHe,soDienThoai,emailZalo,ghiChu].some(x=>x===null))return undefined;
    return {tenNguoiLienHe,soDienThoai,emailZalo,ghiChu};
  }
  function sanitizeHistory(v:any){
    if(v===undefined||v===null)return [];
    if(!Array.isArray(v)||v.length>200)return undefined;
    const out:any[]=[];
    for(const h of v){
      if(!h||typeof h!=='object'||Array.isArray(h))return undefined;
      const id=optStr(h.id,100),tenChienDich=optStr(h.tenChienDich,300),thoiGian=optStr(h.thoiGian,50),formatDaLam=optStr(h.formatDaLam,100),ketQuaLink=optStr(h.ketQuaLink,2000),nhanXet=optStr(h.nhanXet,2000);
      if([id,tenChienDich,thoiGian,formatDaLam,ketQuaLink,nhanXet].some(x=>x===null))return undefined;
      if(typeof h.chiPhiThucTe!=='number'||!Number.isFinite(h.chiPhiThucTe)||h.chiPhiThucTe<0||h.chiPhiThucTe>1e12)return undefined;
      if(h.danhGia!==undefined&&(typeof h.danhGia!=='number'||h.danhGia<0||h.danhGia>5))return undefined;
      out.push({id,tenChienDich,thoiGian,formatDaLam,chiPhiThucTe:h.chiPhiThucTe,ketQuaLink,nhanXet,...(h.danhGia!==undefined?{danhGia:h.danhGia}:{})});
    }
    return out;
  }
  function sanitizeRating(v:any){
    if(v===undefined||v===null)return undefined;
    if(typeof v!=='object'||Array.isArray(v))return undefined;
    const nhanXet=optStr(v.nhanXet,2000);if(nhanXet===null)return undefined;
    if(v.diem!==undefined&&(typeof v.diem!=='number'||v.diem<0||v.diem>5))return undefined;
    return {...(v.diem!==undefined?{diem:v.diem}:{}),nhanXet};
  }
  function profile(p:any){
    if(!p||!str(p.id,100)||!p.id.trim()||!str(p.ten,200)||!p.ten.trim()||!Array.isArray(p.linhVuc)||p.linhVuc.length>50||p.linhVuc.some((v:any)=>!str(v,100))||!Array.isArray(p.nenTang)||p.nenTang.length>30||!p.bangGia||formats.some(f=>!money(p.bangGia[f]??null)))return null;
    if(p.nenTang.some((c:any)=>!c||!str(c.tenNenTang,50)||!str(c.linkProfile??'',2000)||!Number.isSafeInteger(c.soFollower)||c.soFollower<0)||!str(p.reviewSoBo??'',5000))return null;
    // Giữ đầy đủ các trường hồ sơ đang có khi chuyển lên kho server — không làm mất liên hệ,
    // lịch sử hợp tác, đánh giá hiệu quả, cờ dữ liệu mẫu và ngày tạo của hồ sơ.
    const lienHe=sanitizeContact(p.lienHe),lichSuHopTac=sanitizeHistory(p.lichSuHopTac),danhGiaHieuQua=sanitizeRating(p.danhGiaHieuQua);
    if(lienHe===undefined||lichSuHopTac===undefined)return null;
    const clean={id:p.id,ten:p.ten.trim(),linhVuc:p.linhVuc,nenTang:p.nenTang.map((c:any)=>({...(typeof c.id==='string'&&c.id?{id:c.id}:{}),tenNenTang:c.tenNenTang,linkProfile:c.linkProfile??'',soFollower:c.soFollower})),reviewSoBo:p.reviewSoBo??'',anhDaiDien:typeof p.anhDaiDien==='string'&&/^https?:\/\//i.test(p.anhDaiDien)?p.anhDaiDien:undefined,bangGia:Object.fromEntries(formats.map(f=>[f,p.bangGia[f]??null])),lienHe,lichSuHopTac,...(danhGiaHieuQua?{danhGiaHieuQua}:{}),...(p.isSample===true?{isSample:true}:{}),ngayTao:typeof p.ngayTao==='string'?p.ngayTao:undefined,ngayCapNhat:typeof p.ngayCapNhat==='string'?p.ngayCapNhat:undefined,...(typeof p.ngayCapNhatNguon==='string'&&p.ngayCapNhatNguon.length<=40?{ngayCapNhatNguon:p.ngayCapNhatNguon}:{})};
    if(JSON.stringify(clean).length>200000)return null;
    return clean;
  }
  const emptyBrief=emptyProjectBrief;
  const phaseKinds=['creator','community','seeding','other'];
  const phaseOut=(r:any)=>({id:r.id,projectId:r.project_id,name:r.name,kind:r.kind,description:r.description,budget:r.budget,sortOrder:r.sort_order,brief:r.brief_json?(()=>{try{return readProjectBrief(JSON.parse(r.brief_json));}catch{return null;}})():null,revision:r.revision,createdAt:r.created_at,updatedAt:r.updated_at});
  function cleanPhaseBrief(input:any){
    if(input===undefined||input===null)return null;
    const b=readProjectBrief(input);
    if(!b||!str(b.text,10000)||!str(b.category,100)||!str(b.keyword,200)||!str(b.platform,50)||!Number.isSafeInteger(b.minFollowers)||b.minFollowers<0||!['campaign','per_kol'].includes(b.deliverableScope)||!Array.isArray(b.deliverables)||b.deliverables.length>6||b.deliverables.some((d:any)=>!d||!formats.includes(d.format)||!Number.isSafeInteger(d.quantity)||d.quantity<1||d.quantity>100000)||new Set(b.deliverables.map((d:any)=>d.format)).size!==b.deliverables.length||(b.targetCount!==null&&(!Number.isSafeInteger(b.targetCount)||b.targetCount<1||b.targetCount>100000))||!money(b.budget))return undefined;
    return {...b,deliverables:b.deliverables.map((d:any)=>({format:d.format,quantity:d.quantity}))};
  }
  router.get('/catalog',(req,res)=>{
    const u=res.locals.user;
    // Ngày cập nhật chính thức là thời điểm server ghi (updated_at) — ưu tiên nó hơn ngày
    // nằm trong hồ sơ để dữ liệu cũ có hai trường lệch nhau vẫn hiển thị nhất quán.
    const kols=db.prepare('SELECT profile_json,revision,updated_at FROM kol_catalog WHERE organization_id=? ORDER BY rowid').all(u.organization_id).map((r:any)=>{const {engagementRate,...p}=JSON.parse(r.profile_json);return {...p,...(r.updated_at?{ngayCapNhat:r.updated_at}:{}) ,revision:r.revision,updatedAt:r.updated_at};});
    res.json({kols});
  });
  // ===== Kho KOL chính thức trên server (Vấn đề 7) — chỉ Admin hệ thống quản lý =====
  const isOrgAdmin=(u:any)=>u.organization_role==='admin';
  const catalogRow=(orgId:string,id:string)=>db.prepare('SELECT * FROM kol_catalog WHERE id=? AND organization_id=?').get(id,orgId) as any;
  // Ngày cập nhật chính thức luôn do server ghi. Khi ghi từ dữ liệu nhập (đồng bộ/nhập
  // chuyển đổi), ngày của nguồn nhập được giữ riêng ở ngayCapNhatNguon — không thay thế
  // ngày server. ngayTao của hồ sơ được giữ nguyên.
  const withServerDate=(p:any,now:string,fallbackNguon?:string)=>{
    const src=typeof p.ngayCapNhat==='string'&&p.ngayCapNhat&&p.ngayCapNhat!==now?p.ngayCapNhat:(typeof p.ngayCapNhatNguon==='string'&&p.ngayCapNhatNguon?p.ngayCapNhatNguon:fallbackNguon);
    return {...p,ngayCapNhat:now,...(src?{ngayCapNhatNguon:src}:{})};
  };
  router.post('/catalog',(req,res)=>{
    const u=res.locals.user;if(!isOrgAdmin(u))return res.status(403).json({message:'Chỉ Admin hệ thống được quản lý kho KOL.'});
    const now=new Date().toISOString();
    const p=profile({...req.body?.profile,id:randomUUID(),ngayCapNhat:now});if(!p)return res.status(400).json({message:'Kiểm tra tên, lĩnh vực, nền tảng, follower và giá KOL.'});
    db.prepare('INSERT INTO kol_catalog VALUES (?,?,?,?,?)').run(p.id,u.organization_id,JSON.stringify(p),1,now);audit(u.id,'create_catalog_kol',p.id);res.json({id:p.id,revision:1,updatedAt:now});
  });
  router.post('/catalog/:id/update',(req,res)=>{
    const u=res.locals.user;if(!isOrgAdmin(u))return res.status(403).json({message:'Chỉ Admin hệ thống được quản lý kho KOL.'});
    const row=catalogRow(u.organization_id,req.params.id);if(!row)return res.status(404).json({message:'Không tìm thấy KOL trong kho.'});
    if(req.body?.revision!==row.revision)return res.status(409).json({message:'Hồ sơ đã có thay đổi mới hơn trên server. Tải lại dữ liệu trước khi lưu.'});
    const now=new Date().toISOString();
    const p=profile({...req.body?.profile,id:row.id,ngayCapNhat:now});if(!p)return res.status(400).json({message:'Kiểm tra tên, lĩnh vực, nền tảng, follower và giá KOL.'});
    const result=db.prepare('UPDATE kol_catalog SET profile_json=?,revision=revision+1,updated_at=? WHERE id=? AND organization_id=? AND revision=?').run(JSON.stringify(p),now,row.id,u.organization_id,row.revision);
    if(!result.changes)return res.status(409).json({message:'Hồ sơ đã có thay đổi mới hơn trên server. Tải lại dữ liệu trước khi lưu.'});
    audit(u.id,'update_catalog_kol',row.id);res.json({id:row.id,revision:row.revision+1,updatedAt:now});
  });
  router.post('/catalog/:id/remove',(req,res)=>{
    const u=res.locals.user;if(!isOrgAdmin(u))return res.status(403).json({message:'Chỉ Admin hệ thống được quản lý kho KOL.'});
    const row=catalogRow(u.organization_id,req.params.id);if(!row)return res.status(404).json({message:'Không tìm thấy KOL trong kho.'});
    if(req.body?.revision!==undefined&&req.body.revision!==row.revision)return res.status(409).json({message:'Hồ sơ đã có thay đổi mới hơn trên server. Tải lại dữ liệu trước khi xoá.'});
    db.prepare('DELETE FROM kol_catalog WHERE id=? AND organization_id=?').run(row.id,u.organization_id);audit(u.id,'remove_catalog_kol',row.id);res.json({success:true});
  });
  // Ghi hàng loạt có kiểm tra revision từng hồ sơ (dùng cho nhập dữ liệu đã qua xác minh và cập nhật giá hàng loạt).
  router.post('/catalog/bulk-update',(req,res)=>{
    const u=res.locals.user;if(!isOrgAdmin(u))return res.status(403).json({message:'Chỉ Admin hệ thống được quản lý kho KOL.'});
    if(!Array.isArray(req.body?.items)||!req.body.items.length||req.body.items.length>500)return res.status(400).json({message:'Danh sách hồ sơ cần ghi không hợp lệ.'});
    const now=new Date().toISOString();const added:string[]=[],updated:string[]=[],conflicts:{id:string,reason:string}[]=[];
    db.exec('BEGIN');try{
      for(const item of req.body.items){
        const id=typeof item?.id==='string'?item.id:'';
        const raw=id?profile({...item.profile,id}):null;
        if(!raw){conflicts.push({id:id||'(không có mã)',reason:'Dữ liệu hồ sơ không hợp lệ.'});continue;}
        // Ngày cập nhật do server ghi — không lấy ngày client gửi lên.
        const p={...raw,ngayCapNhat:now};
        const row=catalogRow(u.organization_id,id);
        if(!row){
          if(item.revision!==null&&item.revision!==undefined){conflicts.push({id,reason:'Hồ sơ không còn trên server.'});continue;}
          db.prepare('INSERT INTO kol_catalog VALUES (?,?,?,?,?)').run(id,u.organization_id,JSON.stringify(p),1,now);added.push(id);continue;
        }
        if(item.revision!==row.revision){conflicts.push({id,reason:'Đã có thay đổi mới hơn trên server.'});continue;}
        db.prepare('UPDATE kol_catalog SET profile_json=?,revision=revision+1,updated_at=? WHERE id=? AND organization_id=?').run(JSON.stringify(p),now,id,u.organization_id);updated.push(id);
      }
      audit(u.id,'bulk_update_catalog','');db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e;}
    res.json({added,updated,conflicts});
  });
  // Nhập chuyển đổi dữ liệu trình duyệt cũ lên kho server: xem trước phân loại, áp dụng theo lựa chọn.
  // Khớp hồ sơ CHỈ theo mã định danh — không gộp theo tên gần giống; không xoá hồ sơ chỉ có trên server;
  // hồ sơ xung đột chỉ bị ghi đè khi Admin chọn rõ "dùng bản nhập".
  // Chuẩn hoá để so sánh hồ sơ: sắp xếp khoá, bỏ qua các khoá có giá trị undefined
  // (bản vừa làm sạch còn giữ khoá undefined, bản đã lưu trong DB thì không).
  const canonical=(v:any):string=>{
    if(v===undefined)return '';
    if(v===null||typeof v!=='object')return JSON.stringify(v)??'';
    if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
    const keys=Object.keys(v).filter(k=>v[k]!==undefined).sort();
    return '{'+keys.map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
  };
  const profileKey=(p:any)=>{const {ngayCapNhat,ngayCapNhatNguon,...rest}=p??{};return canonical(rest);};
  const FIELD_LABELS:Record<string,string>={ten:'Tên',linhVuc:'Lĩnh vực',nenTang:'Nền tảng',bangGia:'Bảng giá',reviewSoBo:'Review sơ bộ',anhDaiDien:'Ảnh đại diện',lienHe:'Liên hệ',lichSuHopTac:'Lịch sử hợp tác',danhGiaHieuQua:'Đánh giá hiệu quả',isSample:'Cờ dữ liệu mẫu',ngayTao:'Ngày tạo'};
  function classifyMigration(u:any,rawProfiles:any[]){
    const profiles=rawProfiles.map(profile);
    if(profiles.some((p:any)=>!p)||new Set(profiles.map((p:any)=>p!.id)).size!==profiles.length)return null;
    const serverRows=db.prepare('SELECT id,profile_json,revision FROM kol_catalog WHERE organization_id=?').all(u.organization_id) as any[];
    const serverById=new Map(serverRows.map((r:any)=>[r.id,{profile:JSON.parse(r.profile_json),revision:r.revision}]));
    const newItems:any[]=[],unchanged:any[]=[],conflicts:any[]=[];const importedIds=new Set<string>();
    for(const p of profiles as any[]){
      importedIds.add(p.id);
      const server=serverById.get(p.id);
      if(!server){newItems.push({id:p.id,ten:p.ten,revision:null});continue;}
      if(profileKey(server.profile)===profileKey(p)){unchanged.push({id:p.id,ten:p.ten,revision:server.revision});continue;}
      const keys=new Set([...Object.keys(server.profile),...Object.keys(p)]);
      const differentFields=[...keys].filter(k=>k!=='ngayCapNhat'&&k!=='ngayCapNhatNguon'&&canonical(server.profile[k])!==canonical(p[k])).map(k=>FIELD_LABELS[k]??k);
      // Revision của bản server TẠI THỜI ĐIỂM XEM TRƯỚC — bước áp dụng chỉ ghi đè đúng
      // phiên bản này; server thay đổi sau đó thì hồ sơ bị chặn lại để xem trước lại.
      conflicts.push({id:p.id,ten:p.ten,differentFields,revision:server.revision});
    }
    const serverOnly=serverRows.filter((r:any)=>!importedIds.has(r.id)).map((r:any)=>({id:r.id,ten:JSON.parse(r.profile_json).ten}));
    return {profiles:profiles as any[],newItems,unchanged,conflicts,serverOnly};
  }
  router.post('/catalog/migration/preview',(req,res)=>{
    const u=res.locals.user;if(!isOrgAdmin(u))return res.status(403).json({message:'Chỉ Admin hệ thống được nhập chuyển đổi dữ liệu.'});
    if(!Array.isArray(req.body?.profiles)||req.body.profiles.length>500)return res.status(400).json({message:'Dữ liệu nhập tối đa 500 hồ sơ mỗi lần.'});
    const c=classifyMigration(u,req.body.profiles);if(!c)return res.status(400).json({message:'Dữ liệu nhập không hợp lệ hoặc trùng mã hồ sơ.'});
    res.json({newItems:c.newItems,unchanged:c.unchanged,conflicts:c.conflicts,serverOnly:c.serverOnly});
  });
  router.post('/catalog/migration/apply',(req,res)=>{
    const u=res.locals.user;if(!isOrgAdmin(u))return res.status(403).json({message:'Chỉ Admin hệ thống được nhập chuyển đổi dữ liệu.'});
    if(!Array.isArray(req.body?.profiles)||req.body.profiles.length>500)return res.status(400).json({message:'Dữ liệu nhập tối đa 500 hồ sơ mỗi lần.'});
    const resolutions=(req.body?.resolutions&&typeof req.body.resolutions==='object')?req.body.resolutions:{};
    // Revision của bản server mà người dùng ĐÃ XEM ở bước xem trước, theo từng hồ sơ
    // (null = lúc xem trước hồ sơ chưa có trên server). Áp dụng chỉ ghi khi server vẫn
    // đúng phiên bản đó — lựa chọn "dùng bản nhập" không có hiệu lực với phiên bản mới hơn.
    const expected=(req.body?.expectedRevisions&&typeof req.body.expectedRevisions==='object')?req.body.expectedRevisions:{};
    const c=classifyMigration(u,req.body.profiles);if(!c)return res.status(400).json({message:'Dữ liệu nhập không hợp lệ hoặc trùng mã hồ sơ.'});
    const now=new Date().toISOString();
    let added=0,updated=0,keptServer=0,unchangedCount=0;
    const stale:{id:string,ten:string,reason:string}[]=[];
    db.exec('BEGIN');try{
      const rowsNow=db.prepare('SELECT id,profile_json,revision FROM kol_catalog WHERE organization_id=?').all(u.organization_id) as any[];
      const nowById=new Map(rowsNow.map((r:any)=>[r.id,{profile:JSON.parse(r.profile_json),revision:r.revision}]));
      for(const p of c.profiles){
        const row=nowById.get(p.id);
        // Nội dung hiện tại đã giống hệt bản nhập: không ghi, không đổi ngày cập nhật.
        if(row&&profileKey(row.profile)===profileKey(p)){unchangedCount++;continue;}
        if(!Object.prototype.hasOwnProperty.call(expected,p.id)){
          stale.push({id:p.id,ten:p.ten,reason:'Hồ sơ chưa được xem trước ở phiên bản hiện tại. Hãy xem trước lại trước khi áp dụng.'});continue;
        }
        const exp=expected[p.id];
        if(exp===null){
          if(row){stale.push({id:p.id,ten:p.ten,reason:'Hồ sơ đã được tạo trên server sau khi xem trước.'});continue;}
          db.prepare('INSERT INTO kol_catalog VALUES (?,?,?,?,?)').run(p.id,u.organization_id,JSON.stringify(withServerDate(p,now)),1,now);added++;
          continue;
        }
        if(!row){stale.push({id:p.id,ten:p.ten,reason:'Hồ sơ đã bị xoá trên server sau khi xem trước.'});continue;}
        if(row.revision!==exp){stale.push({id:p.id,ten:p.ten,reason:'Hồ sơ đã được cập nhật trên server sau khi xem trước.'});continue;}
        // Đúng phiên bản đã xem trước: chỉ ghi đè khi Admin chọn rõ "dùng bản nhập".
        if(resolutions[p.id]==='imported'){
          const fallback=typeof row.profile.ngayCapNhatNguon==='string'?row.profile.ngayCapNhatNguon:undefined;
          db.prepare('UPDATE kol_catalog SET profile_json=?,revision=revision+1,updated_at=? WHERE id=? AND organization_id=?').run(JSON.stringify(withServerDate(p,now,fallback)),now,p.id,u.organization_id);updated++;
        }else keptServer++;
      }
      audit(u.id,'migration_apply_catalog','');db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e;}
    res.json({added,updated,unchanged:unchangedCount,keptServer,stale,serverOnly:c.serverOnly.length});
  });
  router.get('/projects/:id/phases',(req,res)=>{
    const u=res.locals.user,pid=req.params.id;if(!access(u,pid))return res.status(403).json({message:'Bạn không có quyền xem dự án này.'});
    const rows=db.prepare('SELECT * FROM project_phases WHERE project_id=? ORDER BY sort_order,rowid').all(pid);
    res.json({phases:rows.map(phaseOut)});
  });
  router.post('/projects/:id/phases',(req,res)=>{
    const u=res.locals.user,pid=req.params.id;if(!access(u,pid))return res.status(403).json({message:'Bạn không có quyền cập nhật dự án này.'});
    const {name,kind,description,budget,sortOrder,brief}=req.body??{};
    if(!str(name,200)||!name.trim())return res.status(400).json({message:'Vui lòng nhập tên phase.'});
    if(kind!==undefined&&!phaseKinds.includes(kind))return res.status(400).json({message:'Loại phase không hợp lệ.'});
    if(description!==undefined&&!str(description,2000))return res.status(400).json({message:'Mô tả phase quá dài.'});
    if(budget!==undefined&&budget!==null&&!money(budget))return res.status(400).json({message:'Ngân sách phase không hợp lệ.'});
    if(sortOrder!==undefined&&(!Number.isSafeInteger(sortOrder)||sortOrder<0||sortOrder>1000))return res.status(400).json({message:'Thứ tự phase không hợp lệ.'});
    const cleanBrief=cleanPhaseBrief(brief);if(cleanBrief===undefined)return res.status(400).json({message:'Brief của phase không hợp lệ.'});
    const id=randomUUID();const now=new Date().toISOString();
    const order=sortOrder??(((db.prepare('SELECT MAX(sort_order) AS m FROM project_phases WHERE project_id=?').get(pid) as any)?.m??-1)+1);
    db.prepare('INSERT INTO project_phases(id,project_id,name,kind,description,budget,sort_order,brief_json,revision,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,1,?,?)').run(id,pid,name.trim(),kind??'other',(description??'').trim(),budget??null,order,cleanBrief?JSON.stringify(cleanBrief):null,now,now);
    audit(u.id,'create_phase',id);res.json({id});
  });
  router.patch('/projects/:id/phases/:phaseId',(req,res)=>{
    const u=res.locals.user,pid=req.params.id;if(!access(u,pid))return res.status(403).json({message:'Bạn không có quyền cập nhật dự án này.'});
    const row=db.prepare('SELECT * FROM project_phases WHERE id=? AND project_id=?').get(req.params.phaseId,pid) as any;
    if(!row)return res.status(404).json({message:'Không tìm thấy phase trong dự án.'});
    if(req.body?.revision!==row.revision)return res.status(409).json({message:'Phase đã thay đổi. Tải lại trước khi lưu.'});
    const name=req.body.name!==undefined?req.body.name:row.name;
    const kind=req.body.kind!==undefined?req.body.kind:row.kind;
    const description=req.body.description!==undefined?req.body.description:row.description;
    const budget=req.body.budget!==undefined?req.body.budget:row.budget;
    const sortOrder=req.body.sortOrder!==undefined?req.body.sortOrder:row.sort_order;
    if(!str(name,200)||!name.trim()||!phaseKinds.includes(kind)||!str(description,2000)||(budget!==null&&!money(budget))||!Number.isSafeInteger(sortOrder)||sortOrder<0||sortOrder>1000)return res.status(400).json({message:'Thông tin phase không hợp lệ.'});
    let briefJson=row.brief_json;
    if('brief' in req.body){const cleanBrief=cleanPhaseBrief(req.body.brief);if(cleanBrief===undefined)return res.status(400).json({message:'Brief của phase không hợp lệ.'});briefJson=cleanBrief?JSON.stringify(cleanBrief):null;}
    db.prepare('UPDATE project_phases SET name=?,kind=?,description=?,budget=?,sort_order=?,brief_json=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?').run(name.trim(),kind,description.trim(),budget,sortOrder,briefJson,new Date().toISOString(),row.id,row.revision);
    audit(u.id,'update_phase',row.id);res.json({success:true});
  });
  // Xoá phase qua POST (quy ước của app: mọi thao tác ghi đều là POST + JSON; DELETE không body bị guard 415 chặn).
  router.post('/projects/:id/phases/:phaseId/delete',(req,res)=>{
    const u=res.locals.user,pid=req.params.id;if(!access(u,pid))return res.status(403).json({message:'Bạn không có quyền cập nhật dự án này.'});
    const row=db.prepare('SELECT * FROM project_phases WHERE id=? AND project_id=?').get(req.params.phaseId,pid) as any;
    if(!row)return res.status(404).json({message:'Không tìm thấy phase trong dự án.'});
    const used=(db.prepare('SELECT COUNT(*) AS c FROM project_shortlist WHERE project_id=? AND phase_id=?').get(pid,row.id) as any).c;
    if(used>0)return res.status(400).json({message:`Phase còn ${used} KOL trong danh sách. Chuyển các KOL sang phase khác trước khi xoá.`});
    db.prepare('DELETE FROM project_phases WHERE id=?').run(row.id);audit(u.id,'delete_phase',row.id);res.json({success:true});
  });
  router.post('/projects/:id/shortlist/:rowId/remove',(req,res)=>{
    const u=res.locals.user,pid=req.params.id;if(!access(u,pid))return res.status(403).json({message:'Bạn không có quyền cập nhật danh sách dự án.'});
    const row=db.prepare('SELECT * FROM project_shortlist WHERE id=? AND project_id=?').get(req.params.rowId,pid) as any;if(!row)return res.status(404).json({message:'Không tìm thấy KOL trong dự án.'});
    db.prepare('DELETE FROM project_shortlist WHERE id=?').run(row.id);audit(u.id,'remove_project_shortlist',row.id);res.json({success:true});
  });
  router.post('/projects/:id/shortlist/:rowId/phase',(req,res)=>{
    const u=res.locals.user,pid=req.params.id;if(!access(u,pid))return res.status(403).json({message:'Bạn không có quyền cập nhật danh sách dự án.'});
    const row=db.prepare('SELECT * FROM project_shortlist WHERE id=? AND project_id=?').get(req.params.rowId,pid) as any;if(!row)return res.status(404).json({message:'Không tìm thấy KOL trong dự án.'});
    const phaseId=req.body?.phaseId??null;
    if(phaseId!==null){if(typeof phaseId!=='string')return res.status(400).json({message:'Phase không hợp lệ.'});const ph=db.prepare('SELECT id FROM project_phases WHERE id=? AND project_id=?').get(phaseId,pid);if(!ph)return res.status(400).json({message:'Phase không thuộc dự án này.'});}
    db.prepare('UPDATE project_shortlist SET phase_id=? WHERE id=?').run(phaseId,row.id);audit(u.id,'move_shortlist_phase',row.id);res.json({success:true});
  });
  router.get('/projects/:id/shortlist',(req,res)=>{
    const u=res.locals.user,pid=req.params.id;if(!access(u,pid))return res.status(403).json({message:'Bạn không có quyền xem dự án này.'});
    const b=db.prepare('SELECT * FROM project_briefs WHERE project_id=?').get(pid) as any;
    const catalog=db.prepare('SELECT profile_json FROM kol_catalog WHERE organization_id=? ORDER BY rowid').all(u.organization_id).map((r:any)=>(()=>{const {engagementRate,...p}=JSON.parse(r.profile_json);return p;})());
    const brief=readProjectBrief(b?JSON.parse(b.payload_json):null);
    // Không cắt Top N; số KOL mục tiêu chỉ để PM đối chiếu khi chọn phương án.
    const matches=catalog.filter(p=>assessProjectKol(p,brief).matches);
    const rows=db.prepare('SELECT * FROM project_shortlist WHERE project_id=? ORDER BY rowid').all(pid).map((r:any)=>({id:r.id,catalogId:r.catalog_id,profile:(()=>{const {engagementRate,...p}=JSON.parse(r.profile_json);return p;})(),prices:JSON.parse(r.prices_json),revision:r.revision,phaseId:r.phase_id??null}));
    res.json({brief,briefRevision:b?.revision??0,canManage:access(u,pid,true),canImport:u.organization_role==='admin',catalogCount:catalog.length,matches,rows});
  });
  router.post('/projects/:id/brief',(req,res)=>{
    const u=res.locals.user,pid=req.params.id;if(!access(u,pid,true))return res.status(403).json({message:'Chỉ PM/Admin được duyệt brief chung.'});
    const b=readProjectBrief(req.body.brief);
    if(!b||!str(b.text,10000)||!str(b.category,100)||!str(b.keyword,200)||!str(b.platform,50)||!Number.isSafeInteger(b.minFollowers)||b.minFollowers<0||!['campaign','per_kol'].includes(b.deliverableScope)||!Array.isArray(b.deliverables)||b.deliverables.length>6||b.deliverables.some((d:any)=>!d||!formats.includes(d.format)||!Number.isSafeInteger(d.quantity)||d.quantity<1||d.quantity>100000)||new Set(b.deliverables.map(d=>d.format)).size!==b.deliverables.length||(b.targetCount!==null&&(!Number.isSafeInteger(b.targetCount)||b.targetCount<1||b.targetCount>100000))||!money(b.budget))return res.status(400).json({message:'Kiểm tra brief, tiêu chí, số lượng mục tiêu và ngân sách.'});
    const old=db.prepare('SELECT revision FROM project_briefs WHERE project_id=?').get(pid) as any;
    if(req.body.revision!==(old?.revision??0))return res.status(409).json({message:'Brief đã thay đổi. Tải lại trước khi lưu.'});
    const clean={...b,deliverables:b.deliverables.map(d=>({format:d.format,quantity:d.quantity}))};
    db.prepare('INSERT INTO project_briefs VALUES (?,?,1) ON CONFLICT(project_id) DO UPDATE SET payload_json=excluded.payload_json,revision=revision+1').run(pid,JSON.stringify(clean));audit(u.id,'save_project_brief',pid);res.json({success:true});
  });
  router.post('/projects/:id/catalog/import',(req,res)=>{
    const u=res.locals.user;if(!access(u,req.params.id)||u.organization_role!=='admin')return res.status(403).json({message:'Chỉ Admin được nhập thư viện từ trình duyệt.'});
    if(!Array.isArray(req.body.profiles)||req.body.profiles.length>500)return res.status(400).json({message:'Mỗi lần nhập tối đa 500 KOL.'});
    const profiles=req.body.profiles.map(profile);if(profiles.some((p:any)=>!p)||new Set(profiles.map((p:any)=>p!.id)).size!==profiles.length)return res.status(400).json({message:'Dữ liệu KOL không hợp lệ hoặc trùng mã. Không có thay đổi nào được lưu.'});
    let added=0,updated=0,unchanged=0;
    const now=new Date().toISOString();
    db.exec('BEGIN');try{
      for(const p of profiles){
        const row=db.prepare('SELECT profile_json FROM kol_catalog WHERE id=? AND organization_id=?').get(p!.id,u.organization_id) as any;
        if(!row){
          db.prepare('INSERT INTO kol_catalog VALUES (?,?,?,?,?)').run(p!.id,u.organization_id,JSON.stringify(withServerDate(p,now)),1,now);
          added++;
        }else if(profileKey(JSON.parse(row.profile_json))!==profileKey(p)){
          // Chỉ ghi khi nội dung thật sự đổi (không tính ngày cập nhật); ngày chính thức do server ghi.
          const fallback=(()=>{try{const old=JSON.parse(row.profile_json);return typeof old.ngayCapNhatNguon==='string'?old.ngayCapNhatNguon:undefined;}catch{return undefined;}})();
          db.prepare('UPDATE kol_catalog SET profile_json=?,revision=revision+1,updated_at=? WHERE id=? AND organization_id=?').run(JSON.stringify(withServerDate(p,now,fallback)),now,p!.id,u.organization_id);
          updated++;
        }else{
          unchanged++;
        }
      }
      const catalogRows=db.prepare('SELECT id FROM kol_catalog WHERE organization_id=?').all(u.organization_id) as any[];
      const payloadIds=new Set(profiles.map((p:any)=>p!.id));
      const onlyInCatalog=catalogRows.filter((r:any)=>!payloadIds.has(r.id)).length;
      audit(u.id,'sync_kol_catalog',req.params.id);
      db.exec('COMMIT');
      res.json({added,updated,unchanged,onlyInCatalog});
    }catch(e){db.exec('ROLLBACK');throw e;}
  });
  router.post('/projects/:id/catalog/create',(req,res)=>{
    const u=res.locals.user;if(!access(u,req.params.id))return res.status(403).json({message:'Bạn không có quyền thêm KOL trong dự án này.'});
    const p=profile({...req.body.profile,id:randomUUID(),ngayCapNhat:new Date().toISOString()});if(!p)return res.status(400).json({message:'Kiểm tra tên, lĩnh vực, nền tảng, follower và giá KOL.'});
    db.prepare('INSERT INTO kol_catalog VALUES (?,?,?,?,?)').run(p.id,u.organization_id,JSON.stringify(p),1,new Date().toISOString());audit(u.id,'create_catalog_kol',p.id);res.json({id:p.id});
  });
  router.post('/projects/:id/shortlist/add',(req,res)=>{
    const u=res.locals.user,pid=req.params.id;if(!access(u,pid))return res.status(403).json({message:'Bạn không có quyền cập nhật danh sách dự án.'});
    if(!Array.isArray(req.body.ids)||!req.body.ids.length||req.body.ids.length>500||req.body.ids.some((id:any)=>typeof id!=='string'))return res.status(400).json({message:'Chọn KOL cần thêm.'});
    let phaseId=req.body.phaseId??null;
    if(phaseId!==null){if(typeof phaseId!=='string')return res.status(400).json({message:'Phase không hợp lệ.'});const ph=db.prepare('SELECT id FROM project_phases WHERE id=? AND project_id=?').get(phaseId,pid);if(!ph)return res.status(400).json({message:'Phase không thuộc dự án này.'});}
    else{const first=db.prepare('SELECT id FROM project_phases WHERE project_id=? ORDER BY sort_order,rowid LIMIT 1').get(pid) as any;phaseId=first?.id??null;}
    const profiles=req.body.ids.map((id:string)=>db.prepare('SELECT profile_json FROM kol_catalog WHERE id=? AND organization_id=?').get(id,u.organization_id) as any);
    if(profiles.some((p:any)=>!p))return res.status(400).json({message:'KOL không thuộc thư viện công ty.'});
    const existing=req.body.ids.map((id:string)=>db.prepare('SELECT catalog_id,phase_id FROM project_shortlist WHERE project_id=? AND catalog_id=?').get(pid,id) as any).filter(Boolean).map((r:any)=>({id:r.catalog_id,phaseId:r.phase_id??null}));
    let added=0;db.exec('BEGIN');try{for(const row of profiles){const p=JSON.parse(row.profile_json);const prices=Object.fromEntries(formats.map(f=>[f,{value:p.bangGia[f],status:p.bangGia[f]===null?'waiting':'unconfirmed',source:'',checkedAt:null,checkedBy:null}]));added+=Number(db.prepare('INSERT OR IGNORE INTO project_shortlist(id,project_id,catalog_id,profile_json,prices_json,revision,phase_id) VALUES (?,?,?,?,?,1,?)').run(randomUUID(),pid,p.id,JSON.stringify(p),JSON.stringify(prices),phaseId).changes);}audit(u.id,'add_project_shortlist',pid);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
    res.json({added,existing});
  });
  router.post('/projects/:id/shortlist/:rowId/prices',(req,res)=>{
    const u=res.locals.user,pid=req.params.id;if(!access(u,pid))return res.status(403).json({message:'Bạn không có quyền cập nhật giá dự án.'});
    const row=db.prepare('SELECT * FROM project_shortlist WHERE id=? AND project_id=?').get(req.params.rowId,pid) as any;if(!row)return res.status(404).json({message:'Không tìm thấy KOL trong dự án.'});
    if(req.body.revision!==row.revision)return res.status(409).json({message:'Giá vừa được người khác cập nhật. Tải lại trước khi lưu.'});
    const {format,value,source,confirm}=req.body;if(!formats.includes(format)||!money(value)||!str(source,1000)||typeof confirm!=='boolean'||(confirm&&(value===null||!source.trim())))return res.status(400).json({message:'Xác nhận giá cần có số tiền và nguồn kiểm tra. Giá 0 là miễn phí; để trống là chưa có giá.'});
    const prices=JSON.parse(row.prices_json);prices[format]={value,source:source.trim(),status:value===null?'waiting':confirm?'confirmed':'unconfirmed',checkedAt:confirm?new Date().toISOString():null,checkedBy:confirm?u.id:null};
    db.prepare('UPDATE project_shortlist SET prices_json=?,revision=revision+1 WHERE id=? AND revision=?').run(JSON.stringify(prices),row.id,row.revision);audit(u.id,'verify_shortlist_price',row.id);res.json({success:true});
  });
  router.post('/projects/:id/quotes/:quoteId/refresh-prices',(req,res)=>{
    const u=res.locals.user,pid=req.params.id;if(!access(u,pid,true))return res.status(403).json({message:'Chỉ PM/Admin được cập nhật giá vào bản nháp.'});
    const q=db.prepare('SELECT q.* FROM project_quote_versions q JOIN project_options o ON o.id=q.option_id WHERE q.id=? AND o.project_id=?').get(req.params.quoteId,pid) as any;
    if(!q)return res.status(404).json({message:'Không tìm thấy báo giá.'});
    if(!['draft','changes_requested'].includes(q.status)||q.revision!==req.body.revision)return res.status(409).json({message:'Báo giá đã thay đổi hoặc bị khóa. Hãy tạo phiên bản mới hoặc tải lại.'});
    const p=JSON.parse(q.payload_json);let updated=0,missingPrice=0,unconfirmedPrice=0,skipped=0;
    for(const i of p.items){if(!i.shortlistId)continue;const row=db.prepare('SELECT prices_json FROM project_shortlist WHERE id=? AND project_id=?').get(i.shortlistId,pid) as any;const price=row?JSON.parse(row.prices_json)[i.format]:null;
      // Lấy giá mới nhất kèm trạng thái xác nhận vào bản nháp; dòng chưa xác nhận vẫn được lấy
      // nhưng cổng giá ở bước gửi duyệt/duyệt sẽ chặn cho tới khi xác nhận đủ.
      if(!price){skipped++;continue;}
      i.buyUnitPrice=price.value;i.priceSnapshot=price;updated++;
      if(price.value===null)missingPrice++;else if(price.status!=='confirmed')unconfirmedPrice++;
    }
    if(!validTotals(p))return res.status(400).json({message:'Tổng tiền vượt phạm vi hỗ trợ. Giảm số lượng hoặc kiểm tra giá.'});
    db.prepare('UPDATE project_quote_versions SET payload_json=?,revision=revision+1 WHERE id=? AND revision=?').run(JSON.stringify(p),q.id,q.revision);audit(u.id,'refresh_quote_buy_prices',q.id);res.json({success:true,updated,missingPrice,unconfirmedPrice,skipped});
  });
  router.post('/projects/:id/shortlist/to-option',(req,res)=>{
    const u=res.locals.user,pid=req.params.id;if(!access(u,pid,true))return res.status(403).json({message:'Chỉ PM/Admin được chọn KOL vào phương án.'});
    const {quoteId,revision,selections}=req.body;
    const q=db.prepare('SELECT q.* FROM project_quote_versions q JOIN project_options o ON o.id=q.option_id WHERE q.id=? AND o.project_id=?').get(typeof quoteId==='string'?quoteId:'',pid) as any;
    if(!q)return res.status(404).json({message:'Không tìm thấy báo giá trong dự án.'});
    if(!['draft','changes_requested'].includes(q.status)||q.revision!==revision)return res.status(409).json({message:'Báo giá đã thay đổi hoặc bị khóa. Chọn bản nháp mới nhất và tải lại.'});
    if(!Array.isArray(selections)||!selections.length||selections.length>500)return res.status(400).json({message:'Chọn KOL và hạng mục cần đưa vào phương án.'});
    const payload=JSON.parse(q.payload_json),newItems=[];const seen=new Set(payload.items.filter((i:any)=>i.shortlistId).map((i:any)=>i.shortlistId+':'+i.format));
    for(const s of selections){
      if(!s||!str(s.id,100)||!formats.includes(s.format)||!Number.isSafeInteger(s.quantity)||s.quantity<1||s.quantity>100000)return res.status(400).json({message:'Hạng mục và số lượng không hợp lệ.'});
      const row=db.prepare('SELECT * FROM project_shortlist WHERE id=? AND project_id=?').get(s.id,pid) as any;if(!row)return res.status(400).json({message:'KOL không thuộc danh sách dự án.'});
      const key=s.id+':'+s.format;if(seen.has(key))return res.status(409).json({message:'KOL và hạng mục này đã có trong phương án. Sửa số lượng ở báo giá.'});seen.add(key);
      // Bản nháp được phép chứa giá thiếu/chưa xác nhận (snapshot giữ nguyên trạng thái giá);
      // cổng giá ở server sẽ chặn gửi duyệt/duyệt/chốt cho tới khi giá được xác nhận đủ.
      const price=JSON.parse(row.prices_json)[s.format];
      const p=JSON.parse(row.profile_json);newItems.push({id:randomUUID(),creator:p.ten,description:PRICE_FORMAT_LABELS[s.format as keyof typeof PRICE_FORMAT_LABELS],phase:'',kind:'kol',quantity:s.quantity,buyUnitPrice:price.value,sellUnitPrice:null,included:true,shortlistId:row.id,format:s.format,priceSnapshot:price});
    }
    if(payload.items.length+newItems.length>500)return res.status(400).json({message:'Một báo giá hỗ trợ tối đa 500 hạng mục.'});
    payload.items.push(...newItems);if(!validTotals(payload))return res.status(400).json({message:'Tổng tiền vượt phạm vi hỗ trợ. Giảm số lượng hoặc kiểm tra giá.'});db.prepare("UPDATE project_quote_versions SET payload_json=?,revision=revision+1,status='draft' WHERE id=? AND revision=?").run(JSON.stringify(payload),q.id,q.revision);audit(u.id,'shortlist_to_option',q.id);
    res.json({success:true,added:newItems.length,missingPrice:newItems.filter(i=>i.buyUnitPrice===null).length,unconfirmedPrice:newItems.filter(i=>i.buyUnitPrice!==null&&i.priceSnapshot?.status!=='confirmed').length});
  });
}
