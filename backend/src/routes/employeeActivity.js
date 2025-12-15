import { Router } from 'express'
import jwt from 'jsonwebtoken'
import pool from '../db.js'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET ?? 'vickhardth-site-pulse-secret'

// Test endpoint to verify route is working
router.get('/test', (req, res) => {
  res.json({ message: 'Employee activity route is working!' })
})

// Middleware to verify token and attach user info
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid token' })
  }

  const token = authHeader.slice(7)
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' })
  }
}

// Get all activities based on user role and hierarchy
router.get('/activities', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id
    const role = req.user.role || ''
    const { page = 1, limit = 20 } = req.query

    const pageNum = parseInt(page) || 1
    const limitNum = parseInt(limit) || 20
    const offset = (pageNum - 1) * limitNum

    // Combine daily and hourly reports into a single activity list with a "reportType" field
    // We'll fetch the daily_target_reports and hourly_reports with matching columns aliased
    const r = (role || '').toLowerCase()
    const isManagerish = r.includes('manager') || r.includes('team leader') || r.includes('group leader')

    // Build WHERE clauses depending on role. For historical records that predate adding
    // user_id we fall back to matching the "incharge" username on daily reports.
    let dailyWhere = ''
    let hourlyWhere = ''
    let params = []
    let username = null
    if (!isManagerish) {
      // fetch username for fallback matching
      const [uRows] = await pool.execute('SELECT username FROM users WHERE id = ?', [userId])
      username = (uRows && uRows[0] && uRows[0].username) || null

      dailyWhere = ' WHERE (dtr.user_id = ? OR dtr.incharge = ?)'
      hourlyWhere = ' WHERE (hr.user_id = ? OR u.username = ?)'
      // params order: daily (userId, username), hourly (userId, username)
      params = [userId, username, userId, username]
    }

    // Select common fields and add reportType
    // For daily: use report_date, in_time/out_time, project_no as projectNo, location_type, daily_target_achieved, problem_faced, incharge as username
    // For hourly: use report_date, NULL in_time/out_time, project_name as projectNo, NULL location_type, daily_target, hourly_activity as dailyTargetAchieved, problem_faced_by_engineer_hourly as problem_faced, username from users table if available
    const dailyQuery = `
      SELECT dtr.id as id,
             dtr.report_date AS reportDate,
             dtr.in_time AS inTime,
             dtr.out_time AS outTime,
             dtr.project_no AS projectNo,
             dtr.location_type AS locationType,
             dtr.daily_target_achieved AS dailyTargetAchieved,
             dtr.problem_faced AS problemFaced,
             dtr.incharge AS username,
             dtr.created_at AS createdAt,
             'daily' AS reportType,
             dtr.customer_name AS customerName,
             dtr.customer_person AS customerPerson,
             dtr.customer_contact AS custContact,
             dtr.end_customer_name AS endCustName,
             dtr.end_customer_person AS endCustPerson,
             dtr.end_customer_contact AS endCustContact,
             dtr.site_location AS siteLocation
                     , NULL AS hourlyActivity
      FROM daily_target_reports dtr
      ${dailyWhere}
    `

    const hourlyQuery = `
      SELECT hr.id AS id,
             hr.report_date AS reportDate,
             NULL AS inTime,
             NULL AS outTime,
             hr.project_name AS projectNo,
             NULL AS locationType,
             hr.daily_target AS dailyTargetAchieved,
             hr.problem_faced_by_engineer_hourly AS problemFaced,
             u.username AS username,
             hr.created_at AS createdAt,
             'hourly' AS reportType,
             NULL AS customerName,
             NULL AS customerPerson,
             NULL AS custContact,
             NULL AS endCustName,
             NULL AS endCustPerson,
             NULL AS endCustContact,
             NULL AS siteLocation,
             hr.hourly_activity AS hourlyActivity
      FROM hourly_reports hr
      LEFT JOIN users u ON hr.user_id = u.id
      ${hourlyWhere}
    `

    // Union both queries, wrap in an outer select to ORDER/LIMIT safely
    const combinedQuery = `
      SELECT id, reportDate, inTime, outTime, projectNo, locationType, dailyTargetAchieved, problemFaced, username, createdAt, reportType,
             customerName, customerPerson, custContact, endCustName, endCustPerson, endCustContact, siteLocation, hourlyActivity
      FROM (
        (${dailyQuery})
        UNION ALL
        (${hourlyQuery})
      ) AS combined
      ORDER BY createdAt DESC
      LIMIT ${limitNum} OFFSET ${offset}
    `

    console.log('Executing combined activities query for role', role, 'with params', params)
    const [activities] = await pool.execute(combinedQuery, params)
    console.log('Fetched combined activities count:', activities.length)

    res.json({
      success: true,
      activities: activities || [],
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: activities ? activities.length : 0,
      },
    })
  } catch (error) {
    console.error('Failed to fetch activities:', error)
    res.status(500).json({ 
      success: false,
      message: 'Unable to fetch activities: ' + error.message,
      error: error.toString()
    })
  }
})

