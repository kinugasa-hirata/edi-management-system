// FIXED: Enhanced session management with improved stability
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

// FIXED: Simplified login tracking without interference
let loginHistory = [];

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving
app.use(express.static(path.join(__dirname, 'public')));

// FIXED: Simplified and more reliable session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'edi-secret-key-2024-super-secure',
  resave: true,  // FIXED: Changed to true to ensure session is saved
  saveUninitialized: false,  // Keep false to avoid creating unnecessary sessions
  rolling: false, // FIXED: Disabled rolling to prevent session conflicts
  cookie: { 
    maxAge: 12 * 60 * 60 * 1000, // FIXED: Extended to 12 hours
    secure: false, // Keep false for development
    httpOnly: true,
    sameSite: 'lax'
  },
  name: 'edi.session.id'
  // FIXED: Removed custom store and cleanup logic that was causing issues
}));

// FIXED: Simplified request logging without session interference
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
  'PP4166-4731P002', // Product name: ﾐﾄﾞﾙﾌﾚｰﾑ A
  'PP4166-7106P001', // Product name: ﾐﾄﾞﾙﾌﾚｰﾑ B
  'PP4166-7106P003' // Product name: ﾐﾄﾞﾙﾌﾚｰﾑ B
];

// FIXED: Updated product group mappings - Split middle frame into two groups
const PRODUCT_GROUPS = {
  'upper-frame': {
    name: 'ｱｯﾊﾟﾌﾞﾚｰﾑ',
    products: ['PP4166-4681P003', 'PP4166-4681P004']
  },
  'top-plate': {
    name: 'ﾄｯﾌﾟﾌﾟﾚｰﾄ',
    products: ['PP4166-4726P003', 'PP4166-4726P004']
  },
  'middle-frame-a': {
    name: 'ﾐﾄﾞﾙﾌﾚｰﾑ A',
    products: ['PP4166-4731P002']
  },
  'middle-frame-b': {
    name: 'ﾐﾄﾞﾙﾌﾚｰﾑ B', 
    products: ['PP4166-7106P001', 'PP4166-7106P003']
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

// FIXED: Simplified authentication middleware without session regeneration
function enhancedRequireAuth(req, res, next) {
  console.log('🔐 FIXED: Auth check - Session ID:', req.sessionID);
  console.log('🔐 FIXED: Auth check - Session exists:', !!req.session);
  console.log('🔐 FIXED: Auth check - User in session:', !!req.session?.user);
  
  if (req.session && req.session.user) {
    console.log('✅ FIXED: Authentication successful for:', req.session.user.username);
    // FIXED: Touch session to extend expiry without regeneration
    req.session.touch();
    next();
  } else {
    console.log('❌ FIXED: Authentication failed - no valid session');
    
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
  console.log('🔐 FIXED: Admin auth check - User:', req.session?.user);
  
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    console.log('✅ FIXED: Admin authentication successful');
    // FIXED: Touch session to extend expiry
    req.session.touch();
    next();
  } else {
    console.log('❌ FIXED: Admin authentication failed');
    res.status(403).json({ 
      error: 'Admin access required', 
      message: 'You need admin privileges to perform this action' 
    });
  }
}

// Database functions (keeping existing functions as they work correctly)
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
    console.log('🏠 FIXED: Root route - checking session:', !!req.session?.user);
    if (req.session?.user) {
      console.log('👤 FIXED: User already logged in, redirecting to dashboard');
      res.redirect('/dashboard');
    } else {
      console.log('🔓 FIXED: No user session, showing login page');
      res.sendFile(path.join(__dirname, 'public', 'login.html'));
    }
  } catch (error) {
    console.error('❌ FIXED: Error in root route:', error);
    res.status(500).send('Server error');
  }
});

// Dashboard page
app.get('/dashboard', enhancedRequireAuth, (req, res) => {
  try {
    console.log('📊 FIXED: Dashboard route accessed by:', req.session.user.username);
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
  } catch (error) {
    console.error('❌ FIXED: Error in dashboard route:', error);
    res.status(500).send('Server error');
  }
});

