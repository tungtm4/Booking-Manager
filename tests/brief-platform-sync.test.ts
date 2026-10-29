import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createWorkspace} from '../server/workspace';
import {normalizeBriefPlatforms,hasBriefPlatformConflict,readProjectBrief,assessProjectKol} from '../src/domain/projectBrief';
import {assessCommunity} from '../src/domain/community';

// ===== Đơn vị: hàm chuẩn hoá chung =====
test('normalizeBriefPlatforms: platforms là nguồn chính, platform suy ra tương thích',()=>{
  assert.deepEqual(normalizeBriefPlatforms({platforms:['Facebook','Threads'],platform:'TatCa'}),{platforms:['Facebook','Threads'],platform:'Facebook, Threads'});
  assert.deepEqual(normalizeBriefPlatforms({platforms:['TikTok'],platform:'Facebook'}),{platforms:['TikTok'],platform:'TikTok'});
  // Mảng rỗng có chủ đích (bỏ chọn hết) phải được giữ là rỗng — khác với thiếu platforms.
  assert.deepEqual(normalizeBriefPlatforms({platforms:[],platform:''}),{platforms:[],platform:''});
  assert.deepEqual(normalizeBriefPlatforms({platforms:['tiktok','TIKTOK','Nền lạ']}),{platforms:['TikTok'],platform:'TikTok'});
});

test('normalizeBriefPlatforms: dữ liệu cũ chỉ có platform vẫn đọc đúng',()=>{
  assert.deepEqual(normalizeBriefPlatforms({platform:'TikTok'}),{platforms:['TikTok'],platform:'TikTok'});
  assert.deepEqual(normalizeBriefPlatforms({platform:'Facebook và Threads'}),{platforms:['Facebook','Threads'],platform:'Facebook, Threads'});
  assert.deepEqual(normalizeBriefPlatforms({platform:'TatCa'}),{platforms:[],platform:''});
  assert.deepEqual(normalizeBriefPlatforms({}),{platforms:[],platform:''});
  assert.deepEqual(normalizeBriefPlatforms(null),{platforms:[],platform:''});
  const b=readProjectBrief({text:'x',platform:'YouTube'});
  assert.deepEqual(b.platforms,['YouTube']);assert.equal(b.platform,'YouTube');
});

test('hasBriefPlatformConflict: chỉ bắt khi hai trường thật sự mô tả khác tập nền tảng',()=>{
  // Ca lỗi đã tái hiện: dropdown cũ gửi platform='TikTok' trong khi platforms còn FB+Threads.
  assert.equal(hasBriefPlatformConflict({platform:'TikTok',platforms:['Facebook','Threads']}),true);
  assert.equal(hasBriefPlatformConflict({platform:'Facebook',platforms:['Facebook','Threads']}),true);
  // Chuỗi nối của chính mảng, 'TatCa' tương thích, rỗng, hoặc thiếu mảng → không mâu thuẫn.
  assert.equal(hasBriefPlatformConflict({platform:'Facebook, Threads',platforms:['Facebook','Threads']}),false);
  assert.equal(hasBriefPlatformConflict({platform:'TatCa',platforms:['Facebook','Threads']}),false);
  assert.equal(hasBriefPlatformConflict({platform:'TikTok',platforms:['TikTok']}),false);
  assert.equal(hasBriefPlatformConflict({platform:'',platforms:[]}),false);
  assert.equal(hasBriefPlatformConflict({platform:'TikTok'}),false);
  assert.equal(hasBriefPlatformConflict(undefined),false);
});

