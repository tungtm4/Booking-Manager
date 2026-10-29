import {PRICE_FORMAT_LABELS, type PriceFormatKey} from '../types/kol';
import {categoriesMatch} from './categories';
export type BriefDeliverable={format:PriceFormatKey;quantity:number};
/** Loại đối tác brief hướng tới; null = brief chưa nói rõ — để chưa xác định, yêu cầu người dùng duyệt. */
export type BriefPartnerType='kol'|'community'|'both';
/** Pillar nội dung kèm tỷ lệ % (tổng các pillar không vượt 100). */
export type BriefPillar={name:string;percent:number};
/** Đầu việc/dịch vụ nói chung (đặc biệt cho Community/comment): không ép vào 6 format Creator. */
export type BriefService={name:string;unit:string;quantity:number;scope:'phase'|'per_partner';targetPartner?:'community'|'kol'|'vendor'|'all'|null};
export interface ProjectBrief {
  text:string;category:string;keyword:string;platform:string;minFollowers:number;
  platforms?: string[];
  targetCount:number|null;
  kolTargetCount?:number|null;
  communityTargetCount?:number|null;
  budget:number|null;
  maxBudgetPerKol?:number|null;
  deliverableScope:'campaign'|'per_kol';deliverables:BriefDeliverable[];
  partnerType:BriefPartnerType|null;
  /** KPI mục tiêu (KHÔNG phải kết quả thực tế, KHÔNG tự thành dòng chi phí):
   *  topics = tổng số bài viết; comments = tổng số bình luận; buzz = like + share + comment
   *  (comments đã nằm trong buzz — không cộng thêm; số bài không cộng vào buzz). */
  kpiTopics:number|null;kpiComments:number|null;kpiBuzz:number|null;
  pillars:BriefPillar[];
  services:BriefService[];
}
export const emptyProjectBrief:ProjectBrief={text:'',category:'',keyword:'',platform:'',platforms:[],minFollowers:0,targetCount:null,kolTargetCount:null,communityTargetCount:null,budget:null,maxBudgetPerKol:null,deliverableScope:'campaign',deliverables:[],partnerType:null,kpiTopics:null,kpiComments:null,kpiBuzz:null,pillars:[],services:[]};
/** Danh sách nền tảng hợp lệ của brief — dùng chung cho client, server và mọi màn hình chỉnh brief. */
export const BRIEF_PLATFORMS=['TikTok','YouTube','Facebook','Instagram','Threads'] as const;
const cleanPlatformList=(items:unknown[]):string[]=>{
  const out:string[]=[];
  for(const item of items){
    const matched=(BRIEF_PLATFORMS as readonly string[]).find(p=>p.toLowerCase()===String(item).trim().toLowerCase());
    if(matched&&!out.includes(matched))out.push(matched);
  }
  return out;
};
const parsePlatformString=(value:unknown):string[]=>
  typeof value==='string'&&value.trim()&&value.trim()!=='TatCa'
    ?cleanPlatformList(value.split(/[,;&]|\s+v[aà]\s+/i).map(s=>s.trim()))
    :[];
/** Chuỗi platform tương thích suy ra từ danh sách nền tảng: 1 nền tảng → chính nó;
 *  rỗng → ''; nhiều → nối bằng ', ' (đúng dạng các bản lưu hiện tại đang dùng). */
export const deriveBriefPlatform=(platforms:string[]):string=>
  platforms.length===1?platforms[0]:(platforms.length===0?'':platforms.join(', '));
/** Chuẩn hoá cặp platform/platforms của brief — platforms LÀ NGUỒN CHÍNH:
 *  - platforms là mảng (kể cả mảng rỗng = chủ đích "tất cả nền tảng"): dùng mảng sau khi làm sạch.
 *  - platforms thiếu/không phải mảng: suy ra từ chuỗi platform cũ (dữ liệu cũ chỉ có một
 *    nền tảng, hoặc chuỗi kiểu "Facebook và Threads"; 'TatCa' = tất cả → rỗng).
 *  Chuỗi platform tương thích luôn được SUY RA LẠI từ platforms, không giữ giá trị gửi lên. */
