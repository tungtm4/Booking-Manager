import type {Router} from 'express';
import type {DatabaseSync} from 'node:sqlite';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {partnerDocumentsRoot,SIGNING_FORMS} from './partnerSigning';
import {computeContractMoney,installmentAmountFromPercent,installmentPercentOfGross,isValidMoneyAmount,isValidTaxRate,CONTRACT_TAX_MODES} from '../src/domain/contractMoney';

// ===== Giai đoạn A2 — Module Hợp đồng cơ bản, dùng chung cho KOL và Community =====
// Một hợp đồng gắn đúng 1 đối tác (catalogId + loại) với 1 dự án (không có hợp đồng khung).
// Mọi thao tác list/detail/write/download đều enforce quyền TRÊN DỰ ÁN của hợp đồng
// (projectAccess) — hồ sơ tham chiếu dùng chung ở A1 KHÔNG kéo theo quyền xem hợp đồng.
// Thông tin bên ký + ngân hàng + thuế là SNAPSHOT độc lập chụp lúc tạo (tự điền từ hồ sơ
// A1 / lần ký gần nhất nhưng chỉ là gợi ý, Booking sửa theo thực tế dự án): sửa kho A1
// không bao giờ đổi hợp đồng đã lưu. Giấy tờ được GHIM bằng document id + sha256 và ghi
// tham chiếu vào partner_document_references nên không xoá được khi đang dùng.
// Tiền: client chỉ gửi (cách nhập NET/GROSS, số đã nhập, suất thuế, cách tính) — bộ ba
// NET/thuế/GROSS luôn do server tính lại bằng hàm thuần dùng chung, không nhận số client
// tự tính. Sau khi ĐÃ KÝ: khóa snapshot/số tiền/số hợp đồng (chặn + báo rõ), mọi lần sửa
// đều tăng revision và ghi lịch sử theo tên trường (không sao giá trị ngân hàng vào lịch sử).

