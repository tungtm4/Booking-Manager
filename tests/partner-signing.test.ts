import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createHash} from 'node:crypto';
import {inflateSync,deflateSync} from 'node:zlib';
import {createWorkspace} from '../server/workspace';

// PNG có byte filter của hàng điểm ảnh bị hỏng (9 = không tồn tại) nhưng CRC/chunk đều đúng:
// parser cấu trúc đơn thuần sẽ cho qua, decoder thật (libpng) phải báo lỗi.
function pngWithBrokenFilter(src:Buffer):Buffer{
  const table=new Int32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c;}
  const crc=(b:Buffer)=>{let c=0xffffffff;for(let i=0;i<b.length;i++)c=table[(c^b[i])&0xff]^(c>>>8);return(c^0xffffffff)>>>0;};
  const chunk=(type:string,data:Buffer)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const body=Buffer.concat([Buffer.from(type,'ascii'),data]);const tail=Buffer.alloc(4);tail.writeUInt32BE(crc(body));return Buffer.concat([len,body,tail]);};
  let pos=8,ihdr:Buffer|null=null;const idats:Buffer[]=[];
  while(pos<src.length){const len=src.readUInt32BE(pos);const type=src.toString('ascii',pos+4,pos+8);const data=src.subarray(pos+8,pos+8+len);if(type==='IHDR')ihdr=Buffer.from(data);if(type==='IDAT')idats.push(Buffer.from(data));pos+=12+len;}
  const raw=inflateSync(Buffer.concat(idats));raw[0]=9;
  return Buffer.concat([src.subarray(0,8),chunk('IHDR',ihdr!),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
// JPEG có bảng Huffman bị phá (số lượng mã vượt giới hạn): dữ liệu quét không thể giải mã.
function jpegWithBrokenHuffman(src:Buffer):Buffer{
  const b=Buffer.from(src);
  for(let i=0;i+1<b.length;i++)if(b[i]===0xff&&b[i+1]===0xc4){b[i+4]=0xff;b[i+5]=0xff;break;}
  return b;
}

// ===== Đợt A1 — Hồ sơ ký kết & ngân hàng tham chiếu dùng chung KOL + Community =====
const PNG_1X1='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const pngBuf=Buffer.from(PNG_1X1,'base64');
// Ảnh THẬT do encoder của Chrome xuất qua canvas 3x2 (không phải file gắn magic bytes thủ công).
const JPEG_REAL='/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAACAAMDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABwj/xAAbEQABBAMAAAAAAAAAAAAAAAAAAQMzcQIEsf/aAAwDAQACEQMRAD8AlQA1ekytSr9WBuk4f//Z';
const WEBP_REAL='UklGRiwCAABXRUJQVlA4WAoAAAAgAAAAAgAAAQAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDggPgAAAFACAJ0BKgMAAgAAwBIlqAJ0ugH4AMwAyQAGoAD+9IiH/n/C/HycfboRfpN//nMbLp9L6fV+cxsun0v9OcAA';

async function fixture(work:(f:any)=>Promise<void>){
  const w=createWorkspace('',{memory:true,setupCode:'test-code'});
  const app=express();app.use(express.json({limit:'20mb'}));app.use('/api/workspace',w.router);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${(server.address() as any).port}/api/workspace`;
  const call=async(path:string,body?:any,cookie?:string)=>{
    const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:r.status,body:await r.json().catch(()=>({})),cookie:r.headers.get('set-cookie')?.split(';')[0]};
  };
  const raw=async(path:string,cookie?:string)=>fetch(base+path,{headers:{...(cookie?{Cookie:cookie}:{})}});
  try{
    await call('/auth/setup',{code:'test-code',email:'admin@example.test',name:'Admin',password:'admin-password-123'});
    const admin=(await call('/auth/login',{email:'admin@example.test',password:'admin-password-123'})).cookie;
    const pid=(await call('/projects',{name:'Dự án A1',client:'Khách',campaign:'Campaign'},admin)).body.id;
    const cookies:any={admin};
    for(const role of ['pm','booking','member']){
      await call('/users',{email:`${role}@example.test`,name:role,password:'temporary-password-123',role:'member'},admin);
      const temporary=(await call('/auth/login',{email:`${role}@example.test`,password:'temporary-password-123'})).cookie;
      await call('/auth/password',{currentPassword:'temporary-password-123',newPassword:'changed-password-123'},temporary);
      cookies[role]=(await call('/auth/login',{email:`${role}@example.test`,password:'changed-password-123'})).cookie;
      if(role!=='member')await call(`/projects/${pid}/members`,{email:`${role}@example.test`,role},admin);
    }
    // Cùng một ID 'partner-1' cho cả KOL và Community — khoá theo loại đối tác, không va chạm.
    const kol={id:'partner-1',ten:'KOL Mẫu',linhVuc:['Ẩm thực'],nenTang:[{tenNenTang:'TikTok',linkProfile:'',soFollower:1000}],reviewSoBo:'',bangGia:{video:1000000}};
    assert.equal((await call(`/projects/${pid}/catalog/import`,{profiles:[kol]},admin)).status,200);
    const comm={profile:{id:'partner-1',ten:'Page Mẫu',loai:'page',nenTang:'Facebook',link:'https://facebook.com/page-mau',linhVuc:[],quyMo:1000,loaiChiSo:'followers',dichVu:[]}};
    assert.equal((await call('/communities',comm,admin)).status,200);
    await work({call,raw,pid,cookies});
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));w.db.close();}
}

test('A1 hồ sơ ký kết: lưu/tải lại cả 2 loại, khoá theo loại, phân quyền hẹp, revision 409',()=>fixture(async(f:any)=>{
  const {call,cookies}=f;const S='/partners/kol/partner-1/signing',C='/partners/community/partner-1/signing';
  // Anonymous bị từ chối ở mọi thao tác.
  assert.equal((await call(S)).status,401);
  assert.equal((await call(S,{revision:0})).status,401);
  // Ban đầu: hồ sơ trống hợp lệ cho cả 2 loại; canEdit theo vai trò.
  const g0=await call(S,undefined,cookies.booking);
  assert.equal(g0.status,200);assert.equal(g0.body.profile.revision,0);assert.equal(g0.body.profile.legalName,'');assert.deepEqual(g0.body.documents,[]);assert.equal(g0.body.canEdit,true);
  const gm=await call(S,undefined,cookies.member);
  assert.equal(gm.status,200);assert.equal(gm.body.canEdit,false); // thành viên không vai trò dự án: xem được, không sửa
  // Booking cập nhật khối ký kết của KOL (endpoint hẹp).
  const fields={legalName:'Nguyễn Văn Mẫu',signingForm:'hkd',representative:'',taxCode:'0123456789',idNumber:'001234567890',address:'Hà Nội',certEmail:'mau@example.test',bankName:'Vietcombank',bankAccountName:'NGUYEN VAN MAU',bankAccountNumber:'0123456789',bankBranch:'Hoàn Kiếm',customTaxRate:6.5,customTaxMode:'tren_net',note:'Suất riêng theo thỏa thuận'};
  const s1=await call(S,{revision:0,...fields},cookies.booking);
  assert.equal(s1.status,200);assert.equal(s1.body.revision,1);
  const g1=await call(S,undefined,cookies.pm);
  assert.equal(g1.body.profile.legalName,'Nguyễn Văn Mẫu');assert.equal(g1.body.profile.customTaxRate,6.5);assert.equal(g1.body.profile.customTaxMode,'tren_net');assert.equal(g1.body.profile.revision,1);
  // Community cùng ID hoàn toàn không bị ảnh hưởng.
  const gc=await call(C,undefined,cookies.admin);
  assert.equal(gc.body.profile.revision,0);assert.equal(gc.body.profile.legalName,'');
  // PM cập nhật Community (loại đối tác độc lập hình thức ký công ty).
  assert.equal((await call(C,{revision:0,legalName:'Công ty TNHH Mẫu',signingForm:'cong_ty',representative:'Trần Thị Đại Diện'},cookies.pm)).status,200);
  // Thành viên thường bị chặn sửa; revision cũ bị 409; admin sửa tiếp được.
  assert.equal((await call(S,{revision:1,...fields},cookies.member)).status,403);
  assert.equal((await call(S,{revision:0,...fields},cookies.booking)).status,409);
  assert.equal((await call(S,{revision:1,...fields,note:'Admin chuẩn hoá'},cookies.admin)).body.revision,2);
  // Giá trị trống hoàn toàn vẫn hợp lệ.
  assert.equal((await call(C,{revision:1},cookies.pm)).status,200);
  // Kiểm tra dữ liệu không hợp lệ bị chặn.
  assert.equal((await call(S,{revision:2,signingForm:'khong-hople'},cookies.admin)).status,400);
  assert.equal((await call(S,{revision:2,customTaxRate:7},cookies.admin)).status,400); // suất riêng thiếu cách tính
  assert.equal((await call(S,{revision:2,certEmail:'khong-phai-email'},cookies.admin)).status,400);
  // Endpoint hẹp KHÔNG mở quyền sửa toàn bộ kho: Booking vẫn bị chặn ở catalog Admin-only.
  assert.equal((await call('/catalog/partner-1/update',{revision:1,profile:{id:'partner-1',ten:'KOL Mẫu',linhVuc:[],nenTang:[],bangGia:{}}},cookies.booking)).status,403);
  assert.equal((await call('/communities/partner-1/update',{revision:1,profile:{id:'partner-1',ten:'Page Mẫu'}},cookies.booking)).status,403);
  // Đối tác không tồn tại / loại sai.
  assert.equal((await call('/partners/kol/khong-co/signing',undefined,cookies.admin)).status,404);
  assert.equal((await call('/partners/vendor/partner-1/signing',undefined,cookies.admin)).status,400);
}));

test('A1 giấy tờ: upload/kiểm chứng nội dung, xem qua auth, chặn file sai/quá cỡ/tên độc hại, xoá đúng revision',()=>fixture(async(f:any)=>{
  const {call,raw,cookies}=f;const D='/partners/kol/partner-1/documents',S='/partners/kol/partner-1/signing';
  assert.equal((await call(D,{name:'x.png',mime:'image/png',dataBase64:PNG_1X1})).status,401); // anonymous upload
  const up=await call(D,{name:'cccd-mat-truoc.png',mime:'image/png',dataBase64:PNG_1X1},cookies.booking);
  assert.equal(up.status,200);
  const doc=up.body.document;
  assert.equal(doc.mime,'image/png');assert.equal(doc.size,pngBuf.length);
  assert.equal(doc.sha256,createHash('sha256').update(pngBuf).digest('hex'));
  assert.equal(doc.name,'cccd-mat-truoc.png');
  // Xem nội dung: phải đăng nhập; bytes trả về khớp file gốc.
  assert.equal((await raw(`${D}/${doc.id}/content`)).status,401);
  const content=await raw(`${D}/${doc.id}/content`,cookies.member); // thành viên thường vẫn xem được (nội bộ)
  assert.equal(content.status,200);assert.equal(content.headers.get('content-type'),'image/png');
  assert.ok(Buffer.from(await content.arrayBuffer()).equals(pngBuf));
  // Tên file độc hại bị làm sạch — không còn ký tự đường dẫn.
  const evil=await call(D,{name:'../../evil.png',mime:'image/png',dataBase64:PNG_1X1},cookies.pm);
  assert.equal(evil.status,200);assert.equal(evil.body.document.name,'evil.png');assert.ok(!/[/\\]/.test(evil.body.document.name));
  // File sai nội dung / khai báo lệch định dạng / quá dung lượng đều bị chặn.
  const text64=Buffer.from('day khong phai anh').toString('base64');
  assert.equal((await call(D,{name:'a.png',mime:'image/png',dataBase64:text64},cookies.booking)).status,400);
  assert.equal((await call(D,{name:'a.jpg',mime:'image/jpeg',dataBase64:PNG_1X1},cookies.booking)).status,400);
  const big=Buffer.concat([pngBuf,Buffer.alloc(5*1024*1024,7)]).toString('base64');
  assert.equal((await call(D,{name:'big.png',mime:'image/png',dataBase64:big},cookies.booking)).status,400);
  // WebP và JPEG THẬT (encoder Chrome) được chấp nhận.
  const wup=await call(D,{name:'giay-phep.webp',mime:'image/webp',dataBase64:WEBP_REAL},cookies.admin);
  assert.equal(wup.status,200);assert.equal(wup.body.document.mime,'image/webp');
  const jup=await call(D,{name:'cccd.jpg',mime:'image/jpeg',dataBase64:JPEG_REAL},cookies.booking);
  assert.equal(jup.status,200);assert.equal(jup.body.document.mime,'image/jpeg');
  // File GIẢ / không giải mã được đều bị từ chối — kể cả ca từng lọt qua parser tự viết:
  // WebP 26 byte đúng khung RIFF/VP8L nhưng không có bitstream điểm ảnh (fixture của PM).
  const fakeWebp=Buffer.alloc(26);fakeWebp.write('RIFF',0);fakeWebp.writeUInt32LE(18,4);fakeWebp.write('WEBP',8);fakeWebp.write('VP8L',12);fakeWebp.writeUInt32LE(5,16);fakeWebp[20]=0x2f;
  assert.equal((await call(D,{name:'fake26.webp',mime:'image/webp',dataBase64:fakeWebp.toString('base64')},cookies.booking)).status,400);
  // JPEG container đúng nhưng bảng Huffman hỏng → dữ liệu quét không giải mã được.
  const jpegBuf=Buffer.from(JPEG_REAL,'base64');
  assert.equal((await call(D,{name:'huffman.jpg',mime:'image/jpeg',dataBase64:jpegWithBrokenHuffman(jpegBuf).toString('base64')},cookies.booking)).status,400);
  // PNG chunk/CRC đúng nhưng byte filter của dữ liệu quét hỏng → libpng báo lỗi khi giải mã.
  assert.equal((await call(D,{name:'filter.png',mime:'image/png',dataBase64:pngWithBrokenFilter(pngBuf).toString('base64')},cookies.booking)).status,400);
  assert.equal((await call(D,{name:'cut.png',mime:'image/png',dataBase64:pngBuf.subarray(0,40).toString('base64')},cookies.booking)).status,400);
  const magicText=Buffer.concat([pngBuf.subarray(0,8),Buffer.from('day chi la chu gia danh anh png chu khong giai ma duoc')]).toString('base64');
  assert.equal((await call(D,{name:'magic.png',mime:'image/png',dataBase64:magicText},cookies.booking)).status,400);
  const headJpeg=Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0x00]).toString('base64');
  assert.equal((await call(D,{name:'head.jpg',mime:'image/jpeg',dataBase64:headJpeg},cookies.booking)).status,400);
  // Danh sách giấy tờ đi kèm hồ sơ; thành viên thường không xoá được.
  const g=await call(S,undefined,cookies.admin);
  assert.equal(g.body.documents.length,4);
  assert.equal((await call(`${D}/${doc.id}/delete`,{revision:doc.revision},cookies.member)).status,403);
  assert.equal((await call(`${D}/${doc.id}/delete`,{revision:99},cookies.booking)).status,409);
  assert.equal((await call(`${D}/${doc.id}/delete`,{revision:doc.revision},cookies.booking)).status,200);
  assert.equal((await raw(`${D}/${doc.id}/content`,cookies.admin)).status,404);
  const g2=await call(S,undefined,cookies.admin);
  assert.equal(g2.body.documents.length,3);
  // Giấy tờ của KOL không lộ sang Community cùng ID.
  const gc=await call('/partners/community/partner-1/signing',undefined,cookies.admin);
  assert.equal(gc.body.documents.length,0);
}));
