import Link from 'next/link';
import { Facebook, Instagram, Twitter, Youtube } from 'lucide-react';

const footerLinks = [
  { name: 'Audio Description', href: '#' },
  { name: 'Help Center', href: '#' },
  { name: 'Gift Cards', href: '#' },
  { name: 'Media Center', href: '#' },
  { name: 'Investor Relations', href: '#' },
  { name: 'Jobs', href: '#' },
  { name: 'Terms of Use', href: '#' },
  { name: 'Privacy', href: '#' },
  { name: 'Legal Notices', href: '#' },
  { name: 'Cookie Preferences', href: '#' },
  { name: 'Corporate Information', href: '#' },
  { name: 'Contact Us', href: '#' },
];

const socialLinks = [
  { name: 'Facebook', icon: Facebook, href: '#' },
  { name: 'Instagram', icon: Instagram, href: '#' },
  { name: 'Twitter', icon: Twitter, href: '#' },
  { name: 'YouTube', icon: Youtube, href: '#' },
];

export function Footer() {
  return (
    <footer className="border-t border-netflix-gray bg-netflix-black py-12">
      <div className="mx-auto max-w-screen-2xl px-4 md:px-8">
        {/* Social Links */}
        <div className="mb-8 flex gap-6">
          {socialLinks.map((social) => {
            const Icon = social.icon;
            return (
              <Link
                key={social.name}
                href={social.href}
                className="text-netflix-lightGray hover:text-white transition-colors"
                aria-label={social.name}
              >
                <Icon className="h-6 w-6" />
              </Link>
            );
          })}
        </div>

        {/* Footer Links */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {footerLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              className="text-sm text-netflix-lightGray hover:underline"
            >
              {link.name}
            </Link>
          ))}
        </div>

        {/* Service Code Button */}
        <button className="mb-6 border border-netflix-lightGray px-4 py-2 text-sm text-netflix-lightGray hover:border-white hover:text-white transition-colors">
          Service Code
        </button>

        {/* Disclaimer */}
        <div className="mb-6 rounded-lg bg-netflix-gray/30 p-4">
          <p className="text-xs text-netflix-lightGray leading-relaxed">
            <strong className="text-white">Disclaimer:</strong> This is a demo project for educational purposes only.
            This application does not stream actual movies or TV shows. All video content shown is official trailers
            sourced from YouTube via the TMDB API. This project is not affiliated with, endorsed by, or connected to
            Netflix, Inc. in any way. All movie/TV show metadata, images, and trailers are provided by{' '}
            <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer" className="text-netflix-red hover:underline">
              The Movie Database (TMDB)
            </a>
            . Netflix and the Netflix logo are trademarks of Netflix, Inc.
          </p>
        </div>

        {/* Copyright */}
        <p className="text-sm text-netflix-lightGray">
          © {new Date().getFullYear()} Netflix Clone. Built with Next.js, TypeScript, and Supabase.
        </p>
      </div>
    </footer>
  );
}

