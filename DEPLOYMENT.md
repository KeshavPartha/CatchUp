# 🚀 Deployment Guide

This guide will walk you through deploying your Netflix Clone to production using GitHub and Vercel.

## 📋 Prerequisites

- [x] All features implemented and tested locally
- [x] Git repository initialized with 10 commits
- [x] Environment variables configured in `.env.local`
- [ ] GitHub account
- [ ] Vercel account (free tier is sufficient)

## 🎯 Deployment Steps

### Step 1: Create GitHub Repository

1. **Go to GitHub:**
   - Visit: https://github.com/new
   - Or click the "+" icon in the top right → "New repository"

2. **Repository Settings:**
   - **Repository name:** `netflix-clone` (or your preferred name)
   - **Description:** "A modern Netflix clone built with Next.js, TypeScript, and Supabase"
   - **Visibility:** Choose Public or Private
   - **DO NOT** initialize with README, .gitignore, or license (we already have these)

3. **Click "Create repository"**

### Step 2: Push Code to GitHub

After creating the repository, run these commands in your terminal:

```bash
# Add the remote repository (replace USERNAME with your GitHub username)
git remote add origin https://github.com/USERNAME/netflix-clone.git

# Verify the remote was added
git remote -v

# Push all commits to GitHub
git push -u origin main
```

**Alternative:** Use the helper script:
```bash
chmod +x push-to-github.sh
./push-to-github.sh
```

### Step 3: Deploy to Vercel

1. **Go to Vercel:**
   - Visit: https://vercel.com/new
   - Sign in with your GitHub account

2. **Import Repository:**
   - Click "Import Project"
   - Select your `netflix-clone` repository
   - Click "Import"

3. **Configure Project:**
   - **Framework Preset:** Next.js (auto-detected)
   - **Root Directory:** `./` (leave as default)
   - **Build Command:** `next build` (auto-detected)
   - **Output Directory:** `.next` (auto-detected)

4. **Add Environment Variables:**
   Click "Environment Variables" and add these three variables:

   ```
   NEXT_PUBLIC_TMDB_API_KEY=your_tmdb_api_key
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

5. **Deploy:**
   - Click "Deploy"
   - Wait 2-3 minutes for the build to complete
   - Your app will be live at: `https://your-project-name.vercel.app`

### Step 4: Configure Supabase for Production

1. **Update Supabase Site URL:**
   - Go to: https://supabase.com/dashboard/project/rggefkqarkncqtyzcfkb/auth/url-configuration
   - Add your Vercel URL to "Site URL": `https://your-project-name.vercel.app`
   - Add to "Redirect URLs": `https://your-project-name.vercel.app/**`

2. **Test Authentication:**
   - Visit your production site
   - Try signing up and logging in
   - Verify My List functionality works

## 🎉 Success!

Your Netflix Clone is now live! Here's what you have:

- ✅ **Production URL:** `https://your-project-name.vercel.app`
- ✅ **GitHub Repository:** `https://github.com/USERNAME/netflix-clone`
- ✅ **Automatic Deployments:** Every push to `main` triggers a new deployment
- ✅ **Preview Deployments:** Pull requests get their own preview URLs

## 🔄 Continuous Deployment

From now on, any changes you push to GitHub will automatically deploy:

```bash
# Make changes to your code
git add .
git commit -m "feat: add new feature"
git push origin main

# Vercel will automatically deploy the changes!
```

## 📊 Monitoring

- **Vercel Dashboard:** https://vercel.com/dashboard
  - View deployment logs
  - Monitor performance
  - Check analytics

- **Supabase Dashboard:** https://supabase.com/dashboard/project/rggefkqarkncqtyzcfkb
  - Monitor database usage
  - View authentication logs
  - Check API usage

## 🐛 Troubleshooting

**Build fails on Vercel:**
- Check the build logs in Vercel dashboard
- Ensure all environment variables are set correctly
- Verify the build works locally: `npm run build`

**Authentication not working:**
- Verify Supabase Site URL and Redirect URLs are configured
- Check environment variables in Vercel
- Ensure Supabase anon key is correct

**Images not loading:**
- Verify TMDB API key is set in Vercel
- Check Next.js image configuration in `next.config.js`

## 🎯 Next Steps

- Share your live app with friends!
- Monitor usage and performance
- Continue adding features
- Set up custom domain (optional)

