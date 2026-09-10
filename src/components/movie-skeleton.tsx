export function MovieCardSkeleton() {
  return (
    <div className="aspect-[2/3] animate-pulse rounded-md bg-netflix-gray" />
  );
}

export function MovieRowSkeleton() {
  return (
    <div className="mb-8">
      {/* Title Skeleton */}
      <div className="mb-4 h-8 w-48 animate-pulse rounded bg-netflix-gray px-4 md:px-8" />

      {/* Movies Container */}
      <div className="flex gap-2 px-4 md:gap-3 md:px-8">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="w-32 flex-shrink-0 md:w-48 lg:w-56">
            <MovieCardSkeleton />
          </div>
        ))}
      </div>
    </div>
  );
}

export function HeroBannerSkeleton() {
  return (
    <div className="relative h-[80vh] min-h-[600px] w-full animate-pulse bg-netflix-darkGray">
      <div className="absolute bottom-0 left-0 right-0 p-8 md:p-16">
        <div className="mx-auto max-w-screen-2xl space-y-4">
          {/* Title */}
          <div className="h-16 w-96 rounded bg-netflix-gray" />
          {/* Description */}
          <div className="h-24 w-full max-w-2xl rounded bg-netflix-gray" />
          {/* Buttons */}
          <div className="flex gap-4">
            <div className="h-12 w-32 rounded bg-netflix-gray" />
            <div className="h-12 w-32 rounded bg-netflix-gray" />
          </div>
        </div>
      </div>
    </div>
  );
}

