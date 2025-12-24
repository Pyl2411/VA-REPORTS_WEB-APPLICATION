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
             COALESCE(u.username, dtr.incharge) AS username,
             COALESCE(u.employee_id, 'N/A') AS employeeId,
             dtr.user_id AS userId,
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
      LEFT JOIN users u ON dtr.user_id = u.id
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
             COALESCE(u.username, 'Unknown') AS username,
             COALESCE(u.employee_id, 'N/A') AS employeeId,
             hr.user_id AS userId,
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

    console.log('=== DETAILED QUERY DEBUGGING ===')
    console.log('Role:', role)
    console.log('Is Manager:', isManagerish)
    console.log('Params:', params)
    console.log('Daily Query (first 200 chars):', dailyQuery.substring(0, 200) + '...')
    console.log('Hourly Query (first 200 chars):', hourlyQuery.substring(0, 200) + '...')

    // Execute queries separately to avoid UNION issues
    let dailyActivities = []
    let hourlyActivities = []

    try {
      console.log('Executing daily query...')
      const dailyResult = await pool.execute(dailyQuery, isManagerish ? [] : [userId, username])
      dailyActivities = dailyResult[0] || []
      console.log('Daily query successful, got', dailyActivities.length, 'records')
    } catch (dailyError) {
      console.error('Daily query failed:', dailyError)
      throw dailyError
    }

    try {
      console.log('Executing hourly query...')
      const hourlyResult = await pool.execute(hourlyQuery, isManagerish ? [] : [userId, username])
      hourlyActivities = hourlyResult[0] || []
      console.log('Hourly query successful, got', hourlyActivities.length, 'records')
    } catch (hourlyError) {
      console.error('Hourly query failed:', hourlyError)
      throw hourlyError
    }

    // Combine results and sort by createdAt DESC
    const activities = [...dailyActivities, ...hourlyActivities]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(offset, offset + limitNum)

    console.log('Combined and sorted activities, returning', activities.length, 'records')

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
      SELECT id, username, role, manager_id AS managerId, dob, employee_id, joining_date
      FROM users
      ORDER BY role DESC, username ASC
    `)

    res.json({ employees })
  } catch (error) {
    console.error('Failed to fetch employees', error)
    res.status(500).json({ message: 'Unable to fetch employees' })
  }
})

// Get all employees with their attendance overview (accessible to all roles)
router.get('/attendance-overview', verifyToken, async (req, res) => {
  try {
    const { month } = req.query // Get month from query params (format: YYYY-MM)
    const targetMonth = month || new Date().toISOString().slice(0, 7) // Default to current month

    console.log('Fetching attendance overview for all employees, month:', targetMonth)

    // Parse the target month
    const [year, monthNum] = targetMonth.split('-').map(Number)

    // Get all employees with attendance stats for the specified month
    const [employeesResult] = await pool.execute(`
      SELECT
        u.id,
        u.username,
        u.role,
        u.employee_id,
        u.dob,
        u.joining_date,
        COUNT(DISTINCT CASE WHEN dtr.location_type IN ('office', 'site')
          AND MONTH(dtr.report_date) = ? AND YEAR(dtr.report_date) = ?
          THEN DATE(dtr.report_date) END) as selected_month_present,
        DATEDIFF(CURRENT_DATE, u.joining_date) as days_since_joining
      FROM users u
      LEFT JOIN daily_target_reports dtr ON u.id = dtr.user_id
      GROUP BY u.id, u.username, u.role, u.employee_id, u.dob, u.joining_date
      ORDER BY u.username ASC
    `, [monthNum, year])

    console.log('Employee data sample:', employeesResult.slice(0, 3).map(emp => ({
      id: emp.id,
      username: emp.username,
      employee_id: emp.employee_id,
      joining_date: emp.joining_date,
      selected_month_present: emp.selected_month_present
    })))

    res.json({
      employees: employeesResult,
      selectedMonth: targetMonth
    })
  } catch (error) {
    console.error('Failed to fetch attendance overview:', error)
    res.status(500).json({ message: 'Unable to fetch attendance overview' })
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
             COALESCE(u.username, dtr.incharge) AS username,
             COALESCE(u.employee_id, 'N/A') AS employeeId,
             dtr.user_id AS userId,
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
      LEFT JOIN users u ON dtr.user_id = u.id
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
             COALESCE(u.username, 'Unknown') AS username,
             COALESCE(u.employee_id, 'N/A') AS employeeId,
             hr.user_id AS userId,
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
      SELECT id, reportDate, inTime, outTime, projectNo, locationType, dailyTargetAchieved, problemFaced,
             username, employeeId, userId, createdAt, reportType, customerName, customerPerson, custContact,
             endCustName, endCustPerson, endCustContact, siteLocation, hourlyActivity
      FROM (
        (${dailyQuery})
        UNION ALL
        (${hourlyQuery})
      ) AS combined
      ORDER BY createdAt DESC
      LIMIT ${limitNum} OFFSET ${offset}
    `

    console.log('Daily Query:', dailyQuery)
    console.log('Hourly Query:', hourlyQuery)
    console.log('Combined Query:', combinedQuery)

    // count '?' placeholders in the combinedQuery for debugging
    const placeholderCount = (combinedQuery.match(/\?/g) || []).length

    return res.json({ sql: combinedQuery, params, paramCount: params.length, placeholderCount })
  } catch (err) {
    console.error('Debug route failed', err)
    res.status(500).json({ message: 'Debug failed', error: err.toString() })
  }
})

