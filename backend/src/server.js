import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import helmet from 'helmet'
import compression from 'compression'
import rateLimit from 'express-rate-limit'
import activityRouter from './routes/activity.js'
import authRouter from './routes/auth.js'
import hourlyReportRouter from './routes/hourlyReport.js'
import dailyTargetRouter from './routes/dailyTarget.js'
import employeeActivityRouter from './routes/employeeActivity.js'
let leaveRouter
try {
  leaveRouter = (await import('./routes/leave.js')).default
  console.log('Leave router imported successfully:', !!leaveRouter)
} catch (error) {
  console.error('Failed to import leave router:', error)
  leaveRouter = null
}
import pool from './db.js'

dotenv.config()

// ES Modules fix for __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Auto-migrate: Add missing columns to users table and create new tables
async function migrateDatabase() {
  try {
    const dbName = process.env.DB_NAME ?? 'vickhardth_ops'
    
    // Try to add dob column (will fail silently if it already exists)
    try {
      await pool.execute('ALTER TABLE users ADD COLUMN dob DATE')
      console.log('✓ Added dob column to users table')
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        // Column already exists, that's fine
      } else {
        throw error
      }
    }

    // Try to add role column (will fail silently if it already exists)
    try {
      await pool.execute('ALTER TABLE users ADD COLUMN role VARCHAR(80)')
      console.log('✓ Added role column to users table')
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        // Column already exists, that's fine
      } else {
        throw error
      }
    }

    // Try to add manager_id column for hierarchical structure
    try {
      await pool.execute('ALTER TABLE users ADD COLUMN manager_id INT REFERENCES users(id)')
      console.log('✓ Added manager_id column to users table')
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        // Column already exists, that's fine
      } else {
        throw error
      }
    }

    // Try to add email column
    try {
      await pool.execute('ALTER TABLE users ADD COLUMN email VARCHAR(255) UNIQUE')
      console.log('✓ Added email column to users table')
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        // Column already exists, that's fine
      } else {
        throw error
      }
    }

    // Try to add mobile column
    try {
      await pool.execute('ALTER TABLE users ADD COLUMN mobile VARCHAR(20)')
      console.log('✓ Added mobile column to users table')
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        // Column already exists, that's fine
      } else {
        throw error
      }
    }

    // Try to add joining_date column
    try {
      await pool.execute('ALTER TABLE users ADD COLUMN joining_date DATE')
      console.log('✓ Added joining_date column to users table')
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        // Column already exists, that's fine
      } else {
        throw error
      }
    }

    // Create hourly_reports table if it doesn't exist
    try {
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS hourly_reports (
          id INT AUTO_INCREMENT PRIMARY KEY,
          report_date DATE NOT NULL,
          project_name VARCHAR(120) NOT NULL,
          daily_target TEXT,
          hourly_activity TEXT,
          problem_start TIME NULL,
          problem_end TIME NULL,
          incharge_remark TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `)
      console.log('✓ Created hourly_reports table')
    } catch (error) {
      console.error('Error creating hourly_reports table:', error.message)
    }

    // Ensure hourly_reports has user_id and time_period columns used by APIs
    try {
      await pool.execute('ALTER TABLE hourly_reports ADD COLUMN IF NOT EXISTS user_id INT NULL')
      await pool.execute("ALTER TABLE hourly_reports ADD COLUMN IF NOT EXISTS time_period VARCHAR(50) NULL")
      console.log('✓ Ensured hourly_reports has user_id and time_period columns')
    } catch (error) {
      // Some MySQL versions don't support IF NOT EXISTS in ALTER TABLE for columns; ignore duplicate errors
      if (error.code && error.code === 'ER_DUP_FIELDNAME') {
        // already exists
      } else {
        // Try a safer approach: add column without IF NOT EXISTS and ignore error
        try {
          await pool.execute('ALTER TABLE hourly_reports ADD COLUMN user_id INT NULL')
        } catch (e) {}
        try {
          await pool.execute('ALTER TABLE hourly_reports ADD COLUMN time_period VARCHAR(50) NULL')
        } catch (e) {}
      }
    }

    // Create daily_target_reports table if it doesn't exist
    try {
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS daily_target_reports (
          id INT AUTO_INCREMENT PRIMARY KEY,
          report_date DATE NOT NULL,
          in_time TIME NOT NULL,
          out_time TIME NOT NULL,
          customer_name VARCHAR(120) NOT NULL,
          customer_person VARCHAR(120) NOT NULL,
          customer_contact VARCHAR(20) NOT NULL,
          end_customer_name VARCHAR(120) NOT NULL,
          end_customer_person VARCHAR(120) NOT NULL,
          end_customer_contact VARCHAR(20) NOT NULL,
          project_no VARCHAR(120) NOT NULL,
          location_type VARCHAR(20) NOT NULL,
          site_location VARCHAR(255),
          location_lat DECIMAL(10, 8),
          location_lng DECIMAL(11, 8),
          mom_report_path VARCHAR(255),
          daily_target_planned TEXT NOT NULL,
          daily_target_achieved TEXT NOT NULL,
          additional_activity TEXT,
          who_added_activity VARCHAR(120),
          daily_pending_target TEXT,
          reason_pending_target TEXT,
          problem_faced TEXT,
          problem_resolved TEXT,
          online_support_required TEXT,
          support_engineer_name VARCHAR(120),
          site_start_date DATE NOT NULL,
          site_end_date DATE,
          incharge VARCHAR(120) NOT NULL,
          remark TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `)
      console.log('✓ Created daily_target_reports table')
    } catch (error) {
      console.error('Error creating daily_target_reports table:', error.message)
    }

    // Add report_date column to daily_target_reports if it doesn't exist
    try {
      await pool.execute('ALTER TABLE daily_target_reports ADD COLUMN report_date DATE')
      console.log('✓ Added report_date column to daily_target_reports table')
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        // Column already exists, that's fine
      } else {
        console.error('Error adding report_date column:', error.message)
      }
    }

    // Add new columns to existing daily_target_reports table if they don't exist
    const newColumns = [
      { name: 'end_customer_name', type: 'VARCHAR(120) DEFAULT ""' },
      { name: 'end_customer_person', type: 'VARCHAR(120) DEFAULT ""' },
      { name: 'end_customer_contact', type: 'VARCHAR(20) DEFAULT ""' },
      { name: 'project_no', type: 'VARCHAR(120) DEFAULT ""' },
      { name: 'location_type', type: 'VARCHAR(20) DEFAULT ""' },
      { name: 'site_location', type: 'VARCHAR(255)' },
      { name: 'location_lat', type: 'DECIMAL(10, 8)' },
      { name: 'location_lng', type: 'DECIMAL(11, 8)' },
      { name: 'mom_report_path', type: 'VARCHAR(255)' },
      { name: 'daily_target_planned', type: 'TEXT' },
      { name: 'daily_target_achieved', type: 'TEXT' },
      { name: 'additional_activity', type: 'TEXT' },
      { name: 'who_added_activity', type: 'VARCHAR(120)' },
      { name: 'daily_pending_target', type: 'TEXT' },
      { name: 'reason_pending_target', type: 'TEXT' },
      { name: 'problem_faced', type: 'TEXT' },
      { name: 'problem_resolved', type: 'TEXT' },
      { name: 'online_support_required', type: 'TEXT' },
      { name: 'support_engineer_name', type: 'VARCHAR(120)' },
      { name: 'site_start_date', type: 'DATE' },
      { name: 'site_end_date', type: 'DATE' },
      { name: 'incharge', type: 'VARCHAR(120) DEFAULT ""' },
      { name: 'remark', type: 'TEXT' },
      { name: 'user_id', type: 'INT' },
    ]

    for (const column of newColumns) {
      try {
        await pool.execute(
          `ALTER TABLE daily_target_reports ADD COLUMN ${column.name} ${column.type}`
        )
        console.log(`✓ Added ${column.name} column to daily_target_reports table`)
      } catch (error) {
        if (error.code === 'ER_DUP_FIELDNAME') {
          // Column already exists, that's fine
        } else {
          console.error(`Error adding ${column.name} column:`, error.message)
        }
      }
    }

    // Create leave_applications table
    try {
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS leave_applications (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          leave_type ENUM('casual', 'sick', 'paid') NOT NULL,
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          reason TEXT NOT NULL,
          status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
          approved_by INT NULL,
          approved_at TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
        )
      `)
      console.log('✓ Created leave_applications table')
    } catch (error) {
      console.error('Error creating leave_applications table:', error.message)
    }

    // Create leave_balances table
    try {
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS leave_balances (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          leave_year YEAR NOT NULL,
          casual_leaves INT DEFAULT 12,
          sick_leaves INT DEFAULT 12,
          paid_leaves INT DEFAULT 0,
          used_casual INT DEFAULT 0,
          used_sick INT DEFAULT 0,
          used_paid INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE KEY unique_user_year (user_id, leave_year)
        )
      `)
      console.log('✓ Created leave_balances table')
    } catch (error) {
      console.error('Error creating leave_balances table:', error.message)
    }
  } catch (error) {
    console.error('Migration error (non-fatal):', error.message)
  }
}

