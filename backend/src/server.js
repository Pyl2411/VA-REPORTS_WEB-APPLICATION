import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import activityRouter from './routes/activity.js'
import authRouter from './routes/auth.js'
import hourlyReportRouter from './routes/hourlyReport.js'
import dailyTargetRouter from './routes/dailyTarget.js'
import employeeActivityRouter from './routes/employeeActivity.js'
import pool from './db.js'

dotenv.config()

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
  } catch (error) {
    console.error('Migration error (non-fatal):', error.message)
  }
}

const app = express()
const PORT = process.env.PORT || 5000
const HOST = '0.0.0.0'

// CRITICAL FIX: Update CORS origin for your production frontend
app.use(
  cors({
    origin: ['https://vaweb.onrender.com', 'http://localhost:5173'], // Add both frontend URLs
    credentials: true
  })
)
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// FIXED: Mount authRouter at /api/auth to match frontend calls
app.use('/api/auth', authRouter)  // ← FIXED LINE
app.use('/api/activity', activityRouter)
app.use('/api/hourly-report', hourlyReportRouter)
app.use('/api/daily-target', dailyTargetRouter)
app.use('/api/employee-activity', employeeActivityRouter)

app.use((err, _req, res, _next) => {
  console.error('Unhandled error', err)
  res.status(500).json({ message: 'Unexpected error occurred' })
})

// Run migration on startup
migrateDatabase().then(() => {
  app.listen(PORT, HOST, () => {
    console.log(`API server ready on http://${HOST}:${PORT}`)
    console.log(`Auth endpoint available at: http://${HOST}:${PORT}/api/auth/login`)
  })
})
