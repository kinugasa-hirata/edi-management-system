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
let inMemoryStocks = [];
let nextId = 1;
let nextForecastId = 1;
let nextStockId = 1;

// In-memory login tracking
let loginHistory = [];

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving - FIXED PATH
app.use(express.static(path.join(__dirname, 'public')));

// Enhanced session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'edi-secret-key-2024-super-secure',
  resave: true,  // Changed to true to prevent session loss
  saveUninitialized: true,  // Changed to true
  rolling: false, // Changed to false to prevent constant session resets
  cookie: { 
    maxAge: 8 * 60 * 60 * 1000, // 8 hours (longer session)
    secure: false, 
    httpOnly: true,
    sameSite: 'lax'
  },
  name: 'edi.session.id'
}));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📍 ${req.method} ${req.path} - Session: ${req.sessionID ? 'EXISTS' : 'MISSING'}`);
  if (req.session && req.session.user) {
    console.log(`👤 User: ${req.session.user.username} (${req.session.user.role})`);
  }
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

// Product group mappings for material stock calculations
const PRODUCT_GROUPS = {
  'upper-frame': {
    name: 'ｱｯﾊﾟﾌﾞﾚｰﾑ',
    products: ['PP4166-4681P003', 'PP4166-4681P004']
  },
  'top-plate': {
    name: 'ﾄｯﾌﾟﾌﾟﾚｰﾄ',
    products: ['PP4166-4726P003', 'PP4166-4726P004']
  },
  'middle-frame': {
    name: 'ﾐﾄﾞﾙﾌﾚｰﾑ',
    products: ['PP4166-4731P002', 'PP4166-7106P001', 'PP4166-7106P003']
  }
};

// UTILITY FUNCTION - Date format normalization
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

// Enhanced authentication middleware
function enhancedRequireAuth(req, res, next) {
  console.log('🔐 Auth check - Session ID:', req.sessionID);
  console.log('🔐 Auth check - Session exists:', !!req.session);
  console.log('🔐 Auth check - User in session:', !!req.session?.user);
  
  if (req.session && req.session.user) {
    console.log('✅ Authentication successful for:', req.session.user.username);
    next();
  } else {
    console.log('❌ Authentication failed - no valid session');
    
    // Send HTML redirect instead of JSON for browser requests
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      return res.redirect('/');
    } else {
      return res.status(401).json({ error: 'Authentication required', redirect: '/' });
    }
  }
}

// Admin-only operations middleware
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
      
      // Create material stocks table
      const createMaterialStocksTableQuery = `
        CREATE TABLE IF NOT EXISTS material_stocks (
          id SERIAL PRIMARY KEY,
          group_key VARCHAR(50) UNIQUE NOT NULL,
          group_name VARCHAR(100) NOT NULL,
          quantity INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;
      await sql.query(createMaterialStocksTableQuery);
      
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
      
      const createMaterialStocksIndexQuery = `
        CREATE INDEX IF NOT EXISTS idx_material_stocks_group_key 
        ON material_stocks(group_key)
      `;
      await sql.query(createMaterialStocksIndexQuery);
      
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

// ============ EDI ORDERS FUNCTIONS ============
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

// ============ ENHANCED FORECAST FUNCTIONS ============
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
        RETURNING *
      `;
      const result = await sql.query(upsertQuery, [drawingNumber, normalizedMonthDate, quantity]);
      console.log('✅ Forecast saved to Postgres:', result.rows[0]);
      return { success: true, data: result.rows[0] };
    } catch (error) {
      console.error('❌ Error saving forecast to Postgres:', error);
      return { success: false, error: error.message };
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
    
    return { success: true };
  }
}

// Clear all forecast data function
async function clearAllForecasts() {
  console.log('🗑️ clearAllForecasts called');
  
  if (isProduction && sql) {
    try {
      const deleteQuery = 'DELETE FROM forecasts';
      await sql.query(deleteQuery);
      console.log('✅ All forecasts cleared from Postgres');
      return { success: true };
    } catch (error) {
      console.error('❌ Error clearing forecasts from Postgres:', error);
      return { success: false, error: error.message };
    }
  } else {
    inMemoryForecasts = [];
    console.log('✅ All forecasts cleared from memory');
    return { success: true };
  }
}

// ============ ENHANCED MATERIAL STOCK FUNCTIONS ============
async function getAllMaterialStocks() {
  console.log('🔍 getAllMaterialStocks called');
  
  if (isProduction && sql) {
    try {
      const selectQuery = `
        SELECT 
          id,
          group_key,
          group_name,
          quantity,
          created_at,
          updated_at
        FROM material_stocks 
        ORDER BY group_key ASC
      `;
      const result = await sql.query(selectQuery);
      console.log('✅ Material stocks query result:', result.rows.length, 'records');
      return result.rows;
    } catch (error) {
      console.error('❌ Error fetching material stocks from Postgres:', error);
      return [];
    }
  } else {
    console.log('📊 In-memory material stock data:', inMemoryStocks.length, 'records');
    return inMemoryStocks;
  }
}

async function saveMaterialStock(groupKey, groupName, quantity) {
  console.log('💾 saveMaterialStock called:', { groupKey, groupName, quantity });
  
  if (isProduction && sql) {
    try {
      const upsertQuery = `
        INSERT INTO material_stocks (group_key, group_name, quantity, updated_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (group_key)
        DO UPDATE SET 
          group_name = $2, 
          quantity = $3, 
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;
      const result = await sql.query(upsertQuery, [groupKey, groupName, quantity]);
      console.log('✅ Material stock saved to Postgres:', result.rows[0]);
      return { success: true, data: result.rows[0] };
    } catch (error) {
      console.error('❌ Error saving material stock to Postgres:', error);
      return { success: false, error: error.message };
    }
  } else {
    // Handle in-memory storage
    const existingIndex = inMemoryStocks.findIndex(s => s.group_key === groupKey);
    
    const stockData = {
      id: existingIndex >= 0 ? inMemoryStocks[existingIndex].id : nextStockId++,
      group_key: groupKey,
      group_name: groupName,
      quantity: quantity,
      created_at: existingIndex >= 0 ? inMemoryStocks[existingIndex].created_at : new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    if (existingIndex >= 0) {
      inMemoryStocks[existingIndex] = stockData;
      console.log('✅ Updated material stock in memory:', stockData);
    } else {
      inMemoryStocks.push(stockData);
      console.log('✅ Added new material stock to memory:', stockData);
    }
    
    return { success: true, data: stockData };
  }
}

