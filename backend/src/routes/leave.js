import { Router } from 'express'
import jwt from 'jsonwebtoken'
import pool from '../db.js'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET ?? 'vickhardth-site-pulse-secret'

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

// Helper to get or initialize leave balance for a user for the current year
async function getOrCreateLeaveBalance(userId) {
  const currentYear = new Date().getFullYear()
  const [balancesResult] = await pool.execute(
    'SELECT * FROM leave_balances WHERE user_id = ? AND leave_year = ?',
    [userId, currentYear]
  )
  let balances = balancesResult;

  if (balances.length === 0) {
    // Create new leave balance record for the year (24 unpaid leaves: 12 casual, 12 sick)
    await pool.execute(
      'INSERT INTO leave_balances (user_id, leave_year, casual_leaves, sick_leaves) VALUES (?, ?, 12, 12)',
      [userId, currentYear]
    )

    // Fetch the newly created balance
    const [newBalancesResult] = await pool.execute(
      'SELECT * FROM leave_balances WHERE user_id = ? AND leave_year = ?',
      [userId, currentYear]
    )
    balances = newBalancesResult;
  }
  if (!balances || balances.length === 0) {
    throw new Error('Failed to create or retrieve leave balance')
  }
  return balances[0]
}

// Get leave balance for the current user
router.get('/balance', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id
    const currentYear = new Date().getFullYear()

    // Get or create leave balance for current year
    const [balancesResult] = await pool.execute(
      'SELECT * FROM leave_balances WHERE user_id = ? AND leave_year = ?',
      [userId, currentYear]
    )

    let balances = balancesResult

    if (balances.length === 0) {
      // Create new leave balance record for the year
      await pool.execute(
        'INSERT INTO leave_balances (user_id, leave_year, casual_leaves, sick_leaves) VALUES (?, ?, 12, 12)',
        [userId, currentYear]
      )

      // Fetch the newly created balance
      const [newBalancesResult] = await pool.execute(
        'SELECT * FROM leave_balances WHERE user_id = ? AND leave_year = ?',
        [userId, currentYear]
      )
      balances = newBalancesResult
    }

    const balance = balances[0]
    res.json({
      year: balance.leave_year,
      total_casual: balance.casual_leaves,
      total_sick: balance.sick_leaves,
      total_paid: balance.paid_leaves,
      used_casual: balance.used_casual,
      used_sick: balance.used_sick,
      used_paid: balance.used_paid,
      available_casual: balance.casual_leaves - balance.used_casual,
      available_sick: balance.sick_leaves - balance.used_sick,
      available_paid: balance.paid_leaves - balance.used_paid
    })
  } catch (error) {
    console.error('Failed to get leave balance:', error)
    res.status(500).json({ message: 'Failed to get leave balance' })
  }
})

// Apply for leave
router.post('/apply', verifyToken, async (req, res) => {
  try {
    const { leave_type, start_date, end_date, reason } = req.body
    const userId = req.user.id

    console.log('Leave application request:', { leave_type, start_date, end_date, reason, userId })

    if (!leave_type || !start_date || !end_date || !reason) {
      return res.status(400).json({ message: 'Leave type, start date, end date, and reason are required' })
    }

    const startDate = new Date(start_date)
    const endDate = new Date(end_date)

    console.log('Parsed dates:', { startDate, endDate, start_date, end_date })

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ message: 'Invalid date format' })
    }

    if (startDate > endDate) {
      return res.status(400).json({ message: 'Start date cannot be after end date' })
    }

    // Calculate number of days
    const diffTime = Math.abs(endDate - startDate)
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1 // +1 to include end date

    console.log('Calculated days:', diffDays)

    // Get or create leave balance
    const balance = await getOrCreateLeaveBalance(userId)

    console.log('Retrieved balance:', balance)

    if (!balance) {
      return res.status(500).json({ message: 'Failed to retrieve leave balance' })
    }

    let availableLeaves = 0
    let usedLeavesField = ''
    let totalLeavesField = ''

    if (leave_type === 'casual') {
      availableLeaves = (balance.casual_leaves || 0) - (balance.used_casual || 0)
      usedLeavesField = 'used_casual'
      totalLeavesField = 'casual_leaves'
    } else if (leave_type === 'sick') {
      availableLeaves = (balance.sick_leaves || 0) - (balance.used_sick || 0)
      usedLeavesField = 'used_sick'
      totalLeavesField = 'sick_leaves'
    } else if (leave_type === 'paid') {
      availableLeaves = (balance.paid_leaves || 0) - (balance.used_paid || 0)
      usedLeavesField = 'used_paid'
      totalLeavesField = 'paid_leaves'
    } else {
      return res.status(400).json({ message: 'Invalid leave type' })
    }

    console.log('Available leaves calculation:', { leave_type, availableLeaves, usedLeavesField, totalLeavesField })

    if (diffDays > availableLeaves) {
      return res.status(400).json({ message: `Not enough ${leave_type} available. Available: ${availableLeaves}, Requested: ${diffDays}` })
    }

    console.log('Inserting leave application:', [userId, leave_type, start_date, end_date, reason, 'pending'])

    // Insert leave application
    const [result] = await pool.execute(
      'INSERT INTO leave_applications (user_id, leave_type, start_date, end_date, reason, status) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, leave_type, start_date, end_date, reason, 'pending']
    )

    res.status(201).json({ message: 'Leave application submitted successfully', leaveId: result.insertId })
  } catch (error) {
    console.error('Failed to apply for leave:', error)
    res.status(500).json({ message: 'Failed to apply for leave' })
  }
})