// Get all employees (for Manager/Team Leader to see team structure)
router.get('/employees', verifyToken, async (req, res) => {
  try {
    const role = req.user.role || ''
    const r = role.toLowerCase()
    const isManagerish = r.includes('manager') || r.includes('team leader') || r.includes('group leader')

    if (!isManagerish) {
      return res.status(403).json({ message: 'Only Managers or Team Leaders can view all employees' })
    }

    const [employees] = await pool.execute(`
      SELECT id, username, role, manager_id AS managerId, dob
      FROM users
      ORDER BY role DESC, username ASC
    `)

    res.json({ employees })
  } catch (error) {
    console.error('Failed to fetch employees', error)
    res.status(500).json({ message: 'Unable to fetch employees' })
  }
})

// Get subordinates for a Team Leader (direct reports)
router.get('/subordinates', verifyToken, async (req, res) => {
  try {
    const role = req.user.role || ''
    const userId = req.user.id
    const r = role.toLowerCase()

    // Allow Team Leaders and Managers to fetch direct reports
    const allowed = r.includes('team leader') || r.includes('manager') || r.includes('group leader')
    if (!allowed) {
      return res.status(403).json({ message: 'Only Team Leaders or Managers can view subordinates' })
    }

    const [subordinates] = await pool.execute(`
      SELECT id, username, role, manager_id AS managerId, dob
      FROM users
      WHERE manager_id = ?
      ORDER BY username ASC
    `, [userId])

    res.json({ subordinates })
  } catch (error) {
    console.error('Failed to fetch subordinates', error)
    res.status(500).json({ message: 'Unable to fetch subordinates' })
  }
})

// Get activity summary/statistics by role
router.get('/summary', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id
    const role = req.user.role
    const user = { id: userId }

    let query = ''
    let params = []

    const r = (role || '').toLowerCase()
    const isManagerish = r.includes('manager') || r.includes('team leader') || r.includes('group leader')

    if (isManagerish) {
      // Total activities across all employees
      query = `
        SELECT COUNT(*) as totalActivities, COUNT(DISTINCT incharge) as activeEmployees
        FROM daily_target_reports
      `
      params = []
    } else {
      // Personal activity count
      query = `
        SELECT COUNT(*) as totalActivities
        FROM daily_target_reports
        WHERE user_id = ?
      `
      params = [userId]
    }

    const [summary] = await pool.execute(query, params)

    res.json({ summary: summary[0] || { totalActivities: 0 } })
  } catch (error) {
    console.error('Failed to fetch summary', error)
    res.status(500).json({ message: 'Unable to fetch summary' })
  }
})

// Get absentees (users without a daily target report for a given date)
router.get('/absentees', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id
    const role = req.user.role || ''
    const date = req.query.date || new Date().toISOString().slice(0, 10)

    const r = role.toLowerCase()
    const isManagerish = r.includes('manager') || r.includes('team leader') || r.includes('group leader')

    if (isManagerish) {
      // Return all users who do not have a daily_target_reports row for the date
      const [users] = await pool.execute(`SELECT id, username, role FROM users ORDER BY username ASC`)
      const [reported] = await pool.execute(`SELECT DISTINCT user_id FROM daily_target_reports WHERE report_date = ?`, [date])
      const reportedIds = new Set((reported || []).map((r) => r.user_id))
      const absentees = users.filter((u) => !reportedIds.has(u.id))
      return res.json({ date, absentees })
    }

    // For non-managers, return whether the current user has submitted today
    const [rows] = await pool.execute(`SELECT id FROM daily_target_reports WHERE user_id = ? AND report_date = ? LIMIT 1`, [userId, date])
    const hasSubmitted = rows && rows.length > 0
    return res.json({ date, hasSubmitted, absent: !hasSubmitted })
  } catch (error) {
    console.error('Failed to fetch absentees', error)
    res.status(500).json({ message: 'Unable to fetch absentees' })
  }
})

