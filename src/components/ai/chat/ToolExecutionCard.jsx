import { Loader2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { DESTRUCTIVE_TOOLS } from '../../../constants/tools';
import { TOOL_LABELS } from '../constants';

export default function ToolExecutionCard({ execution, onConfirm }) {
  const { name, status, message, input } = execution;
  const label = TOOL_LABELS[name] || name;
  const isDestructive = DESTRUCTIVE_TOOLS.has(name);
  const summary = input?.name || input?.substance || input?.query || input?.table || '';
  // Preserve destructure + isDestructive lookup from original (unused in render but
  // reserved for future styling of destructive actions); log avoids tree-shake warnings.
  void message; void isDestructive;

  if (status === 'pending' && onConfirm) {
    return (
      <div className="rounded-lg border border-salve-rose/30 bg-salve-rose/5 p-2.5 text-[14px] font-montserrat" role="alertdialog">
        <div className="flex items-center gap-1.5 mb-1.5">
          <AlertTriangle size={13} className="text-salve-rose" />
          <span className="font-semibold text-salve-rose">{label}</span>
          {summary && <span className="text-salve-textFaint">,  {summary}</span>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => onConfirm(true)} className="text-[13px] font-semibold text-salve-text bg-salve-rose/20 hover:bg-salve-rose/30 rounded-md px-2.5 py-1 border-none cursor-pointer font-montserrat transition-colors">Confirm</button>
          <button onClick={() => onConfirm(false)} className="text-[13px] text-salve-textFaint hover:text-salve-text bg-salve-card2 rounded-md px-2.5 py-1 border-none cursor-pointer font-montserrat transition-colors">Cancel</button>
        </div>
      </div>
    );
  }

  const colors = {
    running:   { border: 'border-salve-lav/20',  bg: 'bg-salve-lav/5',  icon: <Loader2 size={12} className="animate-spin text-salve-lav" /> },
    success:   { border: 'border-salve-sage/20', bg: 'bg-salve-sage/5', icon: <CheckCircle2 size={12} className="text-salve-sage" /> },
    error:     { border: 'border-salve-rose/20', bg: 'bg-salve-rose/5', icon: <XCircle size={12} className="text-salve-rose" /> },
    cancelled: { border: 'border-salve-border',   bg: 'bg-salve-card2',  icon: <XCircle size={12} className="text-salve-textFaint" /> },
  }[status] || { border: 'border-salve-border', bg: 'bg-salve-card2', icon: null };

  return (
    <div className={`rounded-lg border ${colors.border} ${colors.bg} px-2.5 py-1.5 text-[13px] font-montserrat flex items-center gap-1.5`}>
      {colors.icon}
      <span className="text-salve-textMid">{label}</span>
      {summary && <span className="text-salve-textFaint">,  {summary}</span>}
      {status === 'cancelled' && <span className="text-salve-textFaint italic ml-1">cancelled</span>}
    </div>
  );
}
