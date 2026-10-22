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
  function profile(p:any){
    if(!p||!str(p.id,100)||!p.id.trim()||!str(p.ten,200)||!p.ten.trim()||!Array.isArray(p.linhVuc)||p.linhVuc.length>50||p.linhVuc.some((v:any)=>!str(v,100))||!Array.isArray(p.nenTang)||p.nenTang.length>30||!p.bangGia||formats.some(f=>!money(p.bangGia[f]??null)))return null;
    if(p.nenTang.some((c:any)=>!c||!str(c.tenNenTang,50)||!str(c.linkProfile??'',2000)||!Number.isSafeInteger(c.soFollower)||c.soFollower<0)||!str(p.reviewSoBo??'',5000))return null;
    return {id:p.id,ten:p.ten.trim(),linhVuc:p.linhVuc,nenTang:p.nenTang.map((c:any)=>({tenNenTang:c.tenNenTang,linkProfile:c.linkProfile??'',soFollower:c.soFollower})),reviewSoBo:p.reviewSoBo??'',anhDaiDien:typeof p.anhDaiDien==='string'&&/^https?:\/\//i.test(p.anhDaiDien)?p.anhDaiDien:undefined,bangGia:Object.fromEntries(formats.map(f=>[f,p.bangGia[f]??null]))};
  }
  const emptyBrief=emptyProjectBrief;
  router.get('/projects/:id/shortlist',(req,res)=>{
    const u=res.locals.user,pid=req.params.id;if(!access(u,pid))return res.status(403).json({message:'Bạn không có quyền xem dự án này.'});
    const b=db.prepare('SELECT * FROM project_briefs WHERE project_id=?').get(pid) as any;
    const catalog=db.prepare('SELECT profile_json FROM kol_catalog WHERE organization_id=? ORDER BY rowid').all(u.organization_id).map((r:any)=>(()=>{const {engagementRate,...p}=JSON.parse(r.profile_json);return p;})());
    const brief=readProjectBrief(b?JSON.parse(b.payload_json):null);
    // Không cắt Top N; số KOL mục tiêu chỉ để PM đối chiếu khi chọn phương án.
    const matches=catalog.filter(p=>assessProjectKol(p,brief).matches);
    const rows=db.prepare('SELECT * FROM project_shortlist WHERE project_id=? ORDER BY rowid').all(pid).map((r:any)=>({id:r.id,catalogId:r.catalog_id,profile:(()=>{const {engagementRate,...p}=JSON.parse(r.profile_json);return p;})(),prices:JSON.parse(r.prices_json),revision:r.revision}));
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
    db.exec('BEGIN');try{
      for(const p of profiles){
        const row=db.prepare('SELECT profile_json FROM kol_catalog WHERE id=? AND organization_id=?').get(p!.id,u.organization_id) as any;
        const newJson=JSON.stringify(p);
        if(!row){
          db.prepare('INSERT INTO kol_catalog VALUES (?,?,?)').run(p!.id,u.organization_id,newJson);
          added++;
        }else if(row.profile_json!==newJson){
          db.prepare('UPDATE kol_catalog SET profile_json=? WHERE id=? AND organization_id=?').run(newJson,p!.id,u.organization_id);
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
    const p=profile({...req.body.profile,id:randomUUID()});if(!p)return res.status(400).json({message:'Kiểm tra tên, lĩnh vực, nền tảng, follower và giá KOL.'});
    db.prepare('INSERT INTO kol_catalog VALUES (?,?,?)').run(p.id,u.organization_id,JSON.stringify(p));audit(u.id,'create_catalog_kol',p.id);res.json({id:p.id});
  });
  router.post('/projects/:id/shortlist/add',(req,res)=>{
    const u=res.locals.user,pid=req.params.id;if(!access(u,pid))return res.status(403).json({message:'Bạn không có quyền cập nhật danh sách dự án.'});
    if(!Array.isArray(req.body.ids)||!req.body.ids.length||req.body.ids.length>500||req.body.ids.some((id:any)=>typeof id!=='string'))return res.status(400).json({message:'Chọn KOL cần thêm.'});
    const profiles=req.body.ids.map((id:string)=>db.prepare('SELECT profile_json FROM kol_catalog WHERE id=? AND organization_id=?').get(id,u.organization_id) as any);
    if(profiles.some((p:any)=>!p))return res.status(400).json({message:'KOL không thuộc thư viện công ty.'});
    let added=0;db.exec('BEGIN');try{for(const row of profiles){const p=JSON.parse(row.profile_json);const prices=Object.fromEntries(formats.map(f=>[f,{value:p.bangGia[f],status:p.bangGia[f]===null?'waiting':'unconfirmed',source:'',checkedAt:null,checkedBy:null}]));added+=Number(db.prepare('INSERT OR IGNORE INTO project_shortlist VALUES (?,?,?,?,?,1)').run(randomUUID(),pid,p.id,JSON.stringify(p),JSON.stringify(prices)).changes);}audit(u.id,'add_project_shortlist',pid);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
    res.json({added});
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
    const p=JSON.parse(q.payload_json);let updated=0;
    for(const i of p.items){if(!i.shortlistId)continue;const row=db.prepare('SELECT prices_json FROM project_shortlist WHERE id=? AND project_id=?').get(i.shortlistId,pid) as any;const price=row?JSON.parse(row.prices_json)[i.format]:null;
      if(!price||price.status!=='confirmed')return res.status(400).json({message:'Cần xác nhận lại đủ giá hạng mục trong danh sách chung trước khi lấy giá mới.'});
      i.buyUnitPrice=price.value;i.priceSnapshot=price;updated++;
    }
    if(!validTotals(p))return res.status(400).json({message:'Tổng tiền vượt phạm vi hỗ trợ. Giảm số lượng hoặc kiểm tra giá.'});
    db.prepare('UPDATE project_quote_versions SET payload_json=?,revision=revision+1 WHERE id=? AND revision=?').run(JSON.stringify(p),q.id,q.revision);audit(u.id,'refresh_quote_buy_prices',q.id);res.json({success:true,updated});
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
      const price=JSON.parse(row.prices_json)[s.format];if(price.status!=='confirmed')return res.status(400).json({message:'Booking cần xác nhận giá của hạng mục đã chọn trước khi lập phương án.'});
      const p=JSON.parse(row.profile_json);newItems.push({id:randomUUID(),creator:p.ten,description:PRICE_FORMAT_LABELS[s.format as keyof typeof PRICE_FORMAT_LABELS],phase:'',kind:'kol',quantity:s.quantity,buyUnitPrice:price.value,sellUnitPrice:null,included:true,shortlistId:row.id,format:s.format,priceSnapshot:price});
    }
    if(payload.items.length+newItems.length>500)return res.status(400).json({message:'Một báo giá hỗ trợ tối đa 500 hạng mục.'});
    payload.items.push(...newItems);if(!validTotals(payload))return res.status(400).json({message:'Tổng tiền vượt phạm vi hỗ trợ. Giảm số lượng hoặc kiểm tra giá.'});db.prepare("UPDATE project_quote_versions SET payload_json=?,revision=revision+1,status='draft' WHERE id=? AND revision=?").run(JSON.stringify(payload),q.id,q.revision);audit(u.id,'shortlist_to_option',q.id);res.json({success:true,added:newItems.length});
  });
}