// ===== Đơn vị: đánh giá khớp dùng platforms làm nguồn chính (HOẶC + follower đúng kênh) =====
const kol=(nenTang:any[])=>({ten:'KOL mẫu',linhVuc:['Ẩm thực'],reviewSoBo:'',nenTang});
const briefOf=(platforms:string[],minFollowers=0)=>readProjectBrief({text:'',category:'',keyword:'',platforms,minFollowers});
test('assessProjectKol: chọn nhiều nền tảng là HOẶC, follower chỉ tính trên kênh được chọn',()=>{
  const a=kol([{tenNenTang:'TikTok',linkProfile:'',soFollower:5000}]);
  const b=kol([{tenNenTang:'Facebook',linkProfile:'',soFollower:100}]);
  const c=kol([{tenNenTang:'Facebook',linkProfile:'',soFollower:2000},{tenNenTang:'TikTok',linkProfile:'',soFollower:10}]);
  const fbThreads=briefOf(['Facebook','Threads'],1000);
  assert.equal(assessProjectKol(a,fbThreads).matches,false); // không có kênh FB/Threads
  assert.equal(assessProjectKol(b,fbThreads).matches,false); // có FB nhưng follower trên FB chỉ 100
  assert.equal(assessProjectKol(c,fbThreads).matches,true);  // FB 2.000 đạt; TikTok 10 không được tính
  const tiktok=briefOf(['TikTok'],1000);
  assert.equal(assessProjectKol(a,tiktok).matches,true);
  assert.equal(assessProjectKol(c,tiktok).matches,false);    // chuyển sang TikTok: chỉ còn 10 follower
  assert.equal(assessProjectKol(b,briefOf([],0)).matches,true); // rỗng = tất cả
});

test('assessCommunity: cùng quy tắc platforms nguồn chính',()=>{
  const page={ten:'Page FB',loai:'page',nenTang:'Facebook',quyMo:3000,linhVuc:['Ẩm thực'],ghiChuTep:'',dichVu:[]};
  assert.equal(assessCommunity(page as any,briefOf(['Facebook','Threads'],1000)).matches,true);
  assert.equal(assessCommunity(page as any,briefOf(['TikTok'],1000)).matches,false);
});

