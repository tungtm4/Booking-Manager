import React, { useEffect, useState } from 'react';
import { ProjectShortlistPanel } from './ProjectShortlistPanel';
import { CommunityManager } from './CommunityManager';
import { PartnerCatalogManager } from './PartnerCatalogManager';
import { ProjectProposal } from './ProjectProposal';
import { ProjectQuotesPanel } from './ProjectQuotesPanel';
import { ProjectContractsPanel } from './ProjectContractsPanel';
import { PhaseBreakdownBlock } from './PhaseBreakdownBlock';
import { ProjectMemberPicker } from './ProjectMemberPicker';
import App from '../App';
import { formatVND } from '../utils/formatters';
import { BriefPlatformSelector } from './BriefPlatformSelector';
import { BriefExtrasFields } from './ProjectShortlistPanel';
import { formatMoneyInput, parseMoneyInput } from '../utils/moneyInput';
import { normalizeBriefPlatforms } from '../domain/projectBrief';
import { PRICE_FORMAT_LABELS } from '../types/kol';

const formats = Object.entries(PRICE_FORMAT_LABELS);

type User = { id: string; email: string; name: string; role: 'admin' | 'member'; mustChangePassword: boolean };

async function api(path: string, body?: unknown, method?: string) {
  const res = await fetch('/api/workspace' + path, {
    credentials: 'same-origin',
    ...(body === undefined && !method
      ? {}
      : { method: method ?? 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }),
  });
  const data = await res.json();
  if (res.status === 401) window.dispatchEvent(new Event('workspace_session_expired'));
  if (!res.ok) throw new Error(data.message || 'Không thể thực hiện yêu cầu.');
  return data;
}

const field = 'w-full rounded-xl border border-purple-200 px-3 py-2.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-400/50 focus:border-purple-500';
const button = 'rounded-xl bg-[#7C3AED] hover:bg-purple-700 text-white font-semibold px-4 py-2.5 disabled:opacity-50 transition-colors shadow-sm cursor-pointer';
const buttonSecondary = 'rounded-xl border border-purple-200 bg-white hover:bg-purple-50 text-slate-700 font-semibold px-4 py-2.5 disabled:opacity-50 transition-colors cursor-pointer';
const labels: Record<string, string> = { admin: 'Admin', pm: 'PM', booking: 'Booking', pricing: 'Phụ trách giá', paperwork: 'Phụ trách hồ sơ', creator_support: 'Hỗ trợ creator' };

