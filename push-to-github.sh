#!/bin/bash

# Netflix Clone - GitHub Push Script
# This script helps you create a GitHub repository and push your code

echo "🎬 Netflix Clone - GitHub Setup"
echo "================================"
echo ""

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "❌ Error: Git repository not initialized"
    exit 1
fi

echo "📝 Please follow these steps:"
echo ""
echo "1. Go to https://github.com/new"
echo "2. Repository name: netflix-clone"
echo "3. Description: A modern Netflix clone built with Next.js 15, TypeScript, Tailwind CSS, Supabase, and TMDB API"
echo "4. Choose Public or Private"
echo "5. DO NOT initialize with README, .gitignore, or license"
echo "6. Click 'Create repository'"
echo ""
read -p "Press Enter after you've created the repository..."

echo ""
read -p "Enter your GitHub username: " github_username

if [ -z "$github_username" ]; then
    echo "❌ Error: GitHub username cannot be empty"
    exit 1
fi

echo ""
echo "🔗 Setting up remote repository..."
git remote add origin "https://github.com/$github_username/netflix-clone.git" 2>/dev/null || git remote set-url origin "https://github.com/$github_username/netflix-clone.git"

echo "📤 Pushing code to GitHub..."
git branch -M main
git push -u origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Success! Your code has been pushed to GitHub"
    echo ""
    echo "🔗 Repository URL: https://github.com/$github_username/netflix-clone"
    echo ""
    echo "📋 Next steps:"
    echo "1. Set up TMDB API key (see SETUP_INSTRUCTIONS.md)"
    echo "2. Set up Supabase project (see SETUP_INSTRUCTIONS.md)"
    echo "3. Configure environment variables"
    echo "4. Deploy to Vercel"
else
    echo ""
    echo "❌ Error: Failed to push to GitHub"
    echo "Please check your credentials and try again"
    exit 1
fi

