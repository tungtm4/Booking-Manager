import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createWorkspace, migrateProjectRoles} from '../server/workspace';

// Database trong bộ nhớ, không dùng tài khoản hoặc dữ liệu thật.
test('đăng nhập, mật khẩu, nhiều thành viên và phân quyền API',async()=>{
  const workspace=createWorkspace('',{memory:true,setupCode:'test-only-code'});
  const app=express();app.use(express.json());app.use('/api/workspace',workspace.router);
  const server=app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const address=server.address() as any;
  const base=`http://127.0.0.1:${address.port}/api/workspace`;
  const request=async(path:string,body?:any,cookie?:string,origin?:string)=>{
    const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{}),...(origin?{Origin:origin}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  };
  try{
    assert.equal((await request('/projects')).status,401);
    assert.equal((await request('/auth/setup',{code:'wrong'})).status,403);
    assert.equal((await request('/auth/setup',{code:'test-only-code',name:'Admin',email:'admin@example.test',password:'test-password-123'})).status,200);
    assert.equal((await request('/auth/setup',{code:'test-only-code'})).status,409);
    assert.equal((await request('/auth/login',{email:'admin@example.test',password:'wrong'})).status,401);
    const login=await request('/auth/login',{email:'admin@example.test',password:'test-password-123'});
    assert.equal(login.status,200);assert.ok(login.cookie);assert.equal(login.body.user.password_hash,undefined);
    const admin=login.cookie!;
    assert.equal((await request('/projects',{name:'Blocked'},admin,'https://evil.example')).status,403);
    const adminId=login.body.user.id;
    assert.equal((await request(`/users/${adminId}/active`,{active:false},admin)).status,409);
    const project=(await request('/projects',{name:'Dự án A'},admin)).body.id;
    const hidden=(await request('/projects',{name:'Dự án B'},admin)).body.id;
    for(const name of ['pm1','pm2','booking1','booking2','admin2']){
      assert.equal((await request('/users',{name,email:`${name}@example.test`,password:'temporary-password-123',role:name==='admin2'?'admin':'member'},admin)).status,200);
    }
    for(const name of ['pm1','pm2','booking1','booking2']){
      assert.equal((await request(`/projects/${project}/members`,{email:`${name}@example.test`,role:name.startsWith('pm')?'pm':'booking',duties:['pricing','paperwork']},admin)).status,200);
    }
    const pmLogin=await request('/auth/login',{email:'pm1@example.test',password:'temporary-password-123'});
    assert.equal((await request('/projects',undefined,pmLogin.cookie)).status,403);
    assert.equal((await request('/auth/password',{currentPassword:'temporary-password-123',newPassword:'new-test-password-456'},pmLogin.cookie)).status,200);
    assert.equal((await request('/auth/me',undefined,pmLogin.cookie)).status,401);
    const pm=(await request('/auth/login',{email:'pm1@example.test',password:'new-test-password-456'})).cookie!;
    const projects=await request('/projects',undefined,pm);
    assert.equal(projects.body.projects.length,1);assert.equal(projects.body.projects[0].id,project);
    assert.equal((await request(`/projects/${hidden}/members`,undefined,pm)).status,403);
    assert.equal((await request('/users',undefined,pm)).status,403);
    const candidates=await request(`/projects/${project}/candidates`,undefined,pm);
    assert.equal(candidates.status,200);
    assert.ok(candidates.body.candidates.some((u:any)=>u.email==='booking1@example.test'));
    assert.ok(candidates.body.candidates.every((u:any)=>Object.keys(u).sort().join(',')==='email,id,name'));
    assert.equal((await request(`/projects/${hidden}/candidates`,undefined,pm)).status,403);

    assert.equal((await request(`/projects/${project}/members`,{email:'booking1@example.test',role:'admin'},admin)).status,400);
    assert.equal((await request(`/projects/${project}/members`,{email:'booking1@example.test',role:'admin'},pm)).status,400);
    assert.equal((await request(`/projects/${project}/members`,{email:'booking1@example.test',role:'pm'},pm)).status,403);
    assert.equal((await request(`/projects/${project}/members`,undefined,pm)).body.members.length,4);
    const pm2=workspace.db.prepare("SELECT id FROM users WHERE email='pm2@example.test'").get() as any;
    assert.equal((await request(`/projects/${project}/members/${pm2.id}/remove`,{},pm)).status,403);
    const booking=workspace.db.prepare("SELECT id FROM users WHERE email='booking1@example.test'").get() as any;
    assert.equal((await request(`/projects/${project}/members/${booking.id}/remove`,{},pm)).status,200);
    assert.equal((await request(`/projects/${project}/members`,{email:'booking1@example.test',role:'booking'},pm)).status,200);
    assert.equal((await request(`/users/${pm2.id}/active`,{active:false},pm)).status,403);
    assert.equal((await request(`/users/${pm2.id}/active`,{active:false},admin)).status,200);
    assert.equal((await request('/auth/login',{email:'pm2@example.test',password:'temporary-password-123'})).status,401);
    assert.equal((await request(`/projects/${project}/candidates`,undefined,pm)).body.candidates.some((u:any)=>u.email==='pm2@example.test'),false);
    const bookingLogin=await request('/auth/login',{email:'booking1@example.test',password:'temporary-password-123'});
    await request('/auth/password',{currentPassword:'temporary-password-123',newPassword:'booking-new-password-123'},bookingLogin.cookie);
    const bookingCookie=(await request('/auth/login',{email:'booking1@example.test',password:'booking-new-password-123'})).cookie!;
    assert.equal((await request(`/projects/${project}/candidates`,undefined,bookingCookie)).status,403);

    const rows=workspace.db.prepare('SELECT password_hash FROM users').all() as any[];
    assert.ok(rows.every(r=>!r.password_hash.includes('password')));
    assert.equal((await request('/auth/logout',{},pm)).status,200);
    assert.equal((await request('/projects',undefined,pm)).status,401);
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));workspace.db.close();}
});

