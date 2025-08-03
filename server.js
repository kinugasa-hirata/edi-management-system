const express = require('express');
const session = require('express-session');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Check if we're in production (Vercel) or development
const isProduction = process.env.VERCEL || process.env.NODE_ENV === 'production';
let sql = null;

// 🔧 NEW - Excel functionality
let ExcelJS;
try {
  ExcelJS = require('exceljs');
  console.log('✅ ExcelJS available for Excel operations');
} catch (error) {
  console.log('⚠️ ExcelJS not found - Excel features will be limited');
  ExcelJS = null;
}

// Initialize database connection
if (isProduction) {
  try {
    const { sql: vercelSql } = require('@vercel/postgres');
    sql = vercelSql;
    console.log('🌐 Using Vercel Postgres (Production)');
  } catch (error) {
    console.error('❌ Failed to initialize Vercel Postgres:', error);
    sql = null;
  }
} else {
  console.log('🛠️ Using in-memory storage (Development)');
}

// In-memory storage for local development
let inMemoryData = [];
let inMemoryForecasts = [];
let nextId = 1;
let nextForecastId = 1;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving - FIXED PATH
app.use(express.static(path.join(__dirname, 'public')));

// FIXED SESSION CONFIGURATION
app.use(session({
  secret: process.env.SESSION_SECRET || 'edi-secret-key-2024-super-secure',
  resave: false,
  saveUninitialized: false,
  rolling: true, // Reset expiry on each request
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    secure: false, // Keep false for both development and production for now
    httpOnly: true,
    sameSite: 'lax'
  },
  name: 'edi.session.id'
}));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📍 ${req.method} ${req.path}`);
  next();
});

// Serverless-compatible Multer configuration (memory storage)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 4 * 1024 * 1024 // 4MB limit for serverless
  }
});

// Drawing Number priority order
const DRAWING_NUMBER_ORDER = [
  'PP4166-4681P003', // Product name: ｱｯﾊﾟﾌﾞﾚｰﾑ
  'PP4166-4681P004', // Product name: ｱｯﾊﾟﾌﾞﾚｰﾑ
  'PP4166-4726P003', // Product name: ﾄｯﾌﾟﾌﾟﾚｰﾄ
  'PP4166-4726P004', // Product name: ﾄｯﾌﾟﾌﾟﾚｰﾄ
  'PP4166-4731P002', // Product name: ﾐﾄﾞﾙﾌﾚｰﾑ
  'PP4166-7106P001', // Product name: ﾐﾄﾞﾙﾌﾚｰﾑ
  'PP4166-7106P003' // Product name: ﾐﾄﾞﾙﾌﾚｰﾑ
];

// NEW UTILITY FUNCTION - Date format normalization
function normalizeMonthDate(monthDate) {
  if (!monthDate) return monthDate;
  
  // Handle various date formats and normalize to MM/01
  if (monthDate.includes('/')) {
    const parts = monthDate.split('/');
    if (parts.length >= 2) {
      const month = parts[0].padStart(2, '0');
      return `${month}/01`;
    }
  }
  
  // If it's just a month number, format it properly
  if (/^\d+$/.test(monthDate)) {
    return `${monthDate.padStart(2, '0')}/01`;
  }
  
  return monthDate;
}

// ENHANCED AUTHENTICATION MIDDLEWARE
function enhancedRequireAuth(req, res, next) {
  console.log('🔐 Auth check - Session ID:', req.sessionID);
  console.log('🔐 Auth check - Session data:', JSON.stringify(req.session, null, 2));
  console.log('🔐 Auth check - User:', req.session?.user);
  
  if (req.session && req.session.user) {
    console.log('✅ Authentication successful for:', req.session.user.username);
    next();
  } else {
    console.log('❌ Authentication failed - redirecting to login');
    console.log('❌ Session exists:', !!req.session);
    console.log('❌ User in session:', !!req.session?.user);
    res.status(401).json({ error: 'Authentication required', redirect: '/' });
  }
}

// New middleware for admin-only operations
function requireAdminAuth(req, res, next) {
  console.log('🔐 Admin auth check - User:', req.session?.user);
  
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    console.log('✅ Admin authentication successful');
    next();
  } else {
    console.log('❌ Admin authentication failed');
    res.status(403).json({ 
      error: 'Admin access required', 
      message: 'You need admin privileges to perform this action' 
    });
  }
}

// Database functions
async function initializeDatabase() {
  if (isProduction && sql) {
    try {
      // Create EDI orders table
      const createTableQuery = `
        CREATE TABLE IF NOT EXISTS edi_orders (
          id SERIAL PRIMARY KEY,
          order_number VARCHAR(50) UNIQUE NOT NULL,
          quantity INTEGER,
          product_name VARCHAR(255),
          drawing_number VARCHAR(100),
          delivery_date VARCHAR(20),
          status TEXT DEFAULT '',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;
      await sql.query(createTableQuery);
      
      // Create forecasts table
      const createForecastTableQuery = `
        CREATE TABLE IF NOT EXISTS forecasts (
          id SERIAL PRIMARY KEY,
          drawing_number VARCHAR(100) NOT NULL,
          month_date VARCHAR(10) NOT NULL,
          quantity INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(drawing_number, month_date)
        )
      `;
      await sql.query(createForecastTableQuery);
      
      const createIndexQuery = `
        CREATE INDEX IF NOT EXISTS idx_edi_orders_drawing_number 
        ON edi_orders(drawing_number)
      `;
      await sql.query(createIndexQuery);
      
      const createForecastIndexQuery = `
        CREATE INDEX IF NOT EXISTS idx_forecasts_drawing_month 
        ON forecasts(drawing_number, month_date)
      `;
      await sql.query(createForecastIndexQuery);
      
      console.log('✅ Vercel Postgres tables initialized');
    } catch (error) {
      console.error('❌ Database initialization error:', error);
    }
  } else {
    console.log('✅ In-memory storage initialized');
  }
}

