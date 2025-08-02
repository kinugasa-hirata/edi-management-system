# setup.ps1 - EDI Management System Setup Script for Windows PowerShell

Write-Host "🚀 Setting up EDI Management System..." -ForegroundColor Green

# Check if Node.js is installed
try {
    $nodeVersion = node -v
    Write-Host "✅ Node.js $nodeVersion detected" -ForegroundColor Green
    
    # Check if version is 18 or higher
    $majorVersion = [int]($nodeVersion -replace "v(\d+)\..*", '$1')
    if ($majorVersion -lt 18) {
        Write-Host "❌ Node.js version 18 or higher is required. Current version: $nodeVersion" -ForegroundColor Red
        Write-Host "Please visit: https://nodejs.org/" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "❌ Node.js is not installed. Please install Node.js 18+ first." -ForegroundColor Red
    Write-Host "Visit: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Install dependencies
Write-Host "📦 Installing dependencies..." -ForegroundColor Blue
npm install

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Dependencies installed successfully" -ForegroundColor Green

# Create .env file if it doesn't exist
if (-not (Test-Path ".env")) {
    Write-Host "⚙️  Creating .env file..." -ForegroundColor Blue
    Copy-Item ".env.example" ".env"
    
    # Generate a random session secret
    $sessionSecret = [System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes([System.Guid]::NewGuid().ToString()))
    
    # Update .env file with generated secret
    $envContent = Get-Content ".env" -Raw
    $envContent = $envContent -replace "your-super-secret-session-key-here", $sessionSecret
    Set-Content ".env" $envContent
    
    Write-Host "✅ Environment file created with generated session secret" -ForegroundColor Green
} else {
    Write-Host "✅ .env file already exists" -ForegroundColor Green
}

# Create uploads directory
if (-not (Test-Path "uploads")) {
    Write-Host "📁 Creating uploads directory..." -ForegroundColor Blue
    New-Item -ItemType Directory -Name "uploads" | Out-Null
    New-Item -ItemType File -Path "uploads\.gitkeep" | Out-Null
    Write-Host "✅ Uploads directory created" -ForegroundColor Green
}

# Initialize git repository if not already initialized
if (-not (Test-Path ".git")) {
    Write-Host "🔧 Initializing Git repository..." -ForegroundColor Blue
    git init
    git add .
    git commit -m "Initial commit: EDI Management System setup"
    Write-Host "✅ Git repository initialized" -ForegroundColor Green
}

Write-Host ""
Write-Host "🎉 Setup completed successfully!" -ForegroundColor Green -BackgroundColor DarkGreen
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Start development server: " -NoNewline; Write-Host "npm run dev" -ForegroundColor Cyan
Write-Host "2. Visit: " -NoNewline; Write-Host "http://localhost:3000" -ForegroundColor Cyan
Write-Host "3. Login with: " -NoNewline; Write-Host "admin + any 4 digits (e.g., admin1234)" -ForegroundColor Cyan
Write-Host ""
Write-Host "For production deployment:" -ForegroundColor Yellow
Write-Host "1. Install Vercel CLI: " -NoNewline; Write-Host "npm i -g vercel" -ForegroundColor Cyan
Write-Host "2. Login to Vercel: " -NoNewline; Write-Host "vercel login" -ForegroundColor Cyan
Write-Host "3. Deploy: " -NoNewline; Write-Host "vercel" -ForegroundColor Cyan
Write-Host ""
Write-Host "📚 Read README.md for detailed documentation" -ForegroundColor Magenta

# Check if Vercel CLI is installed
try {
    vercel --version | Out-Null
    Write-Host "✅ Vercel CLI detected - ready for deployment" -ForegroundColor Green
} catch {
    Write-Host "💡 Install Vercel CLI for easy deployment: " -NoNewline; Write-Host "npm i -g vercel" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Happy coding! 🚀" -ForegroundColor Green