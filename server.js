const express = require('express');
const session = require('express-session');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { sql } = require('@vercel/postgres');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'edi-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
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

// Initialize database table
async function initializeDatabase() {
  try {
    await sql`
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
    console.log('✅ Database table initialized');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
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
    const result = await sql`
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
        delivery_date ASC
    `;
    res.json(result.rows);
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
    
    await sql`
      UPDATE edi_orders 
      SET status = ${status}, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ${orderId}
    `;
    
    res.json({ success: true, message: 'Status updated successfully' });
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
      .pipe(csv({ separator: '\t' })) // Tab-separated for EDI files
      .on('data', (data) => {
        // Map the columns based on your corrected mapping
        const orderData = {
          orderNumber: data[Object.keys(data)[6]], // Column 7
          quantity: parseInt(data[Object.keys(data)[14]]) || 0, // Column 15
          productName: data[Object.keys(data)[20]], // Column 21
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
              // Check if order already exists
              const existing = await sql`
                SELECT id FROM edi_orders WHERE order_number = ${order.orderNumber}
              `;
              
              if (existing.rows.length === 0) {
                // Insert new order
                await sql`
                  INSERT INTO edi_orders (order_number, quantity, product_name, drawing_number, delivery_date)
                  VALUES (${order.orderNumber}, ${order.quantity}, ${order.productName}, ${order.drawingNumber}, ${order.deliveryDate})
                `;
                imported++;
              } else {
                skipped++;
              }
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

// Utility function to format dates
function formatDate(dateString) {
  if (!dateString) return null;
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString; // Return original if invalid
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}/${month}/${day}`;
  } catch (error) {
    return dateString; // Return original if formatting fails
  }
}

// Initialize database and start server
initializeDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 EDI Management System running on port ${PORT}`);
    console.log(`📱 Login: http://localhost:${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
  });
});

module.exports = app;