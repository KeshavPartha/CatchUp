'use client';

import { MovieDetails } from '@/lib/catalog';
import { DemoPlayer } from '@/components/demo-player';

interface MoviePlayerProps {
  movie: MovieDetails;
}

export function MoviePlayer({ movie }: MoviePlayerProps) {
  return <DemoPlayer media={movie} title={movie.title} subtitle="Movie" artwork={movie.backdrop_path} />;
}