// Helper function to parse month headers
function parseMonthHeader(headerValue) {
  const header = headerValue.toLowerCase().trim();
  
  // Japanese months
  const japaneseMonths = {
    '1月': '01/01', '2月': '02/01', '3月': '03/01', '4月': '04/01',
    '5月': '05/01', '6月': '06/01', '7月': '07/01', '8月': '08/01',
    '9月': '09/01', '10月': '10/01', '11月': '11/01', '12月': '12/01'
  };
  
  for (const [japanese, monthKey] of Object.entries(japaneseMonths)) {
    if (header.includes(japanese.toLowerCase())) {
      return { monthKey, displayName: japanese };
    }
  }
  
  // English months
  const englishMonths = {
    'jan': '01/01', 'feb': '02/01', 'mar': '03/01', 'apr': '04/01',
    'may': '05/01', 'jun': '06/01', 'jul': '07/01', 'aug': '08/01',
    'sep': '09/01', 'oct': '10/01', 'nov': '11/01', 'dec': '12/01'
  };
  
  for (const [english, monthKey] of Object.entries(englishMonths)) {
    if (header.includes(english)) {
      return { monthKey, displayName: english.toUpperCase() };
    }
  }
  
  // Numeric formats: 2025/8, 2025-8, 8, etc.
  const numericMatch = header.match(/(?:20\d{2}[\/\-])?(\d{1,2})/);
  if (numericMatch) {
    const month = parseInt(numericMatch[1]);
    if (month >= 1 && month <= 12) {
      const monthKey = `${String(month).padStart(2, '0')}/01`;
      return { monthKey, displayName: `${month}月` };
    }
  }
  
  return null;
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

// ============ ROUTES ============

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: isProduction ? 'production' : 'development',
    database: sql ? 'postgres' : 'memory'
  });
});