export default router

// Temporary debug route to inspect the combined activities SQL and parameters
router.get('/activities-debug', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id
    const role = req.user.role || ''
    const { page = 1, limit = 20 } = req.query

    const pageNum = parseInt(page) || 1
    const limitNum = parseInt(limit) || 20
    const offset = (pageNum - 1) * limitNum

    const r = (role || '').toLowerCase()
    const isManagerish = r.includes('manager') || r.includes('team leader') || r.includes('group leader')

    let dailyWhere = ''
    let hourlyWhere = ''
    let params = []
    let username = null
    if (!isManagerish) {
      const [uRows] = await pool.execute('SELECT username FROM users WHERE id = ?', [userId])
      username = (uRows && uRows[0] && uRows[0].username) || null
      dailyWhere = ' WHERE (dtr.user_id = ? OR dtr.incharge = ?)'
      hourlyWhere = ' WHERE (hr.user_id = ? OR u.username = ?)'
      params = [userId, username, userId, username]
    }

    const dailyQuery = `
      SELECT dtr.id as id,
             dtr.report_date AS reportDate,
             dtr.in_time AS inTime,
             dtr.out_time AS outTime,
             dtr.project_no AS projectNo,
             dtr.location_type AS locationType,
             dtr.daily_target_achieved AS dailyTargetAchieved,
             dtr.problem_faced AS problemFaced,
             dtr.incharge AS username,
             dtr.created_at AS createdAt,
             'daily' AS reportType,
             dtr.customer_name AS customerName,
             dtr.customer_person AS customerPerson,
             dtr.customer_contact AS custContact,
             dtr.end_customer_name AS endCustName,
             dtr.end_customer_person AS endCustPerson,
             dtr.end_customer_contact AS endCustContact,
             dtr.site_location AS siteLocation,
             NULL AS hourlyActivity
      FROM daily_target_reports dtr
      ${dailyWhere}
    `

    const hourlyQuery = `
      SELECT hr.id AS id,
             hr.report_date AS reportDate,
             NULL AS inTime,
             NULL AS outTime,
             hr.project_name AS projectNo,
             NULL AS locationType,
             hr.daily_target AS dailyTargetAchieved,
             hr.problem_faced_by_engineer_hourly AS problemFaced,
             u.username AS username,
             hr.created_at AS createdAt,
             'hourly' AS reportType,
             NULL AS customerName,
             NULL AS customerPerson,
             NULL AS custContact,
             NULL AS endCustName,
             NULL AS endCustPerson,
             NULL AS endCustContact,
             NULL AS siteLocation,
             hr.hourly_activity AS hourlyActivity
      FROM hourly_reports hr
      LEFT JOIN users u ON hr.user_id = u.id
      ${hourlyWhere}
    `

    const combinedQuery = `
      SELECT id, reportDate, inTime, outTime, projectNo, locationType, dailyTargetAchieved, problemFaced, username, createdAt, reportType,
             customerName, customerPerson, custContact, endCustName, endCustPerson, endCustContact, siteLocation, hourlyActivity
      FROM (
        (${dailyQuery})
        UNION ALL
        (${hourlyQuery})
      ) AS combined
      ORDER BY createdAt DESC
      LIMIT ${limitNum} OFFSET ${offset}
    `

    // count '?' placeholders in the combinedQuery for debugging
    const placeholderCount = (combinedQuery.match(/\?/g) || []).length

    return res.json({ sql: combinedQuery, params, paramCount: params.length, placeholderCount })
  } catch (err) {
    console.error('Debug route failed', err)
    res.status(500).json({ message: 'Debug failed', error: err.toString() })
  }
})
