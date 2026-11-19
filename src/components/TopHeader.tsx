import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  LogOut,
  Menu,
  RotateCcw,
  UserCheck,
} from 'lucide-react';
import {useEffect, useRef, useState} from 'react';
import type {
  DashboardFilters,
  DateRangeKey,
  NavSection,
  UserProfile,
} from '../types/inventory';

interface TopHeaderProps {
  user: UserProfile;
  activeSection: NavSection;
  dateRangeKey: DateRangeKey;
  onChangeDateRange: (key: DateRangeKey) => void;
  filters: DashboardFilters;
  onChangeFilters: (next: DashboardFilters) => void;
  onExportCsv: () => void;
  onResetLayout: () => void;
  onLogout: () => void;
  onBackToOverview: () => void;
  onOpenMobileNav: () => void;
  onOpenAccountSettings: () => void;
}

const DATE_RANGE_OPTIONS: {key: DateRangeKey; label: string}[] = [
  {key: 'apr_2024', label: '01 Apr 2024 - 30 Apr 2024'},
  {key: 'last_7_days', label: '24 Apr 2024 - 30 Apr 2024'},
  {key: 'mar_2024', label: '01 Mar 2024 - 31 Mar 2024'},
  {key: 'q1_2024', label: '01 Jan 2024 - 31 Mar 2024'},
];

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
  reports: 'Stock & Billing Reports',
  settings: 'Workspace & Account Settings',
};

export function TopHeader({
  user,
  activeSection,
  dateRangeKey,
  onChangeDateRange,
  filters,
  onChangeFilters,
  onExportCsv,
  onResetLayout,
  onLogout,
  onBackToOverview,
  onOpenMobileNav,
  onOpenAccountSettings,
}: TopHeaderProps) {
  const [dateOpen, setDateOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setDateOpen(false);
        setFilterOpen(false);
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const currentDateLabel =
    DATE_RANGE_OPTIONS.find((o) => o.key === dateRangeKey)?.label ||
    DATE_RANGE_OPTIONS[0].label;

  const activeFilterCount =
    (filters.locationType !== 'All' ? 1 : 0) +
    (filters.unitFilter !== 'All' ? 1 : 0) +
    (filters.accuracyBand !== 'All' ? 1 : 0) +
    (filters.statusFilter !== 'All' ? 1 : 0);

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
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setDateOpen((v) => !v);
              setFilterOpen(false);
              setUserMenuOpen(false);
            }}
            className="h-9 px-3 rounded-lg border border-[#E2E8F0] bg-white hover:bg-slate-50 text-[12.5px] font-medium text-[#1E293B] inline-flex items-center gap-2 whitespace-nowrap transition-colors"
          >
            <Calendar className="w-4 h-4 text-[#64748B]" />
            <span className="hidden md:inline tabular-nums">{currentDateLabel}</span>
            <ChevronDown className="w-3.5 h-3.5 text-[#94A3B8]" />
          </button>

          {dateOpen && (
            <div className="absolute right-0 mt-1.5 w-60 rounded-xl bg-white border border-[#E2E8F0] shadow-lg py-1.5 z-40">
              {DATE_RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    onChangeDateRange(opt.key);
                    setDateOpen(false);
                  }}
                  className={`w-full text-left px-3.5 py-2 text-[12.5px] tabular-nums transition-colors ${
                    dateRangeKey === opt.key
                      ? 'bg-[#EEF4FF] text-[#1D63ED] font-semibold'
                      : 'text-[#334155] hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setFilterOpen((v) => !v);
              setDateOpen(false);
              setUserMenuOpen(false);
            }}
            className={`h-9 px-3 rounded-lg border text-[12.5px] font-medium inline-flex items-center gap-2 whitespace-nowrap transition-colors ${
              activeFilterCount > 0
                ? 'border-blue-300 bg-[#EEF4FF] text-[#1D63ED]'
                : 'border-[#E2E8F0] bg-white hover:bg-slate-50 text-[#1E293B]'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
          </button>

          {filterOpen && (
            <div className="absolute right-0 mt-1.5 w-80 rounded-xl bg-white border border-[#E2E8F0] shadow-lg p-4 z-40 space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-[#0F172A]">
                  Filter Branches, Units &amp; Stock
                </span>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      onChangeFilters({
                        locationType: 'All',
                        unitFilter: 'All',
                        accuracyBand: 'All',
                        statusFilter: 'All',
                        searchQuery: '',
                      })
                    }
                    className="text-[11.5px] font-medium text-blue-600 hover:underline"
                  >
                    Reset all
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-medium text-[#64748B]">
                  Measurement Unit
                </label>
                <div className="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-lg">
                  {(['All', 'sq. ft', 'pcs', 'box'] as const).map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => onChangeFilters({...filters, unitFilter: u})}
                      className={`py-1 text-[11px] font-medium rounded-md transition-colors ${
                        filters.unitFilter === u
                          ? 'bg-white text-[#0F172A] shadow-sm'
                          : 'text-[#64748B] hover:text-[#0F172A]'
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-medium text-[#64748B]">
                  Branch Type
                </label>
                <div className="grid grid-cols-5 gap-1 bg-slate-100 p-1 rounded-lg">
                  {(['All', 'Showroom', 'Yard', 'Godown', 'Depot'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onChangeFilters({...filters, locationType: t})}
                      className={`py-1 text-[10.5px] font-medium rounded-md transition-colors ${
                        filters.locationType === t
                          ? 'bg-white text-[#0F172A] shadow-sm'
                          : 'text-[#64748B] hover:text-[#0F172A]'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-medium text-[#64748B]">
                  Accuracy Threshold
                </label>
                <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-lg">
                  {(['All', '99%+', '<98.5%'] as const).map((band) => (
                    <button
                      key={band}
                      type="button"
                      onClick={() => onChangeFilters({...filters, accuracyBand: band})}
                      className={`py-1 text-[11px] font-medium rounded-md transition-colors ${
                        filters.accuracyBand === band
                          ? 'bg-white text-[#0F172A] shadow-sm'
                          : 'text-[#64748B] hover:text-[#0F172A]'
                      }`}
                    >
                      {band}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-medium text-[#64748B]">
                  Stock Status
                </label>
                <select
                  value={filters.statusFilter}
                  onChange={(e) =>
                    onChangeFilters({
                      ...filters,
                      statusFilter: e.target.value as DashboardFilters['statusFilter'],
                    })
                  }
                  className="w-full h-8 px-2.5 text-[12px] rounded-lg border border-[#E2E8F0] bg-white text-[#0F172A]"
                >
                  <option value="All">All Stock Statuses</option>
                  <option value="In Stock">In Stock</option>
                  <option value="Low Stock">Low Stock</option>
                  <option value="Out of Stock">Out of Stock</option>
                  <option value="Overstock">Overstock</option>
                </select>
              </div>
            </div>
          )}
        </div>

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
              setDateOpen(false);
              setFilterOpen(false);
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
