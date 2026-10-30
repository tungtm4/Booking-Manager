import React from 'react';
import { BRIEF_PLATFORMS } from '../domain/projectBrief';

export interface BriefPlatformSelectorProps {
  platforms: string[];
  onChange: (nextPlatforms: string[]) => void;
  disabled?: boolean;
  prefix?: string;
}

export function BriefPlatformSelector({
  platforms,
  onChange,
  disabled = false,
  prefix = '',
}: BriefPlatformSelectorProps) {
  const togglePlatform = (p: string) => {
    const next = platforms.includes(p)
      ? platforms.filter(x => x !== p)
      : [...platforms, p];
    onChange(next);
  };

  const ariaPrefix = prefix ? `${prefix} ` : '';

  return (
    <div className="text-sm sm:col-span-2 space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <span className="font-medium text-slate-700">Nền tảng</span>
        <span className="text-xs text-slate-500">
          {platforms.length === 0
            ? 'Chưa chọn nền tảng nào: tìm kiếm trên tất cả nền tảng'
            : `Đã chọn ${platforms.length} nền tảng (điều kiện HOẶC)`}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        {(BRIEF_PLATFORMS as readonly string[]).map((p: string) => {
          const checked = platforms.includes(p);
          return (
            <label key={p} className="inline-flex items-center gap-1.5 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                aria-label={`${ariaPrefix}Nền tảng ${p}`}
                checked={checked}
                disabled={disabled}
                onChange={() => togglePlatform(p)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>{p}</span>
            </label>
          );
        })}
        {platforms.length > 0 && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange([])}
            className="text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer disabled:opacity-50 ml-1"
          >
            Xoá chọn (tất cả)
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500">
        {platforms.length === 0
          ? 'Không chọn nền tảng nào = tất cả nền tảng. Khi chọn nhiều, đối tác có ít nhất một nền tảng được chọn sẽ phù hợp.'
          : 'Đối tác có ít nhất một nền tảng được chọn sẽ đáp ứng tiêu chí. Ngưỡng follower/quy mô chỉ tính trên các nền tảng được chọn.'}
      </p>
    </div>
  );
}
