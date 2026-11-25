import {Columns2, GripVertical, Square} from 'lucide-react';
import type {DragEvent, ReactNode} from 'react';
import type {WidgetId} from '../../types/inventory';

interface DraggableWidgetShellProps {
  id: WidgetId;
  title: string;
  span: 1 | 2 | 3;
  customizeMode: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  headerExtra?: ReactNode;
  onToggleSpan: (id: WidgetId) => void;
  onDragStart: (e: DragEvent<HTMLElement>, id: WidgetId) => void;
  onDragOver: (e: DragEvent<HTMLElement>, id: WidgetId) => void;
  onDrop: (e: DragEvent<HTMLElement>, id: WidgetId) => void;
  onDragEnd: () => void;
  children: ReactNode;
}

export function DraggableWidgetShell({
  id,
  title,
  span,
  customizeMode,
  isDragging,
  isDropTarget,
  headerExtra,
  onToggleSpan,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  children,
}: DraggableWidgetShellProps) {
  const spanClass =
    span === 3
      ? 'lg:col-span-3'
      : span === 2
        ? 'lg:col-span-2'
        : 'lg:col-span-1';

  return (
    <section
      draggable
      onDragStart={(e) => onDragStart(e, id)}
      onDragOver={(e) => onDragOver(e, id)}
      onDrop={(e) => onDrop(e, id)}
      onDragEnd={onDragEnd}
      className={`${spanClass} group relative rounded-xl bg-white border p-5 flex flex-col transition-all duration-150 ${
        isDragging
          ? 'opacity-45 border-blue-400 scale-[0.99]'
          : isDropTarget
            ? 'border-blue-500 ring-2 ring-blue-500/20'
            : customizeMode
              ? 'border-blue-200 ring-1 ring-blue-100 hover:border-blue-400'
              : 'border-[#E5E9F0] hover:border-slate-300'
      }`}
    >
      <div className="flex items-center justify-between gap-3 mb-3.5">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <h2 className="text-[14px] font-semibold text-[#0F172A] truncate">
            {title}
          </h2>
          {headerExtra}
        </div>

        <div
          className={`flex items-center gap-1 shrink-0 transition-opacity ${
            customizeMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
          }`}
        >
          <button
            type="button"
            onClick={() => onToggleSpan(id)}
            title={span === 1 ? 'Expand widget width (2 columns)' : 'Compact widget width (1 column)'}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label={`Resize ${title} width`}
          >
            {span === 1 ? (
              <Columns2 className="w-3.5 h-3.5" />
            ) : (
              <Square className="w-3.5 h-3.5" />
            )}
          </button>
          <span
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-grab active:cursor-grabbing"
            title="Drag to reorder widget"
            aria-label={`Drag ${title}`}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-between min-w-0">{children}</div>
    </section>
  );
}
