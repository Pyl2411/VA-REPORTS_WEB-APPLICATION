import React, { useEffect, useState } from 'react'
import { useAuth } from './AuthContext'

export default function MomForm() {
  const { token } = useAuth()
  const [formData, setFormData] = useState({
    customerName: '',
    customerPerson: '',
    custContact: '',
    momDate: '',
    reportingTime: '',
    momCloseTime: '',
    manHours: '',
    enggName: '',
    siteLocation: '',
    projectName: '',
    observation: '',
    solution: '',
    conclusion: '',
  })

  useEffect(() => {
    // On mount, fetch latest hourly reports and prefill observations/solutions
    prefillHourlyReports()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const prefillHourlyReports = async () => {
    try {
      const tokenVal = localStorage.getItem('token') || token
      if (!tokenVal) return

      // Use employee-activity activities endpoint (will return union of daily/hourly)
      const urlBase = import.meta.env.VITE_API_URL?.replace('/api/activity', '/api/employee-activity') ?? 'http://localhost:5000/api/employee-activity'
      const res = await fetch(`${urlBase}/activities?limit=10`, {
        headers: { Authorization: `Bearer ${tokenVal}` },
      })
      if (!res.ok) return
      const data = await res.json()
      const acts = data.activities || []

      // Filter hourly reports and take top 3
      const hourly = acts.filter((a) => a.reportType === 'hourly')
      const top3 = hourly.slice(0, 3)

      if (top3.length === 0) return

      // Build observation and solution entries per hourly record and set to single fields
      const obsLines = top3.map((r, idx) => {
        const when = r.reportDate ? r.reportDate : r.createdAt
        return `${idx + 1}. [${when}] Project: ${r.projectNo || '-'} — By: ${r.username || '-'} — Activity: ${r.dailyTargetAchieved || '-'}${r.problemFaced ? ' — Problem: ' + r.problemFaced : ''}`
      })

      const solLines = top3.map((r, idx) => {
        const action = r.dailyTargetAchieved ? `Work: ${r.dailyTargetAchieved}` : r.problemFaced ? `Action: ${r.problemFaced}` : 'No details'
        return `${idx + 1}. [${r.reportDate || r.createdAt}] ${action} (${r.projectNo || 'proj'})`
      })

      setFormData((d) => ({
        ...d,
        observation: obsLines.join('\n'),
        solution: solLines.join('\n'),
      }))
    } catch (err) {
      console.error('Failed to prefill hourly reports for MOM:', err)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData({ ...formData, [name]: value })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    // For now just log and alert; you can replace with a save or PDF generation flow
    console.log('MOM submit', formData)
    alert('MOM Submitted')
  }

  return (
    <div className="min-h-screen bg-gray-100 flex justify-center p-4">
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-3xl space-y-4">
        <h1 className="text-2xl font-bold text-center">Vickhardth Automation - MOM Form</h1>

        <div className="grid grid-cols-2 gap-4">
          <input className="input" placeholder="Customer Name" name="customerName" value={formData.customerName} onChange={handleChange} />
          <input className="input" placeholder="Customer Person" name="customerPerson" value={formData.customerPerson} onChange={handleChange} />
          <input className="input" placeholder="Customer Contact No" name="custContact" value={formData.custContact} onChange={handleChange} />
          <input type="date" className="input" name="momDate" value={formData.momDate} onChange={handleChange} />
          <input className="input" placeholder="Reporting Time" name="reportingTime" value={formData.reportingTime} onChange={handleChange} />
          <input className="input" placeholder="Close Time" name="momCloseTime" value={formData.momCloseTime} onChange={handleChange} />
          <input className="input" placeholder="Man Hours" name="manHours" value={formData.manHours} onChange={handleChange} />
          <input className="input" placeholder="Engineer Name" name="enggName" value={formData.enggName} onChange={handleChange} />
          <input className="input" placeholder="Site Location" name="siteLocation" value={formData.siteLocation} onChange={handleChange} />
          <input className="input" placeholder="Project Name" name="projectName" value={formData.projectName} onChange={handleChange} />
        </div>

        <label>
          <div style={{ marginBottom: 6 }}>Observation</div>
          <textarea className="input h-24" placeholder="Observation" name="observation" value={formData.observation} onChange={handleChange} />
        </label>

        <label>
          <div style={{ marginBottom: 6 }}>Solution</div>
          <textarea className="input h-32" placeholder="Solution" name="solution" value={formData.solution} onChange={handleChange} />
        </label>

        <label>
          <div style={{ marginBottom: 6 }}>Conclusion</div>
          <textarea className="input h-16" placeholder="Conclusion" name="conclusion" value={formData.conclusion} onChange={handleChange} />
        </label>

        <button className="w-full bg-blue-600 text-white py-2 rounded-xl text-lg font-semibold" type="submit">
          Submit MOM
        </button>
      </form>

      <style>{`
        .input {
          border: 1px solid #ccc;
          padding: 10px;
          border-radius: 10px;
          width: 100%;
        }
      `}</style>
    </div>
  )
}
