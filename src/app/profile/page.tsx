'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { User, Edit2, LogOut, Film, Clock, Heart } from 'lucide-react';
import { showToast } from '@/components/toast';
import Image from 'next/image';

// Lightweight skeleton for instant render
function ProfileSkeleton() {
  return (
    <main className="min-h-screen px-4 py-20 md:px-8">
      <div className="mx-auto max-w-2xl">
        <div className="h-10 w-32 bg-netflix-gray/30 rounded animate-pulse mb-8" />
        <div className="rounded-lg bg-netflix-gray/30 p-6 md:p-8">
          <div className="flex items-center gap-6 mb-8">
            <div className="h-24 w-24 rounded-lg bg-netflix-gray/50 animate-pulse" />
            <div className="space-y-3">
              <div className="h-7 w-40 bg-netflix-gray/50 rounded animate-pulse" />
              <div className="h-5 w-56 bg-netflix-gray/50 rounded animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  created_at?: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    // Use getSession first (reads from localStorage - instant)
    // Then verify with getUser in background
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        router.push('/login');
        return;
      }

      // Show UI immediately with session data
      const sessionUser = session.user;
      setUser({
        id: sessionUser.id,
        email: sessionUser.email || '',
        full_name: sessionUser.user_metadata?.full_name || '',
        avatar_url: sessionUser.user_metadata?.avatar_url,
        created_at: sessionUser.created_at,
      });
      setFullName(sessionUser.user_metadata?.full_name || '');
      setLoading(false);
    };

    init();
  }, [router]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        data: { full_name: fullName }
      });

      if (error) throw error;

      setUser({ ...user, full_name: fullName });
      setEditing(false);
      showToast('Profile updated successfully', 'success');
    } catch {
      showToast('Failed to update profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  if (loading) {
    return <ProfileSkeleton />;
  }

  if (!user) return null;

  const memberSince = user.created_at 
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : 'Unknown';

  return (
    <main className="min-h-screen px-4 py-20 md:px-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-8 text-3xl font-bold md:text-4xl">Profile</h1>

        {/* Profile Card */}
        <div className="rounded-lg bg-netflix-gray/30 p-6 md:p-8">
          {/* Avatar & Name */}
          <div className="flex items-center gap-6 mb-8">
            <div className="relative h-24 w-24 overflow-hidden rounded-lg bg-netflix-gray">
              {user.avatar_url ? (
                <Image src={user.avatar_url} alt="Profile" fill className="object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-netflix-red to-red-700">
                  <User className="h-12 w-12 text-white" />
                </div>
              )}
            </div>
            <div>
              {editing ? (
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mb-2 w-full rounded bg-netflix-black px-3 py-2 text-xl font-semibold focus:outline-none focus:ring-2 focus:ring-netflix-red"
                  placeholder="Your name"
                />
              ) : (
                <h2 className="text-2xl font-semibold">{user.full_name || 'Netflix User'}</h2>
              )}
              <p className="text-netflix-lightGray">{user.email}</p>
            </div>
          </div>

          {/* Edit/Save Buttons */}
          <div className="flex gap-3 mb-8">
            {editing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 rounded bg-netflix-red px-4 py-2 font-semibold hover:bg-netflix-red/90 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  onClick={() => { setEditing(false); setFullName(user.full_name || ''); }}
                  className="rounded bg-netflix-gray px-4 py-2 font-semibold hover:bg-netflix-gray/80 transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-2 rounded bg-netflix-gray px-4 py-2 font-semibold hover:bg-netflix-gray/80 transition-colors"
              >
                <Edit2 className="h-4 w-4" />
                Edit Profile
              </button>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="rounded-lg bg-netflix-black/50 p-4 text-center">
              <Film className="mx-auto mb-2 h-6 w-6 text-netflix-red" />
              <p className="text-sm text-netflix-lightGray">Member Since</p>
              <p className="font-semibold">{memberSince}</p>
            </div>
            <button onClick={() => router.push('/my-list')} className="rounded-lg bg-netflix-black/50 p-4 text-center hover:bg-netflix-black/70 transition-colors">
              <Heart className="mx-auto mb-2 h-6 w-6 text-netflix-red" />
              <p className="text-sm text-netflix-lightGray">My List</p>
              <p className="font-semibold">View →</p>
            </button>
            <button onClick={() => router.push('/')} className="rounded-lg bg-netflix-black/50 p-4 text-center hover:bg-netflix-black/70 transition-colors">
              <Clock className="mx-auto mb-2 h-6 w-6 text-netflix-red" />
              <p className="text-sm text-netflix-lightGray">Continue</p>
              <p className="font-semibold">Watching →</p>
            </button>
          </div>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded bg-red-600/20 px-4 py-3 font-semibold text-red-500 hover:bg-red-600/30 transition-colors"
          >
            <LogOut className="h-5 w-5" />
            Sign Out
          </button>
        </div>
      </div>
    </main>
  );
}