const app = express()
const PORT = process.env.PORT || 5000
const HOST = '0.0.0.0'

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for now, configure as needed
  crossOriginEmbedderPolicy: false,
}))

// Rate limiting for API
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS', // Skip OPTIONS requests
})

// Apply rate limiting to API routes
app.use('/api', limiter)

// CORS configuration - dynamically allow origins
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [
      'https://vaweb.onrender.com',
      'https://va-report-frontend.onrender.com', // Your frontend URL
      'https://yourdomain.com', // Add your custom domain if any
    ]
  : [
      'http://localhost:5173', // Added for Vite dev server
      'http://localhost:5174', // Added for Vite dev server
      'http://localhost:5175', // Added for Vite dev server
      'http://localhost:3000',
    ]

// Enable CORS for all origins in development
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? allowedOrigins : true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}))

// Compression middleware for production
if (process.env.NODE_ENV === 'production') {
  app.use(compression())
}

app.use(express.json({ limit: '10mb' })) // Increased limit for file uploads
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime()
  })
})

// API Routes
app.use('/api/auth', authRouter)
app.use('/api/activity', activityRouter)
app.use('/api/hourly-report', hourlyReportRouter)
app.use('/api/daily-target', dailyTargetRouter)
app.use('/api/employee-activity', employeeActivityRouter)
if (leaveRouter) {
  app.use('/api/leave', leaveRouter)
  console.log('Leave router mounted at /api/leave')
} else {
  console.error('Leave router not available, skipping mount')
}