// Forecast page
app.get('/forecast', enhancedRequireAuth, (req, res) => {
  try {
    console.log('📈 FIXED: Forecast route accessed by:', req.session.user.username);
    res.sendFile(path.join(__dirname, 'public', 'forecast.html'));
  } catch (error) {
    console.error('❌ FIXED: Error in forecast route:', error);
    res.status(500).send('Server error');
  }
});

// Material Stock page
app.get('/stock', enhancedRequireAuth, (req, res) => {
  try {
    console.log('📦 FIXED: Material Stock route accessed by:', req.session.user.username);
    res.sendFile(path.join(__dirname, 'public', 'stock.html'));
  } catch (error) {
    console.error('❌ FIXED: Error in material stock route:', error);
    res.status(500).send('Server error');
  }
});

// FIXED: Completely rewritten login endpoint with better session handling
app.post('/api/login', (req, res) => {
  try {
    const { username, password } = req.body;
    console.log('🔑 FIXED: Login attempt:', { username, passwordLength: password?.length });
    
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
        console.log('❌ FIXED: Invalid password format for user:', username, 'Expected: 4 digits');
        return res.status(401).json({ 
          success: false, 
          message: 'Password must be exactly 4 digits for user accounts' 
        });
      }
    }
    
    if (isValidLogin && userRole) {
      const loginTime = new Date().toISOString();
      
      // FIXED: Simple session creation without regeneration
      const sessionData = {
        username, 
        role: userRole,
        loginTime: loginTime,
        sessionId: req.sessionID
      };
      
      // Set user data in session
      req.session.user = sessionData;
      
      // FIXED: Explicitly save session before responding
      req.session.save((err) => {
        if (err) {
          console.error('❌ FIXED: Session save error:', err);
          return res.status(500).json({ 
            success: false, 
            message: 'Login failed - session error' 
          });
        }
        
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
        
        console.log('✅ FIXED: Login successful for:', username, 'Role:', userRole);
        console.log('✅ FIXED: Session ID:', req.sessionID);
        
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
      });
    } else {
      console.log('❌ FIXED: Login failed for:', username);
      
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
    console.error('❌ FIXED: Login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// User info endpoint
app.get('/api/user-info', enhancedRequireAuth, (req, res) => {
  try {
    const user = req.session.user;
    console.log('ℹ️ FIXED: User info requested for:', user.username);
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
    console.error('❌ FIXED: Error getting user info:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// FIXED: Simplified logout endpoint
app.post('/api/logout', (req, res) => {
  try {
    const username = req.session?.user?.username;
    const sessionId = req.sessionID;
    console.log('🚪 FIXED: Logout attempt for:', username);
    
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
        console.error('❌ FIXED: Session destroy error:', err);
        return res.status(500).json({ success: false, message: 'Logout failed' });
      }
      
      // Clear the session cookie
      res.clearCookie('edi.session.id');
      console.log('✅ FIXED: Logout successful for:', username);
      res.json({ success: true });
    });
  } catch (error) {
    console.error('❌ FIXED: Logout error:', error);
    res.status(500).json({ success: false, message: 'Logout failed' });
  }
});

// New endpoint: Get login history (admin only)
app.get('/api/login-history', requireAdminAuth, (req, res) => {
  try {
    console.log('📊 FIXED: Login history requested by:', req.session.user.username);
    
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
    console.error('❌ FIXED: Error fetching login history:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch login history' 
    });
  }
});

// ============ EDI DATA ENDPOINTS ============
app.get('/api/edi-data', enhancedRequireAuth, async (req, res) => {
  try {
    const data = await getAllOrders();
    res.json(data);
  } catch (error) {
    console.error('Error fetching EDI data:', error);
    res.status(500).json({ error: 'Failed to fetch EDI data' });
  }
});

app.put('/api/edi-data/:id', enhancedRequireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const success = await updateOrderStatus(id, status);
    
    if (success) {
      res.json({ success: true });
    } else {
      res.status(500).json({ success: false, error: 'Failed to update status' });
    }
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ success: false, error: 'Failed to update status' });
  }
});

