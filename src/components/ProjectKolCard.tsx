import React, { useState } from 'react';
import { Check, AlertCircle, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import {
  PRICE_FORMAT_LABELS,
  PRICE_FORMAT_ORDER,
  PRICE_SHORT_LABELS,
  PRICE_FORMAT_STYLES,
  type PriceFormatKey,
} from '../types/kol';
import { assessProjectKol, type ProjectBrief } from '../domain/projectBrief';
import { formatNumberOnly, formatFollowers, formatDateTimeVN, getCategoryBadgeClass } from '../utils/formatters';

const safeUrl = (v: any) => (typeof v === 'string' && /^https?:\/\//i.test(v) ? v : undefined);

export function ProjectKolCard({
  profile,
  brief,
  prices,
  selected,
  disabled,
  selectionLabel,
  onSelect,
  badge,
  renderPriceEditor,
}: {
  profile: any;
  brief: ProjectBrief;
  prices?: any;
  selected: boolean;
  disabled: boolean;
  selectionLabel: string;
  onSelect?: () => void;
  badge?: string;
  renderPriceEditor?: (format: PriceFormatKey) => React.ReactNode;
}) {
  const [editing, setEditing] = useState<PriceFormatKey | null>(null);
  const [showAssessment, setShowAssessment] = useState(false);

  const assessment = assessProjectKol(profile, brief);
  const needed = brief.deliverables ?? [];
  const updateTimeStr = formatDateTimeVN(profile.ngayCapNhat);

  // Brief assessment chip logic
  const failedChecksCount = assessment.checks.filter((c) => !c.met).length;
  let chipLabel = '';
  let chipTextClass = '';
  if (!assessment.hasCriteria) {
    chipLabel = 'Cần bổ sung tiêu chí để đánh giá';
    chipTextClass = 'text-slate-500';
  } else if (assessment.matches) {
    chipLabel = 'Đạt tiêu chí brief';
    chipTextClass = 'text-emerald-700';
  } else {
    chipLabel = `Chưa đạt ${failedChecksCount} tiêu chí`;
    chipTextClass = 'text-amber-700';
  }

  return (
    <article
      className={
        'rounded-xl border bg-white shadow-xs p-2.5 transition-all ' +
        (selected ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-slate-200 hover:border-slate-300')
      }
      aria-label={'Hồ sơ KOL ' + profile.ten}
    >
      <div className="flex items-center gap-3">
        {/* Khối trái: Thông tin KOL */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {onSelect && (
            <input
              type="checkbox"
              aria-label={selectionLabel + ' ' + profile.ten}
              checked={selected}
              disabled={disabled}
              onChange={onSelect}
              className="w-4 h-4 accent-indigo-600 text-indigo-600 rounded border-slate-300 shrink-0 cursor-pointer disabled:cursor-not-allowed"
            />
          )}

          {safeUrl(profile.anhDaiDien) ? (
            <img
              src={profile.anhDaiDien}
              alt={'Ảnh ' + profile.ten}
              className="w-8 h-8 rounded-full object-cover shrink-0"
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center shrink-0 text-xs">
              {profile.ten?.slice(0, 2).toUpperCase()}
            </div>
          )}

          <div className="min-w-0 flex-1">
            {/* Tên KOL + Badge */}
            <div className="flex items-center gap-2 flex-wrap">
              <h5 className="font-bold text-slate-900 text-[13px] truncate">
                {profile.ten}
              </h5>
              {badge && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium border border-slate-200 shrink-0">
                  {badge}
                </span>
              )}
            </div>

            {/* Dòng inline: Nền tảng · Followers · Link Profile + Lĩnh vực */}
            <div className="flex items-center gap-1.5 mt-0.5 flex-nowrap overflow-hidden">
              {profile.nenTang && profile.nenTang.length > 0 ? (
                profile.nenTang.map((c: any, idx: number) => (
                  <React.Fragment key={c.id || `${c.tenNenTang}-${idx}`}>
                    {idx > 0 && <span className="text-slate-300">•</span>}
                    <span className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                      {c.tenNenTang}: <strong className="text-slate-700 font-medium">{formatFollowers(c.soFollower)}</strong>
                      {safeUrl(c.linkProfile) && (
                        <a
                          href={safeUrl(c.linkProfile)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:text-indigo-800"
                          aria-label={'Mở kênh ' + c.tenNenTang + ' của ' + profile.ten}
                        >
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </span>
                  </React.Fragment>
                ))
              ) : (
                <span className="text-[11px] text-slate-400">Chưa có kênh</span>
              )}

              {profile.linhVuc && profile.linhVuc.length > 0 && (
                <>
                  <span className="text-slate-300 hidden sm:inline">•</span>
                  <div className="hidden sm:flex items-center gap-1">
                    {profile.linhVuc.slice(0, 3).map((cat: string) => (
                      <span
                        key={cat}
                        className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${getCategoryBadgeClass(cat)}`}
                      >
                        {cat}
                      </span>
                    ))}
                    {profile.linhVuc.length > 3 && (
                      <span className="text-[10px] text-slate-400">+{profile.linhVuc.length - 3}</span>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Dòng meta gọn: giờ cập nhật · chip đối chiếu brief · nút Đối chiếu */}
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap text-[11px]">
              {updateTimeStr && <span className="text-slate-400">Cập nhật: {updateTimeStr}</span>}
              {updateTimeStr && <span className="text-slate-300">•</span>}
              <span className={`font-medium ${chipTextClass}`}>
                {chipLabel}
              </span>
              <button
                type="button"
                onClick={() => setShowAssessment(!showAssessment)}
                className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800 underline inline-flex items-center gap-0.5 cursor-pointer"
                aria-expanded={showAssessment}
              >
                <span>Đối chiếu</span>
                {showAssessment ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            </div>

            {/* Danh sách tiêu chí brief chi tiết khi mở Đối chiếu */}
            {showAssessment && (
              <div className="mt-2 rounded-xl p-3 border bg-slate-50/80 border-slate-200 text-xs space-y-1.5">
                <div className="font-semibold text-slate-800 mb-1">
                  {assessment.hasCriteria ? 'Đối chiếu với brief đã duyệt' : 'Cần bổ sung tiêu chí để đánh giá phù hợp'}
                </div>
                <ul className="space-y-1">
                  {assessment.checks.map((c, n) => (
                    <li key={n} className="flex items-start gap-1.5">
                      {c.met ? (
                        <Check size={13} className="text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle size={13} className="text-amber-600 shrink-0 mt-0.5" />
                      )}
                      <span className={c.met ? 'text-slate-700' : 'text-amber-800'}>
                        {c.met ? 'Đạt: ' : 'Chưa đạt: '}
                        {c.label}
                      </span>
                    </li>
                  ))}
                </ul>
                {profile.reviewSoBo && (
                  <p className="mt-2 text-slate-600 italic">
                    <strong>Ghi chú hồ sơ:</strong> "{profile.reviewSoBo}"
                  </p>
                )}
                {!assessment.matches && assessment.hasCriteria && (
                  <p className="mt-1 text-amber-800 text-[11px]">
                    KOL đã giữ trong danh sách nhưng chưa đáp ứng tiêu chí brief hiện tại.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Khối phải: Bảng giá gọn 3 cột x 2 hàng, ô 2 dòng siêu nhỏ */}
        <div className="w-[380px] shrink-0">
          <div className="grid grid-cols-3 gap-1">
            {PRICE_FORMAT_ORDER.map((format) => {
              const task = needed.find((d) => d.format === format);
              const price = prices?.[format];
              const value = prices ? price?.value : profile.bangGia?.[format];
              const hasPrice = value !== null && value !== undefined;
              const status = price?.status ?? (value == null ? 'waiting' : 'unconfirmed');
              const statusText = status === 'confirmed' ? 'Đã xác nhận' : status === 'unconfirmed' ? 'Chưa xác nhận' : 'Chờ bổ sung giá';

              // Xây dựng title của ô
              const titleParts: string[] = [];
              if (task) {
                titleParts.push(
                  `Brief yêu cầu · ${task.quantity.toLocaleString('vi-VN')}${
                    brief.deliverableScope === 'campaign' ? ' toàn chiến dịch' : ' / KOL'
                  }`
                );
              }
              if (status === 'confirmed') {
                titleParts.push('Đã xác nhận');
              } else if (status === 'unconfirmed') {
                titleParts.push('Chưa xác nhận');
              } else {
                titleParts.push('Chưa có giá');
              }
              if (price?.checkedAt) {
                try {
                  titleParts.push(`Kiểm tra gần nhất: ${new Date(price.checkedAt).toLocaleDateString('vi-VN')}`);
                } catch {}
              }
              const cellTitle = titleParts.join(' · ');

              // Style ô
              const isRequired = Boolean(task);
              const ringClass = isRequired ? 'ring-2 ring-indigo-500 border-indigo-400' : 'border';
              const baseColor = hasPrice
                ? PRICE_FORMAT_STYLES[format]
                : 'bg-slate-50 border-slate-200 text-slate-400';

              const boxClass = `text-[11px] px-1.5 py-0.5 rounded-md ${ringClass} ${baseColor} text-left truncate transition-all ${
                renderPriceEditor ? 'cursor-pointer hover:shadow-xs' : ''
              } ${editing === format ? 'ring-2 ring-indigo-600' : ''}`;

              const content = (
                <>
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate">
                      <span className={hasPrice ? 'font-medium' : 'font-normal'}>
                        {PRICE_SHORT_LABELS[format]}:{' '}
                      </span>
                      <span className={hasPrice ? 'font-bold' : 'text-amber-600 font-medium'}>
                        {hasPrice ? `${formatNumberOnly(value)}đ` : 'Chưa có giá'}
                      </span>
                      {status === 'confirmed' && (
                        <span title="Đã xác nhận" className="inline-flex items-center">
                          <Check
                            size={12}
                            className="inline text-emerald-600 ml-1 stroke-[3]"
                          />
                        </span>
                      )}
                    </span>
                    {renderPriceEditor && (
                      <ChevronDown size={11} className="text-slate-400 shrink-0 opacity-70" />
                    )}
                  </div>
                  <div
                    className={`text-[9px] font-normal leading-tight truncate ${
                      status === 'confirmed' ? 'text-emerald-600' : status === 'waiting' ? 'text-amber-600' : 'text-slate-500'
                    }`}
                    title={cellTitle}
                  >
                    {task
                      ? `${task.quantity.toLocaleString('vi-VN')} ${brief.deliverableScope === 'campaign' ? 'toàn chiến dịch' : '/ KOL'} · `
                      : ''}
                    {statusText}
                  </div>
                </>
              );

              return renderPriceEditor ? (
                <button
                  type="button"
                  key={format}
                  className={boxClass}
                  disabled={disabled}
                  title={cellTitle}
                  aria-label={'Kiểm tra giá ' + PRICE_FORMAT_LABELS[format] + ' của ' + profile.ten}
                  aria-expanded={editing === format}
                  onClick={() => setEditing(editing === format ? null : format)}
                >
                  {content}
                </button>
              ) : (
                <div key={format} className={boxClass} title={cellTitle}>
                  {content}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Form kiểm tra giá bung ra dưới thẻ */}
      {editing && renderPriceEditor && (
        <div className="mt-2 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3">
          <div className="flex justify-between items-center mb-3">
            <h6 className="text-sm font-semibold text-slate-800">
              Kiểm tra giá — {PRICE_FORMAT_LABELS[editing]}
            </h6>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              Đóng
            </button>
          </div>
          {renderPriceEditor(editing)}
        </div>
      )}
    </article>
  );
}
