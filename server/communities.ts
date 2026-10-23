import type {Router} from 'express';
import type {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {communityIdFromLink, normalizeCommunityLinkKey} from '../src/domain/community';

// Kho Community chính thức trên server (Fanpage/Group — KHÔNG phải Creator/KOL).
// - Admin hệ thống quản lý (tạo/sửa/xoá/nhập); mọi tài khoản đã đăng nhập được tra cứu.
// - Mỗi hồ sơ có revision chống ghi đè; ngày cập nhật chính thức do server ghi.
// - Bảng giá là danh sách dịch vụ riêng của từng Community (đơn vị bài/video/gói…),
//   không dùng 6 format Creator. Không có chỉ số ER.
// - Nhập dữ liệu: xem trước -> áp dụng, khớp theo ID hoặc link nền tảng đã chuẩn hoá
//   (không gộp theo tên gần giống), kiểm tra đúng revision đã xem trước như nhập KOL.

const money=(v:any)=>v===null||(Number.isSafeInteger(v)&&v>=0&&v<=1e12);
const str=(v:any,max=1000)=>typeof v==='string'&&v.trim().length<=max;
const optStr=(v:any,max:number)=>v===undefined||v===null?'':(typeof v==='string'&&v.length<=max?v:null);

const INVALID_INSIGHT=new Set(['null','url','n/a','-','none','undefined']);
export function validInsightLink(v:any):string|undefined{
  if(typeof v!=='string')return undefined;
  const t=v.trim();
  if(!t||t.length>2000||INVALID_INSIGHT.has(t.toLowerCase()))return undefined;
  return /^https?:\/\//i.test(t)?t:undefined;
}

export function sanitizeCommunityService(v:any){
  if(!v||typeof v!=='object'||Array.isArray(v))return undefined;
  const ten=optStr(v.ten,200),moTa=optStr(v.moTa,1000),donViRaw=optStr(v.donVi,50),dieuKien=optStr(v.dieuKien,1000),nguon=optStr(v.nguon,500),ngayCapNhat=optStr(v.ngayCapNhat,40);
  if([ten,moTa,donViRaw,dieuKien,nguon,ngayCapNhat].some(x=>x===null))return undefined;
  if(!ten!.trim())return undefined;
  if(!(v.giaThamKhao===undefined||v.giaThamKhao===null||money(v.giaThamKhao)))return undefined;
  const id=typeof v.id==='string'&&v.id.trim()&&v.id.length<=100?v.id:randomUUID();
  return {id,ten:ten!.trim(),moTa:moTa??'',donVi:(donViRaw??'').trim()||'bài',giaThamKhao:v.giaThamKhao??null,dieuKien:dieuKien??'',nguon:nguon??'',ngayCapNhat:ngayCapNhat??''};
}

export function communityProfile(p:any){
  if(!p||!str(p.id,100)||!p.id.trim()||!str(p.ten,300)||!p.ten.trim())return null;
  if(p.loai!==undefined&&p.loai!=='page'&&p.loai!=='group')return null;
  if(p.loaiChiSo!==undefined&&p.loaiChiSo!=='followers'&&p.loaiChiSo!=='members')return null;
  if(p.nenTang!==undefined&&!str(p.nenTang,50))return null;
  const link=optStr(p.link,2000);if(link===null)return null;
  if(!Array.isArray(p.linhVuc??[])||(p.linhVuc??[]).length>50||(p.linhVuc??[]).some((v:any)=>!str(v,100)))return null;
  if(!(p.quyMo===undefined||p.quyMo===null||(Number.isSafeInteger(p.quyMo)&&p.quyMo>=0&&p.quyMo<=1e12)))return null;
  const ghiChuTep=optStr(p.ghiChuTep,2000);if(ghiChuTep===null)return null;
  const nguon=optStr(p.nguon,500);if(nguon===null)return null;
  let lienHe={tenNguoiLienHe:'',soDienThoai:'',emailZalo:'',ghiChu:''};
  if(p.lienHe!==undefined&&p.lienHe!==null){
    if(typeof p.lienHe!=='object'||Array.isArray(p.lienHe))return null;
    const tenNguoiLienHe=optStr(p.lienHe.tenNguoiLienHe,200),soDienThoai=optStr(p.lienHe.soDienThoai,50),emailZalo=optStr(p.lienHe.emailZalo,200),ghiChu=optStr(p.lienHe.ghiChu,1000);
    if([tenNguoiLienHe,soDienThoai,emailZalo,ghiChu].some(x=>x===null))return null;
    lienHe={tenNguoiLienHe:tenNguoiLienHe!,soDienThoai:soDienThoai!,emailZalo:emailZalo!,ghiChu:ghiChu!};
  }
  if(!Array.isArray(p.dichVu??[])||(p.dichVu??[]).length>50)return null;
  const dichVu:any[]=[];
  for(const s of p.dichVu??[]){const clean=sanitizeCommunityService(s);if(!clean)return null;dichVu.push(clean);}
  const linkInsight=validInsightLink(p.linkInsight);
  const clean:any={id:p.id,ten:p.ten.trim(),loai:p.loai==='group'?'group':'page',nenTang:(typeof p.nenTang==='string'&&p.nenTang.trim())?p.nenTang.trim():'Facebook',link:link??'',linhVuc:p.linhVuc??[],quyMo:p.quyMo??null,loaiChiSo:p.loaiChiSo==='members'?'members':'followers',...(linkInsight?{linkInsight}:{}),...(ghiChuTep?{ghiChuTep}:{}),lienHe,...(nguon?{nguon}:{}),dichVu,ngayTao:typeof p.ngayTao==='string'?p.ngayTao:undefined,ngayCapNhat:typeof p.ngayCapNhat==='string'?p.ngayCapNhat:undefined,...(typeof p.ngayCapNhatNguon==='string'&&p.ngayCapNhatNguon.length<=40?{ngayCapNhatNguon:p.ngayCapNhatNguon}:{})};
  if(JSON.stringify(clean).length>200000)return null;
  return clean;
}

const canonical=(v:any):string=>{
  if(v===undefined)return '';
  if(v===null||typeof v!=='object')return JSON.stringify(v)??'';
  if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
  const keys=Object.keys(v).filter(k=>v[k]!==undefined).sort();
  return '{'+keys.map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
};
const profileKey=(p:any)=>{const {ngayCapNhat,ngayCapNhatNguon,...rest}=p??{};return canonical(rest);};
const FIELD_LABELS:Record<string,string>={ten:'Tên',loai:'Loại Page/Group',nenTang:'Nền tảng',link:'Link',linhVuc:'Chủ đề',quyMo:'Quy mô',loaiChiSo:'Loại chỉ số',linkInsight:'Link insight',ghiChuTep:'Ghi chú tệp người xem',lienHe:'Liên hệ',nguon:'Nguồn',dichVu:'Bảng giá dịch vụ',ngayTao:'Ngày tạo'};

export function installCommunities(router:Router,db:DatabaseSync,audit:(a:string|null,b:string,c:string)=>unknown){
  db.exec(`CREATE TABLE IF NOT EXISTS community_catalog(id TEXT NOT NULL,organization_id TEXT NOT NULL,profile_json TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL DEFAULT '',PRIMARY KEY(id,organization_id));`);
  const isOrgAdmin=(u:any)=>u.organization_role==='admin';
  const rowOf=(orgId:string,id:string)=>db.prepare('SELECT * FROM community_catalog WHERE id=? AND organization_id=?').get(id,orgId) as any;
  const withServerDate=(p:any,now:string,fallbackNguon?:string)=>{
    const src=typeof p.ngayCapNhat==='string'&&p.ngayCapNhat&&p.ngayCapNhat!==now?p.ngayCapNhat:(typeof p.ngayCapNhatNguon==='string'&&p.ngayCapNhatNguon?p.ngayCapNhatNguon:fallbackNguon);
    return {...p,ngayCapNhat:now,...(src?{ngayCapNhatNguon:src}:{})};
  };
  const out=(r:any)=>{const p=JSON.parse(r.profile_json);return {...p,...(r.updated_at?{ngayCapNhat:r.updated_at}:{}),revision:r.revision,updatedAt:r.updated_at};};

  router.get('/communities',(req,res)=>{
    const u=res.locals.user;
    const rows=db.prepare('SELECT profile_json,revision,updated_at FROM community_catalog WHERE organization_id=? ORDER BY rowid').all(u.organization_id) as any[];
    res.json({communities:rows.map(out)});
  });
  router.post('/communities',(req,res)=>{
    const u=res.locals.user;if(!isOrgAdmin(u))return res.status(403).json({message:'Chỉ Admin hệ thống được quản lý kho Community.'});
    const now=new Date().toISOString();
    const raw=req.body?.profile??{};
    const id=typeof raw.id==='string'&&raw.id.trim()?raw.id:randomUUID();
    const p=communityProfile({...raw,id,ngayCapNhat:now});if(!p)return res.status(400).json({message:'Kiểm tra tên, loại Page/Group, nền tảng, link, quy mô và bảng giá dịch vụ của Community.'});
    if(rowOf(u.organization_id,p.id))return res.status(409).json({message:'Mã Community đã tồn tại trong kho.'});
    db.prepare('INSERT INTO community_catalog VALUES (?,?,?,?,?)').run(p.id,u.organization_id,JSON.stringify(p),1,now);audit(u.id,'create_community',p.id);res.json({id:p.id,revision:1,updatedAt:now});
  });
  router.post('/communities/:id/update',(req,res)=>{
    const u=res.locals.user;if(!isOrgAdmin(u))return res.status(403).json({message:'Chỉ Admin hệ thống được quản lý kho Community.'});
    const row=rowOf(u.organization_id,req.params.id);if(!row)return res.status(404).json({message:'Không tìm thấy Community trong kho.'});
    if(req.body?.revision!==row.revision)return res.status(409).json({message:'Hồ sơ đã có thay đổi mới hơn trên server. Tải lại dữ liệu trước khi lưu.'});
    const now=new Date().toISOString();
    const p=communityProfile({...req.body?.profile,id:row.id,ngayCapNhat:now});if(!p)return res.status(400).json({message:'Kiểm tra tên, loại Page/Group, nền tảng, link, quy mô và bảng giá dịch vụ của Community.'});
    const result=db.prepare('UPDATE community_catalog SET profile_json=?,revision=revision+1,updated_at=? WHERE id=? AND organization_id=? AND revision=?').run(JSON.stringify(p),now,row.id,u.organization_id,row.revision);
    if(!result.changes)return res.status(409).json({message:'Hồ sơ đã có thay đổi mới hơn trên server. Tải lại dữ liệu trước khi lưu.'});
    audit(u.id,'update_community',row.id);res.json({id:row.id,revision:row.revision+1,updatedAt:now});
  });
  router.post('/communities/:id/remove',(req,res)=>{
    const u=res.locals.user;if(!isOrgAdmin(u))return res.status(403).json({message:'Chỉ Admin hệ thống được quản lý kho Community.'});
    const row=rowOf(u.organization_id,req.params.id);if(!row)return res.status(404).json({message:'Không tìm thấy Community trong kho.'});
    if(req.body?.revision!==undefined&&req.body.revision!==row.revision)return res.status(409).json({message:'Hồ sơ đã có thay đổi mới hơn trên server. Tải lại dữ liệu trước khi xoá.'});
    db.prepare('DELETE FROM community_catalog WHERE id=? AND organization_id=?').run(row.id,u.organization_id);audit(u.id,'remove_community',row.id);res.json({success:true});
  });

  // ===== Nhập dữ liệu Community: xem trước -> áp dụng (chống ghi đè như nhập KOL) =====
  function resolveIncoming(rawProfiles:any[]){
    const out:any[]=[];
    for(const raw of rawProfiles){
      const base=(raw&&typeof raw==='object')?{...raw}:{};
      if(!base.id||typeof base.id!=='string'||!base.id.trim()){
        base.id=communityIdFromLink(typeof base.link==='string'?base.link:'')??randomUUID();
      }
      const p=communityProfile(base);
      if(!p)return null;
      out.push(p);
    }
    if(new Set(out.map(p=>p.id)).size!==out.length)return null;
    return out;
  }
  function classifyImport(u:any,rawProfiles:any[]){
    const profiles=resolveIncoming(rawProfiles);if(!profiles)return null;
    const serverRows=db.prepare('SELECT id,profile_json,revision FROM community_catalog WHERE organization_id=?').all(u.organization_id) as any[];
    const serverById=new Map(serverRows.map((r:any)=>[r.id,{profile:JSON.parse(r.profile_json),revision:r.revision}]));
    const serverByLink=new Map<string,any>();
    for(const r of serverRows){const p=JSON.parse(r.profile_json);const key=normalizeCommunityLinkKey(p.link??'');if(key&&!serverByLink.has(key))serverByLink.set(key,r.id);}
    const newItems:any[]=[],unchanged:any[]=[],conflicts:any[]=[];const importedIds=new Set<string>();const resolved:any[]=[];
    for(const incoming of profiles){
      let p=incoming;let server=serverById.get(p.id);let matchedBy:'id'|'link'='id';
      if(!server){
        const key=normalizeCommunityLinkKey(p.link??'');
        const sid=key?serverByLink.get(key):undefined;
        if(sid&&serverById.has(sid)){server=serverById.get(sid);matchedBy='link';p={...p,id:sid};}
      }
      resolved.push(p);
      importedIds.add(p.id);
      if(!server){newItems.push({id:p.id,ten:p.ten,revision:null});continue;}
      if(profileKey(server.profile)===profileKey(p)){unchanged.push({id:p.id,ten:p.ten,revision:server.revision,...(matchedBy==='link'?{matchedBy}:{})});continue;}
      const keys=new Set([...Object.keys(server.profile),...Object.keys(p)]);
      const differentFields=[...keys].filter(k=>k!=='ngayCapNhat'&&k!=='ngayCapNhatNguon'&&canonical(server.profile[k])!==canonical(p[k])).map(k=>FIELD_LABELS[k]??k);
      conflicts.push({id:p.id,ten:p.ten,differentFields,revision:server.revision,...(matchedBy==='link'?{matchedBy,importedId:incoming.id}:{})});
    }
    const serverOnly=serverRows.filter((r:any)=>!importedIds.has(r.id)).map((r:any)=>({id:r.id,ten:JSON.parse(r.profile_json).ten}));
    return {profiles:resolved,newItems,unchanged,conflicts,serverOnly};
  }
  router.post('/communities/import/preview',(req,res)=>{
    const u=res.locals.user;if(!isOrgAdmin(u))return res.status(403).json({message:'Chỉ Admin hệ thống được nhập dữ liệu Community.'});
    if(!Array.isArray(req.body?.profiles)||req.body.profiles.length>500)return res.status(400).json({message:'Dữ liệu nhập tối đa 500 hồ sơ mỗi lần.'});
    const c=classifyImport(u,req.body.profiles);if(!c)return res.status(400).json({message:'Dữ liệu nhập không hợp lệ hoặc trùng mã hồ sơ.'});
    res.json({newItems:c.newItems,unchanged:c.unchanged,conflicts:c.conflicts,serverOnly:c.serverOnly,resolvedProfiles:c.profiles});
  });
  router.post('/communities/import/apply',(req,res)=>{
    const u=res.locals.user;if(!isOrgAdmin(u))return res.status(403).json({message:'Chỉ Admin hệ thống được nhập dữ liệu Community.'});
    if(!Array.isArray(req.body?.profiles)||req.body.profiles.length>500)return res.status(400).json({message:'Dữ liệu nhập tối đa 500 hồ sơ mỗi lần.'});
    const resolutions=(req.body?.resolutions&&typeof req.body.resolutions==='object')?req.body.resolutions:{};
    const expected=(req.body?.expectedRevisions&&typeof req.body.expectedRevisions==='object')?req.body.expectedRevisions:{};
    const c=classifyImport(u,req.body.profiles);if(!c)return res.status(400).json({message:'Dữ liệu nhập không hợp lệ hoặc trùng mã hồ sơ.'});
    const now=new Date().toISOString();
    let added=0,updated=0,keptServer=0,unchangedCount=0;
    const stale:{id:string,ten:string,reason:string}[]=[];
    db.exec('BEGIN');try{
      const rowsNow=db.prepare('SELECT id,profile_json,revision FROM community_catalog WHERE organization_id=?').all(u.organization_id) as any[];
      const nowById=new Map(rowsNow.map((r:any)=>[r.id,{profile:JSON.parse(r.profile_json),revision:r.revision}]));
      for(const p of c.profiles){
        const row=nowById.get(p.id);
        if(row&&profileKey(row.profile)===profileKey(p)){unchangedCount++;continue;}
        if(!Object.prototype.hasOwnProperty.call(expected,p.id)){
          stale.push({id:p.id,ten:p.ten,reason:'Hồ sơ chưa được xem trước ở phiên bản hiện tại. Hãy xem trước lại trước khi áp dụng.'});continue;
        }
        const exp=expected[p.id];
        if(exp===null){
          if(row){stale.push({id:p.id,ten:p.ten,reason:'Hồ sơ đã được tạo trên server sau khi xem trước.'});continue;}
          db.prepare('INSERT INTO community_catalog VALUES (?,?,?,?,?)').run(p.id,u.organization_id,JSON.stringify(withServerDate(p,now)),1,now);added++;
          continue;
        }
        if(!row){stale.push({id:p.id,ten:p.ten,reason:'Hồ sơ đã bị xoá trên server sau khi xem trước.'});continue;}
        if(row.revision!==exp){stale.push({id:p.id,ten:p.ten,reason:'Hồ sơ đã được cập nhật trên server sau khi xem trước.'});continue;}
        if(resolutions[p.id]==='imported'){
          const fallback=typeof row.profile.ngayCapNhatNguon==='string'?row.profile.ngayCapNhatNguon:undefined;
          db.prepare('UPDATE community_catalog SET profile_json=?,revision=revision+1,updated_at=? WHERE id=? AND organization_id=?').run(JSON.stringify(withServerDate(p,now,fallback)),now,p.id,u.organization_id);updated++;
        }else keptServer++;
      }
      audit(u.id,'community_import_apply','');db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e;}
    res.json({added,updated,unchanged:unchangedCount,keptServer,stale,serverOnly:c.serverOnly.length});
  });
}
