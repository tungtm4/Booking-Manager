import type {Router} from 'express';
import type {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {calculateProjectFinance, type Adjustment} from '../src/domain/projectFinance';
import {readProjectBrief} from '../src/domain/projectBrief';
import {buildAllocatedQuoteItems, suggestAllocations, type AllocatedLine} from '../src/domain/phaseQuote';
import {PRICE_FORMAT_LABELS, type PriceFormatKey} from '../src/types/kol';

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
  // Bối cảnh comment thuê ngoài: tổng comments mục tiêu của brief (chỉ để đối chiếu —
  // KHÔNG tự suy ra số lượng mua), phạm vi áp dụng và phần gói đã bao gồm để tránh tính trùng.
  commentInfo?:{briefTargetTotal:number|null; scopeNote:string; includedNote:string};
  // Số lượng thực tế đã nghiệm thu (phân biệt với số lượng mục tiêu và số đã phân bổ).
  acceptedQty?:number|null;
  // Xác nhận giá đầu vào cho dòng nhập tay — CHỈ server ghi qua endpoint xác nhận,
  // client không tự đặt được (bản lưu luôn lấy từ dữ liệu server đã có).
  buyConfirmation?:{value:number; source:string; checkedBy:string; checkedByName:string; checkedAt:string};
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
const priceGateMessage=(g:ReturnType<typeof priceGate>)=>{
  const parts:string[]=[];
  if(g.missingBuy)parts.push(`thiếu giá đầu vào ở ${g.missingBuy} dòng`);
  if(g.unconfirmedBuy)parts.push(`giá đầu vào chưa xác nhận ở ${g.unconfirmedBuy} dòng`);
  if(g.missingSell)parts.push(`thiếu giá bán ở ${g.missingSell} dòng`);
  return `Chưa thể gửi duyệt, duyệt hoặc chốt báo giá: ${parts.join('; ')}. Với dòng nhập tay (KOL, Community, dịch vụ comment), hãy xác nhận giá ngay trong bản nháp; với dòng lấy từ danh sách của dự án, hãy xác nhận trong danh sách rồi lấy lại giá vào bản nháp.`;
};
// cleanItems chỉ giữ các trường client được sửa. Các trường server sở hữu (shortlistId,
// format, serviceId, priceSnapshot, buyConfirmation, needsBuyConfirmation, commentInfo)
// KHÔNG lấy từ payload — chúng được khôi phục từ bản đã lưu ở bước hợp nhất phía dưới.
const cleanItems=(items:ProjectQuoteItem[])=>items.map(i=>({id:i.id,creator:i.creator.trim(),description:i.description.trim(),phase:i.phase.trim(),kind:i.kind,quantity:i.quantity,buyUnitPrice:i.buyUnitPrice,sellUnitPrice:i.sellUnitPrice,included:i.included,
  ...(i.partnerType?{partnerType:i.partnerType}:{}),
  ...(typeof i.serviceName==='string'&&i.serviceName.trim()?{serviceName:i.serviceName.trim().slice(0,200)}:{}),
  ...(typeof i.unit==='string'&&i.unit.trim()?{unit:i.unit.trim().slice(0,50)}:{}),
  ...(typeof i.conditions==='string'&&i.conditions.trim()?{conditions:i.conditions.trim().slice(0,1000)}:{}),
  ...(i.acceptedQty!==undefined?{acceptedQty:i.acceptedQty}:{})}));

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
    return {...common,client:p.client,campaign:p.campaign,items:p.items.map(i=>({id:i.id,creator:i.creator,description:i.description,phase:i.phase,kind:i.kind,quantity:i.quantity,buyUnitPrice:i.buyUnitPrice,included:i.included,shortlistId:i.shortlistId,format:i.format,priceSnapshot:i.priceSnapshot,buyConfirmation:i.buyConfirmation,partnerType:i.partnerType,serviceId:i.serviceId,serviceName:i.serviceName,unit:i.unit,conditions:i.conditions,needsBuyConfirmation:i.needsBuyConfirmation,commentInfo:i.commentInfo,acceptedQty:i.acceptedQty}))};
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
      // needsBuyConfirmation/commentInfo luôn lấy từ bản đã lưu; xác nhận giá chỉ giữ lại
      // khi giá đầu vào không đổi — đổi giá là mất xác nhận và phải xác nhận lại.
      p.items=p.items.map(i=>{
        if(i.shortlistId)return i;
        const old=originalItems.find(o=>o.id===i.id);
        if(!old||old.shortlistId)return i;
        return {...i,
          ...(old.needsBuyConfirmation?{needsBuyConfirmation:true}:{}),
          ...(old.commentInfo?{commentInfo:old.commentInfo}:{}),
          ...(old.partnerType?{partnerType:old.partnerType}:{}),
          ...(old.buyConfirmation&&old.buyUnitPrice===i.buyUnitPrice?{buyConfirmation:old.buyConfirmation}:{})};
      });
    }else{
      if(Object.keys(req.body).some(k=>!['revision','buyPrices'].includes(k))||!Array.isArray(req.body.buyPrices)||req.body.buyPrices.length>500)return res.status(403).json({message:'Booking chỉ được cập nhật giá đầu vào.'});
      const updates=req.body.buyPrices;
      if(updates.some((x:any)=>!x||Object.keys(x).some(k=>!['id','buyUnitPrice'].includes(k))||!p.items.some(i=>i.id===x.id)||!validMoney(x.buyUnitPrice)))return res.status(400).json({message:'Giá đầu vào hoặc hạng mục không hợp lệ.'});
      if(updates.some((x:any)=>{const i=p.items.find(i=>i.id===x.id)!;return i.shortlistId&&i.buyUnitPrice!==x.buyUnitPrice;}))return res.status(403).json({message:'Giá KOL đã chụp vào phương án không được sửa tại đây. Cập nhật giá tại danh sách chung rồi đề nghị PM lập phiên bản mới.'});
      // null là xóa giá về trạng thái chờ xác nhận, không phải giá miễn phí.
      // Đổi giá đầu vào của dòng KOL nhập tay làm mất xác nhận đã ghi trước đó.
      for(const update of updates){const it=p.items.find(i=>i.id===update.id)!;if(it.buyUnitPrice!==update.buyUnitPrice&&it.buyConfirmation)delete it.buyConfirmation;it.buyUnitPrice=update.buyUnitPrice;}
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
      if(!validMoney(c.buyUnitPrice??null)||!validMoney(c.sellUnitPrice??null))return res.status(400).json({message:'Giá dịch vụ comment không hợp lệ.'});
      const brief=briefOf(ph);
      items.push({id:randomUUID(),creator:vendor,description:text(c.scopeNote,1000)||'Dịch vụ comment thuê ngoài',phase:phaseName,kind:'seeding',partnerType:'service',quantity:mode==='package'?1:c.quantity,buyUnitPrice:c.buyUnitPrice??null,sellUnitPrice:c.sellUnitPrice??null,included:true,unit:mode==='package'?'gói':'comment',needsBuyConfirmation:true,commentInfo:{briefTargetTotal:brief?.kpiComments??null,scopeNote:text(c.scopeNote,1000)??'',includedNote:text(c.includedNote,1000)??''}});
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
  router.get('/projects/:id/quotes/:quoteId/customer',(req,res)=>{
    const u=res.locals.user;const pid=req.params.id;
    if(!access(u,pid,true))return res.status(403).json({message:'Booking không được xem bản giá bán.'});
    const q=quote(req.params.quoteId,pid);if(!q||q.status!=='approved')return res.status(400).json({message:'Báo giá cần được duyệt trước khi xuất khách.'});
    const p=JSON.parse(q.payload_json) as QuotePayload;const f=finance(p);
    // Bản khách chỉ chứa thông tin bán: đối tác, mô tả, đơn vị, số lượng, giá bán.
    // Không lộ giá mua, nguồn xác nhận hay bất kỳ thông tin nội bộ nào.
    res.json({version:q.number,client:p.client,campaign:p.campaign,items:p.items.filter(i=>i.included).map(i=>({creator:i.creator,description:i.description,phase:i.phase,quantity:i.quantity,unit:i.unit??null,serviceName:i.serviceName??null,partnerType:i.partnerType??(i.kind==='kol'?'kol':i.kind==='community'?'community':'other'),sellUnitPrice:i.sellUnitPrice,total:i.quantity*i.sellUnitPrice!})),subtotal:f.knownSellTotal,discount:f.discount,agencyFee:f.agencyFee,revenueBeforeTax:f.revenueBeforeTax,taxRate:p.taxRate,tax:f.tax,totalWithTax:f.totalWithTax});
  });
}
