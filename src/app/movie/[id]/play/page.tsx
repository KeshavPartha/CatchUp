import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { MoviePlayer } from '@/components/movie-player';
import { getMovieDetails } from '@/lib/catalog';

interface MoviePlaybackPageProps {
  params: Promise<{ id: string }>;
}

export default async function MoviePlaybackPage({ params }: MoviePlaybackPageProps) {
  const { id } = await params;
  const movieId = Number(id);
  if (!Number.isInteger(movieId)) notFound();

  let movie;
  try {
    movie = await getMovieDetails(movieId);
  } catch {
    notFound();
  }

  return (
    <main className="min-h-screen px-4 pb-16 pt-24 md:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <Link href={`/movie/${movie.id}`} className="inline-flex items-center gap-2 text-sm text-netflix-lightGray hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Back to {movie.title}
        </Link>
        <header>
          <p className="text-sm text-netflix-lightGray">Movie</p>
          <h1 className="mt-2 text-3xl font-bold md:text-5xl">{movie.title}</h1>
          <p className="mt-3 max-w-3xl text-netflix-lightGray">{movie.overview}</p>
        </header>
        <MoviePlayer movie={movie} />
      </div>
    </main>
  );
}
