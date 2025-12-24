import { Router } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import pool from '../db.js'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET ?? 'vickhardth-site-pulse-secret'
const TOKEN_TTL_SECONDS = 60 * 60 * 8 // 8 hours

router.post('/register', async (req, res) => {
  try {
    const { username, email, password, mobile, dob, joining_date, role, managerId } = req.body

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' })
    }

    if (!email) {
      return res.status(400).json({ message: 'Email is required' })
    }

    if (!dob) {
      return res.status(400).json({ message: 'Date of birth is required' })
    }

    if (!joining_date) {
      return res.status(400).json({ message: 'Joining date is required' })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' })
    }

    // Validate DOB is a valid date and must be before today (no future DOBs)
    const dobDate = new Date(dob)
    if (Number.isNaN(dobDate.getTime())) {
      return res.status(400).json({ message: 'Invalid date of birth' })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (dobDate >= today) {
      return res
        .status(400)
        .json({ message: 'Date of birth must be before today (no future dates)' })
    }

    // Validate joining_date is a valid date
    const joiningDate = new Date(joining_date)
    if (Number.isNaN(joiningDate.getTime())) {
      return res.status(400).json({ message: 'Invalid joining date' })
    }

    // Joining date can be today or in the past, but not in the future
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999) // End of today
    if (joiningDate > todayEnd) {
      return res.status(400).json({ message: 'Joining date cannot be in the future' })
    }

    if (!role) {
      return res.status(400).json({ message: 'Role is required' })
    }

    // Check if username already exists
    const [existingUsername] = await pool.execute('SELECT id FROM users WHERE username = ?', [
      username,
    ])
    if (existingUsername.length > 0) {
      return res.status(409).json({ message: 'Username already exists' })
    }

    // Check if email already exists
    const [existingEmail] = await pool.execute('SELECT id FROM users WHERE email = ?', [
      email,
    ])
    if (existingEmail.length > 0) {
      return res.status(409).json({ message: 'Email already exists' })
    }

    // Validate manager exists if managerId provided
    if (managerId) {
      const [manager] = await pool.execute('SELECT id FROM users WHERE id = ?', [managerId])
      if (manager.length === 0) {
        return res.status(400).json({ message: 'Manager not found' })
      }
    }

    // Generate employee_id for all users if not provided
    let employeeId = req.body.employeeId;
    if (!employeeId) {
      // Generate employee ID if not provided
      employeeId = `EMP${Date.now().toString().slice(-6)}`;
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const [result] = await pool.execute(
      'INSERT INTO users (username, email, password_hash, dob, mobile, phone_no, joining_date, role, manager_id, employee_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [username, email, passwordHash, dob, mobile || null, mobile || null, joining_date, role, managerId || null, employeeId]
    )

    const userId = result.insertId
    const token = jwt.sign({ id: userId, username, role }, JWT_SECRET, {
      expiresIn: TOKEN_TTL_SECONDS,
    })

    res.status(201).json({ token, username, role, employeeId, id: userId })
      } catch (error) {
        console.error('Failed to register user:', error.message)
        console.error('Error details:', error)
        res.status(500).json({ message: 'Unable to register user', error: error.message })
      }
})

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' })
    }

    const [rows] = await pool.execute('SELECT id, password_hash FROM users WHERE username = ?', [
      username,
    ])

    if (rows.length === 0) {
      return res.status(401).json({ message: 'Invalid username or password' })
    }

    const user = rows[0]
    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) {
      return res.status(401).json({ message: 'Invalid username or password' })
    }

    // Fetch user's role and employee ID
    const [userWithRole] = await pool.execute('SELECT id, username, role, employee_id FROM users WHERE id = ?', [
      user.id,
    ])
    const userRole = userWithRole[0]?.role
    const employeeId = userWithRole[0]?.employee_id

    const token = jwt.sign({ id: user.id, username, role: userRole }, JWT_SECRET, {
      expiresIn: TOKEN_TTL_SECONDS,
    })

    res.json({ token, username, role: userRole, employeeId, id: user.id })
  } catch (error) {
    console.error('Failed to login', error)
    res.status(500).json({ message: 'Unable to login' })
  }
})

export default router


