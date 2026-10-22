import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ProjectKolCard} from '../src/components/ProjectKolCard';
import {readProjectBrief,assessProjectKol,briefDeliverableLabel} from '../src/domain/projectBrief';
import {calculateKolRecommendation,rankKolsForRecommendation} from '../src/utils/recommendationEngine';
const profile:any={id:'test',ten:'Bếp Nhà An',linhVuc:['Ẩm thực'],nenTang:[{tenNenTang:'TikTok',soFollower:250000,linkProfile:'https://example.test/creator'},{tenNenTang:'YouTube',soFollower:10000,linkProfile:'javascript:alert(1)'}],bangGia:{video:12000000,shorts:0,post:null,livestream:null,thamDuSuKien:null,sdha:null},reviewSoBo:'Review bánh kẹo và món ăn gia đình',lichSuHopTac:[]};
const brief=readProjectBrief({category:'ẩm thực',keyword:'bánh kẹo',platform:'TikTok',minFollowers:200000,deliverableScope:'campaign',deliverables:[{format:'video',quantity:10},{format:'shorts',quantity:15}]});
test('lý do dựa trên tiêu chí hồ sơ, follower đúng kênh, không đánh giá bằng giá hoặc ER',()=>{
  const assessment=assessProjectKol(profile,brief);assert.equal(assessment.matches,true);assert.equal(assessment.checks.length,4);
  assert.equal(assessProjectKol({...profile,engagementRate:99,bangGia:{}},brief).matches,true);
  assert.equal(assessProjectKol(profile,{...brief,platform:'YouTube'}).matches,false);
  assert.equal(assessProjectKol(profile,{...brief,keyword:'ĐỒ ĂN'}).matches,false);
  assert.equal(assessProjectKol({...profile,reviewSoBo:'ĐỒ ĂN'}, {...brief,keyword:'do an'}).matches,true);
  assert.equal(assessProjectKol(profile,readProjectBrief(null)).hasCriteria,false);
});
test('thẻ hiển thị 6 giá, làm nổi bật tổng brief không gán cho mỗi KOL, giá 0 hợp lệ, link an toàn',()=>{
  const html=renderToStaticMarkup(React.createElement(ProjectKolCard,{profile:{...profile,engagementRate:99},brief,selected:false,disabled:false,selectionLabel:'Giữ KOL'}));
  assert.match(html,/250.000/);assert.match(html,/12.000.000/);assert.match(html,/>0 ₫</);
  assert.match(html,/10 toàn chiến dịch/);assert.match(html,/15 toàn chiến dịch/);assert.match(html,/chưa phân công cho từng KOL/);
  assert.equal((html.match(/Chưa xác nhận/g)||[]).length,2);assert.equal((html.match(/Chờ bổ sung giá/g)||[]).length,4);
  assert.doesNotMatch(html,/engagement|ER:|javascript:/);assert.match(html,/href="https:\/\/example.test\/creator"/);
  const perKol=renderToStaticMarkup(React.createElement(ProjectKolCard,{profile,brief:{...brief,deliverableScope:'per_kol'},selected:false,disabled:false,selectionLabel:'Giữ KOL'}));
  assert.match(perKol,/10 \/ KOL/);assert.doesNotMatch(perKol,/10 toàn chiến dịch/);
});
test('đề xuất cũ bỏ hoàn toàn ER khỏi điểm và thứ tự, backup cũ vẫn đọc được',()=>{
  const filter:any={linhVuc:'Ẩm thực',engagementToiThieu:90,soLuongCan:0};
  const low=calculateKolRecommendation({...profile,engagementRate:0},filter);
  const high=calculateKolRecommendation({...profile,engagementRate:99},filter);
  assert.deepEqual(low.lyDo,high.lyDo);assert.equal(low.tongDiem,high.tongDiem);assert.equal('diemEngagement' in low,false);
  const ranked=rankKolsForRecommendation([{...profile,id:'b',ten:'B',engagementRate:99},{...profile,id:'a',ten:'A',engagementRate:0}],filter);
  assert.deepEqual(ranked.map(p=>p.kol.id),['a','b']);
  assert.equal('minEr' in readProjectBrief({minEr:99}),false);
  assert.match(briefDeliverableLabel({format:'shorts',quantity:15},'campaign'),/15 toàn chiến dịch/);
});
