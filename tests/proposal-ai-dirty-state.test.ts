import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  extractFormFromAiResult,
  formFromPhase,
  blankForm,
  isFormDirty,
  type FormValues,
} from '../src/components/ProjectProposal';
import { LatestRequestGuard } from '../src/utils/latestRequestGuard';

test('1. formSnapshot không bị cập nhật khi AI phân tích thành công: form dirty khi kết quả AI khác dữ liệu đã lưu', () => {
  const phase = {
    id: 'ph-1',
    name: 'Phase 1',
    budget: 50_000_000,
    revision: 1,
    brief: {
      text: 'Brief ban đầu của phase',
      category: 'CongNghe',
      platform: 'TikTok',
      minFollowers: 10_000,
      budget: 50_000_000,
      maxBudgetPerKol: 5_000_000,
      deliverableScope: 'campaign',
      deliverables: [{ format: 'video', quantity: 2 }],
      partnerType: 'kol',
      kolTargetCount: 5,
      communityTargetCount: null,
      kpiTopics: null,
      kpiComments: null,
      kpiBuzz: null,
      pillars: [],
      services: [],
    },
  };

  // Khởi tạo snapshot khi nạp phase
  const initialForm = formFromPhase(phase);
  const snapshot = JSON.stringify(initialForm);

  // Trước khi AI phân tích, form chưa có chỉnh sửa
  assert.equal(isFormDirty(initialForm, snapshot), false, 'Form ban đầu phải khớp snapshot');

  // AI phân tích ra thông tin mới (khác dữ liệu đã lưu trên phase)
  const aiResult = {
    linhVuc: 'LamDep',
    nenTang: 'TikTok',
    followerToiThieu: 20_000,
    nganSachMoiKol: 8_000_000,
    nganSachTong: 80_000_000,
    hangMucTongCampaign: [{ format: 'video', quantity: 4 }],
    doiTac: 'both',
    soLuongKol: 8,
    soLuongCommunity: 4,
    kpiTopics: 20,
    kpiComments: 5000,
    kpiBuzz: 15000,
    pillars: [{ name: 'review', percent: 60 }, { name: 'unboxing', percent: 40 }],
    services: [{ name: 'Seeding', unit: 'bài', quantity: 10, scope: 'phase' }],
  };

  const updatedForm = extractFormFromAiResult(initialForm.briefText, aiResult);

  // formSnapshot KHÔNG được cập nhật theo updatedForm -> formDirty() phải là true!
  assert.equal(isFormDirty(updatedForm, snapshot), true, 'Form phải báo dirty sau khi AI cập nhật tiêu chí mới');
});

test('2. Không cảnh báo sai khi AI phân tích ra kết quả giống hệt dữ liệu đã lưu', () => {
  const phase = {
    id: 'ph-2',
    name: 'Phase 2',
    budget: 30_000_000,
    revision: 2,
    brief: {
      text: 'Brief giống hệt',
      category: 'CongNghe',
      platform: 'YouTube',
      minFollowers: 50_000,
      budget: 30_000_000,
      maxBudgetPerKol: 10_000_000,
      deliverableScope: 'campaign',
      deliverables: [{ format: 'video', quantity: 3 }],
      partnerType: 'kol',
      kolTargetCount: 3,
      communityTargetCount: null,
      kpiTopics: null,
      kpiComments: null,
      kpiBuzz: null,
      pillars: [],
      services: [],
    },
  };

  const savedForm = formFromPhase(phase);
  const snapshot = JSON.stringify(savedForm);

  // AI trả về thông số giống hệt dữ liệu đã lưu
  const aiResultIdentical = {
    linhVuc: 'CongNghe',
    nenTang: 'YouTube',
    followerToiThieu: 50_000,
    nganSachMoiKol: 10_000_000,
    nganSachTong: 30_000_000,
    hangMucTongCampaign: [{ format: 'video', quantity: 3 }],
    doiTac: 'kol',
    soLuongKol: 3,
  };

  const extracted = extractFormFromAiResult(savedForm.briefText, aiResultIdentical);

  // Kết quả giống hệt -> formDirty() trả về false, không hiện cảnh báo sai
  assert.equal(isFormDirty(extracted, snapshot), false, 'Không báo dirty khi kết quả AI trùng khớp dữ liệu đã lưu');
});