// Login page
app.get('/', (req, res) => {
  try {
    console.log('🏠 Root route - checking session:', !!req.session?.user);
    if (req.session?.user) {
      console.log('👤 User already logged in, redirecting to dashboard');
      res.redirect('/dashboard');
    } else {
      console.log('🔓 No user session, showing login page');
      res.sendFile(path.join(__dirname, 'public', 'login.html'));
    }
  } catch (error) {
    console.error('❌ Error in root route:', error);
    res.status(500).send('Server error');
  }
});

// Dashboard page
app.get('/dashboard', enhancedRequireAuth, (req, res) => {
  try {
    console.log('📊 Dashboard route accessed by:', req.session.user.username);
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
  } catch (error) {
    console.error('❌ Error in dashboard route:', error);
    res.status(500).send('Server error');
  }
});

// Forecast page
app.get('/forecast', enhancedRequireAuth, (req, res) => {
  try {
    console.log('📈 Forecast route accessed by:', req.session.user.username);
    res.sendFile(path.join(__dirname, 'public', 'forecast.html'));
  } catch (error) {
    console.error('❌ Error in forecast route:', error);
    res.status(500).send('Server error');
  }
});

// Material Stock page
app.get('/stock', enhancedRequireAuth, (req, res) => {
  try {
    console.log('📦 Material Stock route accessed by:', req.session.user.username);
    res.sendFile(path.join(__dirname, 'public', 'stock.html'));
  } catch (error) {
    console.error('❌ Error in material stock route:', error);
    res.status(500).send('Server error');
  }
});