// Helper function to parse dates
function parseDate(dateString) {
  if (!dateString) return new Date('9999-12-31');
  
  try {
    if (dateString.includes('/')) {
      const [year, month, day] = dateString.split('/');
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
    return new Date(dateString);
  } catch (error) {
    return new Date('9999-12-31');
  }
}

// EDI Orders functions
async function getAllOrders() {
  console.log('🔍 getAllOrders called');
  
  if (isProduction && sql) {
    try {
      const selectQuery = `
        SELECT * FROM edi_orders 
        ORDER BY 
          CASE drawing_number
            WHEN 'PP4166-4681P003' THEN 1
            WHEN 'PP4166-4681P004' THEN 2
            WHEN 'PP4166-4726P003' THEN 3
            WHEN 'PP4166-4726P004' THEN 4
            WHEN 'PP4166-4731P002' THEN 5
            WHEN 'PP4166-7106P001' THEN 6
            WHEN 'PP4166-7106P003' THEN 7
            ELSE 8
          END,
          CASE WHEN delivery_date ~ '^[0-9]{4}/[0-9]{2}/[0-9]{2}$' 
               THEN delivery_date::date 
               ELSE '9999-12-31'::date 
          END ASC
      `;
      const result = await sql.query(selectQuery);
      console.log('✅ Postgres query result:', result.rows.length, 'records');
      return result.rows;
    } catch (error) {
      console.error('❌ Error fetching from Postgres:', error);
      return [];
    }
  } else {
    // Sort in-memory data
    const sorted = inMemoryData.sort((a, b) => {
      const aIndex = DRAWING_NUMBER_ORDER.indexOf(a.drawing_number);
      const bIndex = DRAWING_NUMBER_ORDER.indexOf(b.drawing_number);
      const aPriority = aIndex === -1 ? 999 : aIndex;
      const bPriority = bIndex === -1 ? 999 : bIndex;
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      const dateA = parseDate(a.delivery_date);
      const dateB = parseDate(b.delivery_date);
      return dateA - dateB;
    });
    
    console.log('📊 In-memory data:', sorted.length, 'records');
    return sorted;
  }
}

async function updateOrderStatus(orderId, status) {
  if (isProduction && sql) {
    try {
      const updateQuery = `
        UPDATE edi_orders 
        SET status = $1, updated_at = CURRENT_TIMESTAMP 
        WHERE id = $2
      `;
      await sql.query(updateQuery, [status, orderId]);
      return true;
    } catch (error) {
      console.error('Error updating Postgres:', error);
      return false;
    }
  } else {
    const order = inMemoryData.find(o => o.id == orderId);
    if (order) {
      order.status = status;
      order.updated_at = new Date().toISOString();
      return true;
    }
    return false;
  }
}

async function addOrder(orderData) {
  console.log('➕ addOrder called with:', orderData.orderNumber);
  
  if (isProduction && sql) {
    try {
      const checkQuery = 'SELECT id FROM edi_orders WHERE order_number = $1';
      const existing = await sql.query(checkQuery, [orderData.orderNumber]);
      
      if (existing.rows.length === 0) {
        const insertQuery = `
          INSERT INTO edi_orders (order_number, quantity, product_name, drawing_number, delivery_date)
          VALUES ($1, $2, $3, $4, $5)
        `;
        await sql.query(insertQuery, [
          orderData.orderNumber,
          orderData.quantity,
          orderData.productName,
          orderData.drawingNumber,
          orderData.deliveryDate
        ]);
        console.log('✅ Added to Postgres:', orderData.orderNumber);
        return { added: true, skipped: false };
      } else {
        console.log('⚠️ Skipped duplicate:', orderData.orderNumber);
        return { added: false, skipped: true };
      }
    } catch (error) {
      console.error('❌ Error adding to Postgres:', error);
      return { added: false, skipped: false, error: true };
    }
  } else {
    const existing = inMemoryData.find(o => o.order_number === orderData.orderNumber);
    if (!existing) {
      const newOrder = {
        id: nextId++,
        order_number: orderData.orderNumber,
        quantity: orderData.quantity,
        product_name: orderData.productName,
        drawing_number: orderData.drawingNumber,
        delivery_date: orderData.deliveryDate,
        status: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      inMemoryData.push(newOrder);
      console.log('✅ Added to memory:', orderData.orderNumber);
      return { added: true, skipped: false };
    } else {
      console.log('⚠️ Skipped duplicate:', orderData.orderNumber);
      return { added: false, skipped: true };
    }
  }
}

// ENHANCED FORECAST FUNCTIONS
async function getAllForecasts() {
  console.log('🔍 getAllForecasts called');
  
  if (isProduction && sql) {
    try {
      const selectQuery = `
        SELECT 
          id,
          drawing_number,
          month_date,
          quantity,
          created_at,
          updated_at
        FROM forecasts 
        ORDER BY 
          CASE drawing_number
            WHEN 'PP4166-4681P003' THEN 1
            WHEN 'PP4166-4681P004' THEN 2
            WHEN 'PP4166-4726P003' THEN 3
            WHEN 'PP4166-4726P004' THEN 4
            WHEN 'PP4166-4731P002' THEN 5
            WHEN 'PP4166-7106P001' THEN 6
            WHEN 'PP4166-7106P003' THEN 7
            ELSE 8
          END,
          month_date ASC
      `;
      const result = await sql.query(selectQuery);
      
      // Debug logging for date formats
      console.log('✅ Forecast query result:', result.rows.length, 'records');
      result.rows.forEach(row => {
        console.log(`🔍 DB Forecast: ${row.drawing_number} - ${row.month_date} = ${row.quantity}`);
      });
      
      return result.rows;
    } catch (error) {
      console.error('❌ Error fetching forecasts from Postgres:', error);
      return [];
    }
  } else {
    // Sort in-memory forecast data
    const sorted = inMemoryForecasts.sort((a, b) => {
      const aIndex = DRAWING_NUMBER_ORDER.indexOf(a.drawing_number);
      const bIndex = DRAWING_NUMBER_ORDER.indexOf(b.drawing_number);
      const aPriority = aIndex === -1 ? 999 : aIndex;
      const bPriority = bIndex === -1 ? 999 : bIndex;
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      return a.month_date.localeCompare(b.month_date);
    });
    
    console.log('📊 In-memory forecast data:', sorted.length, 'records');
    sorted.forEach(row => {
      console.log(`🔍 Memory Forecast: ${row.drawing_number} - ${row.month_date} = ${row.quantity}`);
    });
    
    return sorted;
  }
}

async function saveForecast(drawingNumber, monthDate, quantity) {
  console.log('💾 saveForecast called:', { drawingNumber, monthDate, quantity });
  
  // Validate and normalize month date format
  const normalizedMonthDate = normalizeMonthDate(monthDate);
  console.log('🔄 Normalized month date:', monthDate, '->', normalizedMonthDate);
  
  if (isProduction && sql) {
    try {
      const upsertQuery = `
        INSERT INTO forecasts (drawing_number, month_date, quantity, updated_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (drawing_number, month_date)
        DO UPDATE SET quantity = $3, updated_at = CURRENT_TIMESTAMP
      `;
      await sql.query(upsertQuery, [drawingNumber, normalizedMonthDate, quantity]);
      console.log('✅ Forecast saved to Postgres:', { drawingNumber, monthDate: normalizedMonthDate, quantity });
      return true;
    } catch (error) {
      console.error('❌ Error saving forecast to Postgres:', error);
      return false;
    }
  } else {
    // Handle in-memory storage
    const existingIndex = inMemoryForecasts.findIndex(f => 
      f.drawing_number === drawingNumber && f.month_date === normalizedMonthDate
    );
    
    if (existingIndex >= 0) {
      inMemoryForecasts[existingIndex].quantity = quantity;
      inMemoryForecasts[existingIndex].updated_at = new Date().toISOString();
      console.log('✅ Updated forecast in memory:', { drawingNumber, monthDate: normalizedMonthDate, quantity });
    } else {
      const newForecast = {
        id: nextForecastId++,
        drawing_number: drawingNumber,
        month_date: normalizedMonthDate,
        quantity: quantity,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      inMemoryForecasts.push(newForecast);
      console.log('✅ Added new forecast to memory:', newForecast);
    }
    
    return true;
  }
}

// Utility functions
function cleanProductName(productName) {
  if (!productName) return '';
  let cleaned = productName.replace(/\s*RO\d+\s*$/i, '').trim();
  cleaned = cleaned.replace(/\s+$/, '');
  return cleaned;
}

function formatDate(dateString) {
  if (!dateString) return null;
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}/${month}/${day}`;
  } catch (error) {
    return dateString;
  }
}

// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: isProduction ? 'production' : 'development',
    database: sql ? 'postgres' : 'memory'
  });
});

// Login page - FIXED: Use path.join for file serving
app.get('/', (req, res) => {
  try {
    if (req.session.user) {
      res.redirect('/dashboard');
    } else {
      res.sendFile(path.join(__dirname, 'public', 'login.html'));
    }
  } catch (error) {
    console.error('❌ Error in root route:', error);
    res.status(500).send('Server error');
  }
});

// Dashboard page - FIXED: Use path.join for file serving
app.get('/dashboard', enhancedRequireAuth, (req, res) => {
  try {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
  } catch (error) {
    console.error('❌ Error in dashboard route:', error);
    res.status(500).send('Server error');
  }
});

// Forecast page
app.get('/forecast', enhancedRequireAuth, (req, res) => {
  try {
    res.sendFile(path.join(__dirname, 'public', 'forecast.html'));
  } catch (error) {
    console.error('❌ Error in forecast route:', error);
    res.status(500).send('Server error');
  }
});

// ENHANCED LOGIN ENDPOINT
app.post('/api/login', (req, res) => {
  try {
    const { username, password } = req.body;
    console.log('🔑 Login attempt:', { username });
    console.log('🔑 Session before login:', req.sessionID);
    
    let userRole = null;
    
    if (username === 'admin') {
      userRole = 'admin';
    } else if (username === 'user') {
      userRole = 'user';
    }
    
    if (userRole) {
      // Force session regeneration for security
      req.session.regenerate((err) => {
        if (err) {
          console.error('❌ Session regeneration error:', err);
          return res.status(500).json({ success: false, message: 'Session error' });
        }
        
        // Set user data in new session
        req.session.user = { 
          username, 
          role: userRole,
          loginTime: new Date().toISOString() 
        };
        
        // Force session save
        req.session.save((err) => {
          if (err) {
            console.error('❌ Session save error:', err);
            return res.status(500).json({ success: false, message: 'Session save error' });
          }
          
          console.log('✅ Login successful for:', username, 'Role:', userRole);
          console.log('✅ New session ID:', req.sessionID);
          console.log('✅ Session data saved:', JSON.stringify(req.session.user, null, 2));
          
          res.json({ 
            success: true, 
            message: 'Login successful',
            role: userRole,
            permissions: {
              canEdit: userRole === 'admin',
              canView: true
            }
          });
        });
      });
    } else {
      console.log('❌ Login failed for:', username);
      res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials. Username must be "admin" or "user"' 
      });
    }
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// New user info endpoint
app.get('/api/user-info', enhancedRequireAuth, (req, res) => {
  try {
    const user = req.session.user;
    res.json({
      username: user.username,
      role: user.role,
      loginTime: user.loginTime,
      permissions: {
        canEdit: user.role === 'admin',
        canView: true
      }
    });
  } catch (error) {
    console.error('❌ Error getting user info:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// ENHANCED LOGOUT ENDPOINT
app.post('/api/logout', (req, res) => {
  try {
    const username = req.session?.user?.username;
    console.log('🚪 Logout attempt for:', username);
    
    req.session.destroy((err) => {
      if (err) {
        console.error('❌ Session destroy error:', err);
        return res.status(500).json({ success: false, message: 'Logout failed' });
      }
      
      // Clear the session cookie
      res.clearCookie('edi.session.id');
      console.log('✅ Logout successful for:', username);
      res.json({ success: true });
    });
  } catch (error) {
    console.error('❌ Logout error:', error);
    res.status(500).json({ success: false, message: 'Logout failed' });
  }
});

// Get all EDI data
app.get('/api/edi-data', enhancedRequireAuth, async (req, res) => {
  console.log('🌐 GET /api/edi-data called');
  
  try {
    const orders = await getAllOrders();
    console.log('📤 Sending response with', orders.length, 'records');
    res.json(orders);
  } catch (error) {
    console.error('❌ Error fetching EDI data:', error);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// 🔧 NEW - Excel export endpoint
app.get('/api/export/excel', enhancedRequireAuth, async (req, res) => {
  console.log('📊 Excel export requested');
  
  try {
    if (!ExcelJS) {
      return res.status(500).json({ 
        error: 'Excel functionality not available', 
        message: 'ExcelJS not installed. Run: npm install exceljs' 
      });
    }
    
    // Get all orders
    const orders = await getAllOrders();
    console.log(`📊 Exporting ${orders.length} orders to Excel`);
    
    // Create workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('EDI Orders');
    
    // Set up headers
    worksheet.columns = [
      { header: 'Order Number', key: 'order_number', width: 15 },
      { header: 'Drawing Number', key: 'drawing_number', width: 18 },
      { header: 'Product Name', key: 'product_name', width: 20 },
      { header: 'Quantity', key: 'quantity', width: 10 },
      { header: 'Delivery Date', key: 'delivery_date', width: 12 },
      { header: 'Status', key: 'status', width: 20 },
      { header: 'Created At', key: 'created_at', width: 18 },
      { header: 'Updated At', key: 'updated_at', width: 18 }
    ];
    
    // Style headers
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4F46E5' }
    };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    
    // Add data rows
    orders.forEach(order => {
      worksheet.addRow({
        order_number: order.order_number || '',
        drawing_number: order.drawing_number || '',
        product_name: order.product_name || '',
        quantity: order.quantity || 0,
        delivery_date: order.delivery_date || '',
        status: order.status || '',
        created_at: order.created_at ? new Date(order.created_at).toLocaleString() : '',
        updated_at: order.updated_at ? new Date(order.updated_at).toLocaleString() : ''
      });
    });
    
    // Auto-fit columns
    worksheet.columns.forEach(column => {
      if (column.values) {
        const maxLength = column.values.reduce((max, value) => {
          const length = value ? value.toString().length : 0;
          return Math.max(max, length);
        }, 0);
        column.width = Math.min(Math.max(maxLength + 2, 10), 50);
      }
    });
    
    // Add summary information
    const summaryWorksheet = workbook.addWorksheet('Summary');
    summaryWorksheet.addRow(['Export Summary']);
    summaryWorksheet.addRow(['Total Orders:', orders.length]);
    summaryWorksheet.addRow(['Export Date:', new Date().toLocaleString()]);
    summaryWorksheet.addRow(['Exported By:', req.session.user.username]);
    
    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    
    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="EDI_Orders_${new Date().toISOString().split('T')[0]}.xlsx"`);
    res.setHeader('Content-Length', buffer.length);
    
    // Send the buffer
    res.send(buffer);
    
    console.log('✅ Excel export completed successfully');
    
  } catch (error) {
    console.error('❌ Excel export error:', error);
    res.status(500).json({ error: 'Failed to export Excel file', details: error.message });
  }
});