// ===== API: đồng bộ brief dự án + brief phase qua HTTP thật (DB in-memory riêng) =====
async function fixture(work:(f:any)=>Promise<void>){
  const w=createWorkspace('',{memory:true,setupCode:'test-code'});
  const app=express();app.use(express.json());app.use('/api/workspace',w.router);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${(server.address() as any).port}/api/workspace`;
  const call=async(path:string,body?:any,cookie?:string,method?:string)=>{
    const m=method??(body===undefined?'GET':'POST');
    const r=await fetch(base+path,{method:m,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
  };
  try{
    await call('/auth/setup',{code:'test-code',email:'admin@example.test',name:'Admin',password:'admin-password-123'});
    const admin=(await call('/auth/login',{email:'admin@example.test',password:'admin-password-123'})).cookie;
    const pid=(await call('/projects',{name:'Dự án đồng bộ nền tảng',client:'Khách',campaign:'Campaign'},admin)).body.id;
    const cookies:any={admin};
    for(const role of ['pm','booking']){
      await call('/users',{email:`${role}@example.test`,name:role,password:'temporary-password-123',role:'member'},admin);
      const temporary=(await call('/auth/login',{email:`${role}@example.test`,password:'temporary-password-123'})).cookie;
      await call('/auth/password',{currentPassword:'temporary-password-123',newPassword:'changed-password-123'},temporary);
      cookies[role]=(await call('/auth/login',{email:`${role}@example.test`,password:'changed-password-123'})).cookie;
      await call(`/projects/${pid}/members`,{email:`${role}@example.test`,role},admin);
    }
    await work({call,pid,cookies});
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));w.db.close();}
}
const baseBrief={text:'Brief kiểm thử đồng bộ nền tảng',category:'',keyword:'',minFollowers:0,targetCount:null,budget:null,deliverableScope:'campaign',deliverables:[],partnerType:null,kolTargetCount:null,communityTargetCount:null,kpiTopics:null,kpiComments:null,kpiBuzz:null,pillars:[],services:[]};

test('API brief dự án: FB/Threads → TikTok → FB/Threads → bỏ hết → mâu thuẫn 400 → dữ liệu cũ',()=>fixture(async(f:any)=>{
  const {call,pid,cookies}=f;const pm=cookies.pm;
  const getBrief=async()=>{const d=await call(`/projects/${pid}/shortlist`,undefined,pm);return {brief:d.body.brief,revision:d.body.briefRevision};};
  // 1) Lưu kiểu Đề xuất: platforms nguồn chính + platform tương thích 'TatCa' khi nhiều nền tảng.
  assert.equal((await call(`/projects/${pid}/brief`,{brief:{...baseBrief,platform:'TatCa',platforms:['Facebook','Threads']},revision:0},pm)).status,200);
  let s=await getBrief();assert.deepEqual(s.brief.platforms,['Facebook','Threads']);assert.equal(s.brief.platform,'Facebook, Threads');assert.equal(s.revision,1);
  // 2) FB/Threads → TikTok.
  assert.equal((await call(`/projects/${pid}/brief`,{brief:{...baseBrief,platform:'TikTok',platforms:['TikTok']},revision:1},pm)).status,200);
  s=await getBrief();assert.deepEqual(s.brief.platforms,['TikTok']);assert.equal(s.brief.platform,'TikTok');
  // 3) TikTok → FB/Threads.
  assert.equal((await call(`/projects/${pid}/brief`,{brief:{...baseBrief,platform:'Facebook, Threads',platforms:['Facebook','Threads']},revision:2},pm)).status,200);
  s=await getBrief();assert.deepEqual(s.brief.platforms,['Facebook','Threads']);
  // 4) Bỏ chọn hết: [] có chủ đích phải lưu thành rỗng (tất cả), không quay về giá trị cũ.
  assert.equal((await call(`/projects/${pid}/brief`,{brief:{...baseBrief,platform:'',platforms:[]},revision:3},pm)).status,200);
  s=await getBrief();assert.deepEqual(s.brief.platforms,[]);assert.equal(s.brief.platform,'');assert.equal(s.revision,4);
  // 5) Request mâu thuẫn kiểu lỗi cũ (dropdown chỉ đổi platform) → 400 và dữ liệu KHÔNG đổi.
  const bad=await call(`/projects/${pid}/brief`,{brief:{...baseBrief,platform:'TikTok',platforms:['Facebook','Threads']},revision:4},pm);
  assert.equal(bad.status,400);assert.ok(String(bad.body.message).includes('mâu thuẫn'));
  s=await getBrief();assert.deepEqual(s.brief.platforms,[]);assert.equal(s.revision,4);
  // 6) Dữ liệu cũ chỉ có platform (không có khoá platforms) → suy ra platforms khi đọc.
  assert.equal((await call(`/projects/${pid}/brief`,{brief:{...baseBrief,platform:'TikTok'},revision:4},pm)).status,200);
  s=await getBrief();assert.deepEqual(s.brief.platforms,['TikTok']);assert.equal(s.brief.platform,'TikTok');
  // 7) Revision vẫn được giữ: revision sai → 409.
  assert.equal((await call(`/projects/${pid}/brief`,{brief:{...baseBrief,platform:'TikTok',platforms:['TikTok']},revision:99},pm)).status,409);
}));

test('API brief phase: tạo với dữ liệu cũ, PATCH đổi nền tảng, mâu thuẫn bị chặn, revision giữ nguyên tắc',()=>fixture(async(f:any)=>{
  const {call,pid,cookies}=f;const pm=cookies.pm;
  // Tạo phase với brief kiểu cũ: chỉ platform, không platforms.
  const created=await call(`/projects/${pid}/phases`,{name:'Phase seeding',kind:'seeding',brief:{...baseBrief,platform:'Threads'}},pm);
  assert.equal(created.status,200);
  const list=async()=>(await call(`/projects/${pid}/phases`,undefined,pm)).body.phases;
  let phases=await list();const ph=phases.find((x:any)=>x.id===created.body.id);
  assert.ok(ph);assert.deepEqual(ph.brief.platforms,['Threads']);assert.equal(ph.brief.platform,'Threads');
  // PATCH: Threads → FB+Threads (kiểu Đề xuất).
  const patch=await call(`/projects/${pid}/phases/${ph.id}`,{revision:ph.revision,brief:{...baseBrief,platform:'TatCa',platforms:['Facebook','Threads']}},pm,'PATCH');
  assert.equal(patch.status,200);
  phases=await list();const ph2=phases.find((x:any)=>x.id===ph.id);
  assert.deepEqual(ph2.brief.platforms,['Facebook','Threads']);assert.equal(ph2.brief.platform,'Facebook, Threads');
  // PATCH mâu thuẫn → 400, dữ liệu giữ nguyên.
  const bad=await call(`/projects/${pid}/phases/${ph.id}`,{revision:ph2.revision,brief:{...baseBrief,platform:'TikTok',platforms:['Facebook','Threads']}},pm,'PATCH');
  assert.equal(bad.status,400);assert.ok(String(bad.body.message).includes('mâu thuẫn'));
  phases=await list();assert.deepEqual(phases.find((x:any)=>x.id===ph.id).brief.platforms,['Facebook','Threads']);
  // PATCH bỏ chọn hết → [].
  const cleared=await call(`/projects/${pid}/phases/${ph.id}`,{revision:ph2.revision,brief:{...baseBrief,platform:'',platforms:[]}},pm,'PATCH');
  assert.equal(cleared.status,200);
  phases=await list();assert.deepEqual(phases.find((x:any)=>x.id===ph.id).brief.platforms,[]);
  // Tạo phase với brief mâu thuẫn ngay từ đầu → 400.
  const badCreate=await call(`/projects/${pid}/phases`,{name:'Phase lỗi',kind:'other',brief:{...baseBrief,platform:'TikTok',platforms:['Facebook']}},pm);
  assert.equal(badCreate.status,400);
}));

test('API matches theo brief đã đồng bộ: HOẶC nhiều nền tảng + follower đúng kênh',()=>fixture(async(f:any)=>{
  const {call,pid,cookies}=f;
  const profiles=[
    {id:'kol-a',ten:'KOL A TikTok mạnh',linhVuc:['Ẩm thực'],nenTang:[{tenNenTang:'TikTok',linkProfile:'',soFollower:5000}],reviewSoBo:'',bangGia:{video:1000000}},
    {id:'kol-b',ten:'KOL B Facebook nhỏ',linhVuc:['Ẩm thực'],nenTang:[{tenNenTang:'Facebook',linkProfile:'',soFollower:100}],reviewSoBo:'',bangGia:{video:1000000}},
    {id:'kol-c',ten:'KOL C hai kênh',linhVuc:['Ẩm thực'],nenTang:[{tenNenTang:'Facebook',linkProfile:'',soFollower:2000},{tenNenTang:'TikTok',linkProfile:'',soFollower:10}],reviewSoBo:'',bangGia:{video:1000000}},
  ];
  assert.equal((await call(`/projects/${pid}/catalog/import`,{profiles},cookies.admin)).status,200);
  const setBrief=async(platforms:string[],revision:number)=>{
    const r=await call(`/projects/${pid}/brief`,{brief:{...baseBrief,platform:platforms.length===1?platforms[0]:(platforms.length===0?'':'TatCa'),platforms,minFollowers:1000},revision},cookies.pm);
    assert.equal(r.status,200);
    return (await call(`/projects/${pid}/shortlist`,undefined,cookies.pm)).body.matches.map((m:any)=>m.ten).sort();
  };
  assert.deepEqual(await setBrief(['Facebook','Threads'],0),['KOL C hai kênh']);
  assert.deepEqual(await setBrief(['TikTok'],1),['KOL A TikTok mạnh']);
  assert.deepEqual(await setBrief([],2),['KOL A TikTok mạnh','KOL C hai kênh']);
}));