// Enhanced login endpoint with specific users and 4-digit password validation
app.post('/api/login', (req, res) => {
  try {
    const { username, password } = req.body;
    console.log('🔑 Login attempt:', { username, passwordLength: password?.length });
    
    let userRole = null;
    let isValidLogin = false;
    
    // Admin login (existing)
    if (username === 'admin') {
      userRole = 'admin';
      isValidLogin = true; // Admin can use any password
    } 
    // Specific users with 4-digit password requirement
    else if (username === 'user5313' || username === 'user5314') {
      // Validate 4-digit password
      if (password && /^\d{4}$/.test(password)) {
        userRole = 'user';
        isValidLogin = true;
      } else {
        console.log('❌ Invalid password format for user:', username, 'Expected: 4 digits');
        return res.status(401).json({ 
          success: false, 
          message: 'Password must be exactly 4 digits for user accounts' 
        });
      }
    }
    
    if (isValidLogin && userRole) {
      const loginTime = new Date().toISOString();
      const sessionData = {
        username, 
        role: userRole,
        loginTime: loginTime,
        sessionId: req.sessionID
      };
      
      // Set user data in session
      req.session.user = sessionData;
      
      // Track login history
      loginHistory.push({
        username,
        role: userRole,
        action: 'LOGIN',
        timestamp: loginTime,
        sessionId: req.sessionID,
        userAgent: req.headers['user-agent'] || 'Unknown',
        ip: req.ip || req.connection.remoteAddress || 'Unknown'
      });
      
      // Keep only last 100 login records
      if (loginHistory.length > 100) {
        loginHistory = loginHistory.slice(-100);
      }
      
      console.log('✅ Login successful for:', username, 'Role:', userRole);
      console.log('✅ Session ID:', req.sessionID);
      
      res.json({ 
        success: true, 
        message: 'Login successful',
        role: userRole,
        username: username,
        permissions: {
          canEdit: userRole === 'admin',
          canView: true
        }
      });
    } else {
      console.log('❌ Login failed for:', username);
      
      // Track failed login attempt
      loginHistory.push({
        username: username || 'Unknown',
        role: null,
        action: 'LOGIN_FAILED',
        timestamp: new Date().toISOString(),
        sessionId: req.sessionID,
        userAgent: req.headers['user-agent'] || 'Unknown',
        ip: req.ip || req.connection.remoteAddress || 'Unknown',
        reason: !username ? 'No username' : 
               (username !== 'admin' && username !== 'user5313' && username !== 'user5314') ? 'Invalid username' : 
               'Invalid password format'
      });
      
      res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials. Valid users: admin, user5313, user5314. Users need 4-digit password.' 
      });
    }
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// User info endpoint
app.get('/api/user-info', enhancedRequireAuth, (req, res) => {
  try {
    const user = req.session.user;
    console.log('ℹ️ User info requested for:', user.username);
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

// Enhanced logout endpoint with logging
app.post('/api/logout', (req, res) => {
  try {
    const username = req.session?.user?.username;
    const sessionId = req.sessionID;
    console.log('🚪 Logout attempt for:', username);
    
    // Track logout before destroying session
    if (username) {
      loginHistory.push({
        username,
        role: req.session.user.role,
        action: 'LOGOUT',
        timestamp: new Date().toISOString(),
        sessionId: sessionId,
        userAgent: req.headers['user-agent'] || 'Unknown',
        ip: req.ip || req.connection.remoteAddress || 'Unknown'
      });
    }
    
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

// New endpoint: Get login history (admin only)
app.get('/api/login-history', requireAdminAuth, (req, res) => {
  try {
    console.log('📊 Login history requested by:', req.session.user.username);
    
    // Return last 50 entries, most recent first
    const recentHistory = loginHistory
      .slice(-50)
      .reverse()
      .map(entry => ({
        ...entry,
        ip: entry.ip === '::1' ? 'localhost' : entry.ip // Clean up localhost display
      }));
    
    res.json({
      success: true,
      history: recentHistory,
      totalEntries: loginHistory.length
    });
  } catch (error) {
    console.error('❌ Error fetching login history:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch login history' 
    });
  }
});

// ============ EDI DATA API ENDPOINTS ============

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

// ============ EXPORT ENDPOINTS ============

// Enhanced CSV export endpoint
app.get('/api/export/csv', enhancedRequireAuth, async (req, res) => {
  console.log('📊 CSV export requested');
  
  try {
    // Get all orders
    const orders = await getAllOrders();
    console.log(`📊 Exporting ${orders.length} orders to CSV`);
    
    // Create CSV headers
    const headers = [
      'Order Number',
      'Drawing Number', 
      'Product Name',
      'Quantity',
      'Delivery Date',
      'Status',
      'Created At',
      'Updated At'
    ];
    
    // Create CSV content
    let csvContent = headers.join(',') + '\n';
    
    // Add data rows
    orders.forEach(order => {
      const row = [
        `"${order.order_number || ''}"`,
        `"${order.drawing_number || ''}"`,
        `"${order.product_name || ''}"`,
        order.quantity || 0,
        `"${order.delivery_date || ''}"`,
        `"${(order.status || '').replace(/"/g, '""')}"`, // Escape quotes in status
        `"${order.created_at ? new Date(order.created_at).toLocaleString() : ''}"`,
        `"${order.updated_at ? new Date(order.updated_at).toLocaleString() : ''}"`
      ];
      csvContent += row.join(',') + '\n';
    });
    
    // Set response headers for CSV download
    const fileName = `EDI_Orders_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    
    // Add BOM for proper Excel UTF-8 handling
    const BOM = '\uFEFF';
    res.send(BOM + csvContent);
    
    console.log('✅ CSV export completed successfully');
    
  } catch (error) {
    console.error('❌ CSV export error:', error);
    res.status(500).json({ error: 'Failed to export CSV file', details: error.message });
  }
});

// JSON export for easy data access
app.get('/api/export/json', enhancedRequireAuth, async (req, res) => {
  console.log('📊 JSON export requested');
  
  try {
    const orders = await getAllOrders();
    
    // Create formatted export data
    const exportData = {
      export_info: {
        timestamp: new Date().toISOString(),
        exported_by: req.session.user.username,
        total_records: orders.length,
        format: 'JSON'
      },
      orders: orders.map(order => ({
        order_number: order.order_number || '',
        drawing_number: order.drawing_number || '',
        product_name: order.product_name || '',
        quantity: order.quantity || 0,
        delivery_date: order.delivery_date || '',
        status: order.status || '',
        created_at: order.created_at,
        updated_at: order.updated_at
      }))
    };
    
    const fileName = `EDI_Orders_${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    
    res.json(exportData);
    
    console.log('✅ JSON export completed successfully');
    
  } catch (error) {
    console.error('❌ JSON export error:', error);
    res.status(500).json({ error: 'Failed to export JSON file', details: error.message });
  }
});

// ============ FORECAST API ENDPOINTS ============

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

// Clear all forecast data endpoint
app.delete('/api/forecasts/clear', requireAdminAuth, async (req, res) => {
  console.log('🗑️ Clear all forecasts requested');
  
  try {
    const result = await clearAllForecasts();
    
    if (result.success) {
      console.log('✅ All forecasts cleared successfully');
      res.json({ 
        success: true, 
        message: 'All forecast data cleared successfully' 
      });
    } else {
      console.log('❌ Failed to clear forecasts');
      res.status(500).json({ error: result.error || 'Failed to clear forecast data' });
    }
  } catch (error) {
    console.error('❌ Error clearing forecasts:', error);
    res.status(500).json({ error: 'Failed to clear forecast data', details: error.message });
  }
});

// Save forecast data (admin only)
app.post('/api/forecasts', requireAdminAuth, async (req, res) => {
  console.log('🌐 POST /api/forecasts called');
  console.log('📊 Request body:', req.body);
  
  try {
    // Use correct field names from frontend
    const { drawing_number, month_date, quantity } = req.body;
    
    console.log('🔍 Extracted fields:', { drawing_number, month_date, quantity });
    
    if (!drawing_number || !month_date || quantity === undefined) {
      console.log('❌ Missing required fields:', { drawing_number, month_date, quantity });
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const result = await saveForecast(drawing_number, month_date, parseInt(quantity) || 0);
    
    if (result.success) {
      console.log('✅ Individual forecast save successful');
      res.json({ success: true, message: 'Forecast saved successfully' });
    } else {
      console.log('❌ Individual forecast save failed');
      res.status(500).json({ error: result.error || 'Failed to save forecast' });
    }
  } catch (error) {
    console.error('❌ Error saving forecast:', error);
    res.status(500).json({ error: 'Failed to save forecast' });
  }
});

// Batch save forecasts (admin only)
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
        
        // Use correct field names from frontend
        const result = await saveForecast(
          forecast.drawing_number,  // Fixed from forecast.drawingNumber
          forecast.month_date,      // Fixed from forecast.monthDate  
          parseInt(forecast.quantity) || 0
        );
        
        if (result.success) {
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

// Enhanced Excel import for forecasts
app.post('/api/import-forecast', requireAdminAuth, upload.single('forecastFile'), async (req, res) => {
  console.log('📁 Import forecast Excel file called');
  
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

    // Only accept Excel files
    if (!req.file.mimetype.includes('spreadsheet') && !req.file.originalname.match(/\.(xlsx|xls)$/)) {
      return res.status(400).json({ error: 'Please upload an Excel file (.xlsx or .xls)' });
    }

    let XLSX;
    try {
      XLSX = require('xlsx');
      console.log('✅ XLSX library loaded successfully');
    } catch (xlsxError) {
      console.error('❌ XLSX library not found:', xlsxError);
      return res.status(500).json({ 
        error: 'Excel processing not available. Please install xlsx library.',
        details: 'npm install xlsx'
      });
    }

    // Read the Excel file
    const workbook = XLSX.read(req.file.buffer, {
      cellStyles: true,
      cellFormulas: true,
      cellDates: true,
      cellNF: true,
      sheetStubs: true
    });

    console.log('📊 Workbook sheets:', workbook.SheetNames);
    
    // Use first sheet or find appropriate sheet
    let sheetName = workbook.SheetNames[0];
    
    // Try to find a sheet with forecast-related name
    for (const name of workbook.SheetNames) {
      if (name.toLowerCase().includes('forecast') || 
          name.toLowerCase().includes('予測') || 
          name.toLowerCase().includes('計画')) {
        sheetName = name;
        break;
      }
    }
    
    console.log('📊 Using sheet:', sheetName);
    const worksheet = workbook.Sheets[sheetName];
    
    if (!worksheet) {
      return res.status(400).json({ error: 'No valid worksheet found in Excel file' });
    }

    // Convert to JSON with headers
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
      header: 1, // Use array format to handle any header structure
      defval: '',
      blankrows: false
    });
    
    console.log('📊 Raw data rows:', jsonData.length);
    console.log('📊 Sample rows:', jsonData.slice(0, 5));
    
    if (jsonData.length < 2) {
      return res.status(400).json({ error: 'Excel file must have at least 2 rows (header + data)' });
    }

    // Enhanced parsing logic
    const results = [];
    let headerRow = null;
    let drawingColumnIndex = -1;
    let monthColumns = [];
    
    // Find header row and identify columns
    for (let rowIndex = 0; rowIndex < Math.min(5, jsonData.length); rowIndex++) {
      const row = jsonData[rowIndex];
      
      // Look for drawing number column
      for (let colIndex = 0; colIndex < row.length; colIndex++) {
        const cellValue = String(row[colIndex] || '').trim();
        
        // Check if this looks like a drawing number or drawing number header
        if (cellValue.includes('PP4166') || 
            cellValue.toLowerCase().includes('drawing') ||
            cellValue.includes('図番') ||
            cellValue.includes('品番')) {
          
          headerRow = rowIndex;
          drawingColumnIndex = colIndex;
          console.log(`📊 Found drawing column at row ${rowIndex}, col ${colIndex}: "${cellValue}"`);
          break;
        }
      }
      
      if (headerRow !== null) break;
    }
    
    if (headerRow === null || drawingColumnIndex === -1) {
      return res.status(400).json({ 
        error: 'Could not find drawing number column. Please ensure your Excel file has a column with drawing numbers (PP4166-xxx) or headers like "Drawing Number", "図番", "品番"'
      });
    }
    
    // Identify month columns from header row
    const headerRowData = jsonData[headerRow];
    for (let colIndex = drawingColumnIndex + 1; colIndex < headerRowData.length; colIndex++) {
      const headerValue = String(headerRowData[colIndex] || '').trim();
      
      if (headerValue) {
        const monthInfo = parseMonthHeader(headerValue);
        if (monthInfo) {
          monthColumns.push({
            index: colIndex,
            header: headerValue,
            monthKey: monthInfo.monthKey,
            displayName: monthInfo.displayName
          });
          console.log(`📅 Found month column ${colIndex}: "${headerValue}" -> ${monthInfo.monthKey}`);
        }
      }
    }
    
    console.log(`📅 Total month columns found: ${monthColumns.length}`);
    
    if (monthColumns.length === 0) {
      return res.status(400).json({ 
        error: 'Could not find any month columns. Please ensure your Excel file has month headers like "8月", "Aug", "2025/8", etc.'
      });
    }
    
    // Process data rows
    let processedRows = 0;
    let savedForecasts = 0;
    
    for (let rowIndex = headerRow + 1; rowIndex < jsonData.length; rowIndex++) {
      const row = jsonData[rowIndex];
      const drawingNumber = String(row[drawingColumnIndex] || '').trim();
      
      // Skip rows without valid drawing numbers
      if (!drawingNumber || !drawingNumber.startsWith('PP4166')) {
        continue;
      }
      
      processedRows++;
      
      // Process each month column
      for (const monthCol of monthColumns) {
        const quantity = parseInt(row[monthCol.index]) || 0;
        
        if (quantity > 0) {
          try {
            const result = await saveForecast(drawingNumber, monthCol.monthKey, quantity);
            if (result.success) {
              savedForecasts++;
              console.log(`✅ Saved: ${drawingNumber} - ${monthCol.monthKey} = ${quantity}`);
            }
          } catch (error) {
            console.error(`❌ Error saving forecast for ${drawingNumber}-${monthCol.monthKey}:`, error);
          }
        }
      }
    }
    
    res.json({
      success: true,
      message: `Import completed: ${savedForecasts} forecasts saved from ${processedRows} data rows`,
      details: {
        sheetName: sheetName,
        headerRow: headerRow + 1,
        monthColumns: monthColumns.length,
        rowsProcessed: processedRows,
        saved: savedForecasts
      }
    });
    
  } catch (error) {
    console.error('❌ Error in forecast import:', error);
    res.status(500).json({ 
      error: 'Failed to import forecast data',
      details: error.message 
    });
  }
});

// ============ MATERIAL STOCK API ENDPOINTS ============

// Get material stock data with enhanced formatting
app.get('/api/material-stocks', enhancedRequireAuth, async (req, res) => {
  console.log('🌐 GET /api/material-stocks called');
  
  try {
    const stocks = await getAllMaterialStocks();
    
    // Add computed fields for better client-side usage
    const enhancedStocks = stocks.map(stock => ({
      ...stock,
      last_updated_formatted: stock.updated_at ? 
        new Date(stock.updated_at).toLocaleString() : 
        'Never',
      has_stock: (stock.quantity || 0) > 0,
      stock_level: (stock.quantity || 0) > 100 ? 'high' : 
                   (stock.quantity || 0) > 50 ? 'medium' :
                   (stock.quantity || 0) > 0 ? 'low' : 'empty'
    }));
    
    console.log('📤 Sending enhanced material stocks response with', enhancedStocks.length, 'records');
    res.json(enhancedStocks);
    
  } catch (error) {
    console.error('❌ Error fetching material stocks:', error);
    res.status(500).json({ 
      error: 'Failed to fetch material stock data',
      details: error.message 
    });
  }
});

// Enhanced material stock saving with better error handling
app.post('/api/material-stocks', requireAdminAuth, async (req, res) => {
  console.log('🌐 POST /api/material-stocks called');
  console.log('📊 Request body:', req.body);
  
  try {
    const { stocks } = req.body;
    
    if (!stocks || typeof stocks !== 'object') {
      return res.status(400).json({ 
        error: 'Invalid stock data format', 
        expected: 'Object with group keys and stock data' 
      });
    }
    
    let saved = 0;
    let errors = 0;
    const results = [];
    
    // Save each stock entry
    for (const [groupKey, stockData] of Object.entries(stocks)) {
      if (groupKey !== 'lastSaved' && groupKey !== 'calculationsGenerated') {
        try {
          const result = await saveMaterialStock(
            groupKey,
            stockData.groupName || groupKey,
            parseInt(stockData.quantity) || 0
          );
          
          if (result.success) {
            saved++;
            results.push({ groupKey, status: 'saved', data: result.data });
          } else {
            errors++;
            results.push({ groupKey, status: 'error', error: result.error });
          }
        } catch (error) {
          console.error(`❌ Error saving stock for ${groupKey}:`, error);
          errors++;
          results.push({ groupKey, status: 'error', error: error.message });
        }
      }
    }
    
    console.log(`📦 Material stocks batch save completed: ${saved} saved, ${errors} errors`);
    
    const response = { 
      success: saved > 0, 
      message: `Material stocks batch save: ${saved} groups saved${errors > 0 ? `, ${errors} errors` : ''}`,
      saved,
      errors,
      results: results
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('❌ Error in material stocks batch save:', error);
    res.status(500).json({ 
      error: 'Failed to save material stock data',
      details: error.message 
    });
  }
});

// Clear stocks endpoint (for testing/maintenance)
app.delete('/api/material-stocks/clear', requireAdminAuth, async (req, res) => {
  console.log('🗑️ Clear all material stocks requested');
  
  try {
    if (isProduction && sql) {
      const deleteQuery = 'DELETE FROM material_stocks';
      await sql.query(deleteQuery);
      console.log('✅ All material stocks cleared from Postgres');
    } else {
      inMemoryStocks = [];
      console.log('✅ All material stocks cleared from memory');
    }
    
    res.json({ 
      success: true, 
      message: 'All material stock data cleared successfully' 
    });
    
  } catch (error) {
    console.error('❌ Error clearing material stocks:', error);
    res.status(500).json({ 
      error: 'Failed to clear material stock data',
      details: error.message 
    });
  }
});

// ============ DEBUG ENDPOINTS ============

// Enhanced debug endpoint for forecasts
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

// Debug endpoint for stock calculations
app.get('/api/debug/stocks', enhancedRequireAuth, async (req, res) => {
  console.log('🔍 DEBUG: Material stocks endpoint called');
  
  try {
    const stocks = await getAllMaterialStocks();
    const orders = await getAllOrders();
    const forecasts = await getAllForecasts();
    
    // Basic stock consumption calculation for debugging
    const stockSummary = {};
    
    stocks.forEach(stock => {
      const relatedOrders = orders.filter(order => {
        // This is a simplified mapping - in real implementation you'd use product groups
        return order.drawing_number && stock.group_name && 
               (order.drawing_number.includes('4681') && stock.group_key === 'upper-frame' ||
                order.drawing_number.includes('4726') && stock.group_key === 'top-plate' ||
                (order.drawing_number.includes('4731') || order.drawing_number.includes('7106')) && stock.group_key === 'middle-frame');
      });
      
      const totalDemand = relatedOrders.reduce((sum, order) => sum + (parseInt(order.quantity) || 0), 0);
      
      stockSummary[stock.group_key] = {
        groupName: stock.group_name,
        currentStock: stock.quantity || 0,
        totalDemand: totalDemand,
        relatedOrdersCount: relatedOrders.length,
        stockSufficient: (stock.quantity || 0) >= totalDemand,
        shortage: Math.max(0, totalDemand - (stock.quantity || 0))
      };
    });
    
    res.json({
      source: isProduction ? 'postgres' : 'memory',
      stockCount: stocks.length,
      orderCount: orders.length,
      forecastCount: forecasts.length,
      stockSummary: stockSummary,
      rawStocks: stocks,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error in stocks debug endpoint:', error);
    res.status(500).json({ 
      error: 'Stock debug failed', 
      details: error.message 
    });
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
    console.log('🚀 Starting Enhanced EDI Management System...');
    await initializeDatabase();
    
    if (!isProduction) {
      app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📁 Static files served from: ${path.join(__dirname, 'public')}`);
        console.log(`📦 Material stock integration: ACTIVE`);
        console.log(`📊 Enhanced chart rendering: ACTIVE`);
        console.log(`🔄 Cross-window communication: ACTIVE`);
        console.log(`🔐 Enhanced login system: user5313, user5314 (4-digit passwords)`);
        console.log(`📋 Login tracking: ACTIVE`);
      });
    }
    
    console.log('✅ Enhanced server initialization complete');
  } catch (error) {
    console.error('❌ Failed to start server:', error);
  }
}

startServer();

module.exports = app;