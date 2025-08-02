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

The system manages 6 columns of EDI data:

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