import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronDown, RefreshCw, Ticket, Plus, Copy, Trash2 } from 'lucide-react';
import { supabase } from '../../services/supabase';
import Card from '../ui/Card';
import ConfirmBar from '../ui/ConfirmBar';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import { C } from '../../constants/colors';
import { formatDate, trialStatus } from './formatters';

// Random code generator. 8 chars, uppercase alphanumeric, no ambiguous 0/O/1/I.
// Prefixed BETA- so they're visually distinct from other strings in the app.
const BETA_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateBetaCode() {
  let out = 'BETA-';
  for (let i = 0; i < 8; i++) {
    out += BETA_CODE_CHARS[Math.floor(Math.random() * BETA_CODE_CHARS.length)];
  }
  return out;
}

// Top-level component (not nested in Admin) to keep re-renders cheap and
// respect the rerender-no-inline-components rule.
//
// Fetches all codes via the get_admin_beta_invites() SECURITY DEFINER RPC
// and groups them into claimed vs unclaimed. Unclaimed codes can be deleted;
// claimed ones are read-only (audit trail).
export default function BetaInvitesPanel() {
  const [invites, setInvites] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newCode, setNewCode]   = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [copiedCode, setCopiedCode] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [showAllClaimed, setShowAllClaimed] = useState(false);
  const [editingNotes, setEditingNotes] = useState(null); // code being edited
  const [editNotesValue, setEditNotesValue] = useState('');
  const [savingNotes, setSavingNotes] = useState(null);
  const del = useConfirmDelete();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('get_admin_beta_invites');
      if (rpcErr) throw rpcErr;
      setInvites(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load beta invites:', err);
      setError(err?.message || 'Failed to load beta invites');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openForm = useCallback(() => {
    setNewCode(generateBetaCode());
    setNewNotes('');
    setShowForm(true);
  }, []);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setNewCode('');
    setNewNotes('');
  }, []);

  const regenerateCode = useCallback(() => {
    setNewCode(generateBetaCode());
  }, []);

  async function createCode() {
    const code = newCode.trim();
    if (!code) return;
    setCreating(true);
    try {
      const { error: rpcErr } = await supabase.rpc('create_admin_beta_invite', {
        code_in: code,
        notes_in: newNotes.trim() || null,
      });
      if (rpcErr) throw rpcErr;
      closeForm();
      await load();
    } catch (err) {
      console.error('Failed to create beta invite:', err);
      setError(err?.message || 'Failed to create code');
    } finally {
      setCreating(false);
    }
  }

  async function deleteCode(code) {
    // Optimistic removal
    const prev = invites;
    setInvites(curr => (curr || []).filter(i => i.code !== code));
    try {
      const { error: rpcErr } = await supabase.rpc('delete_admin_beta_invite', {
        code_in: code,
      });
      if (rpcErr) throw rpcErr;
    } catch (err) {
      console.error('Failed to delete beta invite:', err);
      setInvites(prev);
      setError(err?.message || 'Failed to delete code');
    }
  }

  function startEditNotes(inv) {
    setEditingNotes(inv.code);
    setEditNotesValue(inv.notes || '');
  }

  function cancelEditNotes() {
    setEditingNotes(null);
    setEditNotesValue('');
  }

  async function saveNotes(code) {
    const text = editNotesValue.trim() || null;
    setSavingNotes(code);
    // Optimistic
    setInvites(curr => (curr || []).map(i => i.code === code ? { ...i, notes: text } : i));
    try {
      const { error: rpcErr } = await supabase
        .from('beta_invites')
        .update({ notes: text })
        .eq('code', code);
      if (rpcErr) throw rpcErr;
      setEditingNotes(null);
      setEditNotesValue('');
    } catch (err) {
      console.error('Failed to update notes:', err);
      await load();
      setError(err?.message || 'Failed to update notes');
    } finally {
      setSavingNotes(null);
    }
  }

  async function copyCode(code) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(cur => (cur === code ? null : cur)), 1500);
    } catch {
      // Clipboard API unavailable — silently ignore, user can still select manually
    }
  }

  // Partition into unclaimed vs claimed. Unclaimed first since those are
  // the ones to hand out; claimed is history.
  const { unclaimed, claimed } = useMemo(() => {
    const list = invites || [];
    return {
      unclaimed: list.filter(i => !i.claimed_by),
      claimed:   list.filter(i =>  i.claimed_by),
    };
  }, [invites]);

  const CLAIMED_PREVIEW = 5;
  const claimedVisible = showAllClaimed ? claimed : claimed.slice(0, CLAIMED_PREVIEW);
  const claimedHidden = claimed.length - CLAIMED_PREVIEW;

  return (
    <Card>
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 bg-transparent border-none cursor-pointer p-0 text-left"
        aria-expanded={expanded}
      >
        <Ticket size={14} className="text-salve-lav" />
        <h3 className="text-[13px] font-semibold text-salve-text font-montserrat m-0">
          Beta invite codes
        </h3>
        {!expanded && invites && (
          <span className="text-[11px] text-salve-textFaint font-montserrat">
            {unclaimed.length} available · {claimed.length} claimed
          </span>
        )}
        <ChevronDown
          size={13}
          className={`ml-auto text-salve-textFaint transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="mt-3">
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={openForm}
              disabled={showForm}
              className="flex items-center gap-1 text-[11px] text-salve-lav hover:text-salve-text bg-transparent border-none cursor-pointer font-montserrat disabled:opacity-50"
            >
              <Plus size={11} />
              New code
            </button>
            <button
              onClick={load}
              disabled={loading}
              aria-label="Refresh beta invites"
              className="ml-auto flex items-center gap-1 text-[11px] text-salve-textFaint hover:text-salve-text bg-transparent border-none cursor-pointer font-montserrat disabled:opacity-50"
            >
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

      {error && (
        <p className="text-[12px] text-salve-rose font-montserrat m-0 mb-2">{error}</p>
      )}

      {/* Inline "new code" form */}
      {expanded && showForm && (
        <div className="mb-3 p-3 rounded-lg border border-salve-lav/30 bg-salve-lav/5">
          <div className="text-[10px] uppercase tracking-wider text-salve-textFaint font-montserrat mb-1">
            Code
          </div>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="text"
              value={newCode}
              onChange={e => setNewCode(e.target.value)}
              maxLength={40}
              placeholder="BETA-XXXXXXXX"
              className="flex-1 text-[13px] text-salve-text font-mono rounded-md border border-salve-border bg-salve-card2/40 px-2.5 py-1.5 focus:outline-none focus:border-salve-lav/50"
            />
            <button
              onClick={regenerateCode}
              className="text-[11px] px-2 py-1.5 rounded-md border border-salve-border text-salve-textMid bg-transparent hover:border-salve-lav/40 hover:text-salve-lav font-montserrat cursor-pointer"
              aria-label="Generate new random code"
            >
              <RefreshCw size={11} />
            </button>
          </div>
          <div className="text-[10px] uppercase tracking-wider text-salve-textFaint font-montserrat mb-1">
            Notes (optional)
          </div>
          <input
            type="text"
            value={newNotes}
            onChange={e => setNewNotes(e.target.value)}
            placeholder="given to @user on r/ChronicIllness"
            className="w-full text-[12px] text-salve-text font-montserrat rounded-md border border-salve-border bg-salve-card2/40 px-2.5 py-1.5 focus:outline-none focus:border-salve-lav/50"
          />
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={createCode}
              disabled={creating || !newCode.trim()}
              className="text-[12px] px-3 py-1.5 rounded-full bg-salve-lav/15 border border-salve-lav/30 text-salve-lav font-montserrat cursor-pointer hover:bg-salve-lav/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {creating ? 'Creating…' : 'Create code'}
            </button>
            <button
              onClick={closeForm}
              className="text-[12px] text-salve-textFaint bg-transparent border-none cursor-pointer font-montserrat hover:underline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {expanded && loading && !invites && (
        <div className="text-[12px] text-salve-textFaint font-montserrat">Loading beta invites…</div>
      )}

      {expanded && !loading && invites && invites.length === 0 && (
        <div className="text-[12px] text-salve-textFaint font-montserrat">
          No beta codes yet. Tap "New code" to generate your first one.
        </div>
      )}

      {expanded && invites && invites.length > 0 && (
        <div className="space-y-4">
          {/* Unclaimed — actionable codes to hand out */}
          {unclaimed.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-salve-textFaint font-montserrat mb-2">
                Unclaimed ({unclaimed.length})
              </div>
              <div className="space-y-1.5">
                {unclaimed.map(inv => (
                  <div
                    key={inv.code}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-md border border-salve-border bg-salve-card2/40"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => copyCode(inv.code)}
                          className="flex items-center gap-1 text-[13px] font-mono text-salve-text bg-transparent border-none cursor-pointer hover:text-salve-lav p-0"
                          aria-label={`Copy ${inv.code}`}
                        >
                          {inv.code}
                          <Copy size={10} className="opacity-50" />
                        </button>
                        {copiedCode === inv.code && (
                          <span className="text-[9px] text-salve-sage font-montserrat">copied</span>
                        )}
                      </div>
                      {editingNotes === inv.code ? (
                        <div className="flex items-center gap-1.5 mt-1">
                          <input
                            type="text"
                            value={editNotesValue}
                            onChange={e => setEditNotesValue(e.target.value)}
                            placeholder="Add a note…"
                            autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') saveNotes(inv.code); if (e.key === 'Escape') cancelEditNotes(); }}
                            className="flex-1 text-[11px] text-salve-text font-montserrat rounded-md border border-salve-lav/30 bg-salve-card2/40 px-2 py-1 focus:outline-none focus:border-salve-lav/50"
                          />
                          <button
                            onClick={() => saveNotes(inv.code)}
                            disabled={savingNotes === inv.code}
                            className="text-[10px] text-salve-lav bg-transparent border-none cursor-pointer font-montserrat hover:underline disabled:opacity-50"
                          >
                            {savingNotes === inv.code ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            onClick={cancelEditNotes}
                            className="text-[10px] text-salve-textFaint bg-transparent border-none cursor-pointer font-montserrat hover:underline"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEditNotes(inv)}
                          className="text-[10px] text-salve-textFaint font-montserrat mt-0.5 truncate bg-transparent border-none cursor-pointer p-0 text-left hover:text-salve-lav"
                        >
                          {inv.notes || '+ add note'}
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => del.ask(inv.code, inv.code)}
                      aria-label={`Delete ${inv.code}`}
                      className="text-salve-textFaint hover:text-salve-rose bg-transparent border-none cursor-pointer p-1"
                    >
                      <Trash2 size={11} />
                    </button>
                    <ConfirmBar
                      pending={del.pending}
                      onConfirm={() => del.confirm(deleteCode)}
                      onCancel={del.cancel}
                      itemId={inv.code}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Claimed — audit trail */}
          {claimed.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-salve-textFaint font-montserrat mb-2">
                Claimed ({claimed.length})
              </div>
              <div className="space-y-1.5">
                {claimedVisible.map(inv => {
                  const { days: trialDays, urgency } = trialStatus(inv.claimed_user_trial_expires_at);
                  const trialColor =
                    urgency === 'expired' ? C.rose :
                    urgency === 'soon'    ? C.rose :
                    urgency === 'watch'   ? C.amber :
                                            C.sage;
                  return (
                    <div
                      key={inv.code}
                      className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-salve-card2/20"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[12px] font-mono text-salve-textMid">
                            {inv.code}
                          </span>
                          <span className="text-[10px] text-salve-textFaint font-montserrat">
                            → {inv.claimed_user_name?.trim() || inv.claimed_user_email || 'unknown'}
                          </span>
                          {trialDays != null && (
                            <span
                              className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full font-montserrat"
                              style={{ background: `${trialColor}15`, color: trialColor }}
                            >
                              {urgency === 'expired' ? 'expired' : `${trialDays}d left`}
                            </span>
                          )}
                        </div>
                        {editingNotes === inv.code ? (
                          <div className="flex items-center gap-1.5 mt-1">
                            <input
                              type="text"
                              value={editNotesValue}
                              onChange={e => setEditNotesValue(e.target.value)}
                              placeholder="Add a note…"
                              autoFocus
                              onKeyDown={e => { if (e.key === 'Enter') saveNotes(inv.code); if (e.key === 'Escape') cancelEditNotes(); }}
                              className="flex-1 text-[11px] text-salve-text font-montserrat rounded-md border border-salve-lav/30 bg-salve-card2/40 px-2 py-1 focus:outline-none focus:border-salve-lav/50"
                            />
                            <button
                              onClick={() => saveNotes(inv.code)}
                              disabled={savingNotes === inv.code}
                              className="text-[10px] text-salve-lav bg-transparent border-none cursor-pointer font-montserrat hover:underline disabled:opacity-50"
                            >
                              {savingNotes === inv.code ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              onClick={cancelEditNotes}
                              className="text-[10px] text-salve-textFaint bg-transparent border-none cursor-pointer font-montserrat hover:underline"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEditNotes(inv)}
                            className="text-[10px] text-salve-textFaint font-montserrat mt-0.5 truncate bg-transparent border-none cursor-pointer p-0 text-left hover:text-salve-lav w-full"
                          >
                            {inv.claimed_at && `Claimed ${formatDate(inv.claimed_at)}`}
                            {inv.claimed_at && inv.notes && ' · '}
                            {inv.notes || '+ add note'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {claimedHidden > 0 && !showAllClaimed && (
                <button
                  onClick={() => setShowAllClaimed(true)}
                  className="mt-2 text-[11px] text-salve-lav bg-transparent border-none cursor-pointer font-montserrat hover:underline p-0"
                >
                  Show {claimedHidden} more…
                </button>
              )}
              {showAllClaimed && claimed.length > CLAIMED_PREVIEW && (
                <button
                  onClick={() => setShowAllClaimed(false)}
                  className="mt-2 text-[11px] text-salve-textFaint bg-transparent border-none cursor-pointer font-montserrat hover:underline p-0"
                >
                  Show less
                </button>
              )}
            </div>
          )}
        </div>
      )}
      </div>
      )}
    </Card>
  );
}
