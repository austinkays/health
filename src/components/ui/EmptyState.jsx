import Motif from './Motif';

export default function EmptyState({ icon: Icon, text, motif = 'moon' }) {
  return (
    <div className="text-center py-12 px-6 text-salve-textFaint">
      <Motif type={motif} size={28} className="mb-2 block" />
      <Icon size={32} strokeWidth={1} className="mx-auto mb-2 opacity-35" />
      <div className="text-sm font-light leading-relaxed">{text}</div>
    </div>
  );
}
