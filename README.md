# CatchUp

This repository currently uses the [RutwikPatel13/netflix-clone](https://github.com/RutwikPatel13/netflix-clone) project as its starter application. CatchUp-specific AI, social, sharing, and synchronized-watch features have not been implemented yet.

## Starter application: Netflix Clone

A modern, full-stack Netflix clone built with Next.js 15, TypeScript, Tailwind CSS, and Supabase.

🔗 **Live Demo**: [https://netflix-clone-opal-six-93.vercel.app](https://netflix-clone-opal-six-93.vercel.app)

![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38bdf8?style=for-the-badge&logo=tailwind-css)
![Supabase](https://img.shields.io/badge/Supabase-2-3ecf8e?style=for-the-badge&logo=supabase)

## ✨ Features

- 🔐 **User Authentication** - Secure sign up, login, and logout with Supabase
- 🎥 **Browse Movies & TV Shows** - Explore trending, popular, and top-rated content
- 🔍 **Search Functionality** - Find your favorite movies and shows
- 📝 **My List** - Save favorites to your personal watchlist (syncs across devices)
- ❤️ **Like Movies** - Like your favorite content
- ▶️ **Trailer Playback** - Watch trailers in fullscreen modal
- 📺 **Continue Watching** - Track your watch progress
- 📱 **Responsive Design** - Optimized for mobile, tablet, and desktop
- 🎨 **Netflix-style UI** - Authentic Netflix look and feel
- ⚡ **Fast Performance** - Built with Next.js 15 App Router
- 🎯 **Type Safety** - Full TypeScript implementation
- 💾 **Offline Support** - localStorage fallback when not logged in

## 🛠️ Tech Stack

### Frontend
- **[Next.js 15](https://nextjs.org/)** - React framework with App Router
- **[TypeScript](https://www.typescriptlang.org/)** - Type-safe JavaScript
- **[Tailwind CSS](https://tailwindcss.com/)** - Utility-first CSS framework
- **[Lucide Icons](https://lucide.dev/)** - Beautiful icon library

### Backend
- **[Supabase](https://supabase.com/)** - Backend-as-a-Service
  - PostgreSQL database
  - Authentication
  - Row Level Security (RLS)
- **[TMDB API](https://www.themoviedb.org/documentation/api)** - Movie database API

### Deployment
- **[Vercel](https://vercel.com/)** - Hosting and deployment

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ installed
- npm or yarn package manager
- Git
- TMDB API key (free)
- Supabase account (free)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/RutwikPatel13/netflix-clone.git
   cd netflix-clone
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```
   
   Fill in your API keys in `.env.local` (see [SETUP_INSTRUCTIONS.md](./SETUP_INSTRUCTIONS.md))

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   
   Navigate to [http://localhost:3000](http://localhost:3000)

## 📖 Documentation

For detailed setup instructions, see [SETUP_INSTRUCTIONS.md](./SETUP_INSTRUCTIONS.md)

## 🏗️ Project Structure

```
netflix-clone/
├── src/
│   ├── app/              # Next.js App Router pages
│   ├── components/       # React components
│   ├── lib/             # Utility functions and configurations
│   └── styles/          # Global styles
├── public/              # Static assets
├── .env.example         # Environment variables template
└── package.json         # Dependencies and scripts
```

## 📝 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint

## 📸 Preview

<div align="center">
  <img src="https://opengraph.githubassets.com/1/RutwikPatel13/netflix-clone" alt="Netflix Clone Preview" width="100%">
</div>

### ✨ Key Features Showcase
- **Browse**: Trending, popular, and top-rated movies and TV shows
- **Search**: Find any movie or TV show instantly
- **My List**: Save favorites and sync across devices
- **Continue Watching**: Pick up where you left off
- **Trailers**: Watch trailers in fullscreen modal

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🙏 Acknowledgments

- [Netflix](https://www.netflix.com/) for the design inspiration
- [TMDB](https://www.themoviedb.org/) for the movie database API
- [Supabase](https://supabase.com/) for the backend infrastructure

## 📧 Contact

Rutwik Patel - [GitHub](https://github.com/RutwikPatel13)

Project Link: [https://github.com/RutwikPatel13/netflix-clone](https://github.com/RutwikPatel13/netflix-clone)

---

Made with ❤️ and Next.js
