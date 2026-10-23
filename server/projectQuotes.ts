import type {Router} from 'express';
import type {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {calculateProjectFinance, type Adjustment} from '../src/domain/projectFinance';
import {readProjectBrief} from '../src/domain/projectBrief';
import {buildPhaseQuoteItems, type PhaseQuotePhase} from '../src/domain/phaseQuote';

export interface ProjectQuoteItem {
  id:string; creator:string; description:string; phase:string;
  kind:'kol'|'buzz'|'seeding'|'production'|'other';
  quantity:number; buyUnitPrice:number|null; sellUnitPrice:number|null; included:boolean;
  shortlistId?:string; format?:string; priceSnapshot?:unknown;
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
    if(!it||!text(it.id,100)||ids.has(it.id)||!text(it.creator,200)||!text(it.description)||text(it.phase,200)===null||!['kol','buzz','seeding','production','other'].includes(it.kind)||!Number.isSafeInteger(it.quantity)||it.quantity<=0||it.quantity>100000||!validMoney(it.buyUnitPrice)||!validMoney(it.sellUnitPrice)||typeof it.included!=='boolean')return false;
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
// Giá đầu vào "chưa xác nhận" áp dụng cho dòng lấy từ danh sách KOL (có priceSnapshot);
// dòng chi phí nhập trực tiếp không có bước xác nhận riêng nên chỉ cần có giá.
const priceGate=(p:QuotePayload)=>{
  let missingBuy=0,missingSell=0,unconfirmedBuy=0;
  for(const i of p.items){
    if(!i.included)continue;
    if(i.buyUnitPrice===null)missingBuy++;
    if(i.sellUnitPrice===null)missingSell++;
    const snap=(i as unknown as {priceSnapshot?:{status?:string}}).priceSnapshot;
    if(i.buyUnitPrice!==null&&snap&&snap.status!=='confirmed')unconfirmedBuy++;
  }
  return {missingBuy,missingSell,unconfirmedBuy,ok:missingBuy===0&&missingSell===0&&unconfirmedBuy===0};
};
const priceGateMessage=(g:ReturnType<typeof priceGate>)=>{
  const parts:string[]=[];
  if(g.missingBuy)parts.push(`thiếu giá đầu vào ở ${g.missingBuy} dòng`);
  if(g.unconfirmedBuy)parts.push(`giá đầu vào chưa xác nhận ở ${g.unconfirmedBuy} dòng`);
  if(g.missingSell)parts.push(`thiếu giá bán ở ${g.missingSell} dòng`);
  return `Chưa thể gửi duyệt, duyệt hoặc chốt báo giá: ${parts.join('; ')}. Hãy bổ sung/xác nhận giá trong danh sách KOL của dự án rồi lấy lại giá vào bản nháp.`;
};
const cleanItems=(items:ProjectQuoteItem[])=>items.map(i=>({id:i.id,creator:i.creator.trim(),description:i.description.trim(),phase:i.phase.trim(),kind:i.kind,quantity:i.quantity,buyUnitPrice:i.buyUnitPrice,sellUnitPrice:i.sellUnitPrice,included:i.included}));

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
    return {...common,client:p.client,campaign:p.campaign,items:p.items.map(i=>({id:i.id,creator:i.creator,description:i.description,phase:i.phase,kind:i.kind,quantity:i.quantity,buyUnitPrice:i.buyUnitPrice,included:i.included,shortlistId:i.shortlistId,format:i.format,priceSnapshot:i.priceSnapshot}))};
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
      p.items=p.items.map(i=>{const old=originalItems.find(o=>o.id===i.id);return old?.shortlistId?{...i,kind:'kol',creator:old.creator,buyUnitPrice:old.buyUnitPrice,shortlistId:old.shortlistId,format:old.format,priceSnapshot:old.priceSnapshot}:i;});
    }else{
      if(Object.keys(req.body).some(k=>!['revision','buyPrices'].includes(k))||!Array.isArray(req.body.buyPrices)||req.body.buyPrices.length>500)return res.status(403).json({message:'Booking chỉ được cập nhật giá đầu vào.'});
      const updates=req.body.buyPrices;
      if(updates.some((x:any)=>!x||Object.keys(x).some(k=>!['id','buyUnitPrice'].includes(k))||!p.items.some(i=>i.id===x.id)||!validMoney(x.buyUnitPrice)))return res.status(400).json({message:'Giá đầu vào hoặc hạng mục không hợp lệ.'});
      if(updates.some((x:any)=>{const i=p.items.find(i=>i.id===x.id)!;return i.shortlistId&&i.buyUnitPrice!==x.buyUnitPrice;}))return res.status(403).json({message:'Giá KOL đã chụp vào phương án không được sửa tại đây. Cập nhật giá tại danh sách chung rồi đề nghị PM lập phiên bản mới.'});
      // null là xóa giá về trạng thái chờ xác nhận, không phải giá miễn phí.
      for(const update of updates)p.items.find(i=>i.id===update.id)!.buyUnitPrice=update.buyUnitPrice;
    }
    try{finance(p);}catch{return res.status(400).json({message:'Chiết khấu hoặc tổng tiền vượt phạm vi hợp lệ.'});}
    const result=db.prepare('UPDATE project_quote_versions SET payload_json=?,revision=revision+1,status=\'draft\' WHERE id=? AND revision=?').run(JSON.stringify(p),q.id,q.revision);
    if(!result.changes)return res.status(409).json({message:'Báo giá đã thay đổi. Vui lòng tải lại.'});
    audit(u.id,'save_quote',q.id);res.json({quote:serialized(quote(q.id,pid),access(u,pid,true))});
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
  // Đợt 9B: tạo phương án + V1 từ các phase đã chọn (PM/Admin).
  router.post('/projects/:id/options/from-phases',(req,res)=>{
    const u=res.locals.user;const pid=req.params.id;
    if(!access(u,pid,true))return res.status(403).json({message:'Chỉ PM/Admin được tạo phương án từ phase.'});
    if(!text(req.body.name,200))return res.status(400).json({message:'Nhập tên phương án.'});
    const phaseIds=req.body.phaseIds;
    if(!Array.isArray(phaseIds)||!phaseIds.length||phaseIds.length>20||phaseIds.some((x:any)=>typeof x!=='string'))return res.status(400).json({message:'Chọn ít nhất một phase.'});
    const p=project(pid);if(!p.client_name||!p.campaign_name)return res.status(400).json({message:'Bổ sung khách hàng và tên chiến dịch trước khi tạo phương án.'});
    const allPhases=db.prepare('SELECT * FROM project_phases WHERE project_id=? ORDER BY sort_order,rowid').all(pid) as any[];
    const byId=new Map(allPhases.map((x:any)=>[x.id,x]));
    if(phaseIds.some((id:string)=>!byId.has(id)))return res.status(400).json({message:'Có phase không thuộc dự án này.'});
    const firstPhaseId=allPhases[0]?.id;
    const input:PhaseQuotePhase[]=phaseIds.map((id:string)=>{
      const ph=byId.get(id);
      const rows=db.prepare('SELECT * FROM project_shortlist WHERE project_id=? AND (phase_id=? OR (phase_id IS NULL AND ?=?)) ORDER BY rowid').all(pid,id,id,firstPhaseId).map((r:any)=>({shortlistId:r.id,creator:JSON.parse(r.profile_json).ten,prices:JSON.parse(r.prices_json)}));
      let brief=null;
      if(ph.brief_json){try{const b=readProjectBrief(JSON.parse(ph.brief_json));brief={deliverableScope:b.deliverableScope,deliverables:b.deliverables.map((d:any)=>({format:d.format,quantity:d.quantity}))};}catch{brief=null;}}
      return {name:ph.name,brief,rows};
    });
    const built=buildPhaseQuoteItems(input,()=>randomUUID());
    if(!built.items.length)return res.status(400).json({message:'Các phase đã chọn chưa có KOL hoặc chưa có hạng mục trong brief của phase. Bổ sung danh sách/brief của phase trước.'});
    if(built.items.length>500)return res.status(400).json({message:'Phương án vượt quá 500 hạng mục. Tách bớt phase hoặc giảm số KOL.'});
    const oid=randomUUID(),qid=randomUUID(),now=new Date().toISOString();
    const payload:QuotePayload={client:p.client_name,campaign:p.campaign_name,items:built.items as ProjectQuoteItem[],discount:{mode:'fixed',value:0},agencyFee:{mode:'percent',value:12},taxRate:0};
    if(!validate(payload))return res.status(400).json({message:'Dữ liệu sinh từ phase không hợp lệ.'});
    db.exec('BEGIN');try{
      db.prepare('INSERT INTO project_options VALUES (?,?,?,?,?,?)').run(oid,pid,req.body.name.trim(),'',u.id,now);
      db.prepare('INSERT INTO project_quote_versions VALUES (?,?,1,\'draft\',1,?,?,?,NULL)').run(qid,oid,JSON.stringify(payload),u.id,now);
      audit(u.id,'create_option_from_phases',oid);db.exec('COMMIT');
    }catch{db.exec('ROLLBACK');return res.status(400).json({message:'Không thể tạo phương án từ phase.'});}
    res.json({optionId:oid,quoteId:qid,itemCount:built.items.length,missingPrice:built.missingPrice,unconfirmedPrice:built.unconfirmedPrice,skippedPhases:built.skippedPhases});
  });
  router.get('/projects/:id/quotes/:quoteId/customer',(req,res)=>{
    const u=res.locals.user;const pid=req.params.id;
    if(!access(u,pid,true))return res.status(403).json({message:'Booking không được xem bản giá bán.'});
    const q=quote(req.params.quoteId,pid);if(!q||q.status!=='approved')return res.status(400).json({message:'Báo giá cần được duyệt trước khi xuất khách.'});
    const p=JSON.parse(q.payload_json) as QuotePayload;const f=finance(p);
    res.json({version:q.number,client:p.client,campaign:p.campaign,items:p.items.filter(i=>i.included).map(i=>({creator:i.creator,description:i.description,phase:i.phase,quantity:i.quantity,sellUnitPrice:i.sellUnitPrice,total:i.quantity*i.sellUnitPrice!})),subtotal:f.knownSellTotal,discount:f.discount,agencyFee:f.agencyFee,revenueBeforeTax:f.revenueBeforeTax,taxRate:p.taxRate,tax:f.tax,totalWithTax:f.totalWithTax});
  });
}
