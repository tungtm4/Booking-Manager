import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createWorkspace} from '../server/workspace';

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

    assert.equal((await request(`/projects/${project}/members`,{email:'booking1@example.test',role:'admin'},pm)).status,403);
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
