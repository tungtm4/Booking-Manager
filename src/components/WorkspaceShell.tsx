import React, { useEffect, useState } from 'react';
import { ProjectShortlistPanel } from './ProjectShortlistPanel';
import { CommunityManager } from './CommunityManager';
import { ProjectProposal } from './ProjectProposal';
import { ProjectQuotesPanel } from './ProjectQuotesPanel';
import { ProjectContractsPanel } from './ProjectContractsPanel';
import { ProjectMemberPicker } from './ProjectMemberPicker';
import App from '../App';
import { formatVND } from '../utils/formatters';
import { PRICE_FORMAT_LABELS } from '../types/kol';

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

function ProjectOverviewPanel({ project, members, isAdmin, onSwitchTab }: { project: any; members: any[]; isAdmin: boolean; onSwitchTab: (tab: any) => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
  }, [project.id]);

  if (loading) return <div className="p-6 text-slate-500">Đang tải thông tin tổng quan dự án…</div>;
  if (error) return <div className="p-4 bg-red-50 text-red-700 rounded-xl">{error}</div>;

  const brief = data?.shortlist?.brief || {};
  const phases = data?.phases || [];
  const options = data?.options || [];
  const contracts = data?.contracts || [];
  const shortlistRows = data?.shortlist?.rows || [];

  // Tính việc cần làm (To-Do) từ DỮ LIỆU THẬT
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
      {/* 1. Thông tin chung & Brief */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white p-5 rounded-2xl border border-purple-100 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-lg">Thông tin chiến dịch & Khách hàng</h3>
            <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-purple-50 text-purple-700 border border-purple-200">
              {project.canManage ? 'PM / Quản lý' : 'Booking'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-slate-400 text-xs block font-medium">Khách hàng / Nhãn hàng</span>
              <strong className="text-slate-800">{project.client_name || 'Chưa cập nhật'}</strong>
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-medium">Tên chiến dịch</span>
              <strong className="text-slate-800">{project.campaign_name || project.name}</strong>
            </div>
          </div>
          {brief.text && (
            <div className="pt-2 border-t border-slate-100">
              <span className="text-slate-400 text-xs block font-medium mb-1">Brief chiến dịch</span>
              <p className="text-sm text-slate-700 whitespace-pre-line line-clamp-4 bg-purple-50/50 p-3 rounded-xl border border-purple-100/50">{brief.text}</p>
            </div>
          )}
        </div>

        {/* 2. To-Do Tasks từ dữ liệu thật */}
        <div className="bg-white p-5 rounded-2xl border border-amber-200/80 shadow-sm space-y-3">
          <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
            Việc cần làm
          </h3>
          <ul className="space-y-2 text-sm">
            {missingPriceRows.length > 0 && (
              <li className="flex items-center justify-between p-2.5 bg-amber-50/80 rounded-xl text-amber-900 text-xs font-medium border border-amber-200/50">
                <span>⚠️ {missingPriceRows.length} đối tác trong danh sách sơ bộ chưa có giá đầu vào.</span>
                <button onClick={() => onSwitchTab('shortlist')} className="text-purple-700 underline font-semibold ml-2">Xử lý ngay</button>
              </li>
            )}
            {unconfirmedPriceRows.length > 0 && (
              <li className="flex items-center justify-between p-2.5 bg-amber-50/80 rounded-xl text-amber-900 text-xs font-medium border border-amber-200/50">
                <span>⚠️ {unconfirmedPriceRows.length} đối tác có giá chưa xác nhận nguồn.</span>
                <button onClick={() => onSwitchTab('shortlist')} className="text-purple-700 underline font-semibold ml-2">Xác nhận</button>
              </li>
            )}
            {draftQuotes.length > 0 && (
              <li className="flex items-center justify-between p-2.5 bg-blue-50/80 rounded-xl text-blue-900 text-xs font-medium border border-blue-200/50">
                <span>📄 {draftQuotes.length} bản nháp phương án/báo giá đang chờ hoàn thiện/gửi duyệt.</span>
                <button onClick={() => onSwitchTab('quotes')} className="text-purple-700 underline font-semibold ml-2">Xem phương án</button>
              </li>
            )}
            {pendingContractApprovals.length > 0 && (
              <li className="flex items-center justify-between p-2.5 bg-purple-50/80 rounded-xl text-purple-900 text-xs font-medium border border-purple-200/50">
                <span>📑 {pendingContractApprovals.length} hợp đồng chưa trình ký hoặc chờ đối tác chốt.</span>
                <button onClick={() => onSwitchTab('contracts')} className="text-purple-700 underline font-semibold ml-2">Xem hợp đồng</button>
              </li>
            )}
            {missingPriceRows.length === 0 && unconfirmedPriceRows.length === 0 && draftQuotes.length === 0 && pendingContractApprovals.length === 0 && (
              <li className="p-4 text-center text-slate-500 bg-slate-50 rounded-xl text-xs">Mọi công việc cơ bản đã hoàn thành tốt!</li>
            )}
          </ul>
        </div>
      </div>

      {/* 3. Phases 2 Tầng hợp lệ */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-lg">Các Phase triển khai ({phases.length})</h3>
          <button onClick={() => onSwitchTab('shortlist')} className="text-xs text-[#7C3AED] font-semibold hover:underline">Quản lý Phase trong Danh sách</button>
        </div>

        {phases.length === 0 ? (
          <p className="text-sm text-slate-500 italic p-4 bg-slate-50 rounded-xl text-center">Chưa có Phase nào được khởi tạo. Bạn có thể bóc tách Phase bằng AI hoặc tạo Phase thủ công ở Tab Đối tác.</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {phases.map((ph: any) => {
              const deliverableScope = ph.brief?.deliverableScope;
              const deliverables = ph.brief?.deliverables || [];
              const services = ph.brief?.services || [];
              return (
                <div key={ph.id} className="p-4 rounded-xl border border-purple-100 bg-purple-50/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <strong className="text-slate-900 font-bold text-base">{ph.name}</strong>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-purple-100 text-purple-800">{ph.kind || 'phase'}</span>
                  </div>
                  {ph.description && <p className="text-xs text-slate-600 line-clamp-2">{ph.description}</p>}
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

      {/* 4. Thành viên dự án */}
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
    </div>
  );
}

function ProjectFinancePnlPanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api(`/projects/${projectId}/pnl`)
      .then((res) => {
        if (active) {
          setData(res);
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
  }, [projectId]);

  if (loading) return <div className="p-6 text-slate-500">Đang tính toán P&L tài chính…</div>;
  if (error) return <div className="p-4 bg-red-50 text-red-700 rounded-xl">{error}</div>;

  const baseline = data?.baseline;
  const cash = data?.cash;
  const options = data?.options || [];

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-purple-900 to-indigo-900 text-white p-6 rounded-2xl shadow-sm space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-purple-300">Báo cáo Tài chính & P&L Dự án</span>
            <h3 className="text-2xl font-bold mt-1">Lợi nhuận & Dòng tiền (PM/Admin Scope)</h3>
          </div>
          {baseline && (
            <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-xs font-bold">
              Phương án chốt: {baseline.optionName} (V{baseline.number})
            </span>
          )}
        </div>

        {baseline ? (
          <div className="grid sm:grid-cols-4 gap-4 pt-4 border-t border-purple-700/50">
            <div>
              <span className="text-xs text-purple-200 block">Doanh thu trước thuế</span>
              <strong className="text-xl font-bold text-white">
                {baseline.pnl?.revenueBeforeTax != null ? formatVND(baseline.pnl.revenueBeforeTax) : 'Chưa đủ giá'}
              </strong>
            </div>
            <div>
              <span className="text-xs text-purple-200 block">Tổng chi phí dự kiến</span>
              <strong className="text-xl font-bold text-amber-300">
                {baseline.pnl?.costGross != null ? formatVND(baseline.pnl.costGross) : 'Chưa có giá đầu vào'}
              </strong>
            </div>
            <div>
              <span className="text-xs text-purple-200 block">Lợi nhuận gộp</span>
              <strong className={`text-xl font-bold ${baseline.pnl?.profit >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                {baseline.pnl?.profit != null ? formatVND(baseline.pnl.profit) : '—'}
              </strong>
            </div>
            <div>
              <span className="text-xs text-purple-200 block">Tỷ suất lợi nhuận (Margin)</span>
              <strong className="text-xl font-bold text-purple-200">
                {baseline.pnl?.marginPercent != null ? `${baseline.pnl.marginPercent.toFixed(1)}%` : '—'}
              </strong>
            </div>
          </div>
        ) : (
          <p className="text-sm text-purple-200 bg-white/10 p-3 rounded-xl">Dự án chưa chọn phương án chốt (Baseline). Dưới đây là phân tích P&L theo từng phiên bản nháp.</p>
        )}
      </div>

      {/* Chi tiết từng phương án */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h4 className="font-bold text-slate-900 text-base">So sánh P&L giữa các phương án</h4>
        <div className="divide-y border rounded-xl overflow-hidden text-sm">
          {options.map((opt: any) => (
            <div key={opt.optionId} className="p-4 space-y-2 bg-slate-50/50">
              <strong className="text-slate-800 font-bold">{opt.name}</strong>
              <div className="space-y-1.5 pl-2">
                {opt.versions?.map((ver: any) => (
                  <div key={ver.quoteId} className="flex flex-wrap items-center justify-between text-xs p-2 bg-white rounded-lg border border-slate-200">
                    <span className="font-semibold text-slate-700">Phiên bản {ver.number} ({ver.status}) {ver.isBaseline && '★ BASELINE'}</span>
                    <div className="flex gap-4">
                      <span>Doanh thu: {ver.pnl?.revenueBeforeTax != null ? formatVND(ver.pnl.revenueBeforeTax) : '—'}</span>
                      <span>Chi phí: {ver.pnl?.costGross != null ? formatVND(ver.pnl.costGross) : '—'}</span>
                      <strong className={ver.pnl?.profit >= 0 ? 'text-emerald-700' : 'text-red-700'}>
                        LN: {ver.pnl?.profit != null ? formatVND(ver.pnl.profit) : '—'}
                      </strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Dòng tiền hợp đồng */}
      {cash && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <h4 className="font-bold text-slate-900 text-base">Tổng quan Thực thu / Thực chi theo Hợp đồng</h4>
          <div className="grid sm:grid-cols-3 gap-4 text-sm bg-purple-50/30 p-4 rounded-xl border border-purple-100">
            <div>
              <span className="text-xs text-slate-500 block">Tổng giá trị hợp đồng đã ký</span>
              <strong className="text-slate-800 text-base">{formatVND(cash.totals?.gross || 0)}</strong>
            </div>
            <div>
              <span className="text-xs text-slate-500 block">Đã thanh toán thực tế</span>
              <strong className="text-emerald-700 text-base">{formatVND(cash.totals?.paid || 0)}</strong>
            </div>
            <div>
              <span className="text-xs text-slate-500 block">Còn lại phải thanh toán</span>
              <strong className="text-amber-700 text-base">{formatVND(cash.totals?.remaining || 0)}</strong>
            </div>
          </div>
        </div>
      )}
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
  const [topTab, setTopTab] = useState<'projects' | 'partners' | 'admin'>('projects');
  const [partnerSubTab, setPartnerSubTab] = useState<'community' | 'kol'>('community');
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  // Core Data
  const [projects, setProjects] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [roles, setRoles] = useState('booking');
  const [proposalTarget, setProposalTarget] = useState<{ projectId: string; phaseId: string } | null>(null);

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
      setTopTab('projects');
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
          <button type="button" onClick={() => setShowPasswordModal(false)} className="text-slate-400 hover:text-slate-700">✕</button>
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
              <p className="text-[10px] text-slate-500 font-medium">UX-1 Project Shell</p>
            </div>
          </div>

          {!user.mustChangePassword && (
            <nav className="flex items-center gap-1 bg-purple-50/60 p-1 rounded-2xl border border-purple-100/60">
              <button
                onClick={() => setTopTab('projects')}
                className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all cursor-pointer ${
                  topTab === 'projects' ? 'bg-[#7C3AED] text-white shadow-xs' : 'text-slate-600 hover:text-purple-700 hover:bg-purple-100/50'
                }`}
              >
                Dự án
              </button>
              <button
                onClick={() => setTopTab('partners')}
                className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all cursor-pointer ${
                  topTab === 'partners' ? 'bg-[#7C3AED] text-white shadow-xs' : 'text-slate-600 hover:text-purple-700 hover:bg-purple-100/50'
                }`}
              >
                Kho đối tác (KOL+Community)
              </button>
              {user.role === 'admin' && (
                <button
                  onClick={() => setTopTab('admin')}
                  className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all cursor-pointer ${
                    topTab === 'admin' ? 'bg-[#7C3AED] text-white shadow-xs' : 'text-slate-600 hover:text-purple-700 hover:bg-purple-100/50'
                  }`}
                >
                  Quản trị (Admin)
                </button>
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
        ) : topTab === 'partners' ? (
          <div className="bg-white rounded-3xl border border-purple-100 p-6 shadow-xs space-y-6">
            <div className="flex items-center justify-between border-b border-purple-100 pb-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Kho đối tác hệ thống</h1>
                <p className="text-xs text-slate-500">Thư viện KOL cá nhân và Kho Community (Fanpage/Group) dùng chung toàn hệ thống.</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPartnerSubTab('community')}
                  className={`px-4 py-2 text-xs font-bold rounded-xl cursor-pointer ${
                    partnerSubTab === 'community' ? 'bg-[#7C3AED] text-white' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                  }`}
                >
                  Kho Community
                </button>
                {user.role === 'admin' && (
                  <button
                    onClick={() => setPartnerSubTab('kol')}
                    className={`px-4 py-2 text-xs font-bold rounded-xl cursor-pointer ${
                      partnerSubTab === 'kol' ? 'bg-[#7C3AED] text-white' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                    }`}
                  >
                    Kho KOL Legacy
                  </button>
                )}
              </div>
            </div>

            {partnerSubTab === 'community' ? (
              <CommunityManager isAdmin={user.role === 'admin'} />
            ) : (
              user.role === 'admin' && <App />
            )}
          </div>
        ) : topTab === 'admin' && user.role === 'admin' ? (
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
                      run(async () => {
                        setMembers([]);
                        setSelected(p);
                        setProjectView('overview');
                        setMembers((await api(`/projects/${p.id}/members`)).members);
                      })
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
                                    <span className="text-[10px] text-slate-500">{m.roles?.join(', ')}</span>
                                  </div>
                                  <button
                                    className="text-red-600 hover:underline"
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
                        onClick={() => setProjectView('overview')}
                      >
                        1. Tổng quan
                      </button>
                      <button
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          projectView === 'shortlist' ? 'bg-[#7C3AED] text-white shadow-xs' : 'bg-purple-50/50 text-slate-700 hover:bg-purple-100/60'
                        }`}
                        onClick={() => setProjectView('shortlist')}
                      >
                        2. Đối tác & Phase
                      </button>
                      <button
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          projectView === 'quotes' ? 'bg-[#7C3AED] text-white shadow-xs' : 'bg-purple-50/50 text-slate-700 hover:bg-purple-100/60'
                        }`}
                        onClick={() => setProjectView('quotes')}
                      >
                        3. Phương án & Báo giá
                      </button>
                      <button
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          projectView === 'contracts' ? 'bg-[#7C3AED] text-white shadow-xs' : 'bg-purple-50/50 text-slate-700 hover:bg-purple-100/60'
                        }`}
                        onClick={() => setProjectView('contracts')}
                      >
                        4. Hợp đồng & Thanh toán
                      </button>

                      {/* Tab 5: Financials & P&L - Strictly PM & Admin Scope */}
                      {(user.role === 'admin' || selected.canManage) && (
                        <button
                          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            projectView === 'pnl' ? 'bg-[#7C3AED] text-white shadow-xs' : 'bg-purple-50/50 text-slate-700 hover:bg-purple-100/60'
                          }`}
                          onClick={() => setProjectView('pnl')}
                        >
                          5. Tài chính & P&L (PM/Admin)
                        </button>
                      )}
                    </nav>

                    {/* Tab Views Content */}
                    {projectView === 'overview' && (
                      <ProjectOverviewPanel project={selected} members={members} isAdmin={user.role === 'admin'} onSwitchTab={(tab) => setProjectView(tab)} />
                    )}
                    {projectView === 'shortlist' && (
                      <ProjectShortlistPanel
                        key={selected.id}
                        projectId={selected.id}
                        onOpenQuotes={() => setProjectView('quotes')}
                        onOpenProposal={(phaseId) => {
                          setProposalTarget({ projectId: selected.id, phaseId });
                        }}
                      />
                    )}
                    {projectView === 'quotes' && (
                      <ProjectQuotesPanel key={selected.id} projectId={selected.id} isAdmin={user.role === 'admin'} onProjectChanged={refresh} />
                    )}
                    {projectView === 'contracts' && <ProjectContractsPanel key={selected.id} projectId={selected.id} />}
                    {projectView === 'pnl' && (user.role === 'admin' || selected.canManage) && <ProjectFinancePnlPanel key={selected.id} projectId={selected.id} />}
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
        <p>© 2026 KOL Booking Manager • UX-1 Booking Manager Standard Baseline</p>
      </footer>

      {showPasswordModal && passwordModal}
    </div>
  );
}
