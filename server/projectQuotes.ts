import type {Router} from 'express';
import type {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {calculateProjectFinance, type Adjustment} from '../src/domain/projectFinance';
import {readProjectBrief} from '../src/domain/projectBrief';
import {buildAllocatedQuoteItems, suggestAllocations, type AllocatedLine} from '../src/domain/phaseQuote';
import {PRICE_FORMAT_LABELS, type PriceFormatKey} from '../src/types/kol';
import {computeContractMoney,isValidMoneyAmount} from '../src/domain/contractMoney';
import {CONTRACT_STATUS_LABELS} from './contracts';

export interface ProjectQuoteItem {
  id:string; creator:string; description:string; phase:string;
  kind:'kol'|'community'|'buzz'|'seeding'|'production'|'other';
  quantity:number; buyUnitPrice:number|null; sellUnitPrice:number|null; included:boolean;
  shortlistId?:string; format?:string; priceSnapshot?:unknown;
  // Community/dịch vụ: đối tác thuộc loại nào; dịch vụ, đơn vị và điều kiện được CHỤP
  // tại thời điểm đưa vào phương án — đổi giá/điều kiện trong kho không tự đổi báo giá đã lưu.
  partnerType?:'kol'|'community'|'service'|'other';
  serviceId?:string; serviceName?:string; unit?:string; conditions?:string;
  // Dòng dịch vụ comment thuê ngoài PHẢI xác nhận giá đầu vào như dòng KOL nhập tay.
  // Cờ này do server đặt khi tạo dòng — client không tự đặt/gỡ được qua bản lưu.
  needsBuyConfirmation?:boolean;
  // Ghi chú HẠNG MỤC — nội dung phạm vi/điều kiện của riêng dòng này, ĐƯỢC xuất cho
  // khách (bản báo khách + bản in/PDF). Khác với conditions/nguồn giá là thông tin
  // nội bộ không xuất cho khách. Khi đưa dịch vụ vào phương án, ghi chú được chụp từ
  // điều kiện dịch vụ tại thời điểm đó; PM/Admin sửa được trong bản nháp; cập nhật
  // kho hoặc lấy lại giá KHÔNG ghi đè ghi chú đã chỉnh.
  note?:string;
  // Bối cảnh comment thuê ngoài: tổng comments mục tiêu của brief (chỉ để đối chiếu —
  // KHÔNG tự suy ra số lượng mua), phạm vi áp dụng và phần gói đã bao gồm để tránh tính trùng.
  // Cách tính gói: pricingMode='package' -> thành tiền = số gói (quantity) x giá gói;
  // commentsPerPackage là TRƯỜNG RIÊNG (số comment gồm trong mỗi gói) — tổng comment
  // thuê = số gói x số comment mỗi gói (includedComments), không nhân vào giá lần nữa.
  commentInfo?:{briefTargetTotal:number|null; scopeNote:string; includedNote:string; pricingMode?:'per_comment'|'package'; commentsPerPackage?:number|null; includedComments?:number|null};
  // Số lượng thực tế đã nghiệm thu (phân biệt với số lượng mục tiêu và số đã phân bổ).
  acceptedQty?:number|null;
  // Xác nhận giá đầu vào cho dòng nhập tay — CHỈ server ghi qua endpoint xác nhận,
  // client không tự đặt được (bản lưu luôn lấy từ dữ liệu server đã có).
  buyConfirmation?:{value:number; source:string; checkedBy:string; checkedByName:string; checkedAt:string};
  // Nguồn chi phí đầu vào có thuế (Giai đoạn B đợt đầu) — trường do SERVER sở hữu:
  // chỉ ghi qua endpoint nguồn chi phí chuyên dụng, bản lưu báo giá luôn khôi phục từ
  // bản đã lưu. NET/thuế/GROSS do server tính lại bằng hàm thuần dùng chung với hợp
  // đồng (contractMoney) — client không gửi số đã tính. Nguồn hợp đồng là PHÂN BỔ một
  // phần giá trị hợp đồng cho dòng này, không phải toàn bộ hợp đồng.
  costSource?:QuoteCostSource;
}
export interface QuoteCostSource {
  kind:'estimate'|'profile'|'contract';
  status:'du_kien'|'chot';
  partnerType?:'kol'|'community'; partnerId?:string;
  contractId?:string; contractNumber?:string; contractRevision?:number;
  profileRevision?:number;
  basis:'net'|'gross'; amount:number;
  taxRate:number; taxMode:string;
  net:number; tax:number; gross:number;
  appliedBy:string; appliedByName:string; appliedAt:string;
}
export interface QuotePayload {
  client:string; campaign:string; items:ProjectQuoteItem[];
  discount:Adjustment; agencyFee:Adjustment; taxRate:number;
}
const text=(v:unknown,max=1000)=>typeof v==='string'&&v.trim().length<=max?v.trim():null;
const validMoney=(v:unknown)=>v===null||(typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=1_000_000_000_000);
const adjustment=(v:any):v is Adjustment=>v&&['fixed','percent'].includes(v.mode)&&typeof v.value==='number'&&Number.isFinite(v.value)&&v.value>=0&&(v.mode!=='percent'||v.value<=100)&&v.value<=1_000_000_000_000;
function validate(payload: any): payload is QuotePayload {
  if(!payload||!Array.isArray(payload.items)||payload.items.length>500||!adjustment(payload.discount)||!adjustment(payload.agencyFee))return false;
  if(typeof payload.taxRate!=='number'||!Number.isFinite(payload.taxRate)||payload.taxRate<0||payload.taxRate>100)return false;
  const ids=new Set();
  for(const it of payload.items){
    if(!it||!text(it.id,100)||ids.has(it.id)||!text(it.creator,200)||!text(it.description)||text(it.phase,200)===null||!['kol','community','buzz','seeding','production','other'].includes(it.kind)||!Number.isSafeInteger(it.quantity)||it.quantity<=0||it.quantity>10000000||!validMoney(it.buyUnitPrice)||!validMoney(it.sellUnitPrice)||typeof it.included!=='boolean')return false;
    if(it.partnerType!==undefined&&!['kol','community','service','other'].includes(it.partnerType))return false;
    if(it.note!==undefined&&(typeof it.note!=='string'||it.note.length>2000))return false;
    if(it.acceptedQty!==undefined&&it.acceptedQty!==null&&(!Number.isSafeInteger(it.acceptedQty)||it.acceptedQty<0||it.acceptedQty>10000000))return false;
    ids.add(it.id);
  }
  return true;
}
const finance=(p:QuotePayload)=>{
  const totals=calculateProjectFinance(p);
  const tax=totals.revenueBeforeTax===null?null:Math.round(totals.revenueBeforeTax*p.taxRate/100);
  const totalWithTax=tax===null?null:totals.revenueBeforeTax!+tax;
  if(totalWithTax!==null&&!Number.isSafeInteger(totalWithTax))throw new Error('Tổng tiền vượt phạm vi hỗ trợ.');
  return {...totals,tax,totalWithTax};
};
// Cổng giá (kiểm soát ở server): chỉ các dòng ĐƯỢC TÍNH vào báo giá (included) mới chặn
// gửi duyệt / duyệt / chốt. Giá 0 là giá hợp lệ, không tính là thiếu giá.
// MỌI dòng KOL/Community được tính và MỌI dòng dịch vụ comment thuê ngoài đều phải có
// giá đầu vào ĐÃ XÁC NHẬN, bất kể tạo thủ công, từ danh sách hay từ phase:
// - Dòng lấy từ danh sách: xác nhận nằm trong priceSnapshot (Booking xác nhận ở danh sách).
// - Dòng nhập tay: xác nhận nằm trong buyConfirmation do server ghi qua endpoint xác nhận;
//   xác nhận chỉ còn hiệu lực khi giá hiện tại đúng bằng giá đã xác nhận (đổi giá = mất xác nhận).
// Chi phí trực tiếp khác chỉ cần có đủ giá, không có bước xác nhận riêng.
const needsConfirmation=(i:ProjectQuoteItem):boolean=>i.kind==='kol'||i.kind==='community'||i.needsBuyConfirmation===true;
const buyConfirmed=(i:ProjectQuoteItem):boolean=>{
  const snap=(i as unknown as {priceSnapshot?:{status?:string}}).priceSnapshot;
  if(snap)return snap.status==='confirmed';
  if(!needsConfirmation(i))return true;
  const c=i.buyConfirmation;
  return !!c&&c.value===i.buyUnitPrice;
};
const priceGate=(p:QuotePayload)=>{
  let missingBuy=0,missingSell=0,unconfirmedBuy=0;
  for(const i of p.items){
    if(!i.included)continue;
    if(i.buyUnitPrice===null)missingBuy++;
    if(i.sellUnitPrice===null)missingSell++;
    if(i.buyUnitPrice!==null&&needsConfirmation(i)&&!buyConfirmed(i))unconfirmedBuy++;
  }
  return {missingBuy,missingSell,unconfirmedBuy,ok:missingBuy===0&&missingSell===0&&unconfirmedBuy===0};
};
export const isCommentServiceLine=(i:ProjectQuoteItem):boolean=>{
  if(i.commentInfo)return true;
  const text=`${i.creator} ${i.description} ${i.serviceName??''}`;
  return (i.partnerType==='service'||i.kind==='seeding'||i.kind==='buzz')&&/comment|bình luận/i.test(text);
};

export const isCommentPackage=(i:ProjectQuoteItem):boolean=>{
  if(i.commentInfo?.pricingMode==='package')return true;
  const isGoiUnit=typeof i.unit==='string'&&/^(gói|goi)$/i.test(i.unit.trim());
  return isCommentServiceLine(i)&&isGoiUnit;
};

// Cổng phạm vi gói comment: dòng gói ĐƯỢC TÍNH phải có đủ số comment mỗi gói và
// ghi chú phạm vi mới được gửi duyệt/duyệt. Bản nháp vẫn lưu được để PM bổ sung;
// dữ liệu cũ thiếu hai thông tin này KHÔNG bị tự suy đoán — chỉ bị chặn ở bước này.
export const packageGate=(p:QuotePayload)=>{
  let incomplete=0;
  for(const i of p.items){
    if(!i.included)continue;
    if(!isCommentServiceLine(i))continue;
    const ci=i.commentInfo;
    if(isCommentPackage(i)){
      if(!(ci?.commentsPerPackage&&ci.commentsPerPackage>=1)||!ci?.scopeNote?.trim())incomplete++;
    }else if(!ci?.pricingMode&&(!i.unit||!/^comment$/i.test(i.unit.trim()))){
      incomplete++;
    }
  }
  return incomplete;
};
const priceGateMessage=(g:ReturnType<typeof priceGate>)=>{
  const parts:string[]=[];
  if(g.missingBuy)parts.push(`thiếu giá đầu vào ở ${g.missingBuy} dòng`);
  if(g.unconfirmedBuy)parts.push(`giá đầu vào chưa xác nhận ở ${g.unconfirmedBuy} dòng`);
  if(g.missingSell)parts.push(`thiếu giá bán ở ${g.missingSell} dòng`);
  return `Chưa thể gửi duyệt, duyệt hoặc chốt báo giá: ${parts.join('; ')}. Với dòng nhập tay (KOL, Community, dịch vụ comment), hãy xác nhận giá ngay trong bản nháp; với dòng lấy từ danh sách của dự án, hãy xác nhận trong danh sách rồi lấy lại giá vào bản nháp.`;
};
// cleanItems chỉ giữ các trường client được sửa. Các trường server sở hữu (shortlistId,
// format, serviceId, priceSnapshot, buyConfirmation, needsBuyConfirmation) KHÔNG lấy từ
// payload — chúng được khôi phục từ bản đã lưu ở bước hợp nhất phía dưới. Riêng ghi chú
// hạng mục (note) là nội dung PM soạn cho khách nên nhận từ payload; commentInfo nhận
// các trường PM được bổ sung cho gói comment (cách tính + phạm vi + số comment mỗi gói),
// phần còn lại hợp nhất với bản đã lưu ở bước dưới.
const cleanCommentInfo=(ci:any)=>{
  if(!ci||typeof ci!=='object')return undefined;
  return {
    scopeNote:typeof ci.scopeNote==='string'?ci.scopeNote.trim().slice(0,1000):'',
    commentsPerPackage:(Number.isSafeInteger(ci.commentsPerPackage)&&ci.commentsPerPackage>=1&&ci.commentsPerPackage<=100000000)?ci.commentsPerPackage:null,
    ...(ci.pricingMode==='package'||ci.pricingMode==='per_comment'?{pricingMode:ci.pricingMode}:{}),
  };
};
const cleanItems=(items:ProjectQuoteItem[]):ProjectQuoteItem[]=>items.map(i=>({id:i.id,creator:i.creator.trim(),description:i.description.trim(),phase:i.phase.trim(),kind:i.kind,quantity:i.quantity,buyUnitPrice:i.buyUnitPrice,sellUnitPrice:i.sellUnitPrice,included:i.included,
  ...(i.partnerType?{partnerType:i.partnerType}:{}),
  ...(typeof i.serviceName==='string'&&i.serviceName.trim()?{serviceName:i.serviceName.trim().slice(0,200)}:{}),
  ...(typeof i.unit==='string'&&i.unit.trim()?{unit:i.unit.trim().slice(0,50)}:{}),
  ...(typeof i.conditions==='string'&&i.conditions.trim()?{conditions:i.conditions.trim().slice(0,1000)}:{}),
  ...(typeof i.note==='string'&&i.note.trim()?{note:i.note.trim().slice(0,2000)}:{}),
  ...(cleanCommentInfo(i.commentInfo)?{commentInfo:cleanCommentInfo(i.commentInfo) as ProjectQuoteItem['commentInfo']}:{}),
  ...(i.acceptedQty!==undefined?{acceptedQty:i.acceptedQty}:{})}));;
// Tổng số comment thuê của một dòng dịch vụ: theo comment = chính số lượng dòng;
// theo gói = số gói x số comment mỗi gói (thiếu số comment mỗi gói thì chưa xác định - null).
// Tuyệt đối không suy đoán số comment trong gói từ số gói, giá hoặc KPI brief.
export const includedCommentsOf=(i:ProjectQuoteItem):number|null=>{
  if(!isCommentServiceLine(i))return null;
  const ci=i.commentInfo;
  if(isCommentPackage(i)){
    return (ci?.commentsPerPackage&&ci.commentsPerPackage>=1)?i.quantity*ci.commentsPerPackage:null;
  }
  if(ci?.pricingMode==='per_comment'||(!ci?.pricingMode&&typeof i.unit==='string'&&/^comment$/i.test(i.unit.trim()))){
    return i.quantity;
  }
  return null;
};

export function installProjectQuotes(router:Router,db:DatabaseSync,access:(user:any,id:string,manage?:boolean)=>boolean,audit:(actor:string|null,action:string,target:string)=>unknown){
  const cols=db.prepare('PRAGMA table_info(projects)').all() as any[];
  if(!cols.some(c=>c.name==='client_name'))db.exec("ALTER TABLE projects ADD COLUMN client_name TEXT NOT NULL DEFAULT ''");
  if(!cols.some(c=>c.name==='campaign_name'))db.exec("ALTER TABLE projects ADD COLUMN campaign_name TEXT NOT NULL DEFAULT ''");
  db.exec(`CREATE TABLE IF NOT EXISTS project_options (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), name TEXT NOT NULL,
    brief TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS project_quote_versions (
    id TEXT PRIMARY KEY, option_id TEXT NOT NULL REFERENCES project_options(id), number INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('draft','submitted','approved','changes_requested')),
    revision INTEGER NOT NULL DEFAULT 1, payload_json TEXT NOT NULL,
    created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, approved_by TEXT REFERENCES users(id),
    UNIQUE(option_id,number));
    CREATE TABLE IF NOT EXISTS project_baselines (
    project_id TEXT PRIMARY KEY REFERENCES projects(id), quote_id TEXT NOT NULL REFERENCES project_quote_versions(id),
    selected_by TEXT NOT NULL REFERENCES users(id), selected_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS project_options_project ON project_options(project_id);`);
  const project=(id:string)=>db.prepare('SELECT * FROM projects WHERE id=?').get(id) as any;
  const quote=(id:string,projectId:string)=>db.prepare('SELECT q.* FROM project_quote_versions q JOIN project_options o ON o.id=q.option_id WHERE q.id=? AND o.project_id=?').get(id,projectId) as any;
  const serialized=(q:any,manage:boolean)=>{
    const p=JSON.parse(q.payload_json) as QuotePayload;
    const common={id:q.id,optionId:q.option_id,number:q.number,status:q.status,revision:q.revision,createdAt:q.created_at};
    if(manage)return {...common,...p,finance:finance(p)};
    // Allowlist: không gửi giá bán, fee, chiết khấu, thuế, tổng doanh thu hay P&L cho Booking.
    return {...common,client:p.client,campaign:p.campaign,items:p.items.map(i=>({id:i.id,creator:i.creator,description:i.description,phase:i.phase,kind:i.kind,quantity:i.quantity,buyUnitPrice:i.buyUnitPrice,included:i.included,shortlistId:i.shortlistId,format:i.format,priceSnapshot:i.priceSnapshot,buyConfirmation:i.buyConfirmation,partnerType:i.partnerType,serviceId:i.serviceId,serviceName:i.serviceName,unit:i.unit,conditions:i.conditions,note:i.note,needsBuyConfirmation:i.needsBuyConfirmation,commentInfo:i.commentInfo,acceptedQty:i.acceptedQty,costSource:i.costSource}))};
  };
  router.post('/projects/:id/details',(req,res)=>{
    const u=res.locals.user;if(!access(u,req.params.id,true))return res.status(403).json({message:'Chỉ PM hoặc Admin hệ thống được cập nhật thông tin.'});
    const {name,client,campaign}=req.body;
    if(!text(name,200)||!text(client,200)||!text(campaign,200))return res.status(400).json({message:'Nhập tên dự án, khách hàng và tên chiến dịch.'});
    db.prepare('UPDATE projects SET name=?,client_name=?,campaign_name=?,version=version+1 WHERE id=?').run(name.trim(),client.trim(),campaign.trim(),req.params.id);
    audit(u.id,'update_project_details',req.params.id);res.json({success:true});
  });
  router.get('/projects/:id/options',(req,res)=>{
    const u=res.locals.user;const pid=req.params.id;
    if(!access(u,pid))return res.status(403).json({message:'Bạn không có quyền xem dự án này.'});
    const manage=access(u,pid,true);
    const options=db.prepare('SELECT id,name,brief,created_at FROM project_options WHERE project_id=? ORDER BY rowid').all(pid).map((o:any)=>({...o,versions:db.prepare('SELECT * FROM project_quote_versions WHERE option_id=? ORDER BY number DESC').all(o.id).map(q=>serialized(q,manage))}));
    const baseline=db.prepare('SELECT quote_id FROM project_baselines WHERE project_id=?').get(pid) as any;
    const p=project(pid);
    const savedBrief=db.prepare('SELECT payload_json FROM project_briefs WHERE project_id=?').get(pid) as any;
    const brief=savedBrief?JSON.parse(savedBrief.payload_json):null;
    res.json({target:manage&&brief?{count:brief.targetCount,budget:brief.budget}:null,options,baselineId:baseline?.quote_id??null,canManage:manage,project:{id:p.id,name:p.name,client:p.client_name,campaign:p.campaign_name||p.name}});
  });
  router.post('/projects/:id/options',(req,res)=>{
    const u=res.locals.user;const pid=req.params.id;
    if(!access(u,pid,true))return res.status(403).json({message:'Chỉ PM/Admin được tạo phương án.'});
    if(!text(req.body.name,200)||text(req.body.brief??'',10000)===null)return res.status(400).json({message:'Nhập tên phương án, brief tối đa 10.000 ký tự.'});
    const p=project(pid);if(!p.client_name||!p.campaign_name)return res.status(400).json({message:'Bổ sung khách hàng và tên chiến dịch trước khi tạo phương án.'});
    const oid=randomUUID(),qid=randomUUID(),now=new Date().toISOString();
    const payload:QuotePayload={client:p.client_name,campaign:p.campaign_name,items:[],discount:{mode:'fixed',value:0},agencyFee:{mode:'percent',value:12},taxRate:0};
    db.exec('BEGIN');try{
      db.prepare('INSERT INTO project_options VALUES (?,?,?,?,?,?)').run(oid,pid,req.body.name.trim(),String(req.body.brief??'').trim(),u.id,now);
      db.prepare('INSERT INTO project_quote_versions VALUES (?,?,1,\'draft\',1,?,?,?,NULL)').run(qid,oid,JSON.stringify(payload),u.id,now);
      audit(u.id,'create_option',oid);db.exec('COMMIT');
    }catch{db.exec('ROLLBACK');return res.status(400).json({message:'Không thể tạo phương án.'});}
    res.json({optionId:oid,quoteId:qid});
  });
  router.post('/projects/:id/quotes/:quoteId/save',(req,res)=>{
    const u=res.locals.user;const pid=req.params.id;
    if(!access(u,pid))return res.status(403).json({message:'Bạn không có quyền sửa dự án này.'});
    const q=quote(req.params.quoteId,pid);if(!q)return res.status(404).json({message:'Không tìm thấy báo giá trong dự án.'});
    if(!['draft','changes_requested'].includes(q.status))return res.status(409).json({message:'Báo giá đã gửi duyệt/chốt không được sửa. Hãy tạo phiên bản mới.'});
    if(!Number.isSafeInteger(req.body.revision)||req.body.revision!==q.revision)return res.status(409).json({message:'Có người vừa cập nhật báo giá. Tải lại trước khi sửa.'});
    let p=JSON.parse(q.payload_json) as QuotePayload;
    if(access(u,pid,true)){
      if(!validate(req.body.payload))return res.status(400).json({message:'Kiểm tra hạng mục, giá, số lượng, chiết khấu, phí và thuế.'});
      const originalItems=p.items;
      if(req.body.payload.items.some((i:any)=>!originalItems.some(o=>o.id===i.id)&&('shortlistId' in i||'priceSnapshot' in i)))return res.status(400).json({message:'Hãy chọn KOL từ danh sách chung để lấy giá đã xác nhận.'});
      const current=project(pid);
      p={client:current.client_name,campaign:current.campaign_name||current.name,items:cleanItems(req.body.payload.items),discount:req.body.payload.discount,agencyFee:req.body.payload.agencyFee,taxRate:req.body.payload.taxRate};
      p.items=p.items.map(i=>{const old=originalItems.find(o=>o.id===i.id);return old?.shortlistId?{...i,kind:old.kind,creator:old.creator,buyUnitPrice:old.buyUnitPrice,shortlistId:old.shortlistId,format:old.format,priceSnapshot:old.priceSnapshot,...(old.serviceId?{serviceId:old.serviceId,serviceName:old.serviceName,unit:old.unit,conditions:old.conditions,partnerType:old.partnerType}:{})}:i;});
      // Các trường server sở hữu của dòng nhập tay: KHÔNG nhận từ payload của client.
      // needsBuyConfirmation luôn lấy từ bản đã lưu; xác nhận giá chỉ giữ lại
      // khi giá đầu vào không đổi — đổi giá là mất xác nhận và phải xác nhận lại.
      // commentInfo: nền (mục tiêu brief, cách tính gói, phần đã bao gồm) lấy từ bản
      // đã lưu; PM chỉ bổ sung được phạm vi (scopeNote) và số comment mỗi gói —
      // tổng comment thuê được tính lại từ số lượng dòng hiện tại.
      p.items=p.items.map(i=>{
        if(i.shortlistId)return i;
        const old=originalItems.find(o=>o.id===i.id);
        const base:any={...i};delete base.commentInfo;
        if(!old||old.shortlistId)return base;
        let mergedInfo:ProjectQuoteItem['commentInfo'];
        if(old.commentInfo||i.commentInfo){
          mergedInfo={
            ...(old.commentInfo??{briefTargetTotal:null,scopeNote:'',includedNote:''}),
            ...(i.commentInfo?{
              scopeNote:i.commentInfo.scopeNote,
              commentsPerPackage:i.commentInfo.commentsPerPackage,
              ...(i.commentInfo.pricingMode?{pricingMode:i.commentInfo.pricingMode}:{})
            }:{})
          };
          mergedInfo.includedComments=includedCommentsOf({...i,commentInfo:mergedInfo})??undefined;
        }
        return {...base,
          ...(old.needsBuyConfirmation?{needsBuyConfirmation:true}:{}),
          ...(mergedInfo?{commentInfo:mergedInfo}:{}),
          ...(old.partnerType?{partnerType:old.partnerType}:{}),
          ...(old.buyConfirmation&&old.buyUnitPrice===i.buyUnitPrice?{buyConfirmation:old.buyConfirmation}:{})};
      });
      // Nguồn chi phí là trường server sở hữu — khôi phục từ bản đã lưu như các trường
      // sở hữu khác, TUYỆT ĐỐI không nhận costSource từ payload của client. Việc khôi
      // phục theo id chỉ an toàn khi RÀNG BUỘC ĐỐI TÁC của dòng không đổi: nếu PM đổi
      // kind / partnerType / shortlistId / serviceId (trong payload gửi lên hoặc ở
      // dòng hiệu lực sau khi server gộp các trường sở hữu) thì nguồn cũ bị HUỶ —
      // không bao giờ copy nguồn (nhất là phân bổ hợp đồng) của đối tác A sang B.
      // Nguồn ước tính/hồ sơ được suy từ tổng giá của dòng nên cũng mất hiệu lực khi
      // số lượng hoặc giá đầu vào thay đổi; nguồn hợp đồng là khoản phân bổ độc lập
      // với đơn giá/số lượng nên giữ nguyên khi ràng buộc không đổi.
      p.items=p.items.map(i=>{
        const old=originalItems.find(o=>o.id===i.id);
        if(!old?.costSource)return i;
        const cs=old.costSource;
        const raw=(req.body.payload.items as any[]).find((x:any)=>x.id===i.id);
        const norm=(v:any)=>v??'';
        const submittedBindingChanged=!!raw&&(
          (raw.kind!==undefined&&norm(raw.kind)!==norm(old.kind))||
          (raw.partnerType!==undefined&&norm(raw.partnerType)!==norm(old.partnerType))||
          ('shortlistId' in raw&&norm(raw.shortlistId)!==norm(old.shortlistId))||
          ('serviceId' in raw&&norm(raw.serviceId)!==norm(old.serviceId)));
        const effectiveBindingChanged=
          norm(i.kind)!==norm(old.kind)||norm(i.partnerType)!==norm(old.partnerType)||
          norm(i.shortlistId)!==norm(old.shortlistId)||norm(i.serviceId)!==norm(old.serviceId);
        if(submittedBindingChanged||effectiveBindingChanged)return i;
        // Đối chiếu lại snapshot đối tác trong nguồn với đối tác hiệu lực của dòng
        // (qua shortlist row): lệch là huỷ nguồn, kể cả khi các trường trên khớp.
        if(cs.partnerId||cs.partnerType){
          if(!i.shortlistId)return i;
          const row=db.prepare('SELECT catalog_id,partner_type FROM project_shortlist WHERE id=? AND project_id=?').get(i.shortlistId,pid) as any;
          if(!row||cs.partnerId!==row.catalog_id||cs.partnerType!==(row.partner_type??'kol'))return i;
        }
        if(cs.kind!=='contract'&&(old.quantity!==i.quantity||old.buyUnitPrice!==i.buyUnitPrice))return i;
        return {...i,costSource:cs};
      });
    }else{
      if(Object.keys(req.body).some(k=>!['revision','buyPrices'].includes(k))||!Array.isArray(req.body.buyPrices)||req.body.buyPrices.length>500)return res.status(403).json({message:'Booking chỉ được cập nhật giá đầu vào.'});
      const updates=req.body.buyPrices;
      if(updates.some((x:any)=>!x||Object.keys(x).some(k=>!['id','buyUnitPrice'].includes(k))||!p.items.some(i=>i.id===x.id)||!validMoney(x.buyUnitPrice)))return res.status(400).json({message:'Giá đầu vào hoặc hạng mục không hợp lệ.'});
      if(updates.some((x:any)=>{const i=p.items.find(i=>i.id===x.id)!;return i.shortlistId&&i.buyUnitPrice!==x.buyUnitPrice;}))return res.status(403).json({message:'Giá KOL đã chụp vào phương án không được sửa tại đây. Cập nhật giá tại danh sách chung rồi đề nghị PM lập phiên bản mới.'});
      // null là xóa giá về trạng thái chờ xác nhận, không phải giá miễn phí.
      // Đổi giá đầu vào của dòng KOL nhập tay làm mất xác nhận đã ghi trước đó.
      for(const update of updates){const it=p.items.find(i=>i.id===update.id)!;if(it.buyUnitPrice!==update.buyUnitPrice){if(it.buyConfirmation)delete it.buyConfirmation;if(it.costSource&&it.costSource.kind!=='contract')delete it.costSource;}it.buyUnitPrice=update.buyUnitPrice;}
    }
    try{finance(p);}catch{return res.status(400).json({message:'Chiết khấu hoặc tổng tiền vượt phạm vi hợp lệ.'});}
    const result=db.prepare('UPDATE project_quote_versions SET payload_json=?,revision=revision+1,status=\'draft\' WHERE id=? AND revision=?').run(JSON.stringify(p),q.id,q.revision);
    if(!result.changes)return res.status(409).json({message:'Báo giá đã thay đổi. Vui lòng tải lại.'});
    audit(u.id,'save_quote',q.id);res.json({quote:serialized(quote(q.id,pid),access(u,pid,true))});
  });
  // Xác nhận giá đầu vào cho dòng KOL NHẬP TAY trong bản nháp. Server tự ghi nguồn,
  // người xác nhận (từ phiên đăng nhập) và thời điểm — client không tự đặt được các thông tin này.
  router.post('/projects/:id/quotes/:quoteId/confirm-buy',(req,res)=>{
    const u=res.locals.user;const pid=req.params.id;
    if(!access(u,pid))return res.status(403).json({message:'Bạn không có quyền cập nhật dự án này.'});
    const q=quote(req.params.quoteId,pid);if(!q)return res.status(404).json({message:'Không tìm thấy báo giá trong dự án.'});
    if(!['draft','changes_requested'].includes(q.status))return res.status(409).json({message:'Phiên bản đã gửi duyệt, duyệt hoặc chốt không sửa được. Hãy tạo phiên bản mới để bổ sung xác nhận giá.'});
    if(!Number.isSafeInteger(req.body.revision)||req.body.revision!==q.revision)return res.status(409).json({message:'Báo giá đã thay đổi. Tải lại trước khi xác nhận.'});
    const p=JSON.parse(q.payload_json) as QuotePayload;
    const item=p.items.find(i=>i.id===req.body.itemId);
    if(!item)return res.status(404).json({message:'Không tìm thấy dòng cần xác nhận trong báo giá.'});
    if(!needsConfirmation(item))return res.status(400).json({message:'Chỉ dòng KOL, Community và dịch vụ comment thuê ngoài nhập tay mới cần xác nhận giá đầu vào. Chi phí trực tiếp khác không có bước xác nhận riêng.'});
    if(item.shortlistId)return res.status(400).json({message:'Dòng lấy từ danh sách dự án được xác nhận tại danh sách của dự án. Hãy xác nhận ở đó rồi lấy lại giá vào bản nháp.'});
    if(item.buyUnitPrice===null)return res.status(400).json({message:'Dòng này chưa có giá đầu vào nên chưa thể xác nhận. Hãy nhập và lưu giá đầu vào trước.'});
    const source=text(req.body.source,200);
    if(!source)return res.status(400).json({message:'Nhập nguồn kiểm tra giá (ví dụ: báo giá KOL gửi ngày…, tin nhắn/email xác nhận…).'});
    item.buyConfirmation={value:item.buyUnitPrice,source,checkedBy:u.id,checkedByName:typeof u.display_name==='string'?u.display_name:(typeof u.name==='string'?u.name:''),checkedAt:new Date().toISOString()};
    const result=db.prepare('UPDATE project_quote_versions SET payload_json=?,revision=revision+1 WHERE id=? AND revision=?').run(JSON.stringify(p),q.id,q.revision);
    if(!result.changes)return res.status(409).json({message:'Báo giá đã thay đổi. Vui lòng tải lại.'});
    audit(u.id,'confirm_manual_buy_price',q.id);res.json({quote:serialized(quote(q.id,pid),access(u,pid,true))});
  });
  router.post('/projects/:id/quotes/:quoteId/new-version',(req,res)=>{
    const u=res.locals.user;const pid=req.params.id;
    if(!access(u,pid,true))return res.status(403).json({message:'Chỉ PM/Admin được tạo phiên bản.'});
    const old=quote(req.params.quoteId,pid);if(!old)return res.status(404).json({message:'Không tìm thấy báo giá.'});
    const n=Number((db.prepare('SELECT max(number) AS n FROM project_quote_versions WHERE option_id=?').get(old.option_id) as any).n)+1;
    const id=randomUUID();db.prepare('INSERT INTO project_quote_versions VALUES (?,?,?,\'draft\',1,?,?,?,NULL)').run(id,old.option_id,n,old.payload_json,u.id,new Date().toISOString());audit(u.id,'new_quote_version',id);res.json({quoteId:id});
  });
  router.post('/projects/:id/quotes/:quoteId/status',(req,res)=>{
    const u=res.locals.user;const pid=req.params.id;
    if(!access(u,pid,true))return res.status(403).json({message:'Chỉ PM/Admin được duyệt báo giá.'});
    const q=quote(req.params.quoteId,pid);if(!q)return res.status(404).json({message:'Không tìm thấy báo giá.'});
    if(req.body.revision!==q.revision)return res.status(409).json({message:'Báo giá đã thay đổi. Vui lòng tải lại.'});
    const transitions:Record<string,string[]>={draft:['submitted'],submitted:['approved','changes_requested'],approved:[],changes_requested:['submitted']};
    if(!transitions[q.status].includes(req.body.status))return res.status(400).json({message:'Không thể chuyển trạng thái báo giá.'});
    const p=JSON.parse(q.payload_json) as QuotePayload;
    if(!p.items.some(i=>i.included))return res.status(400).json({message:'Cần có ít nhất một hạng mục được tính vào báo giá.'});
    // Gửi duyệt và duyệt phải qua cổng giá ở server; yêu cầu chỉnh sửa thì không chặn.
    if(['submitted','approved'].includes(req.body.status)){
      const gate=priceGate(p);
      if(!gate.ok)return res.status(400).json({message:priceGateMessage(gate),priceGate:gate});
      const incompletePackages=packageGate(p);
      if(incompletePackages)return res.status(400).json({message:`Chưa thể gửi duyệt, duyệt hoặc chốt báo giá: còn ${incompletePackages} dòng gói comment thiếu số comment bao gồm trong mỗi gói hoặc thiếu ghi chú phạm vi. Hãy bổ sung trong bản nháp (số comment mỗi gói được lưu riêng, không suy đoán từ mục tiêu của brief).`,packageGate:{incompletePackages}});
      if(!finance(p).complete)return res.status(400).json({message:'Cần đủ giá đầu vào và giá bán trước khi duyệt.'});
    }
    db.prepare('UPDATE project_quote_versions SET status=?,approved_by=?,revision=revision+1 WHERE id=? AND revision=?').run(req.body.status,req.body.status==='approved'?u.id:null,q.id,q.revision);audit(u.id,req.body.status+'_quote',q.id);res.json({success:true});
  });
  router.post('/projects/:id/quotes/:quoteId/select',(req,res)=>{
    const u=res.locals.user;const pid=req.params.id;
    if(!access(u,pid,true))return res.status(403).json({message:'Chỉ PM/Admin được chốt phương án.'});
    const q=quote(req.params.quoteId,pid);if(!q||q.status!=='approved')return res.status(400).json({message:'Chỉ được chốt một phiên bản đã duyệt trong dự án.'});
    const gate=priceGate(JSON.parse(q.payload_json) as QuotePayload);
    if(!gate.ok)return res.status(400).json({message:priceGateMessage(gate),priceGate:gate});
    db.prepare('INSERT INTO project_baselines VALUES (?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET quote_id=excluded.quote_id,selected_by=excluded.selected_by,selected_at=excluded.selected_at').run(pid,q.id,u.id,new Date().toISOString());audit(u.id,'select_baseline',q.id);res.json({success:true});
  });
  // Tạo phương án từ phase — CHỈ từ PHÂN BỔ PM chủ động chọn (đối tác + hạng mục/dịch vụ
  // + số lượng thực tế) và các dòng dịch vụ PM thêm. Hệ thống không tự đưa toàn bộ ứng viên
  // vào phương án, không tự chia đều SOW, không tự biến KPI (topics/comments/buzz) thành chi phí.
  const foldName=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/đ/g,'d').trim();
  const isPostService=(name:string)=>{const n=foldName(name);return n.includes('dang bai')||n.includes('bai dang')||n==='post';};
  function phaseContext(pid:string){
    const allPhases=db.prepare('SELECT * FROM project_phases WHERE project_id=? ORDER BY sort_order,rowid').all(pid) as any[];
    const firstPhaseId=allPhases[0]?.id;
    const briefOf=(ph:any)=>{if(!ph.brief_json)return null;try{return readProjectBrief(JSON.parse(ph.brief_json));}catch{return null;}};
    return {allPhases,firstPhaseId,briefOf};
  }
  router.post('/projects/:id/options/suggest-allocations',(req,res)=>{
    const u=res.locals.user;const pid=req.params.id;
    if(!access(u,pid,true))return res.status(403).json({message:'Chỉ PM/Admin được dùng gợi ý phân bổ.'});
    const phaseIds=req.body?.phaseIds;
    if(!Array.isArray(phaseIds)||!phaseIds.length||phaseIds.length>20||phaseIds.some((x:any)=>typeof x!=='string'))return res.status(400).json({message:'Chọn ít nhất một phase.'});
    const {allPhases,firstPhaseId,briefOf}=phaseContext(pid);
    const byId=new Map(allPhases.map((x:any)=>[x.id,x]));
    if(phaseIds.some((id:string)=>!byId.has(id)))return res.status(400).json({message:'Có phase không thuộc dự án này.'});
    const onlyRows=Array.isArray(req.body?.shortlistIds)?new Set(req.body.shortlistIds.filter((x:any)=>typeof x==='string')):null;
    const input=phaseIds.map((id:string)=>{
      const ph=byId.get(id);const b=briefOf(ph);
      const rows=db.prepare('SELECT * FROM project_shortlist WHERE project_id=? AND (phase_id=? OR (phase_id IS NULL AND ?=?)) ORDER BY rowid').all(pid,id,id,firstPhaseId)
        .filter((r:any)=>!onlyRows||onlyRows.has(r.id))
        .map((r:any)=>{const prof=JSON.parse(r.profile_json);return {shortlistId:r.id,partnerType:(r.partner_type??'kol') as 'kol'|'community',services:(prof.dichVu??[]).map((s:any)=>({key:s.id,name:s.ten}))};});
      return {phaseId:id,brief:b?{deliverableScope:b.deliverableScope,deliverables:b.deliverables.map((d:any)=>({format:d.format,quantity:d.quantity})),services:b.services}:null,rows};
    });
    // Gợi ý CHỈ là bản nháp phân bổ trả về cho PM xem/sửa — không tạo phương án, không lưu.
    res.json({allocations:suggestAllocations(input)});
  });
  router.post('/projects/:id/options/from-phases',(req,res)=>{
    const u=res.locals.user;const pid=req.params.id;
    if(!access(u,pid,true))return res.status(403).json({message:'Chỉ PM/Admin được tạo phương án từ phase.'});
    if(!text(req.body.name,200))return res.status(400).json({message:'Nhập tên phương án.'});
    const allocations=req.body.allocations;
    if(!Array.isArray(allocations)||allocations.length>500)return res.status(400).json({message:'Phân bổ công việc không hợp lệ.'});
    const commentLines=req.body.commentLines??[];
    if(!Array.isArray(commentLines)||commentLines.length>100)return res.status(400).json({message:'Dòng dịch vụ comment không hợp lệ.'});
    if(!allocations.length&&!commentLines.length)return res.status(400).json({message:'Hãy phân bổ ít nhất một đối tác/dịch vụ hoặc thêm một dòng dịch vụ trước khi tạo phương án. Danh sách sơ bộ chỉ là ứng viên — hệ thống không tự phân bổ.'});
    const p=project(pid);if(!p.client_name||!p.campaign_name)return res.status(400).json({message:'Bổ sung khách hàng và tên chiến dịch trước khi tạo phương án.'});
    const {allPhases,firstPhaseId,briefOf}=phaseContext(pid);
    const phaseNameOf=(rowPhaseId:any)=>{const ph=allPhases.find((x:any)=>x.id===(rowPhaseId??firstPhaseId));return ph?.name??'';};
    const lines:AllocatedLine[]=[];const seenAlloc=new Set<string>();const usedPhaseIds=new Set<string>();
    for(const a of allocations){
      if(!a||typeof a.shortlistId!=='string'||typeof a.key!=='string'||!a.key||!Number.isSafeInteger(a.quantity)||a.quantity<1||a.quantity>1000000)return res.status(400).json({message:'Mỗi phân bổ cần đối tác, hạng mục/dịch vụ và số lượng nguyên dương.'});
      const dupKey=a.shortlistId+':'+a.key;if(seenAlloc.has(dupKey))return res.status(400).json({message:'Một đối tác chỉ phân bổ một lần cho cùng hạng mục/dịch vụ trong một lần tạo phương án. Cộng gộp số lượng trước khi tạo.'});seenAlloc.add(dupKey);
      const row=db.prepare('SELECT * FROM project_shortlist WHERE id=? AND project_id=?').get(a.shortlistId,pid) as any;
      if(!row)return res.status(400).json({message:'Có đối tác trong phân bổ không thuộc danh sách của dự án.'});
      const prof=JSON.parse(row.profile_json);const prices=JSON.parse(row.prices_json);const price=prices[a.key];
      const rowPhaseId=row.phase_id??firstPhaseId;if(rowPhaseId)usedPhaseIds.add(rowPhaseId);
      if(row.partner_type==='community'){
        const svc=(prof.dichVu??[]).find((s:any)=>s.id===a.key);
        if(!svc||!price)return res.status(400).json({message:`Dịch vụ đã chọn không thuộc hồ sơ Community “${prof.ten}”.`});
        lines.push({shortlistId:row.id,creator:prof.ten,phase:phaseNameOf(row.phase_id),partnerType:'community',key:a.key,description:svc.ten,serviceName:svc.ten,unit:svc.donVi,...(svc.dieuKien?{conditions:svc.dieuKien}:{}),quantity:a.quantity,price});
      }else{
        if(!(a.key in PRICE_FORMAT_LABELS)||!price)return res.status(400).json({message:`Hạng mục đã chọn không hợp lệ cho KOL “${prof.ten}”.`});
        lines.push({shortlistId:row.id,creator:prof.ten,phase:phaseNameOf(row.phase_id),partnerType:'kol',key:a.key,description:PRICE_FORMAT_LABELS[a.key as PriceFormatKey],quantity:a.quantity,price});
      }
    }
    const built=buildAllocatedQuoteItems(lines,()=>randomUUID());
    const items:ProjectQuoteItem[]=[...built.items];
    // Dòng dịch vụ comment thuê ngoài do PM chủ động thêm: số comments mua phải do PM chọn —
    // KHÔNG mặc định bằng toàn bộ comments mục tiêu của brief, không tự chia đều cho từng bài.
    for(const c of commentLines){
      const phaseName=text(c?.phase,200);const vendor=text(c?.vendor,200);
      if(!phaseName||!vendor)return res.status(400).json({message:'Dòng comment cần tên phase và nhà cung cấp.'});
      const ph=allPhases.find((x:any)=>x.name===phaseName);if(!ph)return res.status(400).json({message:`Phase “${phaseName}” không thuộc dự án này.`});
      usedPhaseIds.add(ph.id);
      const mode=c.pricingMode==='package'?'package':'per_comment';
      if(mode==='per_comment'&&(!Number.isSafeInteger(c.quantity)||c.quantity<1||c.quantity>100000000))return res.status(400).json({message:'Số comments thuê ngoài phải do PM chọn (số nguyên dương) — hệ thống không tự lấy theo KPI mục tiêu.'});
      // Theo gói: quantity là SỐ GÓI; bắt buộc số comment gồm trong mỗi gói (trường
      // riêng) và ghi chú phạm vi. Thành tiền = số gói x giá gói — số comment KHÔNG
      // bị nhân vào giá lần nữa, chỉ dùng để tính tổng khối lượng comment thuê.
      if(mode==='package'){
        if(!Number.isSafeInteger(c.quantity)||c.quantity<1||c.quantity>100000)return res.status(400).json({message:'Số gói comment phải là số nguyên dương do PM chọn.'});
        if(!Number.isSafeInteger(c.commentsPerPackage)||c.commentsPerPackage<1||c.commentsPerPackage>100000000)return res.status(400).json({message:'Gói comment bắt buộc nhập số comment bao gồm trong mỗi gói (số nguyên dương, lưu bằng trường riêng).'});
        if(!text(c.scopeNote,1000))return res.status(400).json({message:'Gói comment bắt buộc nhập ghi chú phạm vi, ví dụ “Phân bổ trên 100 bài trong tháng 11”.'});
      }
      if(!validMoney(c.buyUnitPrice??null)||!validMoney(c.sellUnitPrice??null))return res.status(400).json({message:'Giá dịch vụ comment không hợp lệ.'});
      const brief=briefOf(ph);
      const scopeNote=text(c.scopeNote,1000)??'';
      items.push({id:randomUUID(),creator:vendor,description:scopeNote||'Dịch vụ comment thuê ngoài',phase:phaseName,kind:'seeding',partnerType:'service',quantity:c.quantity,buyUnitPrice:c.buyUnitPrice??null,sellUnitPrice:c.sellUnitPrice??null,included:true,unit:mode==='package'?'gói':'comment',needsBuyConfirmation:true,note:scopeNote||undefined,commentInfo:{briefTargetTotal:brief?.kpiComments??null,scopeNote,includedNote:text(c.includedNote,1000)??'',pricingMode:mode,commentsPerPackage:mode==='package'?c.commentsPerPackage:null,includedComments:mode==='package'?c.quantity*c.commentsPerPackage:c.quantity}});
    }
    if(items.length>500)return res.status(400).json({message:'Phương án vượt quá 500 hạng mục. Tách bớt phase hoặc giảm số dòng.'});
    // Đối chiếu mục tiêu: tổng số lượng ĐÃ PHÂN BỔ so với mục tiêu của brief từng phase
    // (hạng mục Creator, dịch vụ Community, KPI topics). KPI comments/buzz không phải
    // đầu việc tính tiền nên không đưa vào đối chiếu phân bổ chi phí.
    const reconciliation:{phase:string;label:string;target:number;allocated:number;difference:number}[]=[];
    for(const phId of usedPhaseIds){
      const ph=allPhases.find((x:any)=>x.id===phId);if(!ph)continue;const b=briefOf(ph);if(!b)continue;
      const inPhase=items.filter(i=>i.phase===ph.name);
      for(const d of b.deliverables){
        const alloc=inPhase.filter(i=>i.kind==='kol'&&(i.format===d.format)).reduce((a,i)=>a+i.quantity,0);
        const partners=new Set(inPhase.filter(i=>i.kind==='kol'&&i.format===d.format).map(i=>i.shortlistId)).size;
        const target=b.deliverableScope==='campaign'?d.quantity:d.quantity*Math.max(partners,0);
        if(target>0||alloc>0)reconciliation.push({phase:ph.name,label:PRICE_FORMAT_LABELS[d.format as PriceFormatKey]??d.format,target,allocated:alloc,difference:alloc-target});
        if(d.format==='post'){
          const allocC=inPhase.filter(i=>i.kind==='community'&&i.serviceName&&isPostService(i.serviceName)).reduce((a,i)=>a+i.quantity,0);
          if(allocC>0)reconciliation.push({phase:ph.name,label:'Bài đăng Community',target:b.deliverableScope==='campaign'?d.quantity:allocC,allocated:allocC,difference:b.deliverableScope==='campaign'?allocC-d.quantity:0});
        }
      }
      for(const s of b.services){
        const alloc=inPhase.filter(i=>i.kind==='community'&&i.serviceName&&(foldName(i.serviceName).includes(foldName(s.name))||foldName(s.name).includes(foldName(i.serviceName)))).reduce((a,i)=>a+i.quantity,0);
        const partners=new Set(inPhase.filter(i=>i.kind==='community').map(i=>i.shortlistId)).size;
        const target=s.scope==='phase'?s.quantity:s.quantity*Math.max(partners,0);
        if(target>0||alloc>0)reconciliation.push({phase:ph.name,label:`Dịch vụ ${s.name}`,target,allocated:alloc,difference:alloc-target});
      }
      if(b.kpiTopics){
        const alloc=inPhase.filter(i=>(i.kind==='kol'&&i.format==='post')||(i.kind==='community'&&i.serviceName&&isPostService(i.serviceName))).reduce((a,i)=>a+i.quantity,0);
        reconciliation.push({phase:ph.name,label:'Bài viết (topics) — KPI mục tiêu',target:b.kpiTopics,allocated:alloc,difference:alloc-b.kpiTopics});
      }
    }
    const oid=randomUUID(),qid=randomUUID(),now=new Date().toISOString();
    const payload:QuotePayload={client:p.client_name,campaign:p.campaign_name,items,discount:{mode:'fixed',value:0},agencyFee:{mode:'percent',value:12},taxRate:0};
    if(!validate(payload))return res.status(400).json({message:'Dữ liệu phân bổ không hợp lệ.'});
    try{finance(payload);}catch{return res.status(400).json({message:'Tổng tiền vượt phạm vi hỗ trợ. Giảm số lượng hoặc kiểm tra giá.'});}
    db.exec('BEGIN');try{
      db.prepare('INSERT INTO project_options VALUES (?,?,?,?,?,?)').run(oid,pid,req.body.name.trim(),'',u.id,now);
      db.prepare('INSERT INTO project_quote_versions VALUES (?,?,1,\'draft\',1,?,?,?,NULL)').run(qid,oid,JSON.stringify(payload),u.id,now);
      audit(u.id,'create_option_from_allocations',oid);db.exec('COMMIT');
    }catch{db.exec('ROLLBACK');return res.status(400).json({message:'Không thể tạo phương án từ phân bổ.'});}
    res.json({optionId:oid,quoteId:qid,itemCount:items.length,missingPrice:built.missingPrice,unconfirmedPrice:built.unconfirmedPrice,reconciliation});
  });
  // ===== Giai đoạn B (đợt đầu): NGUỒN CHI PHÍ ĐẦU VÀO của dòng KOL/Community =====
  // Ba nguồn: (1) 'estimate' — Booking tự xác nhận NET/GROSS + thuế (khi chưa có hồ sơ
  // hoặc giá cũ chưa rõ bản chất; KHÔNG mặc định là NET, KHÔNG mặc định "không thuế");
  // (2) 'profile' — ước tính theo hồ sơ ký kết chung trong kho (A1), trạng thái Dự
  // kiến, ghi rõ "Chưa chốt hợp đồng"; (3) 'contract' — Booking CHỦ ĐỘNG phân bổ một
  // PHẦN giá trị hợp đồng (A2) của đúng đối tác trong đúng dự án vào dòng, trạng thái
  // Đã chốt. Hợp đồng là tổng của đối tác trong dự án — TUYỆT ĐỐI không tự nhân toàn
  // bộ giá trị hợp đồng cho từng dòng/phương án; tổng phân bổ trong MỘT phương án
  // không được vượt giá trị hợp đồng; các phương án song song là lựa chọn thay thế,
  // không cộng dồn. NET/thuế/GROSS luôn do server tính lại bằng contractMoney dùng
  // chung; số đã tính của client không bao giờ được tin. Nguồn là SNAPSHOT: hồ sơ
  // hoặc hợp đồng thay đổi sau đó không âm thầm đổi dòng đã lưu. Đợt này CHƯA đổi
  // cách tính P&L hiện tại và chưa mở thuế cho chi phí trực tiếp khác (điểm nối C).
  const FORM_TAX_PRESETS:Record<string,{taxRate:number;taxMode:string}>={ca_nhan:{taxRate:10,taxMode:'trong_gia_gop'},hkd:{taxRate:7,taxMode:'trong_gia_gop'},cong_ty:{taxRate:8,taxMode:'tren_net'}};
  const resolveLinePartner=(pid:string,item:ProjectQuoteItem)=>{
    if(!item.shortlistId)return null;
    const row=db.prepare('SELECT * FROM project_shortlist WHERE id=? AND project_id=?').get(item.shortlistId,pid) as any;
    if(!row||!row.catalog_id)return null;
    let name='';try{name=JSON.parse(row.profile_json).ten??'';}catch{}
    return {type:((row.partner_type??'kol') as 'kol'|'community'),id:row.catalog_id as string,name};
  };
  const profileTaxOf=(profile:any)=>{
    if(!profile)return null;
    if(typeof profile.customTaxRate==='number'&&profile.customTaxMode)return {taxRate:profile.customTaxRate,taxMode:profile.customTaxMode as string,taxSource:'custom' as const};
    const preset=profile.signingForm?FORM_TAX_PRESETS[profile.signingForm]:undefined;
    return preset?{taxRate:preset.taxRate,taxMode:preset.taxMode,taxSource:'form' as const}:null;
  };
  const allocatedGrossOf=(payload:QuotePayload,contractId:string,exceptItemId?:string)=>payload.items.reduce((sum,i)=>sum+(i.costSource&&i.costSource.kind==='contract'&&i.costSource.contractId===contractId&&i.id!==exceptItemId?i.costSource.gross:0),0);

  router.get('/projects/:id/quotes/:quoteId/cost-options',(req,res)=>{
    const u=res.locals.user,pid=req.params.id;if(!access(u,pid))return res.status(403).json({message:'Bạn không có quyền xem dự án này.'});
    const q=quote(req.params.quoteId,pid);if(!q)return res.status(404).json({message:'Không tìm thấy báo giá trong dự án.'});
    const payload=JSON.parse(q.payload_json) as QuotePayload;
    const item=payload.items.find(i=>i.id===req.query.itemId);
    if(!item)return res.status(404).json({message:'Không tìm thấy dòng trong báo giá.'});
    const orgId=(project(pid) as any).organization_id as string;
    const partner=resolveLinePartner(pid,item);
    let profileOut:any=null;
    if(partner){
      const prow=db.prepare('SELECT * FROM partner_signing_profiles WHERE organization_id=? AND partner_type=? AND partner_id=?').get(orgId,partner.type,partner.id) as any;
      if(prow){const prof=JSON.parse(prow.payload_json);const ptax=profileTaxOf(prof);
        profileOut={legalName:prof.legalName??'',signingForm:prof.signingForm??'',revision:prow.revision,taxRate:ptax?.taxRate??null,taxMode:ptax?.taxMode??null,taxSource:ptax?.taxSource??null};}
    }
    const contracts=partner?(db.prepare('SELECT * FROM contracts WHERE organization_id=? AND project_id=? AND partner_type=? AND partner_id=? ORDER BY rowid DESC').all(orgId,pid,partner.type,partner.id) as any[]).map(c=>{const allocated=allocatedGrossOf(payload,c.id);return {
      id:c.id,number:c.contract_number,name:c.contract_name,status:c.status,statusLabel:CONTRACT_STATUS_LABELS[c.status]??c.status,revision:c.revision,
      taxRate:c.tax_rate,taxMode:c.tax_mode,net:c.net_amount,tax:c.tax_amount,gross:c.gross_amount,
      applicable:(c.status==='signed'||c.status==='completed')&&c.gross_amount!==null,
      allocatedInQuote:allocated,remaining:c.gross_amount===null?null:c.gross_amount-allocated,
    };}):[];
    // Chỉ thông tin ĐẦU VÀO: không kèm giá bán/doanh thu/P&L trong bất kỳ trường hợp nào.
    res.json({itemId:item.id,partner,lineBuyTotal:item.buyUnitPrice===null?null:item.buyUnitPrice*item.quantity,current:item.costSource??null,profile:profileOut,contracts});
  });

  router.post('/projects/:id/quotes/:quoteId/cost-source',(req,res)=>{
    const u=res.locals.user,pid=req.params.id;if(!access(u,pid))return res.status(403).json({message:'Bạn không có quyền thao tác trên dự án này.'});
    const q=quote(req.params.quoteId,pid);if(!q)return res.status(404).json({message:'Không tìm thấy báo giá trong dự án.'});
    if(!['draft','changes_requested'].includes(q.status))return res.status(409).json({message:'Phiên bản đã gửi duyệt hoặc đã duyệt không sửa được nguồn chi phí — hãy tạo phiên bản mới trong báo giá hiện có (bản đã duyệt giữ nguyên).'});
    if(!Number.isSafeInteger(req.body?.revision)||req.body.revision!==q.revision)return res.status(409).json({message:'Báo giá đã thay đổi. Tải lại trước khi áp dụng nguồn chi phí.'});
    const payload=JSON.parse(q.payload_json) as QuotePayload;
    const item=payload.items.find(i=>i.id===req.body?.itemId);
    if(!item)return res.status(404).json({message:'Không tìm thấy dòng trong báo giá.'});
    if(!['kol','community'].includes(item.kind))return res.status(400).json({message:'Nguồn chi phí theo đối tác chỉ áp dụng cho dòng KOL và Community.'});
    const orgId=(project(pid) as any).organization_id as string;
    const partner=resolveLinePartner(pid,item);
    const now=new Date().toISOString();
    const actor={appliedBy:u.id,appliedByName:typeof u.display_name==='string'?u.display_name:(typeof u.name==='string'?u.name:''),appliedAt:now};
    const kind=req.body?.kind;
    let costSource:QuoteCostSource;
    if(kind==='contract'){
      if(Object.keys(req.body).some(k=>!['revision','itemId','kind','contractId','basis','amount'].includes(k)))return res.status(400).json({message:'Thông tin lấy chi phí từ hợp đồng không hợp lệ.'});
      if(!partner)return res.status(400).json({message:'Dòng này chưa gắn đối tác trong kho nên không lấy được chi phí từ hợp đồng. Hãy đưa đối tác vào danh sách của dự án trước.'});
      const c=db.prepare('SELECT * FROM contracts WHERE id=? AND organization_id=?').get(String(req.body.contractId??''),orgId) as any;
      if(!c||c.project_id!==pid)return res.status(400).json({message:'Hợp đồng không thuộc dự án này.'});
      if(c.partner_type!==partner.type||c.partner_id!==partner.id)return res.status(400).json({message:'Hợp đồng thuộc về đối tác khác — không áp dụng được cho dòng này.'});
      if(c.status!=='signed'&&c.status!=='completed')return res.status(400).json({message:`Hợp đồng đang ở trạng thái "${CONTRACT_STATUS_LABELS[c.status]??c.status}" — chỉ hợp đồng Đã ký hoặc Hoàn tất mới dùng làm nguồn chi phí chốt.`});
      if(c.gross_amount===null||!c.tax_mode)return res.status(400).json({message:'Hợp đồng chưa có giá trị và cách tính thuế rõ ràng nên chưa dùng làm nguồn chi phí được.'});
      const basis=req.body.basis;
      if((basis!=='net'&&basis!=='gross')||!isValidMoneyAmount(req.body.amount))return res.status(400).json({message:'Nhập số tiền phân bổ cho dòng này và chọn số tiền đó là NET hay GROSS. Hệ thống không tự lấy toàn bộ giá trị hợp đồng cho một dòng và không tự chia đều.'});
      const computed=computeContractMoney({basis,amount:req.body.amount,taxRate:c.tax_rate,taxMode:c.tax_mode});
      if(!computed)return res.status(400).json({message:'Không tính được chi phí từ số phân bổ và thông số thuế của hợp đồng.'});
      const others=allocatedGrossOf(payload,c.id,item.id);
      if(others+computed.gross>c.gross_amount)return res.status(400).json({message:`Phân bổ vượt giá trị hợp đồng: đã phân bổ ${others.toLocaleString('vi-VN')} + dòng này ${computed.gross.toLocaleString('vi-VN')} > tổng phải chi của hợp đồng ${c.gross_amount.toLocaleString('vi-VN')}. Hãy giảm số phân bổ cho dòng này.`});
      costSource={kind:'contract',status:'chot',partnerType:partner.type,partnerId:partner.id,contractId:c.id,contractNumber:c.contract_number,contractRevision:c.revision,basis,amount:req.body.amount,taxRate:c.tax_rate,taxMode:c.tax_mode,net:computed.net,tax:computed.tax,gross:computed.gross,...actor};
    }else if(kind==='profile'){
      if(Object.keys(req.body).some(k=>!['revision','itemId','kind','basis','amount'].includes(k)))return res.status(400).json({message:'Thông tin ước tính từ hồ sơ không hợp lệ.'});
      if(!partner)return res.status(400).json({message:'Dòng này chưa gắn đối tác trong kho nên chưa có hồ sơ ký kết để ước tính.'});
      const prow=db.prepare('SELECT * FROM partner_signing_profiles WHERE organization_id=? AND partner_type=? AND partner_id=?').get(orgId,partner.type,partner.id) as any;
      if(!prow)return res.status(400).json({message:'Đối tác chưa có hồ sơ ký kết trong kho — bổ sung hồ sơ, hoặc dùng nguồn Tự xác nhận.'});
      const ptax=profileTaxOf(JSON.parse(prow.payload_json));
      if(!ptax)return res.status(400).json({message:'Hồ sơ ký kết chưa đủ dữ liệu thuế: cần hình thức ký hoặc suất thuế riêng kèm cách tính. Bổ sung hồ sơ, hoặc dùng nguồn Tự xác nhận với thông số bạn nhập.'});
      const basis=req.body.basis;
      if(basis!=='net'&&basis!=='gross')return res.status(400).json({message:'Cần xác nhận số tiền ước tính là NET hay GROSS — giá cũ chưa rõ bản chất nên hệ thống không mặc định là NET.'});
      const amount=req.body.amount===undefined?(item.buyUnitPrice===null?null:item.buyUnitPrice*item.quantity):req.body.amount;
      if(!isValidMoneyAmount(amount))return res.status(400).json({message:'Chưa có số tiền để ước tính: dòng chưa có giá đầu vào và chưa nhập số tiền trực tiếp.'});
      const computed=computeContractMoney({basis,amount,taxRate:ptax.taxRate,taxMode:ptax.taxMode as any});
      if(!computed)return res.status(400).json({message:'Không tính được chi phí ước tính từ hồ sơ.'});
      costSource={kind:'profile',status:'du_kien',partnerType:partner.type,partnerId:partner.id,profileRevision:prow.revision,basis,amount,taxRate:ptax.taxRate,taxMode:ptax.taxMode,net:computed.net,tax:computed.tax,gross:computed.gross,...actor};
    }else if(kind==='estimate'){
      if(Object.keys(req.body).some(k=>!['revision','itemId','kind','basis','amount','taxRate','taxMode'].includes(k)))return res.status(400).json({message:'Thông tin tự xác nhận chi phí không hợp lệ.'});
      const basis=req.body.basis;
      if(basis!=='net'&&basis!=='gross')return res.status(400).json({message:'Cần xác nhận số tiền là NET hay GROSS — hệ thống không mặc định giá cũ là NET và không mặc định không thuế.'});
      const computed=computeContractMoney({basis,amount:req.body.amount,taxRate:req.body.taxRate,taxMode:req.body.taxMode});
      if(!computed)return res.status(400).json({message:'Số tiền, suất thuế hoặc cách tính chưa hợp lệ (số nguyên không âm; suất từ 0% đến dưới 100% kèm cách tính rõ ràng).'});
      costSource={kind:'estimate',status:'du_kien',...(partner?{partnerType:partner.type,partnerId:partner.id}:{}),basis,amount:req.body.amount,taxRate:req.body.taxRate,taxMode:req.body.taxMode,net:computed.net,tax:computed.tax,gross:computed.gross,...actor};
    }else return res.status(400).json({message:'Nguồn chi phí không hợp lệ.'});
    const previous=item.costSource??null;
    item.costSource=costSource;
    const result=db.prepare('UPDATE project_quote_versions SET payload_json=?,revision=revision+1 WHERE id=? AND revision=?').run(JSON.stringify(payload),q.id,q.revision);
    if(!result.changes)return res.status(409).json({message:'Báo giá đã thay đổi. Vui lòng tải lại.'});
    audit(u.id,'apply_quote_cost_source',q.id);
    res.json({quote:serialized(quote(q.id,pid),access(u,pid,true)),previous,costSource});
  });

  router.post('/projects/:id/quotes/:quoteId/cost-source/clear',(req,res)=>{
    const u=res.locals.user,pid=req.params.id;if(!access(u,pid))return res.status(403).json({message:'Bạn không có quyền thao tác trên dự án này.'});
    const q=quote(req.params.quoteId,pid);if(!q)return res.status(404).json({message:'Không tìm thấy báo giá trong dự án.'});
    if(!['draft','changes_requested'].includes(q.status))return res.status(409).json({message:'Phiên bản đã gửi duyệt hoặc đã duyệt không sửa được nguồn chi phí.'});
    if(Object.keys(req.body??{}).some(k=>!['revision','itemId'].includes(k)))return res.status(400).json({message:'Thông tin xoá nguồn chi phí không hợp lệ.'});
    if(!Number.isSafeInteger(req.body?.revision)||req.body.revision!==q.revision)return res.status(409).json({message:'Báo giá đã thay đổi. Tải lại trước khi thao tác.'});
    const payload=JSON.parse(q.payload_json) as QuotePayload;
    const item=payload.items.find(i=>i.id===req.body?.itemId);
    if(!item)return res.status(404).json({message:'Không tìm thấy dòng trong báo giá.'});
    const previous=item.costSource??null;
    delete item.costSource;
    const result=db.prepare('UPDATE project_quote_versions SET payload_json=?,revision=revision+1 WHERE id=? AND revision=?').run(JSON.stringify(payload),q.id,q.revision);
    if(!result.changes)return res.status(409).json({message:'Báo giá đã thay đổi. Vui lòng tải lại.'});
    audit(u.id,'clear_quote_cost_source',q.id);
    res.json({quote:serialized(quote(q.id,pid),access(u,pid,true)),previous});
  });

  router.get('/projects/:id/quotes/:quoteId/customer',(req,res)=>{
    const u=res.locals.user;const pid=req.params.id;
    if(!access(u,pid,true))return res.status(403).json({message:'Booking không được xem bản giá bán.'});
    const q=quote(req.params.quoteId,pid);if(!q||q.status!=='approved')return res.status(400).json({message:'Báo giá cần được duyệt trước khi xuất khách.'});
    const p=JSON.parse(q.payload_json) as QuotePayload;const f=finance(p);
    // Bản khách chỉ chứa thông tin bán: đối tác, mô tả, GHI CHÚ HẠNG MỤC (note —
    // nội dung dành cho khách), đơn vị, số lượng, giá bán; với dòng dịch vụ comment
    // có thêm phạm vi và tổng số comment bao gồm. Không lộ giá mua, điều kiện nội bộ
    // (conditions), nguồn xác nhận, P&L hay bất kỳ thông tin nội bộ nào khác.
    res.json({version:q.number,client:p.client,campaign:p.campaign,items:p.items.filter(i=>i.included).map(i=>({creator:i.creator,description:i.description,phase:i.phase,quantity:i.quantity,unit:i.unit??null,serviceName:i.serviceName??null,partnerType:i.partnerType??(i.kind==='kol'?'kol':i.kind==='community'?'community':'other'),...(i.note?{note:i.note}:{}),...(isCommentServiceLine(i)?{scopeNote:i.commentInfo?.scopeNote??'',commentsIncluded:includedCommentsOf(i)}:{}),sellUnitPrice:i.sellUnitPrice,total:i.quantity*i.sellUnitPrice!})),subtotal:f.knownSellTotal,discount:f.discount,agencyFee:f.agencyFee,revenueBeforeTax:f.revenueBeforeTax,taxRate:p.taxRate,tax:f.tax,totalWithTax:f.totalWithTax});
  });
}
