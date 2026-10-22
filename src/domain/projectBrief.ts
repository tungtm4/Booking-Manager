import {PRICE_FORMAT_LABELS, type PriceFormatKey} from '../types/kol';
export type BriefDeliverable={format:PriceFormatKey;quantity:number};
export interface ProjectBrief {
  text:string;category:string;keyword:string;platform:string;minFollowers:number;
  targetCount:number|null;budget:number|null;deliverableScope:'campaign'|'per_kol';deliverables:BriefDeliverable[];
}
export const emptyProjectBrief:ProjectBrief={text:'',category:'',keyword:'',platform:'',minFollowers:0,targetCount:null,budget:null,deliverableScope:'campaign',deliverables:[]};
// Chỉ đọc các trường đang sử dụng. Tiêu chí ER trong bản lưu cũ bị bỏ qua.
export function readProjectBrief(raw:any):ProjectBrief {
  return {...Object.fromEntries(Object.keys(emptyProjectBrief).map(k=>[k,raw?.[k]??emptyProjectBrief[k as keyof ProjectBrief]]))} as unknown as ProjectBrief;
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
