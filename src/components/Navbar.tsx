/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Users, 
  FileSpreadsheet, 
  Sparkles, 
  LayoutDashboard, 
  PlusCircle, 
  Database,
  Menu,
  X,
  Tag,
  Bot,
  Upload
} from 'lucide-react';

export type ActiveTab = 
  | 'dashboard' 
  | 'kols' 
  | 'price_update' 
  | 'ai_extract' 
  | 'import_data' 
  | 'sow' 
  | 'recommend' 
  | 'backup';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  kolCount: number;
  quoteCount: number;
  onOpenAddKol: () => void;
  onOpenBackup: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  kolCount,
  quoteCount,
  onOpenAddKol,
  onOpenBackup,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    {
      id: 'dashboard' as ActiveTab,
      label: 'Tổng quan',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'kols' as ActiveTab,
      label: 'Danh sách KOL',
      icon: Users,
      badge: kolCount,
    },
    {
      id: 'price_update' as ActiveTab,
      label: 'Cập nhật giá',
      icon: Tag,
      badge: null,
    },
    {
      id: 'ai_extract' as ActiveTab,
      label: 'AI cập nhật giá',
      icon: Bot,
      badge: 'Gemini',
      badgeColor: 'bg-purple-100 text-purple-700 font-bold',
    },
    {
      id: 'import_data' as ActiveTab,
      label: 'Import dữ liệu',
      icon: Upload,
      badge: null,
    },
    {
      id: 'sow' as ActiveTab,
      label: 'Lập báo giá SOW',
      icon: FileSpreadsheet,
      badge: quoteCount > 0 ? quoteCount : null,
    },
    {
      id: 'recommend' as ActiveTab,
      label: 'Đề xuất KOL',
      icon: Sparkles,
      badge: 'Smart',
      badgeColor: 'bg-amber-100 text-amber-700 font-semibold',
    },
  ];

  const handleTabClick = (tab: ActiveTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => handleTabClick('dashboard')}>
            <div className="w-10 h-10 rounded-xl bg-linear-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-200">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-slate-900 tracking-tight">KOL Booking</span>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Manager
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block">Hệ thống quản lý KOL & Lập báo giá quảng cáo</p>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleTabClick(item.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                  {item.badge !== null && item.badge !== undefined && (
                    <span
                      className={`text-[11px] px-1.5 py-0.2 rounded-full ${
                        item.badgeColor || (isActive ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700')
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Actions on Desktop */}
          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={onOpenBackup}
              title="Sao lưu & Dữ liệu"
              className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors border border-transparent hover:border-slate-200"
            >
              <Database className="w-4 h-4" />
            </button>

            <button
              onClick={onOpenAddKol}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-sm shadow-indigo-300 transition-all active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Thêm KOL</span>
            </button>
          </div>

          {/* Mobile menu button */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={onOpenAddKol}
              className="p-2 bg-indigo-600 text-white rounded-lg shadow-xs"
              title="Thêm KOL"
            >
              <PlusCircle className="w-5 h-5" />
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 pt-2 pb-4 space-y-1 shadow-lg animate-in slide-in-from-top-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabClick(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-5 h-5 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== null && item.badge !== undefined && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      item.badgeColor || (isActive ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700')
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenBackup();
              }}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg w-full"
            >
              <Database className="w-4 h-4 text-slate-400" />
              <span>Quản lý dữ liệu & Sao lưu JSON</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