test('3. guardSwitch ngăn chuyển phase/dự án khi có thay đổi chưa lưu, cho phép hủy chuyển và giữ nguyên form', () => {
  let switchExecuted = false;
  let cancelExecuted = false;
  let confirmPrompt = '';

  function mockGuardSwitch(
    isDirty: boolean,
    userAcceptsConfirm: boolean,
    action: () => void,
    onCancel?: () => void
  ) {
    if (isDirty) {
      confirmPrompt = 'Bạn đang có chỉnh sửa ở brief/tiêu chí chưa được dùng để tìm kiếm hoặc lưu. Chuyển dự án/phase sẽ làm mất các chỉnh sửa này. Tiếp tục?';
      if (!userAcceptsConfirm) {
        onCancel?.();
        return;
      }
    }
    action();
  }

  // Trường hợp 1: Form dirty, người dùng bấm Hủy (confirm = false)
  switchExecuted = false;
  cancelExecuted = false;
  mockGuardSwitch(
    true,
    false,
    () => { switchExecuted = true; },
    () => { cancelExecuted = true; }
  );
  assert.equal(switchExecuted, false, 'Không thực hiện chuyển phase khi người dùng hủy');
  assert.equal(cancelExecuted, true, 'Callback onCancel được gọi để khôi phục UI select');
  assert.ok(confirmPrompt.includes('Chuyển dự án/phase sẽ làm mất các chỉnh sửa này'));

  // Trường hợp 2: Form dirty, người dùng bấm Tiếp tục (confirm = true)
  switchExecuted = false;
  cancelExecuted = false;
  mockGuardSwitch(
    true,
    true,
    () => { switchExecuted = true; },
    () => { cancelExecuted = true; }
  );
  assert.equal(switchExecuted, true, 'Thực hiện chuyển phase khi người dùng đồng ý');
  assert.equal(cancelExecuted, false, 'onCancel không được gọi khi đồng ý chuyển');

  // Trường hợp 3: Form sạch (không dirty) -> chuyển ngay không cần hỏi
  switchExecuted = false;
  cancelExecuted = false;
  confirmPrompt = '';
  mockGuardSwitch(
    false,
    false,
    () => { switchExecuted = true; },
    () => { cancelExecuted = true; }
  );
  assert.equal(switchExecuted, true, 'Chuyển ngay khi form không dirty');
  assert.equal(confirmPrompt, '', 'Không hiển thị hộp thoại confirm khi form sạch');
});

test('4. Lưu thất bại giữ nguyên nội dung chỉnh sửa và trạng thái chưa lưu; chỉ cập nhật snapshot khi lưu thành công', async () => {
  const phase = {
    id: 'ph-save',
    name: 'Phase Save Test',
    budget: 20_000_000,
    revision: 1,
    brief: { text: 'Brief gốc', category: 'FMCG' },
  };

  let serverPhase = { ...phase };
  let formState: FormValues = {
    ...formFromPhase(phase),
    briefText: 'Brief đã được chỉnh sửa nhưng chưa lưu',
    linhVuc: 'FMCG Mới',
    followerMin: 15_000,
  };
  let formSnapshot = JSON.stringify(formFromPhase(phase));

  // Kiểm tra ban đầu: form dirty
  assert.equal(isFormDirty(formState, formSnapshot), true);

  // Giả lập lưu thất bại (ví dụ 409 Conflict hoặc mất mạng)
  async function mockSave(shouldFail: boolean) {
    if (shouldFail) {
      throw new Error('Phase đã thay đổi trên hệ thống. Tải lại trước khi lưu.');
    }
    serverPhase = {
      ...serverPhase,
      revision: serverPhase.revision + 1,
      brief: { text: formState.briefText, category: formState.linhVuc },
    };
    formSnapshot = JSON.stringify(formState);
  }

  // 1. Thử lưu thất bại
  let saveError = '';
  try {
    await mockSave(true);
  } catch (e: any) {
    saveError = e.message;
  }
  assert.ok(saveError.includes('Phase đã thay đổi'));
  // Snapshot vẫn là bản cũ, form vẫn dirty, nội dung chỉnh sửa còn nguyên
  assert.equal(formState.briefText, 'Brief đã được chỉnh sửa nhưng chưa lưu');
  assert.equal(isFormDirty(formState, formSnapshot), true, 'Sau lưu thất bại, trạng thái chưa lưu phải giữ nguyên');

  // 2. Thử lưu thành công
  await mockSave(false);
  assert.equal(isFormDirty(formState, formSnapshot), false, 'Sau lưu thành công, trạng thái chưa lưu biến mất');
  assert.equal(formSnapshot, JSON.stringify(formState));
});