export const CONTRACT_STATUSES=['draft','signed','completed','cancelled'] as const;
export const CONTRACT_STATUS_LABELS:Record<string,string>={draft:'Nháp',signed:'Đã ký',completed:'Hoàn tất',cancelled:'Đã huỷ'};
const PARTNER_TYPES=['kol','community'] as const;
const DOC_MIMES:Record<string,string>={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'};
// Chuyển trạng thái hợp lệ — không có đường "bỏ ký" hay nhảy thẳng nháp → hoàn tất.
const TRANSITIONS:Record<string,string[]>={draft:['draft','signed','cancelled'],signed:['signed','completed','cancelled'],completed:['completed'],cancelled:['cancelled']};

const emptySnapshot={legalName:'',signingForm:'',representative:'',taxCode:'',idNumber:'',address:'',certEmail:'',bankName:'',bankAccountName:'',bankAccountNumber:'',bankBranch:'',note:''};
type Snapshot=typeof emptySnapshot;

const str=(v:any,max:number)=>v===undefined||v===null?'':(typeof v==='string'&&v.length<=max?v.trim():null);
function sanitizeSnapshot(input:any):Snapshot|undefined{
  if(!input||typeof input!=='object'||Array.isArray(input))return undefined;
  const legalName=str(input.legalName,200),representative=str(input.representative,200),taxCode=str(input.taxCode,50),
    idNumber=str(input.idNumber,50),address=str(input.address,300),certEmail=str(input.certEmail,200),
    bankName=str(input.bankName,100),bankAccountName=str(input.bankAccountName,200),bankAccountNumber=str(input.bankAccountNumber,50),
    bankBranch=str(input.bankBranch,100),note=str(input.note,1000);
  if([legalName,representative,taxCode,idNumber,address,certEmail,bankName,bankAccountName,bankAccountNumber,bankBranch,note].some(v=>v===null))return undefined;
  const signingForm=input.signingForm===undefined||input.signingForm===null?'':input.signingForm;
  if(!(SIGNING_FORMS as readonly string[]).includes(signingForm)&&signingForm!=='')return undefined;
  if(certEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(certEmail))return undefined;
  return {legalName:legalName!,signingForm,representative:representative!,taxCode:taxCode!,idNumber:idNumber!,address:address!,certEmail:certEmail!,
    bankName:bankName!,bankAccountName:bankAccountName!,bankAccountNumber:bankAccountNumber!,bankBranch:bankBranch!,note:note!};
}

// Đầu vào tiền của client: hoặc vắng mặt hoàn toàn (nháp chưa có giá), hoặc đủ bộ
// (cách nhập + số nhập + suất + cách tính) và hợp lệ theo hàm thuần dùng chung.
function sanitizeMoney(input:any):{basis:string,amount:number,taxRate:number,taxMode:string}|null|undefined{
  if(input===undefined||input===null)return null;
  if(typeof input!=='object'||Array.isArray(input))return undefined;
  const {basis,amount,taxRate,taxMode}=input;
  if(basis!=='net'&&basis!=='gross')return undefined;
  if(!isValidMoneyAmount(amount))return undefined;
  if(!(CONTRACT_TAX_MODES as readonly string[]).includes(taxMode))return undefined;
  if(taxMode==='khong_thue')return {basis,amount,taxRate:0,taxMode};
  if(!isValidTaxRate(taxRate))return undefined;
  return {basis,amount,taxRate,taxMode};
}

const dateOk=(v:string)=>v===''||/^\d{4}-\d{2}-\d{2}$/.test(v);

export function installContracts(router:Router,db:DatabaseSync,projectAccess:(u:any,id:string,manage?:boolean)=>boolean,audit:(a:string|null,b:string,c:string)=>unknown,directory:string){
  db.exec(`CREATE TABLE IF NOT EXISTS contracts(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,project_id TEXT NOT NULL,partner_type TEXT NOT NULL,partner_id TEXT NOT NULL,contract_number TEXT NOT NULL DEFAULT '',contract_name TEXT NOT NULL DEFAULT '',sign_date TEXT NOT NULL DEFAULT '',start_date TEXT NOT NULL DEFAULT '',end_date TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'draft',note TEXT NOT NULL DEFAULT '',file_link TEXT NOT NULL DEFAULT '',snapshot_json TEXT NOT NULL,entry_basis TEXT NOT NULL DEFAULT '',entered_amount INTEGER,tax_rate REAL,tax_mode TEXT NOT NULL DEFAULT '',net_amount INTEGER,tax_amount INTEGER,gross_amount INTEGER,revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT '',created_by TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT '',updated_by TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS contract_installments(id TEXT PRIMARY KEY,contract_id TEXT NOT NULL,name TEXT NOT NULL DEFAULT '',amount INTEGER NOT NULL DEFAULT 0,milestone TEXT NOT NULL DEFAULT '',expected_date TEXT NOT NULL DEFAULT '',paid_amount INTEGER NOT NULL DEFAULT 0,paid_date TEXT NOT NULL DEFAULT '',note TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT '',created_by TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT '',updated_by TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS contract_documents(contract_id TEXT NOT NULL,document_id TEXT NOT NULL,sha256 TEXT NOT NULL,display_name TEXT NOT NULL,mime TEXT NOT NULL,PRIMARY KEY(contract_id,document_id));
    CREATE TABLE IF NOT EXISTS contract_history(id TEXT PRIMARY KEY,contract_id TEXT NOT NULL,revision INTEGER NOT NULL,actor_id TEXT NOT NULL DEFAULT '',actor_name TEXT NOT NULL DEFAULT '',action TEXT NOT NULL,detail_json TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT '');`);
  const filesRoot=partnerDocumentsRoot(directory);
  const partnerRow=(orgId:string,type:string,id:string)=>{
    const table=type==='kol'?'kol_catalog':'community_catalog';
    return db.prepare(`SELECT profile_json FROM ${table} WHERE id=? AND organization_id=?`).get(id,orgId) as any;
  };
  const partnerName=(orgId:string,type:string,id:string)=>{
    const row=partnerRow(orgId,type,id);
    if(!row)return '';
    try{const p=JSON.parse(row.profile_json);return String(p.ten??p.name??'');}catch{return '';}
  };
  const projectName=(orgId:string,projectId:string)=>(db.prepare('SELECT name FROM projects WHERE id=? AND organization_id=?').get(projectId,orgId) as any)?.name??'';
  const loadContract=(orgId:string,id:string)=>db.prepare('SELECT * FROM contracts WHERE id=? AND organization_id=?').get(id,orgId) as any;
  const canSee=(u:any,row:any)=>Boolean(row)&&projectAccess(u,row.project_id);
  const history=(contractId:string,revision:number,u:any,action:string,detail:any)=>{
    db.prepare('INSERT INTO contract_history VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),contractId,revision,u.id,u.display_name??'',action,JSON.stringify(detail??{}),new Date().toISOString());
  };
  const summaryOut=(orgId:string,r:any)=>({id:r.id,projectId:r.project_id,projectName:projectName(orgId,r.project_id),partnerType:r.partner_type,partnerId:r.partner_id,partnerName:partnerName(orgId,r.partner_type,r.partner_id),contractNumber:r.contract_number,contractName:r.contract_name,signDate:r.sign_date,status:r.status,statusLabel:CONTRACT_STATUS_LABELS[r.status]??r.status,netAmount:r.net_amount,taxAmount:r.tax_amount,grossAmount:r.gross_amount,revision:r.revision,updatedAt:r.updated_at});
  const installmentsOf=(contractId:string,gross:number|null)=>(db.prepare('SELECT * FROM contract_installments WHERE contract_id=? ORDER BY rowid').all(contractId) as any[]).map(r=>({
    id:r.id,name:r.name,amount:r.amount,milestone:r.milestone,expectedDate:r.expected_date,paidAmount:r.paid_amount,paidDate:r.paid_date,note:r.note,
    percentOfGross:gross===null?null:installmentPercentOfGross(gross,r.amount),
    status:r.amount>0&&r.paid_amount>=r.amount?'paid':r.paid_amount>0?'partial':'unpaid',
    statusLabel:r.amount>0&&r.paid_amount>=r.amount?'Đã trả đủ':r.paid_amount>0?'Đã trả một phần':'Chưa trả',
    revision:r.revision,updatedAt:r.updated_at,
  }));
  const detailOut=(orgId:string,r:any)=>{
    const installments=installmentsOf(r.id,r.gross_amount);
    const plannedTotal=installments.reduce((s,i)=>s+i.amount,0);
    const paidTotal=installments.reduce((s,i)=>s+i.paidAmount,0);
    return {...summaryOut(orgId,r),startDate:r.start_date,endDate:r.end_date,note:r.note,fileLink:r.file_link,
      snapshot:{...emptySnapshot,...JSON.parse(r.snapshot_json)},
      money:r.entry_basis?{basis:r.entry_basis,enteredAmount:r.entered_amount,taxRate:r.tax_rate,taxMode:r.tax_mode,net:r.net_amount,tax:r.tax_amount,gross:r.gross_amount}:null,
      documents:(db.prepare('SELECT document_id AS id,display_name AS name,mime,sha256 FROM contract_documents WHERE contract_id=? ORDER BY rowid').all(r.id) as any[]),
      installments,
      totals:{plannedTotal,paidTotal,gross:r.gross_amount,shortfall:r.gross_amount===null?null:Math.max(0,r.gross_amount-plannedTotal),overPlanned:r.gross_amount===null?false:plannedTotal>r.gross_amount},
      history:(db.prepare('SELECT revision,actor_name AS actorName,action,detail_json AS detailJson,created_at AS createdAt FROM contract_history WHERE contract_id=? ORDER BY rowid DESC LIMIT 100').all(r.id) as any[]).map(h=>({...h,detail:JSON.parse(h.detailJson||'{}'),detailJson:undefined})),
      createdAt:r.created_at};
  };
  // Điều kiện được đánh dấu ĐÃ KÝ: thông tin bên ký + hình thức ký + giá hợp lệ + thuế rõ ràng.
  // Giấy tờ ảnh KHÔNG bắt buộc.
  const signBlockers=(snapshot:Snapshot,money:{basis:string,amount:number,taxRate:number,taxMode:string}|null)=>{
    const blockers:string[]=[];
    if(!snapshot.legalName)blockers.push('thiếu tên pháp lý của bên ký');
    if(!snapshot.signingForm)blockers.push('thiếu hình thức ký');
    if(!money)blockers.push('thiếu giá hợp đồng (chọn nhập NET hoặc GROSS)');
    else{
      if(!(money.amount>0))blockers.push('giá hợp đồng phải lớn hơn 0');
      if(!money.taxMode)blockers.push('thiếu cách tính thuế');
      if(money.taxMode!=='khong_thue'&&money.taxRate===null)blockers.push('thiếu suất thuế');
    }
    return blockers;
  };
  const pinDocuments=(orgId:string,contractId:string,type:string,partnerId:string,docIds:unknown):string|null=>{
    if(docIds===undefined)return null;
    if(!Array.isArray(docIds)||docIds.some(d=>typeof d!=='string'))return 'Danh sách giấy tờ không hợp lệ.';
    const now=new Date().toISOString();
    const existing=db.prepare('SELECT document_id FROM contract_documents WHERE contract_id=?').all(contractId) as any[];
    const wanted=new Set(docIds);
    for(const row of existing)if(!wanted.has(row.document_id)){
      db.prepare('DELETE FROM contract_documents WHERE contract_id=? AND document_id=?').run(contractId,row.document_id);
      db.prepare('DELETE FROM partner_document_references WHERE document_id=? AND ref_type=? AND ref_id=?').run(row.document_id,'contract',contractId);
    }
    for(const docId of wanted){
      if(existing.some(r=>r.document_id===docId))continue;
      const doc=db.prepare('SELECT * FROM partner_documents WHERE id=? AND organization_id=? AND partner_type=? AND partner_id=?').get(docId,orgId,type,partnerId) as any;
      if(!doc)return 'Giấy tờ được chọn không thuộc về đối tác của hợp đồng này.';
      db.prepare('INSERT INTO contract_documents VALUES (?,?,?,?,?)').run(contractId,doc.id,doc.sha256,doc.display_name,doc.mime);
      db.prepare('INSERT OR IGNORE INTO partner_document_references VALUES (?,?,?,?)').run(doc.id,'contract',contractId,now);
    }
    return null;
  };

  // ---- Danh sách theo dự án ----
  router.get('/projects/:projectId/contracts',(req,res)=>{
    const u=res.locals.user;
    if(!projectAccess(u,req.params.projectId))return res.status(403).json({message:'Bạn không có quyền xem dự án này.'});
    const rows=db.prepare('SELECT * FROM contracts WHERE organization_id=? AND project_id=? ORDER BY rowid DESC').all(u.organization_id,req.params.projectId) as any[];
    res.json({contracts:rows.map(r=>summaryOut(u.organization_id,r))});
  });

  // ---- Tạo hợp đồng (trong dự án) ----
  router.post('/projects/:projectId/contracts',(req,res)=>{
    const u=res.locals.user;const projectId=req.params.projectId;
    if(!projectAccess(u,projectId))return res.status(403).json({message:'Bạn không có quyền thao tác trên dự án này.'});
    const b=req.body??{};
    const type=b.partnerType,id=b.partnerId;
    if(!(PARTNER_TYPES as readonly string[]).includes(type)||typeof id!=='string'||!id)return res.status(400).json({message:'Chọn đối tác (KOL hoặc Community) cho hợp đồng.'});
    if(!partnerRow(u.organization_id,type,id))return res.status(404).json({message:'Không tìm thấy đối tác trong kho.'});
    const snapshot=sanitizeSnapshot(b.snapshot??{});
    if(!snapshot)return res.status(400).json({message:'Kiểm tra lại thông tin bên ký (độ dài, hình thức ký, email chứng từ).'});
    const money=sanitizeMoney(b.money);
    if(money===undefined)return res.status(400).json({message:'Giá hợp đồng chưa hợp lệ: chọn nhập NET hoặc GROSS, số tiền nguyên không âm, suất thuế từ 0 đến dưới 100% kèm cách tính.'});
    const computed=money?computeContractMoney({basis:money.basis as any,amount:money.amount,taxRate:money.taxRate,taxMode:money.taxMode as any}):null;
    if(money&&!computed)return res.status(400).json({message:'Không tính được tiền hợp đồng từ thông tin đã nhập.'});
    const contractNumber=str(b.contractNumber,100),contractName=str(b.contractName,300),signDate=str(b.signDate,10),startDate=str(b.startDate,10),endDate=str(b.endDate,10),note=str(b.note,2000),fileLink=str(b.fileLink,500);
    if([contractNumber,contractName,signDate,startDate,endDate,note,fileLink].some(v=>v===null)||!dateOk(signDate!)||!dateOk(startDate!)||!dateOk(endDate!))return res.status(400).json({message:'Kiểm tra lại số/tên hợp đồng, ngày tháng (yyyy-mm-dd) và ghi chú.'});
    const status=b.status===undefined?'draft':b.status;
    if(status!=='draft'&&status!=='signed')return res.status(400).json({message:'Hợp đồng mới chỉ ở trạng thái Nháp hoặc Đã ký.'});
    if(status==='signed'){
      const blockers=signBlockers(snapshot,money);
      if(blockers.length)return res.status(400).json({message:`Chưa thể đánh dấu Đã ký: ${blockers.join('; ')}.`});
    }
    const cid=randomUUID();const now=new Date().toISOString();
    db.exec('BEGIN');
    try{
      db.prepare('INSERT INTO contracts(id,organization_id,project_id,partner_type,partner_id,contract_number,contract_name,sign_date,start_date,end_date,status,note,file_link,snapshot_json,entry_basis,entered_amount,tax_rate,tax_mode,net_amount,tax_amount,gross_amount,revision,created_at,created_by,updated_at,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?)')
        .run(cid,u.organization_id,projectId,type,id,contractNumber,contractName,signDate,startDate,endDate,status,note,fileLink,JSON.stringify(snapshot),
          money?money.basis:'',money?money.amount:null,money?money.taxRate:null,money?money.taxMode:'',computed?computed.net:null,computed?computed.tax:null,computed?computed.gross:null,now,u.id,now,u.id);
      const pinError=pinDocuments(u.organization_id,cid,type,id,b.documentIds);
      if(pinError){db.exec('ROLLBACK');return res.status(400).json({message:pinError});}
      history(cid,1,u,'create',{status});
      db.exec('COMMIT');
    }catch{try{db.exec('ROLLBACK');}catch{}return res.status(500).json({message:'Không tạo được hợp đồng. Vui lòng thử lại.'});}
    audit(u.id,'create_contract',cid);
    res.json({contract:detailOut(u.organization_id,loadContract(u.organization_id,cid))});
  });

  // ---- Gợi ý tạo hợp đồng: hồ sơ chung A1 + thông tin lần ký gần nhất (chỉ là gợi ý) ----
  router.get('/contracts/suggestion',(req,res)=>{
    const u=res.locals.user;
    const projectId=String(req.query.projectId??''),type=String(req.query.partnerType??''),partnerId=String(req.query.partnerId??'');
    if(!projectId||!projectAccess(u,projectId))return res.status(403).json({message:'Bạn không có quyền thao tác trên dự án này.'});
    if(!(PARTNER_TYPES as readonly string[]).includes(type)||!partnerId||!partnerRow(u.organization_id,type,partnerId))return res.status(404).json({message:'Không tìm thấy đối tác trong kho.'});
    const profileRow=db.prepare('SELECT payload_json FROM partner_signing_profiles WHERE organization_id=? AND partner_type=? AND partner_id=?').get(u.organization_id,type,partnerId) as any;
    const profile=profileRow?JSON.parse(profileRow.payload_json):null;
    // Lần ký gần nhất: chỉ trong các dự án người dùng hiện tại được xem (Admin: mọi dự án).
    const last=(db.prepare('SELECT * FROM contracts WHERE organization_id=? AND partner_type=? AND partner_id=? AND status<>\'cancelled\' ORDER BY rowid DESC').all(u.organization_id,type,partnerId) as any[])
      .find(r=>projectAccess(u,r.project_id));
    const documents=(db.prepare('SELECT id,display_name AS name,mime,sha256 FROM partner_documents WHERE organization_id=? AND partner_type=? AND partner_id=? ORDER BY rowid').all(u.organization_id,type,partnerId) as any[]);
    let suggestion:any=null;
    if(last){
      suggestion={snapshot:{...emptySnapshot,...JSON.parse(last.snapshot_json)},taxRate:last.tax_rate,taxMode:last.tax_mode,source:'last_contract',sourceLabel:`Lần ký gần nhất (${projectName(u.organization_id,last.project_id)||'dự án'}${last.contract_number?` · HĐ ${last.contract_number}`:''})`};
    }else if(profile){
      const {customTaxRate,customTaxMode,note:_note,...rest}=profile;
      suggestion={snapshot:{...emptySnapshot,...rest,note:''},taxRate:customTaxRate??null,taxMode:customTaxMode??'',source:'profile',sourceLabel:'Hồ sơ ký kết dùng chung trong kho đối tác'};
    }
    res.json({suggestion,documents});
  });

  // ---- Danh sách theo đối tác: chỉ các dự án người dùng được xem ----
  router.get('/partners/:type/:id/contracts',(req,res)=>{
    const u=res.locals.user;const type=req.params.type,id=req.params.id;
    if(!(PARTNER_TYPES as readonly string[]).includes(type))return res.status(400).json({message:'Loại đối tác không hợp lệ.'});
    if(!partnerRow(u.organization_id,type,id))return res.status(404).json({message:'Không tìm thấy đối tác trong kho.'});
    const rows=(db.prepare('SELECT * FROM contracts WHERE organization_id=? AND partner_type=? AND partner_id=? ORDER BY rowid DESC').all(u.organization_id,type,id) as any[])
      .filter(r=>projectAccess(u,r.project_id));
    res.json({contracts:rows.map(r=>summaryOut(u.organization_id,r))});
  });

  // ---- Chi tiết hợp đồng ----
  router.get('/contracts/:id',(req,res)=>{
    const u=res.locals.user;const row=loadContract(u.organization_id,req.params.id);
    if(!canSee(u,row))return res.status(404).json({message:'Không tìm thấy hợp đồng.'});
    res.json({contract:detailOut(u.organization_id,row)});
  });

  // ---- Cập nhật hợp đồng ----
  router.post('/contracts/:id',(req,res)=>{
    const u=res.locals.user;const row=loadContract(u.organization_id,req.params.id);
    if(!row)return res.status(404).json({message:'Không tìm thấy hợp đồng.'});
    if(!projectAccess(u,row.project_id))return res.status(403).json({message:'Bạn không có quyền thao tác trên dự án của hợp đồng này.'});
    if(req.body?.revision!==row.revision)return res.status(409).json({message:'Hợp đồng đã có thay đổi mới hơn. Tải lại trước khi lưu.'});
    if(row.status==='cancelled')return res.status(422).json({message:'Hợp đồng đã huỷ không sửa được.'});
    const b=req.body;
    const snapshot=b.snapshot===undefined?{...emptySnapshot,...JSON.parse(row.snapshot_json)}:sanitizeSnapshot(b.snapshot);
    if(!snapshot)return res.status(400).json({message:'Kiểm tra lại thông tin bên ký (độ dài, hình thức ký, email chứng từ).'});
    const moneyIn=b.money===undefined?(row.entry_basis?{basis:row.entry_basis,amount:row.entered_amount,taxRate:row.tax_rate,taxMode:row.tax_mode}:null):sanitizeMoney(b.money);
    if(moneyIn===undefined)return res.status(400).json({message:'Giá hợp đồng chưa hợp lệ: chọn nhập NET hoặc GROSS, số tiền nguyên không âm, suất thuế từ 0 đến dưới 100% kèm cách tính.'});
    const computed=moneyIn?computeContractMoney({basis:moneyIn.basis as any,amount:moneyIn.amount,taxRate:moneyIn.taxRate,taxMode:moneyIn.taxMode as any}):null;
    if(moneyIn&&!computed)return res.status(400).json({message:'Không tính được tiền hợp đồng từ thông tin đã nhập.'});
    const contractNumber=b.contractNumber===undefined?row.contract_number:str(b.contractNumber,100);
    const contractName=b.contractName===undefined?row.contract_name:str(b.contractName,300);
    const signDate=b.signDate===undefined?row.sign_date:str(b.signDate,10);
    const startDate=b.startDate===undefined?row.start_date:str(b.startDate,10);
    const endDate=b.endDate===undefined?row.end_date:str(b.endDate,10);
    const note=b.note===undefined?row.note:str(b.note,2000);
    const fileLink=b.fileLink===undefined?row.file_link:str(b.fileLink,500);
    if([contractNumber,contractName,signDate,startDate,endDate,note,fileLink].some(v=>v===null)||!dateOk(signDate!)||!dateOk(startDate!)||!dateOk(endDate!))return res.status(400).json({message:'Kiểm tra lại số/tên hợp đồng, ngày tháng (yyyy-mm-dd) và ghi chú.'});
    const status=b.status===undefined?row.status:b.status;
    if(!(CONTRACT_STATUSES as readonly string[]).includes(status))return res.status(400).json({message:'Trạng thái hợp đồng không hợp lệ.'});
    if(!(TRANSITIONS[row.status]??[]).includes(status))return res.status(422).json({message:`Không thể chuyển hợp đồng từ "${CONTRACT_STATUS_LABELS[row.status]}" sang "${CONTRACT_STATUS_LABELS[status]}".`});
    if(status==='signed'&&row.status!=='signed'){
      const blockers=signBlockers(snapshot,moneyIn);
      if(blockers.length)return res.status(400).json({message:`Chưa thể đánh dấu Đã ký: ${blockers.join('; ')}.`});
    }
    // Sau khi đã ký/hoàn tất: snapshot, tiền, số hợp đồng và ngày ký là dữ kiện đã ký —
    // không ghi đè âm thầm; thay đổi thuộc các trường này bị chặn kèm thông điệp rõ ràng.
    const oldSnapshot={...emptySnapshot,...JSON.parse(row.snapshot_json)};
    const protectedChanged:string[]=[];
    if(row.status==='signed'||row.status==='completed'){
      if(JSON.stringify(snapshot)!==JSON.stringify(oldSnapshot))protectedChanged.push('thông tin bên ký/ngân hàng (snapshot)');
      const oldMoney=row.entry_basis?{basis:row.entry_basis,amount:row.entered_amount,taxRate:row.tax_rate,taxMode:row.tax_mode}:null;
      if(JSON.stringify(moneyIn)!==JSON.stringify(oldMoney))protectedChanged.push('giá/thuế của hợp đồng');
      if(contractNumber!==row.contract_number)protectedChanged.push('số hợp đồng');
      if(signDate!==row.sign_date)protectedChanged.push('ngày ký');
      if(b.documentIds!==undefined){
        // Gửi lại ĐÚNG tập giấy tờ đã ghim thì không phải là thay đổi — vẫn cho lưu các
        // trường được phép sửa; chỉ chặn khi tập giấy tờ THỰC SỰ khác đi (bất biến giữ nguyên).
        const currentIds=new Set((db.prepare('SELECT document_id FROM contract_documents WHERE contract_id=?').all(row.id) as any[]).map(r=>r.document_id));
        const wanted=Array.isArray(b.documentIds)?b.documentIds:null;
        if(!wanted||wanted.length!==currentIds.size||wanted.some((d:any)=>typeof d!=='string'||!currentIds.has(d)))protectedChanged.push('giấy tờ đã ghim');
      }
    }
    if(protectedChanged.length)return res.status(422).json({message:`Hợp đồng đã ký — không sửa được: ${protectedChanged.join(', ')}. Muốn thay đổi các thông tin này, hãy huỷ hợp đồng và tạo hợp đồng mới; lịch sử hợp đồng hiện tại được giữ nguyên.`});
    // Giá mới phải "đỡ" được kế hoạch thanh toán đã lập (áp dụng cả khi payload đồng
    // thời chuyển trạng thái sang Đã ký): không xoá giá khi đang có đợt thanh toán, và
    // không hạ tổng phải chi xuống dưới tổng các đợt đã lập hay tổng đã trả thực tế.
    const instAgg=db.prepare('SELECT COALESCE(SUM(amount),0) AS planned,COALESCE(SUM(paid_amount),0) AS paid,COUNT(*) AS n FROM contract_installments WHERE contract_id=?').get(row.id) as any;
    if(instAgg.n>0){
      if(moneyIn===null&&b.money!==undefined)return res.status(422).json({message:'Hợp đồng đang có đợt thanh toán — không xoá giá hợp đồng. Hãy xoá các đợt thanh toán trước, hoặc giữ nguyên giá.'});
      if(computed&&computed.gross<instAgg.planned)return res.status(422).json({message:`Giá trị hợp đồng mới (tổng phải chi ${computed.gross}) nhỏ hơn tổng các đợt thanh toán đã lập (${instAgg.planned}). Hãy giảm số tiền các đợt trước khi hạ giá.`});
      if(computed&&computed.gross<instAgg.paid)return res.status(422).json({message:`Giá trị hợp đồng mới (tổng phải chi ${computed.gross}) nhỏ hơn tổng số tiền đã trả thực tế (${instAgg.paid}). Không thể hạ giá xuống dưới số đã trả.`});
    }
    const changedFields:string[]=[];
    const track=(name:string,changed:boolean)=>{if(changed)changedFields.push(name);};
    track('snapshot',JSON.stringify(snapshot)!==JSON.stringify(oldSnapshot));
    track('money',JSON.stringify(moneyIn)!==JSON.stringify(row.entry_basis?{basis:row.entry_basis,amount:row.entered_amount,taxRate:row.tax_rate,taxMode:row.tax_mode}:null));
    track('contractNumber',contractNumber!==row.contract_number);track('contractName',contractName!==row.contract_name);
    track('signDate',signDate!==row.sign_date);track('startDate',startDate!==row.start_date);track('endDate',endDate!==row.end_date);
    track('note',note!==row.note);track('fileLink',fileLink!==row.file_link);
    const now=new Date().toISOString();
    db.exec('BEGIN');
    try{
      const result=db.prepare('UPDATE contracts SET contract_number=?,contract_name=?,sign_date=?,start_date=?,end_date=?,status=?,note=?,file_link=?,snapshot_json=?,entry_basis=?,entered_amount=?,tax_rate=?,tax_mode=?,net_amount=?,tax_amount=?,gross_amount=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=? AND revision=?')
        .run(contractNumber,contractName,signDate,startDate,endDate,status,note,fileLink,JSON.stringify(snapshot),moneyIn?moneyIn.basis:'',moneyIn?moneyIn.amount:null,moneyIn?moneyIn.taxRate:null,moneyIn?moneyIn.taxMode:'',computed?computed.net:null,computed?computed.tax:null,computed?computed.gross:null,now,u.id,row.id,row.revision);
      if(!result.changes){db.exec('ROLLBACK');return res.status(409).json({message:'Hợp đồng đã có thay đổi mới hơn. Tải lại trước khi lưu.'});}
      if(b.documentIds!==undefined&&row.status==='draft'){
        const pinError=pinDocuments(u.organization_id,row.id,row.partner_type,row.partner_id,b.documentIds);
        if(pinError){db.exec('ROLLBACK');return res.status(400).json({message:pinError});}
        changedFields.push('documents');
      }
      history(row.id,row.revision+1,u,status!==row.status?'status':'update',{changedFields,fromStatus:row.status,toStatus:status});
      db.exec('COMMIT');
    }catch{try{db.exec('ROLLBACK');}catch{}return res.status(500).json({message:'Không lưu được hợp đồng. Vui lòng thử lại.'});}
    audit(u.id,'update_contract',row.id);
    res.json({contract:detailOut(u.organization_id,loadContract(u.organization_id,row.id))});
  });

  // ---- Đợt thanh toán (cập nhật riêng, không qua payload hợp đồng) ----
  const installmentGuard=(req:any,res:any)=>{
    const u=res.locals.user;const row=loadContract(u.organization_id,req.params.id);
    if(!row){res.status(404).json({message:'Không tìm thấy hợp đồng.'});return null;}
    if(!projectAccess(u,row.project_id)){res.status(403).json({message:'Bạn không có quyền thao tác trên dự án của hợp đồng này.'});return null;}
    if(row.status==='cancelled'){res.status(422).json({message:'Hợp đồng đã huỷ không sửa được đợt thanh toán.'});return null;}
    return {u,row};
  };
  const plannedTotalExcept=(contractId:string,exceptId?:string)=>(db.prepare('SELECT COALESCE(SUM(amount),0) AS s FROM contract_installments WHERE contract_id=? AND id<>?').get(contractId,exceptId??'') as any).s as number;

  router.post('/contracts/:id/installments',(req,res)=>{
    const g=installmentGuard(req,res);if(!g)return;
    const {u,row}=g;const b=req.body??{};
    const name=str(b.name,200),milestone=str(b.milestone,300),expectedDate=str(b.expectedDate,10),note=str(b.note,1000);
    if([name,milestone,expectedDate,note].some(v=>v===null)||!dateOk(expectedDate!))return res.status(400).json({message:'Kiểm tra lại tên đợt, mốc điều kiện và ngày dự kiến.'});
    let amount:number|null=null;
    if(b.percent!==undefined&&b.percent!==null){
      if(row.gross_amount===null)return res.status(400).json({message:'Hợp đồng chưa có giá trị — nhập đợt theo số tiền, hoặc nhập giá hợp đồng trước khi nhập theo %.'});
      amount=installmentAmountFromPercent(row.gross_amount,b.percent);
      if(amount===null)return res.status(400).json({message:'Phần trăm đợt thanh toán phải từ 0 đến 100.'});
    }else{
      if(!isValidMoneyAmount(b.amount))return res.status(400).json({message:'Số tiền đợt thanh toán phải là số nguyên không âm.'});
      amount=b.amount;
    }
    if(amount===null)return res.status(400).json({message:'Thiếu số tiền đợt thanh toán.'});
    if(row.gross_amount!==null&&plannedTotalExcept(row.id)+amount>row.gross_amount)return res.status(400).json({message:'Tổng các đợt thanh toán vượt giá trị hợp đồng (tổng phải chi). Giảm số tiền đợt này hoặc điều chỉnh các đợt trước.'});
    const iid=randomUUID();const now=new Date().toISOString();
    db.prepare('INSERT INTO contract_installments VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?,?)').run(iid,row.id,name,amount,milestone,expectedDate,0,'',note,now,u.id,now,u.id);
    history(row.id,row.revision,u,'installment_add',{installmentId:iid,amount});
    audit(u.id,'add_contract_installment',row.id);
    res.json({contract:detailOut(u.organization_id,loadContract(u.organization_id,row.id))});
  });

  router.post('/contracts/:id/installments/:instId',(req,res)=>{
    const g=installmentGuard(req,res);if(!g)return;
    const {u,row}=g;
    const inst=db.prepare('SELECT * FROM contract_installments WHERE id=? AND contract_id=?').get(req.params.instId,row.id) as any;
    if(!inst)return res.status(404).json({message:'Không tìm thấy đợt thanh toán.'});
    if(req.body?.revision!==inst.revision)return res.status(409).json({message:'Đợt thanh toán đã có thay đổi mới hơn. Tải lại trước khi lưu.'});
    const b=req.body;
    const name=b.name===undefined?inst.name:str(b.name,200);
    const milestone=b.milestone===undefined?inst.milestone:str(b.milestone,300);
    const expectedDate=b.expectedDate===undefined?inst.expected_date:str(b.expectedDate,10);
    const note=b.note===undefined?inst.note:str(b.note,1000);
    if([name,milestone,expectedDate,note].some(v=>v===null)||!dateOk(expectedDate!))return res.status(400).json({message:'Kiểm tra lại tên đợt, mốc điều kiện và ngày dự kiến.'});
    let amount=inst.amount;
    if(b.percent!==undefined&&b.percent!==null){
      if(row.gross_amount===null)return res.status(400).json({message:'Hợp đồng chưa có giá trị — nhập đợt theo số tiền.'});
      const fromPercent=installmentAmountFromPercent(row.gross_amount,b.percent);
      if(fromPercent===null)return res.status(400).json({message:'Phần trăm đợt thanh toán phải từ 0 đến 100.'});
      amount=fromPercent;
    }else if(b.amount!==undefined){
      if(!isValidMoneyAmount(b.amount))return res.status(400).json({message:'Số tiền đợt thanh toán phải là số nguyên không âm.'});
      amount=b.amount;
    }
    const paidAmount=b.paidAmount===undefined?inst.paid_amount:b.paidAmount;
    if(!isValidMoneyAmount(paidAmount))return res.status(400).json({message:'Số tiền thực trả phải là số nguyên không âm.'});
    const paidDate=b.paidDate===undefined?inst.paid_date:str(b.paidDate,10);
    if(paidDate===null||!dateOk(paidDate!))return res.status(400).json({message:'Ngày thực trả chưa hợp lệ.'});
    if(paidAmount>amount)return res.status(400).json({message:'Số tiền thực trả vượt số tiền của đợt thanh toán này.'});
    if(paidAmount>0&&!paidDate)return res.status(400).json({message:'Đã nhập số tiền thực trả thì cần ghi ngày thực trả.'});
    if(row.gross_amount!==null&&plannedTotalExcept(row.id,inst.id)+amount>row.gross_amount)return res.status(400).json({message:'Tổng các đợt thanh toán vượt giá trị hợp đồng (tổng phải chi).'});
    const now=new Date().toISOString();
    const result=db.prepare('UPDATE contract_installments SET name=?,amount=?,milestone=?,expected_date=?,paid_amount=?,paid_date=?,note=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=? AND revision=?')
      .run(name,amount,milestone,expectedDate,paidAmount,paidDate,note,now,u.id,inst.id,inst.revision);
    if(!result.changes)return res.status(409).json({message:'Đợt thanh toán đã có thay đổi mới hơn. Tải lại trước khi lưu.'});
    history(row.id,row.revision,u,'installment_update',{installmentId:inst.id,amount,paidAmount});
    audit(u.id,'update_contract_installment',row.id);
    res.json({contract:detailOut(u.organization_id,loadContract(u.organization_id,row.id))});
  });

  router.post('/contracts/:id/installments/:instId/delete',(req,res)=>{
    const g=installmentGuard(req,res);if(!g)return;
    const {u,row}=g;
    const inst=db.prepare('SELECT * FROM contract_installments WHERE id=? AND contract_id=?').get(req.params.instId,row.id) as any;
    if(!inst)return res.status(404).json({message:'Không tìm thấy đợt thanh toán.'});
    if(req.body?.revision!==inst.revision)return res.status(409).json({message:'Đợt thanh toán đã có thay đổi mới hơn. Tải lại trước khi xoá.'});
    if(inst.paid_amount>0)return res.status(422).json({message:'Đợt thanh toán đã có tiền thực trả — không xoá để giữ lịch sử thanh toán.'});
    db.prepare('DELETE FROM contract_installments WHERE id=?').run(inst.id);
    history(row.id,row.revision,u,'installment_delete',{installmentId:inst.id,amount:inst.amount});
    audit(u.id,'delete_contract_installment',row.id);
    res.json({contract:detailOut(u.organization_id,loadContract(u.organization_id,row.id))});
  });

  // ---- Tải giấy tờ đã ghim vào snapshot (enforce quyền dự án + kiểm tra sha256 đã ghim) ----
  router.get('/contracts/:id/documents/:docId/content',(req,res)=>{
    const u=res.locals.user;const row=loadContract(u.organization_id,req.params.id);
    if(!canSee(u,row))return res.status(404).json({message:'Không tìm thấy hợp đồng.'});
    const pin=db.prepare('SELECT * FROM contract_documents WHERE contract_id=? AND document_id=?').get(row.id,req.params.docId) as any;
    if(!pin)return res.status(404).json({message:'Giấy tờ không thuộc snapshot của hợp đồng này.'});
    const doc=db.prepare('SELECT * FROM partner_documents WHERE id=? AND organization_id=?').get(req.params.docId,u.organization_id) as any;
    if(!doc)return res.status(404).json({message:'Không tìm thấy giấy tờ.'});
    if(path.basename(doc.stored_name)!==doc.stored_name)return res.status(500).json({message:'Hồ sơ giấy tờ không hợp lệ.'});
    let buf:Buffer;
    try{buf=readFileSync(path.join(filesRoot,doc.organization_id,doc.stored_name));}catch{return res.status(404).json({message:'File giấy tờ không còn trên máy chủ.'});}
    if(createHash('sha256').update(buf).digest('hex')!==pin.sha256)return res.status(500).json({message:'File giấy tờ không khớp bản đã ghim vào hợp đồng.'});
    res.setHeader('Content-Type',doc.mime);
    res.setHeader('Content-Disposition',`inline; filename="giay-to-hop-dong-${doc.id}${DOC_MIMES[doc.mime]??''}"`);
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.send(buf);
  });
}
