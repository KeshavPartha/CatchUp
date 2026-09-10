'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AtSign, Check, Copy, Edit2 } from 'lucide-react';
import { showToast } from '@/components/toast';
import { createSocialClient } from '@/lib/social/client';
import { setUsername, socialErrorMessage } from '@/lib/social';

/**
 * The user's shareable handle.
 *
 * This exists because CatchUp deliberately has no browsable user directory:
 * the only way to be found is to hand someone your username, so the app has to
 * make that easy to read, change, and copy.
 */
export function UsernameCard({ userId }: { userId: string }) {
  const supabase = useMemo(() => createSocialClient(), []);
  const [username, setUsernameValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', userId)
        .maybeSingle();

      if (!isMounted) return;

      if (!error && data) {
        setUsernameValue(data.username);
        setDraft(data.username ?? '');
      }
      setLoading(false);
    };

    void load();
    return () => {
      isMounted = false;
    };
  }, [supabase, userId]);

  const save = useCallback(async () => {
    const next = draft.trim().toLowerCase();
    if (!next || next === username) {
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      await setUsername(supabase, next);
      setUsernameValue(next);
      setEditing(false);
      showToast('Username updated', 'success');
    } catch (error) {
      // The database raises specific, already user-readable messages here
      // ("That username is taken"), so surface them rather than a generic one.
      showToast(socialErrorMessage(error, 'Could not update your username.'), 'error');
    } finally {
      setSaving(false);
    }
  }, [draft, username, supabase]);

  const copy = useCallback(async () => {
    if (!username) return;
    try {
      await navigator.clipboard.writeText(username);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied or unavailable over plain HTTP; the
      // handle is visible on screen either way, so this needs no error state.
      showToast('Could not copy — you can select the username instead', 'info');
    }
  }, [username]);

  if (loading) {
    return <div className="h-[92px] animate-pulse rounded-lg bg-netflix-black/50" />;
  }

  return (
    <div className="rounded-lg bg-netflix-black/50 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm text-netflix-lightGray">
        <AtSign className="h-4 w-4" />
        Username
      </div>

      {editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void save();
              if (event.key === 'Escape') {
                setDraft(username ?? '');
                setEditing(false);
              }
            }}
            maxLength={20}
            autoFocus
            aria-label="Your username"
            className="min-w-0 flex-1 rounded bg-netflix-black px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-netflix-red"
          />
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded bg-netflix-red px-3 py-2 text-sm font-semibold transition-colors hover:bg-netflix-red/90 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(username ?? '');
              setEditing(false);
            }}
            disabled={saving}
            className="rounded bg-netflix-gray px-3 py-2 text-sm font-semibold transition-colors hover:bg-netflix-gray/80 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate font-mono font-semibold">
            {username ? `@${username}` : 'Not set'}
          </p>
          {username && (
            <button
              type="button"
              onClick={() => void copy()}
              className="rounded p-2 text-netflix-lightGray transition-colors hover:bg-netflix-gray hover:text-white"
              aria-label="Copy your username"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded p-2 text-netflix-lightGray transition-colors hover:bg-netflix-gray hover:text-white"
            aria-label="Change your username"
          >
            <Edit2 className="h-4 w-4" />
          </button>
        </div>
      )}

      <p className="mt-2 text-xs text-netflix-lightGray">
        Share this with people you want to add. Lowercase letters, numbers and underscores, 3–20
        characters.
      </p>
    </div>
  );
}
