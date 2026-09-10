'use client';

import { useEffect, useCallback } from 'react';
import { X } from 'lucide-react';

interface TrailerModalProps {
  videoKey: string;
  title: string;
  onClose: () => void;
}

export function TrailerModal({ videoKey, title, onClose }: TrailerModalProps) {
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [handleEscape]);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      {/* Close Button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
        aria-label="Close"
      >
        <X className="h-8 w-8" />
      </button>

      {/* Video Container */}
      <div 
        className="relative w-full max-w-6xl mx-4 aspect-video"
        onClick={(e) => e.stopPropagation()}
      >
        <iframe
          src={`https://www.youtube.com/embed/${videoKey}?autoplay=1&rel=0&modestbranding=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-full rounded-lg"
        />
      </div>

      {/* Title */}
      <div className="absolute bottom-8 left-0 right-0 text-center">
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className="text-netflix-lightGray mt-1">Press ESC or click outside to close</p>
      </div>
    </div>
  );
}

