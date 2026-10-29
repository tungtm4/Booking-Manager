import type {Router} from 'express';
import type {DatabaseSync} from 'node:sqlite';
import {randomUUID,createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync,unlinkSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {validateImageFile} from './imageValidation';

// ===== Đợt A1 — Hồ sơ ký kết & ngân hàng THAM CHIẾU dùng chung cho KOL và Community =====
// Một kho tham chiếu duy nhất trong hệ thống nội bộ (đã đăng nhập): mọi người dùng nội bộ
// đọc được để hệ thống tự điền khi đưa đối tác vào dự án/lập hợp đồng; KHÔNG theo dự án cũ.
// Hợp đồng thật (đợt A2) vẫn theo quyền dự án và chụp snapshot riêng — sửa kho không đổi lịch sử.
// Giấy tờ tải lên là file BẤT BIẾN (không có endpoint ghi đè): mỗi file có sha256 để A2
// ghim đúng phiên bản vào snapshot. File nằm ngoài public/static, chỉ đọc qua API có xác thực.
// Tuyệt đối không ghi giá trị định danh/ngân hàng vào log hay thông báo lỗi.

export const SIGNING_FORMS=['ca_nhan','hkd','cong_ty'] as const;
export const TAX_MODES=['trong_gia_gop','tren_net'] as const;
const PARTNER_TYPES=['kol','community'] as const;
export const MAX_PARTNER_DOC_BYTES=5*1024*1024; // 5MB mỗi ảnh giấy tờ
const DOC_MIMES:Record<string,string>={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'};

const emptySigning={
  legalName:'',signingForm:'',representative:'',taxCode:'',idNumber:'',address:'',certEmail:'',
  bankName:'',bankAccountName:'',bankAccountNumber:'',bankBranch:'',
  customTaxRate:null as number|null,customTaxMode:'',note:'',
};
export type PartnerSigningProfile=typeof emptySigning;

const str=(v:any,max:number)=>v===undefined||v===null?'':(typeof v==='string'&&v.length<=max?v.trim():null);
function sanitizeSigning(input:any):PartnerSigningProfile|undefined{
  if(!input||typeof input!=='object'||Array.isArray(input))return undefined;
  const legalName=str(input.legalName,200),representative=str(input.representative,200),taxCode=str(input.taxCode,50),
    idNumber=str(input.idNumber,50),address=str(input.address,300),certEmail=str(input.certEmail,200),
    bankName=str(input.bankName,100),bankAccountName=str(input.bankAccountName,200),bankAccountNumber=str(input.bankAccountNumber,50),
    bankBranch=str(input.bankBranch,100),note=str(input.note,1000);
  if([legalName,representative,taxCode,idNumber,address,certEmail,bankName,bankAccountName,bankAccountNumber,bankBranch,note].some(v=>v===null))return undefined;
  const signingForm=input.signingForm===undefined||input.signingForm===null?'':input.signingForm;
  if(!(SIGNING_FORMS as readonly string[]).includes(signingForm)&&signingForm!=='')return undefined;
  if(certEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(certEmail))return undefined;
  let customTaxRate: number|null=null;
  if(input.customTaxRate!==undefined&&input.customTaxRate!==null&&input.customTaxRate!==''){
    if(typeof input.customTaxRate!=='number'||!Number.isFinite(input.customTaxRate)||input.customTaxRate<0||input.customTaxRate>100)return undefined;
    customTaxRate=Math.round(input.customTaxRate*100)/100;
  }
  let customTaxMode='';
  if(customTaxRate!==null){
    // Suất riêng luôn phải đi kèm cách tính — không tự đoán ý nghĩa tiền tệ.
    if(!(TAX_MODES as readonly string[]).includes(input.customTaxMode))return undefined;
    customTaxMode=input.customTaxMode;
  }
  return {legalName:legalName!,signingForm,representative:representative!,taxCode:taxCode!,idNumber:idNumber!,address:address!,certEmail:certEmail!,
    bankName:bankName!,bankAccountName:bankAccountName!,bankAccountNumber:bankAccountNumber!,bankBranch:bankBranch!,
    customTaxRate,customTaxMode,note:note!};
}

// Định dạng ảnh được xác thực bằng decoder sharp/libvips (server/imageValidation.ts):
// file phải giải mã được toàn bộ điểm ảnh — file giả gắn magic bytes, khung rỗng
// hay dữ liệu quét hỏng đều bị từ chối.
function sanitizeDisplayName(name:unknown):string{
  const raw=typeof name==='string'?name:'';
  const base=raw.split(/[\\/]/).pop()??'';
  const clean=base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g,'').trim().slice(0,120);
  return clean||'giay-to';
}

export function installPartnerSigning(router:Router,db:DatabaseSync,audit:(a:string|null,b:string,c:string)=>unknown,directory:string){
  db.exec(`CREATE TABLE IF NOT EXISTS partner_signing_profiles(organization_id TEXT NOT NULL,partner_type TEXT NOT NULL,partner_id TEXT NOT NULL,payload_json TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL DEFAULT '',updated_by TEXT NOT NULL DEFAULT '',PRIMARY KEY(organization_id,partner_type,partner_id));
    CREATE TABLE IF NOT EXISTS partner_documents(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,partner_type TEXT NOT NULL,partner_id TEXT NOT NULL,display_name TEXT NOT NULL,stored_name TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,sha256 TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT '',created_by TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS partner_document_references(document_id TEXT NOT NULL,ref_type TEXT NOT NULL,ref_id TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT '',PRIMARY KEY(document_id,ref_type,ref_id));`);
  // File giấy tờ: thư mục riêng dưới thư mục dữ liệu của workspace (.local — ngoài Git,
  // không nằm trong public/static). Chế độ in-memory (test) dùng thư mục tạm của hệ thống.
  const filesRoot=directory?path.join(directory,'partner-documents'):mkdtempSync(path.join(tmpdir(),'partner-docs-'));
  const partnerExists=(orgId:string,type:string,id:string)=>{
    const table=type==='kol'?'kol_catalog':'community_catalog';
    return Boolean(db.prepare(`SELECT id FROM ${table} WHERE id=? AND organization_id=?`).get(id,orgId));
  };
  // Đọc: mọi người dùng nội bộ đã đăng nhập (middleware auth của workspace đã chặn anonymous).
  // Sửa khối ký kết: Admin hệ thống, hoặc thành viên đang giữ vai trò PM/Booking ở ít nhất một
  // dự án — endpoint HẸP chỉ chạm khối ký kết, không mở quyền sửa toàn bộ kho (vẫn Admin-only).
  const canEdit=(u:any)=>u.organization_role==='admin'||Boolean(db.prepare(`SELECT 1 FROM project_member_roles r JOIN project_members m ON m.project_id=r.project_id AND m.user_id=r.user_id WHERE m.user_id=? AND m.active=1 AND r.role IN ('pm','booking','admin') LIMIT 1`).get(u.id));
  const parseTarget=(req:any)=>{
    const type=req.params.type,id=req.params.id;
    if(!(PARTNER_TYPES as readonly string[]).includes(type)||typeof id!=='string'||!id||id.length>100)return null;
    return {type,id};
  };
  const docOut=(r:any)=>({id:r.id,name:r.display_name,mime:r.mime,size:r.size,sha256:r.sha256,revision:r.revision,createdAt:r.created_at});
  const loadDocs=(orgId:string,type:string,id:string)=>(db.prepare('SELECT * FROM partner_documents WHERE organization_id=? AND partner_type=? AND partner_id=? ORDER BY rowid').all(orgId,type,id) as any[]).map(docOut);

  router.get('/partners/:type/:id/signing',(req,res)=>{
    const u=res.locals.user;const t=parseTarget(req);
    if(!t)return res.status(400).json({message:'Loại đối tác không hợp lệ.'});
    if(!partnerExists(u.organization_id,t.type,t.id))return res.status(404).json({message:'Không tìm thấy đối tác trong kho.'});
    const row=db.prepare('SELECT * FROM partner_signing_profiles WHERE organization_id=? AND partner_type=? AND partner_id=?').get(u.organization_id,t.type,t.id) as any;
    const profile=row?{...emptySigning,...JSON.parse(row.payload_json),revision:row.revision,updatedAt:row.updated_at,updatedBy:row.updated_by}:{...emptySigning,revision:0,updatedAt:'',updatedBy:''};
    res.json({profile,documents:loadDocs(u.organization_id,t.type,t.id),canEdit:canEdit(u)});
  });

  router.post('/partners/:type/:id/signing',(req,res)=>{
    const u=res.locals.user;const t=parseTarget(req);
    if(!t)return res.status(400).json({message:'Loại đối tác không hợp lệ.'});
    if(!partnerExists(u.organization_id,t.type,t.id))return res.status(404).json({message:'Không tìm thấy đối tác trong kho.'});
    if(!canEdit(u))return res.status(403).json({message:'Chỉ Admin, PM hoặc Booking mới được cập nhật hồ sơ ký kết.'});
    const clean=sanitizeSigning(req.body);if(!clean)return res.status(400).json({message:'Kiểm tra lại các trường hồ sơ ký kết (độ dài, hình thức ký, email chứng từ, suất thuế riêng và cách tính).'});
    const row=db.prepare('SELECT revision FROM partner_signing_profiles WHERE organization_id=? AND partner_type=? AND partner_id=?').get(u.organization_id,t.type,t.id) as any;
    if(req.body.revision!==(row?.revision??0))return res.status(409).json({message:'Hồ sơ ký kết đã có thay đổi mới hơn. Tải lại trước khi lưu.'});
    const now=new Date().toISOString();
    if(!row){
      db.prepare('INSERT INTO partner_signing_profiles VALUES (?,?,?,?,1,?,?)').run(u.organization_id,t.type,t.id,JSON.stringify(clean),now,u.id);
      audit(u.id,'update_partner_signing',`${t.type}:${t.id}`);return res.json({revision:1,updatedAt:now});
    }
    const result=db.prepare('UPDATE partner_signing_profiles SET payload_json=?,revision=revision+1,updated_at=?,updated_by=? WHERE organization_id=? AND partner_type=? AND partner_id=? AND revision=?').run(JSON.stringify(clean),now,u.id,u.organization_id,t.type,t.id,row.revision);
    if(!result.changes)return res.status(409).json({message:'Hồ sơ ký kết đã có thay đổi mới hơn. Tải lại trước khi lưu.'});
    audit(u.id,'update_partner_signing',`${t.type}:${t.id}`);res.json({revision:row.revision+1,updatedAt:now});
  });

  router.post('/partners/:type/:id/documents',async (req,res)=>{
    const u=res.locals.user;const t=parseTarget(req);
    if(!t)return res.status(400).json({message:'Loại đối tác không hợp lệ.'});
    if(!partnerExists(u.organization_id,t.type,t.id))return res.status(404).json({message:'Không tìm thấy đối tác trong kho.'});
    if(!canEdit(u))return res.status(403).json({message:'Chỉ Admin, PM hoặc Booking mới được tải giấy tờ lên.'});
    const dataBase64=req.body?.dataBase64;
    if(typeof dataBase64!=='string'||!dataBase64||dataBase64.length>Math.ceil(MAX_PARTNER_DOC_BYTES*4/3)+1024||!/^[A-Za-z0-9+/=\s]+$/.test(dataBase64))return res.status(400).json({message:'Dữ liệu file không hợp lệ hoặc vượt dung lượng cho phép.'});
    const buf=Buffer.from(dataBase64,'base64');
    if(!buf.length||buf.length>MAX_PARTNER_DOC_BYTES)return res.status(400).json({message:`Mỗi ảnh giấy tờ tối đa ${MAX_PARTNER_DOC_BYTES/1024/1024}MB.`});
    const detected=await validateImageFile(buf);
    if(!detected)return res.status(400).json({message:'Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP hợp lệ — file phải giải mã được toàn bộ.'});
    const sniffed=detected.mime;
    const declared=typeof req.body?.mime==='string'?req.body.mime:'';
    if(declared&&declared!==sniffed)return res.status(400).json({message:'Định dạng khai báo không khớp nội dung file.'});
    const orgDir=path.join(filesRoot,u.organization_id);mkdirSync(orgDir,{recursive:true,mode:0o700});
    const storedName=randomUUID()+DOC_MIMES[sniffed];
    // flag 'wx': không bao giờ ghi đè file đã tồn tại.
    writeFileSync(path.join(orgDir,storedName),buf,{flag:'wx',mode:0o600});
    const id=randomUUID();const now=new Date().toISOString();
    const sha256=createHash('sha256').update(buf).digest('hex');
    db.prepare('INSERT INTO partner_documents VALUES (?,?,?,?,?,?,?,?,?,1,?,?)').run(id,u.organization_id,t.type,t.id,sanitizeDisplayName(req.body?.name),storedName,sniffed,buf.length,sha256,now,u.id);
    audit(u.id,'upload_partner_document',id);
    res.json({document:docOut({id,display_name:sanitizeDisplayName(req.body?.name),mime:sniffed,size:buf.length,sha256,revision:1,created_at:now})});
  });

  router.get('/partners/:type/:id/documents/:docId/content',(req,res)=>{
    const u=res.locals.user;const t=parseTarget(req);
    if(!t)return res.status(400).json({message:'Loại đối tác không hợp lệ.'});
    const row=db.prepare('SELECT * FROM partner_documents WHERE id=? AND organization_id=? AND partner_type=? AND partner_id=?').get(req.params.docId,u.organization_id,t.type,t.id) as any;
    if(!row)return res.status(404).json({message:'Không tìm thấy giấy tờ.'});
    // Tên file lưu do server sinh (UUID + đuôi theo nội dung) — không dùng đầu vào người dùng
    // để dựng đường dẫn, nên không thể traversal ra ngoài thư mục giấy tờ.
    if(path.basename(row.stored_name)!==row.stored_name)return res.status(500).json({message:'Hồ sơ giấy tờ không hợp lệ.'});
    let buf:Buffer;
    try{buf=readFileSync(path.join(filesRoot,row.organization_id,row.stored_name));}catch{return res.status(404).json({message:'File giấy tờ không còn trên máy chủ.'});}
    res.setHeader('Content-Type',row.mime);
    res.setHeader('Content-Disposition',`inline; filename="giay-to-${row.id}${DOC_MIMES[row.mime]??''}"`);
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.send(buf);
  });

  router.post('/partners/:type/:id/documents/:docId/delete',(req,res)=>{
    const u=res.locals.user;const t=parseTarget(req);
    if(!t)return res.status(400).json({message:'Loại đối tác không hợp lệ.'});
    if(!canEdit(u))return res.status(403).json({message:'Chỉ Admin, PM hoặc Booking mới được xoá giấy tờ.'});
    const row=db.prepare('SELECT * FROM partner_documents WHERE id=? AND organization_id=? AND partner_type=? AND partner_id=?').get(req.params.docId,u.organization_id,t.type,t.id) as any;
    if(!row)return res.status(404).json({message:'Không tìm thấy giấy tờ.'});
    if(req.body?.revision!==row.revision)return res.status(409).json({message:'Giấy tờ đã thay đổi. Tải lại trước khi xoá.'});
    // Không xoá file đang được tham chiếu (snapshot hợp đồng ở A2 sẽ ghi tham chiếu tại đây).
    const refs=(db.prepare('SELECT COUNT(*) AS c FROM partner_document_references WHERE document_id=?').get(row.id) as any).c;
    if(refs>0)return res.status(409).json({message:'Giấy tờ đang được tham chiếu bởi hồ sơ khác nên không xoá được.'});
    db.prepare('DELETE FROM partner_documents WHERE id=?').run(row.id);
    try{unlinkSync(path.join(filesRoot,row.organization_id,row.stored_name));}catch{/* file đã mất — bản ghi là nguồn chính */}
    audit(u.id,'delete_partner_document',row.id);res.json({success:true});
  });
}
