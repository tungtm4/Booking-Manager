import {PRICE_FORMAT_LABELS, type PriceFormatKey} from '../types/kol';
export type BriefDeliverable={format:PriceFormatKey;quantity:number};
/** Loại đối tác brief hướng tới; null = brief chưa nói rõ — để chưa xác định, yêu cầu người dùng duyệt. */
export type BriefPartnerType='kol'|'community'|'both';
/** Pillar nội dung kèm tỷ lệ % (tổng các pillar không vượt 100). */
export type BriefPillar={name:string;percent:number};
/** Đầu việc/dịch vụ nói chung (đặc biệt cho Community/comment): không ép vào 6 format Creator. */
export type BriefService={name:string;unit:string;quantity:number;scope:'phase'|'per_partner';targetPartner?:'community'|'kol'|'vendor'|'all'|null};
export interface ProjectBrief {
  text:string;category:string;keyword:string;platform:string;minFollowers:number;
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
export const emptyProjectBrief:ProjectBrief={text:'',category:'',keyword:'',platform:'',minFollowers:0,targetCount:null,kolTargetCount:null,communityTargetCount:null,budget:null,maxBudgetPerKol:null,deliverableScope:'campaign',deliverables:[],partnerType:null,kpiTopics:null,kpiComments:null,kpiBuzz:null,pillars:[],services:[]};
// Chỉ đọc các trường đang sử dụng. Tiêu chí ER trong bản lưu cũ bị bỏ qua.
const briefCount=(v:any)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=1&&v<=100_000_000?v:null;
const targetCountRule=(v:any)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=10000?v:null;
const moneyRule=(v:any)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=1_000_000_000_000?v:null;
export function readProjectBrief(raw:any):ProjectBrief {
  const base={...Object.fromEntries(Object.keys(emptyProjectBrief).map(k=>[k,raw?.[k]??emptyProjectBrief[k as keyof ProjectBrief]]))} as unknown as ProjectBrief;
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
  if(brief.category)checks.push({label:`Lĩnh vực ${brief.category}`,met:(p.linhVuc??[]).some((c:string)=>fold(c).includes(fold(brief.category)))});
  if(brief.keyword)checks.push({label:`Hồ sơ chứa từ khóa “${brief.keyword}”`,met:fold(p.ten+' '+(p.reviewSoBo??'')+' '+(p.linhVuc??[]).join(' ')).includes(fold(brief.keyword))});
  if(brief.platform)checks.push({label:`Có kênh ${brief.platform}`,met:(p.nenTang??[]).some((c:any)=>c.tenNenTang===brief.platform)});
  if(brief.minFollowers>0){const followers=Math.max(0,...(p.nenTang??[]).filter((c:any)=>!brief.platform||c.tenNenTang===brief.platform).map((c:any)=>c.soFollower??0));checks.push({label:`${followers.toLocaleString('vi-VN')} follower${brief.platform?' trên '+brief.platform:''} / yêu cầu ${brief.minFollowers.toLocaleString('vi-VN')}`,met:followers>=brief.minFollowers});}
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