// Import endpoint
app.post('/api/import-edi', requireAdminAuth, upload.single('ediFile'), async (req, res) => {
  try {
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const results = [];
    let processed = 0;
    let added = 0;
    let skipped = 0;
    let errors = 0;

    // Create readable stream from buffer
    const stream = Readable.from(file.buffer.toString('utf-8'));
    
    // Parse CSV
    await new Promise((resolve, reject) => {
      stream
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', resolve)
        .on('error', reject);
    });

    console.log(`📊 Parsed ${results.length} rows from CSV`);

    for (const row of results) {
      try {
        processed++;

        // Extract data with flexible column mapping
        const orderNumber = row['受注番号'] || row['注文番号'] || row['Order Number'] || row['OrderNumber'] || '';
        const quantity = parseInt(row['受注数量'] || row['数量'] || row['Quantity'] || '0') || 0;
        const productName = cleanProductName(row['品名'] || row['Product Name'] || row['ProductName'] || '');
        const drawingNumber = row['図番'] || row['Drawing Number'] || row['DrawingNumber'] || '';
        const deliveryDate = formatDate(row['納期'] || row['Delivery Date'] || row['DeliveryDate'] || '');

        if (!orderNumber) {
          console.log(`⚠️ Skipping row ${processed}: Missing order number`);
          skipped++;
          continue;
        }

        const result = await addOrder({
          orderNumber,
          quantity,
          productName,
          drawingNumber,
          deliveryDate
        });

        if (result.added) {
          added++;
        } else if (result.skipped) {
          skipped++;
        } else {
          errors++;
        }

      } catch (error) {
        console.error(`❌ Error processing row ${processed}:`, error);
        errors++;
      }
    }

    const message = `Import completed: ${added} added, ${skipped} skipped, ${errors} errors out of ${processed} rows`;
    console.log(`✅ ${message}`);

    res.json({
      success: true,
      message,
      details: { processed, added, skipped, errors }
    });

  } catch (error) {
    console.error('❌ Import error:', error);
    res.status(500).json({
      success: false,
      error: 'Import failed: ' + error.message
    });
  }
});

// ============ FORECAST ENDPOINTS ============
app.get('/api/forecasts', enhancedRequireAuth, async (req, res) => {
  try {
    const forecasts = await getAllForecasts();
    res.json(forecasts);
  } catch (error) {
    console.error('Error fetching forecasts:', error);
    res.status(500).json({ error: 'Failed to fetch forecasts' });
  }
});

// Save individual forecast
app.post('/api/forecasts', requireAdminAuth, async (req, res) => {
  try {
    const { drawing_number, month_date, quantity } = req.body;
    const result = await saveForecast(drawing_number, month_date, quantity);
    res.json(result);
  } catch (error) {
    console.error('Error saving forecast:', error);
    res.status(500).json({ success: false, error: 'Failed to save forecast' });
  }
});

// Save multiple forecasts
app.post('/api/forecasts/batch', requireAdminAuth, async (req, res) => {
  try {
    const { forecasts } = req.body;
    let saved = 0;
    let errors = 0;

    for (const forecast of forecasts) {
      try {
        const result = await saveForecast(
          forecast.drawing_number, 
          forecast.month_date, 
          forecast.quantity
        );
        if (result.success) {
          saved++;
        } else {
          errors++;
        }
      } catch (error) {
        console.error('Error saving individual forecast:', error);
        errors++;
      }
    }

    res.json({
      success: true,
      saved,
      errors,
      total: forecasts.length
    });
  } catch (error) {
    console.error('Error in batch forecast save:', error);
    res.status(500).json({ success: false, error: 'Failed to save forecasts' });
  }
});

// Clear all forecasts
app.delete('/api/forecasts/clear', requireAdminAuth, async (req, res) => {
  try {
    const result = await clearAllForecasts();
    res.json(result);
  } catch (error) {
    console.error('Error clearing forecasts:', error);
    res.status(500).json({ success: false, error: 'Failed to clear forecasts' });
  }
});

// Import forecast from Excel
app.post('/api/import-forecast', requireAdminAuth, upload.single('forecastFile'), async (req, res) => {
  try {
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    // Excel processing would go here
    // For now, return success
    res.json({
      success: true,
      message: 'Forecast import feature ready for Excel implementation',
      details: { rowsProcessed: 0, saved: 0 }
    });

  } catch (error) {
    console.error('❌ Forecast import error:', error);
    res.status(500).json({
      success: false,
      error: 'Forecast import failed: ' + error.message
    });
  }
});

