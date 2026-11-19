import {ChevronDown, Clock, Edit3, Eye} from 'lucide-react';
import {useEffect, useRef, useState} from 'react';
import type {ActionModalMode} from '../modals/ProductActionModal';

interface RowActionMenuProps {
  onSelect: (mode: ActionModalMode) => void;
  ariaLabel?: string;
}

export function RowActionMenu({onSelect, ariaLabel = 'Row actions'}: RowActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{top: number; left: number}>({top: 0, left: 0});
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function handleViewportChange() {
      setOpen(false);
    }

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleViewportChange, true);
    window.addEventListener('resize', handleViewportChange);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleViewportChange, true);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [open]);

  function toggleMenu(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const menuWidth = 172;
      const menuHeight = 136;
      const openUpward = window.innerHeight - rect.bottom < menuHeight + 12;
      const top = openUpward ? Math.max(8, rect.top - menuHeight - 6) : rect.bottom + 6;
      const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth));
      setCoords({top, left});
    }
    setOpen((prev) => !prev);
  }

  function handleChoose(mode: ActionModalMode, e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    setOpen(false);
    onSelect(mode);
  }

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleMenu}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`h-7 px-2.5 rounded-lg border text-[11.5px] font-medium inline-flex items-center gap-1 whitespace-nowrap transition-colors ${
          open
            ? 'bg-[#EEF4FF] border-blue-300 text-[#1D63ED]'
            : 'bg-white border-[#E2E8F0] hover:bg-slate-50 text-[#0F172A]'
        }`}
      >
        <span>Actions</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          style={{top: `${coords.top}px`, left: `${coords.left}px`}}
          className="fixed z-50 w-[172px] rounded-xl bg-white border border-[#E2E8F0] shadow-lg py-1.5 text-left"
        >
          <button
            type="button"
            role="menuitem"
            onClick={(e) => handleChoose('view', e)}
            className="w-full px-3 py-2 text-[12px] font-medium text-[#0F172A] hover:bg-slate-50 flex items-center gap-2.5 transition-colors"
          >
            <Eye className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
            <span>View Details</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={(e) => handleChoose('edit', e)}
            className="w-full px-3 py-2 text-[12px] font-medium text-[#0F172A] hover:bg-slate-50 flex items-center gap-2.5 transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5 text-[#475569] shrink-0" />
            <span>Edit Product</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={(e) => handleChoose('history', e)}
            className="w-full px-3 py-2 text-[12px] font-medium text-[#0F172A] hover:bg-slate-50 flex items-center gap-2.5 transition-colors"
          >
            <Clock className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
            <span>History</span>
          </button>
        </div>
      )}
    </div>
  );
}
