import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-6 w-6 border-2',
    md: 'h-12 w-12 border-4',
    lg: 'h-16 w-16 border-4',
  };

  return (
    <div
      className={cn(
        'animate-spin rounded-full border-netflix-red border-t-transparent',
        sizeClasses[size],
        className
      )}
    />
  );
}

interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message = 'Loading...' }: LoadingScreenProps) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <LoadingSpinner size="lg" className="mx-auto mb-4" />
        <p className="text-netflix-lightGray">{message}</p>
      </div>
    </div>
  );
}

interface PageLoadingProps {
  message?: string;
}

export function PageLoading({ message = 'Loading...' }: PageLoadingProps) {
  return (
    <main className="min-h-screen px-4 py-20 md:px-8">
      <div className="mx-auto max-w-screen-2xl">
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <LoadingSpinner className="mx-auto mb-4" />
            <p className="text-netflix-lightGray">{message}</p>
          </div>
        </div>
      </div>
    </main>
  );
}

