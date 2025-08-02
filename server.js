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
app.use(session({
  secret: process.env.SESSION_SECRET || 'edi-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

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

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (req.session.user) {
    next();
  } else {
    res.status(401).json({ error: 'Authentication required' });
  }
};

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
      return result.rows;
    } catch (error) {
      console.error('Error fetching from Postgres:', error);
      return [];
    }
  } else {
    // Sort in-memory data with proper date sorting
    return inMemoryData.sort((a, b) => {
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
        return { added: true, skipped: false };
      } else {
        return { added: false, skipped: true };
      }
    } catch (error) {
      console.error('Error adding to Postgres:', error);
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
      return { added: true, skipped: false };
    } else {
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
app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Login endpoint
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  // Check if username starts with "admin" and has 4 digits
  const adminPattern = /^admin\d{4}$/;
  
  if (adminPattern.test(username)) {
    req.session.user = { username };
    res.json({ success: true, message: 'Login successful' });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials. Username must be "admin" + 4 digits' });
  }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Get all EDI data with sorting
app.get('/api/edi-data', requireAuth, async (req, res) => {
  try {
    const orders = await getAllOrders();
    res.json(orders);
  } catch (error) {
    console.error('Error fetching EDI data:', error);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// Update status for an order
app.put('/api/edi-data/:orderId', requireAuth, async (req, res) => {
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

// Import EDI data from CSV/TSV file
app.post('/api/import-edi', requireAuth, upload.single('ediFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const results = [];
    const filePath = req.file.path;
    
    // Read and parse the uploaded file
    fs.createReadStream(filePath)
      .pipe(csv({ separator: '\t' }))
      .on('data', (data) => {
        // Map the columns based on your corrected mapping
        const orderData = {
          orderNumber: data[Object.keys(data)[6]], // Column 7
          quantity: parseInt(data[Object.keys(data)[14]]) || 0, // Column 15
          productName: cleanProductName(data[Object.keys(data)[20]]), // Column 21 - Clean product name
          drawingNumber: data[Object.keys(data)[22]], // Column 23
          deliveryDate: formatDate(data[Object.keys(data)[27]]) // Column 28
        };
        
        if (orderData.orderNumber && orderData.orderNumber.startsWith('LK')) {
          results.push(orderData);
        }
      })
      .on('end', async () => {
        try {
          let imported = 0;
          let skipped = 0;
          
          for (const order of results) {
            try {
              const result = await addOrder(order);
              if (result.added) imported++;
              if (result.skipped) skipped++;
            } catch (error) {
              console.error('Error processing order:', order.orderNumber, error);
            }
          }
          
          // Clean up uploaded file
          fs.unlinkSync(filePath);
          
          res.json({
            success: true,
            message: `Import completed: ${imported} new orders imported, ${skipped} duplicates skipped`,
            imported,
            skipped
          });
          
        } catch (error) {
          console.error('Error importing data:', error);
          res.status(500).json({ error: 'Failed to import data' });
        }
      })
      .on('error', (error) => {
        console.error('Error reading file:', error);
        res.status(500).json({ error: 'Failed to read file' });
      });
      
  } catch (error) {
    console.error('Error in import endpoint:', error);
    res.status(500).json({ error: 'Import failed' });
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
      console.log('   2. Upload your EDI file using "Choose EDI File"');
      console.log('   3. Click "Import WebEDI Data" to load your data');
      console.log('');
      console.log('🌐 For production deployment:');
      console.log('   1. Deploy to Vercel: vercel');
      console.log('   2. Set up Vercel Postgres database');
      console.log('   3. Data will persist in production');
    }
  });
});

module.exports = app;