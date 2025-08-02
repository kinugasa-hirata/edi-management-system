#!/bin/bash

# EDI Management System Setup Script
echo "🚀 Setting up EDI Management System..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    echo "Visit: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$node_version" -lt 18 ]; then
    echo "❌ Node.js version 18 or higher is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed successfully"

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "⚙️  Creating .env file..."
    cp .env.example .env
    
    # Generate a random session secret
    session_secret=$(openssl rand -base64 32 2>/dev/null || date +%s | sha256sum | base64 | head -c 32)
    
    # Update .env file with generated secret
    if command -v sed &> /dev/null; then
        sed -i.bak "s/your-super-secret-session-key-here/$session_secret/" .env && rm .env.bak
        echo "✅ Environment file created with generated session secret"
    else
        echo "⚠️  Please manually edit .env file and set SESSION_SECRET"
    fi
else
    echo "✅ .env file already exists"
fi

# Create uploads directory
if [ ! -d "uploads" ]; then
    echo "📁 Creating uploads directory..."
    mkdir uploads
    touch uploads/.gitkeep
    echo "✅ Uploads directory created"
fi

# Initialize git repository if not already initialized
if [ ! -d ".git" ]; then
    echo "🔧 Initializing Git repository..."
    git init
    git add .
    git commit -m "Initial commit: EDI Management System setup"
    echo "✅ Git repository initialized"
fi

echo ""
echo "🎉 Setup completed successfully!"
echo ""
echo "Next steps:"
echo "1. Start development server: npm run dev"
echo "2. Visit: http://localhost:3000"
echo "3. Login with: admin + any 4 digits (e.g., admin1234)"
echo ""
echo "For production deployment:"
echo "1. Install Vercel CLI: npm i -g vercel"
echo "2. Login to Vercel: vercel login"
echo "3. Deploy: vercel"
echo ""
echo "📚 Read README.md for detailed documentation"

# Check if Vercel CLI is installed
if command -v vercel &> /dev/null; then
    echo "✅ Vercel CLI detected - ready for deployment"
else
    echo "💡 Install Vercel CLI for easy deployment: npm i -g vercel"
fi

echo ""
echo "Happy coding! 🚀"