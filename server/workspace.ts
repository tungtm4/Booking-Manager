import express, { type Request } from 'express';
import {installProjectShortlist} from './projectShortlist';
import {installProjectQuotes} from './projectQuotes';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import path from 'node:path';

const digest = (s: string) => createHash('sha256').update(s).digest('hex');
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
};
const verifyPassword = (password: string, stored: string) => {
  const [salt, encoded] = stored.split(':');
  if (!salt || !encoded) return false;
  const expected = Buffer.from(encoded, 'hex');
  const actual = scryptSync(password, salt, 64);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
const safeUser = (u: any) => ({ id: u.id, email: u.email, name: u.display_name, role: u.organization_role, active: Boolean(u.active), mustChangePassword: Boolean(u.must_change_password) });

export function createWorkspace(directory: string, options: { memory?: boolean; setupCode?: string } = {}) {
  if (!options.memory) mkdirSync(directory, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(options.memory ? ':memory:' : path.join(directory, 'workspace.sqlite'));
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  // Schema dự án dùng chung với đặc tả; users chỉ chứa hash mật khẩu.
  db.exec(readFileSync(new URL('../database/migrations/001_project_access.sql', import.meta.url), 'utf8').replace(/CREATE TABLE /g, 'CREATE TABLE IF NOT EXISTS ').replace('CREATE INDEX ', 'CREATE INDEX IF NOT EXISTS '));
  if (!(db.prepare('PRAGMA table_info(users)').all() as any[]).some(c => c.name === 'must_change_password')) db.exec('ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0');
  db.exec(`CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, actor_id TEXT, action TEXT NOT NULL, target_id TEXT, created_at TEXT NOT NULL);`);
  if (!options.memory) chmodSync(path.join(directory, 'workspace.sqlite'), 0o600);
  db.prepare('INSERT OR IGNORE INTO organizations(id,name) VALUES (?,?)').run('company', 'Công ty của tôi');
  // Cookie riêng cho từng workspace, tránh phiên preview/local ở cổng khác ghi đè nhau.
  const sessionCookie = 'booking_session_' + digest(options.memory ? randomUUID() : path.resolve(directory)).slice(0,12);
  const codeFile = path.join(directory, 'setup-code.txt');
  const setupCode = options.setupCode ?? (!options.memory && existsSync(codeFile) ? readFileSync(codeFile, 'utf8').trim() : randomBytes(24).toString('hex'));
  if (!options.memory && !existsSync(codeFile)) writeFileSync(codeFile, setupCode, {mode:0o600});
  const audit = (actor: string | null, action: string, target: string) => db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?)').run(randomUUID(),actor,action,target,new Date().toISOString());
  const countUsers = () => Number((db.prepare('SELECT count(*) AS n FROM users').get() as any).n);
  const sessionUser = (req: Request): any => {
    const token = req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith(sessionCookie+'='))?.slice(sessionCookie.length+1);
    if (!token) return null;
    return db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1').get(digest(token),Date.now()) ?? null;
  };
  const router = express.Router();
  const attempts = new Map<string,{count:number; until:number}>();
  router.use((req,res,next)=>{
    if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
      const origin=req.headers.origin;
      if (origin && origin !== `${req.protocol}://${req.get('host')}`) return res.status(403).json({message:'Yêu cầu không hợp lệ.'});
      if (!req.is('application/json')) return res.status(415).json({message:'Yêu cầu phải dùng JSON.'});
    }
    next();
  });
  router.get('/auth/status',(_req,res)=>res.json({needsSetup:countUsers()===0}));
  router.post('/auth/setup',(req,res)=>{
    if (countUsers()) return res.status(409).json({message:'Hệ thống đã được khởi tạo.'});
    const {code,email,password,name}=req.body;
    if (typeof code!=='string' || digest(code)!==digest(setupCode)) return res.status(403).json({message:'Mã khởi tạo không đúng.'});
    if (!emailPattern.test(String(email)) || typeof password!=='string' || password.length<12 || password.length>128 || !String(name??'').trim()) return res.status(400).json({message:'Nhập tên, email hợp lệ và mật khẩu từ 12 đến 128 ký tự.'});
    const id=randomUUID();
    db.prepare('INSERT INTO users(id,organization_id,email,display_name,password_hash,organization_role) VALUES (?,?,?,?,?,?)').run(id,'company',String(email).trim().toLowerCase(),String(name).trim(),hashPassword(password),'admin');
    audit(id,'setup_admin',id);
    res.json({success:true});
  });
  router.post('/auth/login',(req,res)=>{
    const key=req.ip??'unknown'; const current=attempts.get(key);
    if(current && current.until>Date.now() && current.count>=10) return res.status(429).json({message:'Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 15 phút.'});
    const {email,password}=req.body;
    if(typeof password!=='string'||password.length>128) return res.status(400).json({message:'Thông tin đăng nhập không hợp lệ.'});
    const u=db.prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE').get(String(email??'').trim()) as any;
    const valid=u ? verifyPassword(password,u.password_hash) : (scryptSync(password,'dummy-login-salt',64),false);
    if(!valid||!u.active) {
      attempts.set(key,{count:current&&current.until>Date.now()?current.count+1:1,until:current&&current.until>Date.now()?current.until:Date.now()+900000});
      return res.status(401).json({message:'Email hoặc mật khẩu không đúng.'});
    }
    attempts.delete(key);
    const token=randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now());
    db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(token),u.id,Date.now()+8*3600000);
    res.cookie(sessionCookie,token,{httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',maxAge:8*3600000,path:'/'});
    audit(u.id,'login',u.id);res.json({user:safeUser(u)});
  });
  router.use((req,res,next)=>{
    const u=sessionUser(req);if(!u)return res.status(401).json({message:'Vui lòng đăng nhập.'});
    res.locals.user=u;next();
  });
  router.get('/auth/me',(_req,res)=>res.json({user:safeUser(res.locals.user)}));
  router.post('/auth/logout',(req,res)=>{
    const token=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith(sessionCookie+'='))?.slice(sessionCookie.length+1);
    if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));
    res.clearCookie(sessionCookie,{path:'/'});res.json({success:true});
  });
  router.post('/auth/password',(req,res)=>{
    const {currentPassword,newPassword}=req.body;
    if(typeof currentPassword!=='string'||currentPassword.length>128||typeof newPassword!=='string'||newPassword.length<12||newPassword.length>128||!verifyPassword(currentPassword,res.locals.user.password_hash))return res.status(400).json({message:'Mật khẩu hiện tại không đúng hoặc mật khẩu mới chưa đủ 12 ký tự.'});
    db.prepare('UPDATE users SET password_hash=?,must_change_password=0 WHERE id=?').run(hashPassword(newPassword),res.locals.user.id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(res.locals.user.id);
    res.clearCookie(sessionCookie,{path:'/'});audit(res.locals.user.id,'change_password',res.locals.user.id);res.json({success:true});
  });
  router.use((_req,res,next)=>res.locals.user.must_change_password?res.status(403).json({message:'Vui lòng đổi mật khẩu trước khi tiếp tục.'}):next());
  const isAdmin=(u:any)=>u.organization_role==='admin';
  const member=(userId:string,projectId:string)=>db.prepare('SELECT r.role FROM project_member_roles r JOIN project_members m ON r.project_id=m.project_id AND r.user_id=m.user_id WHERE r.project_id=? AND r.user_id=? AND m.active=1').all(projectId,userId) as any[];
  const projectAccess=(u:any,id:string,manage=false)=> {
    if(!db.prepare('SELECT id FROM projects WHERE id=? AND organization_id=?').get(id,u.organization_id))return false;
    if(isAdmin(u))return true;
    return member(u.id,id).some(r=>manage?['admin','pm'].includes(r.role):true);
  };
  installProjectQuotes(router,db,projectAccess,audit);
  installProjectShortlist(router,db,projectAccess,audit);
  router.get('/users',(_req,res)=>{
    if(!isAdmin(res.locals.user))return res.status(403).json({message:'Chỉ Admin được xem danh sách tài khoản.'});
    res.json({users:db.prepare('SELECT * FROM users WHERE organization_id=? ORDER BY display_name').all(res.locals.user.organization_id).map(safeUser)});
  });
  router.post('/users',(req,res)=>{
    if(!isAdmin(res.locals.user))return res.status(403).json({message:'Chỉ Admin được tạo tài khoản.'});
    const {email,name,password,role}=req.body;
    if(!emailPattern.test(String(email))||!String(name??'').trim()||typeof password!=='string'||password.length<12||password.length>128||!['admin','member'].includes(role))return res.status(400).json({message:'Kiểm tra tên, email, vai trò và mật khẩu tối thiểu 12 ký tự.'});
    try{const id=randomUUID();db.prepare('INSERT INTO users(id,organization_id,email,display_name,password_hash,organization_role,must_change_password) VALUES (?,?,?,?,?,?,1)').run(id,res.locals.user.organization_id,String(email).trim().toLowerCase(),String(name).trim(),hashPassword(password),role);audit(res.locals.user.id,'create_user',id);res.json({success:true});}
    catch{return res.status(409).json({message:'Email đã tồn tại hoặc thông tin chưa hợp lệ.'});}
  });
  router.post('/users/:id/active',(req,res)=>{
    const actor=res.locals.user;
    if(!isAdmin(actor))return res.status(403).json({message:'Chỉ Admin được thay đổi trạng thái tài khoản.'});
    if(typeof req.body.active!=='boolean')return res.status(400).json({message:'Trạng thái không hợp lệ.'});
    const target=db.prepare('SELECT * FROM users WHERE id=? AND organization_id=?').get(req.params.id,actor.organization_id) as any;
    if(!target)return res.status(404).json({message:'Không tìm thấy tài khoản.'});
    if(!req.body.active && target.organization_role==='admin'){
      const count=Number((db.prepare("SELECT count(*) AS n FROM users WHERE organization_id=? AND organization_role='admin' AND active=1").get(actor.organization_id) as any).n);
      if(target.active && count<=1)return res.status(409).json({message:'Phải giữ ít nhất một Admin đang hoạt động.'});
    }
    db.prepare('UPDATE users SET active=? WHERE id=?').run(req.body.active?1:0,target.id);
    if(!req.body.active)db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);
    audit(actor.id,req.body.active?'activate_user':'disable_user',target.id);res.json({success:true});
  });
  router.get('/projects',(_req,res)=>{
    const u=res.locals.user;
    const rows=isAdmin(u)?db.prepare('SELECT * FROM projects WHERE organization_id=? ORDER BY rowid DESC').all(u.organization_id):db.prepare('SELECT p.* FROM projects p JOIN project_members m ON m.project_id=p.id WHERE p.organization_id=? AND m.user_id=? AND m.active=1 ORDER BY p.rowid DESC').all(u.organization_id,u.id);
    res.json({projects:rows.map((p:any)=>({...p,canManage:projectAccess(u,p.id,true)}))});
  });
  router.post('/projects',(req,res)=>{
    if(!isAdmin(res.locals.user))return res.status(403).json({message:'Chỉ Admin được tạo dự án.'});
    if(typeof req.body.name!=='string'||!req.body.name.trim())return res.status(400).json({message:'Vui lòng nhập tên dự án.'});
    const id=randomUUID();db.prepare('INSERT INTO projects(id,organization_id,name,client_name,campaign_name) VALUES (?,?,?,?,?)').run(id,res.locals.user.organization_id,req.body.name.trim(),typeof req.body.client==='string'?req.body.client.trim().slice(0,200):'',typeof req.body.campaign==='string'?req.body.campaign.trim().slice(0,200):req.body.name.trim());audit(res.locals.user.id,'create_project',id);res.json({id});
  });
  router.get('/projects/:id/candidates',(req,res)=>{
    const actor=res.locals.user;
    if(!projectAccess(actor,req.params.id,true))return res.status(403).json({message:'Bạn không được quản lý thành viên dự án này.'});
    const candidates=db.prepare('SELECT id,display_name AS name,email FROM users WHERE organization_id=? AND active=1 ORDER BY display_name,email').all(actor.organization_id);
    res.json({candidates});
  });
  router.get('/projects/:id/members',(req,res)=>{
    if(!projectAccess(res.locals.user,req.params.id))return res.status(403).json({message:'Bạn không có quyền xem dự án này.'});
    const rows=db.prepare('SELECT u.id,u.display_name,u.email,m.active FROM project_members m JOIN users u ON u.id=m.user_id WHERE m.project_id=?').all(req.params.id);
    res.json({members:rows.map((u:any)=>({...u,roles:member(u.id,req.params.id).map(r=>r.role),duties:db.prepare('SELECT duty FROM project_member_duties WHERE project_id=? AND user_id=?').all(req.params.id,u.id).map((r:any)=>r.duty)}))});
  });
  router.post('/projects/:id/members',(req,res)=>{
    const u=res.locals.user;const projectId=req.params.id;
    if(!projectAccess(u,projectId,true))return res.status(403).json({message:'Bạn không được quản lý thành viên dự án này.'});
    const {email,role,duties=[]}=req.body;
    if(!['admin','pm','booking'].includes(role)||!Array.isArray(duties)||duties.some(d=>!['pricing','paperwork','creator_support'].includes(d)))return res.status(400).json({message:'Vai trò hoặc phân công không hợp lệ.'});
    if(!isAdmin(u)&&role!=='booking')return res.status(403).json({message:'Chỉ Admin công ty được cấp vai trò PM hoặc Admin dự án.'});
    const target=db.prepare('SELECT id FROM users WHERE email=? COLLATE NOCASE AND organization_id=? AND active=1').get(String(email??'').trim(),u.organization_id) as any;
    if(!target)return res.status(404).json({message:'Không tìm thấy tài khoản đang hoạt động. Admin cần tạo tài khoản trước.'});
    db.exec('BEGIN');try{
      db.prepare('INSERT INTO project_members VALUES (?,?,?,1) ON CONFLICT(project_id,user_id) DO UPDATE SET active=1').run(projectId,target.id,u.organization_id);
      db.prepare('INSERT OR IGNORE INTO project_member_roles VALUES (?,?,?)').run(projectId,target.id,role);
      for(const duty of duties)db.prepare('INSERT OR IGNORE INTO project_member_duties VALUES (?,?,?)').run(projectId,target.id,duty);
      audit(u.id,'assign_member',projectId);db.exec('COMMIT');
    }catch{db.exec('ROLLBACK');return res.status(400).json({message:'Không thể phân công thành viên.'});}
    res.json({success:true});
  });
  router.post('/projects/:id/members/:userId/remove',(req,res)=>{
    const actor=res.locals.user;
    if(!projectAccess(actor,req.params.id,true))return res.status(403).json({message:'Bạn không được quản lý thành viên dự án này.'});
    const targetRoles=member(req.params.userId,req.params.id);
    if(!isAdmin(actor)&&targetRoles.some(r=>r.role!=='booking'))return res.status(403).json({message:'Chỉ Admin công ty được gỡ PM hoặc Admin dự án.'});
    db.prepare('UPDATE project_members SET active=0 WHERE project_id=? AND user_id=?').run(req.params.id,req.params.userId);
    audit(actor.id,'remove_member',req.params.id);res.json({success:true});
  });
  router.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.warn('Yêu cầu quản lý tài khoản/dự án thất bại.');
    res.status(500).json({message:'Không thể xử lý yêu cầu lúc này. Vui lòng thử lại.'});
  });
  router.use((_req,res)=>res.status(404).json({message:'Không tìm thấy chức năng.'}));
  return {router,db,sessionUser};
}
