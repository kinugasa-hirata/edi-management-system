# EDI Management System

A comprehensive web application for managing Electronic Data Interchange (EDI) orders with authentication, database integration, and real-time data management.

## 🚀 Features

- **Secure Authentication**: Admin access with username format `admin` + 4 digits
- **EDI Data Import**: Upload and process WebEDI files (.csv, .tsv, .EDIdat)
- **Smart Duplicate Detection**: Prevents duplicate orders based on Order Number
- **Editable Status Column**: Add comments and status updates to each order
- **Custom Sorting**: Orders sorted by Drawing Number priority, then by Delivery Date
- **Real-time Updates**: Live data editing with save functionality
- **Responsive Design**: Works on desktop and mobile devices

## 📊 Data Structure

The system manages 6 columns of EDI data:# 📊 Enhanced EDI Management System

A comprehensive Electronic Data Interchange (EDI) management system with integrated material stock management, production forecasting, and real-time dashboard analytics.

## 🚀 Features

### Core EDI Management
- **📁 WebEDI File Import**: Support for CSV, TSV, and Excel formats with automatic encoding detection
- **📊 Real-time Dashboard**: Interactive charts with delivery date visualization
- **👥 Multi-user Access**: Admin (edit) and User (view-only) roles
- **💾 Data Export**: CSV and JSON export functionality
- **🔄 Live Updates**: Cross-window synchronization between dashboard, forecast, and stock pages

### Advanced Material Stock Integration
- **📦 Material Stock Management**: Track inventory for 3 product groups
  - 🔧 ｱｯﾊﾟﾌﾞﾚｰﾑ (Upper Frame): PP4166-4681P003, PP4166-4681P004
  - 📱 ﾄｯﾌﾟﾌﾟﾚｰﾄ (Top Plate): PP4166-4726P003, PP4166-4726P004  
  - ⚙️ ﾐﾄﾞﾙﾌﾚｰﾑ (Middle Frame): PP4166-4731P002, PP4166-7106P001, PP4166-7106P003

- **🧮 Smart Consumption Calculation**: 
  - Chronological stock consumption simulation
  - Excludes completed orders (status = "ok")
  - Includes forecast data as future consumption
  - Real-time stock sufficiency analysis

- **📈 Visual Stock Integration**: 
  - Charts show material availability in real-time
  - Sufficient stock: Normal filled bars
  - Insufficient stock: Transparent bars with dashed outlines
  - Proper priority stacking: OK (bottom) → Comments (middle) → No Status (top)

### Production Forecast Management
- **📈 Monthly Forecasting**: Integrated 12-month rolling forecast
- **📊 Excel Import**: Automatic month column detection (Japanese/English)
- **🔄 Dashboard Integration**: Forecast data appears as future demand
- **💾 Persistent Storage**: Database + localStorage synchronization

## 🛠️ Installation

### Prerequisites
- Node.js 16+ 
- npm or yarn
- Optional: PostgreSQL for production (uses Vercel Postgres when deployed)

### Local Development Setup

1. **Clone Repository**
```bash
git clone https://github.com/your-username/edi-management-system.git
cd edi-management-system
```

2. **Install Dependencies**
```bash
npm install
```

3. **Configure Environment**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Start Development Server**
```bash
npm run dev
# or
npm start
```

5. **Access Application**
- Open http://localhost:3000
- Login with:
  - Admin: username `admin`, any password
  - User: username `user`, any password

## 🏗️ Deployment

### Vercel Deployment (Recommended)

1. **Connect to Vercel**
```bash
npm i -g vercel
vercel login
vercel
```

2. **Add Vercel Postgres**
- Go to Vercel Dashboard → Your Project → Storage
- Create → Postgres Database
- Environment variables will be automatically set

3. **Deploy**
```bash
vercel --prod
```

### Manual Deployment

1. **Set Environment Variables**
```bash
export NODE_ENV=production
export SESSION_SECRET=your-secure-session-secret
# Add database connection strings
```

2. **Build and Start**
```bash
npm run build
npm start
```

## 📖 Usage Guide

### 1. Import EDI Data
1. Login as admin user
2. Click "📁 Choose EDI File" 
3. Select your WebEDI CSV/Excel file
4. Click "📤 Import WebEDI Data"
5. Data will be processed and charts will update

### 2. Manage Material Stocks
1. Navigate to "📦 Material Stock" page
2. Enter current inventory quantities for each product group
3. Click "💾 Save All Stock Levels"
4. Dashboard charts will immediately show stock availability

### 3. Setup Production Forecasts  
1. Navigate to "📈 Forecast" page
2. Either:
   - Manually enter quantities in the table
   - Import Excel file with month columns
3. Click "💾 Save All Changes"
4. Forecasts appear as future demand in dashboard charts

### 4. Monitor Dashboard
- **📊 All Orders**: Complete overview with table and stats
- **Product Pages**: Individual charts for each drawing number
- **📈 Real-time Updates**: Charts reflect current stock availability
- **📁 Export**: Download data as CSV or JSON

