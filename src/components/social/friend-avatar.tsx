'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { initials, type SocialProfile } from '@/lib/social';

const SIZES = {
  sm: { box: 'h-9 w-9', text: 'text-xs' },
  md: { box: 'h-12 w-12', text: 'text-sm' },
  lg: { box: 'h-16 w-16', text: 'text-lg' },
} as const;

/**
 * Deterministic accent per user, so avatars stay visually distinguishable in a
 * list even when nobody has uploaded a picture -- which, since CatchUp has no
 * avatar upload flow yet, is the normal case rather than the exception.
 *
 * Hashing the user id (not the name) keeps a person's colour stable when they
 * rename themselves.
 */
const GRADIENTS = [
  'from-netflix-red to-red-800',
  'from-sky-500 to-blue-800',
  'from-violet-500 to-purple-800',
  'from-emerald-500 to-teal-800',
  'from-amber-500 to-orange-700',
  'from-pink-500 to-rose-800',
] as const;

function gradientFor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

interface FriendAvatarProps {
  profile: SocialProfile;
  size?: keyof typeof SIZES;
  className?: string;
}

export function FriendAvatar({ profile, size = 'md', className }: FriendAvatarProps) {
  // next.config.js only whitelists TMDB and Supabase Storage hosts, so an
  // avatar from anywhere else fails optimization. Falling back to initials on
  // error keeps that a cosmetic non-event rather than a broken image.
  const [imageFailed, setImageFailed] = useState(false);
  const { box, text } = SIZES[size];
  const showImage = Boolean(profile.avatarUrl) && !imageFailed;

  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden rounded-full',
        box,
        !showImage && `bg-gradient-to-br ${gradientFor(profile.userId)}`,
        className
      )}
    >
      {showImage ? (
        <Image
          src={profile.avatarUrl as string}
          alt=""
          fill
          sizes="64px"
          className="object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span
          className={cn(
            'flex h-full w-full items-center justify-center font-semibold text-white',
            text
          )}
          // Decorative: the accessible name always comes from the adjacent
          // display name, so initials must not be announced twice.
          aria-hidden="true"
        >
          {initials(profile)}
        </span>
      )}
    </div>
  );
}
