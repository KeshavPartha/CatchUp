# Netflix Clone - Setup Instructions

## 🚀 Quick Start Guide

### 1. Create GitHub Repository

1. Go to [GitHub](https://github.com/new)
2. Repository name: `netflix-clone`
3. Description: `A modern Netflix clone built with Next.js 15, TypeScript, Tailwind CSS, Supabase, and TMDB API`
4. Choose **Public** or **Private**
5. **DO NOT** initialize with README, .gitignore, or license
6. Click **Create repository**

### 2. Push Code to GitHub

After creating the repository, run these commands:

```bash
git remote add origin https://github.com/YOUR_USERNAME/netflix-clone.git
git branch -M main
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

### 3. Set Up TMDB API

1. Go to [TMDB](https://www.themoviedb.org/signup)
2. Create a free account
3. Go to Settings → API → Create API Key
4. Choose "Developer" option
5. Fill in the required information
6. Copy your API Key

### 4. Set Up Supabase

1. Go to [Supabase](https://supabase.com)
2. Create a new project
3. Wait for the project to be ready
4. Go to Project Settings → API
5. Copy:
   - Project URL
   - `anon` public key
   - `service_role` secret key (keep this secure!)

### 5. Configure Environment Variables

Create a `.env.local` file in the root directory:

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your keys:

```env
# TMDB API Configuration
NEXT_PUBLIC_TMDB_API_KEY=your_actual_tmdb_api_key
NEXT_PUBLIC_TMDB_BASE_URL=https://api.themoviedb.org/3

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 6. Install Dependencies (if not already done)

```bash
npm install
```

### 7. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 8. Deploy to Vercel

1. Go to [Vercel](https://vercel.com)
2. Sign in with GitHub
3. Click **Add New** → **Project**
4. Import your `netflix-clone` repository
5. Configure environment variables (same as `.env.local`)
6. Click **Deploy**

Vercel will automatically deploy your app and provide a URL!

## 📝 Next Steps

After setup, the development will continue with:
- Setting up Supabase database schema
- Creating authentication pages
- Building movie browsing features
- Implementing search functionality
- Adding watchlist/favorites
- Creating video player

## 🔗 Useful Links

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [TMDB API Documentation](https://developers.themoviedb.org/3)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Vercel Documentation](https://vercel.com/docs)