## 🔧 API Endpoints

### Authentication
- `POST /api/login` - User login
- `POST /api/logout` - User logout  
- `GET /api/user-info` - Get current user info

### EDI Data
- `GET /api/edi-data` - Get all EDI orders
- `PUT /api/edi-data/:id` - Update order status
- `POST /api/import-edi` - Import EDI file

### Forecasts
- `GET /api/forecasts` - Get all forecasts
- `POST /api/forecasts` - Save individual forecast
- `POST /api/forecasts/batch` - Save multiple forecasts
- `POST /api/import-forecast` - Import forecast Excel
- `DELETE /api/forecasts/clear` - Clear all forecasts

### Material Stocks  
- `GET /api/material-stocks` - Get all stock levels
- `POST /api/material-stocks` - Save stock levels
- `DELETE /api/material-stocks/clear` - Clear all stocks

### Exports
- `GET /api/export/csv` - Export EDI data as CSV
- `GET /api/export/json` - Export EDI data as JSON

## 🏗️ Technical Architecture

### Frontend
- **Vanilla JavaScript**: No framework dependencies
- **SVG Charts**: Custom-built interactive charts
- **Real-time Sync**: localStorage + cross-window communication
- **Responsive Design**: Mobile-friendly interface

### Backend  
- **Express.js**: RESTful API server
- **Session Management**: Express-session with secure cookies
- **File Processing**: Multer + CSV-parser + XLSX
- **Database**: PostgreSQL (production) / In-memory (development)

### Data Flow
1. **Import**: WebEDI files → CSV parsing → Database storage
2. **Processing**: Orders + Forecasts → Stock consumption calculation
3. **Visualization**: Real-time chart rendering with stock integration
4. **Export**: Database → Formatted files (CSV/JSON)

## 🧮 Stock Calculation Logic

The system implements sophisticated material stock consumption logic:

### Consumption Priority
1. **Excludes Completed**: Orders with status "ok" don't consume stock
2. **Chronological Processing**: Orders processed by delivery date (earliest first)
3. **Includes Forecasts**: Future forecast quantities consume projected stock
4. **Group-based**: Stock shared within product groups (Upper Frame, Top Plate, Middle Frame)

### Visual Indicators
- **🟢 Sufficient Stock**: Normal filled colored bars
- **🔴 Insufficient Stock**: Transparent bars with dashed red outlines  
- **⚠️ Partial Stock**: Warning indicators for partial fulfillment

### Calculation Example
```
Initial Stock: 1,000 pieces (Upper Frame)
Orders: 300 (2025/01/15), 400 (2025/01/20), 500 (2025/02/01)
Forecast: 200 (2025/02/01)

Result:
- 2025/01/15: 1,000 - 300 = 700 ✅ SUFFICIENT
- 2025/01/20: 700 - 400 = 300 ✅ SUFFICIENT  
- 2025/02/01: 300 - 500 = -200 ❌ INSUFFICIENT (chart shows transparent)
- 2025/02/01 Forecast: Already insufficient
```

## 🔍 Debug Features

### Testing Functions (Available in Browser Console)
```javascript
// Test forecast integration
testForecastDebug()
testForecastIntegrity()

// Test stock calculations  
testStockIntegration()

// Test API connections
testForecastAPI()
testSessionDebug()

// Force refresh charts
testForceRefreshCharts()
```

### Debug Endpoints
- `GET /api/debug/forecasts` - Inspect forecast data
- `GET /api/debug/stocks` - Inspect stock calculations

## 🚨 Troubleshooting

### Common Issues

1. **File Import Fails**
   - Check file format (CSV/Excel)
   - Verify Japanese encoding (Shift-JIS supported)
   - Ensure file size < 4MB

2. **Charts Not Updating**
   - Check browser console for JavaScript errors
   - Verify forecast data format (MM/01)
   - Test with `testForceRefreshCharts()`

3. **Stock Calculations Wrong**
   - Verify stock input values are saved
   - Check product group mappings
   - Use debug endpoint: `/api/debug/stocks`

4. **Cross-window Sync Issues**
   - Check localStorage permissions
   - Verify multiple tabs are in same domain
   - Clear browser cache

### Performance Tips
- **Large Datasets**: System tested with 1000+ orders
- **Memory Usage**: Uses efficient in-memory processing
- **Chart Rendering**: Automatic optimization for mobile devices
- **Database**: Indexed queries for fast data retrieval

## 📝 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)  
5. Open Pull Request

## 📞 Support

For issues, questions, or feature requests:
- 🐛 **Bug Reports**: GitHub Issues
- 💡 **Feature Requests**: GitHub Discussions  
- 📧 **Email**: your-email@company.com

---