// ENHANCED DEBUG ENDPOINT
app.get('/api/debug/forecasts', enhancedRequireAuth, async (req, res) => {
  console.log('🔍 DEBUG: Checking forecast data');
  
  try {
    if (isProduction && sql) {
      const result = await sql.query('SELECT * FROM forecasts ORDER BY drawing_number, month_date');
      console.log('🔍 DEBUG: Postgres forecasts count:', result.rows.length);
      
      // Detailed logging of each forecast entry
      result.rows.forEach((row, index) => {
        console.log(`🔍 DEBUG: Forecast ${index + 1}: ${row.drawing_number} | ${row.month_date} | ${row.quantity}`);
      });
      
      res.json({ 
        source: 'postgres', 
        data: result.rows,
        count: result.rows.length,
        sample: result.rows.slice(0, 5) // Show first 5 for debugging
      });
    } else {
      console.log('🔍 DEBUG: In-memory forecasts count:', inMemoryForecasts.length);
      
      inMemoryForecasts.forEach((row, index) => {
        console.log(`🔍 DEBUG: Memory Forecast ${index + 1}: ${row.drawing_number} | ${row.month_date} | ${row.quantity}`);
      });
      
      res.json({ 
        source: 'memory', 
        data: inMemoryForecasts,
        count: inMemoryForecasts.length,
        sample: inMemoryForecasts.slice(0, 5)
      });
    }
  } catch (error) {
    console.error('❌ Error in debug endpoint:', error);
    res.status(500).json({ error: 'Debug failed', details: error.message });
  }
});

