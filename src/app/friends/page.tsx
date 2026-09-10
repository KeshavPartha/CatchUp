'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Inbox, UserPlus, ShieldCheck, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useFriends } from '@/hooks/use-friends';
import { useFriendRequests } from '@/hooks/use-friend-requests';
import { FriendCard } from '@/components/social/friend-card';
import { FriendRequestCard } from '@/components/social/friend-request-card';
import { AddFriendSearch } from '@/components/social/add-friend-search';
import { RecommendationInbox } from '@/components/social/recommendation-inbox';
import { useRecommendations } from '@/hooks/use-recommendations';

type Tab = 'friends' | 'recommendations' | 'requests' | 'add';

function FriendsSkeleton() {
  return (
    <main className="min-h-screen px-4 py-20 md:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 h-10 w-40 animate-pulse rounded bg-netflix-gray/30" />
        <div className="mb-8 h-10 w-full animate-pulse rounded bg-netflix-gray/30" />
        <div className="space-y-3">
          {[...Array(4)].map((_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-lg bg-netflix-gray/30" />
          ))}
        </div>
      </div>
    </main>
  );
}

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}

function EmptyState({ icon, title, body, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg bg-netflix-darkGray px-6 py-16 text-center">
      <div className="mb-4 text-netflix-lightGray">{icon}</div>
      <h2 className="mb-2 text-xl font-semibold">{title}</h2>
      <p className="mb-6 max-w-md text-sm text-netflix-lightGray">{body}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="rounded bg-netflix-red px-6 py-2.5 font-semibold transition-colors hover:bg-netflix-red/90"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export default function FriendsPage() {
  const router = useRouter();
  const { userId, loading: authLoading } = useCurrentUser();
  const [tab, setTab] = useState<Tab>('friends');

  const { friends, loading: friendsLoading, busyIds: friendBusyIds, remove } = useFriends();
  const { unseenCount } = useRecommendations();
  const {
    incoming,
    outgoing,
    loading: requestsLoading,
    pendingCount,
    busyIds: requestBusyIds,
    send,
    accept,
    decline,
    cancel,
  } = useFriendRequests();

  // Client-side guard, matching /profile. There is no middleware in the app
  // yet, so route protection is not enforced at the boundary -- noted in
  // docs/SOCIAL_SPEC.md as a shared gap. RLS still protects the data itself.
  useEffect(() => {
    if (!authLoading && !userId) {
      router.push('/login');
    }
  }, [authLoading, userId, router]);

  const acceptFromSearch = useCallback(
    (requestId: string) => {
      setTab('requests');
      void accept(requestId);
    },
    [accept]
  );

  if (authLoading || (friendsLoading && requestsLoading)) {
    return <FriendsSkeleton />;
  }

  if (!userId) return null;

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'friends', label: 'Friends', badge: friends.length || undefined },
    { id: 'recommendations', label: 'Recommended', badge: unseenCount || undefined },
    { id: 'requests', label: 'Requests', badge: pendingCount || undefined },
    { id: 'add', label: 'Add friend' },
  ];

  return (
    <main className="min-h-screen px-4 py-20 md:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-2 text-3xl font-bold md:text-4xl">Friends</h1>

        {/*
          Set the privacy expectation on the page where friendships are made,
          not buried in a settings screen. This is a load-bearing product
          promise: friendship grants nothing by itself, and the database
          enforces exactly that.
        */}
        <p className="mb-8 flex items-start gap-2 text-sm text-netflix-lightGray">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Adding a friend never shares what you watch. Progress is only shared when you choose
            a specific show, and you can stop sharing it at any time.
          </span>
        </p>

        <div
          role="tablist"
          aria-label="Friends sections"
          className="mb-8 flex gap-1 border-b border-netflix-gray"
        >
          {tabs.map((item) => (
            <button
              key={item.id}
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                '-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors',
                tab === item.id
                  ? 'border-netflix-red text-white'
                  : 'border-transparent text-netflix-lightGray hover:text-white'
              )}
            >
              {item.label}
              {item.badge !== undefined && (
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-bold',
                    item.id === 'requests' || item.id === 'recommendations'
                      ? 'bg-netflix-red text-white'
                      : 'bg-netflix-gray text-netflix-lightGray'
                  )}
                >
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === 'friends' &&
          (friends.length === 0 ? (
            <EmptyState
              icon={<Users className="h-12 w-12" />}
              title="No friends yet"
              body="Add a friend to recommend shows to each other. You choose what, if anything, you share beyond that."
              action={{ label: 'Add a friend', onClick: () => setTab('add') }}
            />
          ) : (
            <ul className="space-y-3">
              {friends.map((friend) => (
                <FriendCard
                  key={friend.userId}
                  friend={friend}
                  busy={friendBusyIds.has(friend.userId)}
                  onRemove={remove}
                />
              ))}
            </ul>
          ))}

        {tab === 'recommendations' && (
          <div>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <Sparkles className="h-5 w-5" />
              Recommended by friends
            </h2>
            <RecommendationInbox />
          </div>
        )}

        {tab === 'requests' && (
          <div className="space-y-10">
            <section>
              <h2 className="mb-4 text-lg font-semibold">
                Received{pendingCount > 0 ? ` (${pendingCount})` : ''}
              </h2>
              {incoming.length === 0 ? (
                <EmptyState
                  icon={<Inbox className="h-12 w-12" />}
                  title="No pending requests"
                  body="When someone sends you a friend request, it will appear here right away."
                />
              ) : (
                <ul className="space-y-3">
                  {incoming.map((request) => (
                    <FriendRequestCard
                      key={request.requestId}
                      direction="incoming"
                      request={request}
                      busy={requestBusyIds.has(request.requestId)}
                      onAccept={accept}
                      onDecline={decline}
                    />
                  ))}
                </ul>
              )}
            </section>

            {outgoing.length > 0 && (
              <section>
                <h2 className="mb-4 text-lg font-semibold">Sent</h2>
                <ul className="space-y-3">
                  {outgoing.map((request) => (
                    <FriendRequestCard
                      key={request.requestId}
                      direction="outgoing"
                      request={request}
                      busy={requestBusyIds.has(request.requestId)}
                      onCancel={cancel}
                    />
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {tab === 'add' && (
          <div>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <UserPlus className="h-5 w-5" />
              Add a friend
            </h2>
            <AddFriendSearch
              onSend={send}
              busyIds={requestBusyIds}
              onAcceptExisting={acceptFromSearch}
            />
          </div>
        )}
      </div>
    </main>
  );
}
