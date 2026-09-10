'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Play, Info } from 'lucide-react';
import { Movie } from '@/lib/tmdb';
import { getBackdropUrl } from '@/lib/tmdb';

interface HeroBannerProps {
  movie: Movie;
}

export function HeroBanner({ movie }: HeroBannerProps) {
  const router = useRouter();

  const handlePlay = () => {
    router.push(`/movie/${movie.id}?autoplay=true`);
  };

  const handleMoreInfo = () => {
    router.push(`/movie/${movie.id}`);
  };

  return (
    <div className="relative h-[56.25vw] max-h-[800px] min-h-[300px] sm:min-h-[400px] w-full">
      {/* Background Image */}
      <div className="absolute inset-0">
        <Image
          src={getBackdropUrl(movie.backdrop_path)}
          alt={movie.title}
          fill
          className="object-cover"
          priority
          sizes="100vw"
        />
        {/* Gradient Overlays */}
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/50 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-netflix-black via-transparent to-transparent" />
      </div>

      {/* Content */}
      <div className="absolute inset-0 flex items-center">
        <div className="mx-auto w-full max-w-screen-2xl px-4 md:px-8">
          <div className="max-w-2xl space-y-4 md:space-y-6">
            {/* Title */}
            <h1 className="text-3xl font-bold md:text-5xl lg:text-6xl">{movie.title}</h1>

            {/* Overview */}
            <p className="line-clamp-3 text-sm text-netflix-lightGray md:text-base lg:text-lg">
              {movie.overview}
            </p>

            {/* Metadata */}
            <div className="flex items-center gap-4 text-sm md:text-base">
              <span className="flex items-center gap-1">
                <span className="text-green-500 font-semibold">
                  {Math.round(movie.vote_average * 10)}% Match
                </span>
              </span>
              <span className="text-netflix-lightGray">
                {movie.release_date?.split('-')[0] || 'N/A'}
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <button
                onClick={handlePlay}
                className="flex items-center justify-center gap-2 rounded bg-white px-4 py-2 text-base font-semibold text-black transition-colors hover:bg-white/80 active:scale-95 sm:px-6 md:px-8 md:py-3 md:text-lg"
              >
                <Play className="h-4 w-4 fill-current sm:h-5 sm:w-5 md:h-6 md:w-6" />
                Play
              </button>
              <button
                onClick={handleMoreInfo}
                className="flex items-center justify-center gap-2 rounded bg-white/20 px-4 py-2 text-base font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/30 active:scale-95 sm:px-6 md:px-8 md:py-3 md:text-lg"
              >
                <Info className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6" />
                More Info
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