export function normalizeBriefPlatforms(input:{platform?:unknown;platforms?:unknown}|null|undefined):{platforms:string[];platform:string}{
  const platforms=Array.isArray(input?.platforms)?cleanPlatformList(input.platforms):parsePlatformString(input?.platform);
  return {platforms,platform:deriveBriefPlatform(platforms)};
}
/** Request mâu thuẫn: gửi CẢ platform (chuỗi có nội dung, không phải 'TatCa') LẪN mảng
 *  platforms mà hai bên không mô tả cùng một tập nền tảng. Trường hợp này phải bị báo lỗi
 *  rõ ràng — tuyệt đối không âm thầm giữ một trong hai giá trị. Chuỗi platform dạng nối của
 *  chính mảng ('Facebook, Threads') hoặc 'TatCa' (tương thích từ màn Đề xuất) không phải mâu thuẫn. */
export function hasBriefPlatformConflict(input:{platform?:unknown;platforms?:unknown}|null|undefined):boolean{
  if(!input||!Array.isArray(input.platforms))return false;
  const platform=typeof input.platform==='string'?input.platform.trim():'';
  if(!platform||platform==='TatCa')return false;
  const fromString=parsePlatformString(platform);
  const fromArray=cleanPlatformList(input.platforms);
  return fromString.length!==fromArray.length||fromString.some(p=>!fromArray.includes(p));
}
// Chỉ đọc các trường đang sử dụng. Tiêu chí ER trong bản lưu cũ bị bỏ qua.
const briefCount=(v:any)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=1&&v<=100_000_000?v:null;
const targetCountRule=(v:any)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=10000?v:null;
const moneyRule=(v:any)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=1_000_000_000_000?v:null;
export function readProjectBrief(raw:any):ProjectBrief {
  const base={...Object.fromEntries(Object.keys(emptyProjectBrief).map(k=>[k,raw?.[k]??emptyProjectBrief[k as keyof ProjectBrief]]))} as unknown as ProjectBrief;
  const normalizedPlatforms = normalizeBriefPlatforms(raw);
  base.platforms = normalizedPlatforms.platforms;
  base.platform = normalizedPlatforms.platform;
  // Chuẩn hoá an toàn các trường mở rộng (Community/KPI): giá trị bẩn bị bỏ, không bịa thêm.
  base.partnerType=(['kol','community','both'] as const).includes(raw?.partnerType)?raw.partnerType:null;
  base.kolTargetCount=targetCountRule(raw?.kolTargetCount);
  base.communityTargetCount=targetCountRule(raw?.communityTargetCount);
  base.budget=moneyRule(raw?.budget);
  base.maxBudgetPerKol=moneyRule(raw?.maxBudgetPerKol);
  base.deliverableScope=['campaign','per_kol'].includes(raw?.deliverableScope)?raw.deliverableScope:'campaign';
  base.deliverables=Array.isArray(raw?.deliverables)
    ? raw.deliverables.map((d:any)=>({format:d?.format,quantity:d?.quantity}))
    : [];
  base.kpiTopics=briefCount(raw?.kpiTopics);
  base.kpiComments=briefCount(raw?.kpiComments);
  base.kpiBuzz=briefCount(raw?.kpiBuzz);
  base.pillars=Array.isArray(raw?.pillars)?raw.pillars.filter((p:any)=>p&&typeof p.name==='string'&&p.name.trim()&&typeof p.percent==='number'&&p.percent>0&&p.percent<=100).slice(0,10).map((p:any)=>({name:p.name.trim().slice(0,100),percent:p.percent})):[];
  base.services=Array.isArray(raw?.services)?raw.services.filter((s:any)=>s&&typeof s.name==='string'&&s.name.trim()&&typeof s.quantity==='number'&&Number.isSafeInteger(s.quantity)&&s.quantity>=1&&s.quantity<=1_000_000).slice(0,10).map((s:any)=>({
    name:s.name.trim().slice(0,200),
    unit:typeof s.unit==='string'&&s.unit.trim()?s.unit.trim().slice(0,50):'bài',
    quantity:s.quantity,
    scope:s.scope==='per_partner'?'per_partner':'phase',
    ...(s.targetPartner&&['community','kol','vendor','all'].includes(s.targetPartner)?{targetPartner:s.targetPartner}:{})
  })):[];
  return base;
}
const fold=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/đ/g,'d').trim();
export function assessProjectKol(p:any,brief:ProjectBrief){
  const checks:{label:string;met:boolean}[]=[];
  if(brief.category)checks.push({label:`Lĩnh vực ${brief.category}`,met:(p.linhVuc??[]).some((c:string)=>categoriesMatch(brief.category,c))});
  if(brief.keyword)checks.push({label:`Hồ sơ chứa từ khóa “${brief.keyword}”`,met:fold(p.ten+' '+(p.reviewSoBo??'')+' '+(p.linhVuc??[]).join(' ')).includes(fold(brief.keyword))});
  // Nền tảng yêu cầu lấy từ hàm chuẩn hoá chung: platforms là nguồn chính, platform chỉ là
  // chuỗi tương thích suy ra — không còn nhánh "platform thắng platforms" gây lệch kết quả.
  const reqPlatforms = normalizeBriefPlatforms(brief).platforms;
  if(reqPlatforms.length > 0){
    const matchedChannels = (p.nenTang??[]).filter((c:any)=>reqPlatforms.some(rp => fold(rp) === fold(c.tenNenTang)));
    checks.push({label:`Có kênh ${reqPlatforms.join(', ')}`,met:matchedChannels.length > 0});
  }
  if(brief.minFollowers>0){
    const channels = (p.nenTang??[]).filter((c:any)=>reqPlatforms.length === 0 || reqPlatforms.some(rp => fold(rp) === fold(c.tenNenTang)));
    const followers=Math.max(0,...channels.map((c:any)=>c.soFollower??0));
    checks.push({label:`${followers.toLocaleString('vi-VN')} follower${reqPlatforms.length > 0 ? ' trên '+reqPlatforms.join('/') : ''} / yêu cầu ${brief.minFollowers.toLocaleString('vi-VN')}`,met:followers>=brief.minFollowers});
  }
  return {matches:checks.every(c=>c.met),checks,hasCriteria:checks.length>0};
}
export function briefDeliverableLabel(d:BriefDeliverable,scope:ProjectBrief['deliverableScope']){
  return `${PRICE_FORMAT_LABELS[d.format]}: ${d.quantity.toLocaleString('vi-VN')}${scope==='campaign'?' toàn chiến dịch':' / KOL'}`;
}

export function extractPillarsFromText(text: string): BriefPillar[] {
  if (!text || typeof text !== 'string') return [];
  const lower = text.toLowerCase();
  const pillarIdx = lower.indexOf('pillar');
  if (pillarIdx === -1) return [];

  const sub = text.slice(pillarIdx);
  const regex = /([\p{L}][\p{L}\p{N}\s&'’\-/]*?)\s*\(\s*(\d{1,3})\s*%\s*\)/gu;
  const pillars: BriefPillar[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(sub)) !== null) {
    let name = match[1].trim();
    name = name.replace(/^(?:v[aà]|and|&)\s+/iu, '').trim();
    const percent = parseInt(match[2], 10);
    if (!name || percent < 1 || percent > 100) continue;
    name = name.slice(0, 100).trim();
    if (!name) continue;
    pillars.push({ name, percent });
    if (pillars.length >= 10) break;
  }

  if (pillars.length === 0) return [];
  const total = pillars.reduce((sum, p) => sum + p.percent, 0);
  if (total > 100) return [];
  return pillars;
}