**Built with ❤️ for efficient production planning and material management**
1. **注文番号** (Order Number) - Format: LKxxxxxxxxx
2. **注文数量** (Quantity) - Numeric values
3. **品名** (Product Name) - Japanese product descriptions
4. **図番** (Drawing Number) - Format: PP4166-xxxxPxxx
5. **納期** (Delivery Date) - Format: YYYY/MM/DD
6. **Status** - Editable comments/status field

## 🎯 Drawing Number Priority Order

Orders are sorted by this priority sequence:
1. PP4166-4681P003
2. PP4166-4681P004
3. PP4166-4726P003
4. PP4166-4726P004
5. PP4166-4731P002
6. PP4166-7106P001
7. PP4166-7106P003

## 🛠️ Technology Stack

- **Backend**: Node.js with Express
- **Database**: Vercel Postgres (free tier)
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Deployment**: Vercel
- **Authentication**: Session-based auth
- **File Processing**: CSV/TSV parsing

## 📋 Prerequisites

- Node.js 18+ installed
- Vercel account for deployment
- Git for version control

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/edi-management-system.git
cd edi-management-system
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Setup

Create a `.env` file from the example:

```bash
cp .env.example .env
```

Edit `.env` and add your configuration:

```env
SESSION_SECRET=your-super-secret-session-key-here
PORT=3000
```

### 4. Local Development

```bash
npm run dev
```

Visit `http://localhost:3000` to access the application.

### 5. Login Credentials

- **Username**: admin + any 4 digits (e.g., `admin1234`, `admin5678`)
- **Password**: Any password (authentication is based on username format)

## 🌐 Deployment to Vercel

### 1. Install Vercel CLI

```bash
npm i -g vercel
```

### 2. Login to Vercel

```bash
vercel login
```

### 3. Set up Database

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Create a new Postgres database
3. Note the connection details

### 4. Deploy

```bash
vercel
```

Follow the prompts to deploy your application.

### 5. Set Environment Variables

In your Vercel dashboard:
1. Go to your project settings
2. Add environment variables:
   - `SESSION_SECRET`: A secure random string

The Postgres environment variables are automatically set by Vercel.

## 📁 Project Structure

```
edi-management-system/
├── server.js              # Main Express server
├── package.json           # Dependencies and scripts
├── vercel.json            # Vercel deployment config
├── .env.example           # Environment variables template
├── README.md              # This file
├── public/
│   ├── login.html         # Login page
│   └── dashboard.html     # Main dashboard
└── uploads/               # Temporary file storage (auto-created)
```

## 🔧 API Endpoints

### Authentication
- `POST /api/login` - User login
- `POST /api/logout` - User logout

### EDI Data Management
- `GET /api/edi-data` - Fetch all EDI orders (sorted)
- `PUT /api/edi-data/:id` - Update order status
- `POST /api/import-edi` - Import EDI file

## 📊 Database Schema

```sql
CREATE TABLE edi_orders (
  id SERIAL PRIMARY KEY,
  order_number VARCHAR(50) UNIQUE NOT NULL,
  quantity INTEGER,
  product_name VARCHAR(255),
  drawing_number VARCHAR(100),
  delivery_date VARCHAR(20),
  status TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 🔒 Security Features

- Session-based authentication
- Username format validation
- File type restrictions for uploads
- SQL injection protection with parameterized queries
- CORS protection

## 📱 Usage Guide

### Logging In
1. Visit the application URL
2. Enter username in format: `admin` + 4 digits (e.g., `admin1234`)
3. Enter any password
4. Click "Login"

### Importing EDI Data
1. Click "Choose EDI File" button
2. Select your WebEDI file (.csv, .tsv, .EDIdat)
3. Click "Import WebEDI Data"
4. System will check for duplicates and import new orders

### Managing Orders
1. View orders in the table (auto-sorted by drawing number priority)
2. Add comments in the "Status" column
3. Click individual "Save" buttons or "Save All Changes"
4. Changes are immediately saved to the database

### File Format Requirements

Your EDI file should be tab-separated with these columns:
- Column 7: Order Number (LK format)
- Column 15: Quantity
- Column 21: Product Name
- Column 23: Drawing Number (PP4166 format)
- Column 28: Delivery Date

## 🐛 Troubleshooting

### Common Issues

1. **Login fails**: Ensure username follows `admin` + 4 digits format
2. **Import fails**: Check file format and column positions
3. **Database errors**: Verify Vercel Postgres is properly configured
4. **Deployment issues**: Check Vercel logs for detailed error messages

### Debug Mode

For local development, enable detailed logging:

```bash
DEBUG=* npm run dev
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature-name`
5. Submit a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 📞 Support

For issues and questions:
1. Check the troubleshooting section
2. Review Vercel deployment logs
3. Create an issue in the GitHub repository

## 🔄 Version History

- **v1.0.0**: Initial release with full EDI management functionality
  - Authentication system
  - EDI import/export
  - Status management
  - Vercel deployment ready

---

**Built with ❤️ for efficient EDI data management**