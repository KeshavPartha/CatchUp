'use client';

import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Movie } from '@/lib/tmdb';
import { MovieCard } from './movie-card';
import { cn } from '@/lib/utils';

interface MovieRowProps {
  title: string;
  movies: Movie[];
}

export function MovieRow({ title, movies }: MovieRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  const scroll = (direction: 'left' | 'right') => {
    if (!rowRef.current) return;

    const scrollAmount = rowRef.current.clientWidth * 0.8;
    const newScrollLeft =
      direction === 'left'
        ? rowRef.current.scrollLeft - scrollAmount
        : rowRef.current.scrollLeft + scrollAmount;

    rowRef.current.scrollTo({
      left: newScrollLeft,
      behavior: 'smooth',
    });

    // Update arrow visibility
    setTimeout(() => {
      if (!rowRef.current) return;
      setShowLeftArrow(rowRef.current.scrollLeft > 0);
      setShowRightArrow(
        rowRef.current.scrollLeft < rowRef.current.scrollWidth - rowRef.current.clientWidth - 10
      );
    }, 300);
  };

  return (
    <div className="group relative mb-8">
      {/* Title */}
      <h2 className="mb-4 px-4 text-xl font-semibold md:px-8 md:text-2xl">{title}</h2>

      {/* Scroll Container */}
      <div className="relative">
        {/* Left Arrow */}
        {showLeftArrow && (
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-0 z-10 flex h-full w-12 items-center justify-center bg-black/50 opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100 md:w-16"
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-8 w-8 md:h-10 md:w-10" />
          </button>
        )}

        {/* Movies Container */}
        <div
          ref={rowRef}
          className="flex gap-2 overflow-x-scroll px-4 scrollbar-hide md:gap-3 md:px-8"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {movies.map((movie, index) => (
            <div key={movie.id} className="w-32 flex-shrink-0 md:w-48 lg:w-56">
              <MovieCard movie={movie} priority={index < 6} />
            </div>
          ))}
        </div>

        {/* Right Arrow */}
        {showRightArrow && (
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-0 z-10 flex h-full w-12 items-center justify-center bg-black/50 opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100 md:w-16"
            aria-label="Scroll right"
          >
            <ChevronRight className="h-8 w-8 md:h-10 md:w-10" />
          </button>
        )}
      </div>
    </div>
  );
}

