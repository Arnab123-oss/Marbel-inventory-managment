import {
  ArrowLeftRight,
  Building2,
  FileSpreadsheet,
  FileText,
  Layers,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  ShoppingBag,
  Truck,
  Users,
  X,
} from 'lucide-react';
import type {NavSection} from '../types/inventory';

interface SidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  unacknowledgedAlerts: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: {
  id: NavSection;
  label: string;
  icon: React.ComponentType<{className?: string}>;
}[] = [
  {id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard},
  {id: 'inventory', label: 'Inventory', icon: Package},
  {id: 'products', label: 'Products', icon: ShoppingBag},
  {id: 'slabs', label: 'Slabs', icon: Layers},
  {id: 'purchase-bills', label: 'Purchase Bills', icon: FileSpreadsheet},
  {id: 'sales-bills', label: 'Sales Bills', icon: Receipt},
  {id: 'transfers', label: 'Transfers', icon: ArrowLeftRight},
  {id: 'customers', label: 'Customers', icon: Users},
  {id: 'suppliers', label: 'Suppliers', icon: Truck},
  {id: 'branches', label: 'Branches', icon: Building2},
  {id: 'reports', label: 'Reports', icon: FileText},
  {id: 'settings', label: 'Settings', icon: Settings},
];

export function Sidebar({
  activeSection,
  onSelectSection,
  unacknowledgedAlerts,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const navContent = (
    <div className="flex flex-col h-full bg-white border-r border-[#E5E9F0] w-[224px] shrink-0">
      <div className="h-[60px] px-5 flex items-center justify-between border-b border-[#F1F5F9]">
        <button
          type="button"
          onClick={() => onSelectSection('dashboard')}
          className="flex items-center gap-2.5 text-left focus:outline-none"
        >
          <svg width="28" height="28" viewBox="0 0 36 36" fill="none" aria-hidden="true">
            <circle cx="18" cy="18" r="16" fill="#0F172A" />
            <path
              d="M23.5 11.5C20.5 8.8 15.2 9.1 12.6 12.2C10.4 14.8 11.5 18.2 15.2 19.3L20.4 20.8C23.1 21.6 24.1 24.4 22.3 26.4C19.8 29.1 14.7 28.8 11.9 25.9"
              stroke="#3B82F6"
              strokeWidth="4.2"
              strokeLinecap="round"
            />
            <path
              d="M19.5 7.5C24.2 8.2 28.2 12.2 28.2 17.5C28.2 21.2 26.1 24.4 23 26"
              stroke="#F97316"
              strokeWidth="4.2"
              strokeLinecap="round"
            />
          </svg>
          <span className="font-display font-bold text-[15px] tracking-tight text-[#0F172A] whitespace-nowrap">
            StonePulse
          </span>
        </button>

        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 rounded-md text-slate-400 hover:text-slate-700"
          aria-label="Close navigation"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Primary navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectSection(item.id);
                onCloseMobile();
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-[#EEF4FF] text-[#1D63ED]'
                  : 'text-[#475569] hover:bg-slate-50 hover:text-[#0F172A]'
              }`}
            >
              <span className="flex items-center gap-3 min-w-0">
                <Icon
                  className={`w-[17px] h-[17px] shrink-0 ${
                    isActive ? 'text-[#1D63ED]' : 'text-[#64748B]'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </span>
              {item.id === 'inventory' && unacknowledgedAlerts > 0 && (
                <span className="text-[11px] font-semibold tabular-nums text-[#DC2626] ml-2">
                  {unacknowledgedAlerts}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0">{navContent}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/35 backdrop-blur-[1px]"
            onClick={onCloseMobile}
          />
          <aside className="relative z-10 h-full">{navContent}</aside>
        </div>
      )}
    </>
  );
}