function ProjectOverviewPanel({ project, members, isAdmin, onSwitchTab, onProjectChanged, onOpenPhase }: { project: any; members: any[]; isAdmin: boolean; onSwitchTab: (tab: any) => void; onProjectChanged?: () => void; onOpenPhase?: (phaseId: string) => void }) {
  const [data, setData] = useState<any>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [briefForm, setBriefForm] = useState<any>(null);
  const [briefRevision, setBriefRevision] = useState(0);
  const [briefDirty, setBriefDirty] = useState(false);
  // DG-2 (tinh gọn phần dự án): form brief tầng dự án mặc định ĐÓNG — chỉ hiện tóm tắt.
  const [briefOpen, setBriefOpen] = useState(false);
  const [briefSaving, setBriefSaving] = useState(false);
  const [briefNotice, setBriefNotice] = useState('');
  const [briefError, setBriefError] = useState('');

  const canEdit = project.canManage || isAdmin;

  useEffect(() => {
    let active = true;
    Promise.all([
      api(`/projects/${project.id}/shortlist`),
      api(`/projects/${project.id}/phases`),
      api(`/projects/${project.id}/options`),
      api(`/projects/${project.id}/contracts`).catch(() => ({ contracts: [] })),
    ])
      .then(([shortlist, phases, options, contracts]) => {
        if (active) {
          setData({ shortlist, phases: phases.phases || [], options: options.options || [], baselineId: options.baselineId, contracts: contracts.contracts || [] });
          setBriefForm(shortlist.brief || {});
          setBriefRevision(shortlist.briefRevision ?? 0);
          setBriefDirty(false);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [project.id, reloadKey]);

  const handleBriefChange = (k: string, v: any) => {
    setBriefForm((prev: any) => ({ ...prev, [k]: v }));
    setBriefDirty(true);
  };

  const handlePlatformChange = (nextPlatforms: string[]) => {
    const n = normalizeBriefPlatforms({ platforms: nextPlatforms });
    setBriefForm((prev: any) => ({ ...prev, platforms: n.platforms, platform: n.platform }));
    setBriefDirty(true);
  };

  // Thông tin dự án (tên/khách/chiến dịch): bề mặt sửa DUY NHẤT là thẻ này ở tab Tổng quan
  // (form cũ ở tab Báo giá đã bỏ để tránh 2 nơi sửa — R2/P2).
  const [editingInfo, setEditingInfo] = useState(false);
  const [infoForm, setInfoForm] = useState({ name: '', client: '', campaign: '' });
  const [infoSaving, setInfoSaving] = useState(false);
  const [infoError, setInfoError] = useState('');
  const startEditInfo = () => {
    setInfoForm({ name: project.name || '', client: project.client_name || '', campaign: project.campaign_name || '' });
    setInfoError('');
    setEditingInfo(true);
  };
  const handleSaveInfo = async () => {
    if (!canEdit) return;
    setInfoSaving(true);
    setInfoError('');
    try {
      await api(`/projects/${project.id}/details`, { name: infoForm.name, client: infoForm.client, campaign: infoForm.campaign });
      setEditingInfo(false);
      onProjectChanged?.();
    } catch (e: any) {
      setInfoError(e.message || 'Không thể lưu thông tin dự án.');
    } finally {
      setInfoSaving(false);
    }
  };

  const handleSaveBrief = async () => {
    if (!canEdit || !briefForm) return;
    setBriefSaving(true);
    setBriefError('');
    setBriefNotice('');
    try {
      await api(`/projects/${project.id}/brief`, { brief: briefForm, revision: briefRevision });
      setBriefRevision((prev) => prev + 1);
      setBriefDirty(false);
      setBriefNotice('Đã lưu brief dự án thành công. Tiêu chí này được áp dụng làm mẫu cho toàn chiến dịch.');
      const shortlist = await api(`/projects/${project.id}/shortlist`);
      setData((prev: any) => ({ ...prev, shortlist }));
    } catch (e: any) {
      setBriefError(e.message || 'Không thể lưu brief dự án.');
    } finally {
      setBriefSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-slate-500">Đang tải thông tin tổng quan dự án…</div>;
  if (error) return <div className="p-4 bg-red-50 text-red-700 rounded-xl">{error}</div>;

  const brief = briefForm || data?.shortlist?.brief || {};
  const showBriefForm = canEdit && (briefOpen || briefDirty);
  const phases = data?.phases || [];
  const options = data?.options || [];
  const contracts = data?.contracts || [];
  const shortlistRows = data?.shortlist?.rows || [];

  const unconfirmedPriceRows = shortlistRows.filter((r: any) => {
    if (!r.prices) return false;
    return Object.values(r.prices).some((p: any) => p && p.status === 'unconfirmed');
  });
  const missingPriceRows = shortlistRows.filter((r: any) => {
    if (!r.prices) return true;
    return Object.values(r.prices).every((p: any) => !p || p.status === 'waiting');
  });

  const draftQuotes = options.flatMap((o: any) => (o.versions || []).filter((v: any) => v.status === 'draft' || v.status === 'changes_requested'));
  const pendingContractApprovals = contracts.filter((c: any) => c.status === 'draft' || c.status === 'sent');

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white p-5 rounded-2xl border border-purple-100 shadow-sm space-y-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-purple-700">Bước 1 · Thông tin & thành viên</span>
              <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                {project.canManage ? 'PM / Quản lý' : 'Booking'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-bold text-slate-900 text-lg">Thông tin chiến dịch & Khách hàng</h3>
              {canEdit && !editingInfo && (
                <button type="button" onClick={startEditInfo} className="text-xs text-[#7C3AED] font-semibold hover:underline cursor-pointer whitespace-nowrap">
                  Chỉnh sửa
                </button>
              )}
            </div>
          </div>
          {editingInfo ? (
            <div className="space-y-2.5">
              <label className="block text-sm">
                <span className="text-slate-400 text-xs block font-medium mb-1">Tên dự án</span>
                <input aria-label="Tên dự án" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" maxLength={200} value={infoForm.name} onChange={(e) => setInfoForm({ ...infoForm, name: e.target.value })} />
              </label>
              <label className="block text-sm">
                <span className="text-slate-400 text-xs block font-medium mb-1">Khách hàng / Nhãn hàng</span>
                <input aria-label="Khách hàng / Nhãn hàng" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" maxLength={200} value={infoForm.client} onChange={(e) => setInfoForm({ ...infoForm, client: e.target.value })} />
              </label>
              <label className="block text-sm">
                <span className="text-slate-400 text-xs block font-medium mb-1">Tên chiến dịch</span>
                <input aria-label="Tên chiến dịch" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" maxLength={200} value={infoForm.campaign} onChange={(e) => setInfoForm({ ...infoForm, campaign: e.target.value })} />
              </label>
              {infoError && <p className="text-xs text-red-600">{infoError}</p>}
              <div className="flex gap-2">
                <button type="button" disabled={infoSaving} onClick={handleSaveInfo} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 cursor-pointer">Lưu thông tin dự án</button>
                <button type="button" disabled={infoSaving} onClick={() => setEditingInfo(false)} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-600 cursor-pointer">Huỷ</button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-slate-400 text-xs block font-medium">Tên dự án</span>
                <strong className="text-slate-800">{project.name || 'Chưa cập nhật'}</strong>
              </div>
              <div>
                <span className="text-slate-400 text-xs block font-medium">Khách hàng / Nhãn hàng</span>
                <strong className="text-slate-800">{project.client_name || 'Chưa cập nhật'}</strong>
              </div>
              <div>
                <span className="text-slate-400 text-xs block font-medium">Tên chiến dịch</span>
                <strong className="text-slate-800">{project.campaign_name || project.name}</strong>
              </div>
            </div>
          )}
          {brief.text && (
            <div className="pt-2 border-t border-slate-100">
              <span className="text-slate-400 text-xs block font-medium mb-1">Tóm tắt brief</span>
              <p className="text-sm text-slate-700 whitespace-pre-line line-clamp-3 bg-purple-50/50 p-2.5 rounded-xl border border-purple-100/50">{brief.text}</p>
            </div>
          )}
        </div>

        <div className="bg-white p-5 rounded-2xl border border-amber-200/80 shadow-sm space-y-3">
          <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
            Việc cần làm từ dữ liệu thật
          </h3>
          <ul className="space-y-2 text-sm">
            {missingPriceRows.length > 0 && (
              <li className="flex items-center justify-between gap-2 p-2.5 bg-amber-50/80 rounded-xl text-amber-900 text-xs font-medium border border-amber-200/50">
                <span>⚠️ {missingPriceRows.length} đối tác trong danh sách sơ bộ chưa có giá đầu vào.</span>
                <button onClick={() => onSwitchTab('shortlist')} className="text-purple-700 underline font-semibold ml-2 cursor-pointer whitespace-nowrap shrink-0">Xử lý ngay</button>
              </li>
            )}
            {unconfirmedPriceRows.length > 0 && (
              <li className="flex items-center justify-between gap-2 p-2.5 bg-amber-50/80 rounded-xl text-amber-900 text-xs font-medium border border-amber-200/50">
                <span>⚠️ {unconfirmedPriceRows.length} đối tác có giá chưa xác nhận nguồn.</span>
                <button onClick={() => onSwitchTab('shortlist')} className="text-purple-700 underline font-semibold ml-2 cursor-pointer whitespace-nowrap shrink-0">Xác nhận</button>
              </li>
            )}
            {draftQuotes.length > 0 && (
              <li className="flex items-center justify-between gap-2 p-2.5 bg-blue-50/80 rounded-xl text-blue-900 text-xs font-medium border border-blue-200/50">
                <span>📄 {draftQuotes.length} bản nháp phương án/báo giá đang chờ hoàn thiện/gửi duyệt.</span>
                <button onClick={() => onSwitchTab('quotes')} className="text-purple-700 underline font-semibold ml-2 cursor-pointer whitespace-nowrap shrink-0">Xem phương án</button>
              </li>
            )}
            {pendingContractApprovals.length > 0 && (
              <li className="flex items-center justify-between gap-2 p-2.5 bg-purple-50/80 rounded-xl text-purple-900 text-xs font-medium border border-purple-200/50">
                <span>📑 {pendingContractApprovals.length} hợp đồng chưa trình ký hoặc chờ đối tác chốt.</span>
                <button onClick={() => onSwitchTab('contracts')} className="text-purple-700 underline font-semibold ml-2 cursor-pointer whitespace-nowrap shrink-0">Xem hợp đồng</button>
              </li>
            )}
            {missingPriceRows.length === 0 && unconfirmedPriceRows.length === 0 && draftQuotes.length === 0 && pendingContractApprovals.length === 0 && (
              <li className="p-4 text-center text-slate-500 bg-slate-50 rounded-xl text-xs">Mọi công việc cơ bản đã hoàn thành tốt!</li>
            )}
          </ul>
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <h3 className="font-bold text-slate-900 text-lg">Thành viên phân công dự án</h3>
        <div className="flex flex-wrap gap-3">
          {members.length === 0 && <p className="text-sm text-slate-500">Chưa có phân công thành viên riêng. Admin hệ thống có toàn quyền quản lý.</p>}
          {members.map((m: any) => (
            <div key={m.id} className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50/50">
              <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold">
                {m.display_name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div>
                <strong className="text-xs text-slate-800 block">{m.display_name}</strong>
                <span className="text-[10px] text-purple-700 font-semibold bg-purple-50 px-1.5 py-0.5 rounded">
                  {m.roles?.map((r: string) => labels[r] || r).join(', ')}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Brief tầng dự án — Bề mặt sửa duy nhất của brief chiến dịch */}
      <div className="bg-white p-5 rounded-2xl border border-purple-100 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-100/60 pb-3">
          <div>
            <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
              📋 Bước 2 · Brief chung & tiêu chí chiến dịch
            </h3>
            <p className="text-xs text-slate-500">
              Đây là bề mặt sửa brief chiến dịch duy nhất của dự án. Brief của từng phase sẽ kế thừa từ brief này nếu chưa cấu hình riêng.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && !briefDirty && (
              <button type="button" className="text-sm text-indigo-700 underline cursor-pointer" aria-expanded={briefOpen} onClick={() => setBriefOpen(v => !v)}>{briefOpen ? 'Đóng biểu mẫu brief' : 'Chỉnh sửa brief'}</button>
            )}
            {!canEdit ? (
              <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                Quyền xem (Booking) — Chỉ PM / Admin được chỉnh sửa
              </span>
            ) : briefDirty ? (
              <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                Có chỉnh sửa chưa lưu
              </span>
            ) : null}
          </div>
        </div>

        {briefError && <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl">{briefError}</div>}
        {briefNotice && <div className="p-3 bg-emerald-50 text-emerald-800 text-xs rounded-xl">{briefNotice}</div>}

        {briefForm && !showBriefForm && (
          <div className="text-sm space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
            <p className="text-slate-800 whitespace-pre-wrap">{briefForm.text || 'Chưa nhập nội dung brief tổng.'}</p>
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-slate-200/60 text-xs">
              <div><span className="text-slate-400 block">Lĩnh vực:</span><strong className="text-slate-700">{briefForm.category || 'Tất cả'}</strong></div>
              <div><span className="text-slate-400 block">Nền tảng:</span><strong className="text-slate-700">{(briefForm.platforms ?? []).join(', ') || briefForm.platform || 'Tất cả'}</strong></div>
              <div><span className="text-slate-400 block">Follower tối thiểu:</span><strong className="text-slate-700">{briefForm.minFollowers ? Number(briefForm.minFollowers).toLocaleString('vi-VN') : 'Không lọc'}</strong></div>
              <div><span className="text-slate-400 block">Số KOL mục tiêu:</span><strong className="text-slate-700">{briefForm.targetCount ?? 'Chưa đặt'}</strong></div>
            </div>
            <p className="text-xs text-slate-500">{canEdit ? 'Bấm “Chỉnh sửa brief” ở góc trên để mở toàn bộ biểu mẫu tiêu chí.' : 'Brief do PM/Admin quản lý — Booking xem tóm tắt này để nắm tiêu chí.'}</p>
          </div>
        )}

        {briefForm && showBriefForm && (
          <fieldset disabled={!canEdit || briefSaving} className="space-y-4">
            <label className="block text-sm">
              <span className="text-slate-700 font-semibold mb-1 block">Nội dung brief tổng</span>
              <textarea
                className={field}
                rows={4}
                maxLength={10000}
                value={briefForm.text ?? ''}
                placeholder="Nhập yêu cầu brief, định vị sản phẩm, mục tiêu chiến dịch…"
                onChange={e => handleBriefChange('text', e.target.value)}
              />
            </label>

            <div className="grid sm:grid-cols-2 gap-4">
              <label className="text-sm">
                <span className="text-slate-700 font-medium mb-1 block">Lĩnh vực nội dung</span>
                <input
                  className={field}
                  placeholder="VD: Ẩm thực, Làm đẹp, Công nghệ"
                  value={briefForm.category ?? ''}
                  onChange={e => handleBriefChange('category', e.target.value)}
                />
              </label>
              <label className="text-sm">
                <span className="text-slate-700 font-medium mb-1 block">Từ khóa trong hồ sơ</span>
                <input
                  className={field}
                  placeholder="Để trống nếu không lọc thêm"
                  value={briefForm.keyword ?? ''}
                  onChange={e => handleBriefChange('keyword', e.target.value)}
                />
              </label>

              <BriefPlatformSelector
                platforms={briefForm.platforms || []}
                disabled={!canEdit || briefSaving}
                onChange={handlePlatformChange}
                prefix="Brief dự án"
              />

              <label className="text-sm">
                <span className="text-slate-700 font-medium mb-1 block">Follower tối thiểu</span>
                <input
                  className={field}
                  inputMode="numeric"
                  value={formatMoneyInput(briefForm.minFollowers || '')}
                  onChange={e => handleBriefChange('minFollowers', parseMoneyInput(e.target.value) || 0)}
                />
              </label>
              <label className="text-sm">
                <span className="text-slate-700 font-medium mb-1 block">Số KOL mục tiêu (đối chiếu)</span>
                <input
                  className={field}
                  type="number"
                  min={1}
                  value={briefForm.targetCount ?? ''}
                  onChange={e => handleBriefChange('targetCount', e.target.value === '' ? null : Number(e.target.value))}
                />
              </label>
              <label className="text-sm">
                <span className="text-slate-700 font-medium mb-1 block">Ngân sách chiến dịch (VND)</span>
                <input
                  className={field}
                  inputMode="numeric"
                  value={formatMoneyInput(briefForm.budget ?? '')}
                  onChange={e => {
                    const v = parseMoneyInput(e.target.value);
                    handleBriefChange('budget', v === '' ? null : v);
                  }}
                />
              </label>
              <label className="text-sm">
                <span className="text-slate-700 font-medium mb-1 block">Phạm vi hạng mục</span>
                <select
                  className={field}
                  value={briefForm.deliverableScope ?? 'campaign'}
                  onChange={e => handleBriefChange('deliverableScope', e.target.value)}
                >
                  <option value="campaign">Tổng toàn chiến dịch</option>
                  <option value="per_kol">Mỗi KOL thực hiện</option>
                </select>
              </label>
            </div>

            {/* Hạng mục 6 format */}
            <div className="rounded-xl border border-purple-100 bg-purple-50/30 p-3 space-y-2">
              <span className="text-xs font-semibold text-slate-700 block">Số lượng hạng mục chính (Creator/KOL)</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {formats.map(([key, label]) => (
                  <label key={key} className="text-xs">
                    <span className="text-slate-600 block mb-1">{label}</span>
                    <input
                      aria-label={'Số lượng brief ' + label}
                      className={field}
                      type="number"
                      min={0}
                      max={100000}
                      step={1}
                      value={(briefForm.deliverables ?? []).find((d: any) => d.format === key)?.quantity ?? ''}
                      onChange={e => {
                        const quantity = Number(e.target.value);
                        handleBriefChange('deliverables', [
                          ...(briefForm.deliverables ?? []).filter((d: any) => d.format !== key),
                          ...(quantity > 0 ? [{ format: key, quantity }] : []),
                        ]);
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* Thông tin mở rộng */}
            <BriefExtrasFields brief={briefForm} change={handleBriefChange} prefix="Brief dự án" />

            {canEdit && (
              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  className={button}
                  disabled={!briefDirty || briefSaving}
                  onClick={handleSaveBrief}
                >
                  {briefSaving ? 'Đang lưu…' : 'Lưu brief dự án'}
                </button>
                {briefDirty && <span className="text-xs text-amber-700 font-medium">Bạn có thay đổi chưa lưu</span>}
              </div>
            )}
          </fieldset>
        )}
      </div>

      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-lg">Bước 3 · Bóc tách phase & các phase triển khai ({phases.length})</h3>
          <button onClick={() => onSwitchTab('shortlist')} className="text-xs text-[#7C3AED] font-semibold hover:underline cursor-pointer">Quản lý Phase trong Danh sách</button>
        </div>

        <PhaseBreakdownBlock projectId={project.id} briefText={briefForm?.text ?? ''} canManage={canEdit} onCreated={() => setReloadKey(k => k + 1)} />
        {phases.length === 0 ? (
          <p className="text-sm text-slate-500 italic p-4 bg-slate-50 rounded-xl text-center">Chưa có Phase nào được khởi tạo. Bóc tách Phase bằng AI ở trên, hoặc tạo Phase thủ công ở tab Đối tác & Phase.</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {phases.map((ph: any, phIdx: number) => {
              const deliverableScope = ph.brief?.deliverableScope;
              const deliverables = ph.brief?.deliverables || [];
              const services = ph.brief?.services || [];
              return (
                <div key={ph.id} className="p-4 rounded-xl border border-purple-100 bg-purple-50/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <strong className="text-slate-900 font-bold text-base">Phase {phIdx + 1} · {ph.name}</strong>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-purple-100 text-purple-800">{ph.kind || 'phase'}</span>
                  </div>
                  {ph.description && <p className="text-xs text-slate-600 line-clamp-2">{ph.description}</p>}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs text-slate-500">{(data?.shortlist?.rows ?? []).filter((r: any) => r.phaseId === ph.id || (!r.phaseId && phases[0]?.id === ph.id)).length} đối tác trong danh sách cơ bản</span>
                    <button type="button" onClick={() => (onOpenPhase ? onOpenPhase(ph.id) : onSwitchTab('shortlist'))} className="text-xs text-[#7C3AED] font-semibold hover:underline cursor-pointer whitespace-nowrap">Mở phase này ở Đối tác & Phase →</button>
                  </div>
                  <div className="text-xs space-y-1 pt-2 border-t border-purple-100/60">
                    <div className="flex justify-between text-slate-500">
                      <span>Ngân sách dự kiến:</span>
                      <strong className="text-slate-700">{ph.budget ? formatVND(ph.budget) : 'Chưa đặt'}</strong>
                    </div>
                    {deliverables.length > 0 && (
                      <div className="pt-1">
                        <span className="text-slate-400 block font-medium">Hạng mục ({deliverableScope === 'campaign' ? 'Tổng phase' : 'Mỗi KOL'}):</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {deliverables.map((d: any) => (
                            <span key={d.format} className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[11px] text-slate-700">
                              {PRICE_FORMAT_LABELS[d.format as keyof typeof PRICE_FORMAT_LABELS] || d.format}: {d.quantity}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {services.length > 0 && (
                      <div className="pt-1">
                        <span className="text-slate-400 block font-medium">Dịch vụ bổ sung:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {services.map((s: any, idx: number) => (
                            <span key={idx} className="px-2 py-0.5 bg-sky-50 border border-sky-200 rounded text-[11px] text-sky-800">
                              {s.name}: {s.quantity} {s.unit || 'bài'}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>


    </div>
  );
}

function PnlBlock({ title, pnl }: { title: string; pnl: any }) {
  if (!pnl) return null;
  const money = (v: number | null | undefined) =>
    v === null || v === undefined ? 'Chưa xác định' : v.toLocaleString('vi-VN') + ' ₫';
  const rows: [string, number | null][] = [
    ['Doanh thu trước thuế (sau chiết khấu + agency fee)', pnl.revenueBeforeTax],
    ['G — Tổng NET KOL/Community', pnl.netG],
    ['Thuế cá nhân/HKD tính vào chi phí', pnl.costTax],
    ['Chi phí trực tiếp khác', pnl.otherDirectCosts],
    ['K — Tổng chi phí trước VAT (= G + thuế chi phí + chi phí khác)', pnl.totalK],
    ['VAT đầu vào công ty (tách riêng, không cộng K)', pnl.vatInput],
    ['L — Tổng phải chi đã biết (theo tổng dòng nguồn; = K + VAT khi phân loại đủ)', pnl.totalPayableL],
    ['Lợi nhuận (= Doanh thu trước thuế − K)', pnl.profit],
  ];
  return (
    <div className="border border-purple-100 rounded-2xl p-5 bg-white shadow-xs space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-100 pb-3">
        <h4 className="font-bold text-slate-800 text-base">{title}</h4>
        {pnl.complete ? (
          <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
            {pnl.hasEstimates ? 'Đầy đủ dữ liệu · có phần DỰ KIẾN' : 'Đầy đủ dữ liệu · đã chốt'}
          </span>
        ) : (
          <span className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
            Thiếu dữ liệu — chưa kết luận P&L đầy đủ
          </span>
        )}
      </div>
      <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between items-baseline gap-4 py-0.5 border-b border-slate-50">
            <span className="text-slate-600 text-xs sm:text-sm">{label}</span>
            <strong className="text-slate-900 font-semibold whitespace-nowrap text-right shrink-0">{money(value)}</strong>
          </div>
        ))}
        <div className="flex justify-between items-baseline gap-4 py-0.5 border-b border-slate-50">
          <span className="text-slate-600 text-xs sm:text-sm">Biên lợi nhuận</span>
          <strong className="text-slate-900 font-semibold whitespace-nowrap text-right shrink-0">
            {pnl.marginPercent === null || pnl.marginPercent === undefined
              ? 'Chưa xác định'
              : pnl.marginPercent.toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + '%'}
          </strong>
        </div>
        <div className="flex justify-between items-baseline gap-4 py-0.5 border-b border-slate-50">
          <span className="text-slate-600 text-xs sm:text-sm">Phần đã chốt theo hợp đồng (NET)</span>
          <strong className="text-slate-900 font-semibold whitespace-nowrap text-right shrink-0">{money(pnl.committed?.net ?? 0)}</strong>
        </div>
        <div className="flex justify-between items-baseline gap-4 py-0.5 border-b border-slate-50">
          <span className="text-slate-600 text-xs sm:text-sm">Phần dự kiến từ hồ sơ/tự xác nhận (NET)</span>
          <strong className="text-slate-900 font-semibold whitespace-nowrap text-right shrink-0">{money(pnl.estimated?.net ?? 0)}</strong>
        </div>
      </div>
      {pnl.unknownTax > 0 && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 p-2.5 rounded-xl">
          Có {money(pnl.unknownTax)} tiền thuế chưa phân loại — chưa cộng vào K (lợi nhuận chưa kết luận), nhưng tổng phải chi L vẫn tính đủ khoản này vì nó nằm trong tổng GROSS của nguồn chi phí.
        </p>
      )}
      {!pnl.complete && pnl.missingLines?.length > 0 && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 p-2.5 rounded-xl">
          Dòng thiếu dữ liệu: {pnl.missingLines.map((x: any) => `${x.creator} (${x.reason === 'no_source' ? 'chưa gắn nguồn chi phí' : x.reason === 'unknown_tax_category' ? 'chưa xác định loại thuế' : 'chưa có giá đầu vào'})`).join('; ')}. Chỉ cộng phần đã biết, không tự coi phần thiếu là 0.
        </p>
      )}
      <p className="text-xs text-slate-500 pt-1">
        Quy ước nghiệp vụ nội bộ: K không gồm VAT đầu vào công ty (tách riêng để dự trù dòng tiền ở L). Lợi nhuận không tính từ tiền đã trả.
      </p>
    </div>
  );
}

function ProjectFinancePnlPanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>('');
  // DG-2 (tinh gọn phần dự án): các khối phụ của P&L mặc định ĐÓNG, chỉ khối tổng mở sẵn.
  const [openCash, setOpenCash] = useState(false);
  const [openCompare, setOpenCompare] = useState(false);
  const [openDetail, setOpenDetail] = useState(false);

  useEffect(() => {
    let active = true;
    api(`/projects/${projectId}/pnl`)
      .then((res) => {
        if (active) {
          setData(res);
          setLoading(false);
          if (res.baseline?.quoteId) {
            setSelectedQuoteId(res.baseline.quoteId);
          } else {
            const firstVer = res.options?.[0]?.versions?.[0]?.quoteId;
            if (firstVer) setSelectedQuoteId(firstVer);
          }
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  if (loading) return <div className="p-6 text-slate-500">Đang tính toán P&L tài chính…</div>;
  if (error) return <div className="p-4 bg-red-50 text-red-700 rounded-xl">{error}</div>;

  const baseline = data?.baseline;
  const cash = data?.cash;
  const options = data?.options || [];
  const money = (v: number | null | undefined) =>
    v === null || v === undefined ? 'Chưa xác định' : v.toLocaleString('vi-VN') + ' ₫';

  // Gom mọi phiên bản để xem chi tiết
  const allVersions: any[] = options.flatMap((o: any) =>
    (o.versions || []).map((v: any) => ({ ...v, optionName: o.name, optionId: o.optionId }))
  );
  const currentVersion = allVersions.find((v) => v.quoteId === selectedQuoteId) || allVersions[0] || null;

  return (
    <div className="space-y-6">
      {baseline?.pnl && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Doanh thu trước thuế', value: baseline.pnl.revenueBeforeTax, cls: 'text-slate-900' },
            { label: 'Tổng chi phí (K)', value: baseline.pnl.totalK, cls: 'text-slate-900' },
            { label: 'Tổng phải trả (L)', value: baseline.pnl.totalPayableL, cls: 'text-slate-900' },
            { label: 'Lợi nhuận', value: baseline.pnl.profit, cls: (baseline.pnl.profit ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700' },
          ].map(card => (
            <div key={card.label} className="bg-white border border-purple-100 rounded-2xl px-4 py-3 shadow-xs">
              <p className="text-xs text-slate-500">{card.label}</p>
              <p className={'text-lg font-bold whitespace-nowrap ' + card.cls}>{money(card.value)}</p>
              <p className="text-[11px] text-slate-400">Theo phương án chốt {baseline.optionName} / V{baseline.number}</p>
            </div>
          ))}
        </div>
      )}
      {/* (a) P&L tổng dự án theo bản chốt */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-purple-700">Tổng dự án</span>
            <h3 className="text-xl font-bold text-slate-900">P&L tổng dự án — chỉ tính phương án khách chốt</h3>
          </div>
          {baseline && (
            <span className="px-3 py-1 bg-purple-100 text-purple-800 border border-purple-200 rounded-full text-xs font-bold">
              Baseline: {baseline.optionName} / V{baseline.number}
            </span>
          )}
        </div>

        {baseline ? (
          <PnlBlock title={`Phương án chốt: ${baseline.optionName} / V${baseline.number}`} pnl={baseline.pnl} />
        ) : (
          <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl text-sm">
            <p className="font-semibold">Chưa có phương án chốt — tổng dự án chưa kết luận.</p>
            <p className="text-xs text-amber-800 mt-1">
              Chọn một phương án ở bên dưới để xem P&L dự kiến của riêng phương án đó; các phương án song song là lựa chọn thay thế, không cộng dồn.
            </p>
          </div>
        )}

        {/* Khối tiền theo hợp đồng tách riêng — DG-2: mặc định thu gọn thành 1 thanh tóm tắt */}
        {cash && (
          <button type="button" className="w-full flex flex-wrap items-center justify-between gap-2 border border-purple-100 rounded-2xl px-5 py-3 bg-white shadow-xs text-sm cursor-pointer hover:bg-purple-50/40" aria-expanded={openCash} onClick={() => setOpenCash(v => !v)}>
            <span className="font-semibold text-slate-800">Tiền theo hợp đồng của dự án</span>
            <span className="text-slate-600">Đã trả <strong className="text-emerald-700">{money(cash.totals?.paid)}</strong> · Còn phải trả <strong className="text-amber-700">{money(cash.totals?.remaining)}</strong></span>
            <span className="text-indigo-700 underline text-xs font-semibold">{openCash ? 'Thu gọn' : 'Xem chi tiết'}</span>
          </button>
        )}
        {cash && openCash && (
          <div className="border border-purple-100 rounded-2xl p-5 bg-white shadow-xs space-y-3">
            <div className="border-b border-purple-100 pb-3">
              <h4 className="font-bold text-slate-900 text-base">
                Tiền theo hợp đồng của dự án (phạm vi riêng — không gộp vào chi phí phương án)
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Theo dõi dòng tiền thanh toán thực tế theo từng hợp đồng đã ký kết.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <div className="flex justify-between gap-4 py-0.5 border-b border-slate-50">
                <span className="text-slate-600">Tổng giá trị hợp đồng đã ký (tổng phải chi)</span>
                <strong className="text-slate-900">{money(cash.totals?.gross)}</strong>
              </div>
              <div className="flex justify-between gap-4 py-0.5 border-b border-slate-50">
                <span className="text-slate-600">Đã lên kế hoạch các đợt</span>
                <strong className="text-slate-900">{money(cash.totals?.planned)}</strong>
              </div>
              <div className="flex justify-between gap-4 py-0.5 border-b border-slate-50">
                <span className="text-slate-600">Đã trả</span>
                <strong className="text-emerald-700">{money(cash.totals?.paid)}</strong>
              </div>
              <div className="flex justify-between gap-4 py-0.5 border-b border-slate-50">
                <span className="text-slate-600">Còn phải trả (theo giá trị hợp đồng − đã trả)</span>
                <strong className="text-amber-700">{money(cash.totals?.remaining)}</strong>
              </div>
              <div className="flex justify-between gap-4 py-0.5 border-b border-slate-50">
                <span className="text-slate-600">Hợp đồng chưa lên kế hoạch đủ</span>
                <strong className="text-slate-900">{cash.totals?.missingPlan?.toLocaleString('vi-VN') ?? 0}</strong>
              </div>
              <div className="flex justify-between gap-4 py-0.5 border-b border-slate-50">
                <span className="text-slate-600">Hợp đồng chưa gắn vào phương án chốt</span>
                <strong className="text-slate-900">
                  {baseline
                    ? (cash.totals?.outsideSelectedCount?.toLocaleString('vi-VN') ?? 0) + ' (' + money(cash.totals?.outsideSelectedGross) + ')'
                    : 'Chưa có phương án chốt'}
                </strong>
              </div>
              <div className="flex justify-between gap-4 py-0.5 border-b border-slate-50">
                <span className="text-slate-600">Hợp đồng đã huỷ (tách riêng; không tính vào còn phải trả)</span>
                <strong className="text-slate-900">{cash.cancelled?.length?.toLocaleString('vi-VN') ?? 0}</strong>
              </div>
              <div className="flex justify-between gap-4 py-0.5 border-b border-slate-50">
                <span className="text-slate-600">Đã trả thuộc hợp đồng đã huỷ (vẫn hiện, chưa giả định hoàn tiền)</span>
                <strong className="text-slate-900">{money(cash.totals?.paidCancelled ?? 0)}</strong>
              </div>
              <div className="flex justify-between gap-4 py-0.5 border-b border-slate-50">
                <span className="text-slate-600">Hợp đồng còn nháp (chưa ký, chưa tính nghĩa vụ)</span>
                <strong className="text-slate-900">{cash.draftCount?.toLocaleString('vi-VN') ?? 0}</strong>
              </div>
              <div className="flex justify-between gap-4 py-0.5 border-b border-slate-50">
                <span className="text-slate-600">Đã trả thuộc hợp đồng nháp</span>
                <strong className="text-slate-900">{money(cash.totals?.paidDraft ?? 0)}</strong>
              </div>
              <div className="flex justify-between gap-4 py-0.5 border-b border-slate-50 sm:col-span-2">
                <span className="text-slate-600 font-semibold">Tổng đã trả mọi phạm vi (hiệu lực + huỷ + nháp)</span>
                <strong className="text-slate-900 font-bold">{money(cash.totals?.paidAll ?? 0)}</strong>
              </div>
            </div>
            <p className="text-xs text-slate-500 pt-1">
              Mỗi hợp đồng đếm đúng một lần theo dự án, không nhân theo dòng hay phương án. Đã trả chỉ để theo dõi dòng tiền — không dùng để suy ra lợi nhuận thực tế.
            </p>
          </div>
        )}
      </section>

      {/* (b) So sánh P&L giữa các phương án */}
      <section className="bg-white p-5 rounded-2xl border border-purple-100 shadow-xs space-y-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-purple-700">So sánh phương án</span>
          <h4 className="font-bold text-slate-900 text-lg">So sánh P&L giữa các phương án</h4>
          <p className="text-xs text-slate-500">
            Các phương án là lựa chọn thay thế (không cộng dồn). Bấm vào một phiên bản để xem chi tiết bên dưới.
          </p>
          <button type="button" className="text-sm text-indigo-700 underline cursor-pointer mt-1" aria-expanded={openCompare} onClick={() => setOpenCompare(v => !v)}>{openCompare ? 'Thu gọn so sánh' : 'Mở bảng so sánh'}</button>
        </div>
        <div className={openCompare ? '' : 'hidden'}>
        {options.length === 0 ? (
          <p className="text-xs text-slate-500 italic p-3 border rounded-xl">Dự án chưa có phương án nào.</p>
        ) : (
          <div className="overflow-x-auto border border-purple-100 rounded-2xl">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="text-left font-semibold px-4 py-2.5">Phiên bản</th>
                  <th className="text-left font-semibold px-4 py-2.5">Trạng thái</th>
                  <th className="text-right font-semibold px-4 py-2.5">Doanh thu</th>
                  <th className="text-right font-semibold px-4 py-2.5">Chi phí K</th>
                  <th className="text-right font-semibold px-4 py-2.5">Phải trả L</th>
                  <th className="text-right font-semibold px-4 py-2.5">Lợi nhuận</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {options.map((opt: any) => (
                  <React.Fragment key={opt.optionId}>
                    <tr className="bg-purple-50/50">
                      <td colSpan={7} className="px-4 py-2 font-bold text-slate-900">{opt.name} <span className="font-normal text-xs text-slate-500">· {opt.versions?.length || 0} phiên bản</span></td>
                    </tr>
                    {(opt.versions ?? []).map((ver: any) => {
                      const isSelected = ver.quoteId === currentVersion?.quoteId;
                      return (
                        <tr key={ver.quoteId} onClick={() => setSelectedQuoteId(ver.quoteId)} className={'border-t cursor-pointer ' + (isSelected ? 'bg-purple-50 ring-1 ring-inset ring-purple-300' : 'hover:bg-purple-50/30')}>
                          <td className="px-4 py-2.5 font-semibold text-slate-800 whitespace-nowrap">V{ver.number}{ver.isBaseline && <span className="ml-2 px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">★ PHƯƠNG ÁN CHỐT</span>}</td>
                          <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{ver.status}</td>
                          <td className="px-4 py-2.5 text-right whitespace-nowrap">{money(ver.pnl?.revenueBeforeTax)}</td>
                          <td className="px-4 py-2.5 text-right whitespace-nowrap">{money(ver.pnl?.totalK)}</td>
                          <td className="px-4 py-2.5 text-right whitespace-nowrap">{money(ver.pnl?.totalPayableL)}</td>
                          <td className={'px-4 py-2.5 text-right font-bold whitespace-nowrap ' + ((ver.pnl?.profit ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700')}>{money(ver.pnl?.profit)}</td>
                          <td className="px-4 py-2.5 text-purple-700 font-semibold text-xs underline whitespace-nowrap">{isSelected ? 'Đang xem' : 'Xem chi tiết'}</td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </div>
      </section>

      {/* (c) Xem chi tiết P&L của từng phiên bản báo giá */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-purple-700">Chi tiết phiên bản</span>
            <h4 className="font-bold text-slate-900 text-lg">Xem chi tiết P&L từng phiên bản báo giá</h4>
          </div>
          {allVersions.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="pnl-version-select" className="text-xs font-semibold text-slate-600">
                Chọn phiên bản:
              </label>
              <select
                id="pnl-version-select"
                aria-label="Chọn phiên bản báo giá để xem P&L"
                className="rounded-xl border border-purple-200 px-3 py-1.5 bg-white text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-purple-400"
                value={currentVersion?.quoteId || ''}
                onChange={(e) => setSelectedQuoteId(e.target.value)}
              >
                {allVersions.map((v) => (
                  <option key={v.quoteId} value={v.quoteId}>
                    {v.optionName} — V{v.number} ({v.status}) {v.isBaseline ? '★ Baseline' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          {currentVersion && (
            <button type="button" className="text-sm text-indigo-700 underline cursor-pointer" aria-expanded={openDetail} onClick={() => setOpenDetail(v => !v)}>{openDetail ? 'Thu gọn chi tiết' : 'Xem chi tiết'}</button>
          )}
        </div>

        {currentVersion ? (
          openDetail ? (
          <PnlBlock
            title={`Chi tiết P&L — ${currentVersion.optionName} / V${currentVersion.number}`}
            pnl={currentVersion.pnl}
          />
          ) : null
        ) : (
          <p className="text-xs text-slate-500 italic p-4 bg-white border border-dashed rounded-xl">
            Chưa có phiên bản báo giá nào để hiển thị chi tiết P&L.
          </p>
        )}
      </section>
    </div>
  );
}

export default function WorkspaceShell() {
  const [user, setUser] = useState<User | null>(null);
  const [setup, setSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  // Shell Menu & Top Navigation State
  const [page, setPage] = useState<'projects' | 'partners' | 'proposal' | 'users' | 'legacy' | 'communities'>('projects');
  const [partnerSubTab, setPartnerSubTab] = useState<'community' | 'kol'>('kol');
  const [showArchiveModule, setShowArchiveModule] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  // Core Data
  const [projects, setProjects] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [roles, setRoles] = useState('booking');
  const [proposalTarget, setProposalTarget] = useState<{ projectId: string; phaseId: string } | null>(null);

  // Workspace Shared Context & Dirty State
  const [activePhaseId, setActivePhaseId] = useState<string>('');
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);

  // 5-Tab Project Workspace View
  const [projectView, setProjectView] = useState<'overview' | 'shortlist' | 'quotes' | 'contracts' | 'pnl'>('overview');

  useEffect(() => {
    (async () => {
      try {
        const status = await api('/auth/status');
        setSetup(status.needsSetup);
        if (!status.needsSetup) {
          try {
            setUser((await api('/auth/me')).user);
          } catch {
            setUser(null);
          }
        }
      } catch {
        setError('Không kết nối được máy chủ. Vui lòng thử tải lại trang.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const expired = () => {
      setUser(null);
      setSelected(null);
      setMembers([]);
      setProjects([]);
      setUsers([]);
      setPage('projects');
    };
    window.addEventListener('workspace_session_expired', expired);
    return () => window.removeEventListener('workspace_session_expired', expired);
  }, []);

  async function refresh() {
    const next = (await api('/projects')).projects;
    setProjects(next);
    setSelected((prev: any) => (prev ? next.find((p: any) => p.id === prev.id) ?? null : null));
    if (user?.role === 'admin') setUsers((await api('/users')).users);
  }

  useEffect(() => {
    if (user && !user.mustChangePassword) refresh().catch((e) => setError(e.message));
  }, [user]);

  function handleNavigateWithGuard(navFn: () => void) {
    if (isDirty) {
      if (window.confirm('Bạn có thay đổi chưa lưu. Bạn có chắc muốn chuyển trang và bỏ qua thay đổi dở dang?')) {
        setIsDirty(false);
        navFn();
      } else {
        return;
      }
    } else {
      navFn();
    }
  }

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể thực hiện.');
    } finally {
      setBusy(false);
    }
  }

  const feedback = (
    <>
      {error && <div role="alert" className="mb-4 rounded-xl bg-red-50 border border-red-200 p-3 text-red-700 text-sm font-medium">{error}</div>}
      {notice && <div role="status" className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-emerald-800 text-sm font-medium">{notice}</div>}
    </>
  );

  if (loading) return <div className="min-h-screen grid place-items-center bg-[#F5F3FF] text-slate-700 font-medium">Đang tải không gian làm việc…</div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F5F3FF] flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-purple-100 rounded-3xl p-8 shadow-md space-y-4">
          <div className="text-[#7C3AED] text-sm font-extrabold tracking-wider">KOL BOOKING MANAGER</div>
          <h1 className="text-2xl font-bold text-slate-900">{setup ? 'Khởi tạo quản trị viên' : 'Chào mừng trở lại'}</h1>
          <p className="text-slate-500 text-sm">{setup ? 'Tạo Admin đầu tiên cho không gian làm việc của bạn.' : 'Đăng nhập để quản lý dự án và cộng tác cùng nhóm.'}</p>
          {feedback}
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(async () => {
                const body = Object.fromEntries(f);
                if (setup) {
                  await api('/auth/setup', body);
                  setSetup(false);
                  setNotice('Đã tạo Admin. Hãy đăng nhập bằng tài khoản vừa tạo.');
                } else {
                  setUser((await api('/auth/login', body)).user);
                }
              });
            }}
          >
            {setup && (
              <>
                <label className="block text-sm font-medium text-slate-700">
                  Tên của bạn
                  <input required name="name" autoComplete="name" className={field} />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Mã khởi tạo
                  <input required name="code" autoComplete="off" className={field} />
                </label>
                <p className="text-xs text-slate-500">Mã nằm trong file .local/setup-code.txt của thư mục app. Chỉ cần dùng khi tạo Admin đầu tiên.</p>
              </>
            )}
            <label className="block text-sm font-medium text-slate-700">
              Email
              <input required type="email" name="email" autoComplete="username" className={field} />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Mật khẩu
              <input required type="password" name="password" minLength={setup ? 12 : undefined} maxLength={128} autoComplete={setup ? 'new-password' : 'current-password'} className={field} />
            </label>
            <button disabled={busy} className={button + ' w-full'}>
              {busy ? 'Đang xử lý…' : setup ? 'Tạo Admin đầu tiên' : 'Đăng nhập'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const passwordModal = (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white p-6 rounded-3xl border border-purple-100 max-w-md w-full shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Đổi mật khẩu</h2>
          <button type="button" onClick={() => setShowPasswordModal(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">✕</button>
        </div>
        <p className="text-xs text-slate-500">Sau khi đổi mật khẩu, phiên làm việc hiện tại trên các thiết bị khác sẽ tự động đăng xuất.</p>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.currentTarget));
            run(async () => {
              await api('/auth/password', data);
              setUser(null);
              setShowPasswordModal(false);
              setNotice('Đã đổi mật khẩu thành công. Vui lòng đăng nhập lại.');
            });
          }}
        >
          <label className="block text-sm font-medium text-slate-700">
            Mật khẩu hiện tại
            <input type="password" name="currentPassword" required maxLength={128} autoComplete="current-password" className={field} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Mật khẩu mới (ít nhất 12 ký tự)
            <input type="password" name="newPassword" required minLength={12} maxLength={128} autoComplete="new-password" className={field} />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowPasswordModal(false)} className={buttonSecondary}>Hủy</button>
            <button className={button} disabled={busy}>Lưu mật khẩu mới</button>
          </div>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F5F3FF] text-[#0F172A] flex flex-col font-sans selection:bg-purple-500 selection:text-white">
      {/* Top Shell Menu Navigation */}
      <header className="bg-white border-b border-purple-100 px-6 py-3 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-40 shadow-xs">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-[#7C3AED] text-white font-black flex items-center justify-center text-lg shadow-xs">K</div>
            <div>
              <div className="font-extrabold text-base text-[#7C3AED] leading-tight">Booking Manager</div>
              <p className="text-[10px] text-slate-500 font-medium">Quản lý booking KOL & Community</p>
            </div>
          </div>

          {!user.mustChangePassword && (
            <nav className="flex items-center gap-1 bg-purple-50/60 p-1 rounded-2xl border border-purple-100/60">
              <button
                onClick={() => handleNavigateWithGuard(() => setPage('projects'))}
                className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all cursor-pointer ${
                  page === 'projects' ? 'bg-[#7C3AED] text-white shadow-xs' : 'text-slate-600 hover:text-purple-700 hover:bg-purple-100/50'
                }`}
              >
                Dự án
              </button>
              <button
                onClick={() => handleNavigateWithGuard(() => setPage('partners'))}
                className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all cursor-pointer ${
                  page === 'partners' || page === 'communities' ? 'bg-[#7C3AED] text-white shadow-xs' : 'text-slate-600 hover:text-purple-700 hover:bg-purple-100/50'
                }`}
              >
                Kho đối tác
              </button>
              {user.role === 'admin' && (
                <button
                  onClick={() => handleNavigateWithGuard(() => setPage('users'))}
                  className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all cursor-pointer ${
                    page === 'users' ? 'bg-[#7C3AED] text-white shadow-xs' : 'text-slate-600 hover:text-purple-700 hover:bg-purple-100/50'
                  }`}
                >
                  Tài khoản
                </button>
              )}
              {/* Tương thích ngược: Kho Community đã được gộp trong Kho đối tác */}
              {false && (
                <button onClick={() => setPage('communities')}>Kho Community</button>
              )}
              {/* Tương thích ngược: Đề xuất KOL đã được chuyển vào tab Đối tác & Phase của dự án */}
              {false && (
                <button onClick={() => setPage('proposal')}>Đề xuất KOL</button>
              )}
            </nav>
          )}
        </div>

        {/* User Profile Dropdown Menu */}
        <div className="relative">
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2.5 p-1.5 pl-3 rounded-2xl border border-purple-100 bg-purple-50/40 hover:bg-purple-50 transition-colors cursor-pointer"
          >
            <div className="text-right">
              <strong className="text-xs font-bold text-slate-800 block leading-tight">{user.name}</strong>
              <span className="text-[10px] font-semibold text-purple-700 bg-purple-100 px-1.5 py-0.2 rounded-md">
                {user.role === 'admin' ? 'Admin Global' : 'PM / Booking'}
              </span>
            </div>
            <div className="w-8 h-8 rounded-xl bg-[#7C3AED] text-white font-bold text-xs flex items-center justify-center shadow-xs">
              {user.name.charAt(0).toUpperCase()}
            </div>
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-white border border-purple-100 rounded-2xl shadow-lg p-2 z-50 space-y-1">
              <div className="px-3 py-2 border-b border-purple-50">
                <p className="text-xs font-bold text-slate-800">{user.name}</p>
                <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowProfileMenu(false);
                  setShowPasswordModal(true);
                }}
                className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-purple-50 rounded-xl transition-colors cursor-pointer flex items-center gap-2"
              >
                🔑 Đổi mật khẩu
              </button>
              <button
                type="button"
                onClick={() =>
                  run(async () => {
                    await api('/auth/logout', {});
                    setUser(null);
                    setSelected(null);
                    setProjects([]);
                    setUsers([]);
                    setMembers([]);
                    setShowProfileMenu(false);
                  })
                }
                className="w-full text-left px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer flex items-center gap-2"
              >
                🚪 Đăng xuất
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {feedback}

        {user.mustChangePassword ? (
          <div className="max-w-md mx-auto bg-white p-6 rounded-3xl border border-purple-100 shadow-sm space-y-4">
            <h2 className="text-xl font-bold text-slate-900">Đổi mật khẩu lần đầu</h2>
            <p className="text-sm text-slate-500">Bạn cần đổi mật khẩu được cấp trước khi tiếp tục sử dụng hệ thống.</p>
            {passwordModal}
          </div>
        ) : page === 'proposal' ? (
          <div className="p-8 bg-white rounded-3xl border border-purple-100 shadow-sm space-y-4 text-center max-w-xl mx-auto">
            <h2 className="text-xl font-bold text-slate-900">Đề xuất đối tác trong Dự án</h2>
            <p className="text-sm text-slate-600">
              Chức năng Đề xuất đối tác đã được tích hợp trực tiếp vào tab <strong>Đối tác & Phase</strong> trong từng dự án theo ngữ cảnh phase đang chọn.
            </p>
            <button
              onClick={() => {
                if (proposalTarget?.projectId) {
                  const pr = projects.find((x: any) => x.id === proposalTarget.projectId);
                  if (pr) {
                    setSelected(pr);
                    if (proposalTarget.phaseId) setActivePhaseId(proposalTarget.phaseId);
                  }
                }
                setProjectView('shortlist');
                setPage('projects');
              }}
              className={button}
            >
              Vào tab Đối tác & Phase của dự án
            </button>
          </div>
        ) : page === 'partners' ? (
          <PartnerCatalogManager isAdmin={user.role === 'admin'} initialTab={partnerSubTab} />
        ) : page === 'communities' ? (
          <PartnerCatalogManager isAdmin={user.role === 'admin'} initialTab="community" />
        ) : page === 'legacy' && user.role === 'admin' ? (
          <div className="space-y-4">
            <p className="px-6 py-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl text-sm font-medium">
              Dữ liệu KOL và SOW cũ trên trình duyệt ở chế độ chỉ đọc. Chỉ Admin được mở module này trong giai đoạn chuyển đổi.
            </p>
            <App readOnly={true} />
          </div>
        ) : page === 'users' && user.role === 'admin' ? (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-3xl border border-purple-100 shadow-xs space-y-4">
              <h1 className="text-2xl font-bold text-slate-900">Quản lý Tài khoản & Quyền hạn</h1>
              <p className="text-sm text-slate-500">Tạo tài khoản Admin công ty hoặc Thành viên. Phân công PM / Booking chi tiết theo từng dự án.</p>

              <form
                className="bg-purple-50/40 p-5 rounded-2xl border border-purple-100 grid sm:grid-cols-2 gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const body = Object.fromEntries(new FormData(form));
                  run(async () => {
                    await api('/users', body);
                    form.reset();
                    await refresh();
                    setNotice('Đã tạo tài khoản thành công.');
                  });
                }}
              >
                <input aria-label="Tên thành viên" name="name" required placeholder="Tên thành viên" className={field} />
                <input aria-label="Email thành viên" name="email" type="email" required placeholder="Email" className={field} />
                <input
                  aria-label="Mật khẩu cấp ban đầu"
                  name="password"
                  type="password"
                  minLength={12}
                  maxLength={128}
                  required
                  placeholder="Mật khẩu ban đầu (≥ 12 ký tự)"
                  autoComplete="new-password"
                  className={field}
                />
                <select aria-label="Vai trò toàn công ty" name="role" className={field}>
                  <option value="member">Thành viên (PM / Booking theo dự án)</option>
                  <option value="admin">Admin công ty (Toàn quyền)</option>
                </select>
                <button className={button} disabled={busy}>Tạo tài khoản</button>
              </form>

              <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
                {users.map((u) => (
                  <div key={u.id} className="p-4 flex items-center justify-between gap-3">
                    <div>
                      <strong className="text-sm text-slate-900 font-bold block">{u.name}</strong>
                      <span className="text-xs text-slate-500">{u.email}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-50 text-purple-700">
                        {u.role === 'admin' ? 'Admin Global' : 'Thành viên'} · {u.active ? 'Đang hoạt động' : 'Đã khóa'}
                      </span>
                      <button
                        className="text-xs text-purple-700 hover:underline font-semibold cursor-pointer"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await api(`/users/${u.id}/active`, { active: !u.active });
                            if (u.id === user.id) setUser(null);
                            else await refresh();
                            setNotice('Đã cập nhật trạng thái tài khoản.');
                          })
                        }
                      >
                        {u.active ? 'Khóa' : 'Mở khóa'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* M9: Khu Lưu trữ / Dữ liệu cũ chỉ đọc dành riêng cho Admin trong Quản trị */}
            <div className="bg-white p-6 rounded-3xl border border-amber-200 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-100 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 uppercase tracking-wider">
                      Lưu trữ / Dữ liệu cũ
                    </span>
                    <span className="text-xs text-slate-500 font-medium">Chế độ chỉ đọc (Read-Only)</span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 mt-1">Khu Lưu trữ & Báo giá SOW cũ</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Gom các module cũ (báo giá SOW cũ, dashboard KOL cũ, dữ liệu trình duyệt chưa chuyển đổi). Chỉ Admin tra cứu và chuyển đổi lên kho chính thức. Toàn bộ đường ghi mới đều bị chặn.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowArchiveModule(!showArchiveModule)}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
                >
                  {showArchiveModule ? 'Thu gọn Khu Lưu trữ' : 'Mở Khu Lưu trữ (Chỉ đọc)'}
                </button>
              </div>

              {showArchiveModule && (
                <div className="pt-2">
                  <App readOnly={true} />
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Projects Scope: Workspace 5-Tab Area */
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-extrabold text-slate-900">Dự án của bạn</h1>
                <p className="text-xs text-slate-500">
                  {user.role === 'admin'
                    ? 'Admin Global: Hiển thị và quản lý toàn bộ các dự án trong công ty.'
                    : 'Chỉ hiển thị các dự án bạn được phân công tham gia (Project Scope).'}
                </p>
              </div>

              {/* Admin Create Project Form */}
              {user.role === 'admin' && (
                <form
                  className="flex flex-wrap gap-2 items-center"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const body = Object.fromEntries(new FormData(form));
                    run(async () => {
                      const res = await api('/projects', body);
                      form.reset();
                      await refresh();
                      setNotice('Đã tạo dự án mới thành công. Bạn có thể phân công PM / Booking ngay.');
                    });
                  }}
                >
                  <input name="client" required aria-label="Khách hàng dự án mới" placeholder="Khách hàng / Nhãn hàng" className={field + ' sm:w-48'} />
                  <input name="campaign" required aria-label="Chiến dịch dự án mới" placeholder="Tên chiến dịch" className={field + ' sm:w-48'} />
                  <input name="name" required aria-label="Tên dự án mới" placeholder="Tên dự án" className={field + ' sm:w-48'} />
                  <button disabled={busy} className={button + ' whitespace-nowrap'}>+ Tạo dự án mới</button>
                </form>
              )}
            </div>

            <div className="grid lg:grid-cols-4 gap-6">
              {/* Project List Sidebar */}
              <aside className="space-y-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block px-1">Danh sách dự án ({projects.length})</span>
                {projects.length === 0 && (
                  <p className="p-6 bg-white rounded-2xl border border-purple-100 text-xs text-slate-500 text-center">
                    {user.role === 'admin' ? 'Chưa có dự án nào. Hãy tạo dự án đầu tiên ở trên.' : 'Bạn chưa được phân công vào dự án nào.'}
                  </p>
                )}
                {projects.map((p) => (
                  <button
                    key={p.id}
                    className={`w-full text-left rounded-2xl border p-4 transition-all cursor-pointer ${
                      selected?.id === p.id
                        ? 'border-[#7C3AED] bg-purple-50/80 ring-2 ring-purple-300/50 shadow-xs'
                        : 'border-purple-100/80 bg-white hover:border-purple-200 hover:bg-purple-50/30'
                    }`}
                    onClick={() =>
                      handleNavigateWithGuard(() =>
                        run(async () => {
                          setMembers([]);
                          setSelected(p);
                          setProjectView('overview');
                          setMembers((await api(`/projects/${p.id}/members`)).members);
                        })
                      )
                    }
                  >
                    <div className="flex items-center justify-between">
                      <strong className="text-slate-900 font-bold text-sm block leading-snug">{p.name}</strong>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Khách hàng: {p.client_name || 'Chưa điền'}</p>
                    <div className="mt-2 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Chiến dịch: {p.campaign_name || p.name}</span>
                      <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-semibold">
                        {p.canManage ? 'PM / Admin' : 'Booking'}
                      </span>
                    </div>
                  </button>
                ))}
              </aside>

              {/* Active Project Workspace 5-Tab Content */}
              <section className="lg:col-span-3 min-w-0">
                {selected ? (
                  <div className="bg-white p-6 border border-purple-100 rounded-3xl shadow-xs space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-purple-100 pb-4">
                      <div>
                        <h2 className="text-2xl font-bold text-slate-900">{selected.name}</h2>
                        <p className="text-xs text-slate-500">Khách hàng: <strong>{selected.client_name || '—'}</strong> • Chiến dịch: <strong>{selected.campaign_name || '—'}</strong></p>
                      </div>

                      {/* Phân công thành viên Modal Trigger */}
                      {selected.canManage && (
                        <details className="relative">
                          <summary className="text-xs font-semibold px-3 py-2 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 cursor-pointer">
                            👥 Phân công PM / Booking ({members.length})
                          </summary>
                          <div className="absolute right-0 mt-2 w-80 bg-white border border-purple-100 rounded-2xl shadow-xl p-4 z-50 space-y-3">
                            <h4 className="font-bold text-sm text-slate-900">Gán nhiều PM & Booking</h4>
                            <form
                              className="space-y-3 text-xs"
                              onSubmit={(e) => {
                                e.preventDefault();
                                const form = e.currentTarget;
                                const data = new FormData(form);
                                run(async () => {
                                  await api(`/projects/${selected.id}/members`, {
                                    email: data.get('email'),
                                    role: data.get('role'),
                                    duties: data.getAll('duties'),
                                  });
                                  setMembers((await api(`/projects/${selected.id}/members`)).members);
                                  form.reset();
                                  setNotice('Đã thêm vai trò và phân công cho thành viên.');
                                });
                              }}
                            >
                              <ProjectMemberPicker key={selected.id} projectId={selected.id} />
                              <select name="role" value={roles} onChange={(e) => setRoles(e.target.value)} aria-label="Vai trò dự án" className={field}>
                                <option value="booking">Booking</option>
                                {user.role === 'admin' && <option value="pm">PM</option>}
                              </select>
                              <div className="space-y-1">
                                {['pricing', 'paperwork', 'creator_support'].map((d) => (
                                  <label key={d} className="flex items-center gap-2 text-slate-700">
                                    <input type="checkbox" name="duties" value={d} />
                                    {labels[d]}
                                  </label>
                                ))}
                              </div>
                              <button disabled={busy} className={button + ' w-full text-xs'}>Phân công</button>
                            </form>
                            <div className="border-t border-slate-100 pt-2 divide-y max-h-48 overflow-y-auto">
                              {members.map((m) => (
                                <div key={m.id} className="py-2 flex items-center justify-between text-xs">
                                  <div>
                                    <strong className="block text-slate-800">{m.display_name}</strong>
                                    <span className="text-[10px] text-slate-500">{m.email} · {m.roles?.join(', ')}</span>
                                  </div>
                                  <button
                                    className="text-red-600 hover:underline cursor-pointer"
                                    onClick={() =>
                                      run(async () => {
                                        await api(`/projects/${selected.id}/members/${m.id}/remove`, {});
                                        setMembers((await api(`/projects/${selected.id}/members`)).members);
                                      })
                                    }
                                  >
                                    Gỡ
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        </details>
                      )}
                    </div>

                    {/* 5 Tabs Workspace Navigation */}
                    <nav className="flex flex-wrap gap-2 border-b border-purple-100 pb-3">
                      <button
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          projectView === 'overview' ? 'bg-[#7C3AED] text-white shadow-xs' : 'bg-purple-50/50 text-slate-700 hover:bg-purple-100/60'
                        }`}
                        onClick={() => handleNavigateWithGuard(() => setProjectView('overview'))}
                      >
                        Tổng quan
                      </button>
                      <button
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          projectView === 'shortlist' ? 'bg-[#7C3AED] text-white shadow-xs' : 'bg-purple-50/50 text-slate-700 hover:bg-purple-100/60'
                        }`}
                        onClick={() => handleNavigateWithGuard(() => setProjectView('shortlist'))}
                      >
                        Đối tác & Phase
                      </button>
                      <button
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          projectView === 'quotes' ? 'bg-[#7C3AED] text-white shadow-xs' : 'bg-purple-50/50 text-slate-700 hover:bg-purple-100/60'
                        }`}
                        onClick={() => handleNavigateWithGuard(() => setProjectView('quotes'))}
                      >
                        Phương án & Báo giá
                      </button>
                      <button
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          projectView === 'contracts' ? 'bg-[#7C3AED] text-white shadow-xs' : 'bg-purple-50/50 text-slate-700 hover:bg-purple-100/60'
                        }`}
                        onClick={() => handleNavigateWithGuard(() => setProjectView('contracts'))}
                      >
                        Hợp đồng & Thanh toán
                      </button>

                      {/* Tab 5: Financials & P&L - Strictly PM & Admin Scope */}
                      {(user.role === 'admin' || selected.canManage) && (
                        <button
                          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            projectView === 'pnl' ? 'bg-[#7C3AED] text-white shadow-xs' : 'bg-purple-50/50 text-slate-700 hover:bg-purple-100/60'
                          }`}
                          onClick={() => handleNavigateWithGuard(() => setProjectView('pnl'))}
                        >
                          Tài chính & P&L
                        </button>
                      )}
                    </nav>

                    {/* Tab Views Content */}
                    {projectView === 'overview' && (
                      <ProjectOverviewPanel project={selected} members={members} isAdmin={user.role === 'admin'} onSwitchTab={(tab) => handleNavigateWithGuard(() => setProjectView(tab))} onProjectChanged={refresh} onOpenPhase={(phaseId) => handleNavigateWithGuard(() => { setActivePhaseId(phaseId); setProjectView('shortlist'); })} />
                    )}
                    {projectView === 'shortlist' && (
                      <ProjectShortlistPanel
                        key={selected.id}
                        projectId={selected.id}
                        activePhaseIdProp={activePhaseId}
                        onPhaseChange={setActivePhaseId}
                        onDirtyChange={setIsDirty}
                        onOpenQuotes={() => handleNavigateWithGuard(() => setProjectView('quotes'))}
                        onOpenOverview={() => handleNavigateWithGuard(() => setProjectView('overview'))}
                        onOpenProposal={(phaseId) => {
                          setActivePhaseId(phaseId);
                          setProjectView('shortlist');
                        }}
                      />
                    )}
                    {projectView === 'quotes' && (
                      <ProjectQuotesPanel key={selected.id} projectId={selected.id} isAdmin={user.role === 'admin'} onProjectChanged={refresh} onDirtyChange={setIsDirty} />
                    )}
                    {projectView === 'contracts' && <ProjectContractsPanel key={selected.id} projectId={selected.id} />}
                    {projectView === 'pnl' && (
                      user.role === 'admin' || selected.canManage ? (
                        <ProjectFinancePnlPanel key={selected.id} projectId={selected.id} />
                      ) : (
                        <div className="p-6 bg-red-50 border border-red-200 text-red-800 rounded-2xl text-sm font-medium">
                          Bạn không có quyền truy cập tab Tài chính & P&L. Chỉ Admin và Quản lý dự án (PM) mới có quyền xem thông tin tài chính này.
                        </div>
                      )
                    )}
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-purple-200/80 rounded-3xl p-16 text-center text-slate-500 bg-white/50">
                    <p className="text-sm font-semibold">Chọn một dự án ở danh sách bên trái để mở không gian làm việc 5 tab.</p>
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-purple-100 bg-white py-4 text-center text-xs text-slate-500">
        <p>© 2026 KOL Booking Manager</p>
      </footer>

      {showPasswordModal && passwordModal}
    </div>
  );
}
