import { useState } from 'react';
import { Send, MessageSquare, Bug, Lightbulb, Check, ChevronDown, Trash2 } from 'lucide-react';
import Card from '../ui/Card';
import Field from '../ui/Field';
import Badge from '../ui/Badge';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import { C } from '../../constants/colors';

const TYPES = [
  { value: 'feedback', label: 'Feedback', icon: MessageSquare, color: C.lav },
  { value: 'bug', label: 'Bug Report', icon: Bug, color: C.rose },
  { value: 'suggestion', label: 'Suggestion', icon: Lightbulb, color: C.amber },
];

const TYPE_META = Object.fromEntries(TYPES.map(t => [t.value, t]));

export default function Feedback({ data, addItem, removeItem }) {
  const [type, setType] = useState('feedback');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const del = useConfirmDelete();

  const items = data.feedback || [];

  async function handleSubmit(e) {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    setSubmitError(null);
    try {
      await addItem('feedback', { type, message: message.trim() });
      setMessage('');
      setType('feedback');
      setSent(true);
      setTimeout(() => setSent(false), 3000);
    } catch (err) {
      console.error('Failed to submit feedback:', err);
      setSubmitError('Something went wrong — please try again in a moment.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-salve-textFaint font-montserrat px-1 mt-1 mb-0">
        Your feedback helps make Salve better. Share ideas, report bugs, or just say hi.
      </p>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Type selector pills */}
          <div className="flex gap-2">
            {TYPES.map(t => {
              const active = type === t.value;
              const Icon = t.icon;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-montserrat font-medium border transition-all cursor-pointer ${
                    active
                      ? 'border-salve-lav/40 bg-salve-lav/10 text-salve-text'
                      : 'border-salve-border bg-transparent text-salve-textFaint hover:border-salve-border2'
                  }`}
                >
                  <Icon size={12} />
                  {t.label}
                </button>
              );
            })}
          </div>

          <Field
            label="Message"
            value={message}
            onChange={v => { setMessage(v); setSubmitError(null); }}
            textarea
            placeholder={
              type === 'bug'
                ? 'Describe what happened and what you expected...'
                : type === 'suggestion'
                ? 'What feature or improvement would you like to see?'
                : 'Share your thoughts, ideas, or just say hi...'
            }
          />

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={!message.trim() || sending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-montserrat font-medium transition-all cursor-pointer border-none disabled:opacity-40 disabled:cursor-not-allowed bg-salve-lav/15 text-salve-lav hover:bg-salve-lav/25"
            >
              {sent ? <Check size={14} /> : <Send size={14} />}
              {sending ? 'Sending...' : sent ? 'Sent!' : 'Send'}
            </button>
            {sent && (
              <span className="text-xs text-salve-sage font-montserrat">
                Thank you for your feedback!
              </span>
            )}
          </div>
          {submitError && (
            <p className="text-xs text-salve-rose font-montserrat mt-1">{submitError}</p>
          )}
        </form>
      </Card>

      {/* Previously submitted feedback */}
      {items.length > 0 && (
        <div>
          <p className="text-[10px] text-salve-textFaint font-montserrat tracking-widest uppercase px-1 mb-2">
            Your submissions
          </p>
          <div className="space-y-2">
            {items.map(item => {
              const meta = TYPE_META[item.type] || TYPE_META.feedback;
              const Icon = meta.icon;
              const isExpanded = expandedId === item.id;
              const dateStr = item.created_at
                ? new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                : '';
              return (
                <Card key={item.id}>
                  <button
                    className="w-full flex items-start gap-2.5 bg-transparent border-none cursor-pointer p-0 text-left"
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    aria-expanded={isExpanded}
                    aria-label={`${meta.label}: ${item.message.slice(0, 40)}`}
                  >
                    <div
                      className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: `${meta.color}15` }}
                    >
                      <Icon size={12} color={meta.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Badge style={{ background: `${meta.color}18`, color: meta.color, fontSize: '9px' }}>
                          {meta.label}
                        </Badge>
                        {dateStr && (
                          <span className="text-[10px] text-salve-textFaint font-montserrat">{dateStr}</span>
                        )}
                      </div>
                      <p className={`text-xs text-salve-textMid font-montserrat m-0 ${isExpanded ? '' : 'line-clamp-2'}`}>
                        {item.message}
                      </p>
                    </div>
                    <ChevronDown
                      size={13}
                      className={`text-salve-textFaint shrink-0 mt-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {isExpanded && (
                    <div className="mt-2 pt-2 border-t border-salve-border/50 flex justify-end">
                      {del.confirmingId === item.id ? (
                        <ConfirmBar
                          message="Delete this feedback?"
                          onConfirm={() => { removeItem('feedback', item.id); del.clear(); }}
                          onCancel={del.clear}
                        />
                      ) : (
                        <button
                          onClick={() => del.confirmDelete(item.id)}
                          className="flex items-center gap-1 text-[10px] text-salve-textFaint hover:text-salve-rose bg-transparent border-none cursor-pointer font-montserrat transition-colors p-0"
                          aria-label="Delete feedback"
                        >
                          <Trash2 size={10} />
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {items.length === 0 && (
        <EmptyState icon={MessageSquare} message="No feedback submitted yet" />
      )}
    </div>
  );
}
