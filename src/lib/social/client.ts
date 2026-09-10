import { createClient as createAuthHelpersClient } from '@/lib/supabase/client';
import type { SocialClient } from './types';

/**
 * A correctly-typed Supabase client for social features.
 *
 * ---------------------------------------------------------------------------
 * Why this exists
 * ---------------------------------------------------------------------------
 * `@supabase/auth-helpers-nextjs` (deprecated, still the app's auth layer) is
 * typed against an older supabase-js generic signature: it passes the schema
 * *object* into the slot where supabase-js 2.93 expects a schema *name*. The
 * result is a client whose `Database` generic is structurally scrambled, so
 * `.rpc()` cannot resolve `Functions` and every typed call degrades to `never`.
 *
 * That is the actual reason the existing hooks reach for `as any` on Supabase
 * mutations -- it is a type-layer defect, not a real one.
 *
 * At runtime the object is a genuine supabase-js `SupabaseClient`; only the
 * bundled `.d.ts` generics are stale. So this asserts the type that is actually
 * true and confines the assertion to one line, rather than letting `any` leak
 * across the social layer. Everything downstream -- RPC names, argument shapes,
 * returned row types -- is then fully checked.
 *
 * REMOVE THIS when the app migrates to `@supabase/ssr`: that package's factory
 * returns a correctly-parameterized client and the cast becomes unnecessary.
 * The migration is a shared decision (see docs/SOCIAL_SPEC.md), so it is not
 * made here.
 *
 * Browser-only. Server components and route handlers will need an equivalent
 * built on `createServerComponentClient`; deliberately not added until
 * something server-side needs it (Watch Together will).
 */
export function createSocialClient(): SocialClient {
  return createAuthHelpersClient() as unknown as SocialClient;
}