// ============ MATERIAL STOCK ENDPOINTS ============
app.get('/api/material-stocks', enhancedRequireAuth, async (req, res) => {
  try {
    const stocks = await getAllMaterialStocks();
    res.json(stocks);
  } catch (error) {
    console.error('Error fetching material stocks:', error);
    res.status(500).json({ error: 'Failed to fetch material stocks' });
  }
});

app.post('/api/material-stocks', requireAdminAuth, async (req, res) => {
  try {
    const { stocks } = req.body;
    let saved = 0;
    let errors = 0;

    for (const [groupKey, stockData] of Object.entries(stocks)) {
      try {
        const result = await saveMaterialStock(
          groupKey,
          stockData.groupName,
          stockData.quantity
        );
        if (result.success) {
          saved++;
        } else {
          errors++;
        }
      } catch (error) {
        console.error('Error saving individual stock:', error);
        errors++;
      }
    }

    res.json({
      success: true,
      saved,
      errors,
      total: Object.keys(stocks).length
    });
  } catch (error) {
    console.error('Error saving material stocks:', error);
    res.status(500).json({ success: false, error: 'Failed to save material stocks' });
  }
});

// ============ EXPORT ENDPOINTS ============
app.get('/api/export/csv', enhancedRequireAuth, async (req, res) => {
  try {
    const data = await getAllOrders();
    
    // Create CSV content
    const headers = ['Order Number', 'Drawing Number', 'Product Name', 'Quantity', 'Delivery Date', 'Status'];
    const csvContent = [
      headers.join(','),
      ...data.map(order => [
        `"${order.order_number || ''}"`,
        `"${order.drawing_number || ''}"`,
        `"${order.product_name || ''}"`,
        order.quantity || 0,
        `"${order.delivery_date || ''}"`,
        `"${order.status || ''}"`
      ].join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="edi_orders.csv"');
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

app.get('/api/export/json', enhancedRequireAuth, async (req, res) => {
  try {
    const data = await getAllOrders();
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="edi_orders.json"');
    res.json(data);
  } catch (error) {
    console.error('Error exporting JSON:', error);
    res.status(500).json({ error: 'Failed to export JSON' });
  }
});

// ============ DEBUG ENDPOINTS ============
app.get('/api/debug/forecasts', enhancedRequireAuth, async (req, res) => {
  try {
    const forecasts = await getAllForecasts();
    res.json({
      source: isProduction ? 'postgres' : 'memory',
      count: forecasts.length,
      data: forecasts.slice(0, 10) // First 10 records
    });
  } catch (error) {
    res.status(500).json({ error: 'Debug failed' });
  }
});

app.get('/api/debug/stocks', enhancedRequireAuth, async (req, res) => {
  try {
    const stocks = await getAllMaterialStocks();
    const orders = await getAllOrders();
    const forecasts = await getAllForecasts();
    
    res.json({
      source: isProduction ? 'postgres' : 'memory',
      stockCount: stocks.length,
      orderCount: orders.length,
      forecastCount: forecasts.length
    });
  } catch (error) {
    res.status(500).json({ error: 'Debug failed' });
  }
});

// Initialize database and start server
async function startServer() {
  try {
    console.log('🚀 FIXED: Starting Enhanced EDI Management System with improved session handling...');
    await initializeDatabase();
    
    if (!isProduction) {
      app.listen(PORT, () => {
        console.log(`🚀 FIXED: Server running on port ${PORT}`);
        console.log(`📁 Static files served from: ${path.join(__dirname, 'public')}`);
        console.log(`🔐 FIXED: Enhanced session management - more stable login/logout`);
        console.log(`📊 FIXED: Stock calculation includes forecasts properly`);
        console.log(`🔄 Cross-window communication: ACTIVE`);
        console.log(`🔐 Enhanced login system: user5313, user5314 (4-digit passwords)`);
        console.log(`📋 Login tracking: SIMPLIFIED AND STABLE`);
      });
    }
    
    console.log('✅ FIXED: Enhanced server initialization complete with stable sessions');
  } catch (error) {
    console.error('❌ FIXED: Failed to start server:', error);
  }
}

startServer();

module.exports = app;