test('dữ liệu cũ có sẵn project_member_roles role=admin được migrate thành pm và quản lý được dự án', async () => {
  const w = createWorkspace('', { memory: true, setupCode: 'test-legacy-code' });
  const app = express(); app.use(express.json()); app.use('/api/workspace', w.router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/workspace`;
  const request = async (path: string, body?: any, cookie?: string) => {
    const res = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    return { status: res.status, body: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] };
  };
  try {
    await request('/auth/setup', { code: 'test-legacy-code', name: 'Admin', email: 'admin@legacy.test', password: 'password-123456' });
    const admin = (await request('/auth/login', { email: 'admin@legacy.test', password: 'password-123456' })).cookie;
    const project = (await request('/projects', { name: 'Legacy Project' }, admin)).body.id;
    await request('/users', { name: 'Legacy User', email: 'legacy@example.test', password: 'password-123456', role: 'member' }, admin);
    const legacyUser = w.db.prepare("SELECT id FROM users WHERE email='legacy@example.test'").get() as any;
    
    // Giả lập dữ liệu cũ: dựng lại bảng vai trò theo schema cũ (CHECK còn 'admin'),
    // chèn một thành viên chỉ có Admin dự án và một thành viên có cả Admin dự án lẫn PM.
    w.db.exec('PRAGMA foreign_keys = OFF;');
    w.db.exec('DROP TABLE project_member_roles;');
    w.db.exec("CREATE TABLE project_member_roles (project_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','pm','booking')), PRIMARY KEY(project_id, user_id, role), FOREIGN KEY(project_id, user_id) REFERENCES project_members(project_id, user_id) ON DELETE CASCADE);");
    w.db.exec('PRAGMA foreign_keys = ON;');
    w.db.prepare("INSERT INTO project_members VALUES (?,?,'company',1)").run(project, legacyUser.id);
    w.db.prepare("INSERT INTO project_member_roles VALUES (?,?,'admin')").run(project, legacyUser.id);
    await request('/users', { name: 'Dual User', email: 'dual@example.test', password: 'password-123456', role: 'member' }, admin);
    const dualUser = w.db.prepare("SELECT id FROM users WHERE email='dual@example.test'").get() as any;
    w.db.prepare("INSERT INTO project_members VALUES (?,?,'company',1)").run(project, dualUser.id);
    w.db.prepare("INSERT INTO project_member_roles VALUES (?,?,'admin')").run(project, dualUser.id);
    w.db.prepare("INSERT INTO project_member_roles VALUES (?,?,'pm')").run(project, dualUser.id);

    // Migration thật: chạy hai lần để chứng minh an toàn khi chạy lại, không trùng khoá.
    migrateProjectRoles(w.db);
    migrateProjectRoles(w.db);
    const dualRoles = (w.db.prepare("SELECT role FROM project_member_roles WHERE user_id=?").all(dualUser.id) as any[]).map(r => r.role);
    assert.deepEqual(dualRoles, ['pm']);
    // Ràng buộc database mới không cho tạo lại Admin dự án.
    assert.throws(() => w.db.prepare("INSERT INTO project_member_roles VALUES (?,?,'admin')").run(project, legacyUser.id));

    const legacyLogin = (await request('/auth/login', { email: 'legacy@example.test', password: 'password-123456' })).cookie;
    await request('/auth/password', { currentPassword: 'password-123456', newPassword: 'changed-password-123' }, legacyLogin);
    const legacyAuth = (await request('/auth/login', { email: 'legacy@example.test', password: 'changed-password-123' })).cookie;

    // GET /projects/:id/members hiện vai trò 'pm'
    const membersRes = await request(`/projects/${project}/members`, undefined, legacyAuth);
    assert.equal(membersRes.status, 200);
    const memberRow = membersRes.body.members.find((m: any) => m.id === legacyUser.id);
    assert.deepEqual(memberRow.roles, ['pm']);

    // Tài khoản đó vẫn quản lý được dự án
    const projList = await request('/projects', undefined, legacyAuth);
    assert.equal(projList.status, 200);
    assert.equal(projList.body.projects[0].canManage, true);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    w.db.close();
  }
});