// Get leave history for the current user
router.get('/history', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id
    const [applications] = await pool.execute(
      'SELECT * FROM leave_applications WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    )
    res.json(applications)
  } catch (error) {
    console.error('Failed to fetch leave history:', error)
    res.status(500).json({ message: 'Failed to fetch leave history' })
  }
})

// Get leave applications for managers to approve
router.get('/approvals', verifyToken, async (req, res) => {
  try {
    const role = req.user.role || ''
    if (!role.includes('Manager') && !role.includes('Team Leader')) {
      return res.status(403).json({ message: 'Forbidden: Only managers and team leaders can view leave approvals' })
    }

    // For now, managers see all pending leaves. In a real app, this would be filtered by managerId.
    const [applications] = await pool.execute(`
      SELECT la.*, u.username, u.employee_id, u.role AS user_role
      FROM leave_applications la
      JOIN users u ON la.user_id = u.id
      WHERE la.status = 'Pending'
      ORDER BY la.created_at ASC
    `)
    res.json(applications)
  } catch (error) {
    console.error('Failed to fetch leave approvals', error)
    res.status(500).json({ message: 'Unable to fetch leave approvals' })
  }
})

// Approve or reject leave application
// Approve or reject a leave application
router.post('/approve/:id', verifyToken, async (req, res) => {
  console.log('=== LEAVE APPROVAL ROUTE HIT ===')
  console.log('Route params:', req.params)
  console.log('Request body:', req.body)
  console.log('User from token:', req.user)

  try {
    const { id } = req.params
    const { status } = req.body // 'approved' or 'rejected'
    const managerId = req.user.id
    const managerRole = req.user.role || ''

    console.log('Leave approval request:', { id, status, managerId, managerRole })

    if (!managerRole.includes('Manager') && !managerRole.includes('Team Leader')) {
      console.log('Access denied: role check failed')
      return res.status(403).json({ message: 'Forbidden: Only managers and team leaders can approve/reject leaves' })
    }

    console.log('Role check passed, proceeding...')

    // Normalize status to lowercase to match database enum
    const normalizedStatus = status.toLowerCase()

    console.log('Normalized status:', normalizedStatus)

    if (normalizedStatus !== 'approved' && normalizedStatus !== 'rejected') {
      console.log('Invalid status provided')
      return res.status(400).json({ message: 'Invalid status. Must be "approved" or "rejected"' })
    }

    console.log('Status validation passed, querying database...')

    console.log('Querying leave application with id:', id)
    const [applications] = await pool.execute(
      'SELECT * FROM leave_applications WHERE id = ? AND status = "pending"',
      [id]
    )
    console.log('Query result:', applications)

    if (applications.length === 0) {
      return res.status(404).json({ message: 'Leave application not found or already processed' })
    }

    const leaveApplication = applications[0]

    // Update leave application status
    await pool.execute(
      'UPDATE leave_applications SET status = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?',
      [normalizedStatus, managerId, id]
    )

    // If approved, update leave balance
    if (normalizedStatus === 'approved') {
      console.log('Updating leave balance for approved application')
      const startDate = new Date(leaveApplication.start_date)
      const endDate = new Date(leaveApplication.end_date)
      const diffTime = Math.abs(endDate - startDate)
      const leaveDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1

      console.log('Leave calculation:', { startDate, endDate, leaveDays, leaveType: leaveApplication.leave_type })

      const balance = await getOrCreateLeaveBalance(leaveApplication.user_id)
      console.log('Retrieved balance:', balance)
      console.log('Balance object keys:', Object.keys(balance || {}))
      console.log('Balance values:', balance)

      let updateField = ''
      if (leaveApplication.leave_type === 'casual') {
        updateField = 'used_casual'
      } else if (leaveApplication.leave_type === 'sick') {
        updateField = 'used_sick'
      } else if (leaveApplication.leave_type === 'paid') {
        updateField = 'used_paid'
      }

      console.log('Update field:', updateField)

      if (updateField) {
        // Build safe SQL query based on the field
        let updateQuery = ''
        if (updateField === 'used_casual') {
          updateQuery = 'UPDATE leave_balances SET used_casual = used_casual + ? WHERE user_id = ? AND leave_year = ?'
        } else if (updateField === 'used_sick') {
          updateQuery = 'UPDATE leave_balances SET used_sick = used_sick + ? WHERE user_id = ? AND leave_year = ?'
        } else if (updateField === 'used_paid') {
          updateQuery = 'UPDATE leave_balances SET used_paid = used_paid + ? WHERE user_id = ? AND leave_year = ?'
        }

        console.log('Executing update query:', updateQuery, 'with params:', [leaveDays, leaveApplication.user_id, balance.leave_year])

        await pool.execute(updateQuery, [leaveDays, leaveApplication.user_id, balance.leave_year])
        console.log('Balance updated successfully')
      }
    }

    res.json({ message: `Leave application ${normalizedStatus} successfully` })
  } catch (error) {
    console.error('Failed to approve/reject leave', error)
    // Ensure we always return JSON, never HTML
    if (!res.headersSent) {
      res.status(500).json({ message: 'Unable to process leave request', error: error.message })
    }
  }
})

// Test endpoint
router.get('/test', (req, res) => {
  res.json({ message: 'Leave route is working!', timestamp: new Date().toISOString() })
})

// Simple approve endpoint for testing
router.post('/approve/:id', (req, res) => {
  console.log('Approve endpoint hit:', req.params, req.body)
  res.json({ message: 'Test approve endpoint working' })
})

export default router
