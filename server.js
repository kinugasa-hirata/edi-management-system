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
let nextId = 1;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'edi-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000,
    secure: false,
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
  'PP4166-4681P003', // Product name: ｱｯﾊﾟﾌﾚｰﾑ
  'PP4166-4681P004', // Product name: ｱｯﾊﾟﾌﾚｰﾑ
  'PP4166-4726P003', // Product name: ﾄｯﾌﾟﾌﾟﾚｰﾄ
  'PP4166-4726P004', // Product name: ﾄｯﾌﾟﾌﾟﾚｰﾄ
  'PP4166-4731P002', // Product name: ﾐﾄﾞﾙﾌﾚｰﾑ
  'PP4166-7106P001', // Product name: ﾐﾄﾞﾙﾌﾚｰﾑ
  'PP4166-7106P003' // Product name: ﾐﾄﾞﾙﾌﾚｰﾑ
];

// Enhanced authentication middleware
function enhancedRequireAuth(req, res, next) {
  console.log('🔐 Auth check - User:', req.session?.user);
  
  if (req.session && req.session.user) {
    console.log('✅ Authentication successful');
    next();
  } else {
    console.log('❌ Authentication failed');
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
      
      const createIndexQuery = `
        CREATE INDEX IF NOT EXISTS idx_edi_orders_drawing_number 
        ON edi_orders(drawing_number)
      `;
      await sql.query(createIndexQuery);
      
      console.log('✅ Vercel Postgres table initialized');
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

// Login page
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

// Dashboard page
app.get('/dashboard', enhancedRequireAuth, (req, res) => {
  try {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
  } catch (error) {
    console.error('❌ Error in dashboard route:', error);
    res.status(500).send('Server error');
  }
});

// Updated login endpoint with role-based authentication
app.post('/api/login', (req, res) => {
  try {
    const { username, password } = req.body;
    console.log('🔑 Login attempt:', { username });
    
    const adminPattern = /^admin\d{4}$/;
    const userPattern = /^user\d{4}$/;
    
    let userRole = null;
    
    if (adminPattern.test(username)) {
      userRole = 'admin';
    } else if (userPattern.test(username)) {
      userRole = 'user';
    }
    
    if (userRole) {
      req.session.user = { 
        username, 
        role: userRole,
        loginTime: new Date().toISOString() 
      };
      console.log('✅ Login successful for:', username, 'Role:', userRole);
      res.json({ 
        success: true, 
        message: 'Login successful',
        role: userRole,
        permissions: {
          canEdit: userRole === 'admin',
          canView: true
        }
      });
    } else {
      console.log('❌ Login failed for:', username);
      res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials. Username must be "admin" or "user" followed by 4 digits' 
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

// Logout endpoint
app.post('/api/logout', (req, res) => {
  try {
    req.session.destroy();
    res.json({ success: true });
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
      });
    }
    
    console.log('✅ Server initialization complete');
  } catch (error) {
    console.error('❌ Failed to start server:', error);
  }
}

startServer();

module.exports = app;