// Serve frontend static files in production
if (process.env.NODE_ENV === 'production') {
  // Assuming frontend is built in a folder relative to backend
  const frontendPath = path.join(__dirname, '../frontend/dist')
  
  // Serve static files from frontend build
  app.use(express.static(frontendPath))
  
  // Handle SPA routing - return index.html for all non-API routes
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(frontendPath, 'index.html'))
    }
  })
  
  console.log('✓ Serving frontend static files from:', frontendPath)
}

// 404 handler for API routes - commented out due to path-to-regexp compatibility issues
// app.use('/api/:param(*)', (req, res) => {
//   res.status(404).json({
//     message: 'API endpoint not found',
//     path: req.originalUrl,
//     method: req.method
//   })
// })

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  })
  
  const statusCode = err.status || 500
  const message = process.env.NODE_ENV === 'production' 
    ? 'Unexpected error occurred' 
    : err.message
    
  res.status(statusCode).json({ 
    message,
    ...(process.env.NODE_ENV !== 'production' && { error: err.message, stack: err.stack })
  })
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...')
  server.close(() => {
    console.log('Server closed')
    pool.end(() => {
      console.log('Database pool closed')
      process.exit(0)
    })
  })
})

// Run migration on startup
migrateDatabase().then(() => {
  const server = app.listen(PORT, HOST, () => {
    console.log(`🚀 Server running in ${process.env.NODE_ENV || 'development'} mode`)
    console.log(`📡 API server ready on http://${HOST}:${PORT}`)
    console.log(`🔐 Auth endpoint: http://${HOST}:${PORT}/api/auth/login`)
    console.log(`🏥 Health check: http://${HOST}:${PORT}/health`)
    
    if (process.env.NODE_ENV === 'production') {
      console.log(`🌐 Serving frontend from static build`)
    }
  })
})