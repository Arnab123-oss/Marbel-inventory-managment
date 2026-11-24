import {
  ChevronLeft,
  ChevronRight,
  Download,
  LogOut,
  Menu,
  RotateCcw,
  UserCheck,
} from 'lucide-react';
import {useEffect, useRef, useState} from 'react';
import type {NavSection, UserProfile} from '../types/inventory';

interface TopHeaderProps {
  user: UserProfile;
  activeSection: NavSection;
  onExportCsv: () => void;
  onResetLayout: () => void;
  onLogout: () => void;
  onBackToOverview: () => void;
  onOpenMobileNav: () => void;
  onOpenAccountSettings: () => void;
}

const SECTION_TITLES: Record<NavSection, string> = {
  dashboard: 'Marble & Tile Stock Across Branches',
  inventory: 'Inventory Stock Ledger (sq. ft / pcs / box)',
  products: 'Marble, Granite & Tile Products',
  slabs: 'Slab Lots & Bundle Register',
  'purchase-bills': 'Supplier Purchase Bills',
  'sales-bills': 'Customer Sales Invoices',
  transfers: 'Inter-Branch Stock Transfers',
  customers: 'Customers & Architects Directory',
  suppliers: 'Quarry & Tile Suppliers',
  branches: 'Showrooms, Yards & Godowns',
  returns: 'Supplier Purchase Returns',
  reports: 'Stock & Billing Reports',
  settings: 'Workspace & Account Settings',
};

export function TopHeader({
  user,
  activeSection,
  onExportCsv,
  onResetLayout,
  onLogout,
  onBackToOverview,
  onOpenMobileNav,
  onOpenAccountSettings,
}: TopHeaderProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  return (
    <header
      ref={headerRef}
      className="h-[60px] bg-white border-b border-[#E5E9F0] px-4 lg:px-6 flex items-center justify-between gap-4 shrink-0"
    >
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={onBackToOverview}
          className="hidden sm:inline-flex items-center gap-1.5 text-[13px] font-medium text-[#64748B] hover:text-[#0F172A] transition-colors whitespace-nowrap shrink-0"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Marble &amp; Stone Showroom</span>
        </button>

        <ChevronRight className="hidden sm:block w-3.5 h-3.5 text-[#94A3B8] shrink-0" />

        <span className="text-[13px] font-semibold text-[#0F172A] truncate">
          {SECTION_TITLES[activeSection]}
        </span>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        <button
          type="button"
          onClick={onExportCsv}
          title="Export branch inventory report as CSV"
          aria-label="Download CSV report"
          className="h-9 w-9 rounded-lg border border-[#E2E8F0] bg-white hover:bg-slate-50 text-[#1E293B] inline-flex items-center justify-center transition-colors"
        >
          <Download className="w-4 h-4" />
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setUserMenuOpen((v) => !v);
            }}
            aria-label="Account menu"
            className="h-9 w-9 rounded-full bg-[#FCE7E3] text-[#C84B31] font-semibold text-[12.5px] inline-flex items-center justify-center border border-[#F7D1C9] hover:ring-2 hover:ring-[#C84B31]/20 transition-all"
          >
            {user.initials}
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 mt-1.5 w-64 rounded-xl bg-white border border-[#E2E8F0] shadow-lg py-2 z-40">
              <div className="px-4 py-2.5 border-b border-[#F1F5F9]">
                <div className="text-[13px] font-semibold text-[#0F172A] truncate">
                  {user.name}
                </div>
                <div className="text-[11.5px] text-[#64748B] truncate">{user.email}</div>
                <div className="mt-1 text-[11px] font-medium text-[#2563EB] truncate">
                  {user.role}
                </div>
              </div>

              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    onOpenAccountSettings();
                  }}
                  className="w-full px-4 py-2 text-left text-[12.5px] text-[#334155] hover:bg-slate-50 flex items-center gap-2.5"
                >
                  <UserCheck className="w-4 h-4 text-[#64748B]" />
                  <span>Profile &amp; Preferences</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    onResetLayout();
                  }}
                  className="w-full px-4 py-2 text-left text-[12.5px] text-[#334155] hover:bg-slate-50 flex items-center gap-2.5"
                >
                  <RotateCcw className="w-4 h-4 text-[#64748B]" />
                  <span>Reset Widget Layout</span>
                </button>
              </div>

              <div className="pt-1 border-t border-[#F1F5F9]">
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    onLogout();
                  }}
                  className="w-full px-4 py-2 text-left text-[12.5px] font-medium text-[#DC2626] hover:bg-rose-50 flex items-center gap-2.5"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out / Switch Account</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
