# 🗄️ Supabase Setup Guide

## ✅ Environment Variables Configured

Your `.env.local` file has been configured with:
- ✅ TMDB API Key
- ✅ Supabase Project URL
- ✅ Supabase Anon Key

## 📝 Next Step: Run Database Schema

### 1. Open Supabase SQL Editor

Go to: https://supabase.com/dashboard/project/rggefkqarkncqtyzcfkb/sql/new

### 2. Copy the SQL Schema

Open the file `supabase-schema.sql` in your project and copy all the content.

### 3. Execute the SQL

1. Paste the SQL into the Supabase SQL Editor
2. Click the "Run" button (or press Ctrl/Cmd + Enter)
3. You should see success messages

### 4. Verify Tables Created

Go to: https://supabase.com/dashboard/project/rggefkqarkncqtyzcfkb/editor

You should see two new tables:
- `profiles` - User profile information
- `my_list` - User watchlist/favorites

## 🧪 Test Authentication

Once the database is set up:

1. **Go to Signup Page:**
   - http://localhost:3006/signup

2. **Create a Test Account:**
   - Enter your name, email, and password
   - Click "Sign Up"

3. **Verify in Supabase:**
   - Go to: https://supabase.com/dashboard/project/rggefkqarkncqtyzcfkb/auth/users
   - You should see your new user
   - Check the `profiles` table - a profile should be auto-created

4. **Test Login:**
   - Go to: http://localhost:3006/login
   - Login with your credentials

## 🎯 What the Database Schema Provides

### Tables:

**profiles**
- Stores user profile data (name, email, avatar)
- Automatically created when a user signs up
- Linked to Supabase auth.users

**my_list**
- Stores user's favorite movies/shows
- Each user can only see their own list
- Prevents duplicate entries

### Security:

**Row Level Security (RLS)**
- Users can only access their own data
- Automatic enforcement at database level
- No way to access other users' information

### Triggers:

**Auto-create Profile**
- When a user signs up, a profile is automatically created
- Copies name and email from signup form

**Auto-update Timestamps**
- Automatically updates `updated_at` when profile changes

## 🚀 After Database Setup

Once you've run the SQL schema, you can:

1. ✅ Sign up new users
2. ✅ Login/logout functionality
3. ✅ User profiles
4. ✅ Add movies to "My List" (feature to be built)

## 📌 Important Notes

- The `.env.local` file is NOT committed to git (for security)
- When deploying to Vercel, you'll need to add these environment variables in the Vercel dashboard
- The database password you provided is stored securely in Supabase

## 🔗 Quick Links

- **Supabase Dashboard:** https://supabase.com/dashboard/project/rggefkqarkncqtyzcfkb
- **SQL Editor:** https://supabase.com/dashboard/project/rggefkqarkncqtyzcfkb/sql/new
- **Table Editor:** https://supabase.com/dashboard/project/rggefkqarkncqtyzcfkb/editor
- **Auth Users:** https://supabase.com/dashboard/project/rggefkqarkncqtyzcfkb/auth/users
- **API Settings:** https://supabase.com/dashboard/project/rggefkqarkncqtyzcfkb/settings/api

## ❓ Need Help?

If you encounter any issues:
1. Check the Supabase logs in the dashboard
2. Verify the SQL ran without errors
3. Make sure the dev server restarted after adding env variables
4. Check browser console for any error messages

