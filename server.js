const express = require('express');
const session = require('express-session');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Check if we're in production (Vercel) or development
const isProduction = process.env.VERCEL || process.env.NODE_ENV === 'production';
let sql = null;

// Initialize database connection
if (isProduction) {
  const { sql: vercelSql } = require('@vercel/postgres');
  sql = vercelSql;
  console.log('🌐 Using Vercel Postgres (Production)');
} else {
  console.log('🛠️ Using in-memory storage (Development)');
}

// In-memory storage for local development
let inMemoryData = [];
let nextId = 1;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Enhanced session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'edi-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    secure: false, // Set to false for localhost
    httpOnly: true,
    sameSite: 'lax'
  },
  name: 'edi.session.id' // Custom session name
}));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📍 ${req.method} ${req.path} - Session ID: ${req.sessionID} - User: ${req.session?.user?.username || 'Not logged in'}`);
  next();
});

// Multer configuration for file uploads
const upload = multer({ dest: 'uploads/' });

// Drawing Number priority order
const DRAWING_NUMBER_ORDER = [
  'PP4166-4681P003',
  'PP4166-4681P004', 
  'PP4166-4726P003',
  'PP4166-4726P004',
  'PP4166-4731P002',
  'PP4166-7106P001',
  'PP4166-7106P003'
];

// Enhanced authentication middleware
function enhancedRequireAuth(req, res, next) {
  console.log('🔐 Auth check - Session:', req.session);
  console.log('🔐 Auth check - User:', req.session?.user);
  
  if (req.session && req.session.user) {
    console.log('✅ Authentication successful');
    next();
  } else {
    console.log('❌ Authentication failed - redirecting');
    res.status(401).json({ error: 'Authentication required', redirect: '/' });
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
      console.log('✅ Vercel Postgres table initialized');
    } catch (error) {
      console.error('❌ Database initialization error:', error);
    }
  } else {
    console.log('✅ In-memory storage initialized');
    console.log('💡 Note: Data will not persist after server restart');
  }
}

// Helper function to parse dates in YYYY/MM/DD format
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
  console.log('🌍 isProduction:', isProduction);
  console.log('💾 inMemoryData length:', inMemoryData.length);
  
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
    console.log('📝 Using in-memory data');
    console.log('📊 Raw inMemoryData:', JSON.stringify(inMemoryData, null, 2));
    
    // Sort in-memory data with proper date sorting
    const sorted = inMemoryData.sort((a, b) => {
      const aIndex = DRAWING_NUMBER_ORDER.indexOf(a.drawing_number);
      const bIndex = DRAWING_NUMBER_ORDER.indexOf(b.drawing_number);
      const aPriority = aIndex === -1 ? 999 : aIndex;
      const bPriority = bIndex === -1 ? 999 : bIndex;
      
      // First sort by drawing number priority
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      // Then sort by delivery date (earlier dates first)
      const dateA = parseDate(a.delivery_date);
      const dateB = parseDate(b.delivery_date);
      return dateA - dateB;
    });
    
    console.log('📊 Sorted data:', sorted.length, 'records');
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
    // Update in-memory data
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
  console.log('➕ addOrder called with:', JSON.stringify(orderData, null, 2));
  
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
        console.log('⚠️ Skipped duplicate in Postgres:', orderData.orderNumber);
        return { added: false, skipped: true };
      }
    } catch (error) {
      console.error('❌ Error adding to Postgres:', error);
      return { added: false, skipped: false, error: true };
    }
  } else {
    // Add to in-memory data
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
      console.log('📊 Total records in memory:', inMemoryData.length);
      console.log('📋 New record:', JSON.stringify(newOrder, null, 2));
      return { added: true, skipped: false };
    } else {
      console.log('⚠️ Skipped duplicate in memory:', orderData.orderNumber);
      return { added: false, skipped: true };
    }
  }
}

// Utility function to clean product names
function cleanProductName(productName) {
  if (!productName) return '';
  
  // Remove "RO" + numbers pattern and trim whitespace
  let cleaned = productName.replace(/\s*RO\d+\s*$/i, '').trim();
  
  // Remove any trailing whitespace and extra characters
  cleaned = cleaned.replace(/\s+$/, '');
  
  return cleaned;
}

// Utility function to format dates
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

// Login page
app.get('/', (req, res) => {
  if (req.session.user) {
    res.redirect('/dashboard');
  } else {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
  }
});

// Dashboard page
app.get('/dashboard', enhancedRequireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Enhanced login endpoint
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  console.log('🔑 Login attempt:', { username, hasPassword: !!password });
  
  // Check if username starts with "admin" and has 4 digits
  const adminPattern = /^admin\d{4}$/;
  
  if (adminPattern.test(username)) {
    req.session.user = { username, loginTime: new Date().toISOString() };
    console.log('✅ Login successful for:', username);
    console.log('🍪 Session created:', req.session);
    res.json({ success: true, message: 'Login successful' });
  } else {
    console.log('❌ Login failed for:', username);
    res.status(401).json({ success: false, message: 'Invalid credentials. Username must be "admin" + 4 digits' });
  }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Get all EDI data with sorting
app.get('/api/edi-data', enhancedRequireAuth, async (req, res) => {
  console.log('🌐 GET /api/edi-data called');
  console.log('👤 User session:', req.session.user);
  
  try {
    const orders = await getAllOrders();
    console.log('📤 Sending response with', orders.length, 'records');
    res.json(orders);
  } catch (error) {
    console.error('❌ Error fetching EDI data:', error);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// Update status for an order
app.put('/api/edi-data/:orderId', enhancedRequireAuth, async (req, res) => {
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

// Replace your entire import handler in server.js with this:

app.post('/api/import-edi', enhancedRequireAuth, upload.single('ediFile'), async (req, res) => {
  console.log('📁 Import EDI file called');
  console.log('👤 User session:', req.session.user);
  
  try {
    if (!req.file) {
      console.log('❌ No file uploaded');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('📄 File info:', {
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });

    const results = [];
    const filePath = req.file.path;
    
    // Try to detect and handle Japanese encoding
    let fileContent;
    let detectedEncoding = 'utf8';
    
    try {
      // Try to read as binary first to detect encoding
      const buffer = fs.readFileSync(filePath);
      
      // Check if iconv-lite is available for Japanese encoding
      let iconv;
      try {
        iconv = require('iconv-lite');
        console.log('✅ iconv-lite is available for encoding detection');
      } catch (iconvError) {
        console.log('⚠️ iconv-lite not found. Install with: npm install iconv-lite');
        iconv = null;
      }
      
      // Try different encodings if iconv-lite is available
      if (iconv) {
        // Try Shift-JIS first (most common for Japanese EDI files)
        try {
          fileContent = iconv.decode(buffer, 'shift_jis');
          detectedEncoding = 'shift_jis';
          console.log('🇯🇵 Trying Shift-JIS encoding...');
          
          // Check if this looks better (no weird symbols)
          const testLine = fileContent.split('\n')[0] || '';
          if (!testLine.includes('◆') && !testLine.includes('◇') && !testLine.includes('�')) {
            console.log('✅ Shift-JIS encoding successful!');
          } else {
            throw new Error('Still has corrupted characters');
          }
        } catch (sjisError) {
          console.log('⚠️ Shift-JIS failed, trying EUC-JP...');
          try {
            fileContent = iconv.decode(buffer, 'euc-jp');
            detectedEncoding = 'euc-jp';
            console.log('✅ EUC-JP encoding successful!');
          } catch (eucError) {
            console.log('⚠️ EUC-JP failed, trying ISO-2022-JP...');
            try {
              fileContent = iconv.decode(buffer, 'iso-2022-jp');
              detectedEncoding = 'iso-2022-jp';
              console.log('✅ ISO-2022-JP encoding successful!');
            } catch (isoError) {
              console.log('⚠️ All Japanese encodings failed, using UTF-8');
              fileContent = buffer.toString('utf8');
              detectedEncoding = 'utf8';
            }
          }
        }
      } else {
        // Fallback to UTF-8 if iconv-lite is not available
        fileContent = buffer.toString('utf8');
        detectedEncoding = 'utf8';
      }
      
    } catch (error) {
      console.log('❌ Error reading file:', error);
      fileContent = fs.readFileSync(filePath, 'utf8');
      detectedEncoding = 'utf8';
    }
    
    const lines = fileContent.split('\n').slice(0, 5);
    
    console.log(`📋 File preview with ${detectedEncoding} encoding:`);
    lines.forEach((line, index) => {
      console.log(`Line ${index + 1}:`, line.substring(0, 150));
    });
    
    // Detect separator
    const firstLine = lines[0] || '';
    let separator = '\t';
    
    if (firstLine.includes('\t')) {
      separator = '\t';
      console.log('🔍 Detected separator: TAB');
    } else if (firstLine.includes(',')) {
      separator = ',';
      console.log('🔍 Detected separator: COMMA');
    } else if (firstLine.includes(';')) {
      separator = ';';
      console.log('🔍 Detected separator: SEMICOLON');
    }
    
    // Analyze column structure
    const sampleColumns = firstLine.split(separator);
    console.log('📊 Total columns detected:', sampleColumns.length);
    console.log('📋 Sample columns:', sampleColumns.slice(0, 10));
    
    // Create stream from properly encoded content
    const { Readable } = require('stream');
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
        
        if (rowCount <= 3) {
          console.log(`📋 Row ${rowCount} preview:`, columns.slice(0, 25).map(col => 
            col ? col.toString().substring(0, 20) : ''
          ));
        }
        
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
            console.log(`✅ Found order: ${orderData.orderNumber}`);
            if (rowCount <= 5) {
              console.log(`🏷️ Product name: "${orderData.productName}"`);
            }
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
              
              // Find other data around the LK number
              for (let j = 0; j < columns.length; j++) {
                const colValue = columns[j]?.toString().trim();
                if (!colValue) continue;
                
                // Look for quantity
                if (/^\d+$/.test(colValue) && parseInt(colValue) > 0 && parseInt(colValue) < 10000) {
                  orderData.quantity = parseInt(colValue);
                }
                
                // Look for drawing number
                if (colValue.startsWith('PP4166')) {
                  orderData.drawingNumber = colValue;
                }
                
                // Look for date
                if (/^\d{4}\/\d{2}\/\d{2}$/.test(colValue)) {
                  orderData.deliveryDate = colValue;
                }
                
                // Look for product name (not LK, not PP4166, not pure number, not date)
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
        console.log(`🔤 Encoding used: ${detectedEncoding}`);
        
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
          
          fs.unlinkSync(filePath);
          
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

// Also add this endpoint to fix existing corrupted data
app.post('/api/fix-encoding', enhancedRequireAuth, async (req, res) => {
  console.log('🔧 Fixing encoding for existing data...');
  
  try {
    let fixed = 0;
    
    if (isProduction && sql) {
      // Fix in database
      const updateQuery = `
        UPDATE edi_orders 
        SET product_name = '日本語商品名 (Japanese Product)'
        WHERE product_name LIKE '%◆%' OR product_name LIKE '%◇%'
      `;
      const result = await sql.query(updateQuery);
      fixed = result.rowCount || 0;
    } else {
      // Fix in memory
      for (const order of inMemoryData) {
        if (order.product_name && (order.product_name.includes('◆') || order.product_name.includes('◇'))) {
          const originalName = order.product_name;
          order.product_name = '日本語商品名 (Japanese Product)';
          console.log(`🔧 Fixed: ${originalName} → ${order.product_name}`);
          fixed++;
        }
      }
    }
    
    console.log(`✅ Fixed ${fixed} product names`);
    
    res.json({
      success: true,
      message: `Fixed encoding for ${fixed} product names. Re-import your file with proper encoding for better results.`,
      fixed
    });
  } catch (error) {
    console.error('❌ Error fixing encoding:', error);
    res.status(500).json({ error: 'Failed to fix encoding' });
  }
});

// Add this endpoint to your server.js (after the import handler)

app.post('/api/fix-encoding', enhancedRequireAuth, async (req, res) => {
  console.log('🔧 Fixing encoding for existing data...');
  
  try {
    let fixed = 0;
    
    if (isProduction && sql) {
      // Fix in database
      const updateQuery = `
        UPDATE edi_orders 
        SET product_name = '日本語商品名 (Japanese Product)'
        WHERE product_name LIKE '%◆%' OR product_name LIKE '%◇%'
      `;
      const result = await sql.query(updateQuery);
      fixed = result.rowCount || 0;
    } else {
      // Fix in memory
      for (const order of inMemoryData) {
        if (order.product_name && (order.product_name.includes('◆') || order.product_name.includes('◇'))) {
          const originalName = order.product_name;
          order.product_name = '日本語商品名 (Japanese Product)';
          console.log(`🔧 Fixed: ${originalName} → ${order.product_name}`);
          fixed++;
        }
      }
    }
    
    console.log(`✅ Fixed ${fixed} product names`);
    
    res.json({
      success: true,
      message: `Fixed encoding for ${fixed} product names. Re-import your file with proper encoding for better results.`,
      fixed
    });
  } catch (error) {
    console.error('❌ Error fixing encoding:', error);
    res.status(500).json({ error: 'Failed to fix encoding' });
  }
});

// Initialize with empty data for clean start
function initializeEmptyData() {
  if (!isProduction) {
    console.log('✅ Started with empty dataset');
    console.log('💡 Upload an EDI file to import your data');
  }
}

// Initialize database and start server
initializeDatabase().then(() => {
  initializeEmptyData();
  
  app.listen(PORT, () => {
    console.log(`🚀 EDI Management System running on port ${PORT}`);
    console.log(`📱 Login: http://localhost:${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
    
    if (!isProduction) {
      console.log('');
      console.log('🛠️ DEVELOPMENT MODE');
      console.log('   - Using in-memory storage');
      console.log('   - Data will reset on server restart');
      console.log('   - Starting with empty dataset');
      console.log('');
      console.log('📤 To get started:');
      console.log('   1. Login with admin + 4 digits (e.g., admin1234)');
      console.log('   2. Use "🧪 Add Test Data" to add sample orders');
      console.log('   3. Or upload your EDI file using "Choose EDI File"');
      console.log('');
      console.log('🌐 For production deployment:');
      console.log('   1. Deploy to Vercel: vercel');
      console.log('   2. Set up Vercel Postgres database');
      console.log('   3. Data will persist in production');
    }
  });
});

module.exports = app;