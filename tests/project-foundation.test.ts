import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canAccessProject, canGrantProjectPermission, type UserIdentity, type ProjectMembership} from '../src/domain/projects';
import {calculateProjectFinance} from '../src/domain/projectFinance';

const project = {id:'p1',organizationId:'org',name:'Dự án',contentWorkflowEnabled:false};
const user = (id:string, role:'admin'|'member'='member'):UserIdentity => ({id,organizationId:'org',active:true,organizationRole:role});
const members:ProjectMembership[] = [
  ...['pm1','pm2','pm3','pm4'].map(id => ({projectId:'p1',userId:id,roles:['pm'] as const,duties:[],grants:[],active:true})).map(m=>({...m,roles:[...m.roles]})),
  {projectId:'p1',userId:'b1',roles:['booking'],duties:['pricing'],grants:[],active:true},
  {projectId:'p1',userId:'b2',roles:['booking'],duties:['paperwork','creator_support'],grants:[],active:true},
];

test('nhiều Admin toàn công ty có quyền đầy đủ',()=>{
  for(const id of ['admin1','admin2']) assert.equal(canAccessProject(user(id,'admin'),project,[],'view_pnl'),true);
});
test('nhiều PM và Booking cùng làm việc',()=>{
  for(const id of ['pm1','pm2','pm3','pm4']) assert.equal(canAccessProject(user(id),project,members,'view_pnl'),true);
  for(const id of ['b1','b2']) {
    assert.equal(canAccessProject(user(id),project,members,'manage_contracts'),true);
    assert.equal(canAccessProject(user(id),project,members,'manage_payments'),true);
    assert.equal(canAccessProject(user(id),project,members,'view_pnl'),false);
  }
});
test('membership mang role cũ admin vẫn được quyền leadership nhờ normalize',()=>{
  const legacyMember = {projectId:'p1',userId:'legacy_admin',roles:['admin' as any],duties:[],grants:[],active:true};
  assert.equal(canAccessProject(user('legacy_admin'),project,[legacyMember],'view_pnl'),true);
  assert.equal(canAccessProject(user('legacy_admin'),project,[legacyMember],'manage_members'),true);
});
test('PM không truy cập project chưa được giao',()=>{
  assert.equal(canAccessProject(user('pm1'),{...project,id:'p2'},members,'view_project'),false);
});
test('tài khoản bị khóa và thành viên ngừng tham gia mất quyền',()=>{
  assert.equal(canAccessProject({...user('pm1'),active:false},project,members,'view_project'),false);
  assert.equal(canAccessProject(user('pm1'),project,members.map(m=>({...m,active:false})),'view_project'),false);
  assert.equal(canAccessProject(null,project,members,'view_project'),false);
});
test('không truy cập chéo công ty kể cả Admin',()=>{
  assert.equal(canAccessProject({...user('a','admin'),organizationId:'other'},project,members,'view_project'),false);
});
test('phân công giá/hồ sơ không tự cấp quyền P&L',()=>{
  assert.equal(canAccessProject(user('b1'),project,members,'view_sell_prices'),false);
  const granted=members.map(m=>m.userId==='b1'?{...m,grants:['view_sell_prices' as const]}:m);
  assert.equal(canAccessProject(user('b1'),project,granted,'view_sell_prices'),false);
  assert.equal(canAccessProject(user('b1'),project,granted,'view_pnl'),false);
  assert.equal(canGrantProjectPermission(user('pm1'),project,members,'view_pnl'),false);
});
const input = {
  items:[{quantity:1,buyUnitPrice:60_000_000,sellUnitPrice:100_000_000,included:true}],
  discount:{mode:'fixed' as const,value:10_000_000},agencyFee:{mode:'percent' as const,value:12},
};
test('fee tính sau chiết khấu: 100 - 10 + 12% × 90 = 100,8 triệu',()=>{
  const result=calculateProjectFinance(input);
  assert.equal(result.feeBase,90_000_000);
  assert.equal(result.agencyFee,10_800_000);
  assert.equal(result.revenueBeforeTax,100_800_000);
  assert.equal(result.profit,40_800_000);
});
test('chi phí nội bộ thêm vào đầu vào, không cộng doanh thu',()=>{
  const result=calculateProjectFinance({...input,extraDirectCosts:[2_000_000]});
  assert.equal(result.profit,38_800_000);
  assert.equal(result.revenueBeforeTax,100_800_000);
});
test('giá thiếu không bị coi là miễn phí, giá 0 là hợp lệ',()=>{
  assert.equal(calculateProjectFinance({...input,items:[{...input.items[0],buyUnitPrice:null}]}).profit,null);
  assert.equal(calculateProjectFinance({...input,items:[{...input.items[0],sellUnitPrice:null}]}).revenueBeforeTax,null);
  assert.equal(calculateProjectFinance({...input,items:[{...input.items[0],buyUnitPrice:0}]}).profit,100_800_000);
});
test('chặn giá âm, số lượng sai và chiết khấu vượt tổng',()=>{
  assert.throws(()=>calculateProjectFinance({...input,items:[{...input.items[0],quantity:0}]}));
  assert.throws(()=>calculateProjectFinance({...input,items:[{...input.items[0],buyUnitPrice:-1}]}));
  assert.throws(()=>calculateProjectFinance({...input,discount:{mode:'percent',value:101}}));
});
test('dòng chưa chọn không được cộng và doanh thu 0 không chia cho 0',()=>{
  const result=calculateProjectFinance({...input,items:[{...input.items[0],included:false}],discount:{mode:'fixed',value:0}});
  assert.equal(result.profit,0);assert.equal(result.marginPercent,null);
});