// Get all forecast data
app.get('/api/forecasts', enhancedRequireAuth, async (req, res) => {
  console.log('🌐 GET /api/forecasts called');
  
  try {
    const forecasts = await getAllForecasts();
    console.log('📤 Sending forecast response with', forecasts.length, 'records');
    console.log('📊 Sample forecasts:', forecasts.slice(0, 3));
    res.json(forecasts);
  } catch (error) {
    console.error('❌ Error fetching forecast data:', error);
    res.status(500).json({ error: 'Failed to fetch forecast data' });
  }
});

// 🔧 FIXED - Save forecast data (admin only) - Fixed field names
app.post('/api/forecasts', requireAdminAuth, async (req, res) => {
  console.log('🌐 POST /api/forecasts called');
  console.log('📊 Request body:', req.body);
  
  try {
    // 🔧 FIXED: Use correct field names from frontend
    const { drawing_number, month_date, quantity } = req.body;
    
    console.log('🔍 Extracted fields:', { drawing_number, month_date, quantity });
    
    if (!drawing_number || !month_date || quantity === undefined) {
      console.log('❌ Missing required fields:', { drawing_number, month_date, quantity });
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const success = await saveForecast(drawing_number, month_date, parseInt(quantity) || 0);
    
    if (success) {
      console.log('✅ Individual forecast save successful');
      res.json({ success: true, message: 'Forecast saved successfully' });
    } else {
      console.log('❌ Individual forecast save failed');
      res.status(500).json({ error: 'Failed to save forecast' });
    }
  } catch (error) {
    console.error('❌ Error saving forecast:', error);
    res.status(500).json({ error: 'Failed to save forecast' });
  }
});

// 🔧 FIXED - Batch save forecasts (admin only) - Fixed field names
app.post('/api/forecasts/batch', requireAdminAuth, async (req, res) => {
  console.log('🌐 POST /api/forecasts/batch called');
  
  try {
    const { forecasts } = req.body;
    console.log('📊 Received forecasts for batch save:', forecasts);
    
    if (!Array.isArray(forecasts)) {
      return res.status(400).json({ error: 'Forecasts must be an array' });
    }
    
    let saved = 0;
    let errors = 0;
    
    for (const forecast of forecasts) {
      try {
        console.log('💾 Processing forecast:', forecast);
        
        // 🔧 FIXED: Use correct field names from frontend
        // Frontend sends: drawing_number, month_date, quantity
        const success = await saveForecast(
          forecast.drawing_number,  // ✅ Fixed from forecast.drawingNumber
          forecast.month_date,      // ✅ Fixed from forecast.monthDate  
          parseInt(forecast.quantity) || 0
        );
        
        if (success) {
          saved++;
          console.log('✅ Saved forecast:', {
            drawing_number: forecast.drawing_number,
            month_date: forecast.month_date,
            quantity: forecast.quantity
          });
        } else {
          errors++;
          console.log('❌ Failed to save forecast:', forecast);
        }
      } catch (error) {
        errors++;
        console.error('❌ Error saving individual forecast:', forecast, error);
      }
    }
    
    console.log(`📊 Batch save completed: ${saved} saved, ${errors} errors`);
    
    res.json({ 
      success: true, 
      message: `Batch save completed: ${saved} saved, ${errors} errors`,
      saved,
      errors
    });
  } catch (error) {
    console.error('❌ Error in batch save:', error);
    res.status(500).json({ error: 'Failed to batch save forecasts' });
  }
});

// 🔧 NEW - Import forecast data from Excel
app.post('/api/import-forecast', requireAdminAuth, upload.single('forecastFile'), async (req, res) => {
  console.log('📊 Forecast Excel import requested');
  
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    if (!ExcelJS) {
      return res.status(500).json({ 
        error: 'Excel functionality not available', 
        message: 'ExcelJS not installed. Run: npm install exceljs' 
      });
    }
    
    console.log('📄 Forecast file info:', {
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
    
    // Parse Excel file
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    
    // Get the first worksheet
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return res.status(400).json({ error: 'No worksheet found in Excel file' });
    }
    
    console.log('📊 Worksheet info:', {
      name: worksheet.name,
      rowCount: worksheet.rowCount,
      columnCount: worksheet.columnCount
    });
    
    // Find header row and month columns
    let headerRow = null;
    let drawingNumberCol = null;
    let productNameCol = null;
    const monthColumns = {};
    
    // Search for headers in first few rows
    for (let rowNum = 1; rowNum <= Math.min(5, worksheet.rowCount); rowNum++) {
      const row = worksheet.getRow(rowNum);
      let foundDrawing = false;
      let foundProduct = false;
      
      row.eachCell((cell, colNumber) => {
        const cellValue = cell.value ? cell.value.toString().toLowerCase().trim() : '';
        
        // Look for drawing number column
        if (cellValue.includes('drawing') || cellValue.includes('図番') || cellValue.includes('品番')) {
          drawingNumberCol = colNumber;
          foundDrawing = true;
        }
        
        // Look for product name column
        if (cellValue.includes('product') || cellValue.includes('品名') || cellValue.includes('name')) {
          productNameCol = colNumber;
          foundProduct = true;
        }
        
        // Look for month columns (various formats)
        if (cellValue.match(/^\d{1,2}月$/) || // Japanese: 8月, 9月
            cellValue.match(/^\d{4}\/\d{1,2}$/) || // 2025/8, 2025/9
            cellValue.match(/^\d{1,2}\/\d{4}$/) || // 8/2025, 9/2025
            cellValue.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i) || // English months
            cellValue.match(/^\d{1,2}\/\d{1,2}$/)) { // MM/DD format
          
          // Convert to our standard MM/01 format
          let standardMonth = null;
          
          if (cellValue.match(/^\d{1,2}月$/)) {
            const month = parseInt(cellValue.replace('月', ''));
            standardMonth = `${String(month).padStart(2, '0')}/01`;
          } else if (cellValue.match(/^\d{4}\/\d{1,2}$/)) {
            const month = parseInt(cellValue.split('/')[1]);
            standardMonth = `${String(month).padStart(2, '0')}/01`;
          } else if (cellValue.match(/^\d{1,2}\/\d{4}$/)) {
            const month = parseInt(cellValue.split('/')[0]);
            standardMonth = `${String(month).padStart(2, '0')}/01`;
          } else if (cellValue.match(/^\d{1,2}\/\d{1,2}$/)) {
            const month = parseInt(cellValue.split('/')[0]);
            standardMonth = `${String(month).padStart(2, '0')}/01`;
          }
          
          if (standardMonth) {
            monthColumns[colNumber] = standardMonth;
            console.log(`📅 Found month column: ${cellValue} -> ${standardMonth} (col ${colNumber})`);
          }
        }
      });
      
      if (foundDrawing && foundProduct && Object.keys(monthColumns).length > 0) {
        headerRow = rowNum;
        break;
      }
    }
    
    if (!headerRow || !drawingNumberCol || Object.keys(monthColumns).length === 0) {
      return res.status(400).json({ 
        error: 'Invalid Excel format', 
        details: 'Could not find drawing number column and month columns. Expected format: Drawing Number | Product Name | Month columns (8月, 9月, etc.)'
      });
    }
    
    console.log('✅ Excel structure detected:', {
      headerRow,
      drawingNumberCol,
      productNameCol,
      monthColumns: Object.keys(monthColumns).length
    });
    
    // Process data rows
    const forecasts = [];
    let processedRows = 0;
    let validForecasts = 0;
    
    for (let rowNum = headerRow + 1; rowNum <= worksheet.rowCount; rowNum++) {
      const row = worksheet.getRow(rowNum);
      const drawingNumber = row.getCell(drawingNumberCol).value;
      
      if (!drawingNumber || !drawingNumber.toString().startsWith('PP4166')) {
        continue; // Skip rows without valid drawing numbers
      }
      
      processedRows++;
      
      // Process each month column for this drawing number
      Object.entries(monthColumns).forEach(([colNumber, monthDate]) => {
        const quantityCell = row.getCell(parseInt(colNumber));
        const quantity = quantityCell.value;
        
        if (quantity && !isNaN(parseFloat(quantity)) && parseFloat(quantity) > 0) {
          forecasts.push({
            drawing_number: drawingNumber.toString().trim(),
            month_date: monthDate,
            quantity: parseFloat(quantity)
          });
          validForecasts++;
          console.log(`📊 Found forecast: ${drawingNumber} - ${monthDate} = ${quantity}`);
        }
      });
    }
    
    console.log(`📊 Import summary: ${processedRows} rows processed, ${validForecasts} valid forecasts found`);
    
    if (forecasts.length === 0) {
      return res.status(400).json({ 
        error: 'No valid forecast data found',
        details: `Processed ${processedRows} rows but found no valid forecast values`
      });
    }
    
    // Save forecasts to database
    let saved = 0;
    let errors = 0;
    
    for (const forecast of forecasts) {
      try {
        const success = await saveForecast(
          forecast.drawing_number,
          forecast.month_date,
          forecast.quantity
        );
        if (success) {
          saved++;
        } else {
          errors++;
        }
      } catch (error) {
        errors++;
        console.error('❌ Error saving forecast:', forecast, error);
      }
    }
    
    res.json({
      success: true,
      message: `Forecast import completed: ${saved} forecasts saved${errors > 0 ? `, ${errors} errors` : ''}`,
      details: {
        rowsProcessed: processedRows,
        forecastsFound: validForecasts,
        saved,
        errors
      }
    });
    
    console.log(`✅ Forecast import completed: ${saved} saved, ${errors} errors`);
    
  } catch (error) {
    console.error('❌ Forecast import error:', error);
    res.status(500).json({ error: 'Import failed: ' + error.message });
  }
});

