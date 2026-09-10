'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center">
      {/* Background */}
      <div className="absolute inset-0 bg-[url('https://assets.nflxext.com/ffe/siteui/vlv3/9d3533b2-0e2b-40b2-95e0-ecd7979cc88b/a3873901-5b7c-46eb-b9fa-12fea5197bd3/US-en-20240311-popsignuptwoweeks-perspective_alpha_website_large.jpg')] bg-cover bg-center" />
      <div className="absolute inset-0 bg-black/60" />

      {/* Content */}
      <div className="relative z-10 w-full max-w-md space-y-8 rounded-lg bg-black/75 px-8 py-12 md:px-16">
        {/* Logo */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-netflix-red">NETFLIX</h1>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-6">
          <h2 className="text-3xl font-semibold">Sign In</h2>

          {error && (
            <div className="rounded bg-netflix-red/20 border border-netflix-red px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded bg-netflix-gray px-4 py-3 text-white placeholder-netflix-lightGray focus:outline-none focus:ring-2 focus:ring-white"
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded bg-netflix-gray px-4 py-3 text-white placeholder-netflix-lightGray focus:outline-none focus:ring-2 focus:ring-white"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-netflix-red py-3 font-semibold text-white transition-colors hover:bg-netflix-red/80 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <div className="flex items-center justify-between text-sm text-netflix-lightGray">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4" />
              Remember me
            </label>
            <Link href="/forgot-password" className="hover:underline">
              Forgot password?
            </Link>
          </div>

          <div className="text-netflix-lightGray">
            New to Netflix?{' '}
            <Link href="/signup" className="text-white hover:underline">
              Sign up now
            </Link>
            .
          </div>

          <p className="text-xs text-netflix-lightGray">
            This page is protected by Google reCAPTCHA to ensure you&apos;re not a bot.{' '}
            <button type="button" className="text-blue-500 hover:underline">
              Learn more
            </button>
            .
          </p>
        </form>
      </div>
    </div>
  );
}