// Get all employees for managers and team leaders
router.get('/employees', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id
    const role = req.user.role || ''

    const r = (role || '').toLowerCase()
    const isManagerish = r.includes('manager') || r.includes('team leader') || r.includes('group leader')

    if (!isManagerish) {
      return res.status(403).json({ message: 'Access denied. Only managers and team leaders can view employee lists.' })
    }

    // Get all employees under this manager's hierarchy
    let employees = []

    if (r.includes('manager')) {
      // Managers see all employees
      const [rows] = await pool.execute(`
        SELECT id, username, role, employee_id, joining_date
        FROM users
        WHERE role NOT LIKE '%Manager%'
        ORDER BY username ASC
      `)
      employees = rows
    } else if (r.includes('team leader')) {
      // Team leaders see employees under them
      const [rows] = await pool.execute(`
        SELECT u.id, u.username, u.role, u.employee_id, u.joining_date
        FROM users u
        WHERE u.manager_id = ?
        ORDER BY u.username ASC
      `, [userId])
      employees = rows
    }

    res.json({ employees })
  } catch (error) {
    console.error('Failed to get employees:', error)
    res.status(500).json({ message: 'Failed to get employees' })
  }
})

// Get specific employee's reports
router.get('/employee-reports/:employeeId', verifyToken, async (req, res) => {
  console.log('=== EMPLOYEE REPORTS ROUTE HIT ===')
  console.log('Request params:', req.params)
  console.log('Request user:', req.user)
  console.log('Response object:', !!res)

  try {
    const userId = req.user?.id
    const { employeeId } = req.params
    const role = req.user?.role || ''

    console.log('Employee reports request:', { userId, employeeId, role, userExists: !!req.user })

    if (!userId) {
      console.log('No user ID found in token')
      return res.status(401).json({ message: 'Invalid token - no user ID' })
    }

    const r = (role || '').toLowerCase()
    console.log('Role lowercase:', r)
    const isManagerish = r.includes('manager') || r.includes('team leader') || r.includes('group leader')
    const isViewingOwnReport = parseInt(userId) === parseInt(employeeId)
    console.log('isManagerish:', isManagerish, 'includes manager:', r.includes('manager'), 'includes team leader:', r.includes('team leader'))
    console.log('isViewingOwnReport:', isViewingOwnReport, 'userId:', userId, 'employeeId:', employeeId)

    // Allow users to view their own reports, or managers/team leaders to view any reports
    if (!isViewingOwnReport && !isManagerish) {
      console.log('Access denied - not managerish and not viewing own report')
      return res.status(403).json({ message: 'Access denied. You can only view your own reports, or managers/team leaders can view all reports.' })
    }

    // Verify the employee exists and check hierarchy only if not viewing own report
    let employeeCheck = []
    console.log('Pool object:', !!pool, typeof pool)

    if (!isViewingOwnReport) {
      try {
        if (r.includes('manager')) {
          console.log('Checking as manager for employee:', employeeId, 'type:', typeof employeeId)
          console.log('About to execute query...')
          const queryResult = await pool.execute('SELECT id FROM users WHERE id = ?', [parseInt(employeeId)])
          console.log('Manager check raw result:', queryResult, 'type:', typeof queryResult)

          if (queryResult && Array.isArray(queryResult) && queryResult.length > 0) {
            const [rows, fields] = queryResult
            employeeCheck = rows || []
          } else {
            employeeCheck = []
          }
          console.log('Manager check result:', employeeCheck)
        } else if (r.includes('team leader')) {
          console.log('Checking as team leader for employee:', employeeId, 'under manager:', userId)
          const queryResult = await pool.execute('SELECT id FROM users WHERE id = ? AND manager_id = ?', [parseInt(employeeId), userId])
          console.log('Team leader check raw result:', queryResult)

          if (queryResult && Array.isArray(queryResult) && queryResult.length > 0) {
            const [rows, fields] = queryResult
            employeeCheck = rows || []
          } else {
            employeeCheck = []
          }
          console.log('Team leader check result:', employeeCheck)
        }
      } catch (dbError) {
        console.log('Database error in employee check:', dbError.message, 'stack:', dbError.stack)
        throw dbError
      }
    } else {
      // User is viewing their own report, just verify they exist
      try {
        console.log('Checking if user exists for own report:', employeeId)
        const queryResult = await pool.execute('SELECT id FROM users WHERE id = ?', [parseInt(employeeId)])
        console.log('Own report check raw result:', queryResult)

        if (queryResult && Array.isArray(queryResult) && queryResult.length > 0) {
          const [rows, fields] = queryResult
          employeeCheck = rows || []
        } else {
          employeeCheck = []
        }
        console.log('Own report check result:', employeeCheck)
      } catch (dbError) {
        console.log('Database error in own report check:', dbError.message, 'stack:', dbError.stack)
        throw dbError
      }
    }

    console.log('Employee check result:', employeeCheck.length)

    if (employeeCheck.length === 0) {
      console.log('Returning 404: Employee not found or access denied')
      return res.status(404).json({ message: 'Employee not found or access denied' })
    }

    console.log('Fetching reports for employee:', employeeId)

    // Get employee details
    const [employeeDetails] = await pool.execute(
      'SELECT username, role, employee_id, joining_date FROM users WHERE id = ?',
      [employeeId]
    )
    console.log('Employee details:', employeeDetails)

    if (!employeeDetails || employeeDetails.length === 0) {
      console.log('Employee not found in database')
      return res.status(404).json({ message: 'Employee not found' })
    }

    const employee = employeeDetails[0]

    // Handle joining date - use a default if not available
    let joiningDate
    if (employee.joining_date) {
      joiningDate = new Date(employee.joining_date)
      if (isNaN(joiningDate.getTime())) {
        console.log('Invalid joining date, using default:', employee.joining_date)
        joiningDate = new Date()
        joiningDate.setMonth(joiningDate.getMonth() - 1) // Default to 1 month ago
      }
    } else {
      console.log('No joining date, using default for employee:', employee.id)
      joiningDate = new Date()
      joiningDate.setMonth(joiningDate.getMonth() - 1) // Default to 1 month ago
    }

    const currentDate = new Date()
    console.log('Generating attendance from', joiningDate.toISOString(), 'to', currentDate.toISOString())

    // Generate attendance data from joining date to current date
    const attendanceData = []
    const reportDates = new Set()

    // Get all valid attendance dates (daily reports with office/site location)
    let validAttendanceDates = []

    try {
      const [attendanceResult] = await pool.execute(
        'SELECT DISTINCT DATE(report_date) as report_date FROM daily_target_reports WHERE user_id = ? AND (location_type = "office" OR location_type = "site")',
        [employeeId]
      )
      validAttendanceDates = attendanceResult || []
      console.log('Valid attendance dates found:', validAttendanceDates.length)
    } catch (error) {
      console.log('Error fetching attendance dates:', error.message)
      validAttendanceDates = []
    }

    // Create attendance date set
    const attendanceDateSet = new Set()
    validAttendanceDates.forEach(row => {
      if (row && row.report_date) {
        try {
          let dateStr = ''
          if (row.report_date instanceof Date && !isNaN(row.report_date.getTime())) {
            dateStr = row.report_date.toISOString().split('T')[0]
          } else if (typeof row.report_date === 'string' && row.report_date) {
            dateStr = row.report_date.split('T')[0]
          } else if (row.report_date) {
            const dateObj = new Date(row.report_date)
            if (!isNaN(dateObj.getTime())) {
              dateStr = dateObj.toISOString().split('T')[0]
            }
          }
          if (dateStr && dateStr !== 'Invalid Date') {
            attendanceDateSet.add(dateStr)
          }
        } catch (error) {
          console.log('Error processing attendance date:', row.report_date, 'Error:', error.message)
        }
      }
    })

    // Generate attendance sheet from joining date (limit to last 365 days for performance)
    const maxDays = 365
    const startDate = new Date(currentDate)
    startDate.setDate(currentDate.getDate() - maxDays)
    const actualStartDate = joiningDate > startDate ? joiningDate : startDate

    console.log('Generating attendance from', actualStartDate?.toISOString(), 'to', currentDate?.toISOString())
    console.log('actualStartDate valid:', actualStartDate instanceof Date && !isNaN(actualStartDate.getTime()))
    console.log('currentDate valid:', currentDate instanceof Date && !isNaN(currentDate.getTime()))

    // Simplified attendance generation
    try {
      const startDate = new Date(Math.max(actualStartDate.getTime(), currentDate.getTime() - (365 * 24 * 60 * 60 * 1000)))

      for (let d = new Date(startDate); d <= currentDate; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0]
        const isPresent = attendanceDateSet.has(dateStr)

        attendanceData.push({
          date: dateStr,
          day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()],
          isPresent: isPresent || false,
          status: isPresent ? 'Present' : 'Absent'
        })
      }

      console.log('Generated attendance data points:', attendanceData.length)
    } catch (error) {
      console.log('Error in attendance generation:', error.message)
      attendanceData.length = 0 // Clear array on error
    }

    console.log('Generated attendance data points:', attendanceData.length)

    // Calculate monthly attendance statistics
    const monthlyStats = {}
    attendanceData.forEach(day => {
      const date = new Date(day.date)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

      if (!monthlyStats[monthKey]) {
        monthlyStats[monthKey] = {
          month: monthKey,
          totalDays: 0,
          presentDays: 0,
          absentDays: 0
        }
      }

      monthlyStats[monthKey].totalDays++
      if (day.isPresent) {
        monthlyStats[monthKey].presentDays++
      } else {
        monthlyStats[monthKey].absentDays++
      }
    })

    // Convert to array and sort by month
    const monthlyAttendance = Object.values(monthlyStats).sort((a, b) => a.month.localeCompare(b.month))

    console.log('Monthly attendance stats:', monthlyAttendance)

    // Get recent reports (last 10)
    let dailyReports = []
    let hourlyReports = []

    try {
      const [dailyResult] = await pool.execute(`
        SELECT
          dtr.id,
          dtr.report_date,
          dtr.in_time,
          dtr.out_time,
          dtr.project_no,
          dtr.daily_target_achieved,
          dtr.problem_faced,
          dtr.created_at
        FROM daily_target_reports dtr
        WHERE dtr.user_id = ?
        ORDER BY dtr.report_date DESC
        LIMIT 10
      `, [employeeId])
      dailyReports = dailyResult
    } catch (error) {
      console.log('Error fetching recent daily reports:', error.message)
      dailyReports = []
    }

    try {
      const [hourlyResult] = await pool.execute(`
        SELECT
          hr.id,
          hr.report_date,
          hr.project_name,
          hr.hourly_activity,
          hr.problem_faced_by_engineer_hourly,
          hr.created_at
        FROM hourly_reports hr
        WHERE hr.user_id = ?
        ORDER BY hr.created_at DESC
        LIMIT 10
      `, [employeeId])
      hourlyReports = hourlyResult
    } catch (error) {
      console.log('Error fetching recent hourly reports:', error.message)
      hourlyReports = []
    }

    console.log('Attendance data points:', attendanceData.length)
    console.log('Daily reports:', dailyReports.length, 'Hourly reports:', hourlyReports.length)

    const responseData = {
      employee,
      attendanceSheet: attendanceData,
      monthlyAttendance: monthlyAttendance,
      recentDailyReports: dailyReports,
      recentHourlyReports: hourlyReports
    }

    console.log('Response data structure check:')
    console.log('employee exists:', !!employee)
    console.log('attendanceSheet length:', attendanceData.length)
    console.log('recentDailyReports length:', dailyReports.length)
    console.log('recentHourlyReports length:', hourlyReports.length)

    try {
      res.json(responseData)
      console.log('Response sent successfully')
    } catch (jsonError) {
      console.error('Error sending JSON response:', jsonError.message)
      res.status(500).json({ message: 'Error formatting response', error: jsonError.message })
    }
  } catch (error) {
    console.error('Failed to get employee reports:', error)
    console.error('Error stack:', error.stack)
    console.error('Response object status:', res ? 'exists' : 'undefined')

    // Ensure we always return JSON, never HTML
    if (res && !res.headersSent) {
      try {
        res.status(500).json({ message: 'Failed to get employee reports', error: error.message })
      } catch (jsonError) {
        console.error('Error sending JSON response:', jsonError)
      }
    } else {
      console.error('Cannot send response - headers already sent or response object invalid')
    }
  }
})