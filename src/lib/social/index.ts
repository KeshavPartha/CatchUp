// Social / Realtime workstream -- public surface.
//
// Import from '@/lib/social' rather than reaching into individual modules, so
// the internal layout stays free to change as recommendations, progress
// sharing, and Watch Together are added.

export * from './types';
export * from './errors';
export * from './friendships';
export * from './requests';
export * from './recommendations';
export * from './progress-sharing';
export * from './watch-together';
export * from './search';