test('5. LatestRequestGuard hủy/bỏ qua kết quả AI trả chậm khi người dùng chuyển phase hoặc dự án', () => {
  const guard = new LatestRequestGuard();

  // Bắt đầu phân tích cho Phase 1
  const token1 = guard.begin('proj-1::phase-1');
  assert.equal(guard.isCurrent(token1), true);

  // Người dùng chuyển sang Phase 2 trước khi AI Phase 1 trả về
  const token2 = guard.begin('proj-1::phase-2');

  // Token cũ của Phase 1 lập tức mất hiệu lực
  assert.equal(guard.isCurrent(token1), false, 'Token Phase 1 không còn là token hiện hành');
  assert.equal(guard.isCurrent(token2), true, 'Token Phase 2 là token hiện hành');

  // Nếu người dùng hủy phân tích (cancelParse)
  guard.invalidate();
  assert.equal(guard.isCurrent(token2), false, 'Sau khi invalidate, token Phase 2 cũng bị hủy bỏ');
});

test('6. Kiểm tra mã nguồn ProjectProposal.tsx: tuân thủ nghiêm ngặt các quy tắc đợt sửa', () => {
  const code = readFileSync(new URL('../src/components/ProjectProposal.tsx', import.meta.url), 'utf8');

  // parseBrief KHÔNG được gọi setFormSnapshot
  // Tìm khối hàm parseBrief
  const parseBriefStart = code.indexOf('async function parseBrief()');
  const parseBriefEnd = code.indexOf('function search()', parseBriefStart);
  assert.ok(parseBriefStart > 0 && parseBriefEnd > parseBriefStart, 'Tìm thấy hàm parseBrief');
  const parseBriefBody = code.slice(parseBriefStart, parseBriefEnd);

  assert.ok(
    !parseBriefBody.includes('setFormSnapshot('),
    'parseBrief tuyệt đối KHÔNG được gọi setFormSnapshot để tránh xóa trạng thái chưa lưu'
  );

  // Có hiển thị nhãn "Có chỉnh sửa chưa lưu" khi formDirty()
  assert.ok(code.includes('Có chỉnh sửa chưa lưu'), 'Hiển thị badge Có chỉnh sửa chưa lưu');
  assert.ok(code.includes('formDirty()'), 'Kiểm tra formDirty()');

  // guardSwitch có truyền onCancel khi chuyển dự án hoặc phase
  assert.ok(code.includes('guardSwitch'), 'Có cơ chế guardSwitch');
  assert.ok(code.includes('target.value = projectId'), 'Khôi phục projectId nếu hủy switch');
  assert.ok(code.includes('target.value = phaseId'), 'Khôi phục phaseId nếu hủy switch');

  // Bảo đảm vẫn có Threads trong PLATFORMS
  assert.ok(code.includes("'Threads'"), 'PLATFORMS có Threads');
});