// Update status for an order (admin only)
app.put('/api/edi-data/:orderId', requireAdminAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    
    const success = await updateOrderStatus(orderId, status);
    
    if (success) {
      res.json({ success: true, message: 'Status updated successfully' });
    } else {
      res.status(404).json({ error: 'Order not found' });
    }
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Import EDI data from file (admin only, using memory storage for serverless)
app.post('/api/import-edi', requireAdminAuth, upload.single('ediFile'), async (req, res) => {
  console.log('📁 Import EDI file called');
  
  try {
    if (!req.file) {
      console.log('❌ No file uploaded');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('📄 File info:', {
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });

    const results = [];
    
    // Get file content from memory buffer (no file system access needed)
    let fileContent;
    let detectedEncoding = 'utf8';
    
    try {
      const buffer = req.file.buffer;
      
      // Try to handle Japanese encoding
      let iconv;
      try {
        iconv = require('iconv-lite');
        console.log('✅ iconv-lite available for encoding detection');
      } catch (iconvError) {
        console.log('⚠️ iconv-lite not found, using UTF-8');
        iconv = null;
      }
      
      if (iconv) {
        try {
          fileContent = iconv.decode(buffer, 'shift_jis');
          detectedEncoding = 'shift_jis';
          console.log('🇯🇵 Using Shift-JIS encoding');
          
          const testLine = fileContent.split('\n')[0] || '';
          if (testLine.includes('◆') || testLine.includes('◇') || testLine.includes('�')) {
            throw new Error('Still has corrupted characters');
          }
        } catch (sjisError) {
          console.log('⚠️ Shift-JIS failed, using UTF-8');
          fileContent = buffer.toString('utf8');
          detectedEncoding = 'utf8';
        }
      } else {
        fileContent = buffer.toString('utf8');
        detectedEncoding = 'utf8';
      }
      
    } catch (error) {
      console.log('❌ Error reading file buffer:', error);
      fileContent = req.file.buffer.toString('utf8');
      detectedEncoding = 'utf8';
    }
    
    const lines = fileContent.split('\n').slice(0, 3);
    console.log(`📋 File preview with ${detectedEncoding} encoding:`);
    lines.forEach((line, index) => {
      console.log(`Line ${index + 1}:`, line.substring(0, 100));
    });
    
    // Detect separator
    const firstLine = lines[0] || '';
    let separator = '\t';
    
    if (firstLine.includes('\t')) {
      separator = '\t';
    } else if (firstLine.includes(',')) {
      separator = ',';
    } else if (firstLine.includes(';')) {
      separator = ';';
    }
    
    console.log('🔍 Detected separator:', separator === '\t' ? 'TAB' : separator);
    
    // Create stream from content
    const contentStream = new Readable();
    contentStream.push(fileContent);
    contentStream.push(null);
    
    let rowCount = 0;
    let validOrdersFound = 0;
    
    // Parse the content
    contentStream
      .pipe(csv({ 
        separator: separator,
        headers: false,
        skipEmptyLines: true
      }))
      .on('data', (row) => {
        rowCount++;
        const columns = Object.values(row);
        
        let orderData = null;
        
        // Strategy 1: Original mapping
        if (columns.length > 27) {
          orderData = {
            orderNumber: columns[6]?.toString().trim(),
            quantity: parseInt(columns[14]) || 0,
            productName: cleanProductName(columns[20]?.toString()),
            drawingNumber: columns[22]?.toString().trim(),
            deliveryDate: formatDate(columns[27]?.toString())
          };
          
          if (orderData.orderNumber && orderData.orderNumber.startsWith('LK')) {
            // Valid order found
          } else {
            orderData = null;
          }
        }
        
        // Strategy 2: Search for LK numbers
        if (!orderData) {
          for (let i = 0; i < columns.length; i++) {
            const value = columns[i]?.toString().trim();
            if (value && value.startsWith('LK') && value.length >= 10) {
              orderData = {
                orderNumber: value,
                quantity: 0,
                productName: '',
                drawingNumber: '',
                deliveryDate: ''
              };
              
              // Find other data
              for (let j = 0; j < columns.length; j++) {
                const colValue = columns[j]?.toString().trim();
                if (!colValue) continue;
                
                if (/^\d+$/.test(colValue) && parseInt(colValue) > 0 && parseInt(colValue) < 10000) {
                  orderData.quantity = parseInt(colValue);
                }
                
                if (colValue.startsWith('PP4166')) {
                  orderData.drawingNumber = colValue;
                }
                
                if (/^\d{4}\/\d{2}\/\d{2}$/.test(colValue)) {
                  orderData.deliveryDate = colValue;
                }
                
                if (colValue.length > 3 && 
                    !colValue.startsWith('LK') && 
                    !colValue.startsWith('PP4166') && 
                    !/^\d+$/.test(colValue) && 
                    !/^\d{4}\/\d{2}\/\d{2}$/.test(colValue) &&
                    orderData.productName === '') {
                  orderData.productName = cleanProductName(colValue);
                }
              }
              break;
            }
          }
        }
        
        if (orderData && orderData.orderNumber && orderData.orderNumber.startsWith('LK')) {
          results.push(orderData);
          validOrdersFound++;
        }
      })
      .on('end', async () => {
        console.log(`📊 Import summary: ${rowCount} rows processed, ${validOrdersFound} valid orders found`);
        
        try {
          let imported = 0;
          let skipped = 0;
          let errors = 0;
          
          for (const order of results) {
            try {
              const result = await addOrder(order);
              if (result.added) imported++;
              if (result.skipped) skipped++;
              if (result.error) errors++;
            } catch (error) {
              errors++;
              console.error('❌ Error processing order:', order.orderNumber, error);
            }
          }
          
          res.json({
            success: true,
            message: `Import completed: ${imported} new orders imported, ${skipped} duplicates skipped${errors > 0 ? `, ${errors} errors` : ''} (Encoding: ${detectedEncoding})`,
            imported,
            skipped,
            errors,
            debug: {
              rowsProcessed: rowCount,
              validOrdersFound: validOrdersFound,
              encoding: detectedEncoding
            }
          });
          
        } catch (error) {
          console.error('❌ Error importing data:', error);
          res.status(500).json({ error: 'Failed to import data: ' + error.message });
        }
      })
      .on('error', (error) => {
        console.error('❌ Error parsing CSV:', error);
        res.status(500).json({ error: 'Failed to parse file: ' + error.message });
      });
      
  } catch (error) {
    console.error('❌ Error in import endpoint:', error);
    res.status(500).json({ error: 'Import failed: ' + error.message });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('❌ Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: isProduction ? 'Something went wrong' : error.message 
  });
});

// Initialize database and start server
async function startServer() {
  try {
    console.log('🚀 Starting EDI Management System...');
    await initializeDatabase();
    
    if (!isProduction) {
      app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📁 Static files served from: ${path.join(__dirname, 'public')}`);
      });
    }
    
    console.log('✅ Server initialization complete');
  } catch (error) {
    console.error('❌ Failed to start server:', error);
  }
}

startServer();

module.exports = app;