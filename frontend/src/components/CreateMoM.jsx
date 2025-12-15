import { useEffect, useState } from 'react'
import { useAuth } from './AuthContext'
import './OnboardingForm.css'

export default function CreateMoM() {
  const { token, user } = useAuth()
  // Company info for header/logo
  const COMPANY = {
    name: 'VICKHARDTH AUTOMATION',
    address: '123 Industrial Park, Sector 9, City, State - 123456',
    logo: '/vite.svg', // public asset; change to your company logo path
  }
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [autoFill, setAutoFill] = useState(false)
  const [momData, setMomData] = useState({
    customerName: '',
    customerPerson: '',
    custContact: '',
    endCustName: '',
    endCustContact: '',
    endCustPerson: '',
    enggName: '',
    siteLocation: '',
    momDate: new Date().toISOString().slice(0, 10),
    reportingTime: '',
    momCloseTime: '',
    manHours: '',
    projectName: '',
    projectNo: '',
    observationNotes: '',
    solutionNotes: '',
    conclusion: '',
  })

  // Role enforcement
  const allowedRoles = ['manager', 'team leader', 'senior engineer', 'junior engineer', 'sr engg', 'jr engg']
  const userRole = (user?.role || '').toLowerCase()
  const roleAllowed = allowedRoles.some(role => userRole.includes(role))

  const endpointBase = import.meta.env.VITE_API_URL?.replace('/api/activity', '/api/employee-activity') ?? 'http://localhost:5000/api/employee-activity'

  // Saved MoMs (persist in localStorage)
  const [savedMoms, setSavedMoms] = useState(() => {
    try {
      const raw = localStorage.getItem('savedMoms') || '[]'
      return JSON.parse(raw)
    } catch {
      return []
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('savedMoms', JSON.stringify(savedMoms))
    } catch (e) {
      console.warn('Failed to persist savedMoms', e)
    }
  }, [savedMoms])

  useEffect(() => {
    if (roleAllowed && autoFill) {
      prefillFromReportsForDate(selectedDate)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, roleAllowed, autoFill])

  const prefillFromReportsForDate = async (date) => {
    try {
      const tokenVal = localStorage.getItem('token') || token
      if (!tokenVal || !user) return
      const res = await fetch(`${endpointBase}/activities?limit=50`, { headers: { Authorization: `Bearer ${tokenVal}` } })
      if (!res.ok) return
      const data = await res.json()
      const acts = data.activities || []

      // Filter for activities matching BOTH the selected date AND the currently logged-in user
      const allForDate = acts.filter((a) => {
        const reportDate = a.reportDate ? String(a.reportDate).slice(0, 10) : ''
        const isCurrentUser = a.username && a.username === user.username
        return reportDate === date && isCurrentUser
      })

      const daily = allForDate.filter((a) => a.reportType === 'daily')
      const hourly = allForDate.filter((a) => a.reportType === 'hourly')
      
      // Get the first daily report for this date (main customer info)
      const dailyInfo = daily[0] || {}

      // Extract key values from daily report
      const customerName = dailyInfo.customerName || ''
      const customerPerson = dailyInfo.customerPerson || ''
      const custContact = dailyInfo.custContact || dailyInfo.customerContact || ''
      const endCustName = dailyInfo.endCustName || dailyInfo.endCustomerName || ''
      const endCustPerson = dailyInfo.endCustPerson || dailyInfo.endCustomerPerson || ''
      const endCustContact = dailyInfo.endCustContact || dailyInfo.endCustomerContact || ''
      const siteLocation = dailyInfo.siteLocation || ''
      const projectNo = dailyInfo.projectNo || dailyInfo.projectName || ''

      // Get times from daily report (or hourly if not in daily)
      const reportingTime = dailyInfo.inTime || hourly[0]?.inTime || ''
      const momCloseTime = dailyInfo.outTime || hourly[hourly.length - 1]?.outTime || ''

      // Build observation notes from hourly activities
      const obsLines = hourly.map((r, i) => {
        const activity = r.hourlyActivity || r.dailyTargetAchieved || r.problemFaced || ''
        return activity ? `${i + 1}. ${activity}` : ''
      }).filter(Boolean)

      // Build solution notes from hourly activities and problem resolutions
      const solLines = hourly.map((r, i) => {
        const action = r.hourlyActivity || r.dailyTargetAchieved || ''
        return action ? `${i + 1}. ${action}` : ''
      }).filter(Boolean)

      setMomData((d) => ({
        ...d,
        customerName: customerName,
        customerPerson: customerPerson,
        custContact: custContact,
        endCustName: endCustName,
        endCustPerson: endCustPerson,
        endCustContact: endCustContact,
        enggName: user?.username || dailyInfo.username || '',
        siteLocation: siteLocation,
        momDate: date,
        reportingTime: reportingTime,
        momCloseTime: momCloseTime,
        projectName: projectNo,
        projectNo: projectNo,
        observationNotes: obsLines.join('\n'),
        solutionNotes: solLines.join('\n'),
      }))
    } catch (err) {
      console.error('Prefill failed', err)
    }
  }

  const handleChange = (field, value) => {
    setMomData({ ...momData, [field]: value })
  }

  const downloadMoM = (data) => {
    const t = data || momData
    const lines = []
    lines.push('VICKHARDTH AUTOMATION - MINUTES OF MEETING')
    lines.push('='.repeat(60))
    lines.push('')
    lines.push(`CUSTOMER NAME: ${t.customerName}`)
    lines.push(`CUSTOMER PERSON: ${t.customerPerson}`)
    lines.push(`CUST CONTACT NO: ${t.custContact}`)
    lines.push(`END CUST NAME: ${t.endCustName}`)
    lines.push(`END CUST CONTACT: ${t.endCustContact}`)
    lines.push(`END CUST PERSON: ${t.endCustPerson}`)
    lines.push(`ENGG NAME: ${t.enggName}`)
    lines.push(`SITE LOCATION: ${t.siteLocation}`)
    lines.push(`MOM DATE: ${t.momDate}`)
    lines.push(`REPORTING TIME: ${t.reportingTime}`)
    lines.push(`MOM CLOSE TIME: ${t.momCloseTime}`)
    lines.push(`MAN HOURS: ${t.manHours}`)
    lines.push(`PROJECT NAME: ${t.projectName}`)
    lines.push(`PROJECT NO: ${t.projectNo}`)
    lines.push('')
    lines.push('A) OBSERVATION OR PRE-SITE REPORT BEFORE IMPLEMENTING ANY SOLUTIONS:')
    lines.push(t.observationNotes || '')
    lines.push('')
    lines.push('B) SOLUTIONS IMPLEMENTED / SUGGESTIONS:')
    lines.push(t.solutionNotes || '')
    lines.push('')
    lines.push('CONCLUSION:')
    lines.push(t.conclusion || '')

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `MoM-${t.momDate}.txt`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const downloadPdf = async (data) => {
    const used = data || momData
    try {
      const { jsPDF } = await import('jspdf')
      await import('jspdf-autotable')

      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const pageWidth = doc.internal.pageSize.getWidth()
      let y = 8

      // ===== Header: Company Name & Address =====
      doc.setFontSize(13)
      doc.setFont(undefined, 'bold')
      doc.setTextColor(20, 40, 80)
      doc.text(COMPANY.name, pageWidth / 2, y, { align: 'center' })
      y += 5
      doc.setFontSize(8)
      doc.setFont(undefined, 'normal')
      doc.setTextColor(100, 100, 100)
      doc.text('Automation System Integrators • Turnkey Projects • Control Panel Manufacturers', pageWidth / 2, y, { align: 'center' })
      y += 3
      doc.text(COMPANY.address, pageWidth / 2, y, { align: 'center' })
      y += 5

      // ===== Main Details Table (2 columns) =====
      const detailsTable = [
        ['*CUSTOMER NAME', used.customerName || '', '*MOM DATE (DD-MM-YY)', used.momDate ? used.momDate.replace(/-/g, '/') : ''],
        ['*CUSTOMER PERSON', used.customerPerson || '', '*REPORTING TIME (FORMAT: 24 HRS)', used.reportingTime || ''],
        ['*CUST CONTACT NO.', used.custContact || '', '*MOM CLOSE TIME (FORMAT: 24 HRS)', used.momCloseTime || ''],
        ['*END CUST. NAME', used.endCustName || '', '*MAN HOURS (IF: MM HH:MM) *BILLING DAYS (HRS <=> 9 HRS = 2)', used.manHours || ''],
        ['END CUST. CONTACT', used.endCustContact || '', '*SITE START DATE (DD-MM-YY)', used.momDate || ''],
        ['END CUST. PERSON', used.endCustPerson || '', '*SITE END DATE (DD-MM-YY)', ''],
        ['*ENGG NAME', used.enggName || '', '*PROJECT NAME', used.projectName || ''],
        ['*SITE LOCATION', used.siteLocation || '', '*PROJECT NO', used.projectNo || ''],
      ]

      doc.autoTable({
        startY: y,
        head: [],
        body: detailsTable,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 2, overflow: 'linebreak' },
        columnStyles: {
          0: { cellWidth: 45, halign: 'left', fillColor: [240, 240, 240] },
          1: { cellWidth: 55, halign: 'left' },
          2: { cellWidth: 45, halign: 'left', fillColor: [240, 240, 240] },
          3: { cellWidth: 55, halign: 'left' },
        },
        didDrawPage: () => {},
      })

      y = doc.lastAutoTable.finalY + 4

      // ===== Section A: Observations =====
      const obsObsLines = used.observationNotes
        .split('\n')
        .map((line, idx) => [String(idx + 1), line])

      doc.setFontSize(10)
      doc.setFont(undefined, 'bold')
      doc.text("*A) OBSERVATION OR PRE-SITE REPORT BEFORE IMPLEMENTING ANY SOLUTIONS ON REACHING SITE", 10, y)
      doc.setFontSize(9)
      doc.text('[GENERAL/ELECT. / PLC/VFD/AUTOMATION SW./MECH. ETC]', 10, y + 4)
      y += 8

      doc.autoTable({
        startY: y,
        head: [['S.N.', 'DESCRIPTION OF OBSERVATIONS']],
        body: obsObsLines.slice(0, 5),
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [200, 200, 200], textColor: 0 },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 175, halign: 'left', overflow: 'linebreak' },
        },
      })

      y = doc.lastAutoTable.finalY + 4

      // ===== Section B: Solutions =====
      const solSolLines = used.solutionNotes
        .split('\n')
        .map((line, idx) => [String(idx + 1), line])

      doc.setFontSize(10)
      doc.setFont(undefined, 'bold')
      doc.text("*B) SOLUTIONS IMPLEMENTED/ SUGGESTIONS, BY VA ENG. ON SITE [GENERAL/PLC]", 10, y)
      y += 5

      doc.autoTable({
        startY: y,
        head: [['S.N.', 'DESCRIPTION OF OBSERVATIONS']],
        body: solSolLines.slice(0, 5),
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [200, 200, 200], textColor: 0 },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 175, halign: 'left', overflow: 'linebreak' },
        },
      })

      y = doc.lastAutoTable.finalY + 4

      // ===== Conclusion =====
      doc.setFontSize(10)
      doc.setFont(undefined, 'bold')
      doc.text('*CONCLUSION', 10, y)
      y += 4

      const conLines = doc.splitTextToSize(used.conclusion || '', 180)
      doc.setFont(undefined, 'normal')
      doc.setFontSize(9)
      doc.text(conLines, 10, y)

      y += conLines.length * 3 + 4

      // ===== Signature Section =====
      doc.setFontSize(9)
      doc.setFont(undefined, 'bold')
      doc.text('AUTHORISED SIGNATORIES', 10, y)
      doc.text('AUTHORISED SIGNATORIES', pageWidth / 2, y)
      y += 8

      doc.line(10, y, 40, y)
      doc.line(pageWidth / 2, y, pageWidth - 10, y)
      y += 2
      doc.setFont(undefined, 'normal')
      doc.setFontSize(8)
      doc.text('*FOR VICKHARDTH AUTOMATION', 10, y)
      doc.text('*CUSTOMER NAME', pageWidth / 2, y)

      const name = `MoM-${(used.momDate || new Date().toISOString().slice(0, 10))}.pdf`
      doc.save(name)
    } catch (err) {
      console.warn('PDF generation failed, falling back to .txt', err)
      downloadMoM(data)
    }
  }

  const saveCurrentMom = () => {
    const entry = { id: Date.now(), savedAt: new Date().toISOString(), ...momData }
    setSavedMoms((s) => [entry, ...s])
  }

  const deleteSaved = (id) => {
    setSavedMoms((s) => s.filter((r) => r.id !== id))
  }

  const previewRow = (label, value) => (
    <tr key={label} style={{ background: '#fff' }}>
      <td style={{ padding: '0.5rem 0.75rem', fontWeight: 700, width: 200 }}>{label}</td>
      <td style={{ padding: '0.5rem 0.75rem' }}>{value || '-'}</td>
    </tr>
  )

  return (
    <section className="vh-form-shell">
      <header className="vh-form-header">
        <p className="vh-form-label">Create MoM</p>
        <h2>Minutes of Meeting - Vickhardth Automation</h2>
        <p style={{ color: '#666' }}>Auto-populated from daily and hourly reports for the selected date.</p>
      </header>

      <div style={{ padding: '1.5rem', maxWidth: 1000, margin: '0 auto' }}>
        {/* Date Selector */}
        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f5f5f5', borderRadius: 8 }}>
          <label>
            <strong>Select Date:</strong>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{ marginLeft: '0.5rem', padding: '0.5rem' }}
            />
          </label>
          <button
            type="button"
            onClick={() => prefillFromReportsForDate(selectedDate)}
            style={{ marginLeft: '1rem', padding: '0.5rem 1rem', background: '#007bff', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            Refresh Data
          </button>
        </div>

        {/* Form Grid - 2 Columns */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
          {/* Left Column */}
          <div>
            <fieldset style={{ border: '1px solid #ddd', padding: '1rem', borderRadius: 4 }}>
              <legend>Customer Details</legend>
              <div style={{ marginBottom: '0.75rem' }}>
                <label>Customer Name:</label>
                <input value={momData.customerName} onChange={(e) => handleChange('customerName', e.target.value)} style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }} />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label>Customer Person:</label>
                <input value={momData.customerPerson} onChange={(e) => handleChange('customerPerson', e.target.value)} style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }} />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label>Contact No:</label>
                <input value={momData.custContact} onChange={(e) => handleChange('custContact', e.target.value)} style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }} />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label>End Cust Name:</label>
                <input value={momData.endCustName} onChange={(e) => handleChange('endCustName', e.target.value)} style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }} />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label>End Cust Contact:</label>
                <input value={momData.endCustContact} onChange={(e) => handleChange('endCustContact', e.target.value)} style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }} />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label>End Cust Person:</label>
                <input value={momData.endCustPerson} onChange={(e) => handleChange('endCustPerson', e.target.value)} style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }} />
              </div>
            </fieldset>
          </div>

          {/* Right Column */}
          <div>
            <fieldset style={{ border: '1px solid #ddd', padding: '1rem', borderRadius: 4 }}>
              <legend>Visit Details</legend>
              <div style={{ marginBottom: '0.75rem' }}>
                <label>Engg Name:</label>
                <input value={momData.enggName} onChange={(e) => handleChange('enggName', e.target.value)} style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }} />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label>Site Location:</label>
                <input value={momData.siteLocation} onChange={(e) => handleChange('siteLocation', e.target.value)} style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }} />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label>MOM Date:</label>
                <input type="date" value={momData.momDate} onChange={(e) => handleChange('momDate', e.target.value)} style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }} />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label>Reporting Time:</label>
                <input type="time" value={momData.reportingTime} onChange={(e) => handleChange('reportingTime', e.target.value)} style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }} />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label>MOM Close Time:</label>
                <input type="time" value={momData.momCloseTime} onChange={(e) => handleChange('momCloseTime', e.target.value)} style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }} />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label>Man Hours:</label>
                <input value={momData.manHours} onChange={(e) => handleChange('manHours', e.target.value)} style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }} />
              </div>
            </fieldset>
          </div>
        </div>

        {/* Project Details */}
        <fieldset style={{ border: '1px solid #ddd', padding: '1rem', borderRadius: 4, marginBottom: '1.5rem' }}>
          <legend>Project Details</legend>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label>Project Name:</label>
              <input value={momData.projectName} onChange={(e) => handleChange('projectName', e.target.value)} style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }} />
            </div>
            <div>
              <label>Project No:</label>
              <input value={momData.projectNo} onChange={(e) => handleChange('projectNo', e.target.value)} style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }} />
            </div>
          </div>
        </fieldset>

        {/* Observations */}
        <fieldset style={{ border: '1px solid #ddd', padding: '1rem', borderRadius: 4, marginBottom: '1.5rem' }}>
          <legend>A) OBSERVATION OR PRE-SITE REPORT BEFORE IMPLEMENTING ANY SOLUTIONS</legend>
          <textarea
            value={momData.observationNotes}
            onChange={(e) => handleChange('observationNotes', e.target.value)}
            rows={5}
            style={{ width: '100%', padding: '0.5rem', fontFamily: 'monospace', marginTop: '0.5rem' }}
          />
        </fieldset>

        {/* Solutions */}
        <fieldset style={{ border: '1px solid #ddd', padding: '1rem', borderRadius: 4, marginBottom: '1.5rem' }}>
          <legend>B) SOLUTIONS IMPLEMENTED / SUGGESTIONS, BY VA ENGG. ON SITE</legend>
          <textarea
            value={momData.solutionNotes}
            onChange={(e) => handleChange('solutionNotes', e.target.value)}
            rows={6}
            style={{ width: '100%', padding: '0.5rem', fontFamily: 'monospace', marginTop: '0.5rem' }}
          />
        </fieldset>

        {/* Conclusion */}
        <fieldset style={{ border: '1px solid #ddd', padding: '1rem', borderRadius: 4, marginBottom: '1.5rem' }}>
          <legend>CONCLUSION</legend>
          <textarea
            value={momData.conclusion}
            onChange={(e) => handleChange('conclusion', e.target.value)}
            rows={3}
            style={{ width: '100%', padding: '0.5rem', fontFamily: 'monospace', marginTop: '0.5rem' }}
          />
        </fieldset>

        {/* Actions: Save, Preview, Download */}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginBottom: '1rem' }}>
          <button
            type="button"
            onClick={saveCurrentMom}
            style={{ padding: '0.6rem 1.25rem', background: '#0069d9', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.95rem' }}
          >
            Save MoM (Preview)
          </button>
          <button
            type="button"
            onClick={() => downloadMoM()}
            style={{ padding: '0.75rem 1.5rem', background: '#28a745', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '1rem' }}
          >
            Download TXT
          </button>
          <button
            type="button"
            onClick={() => downloadPdf()}
            style={{ padding: '0.75rem 1.5rem', background: '#dc3545', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '1rem' }}
          >
            Download PDF
          </button>
        </div>

        {/* Live Preview */}
        <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: '1rem', background: '#fcfcff', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
            <img src={COMPANY.logo} alt="logo" style={{ width: 56, height: 56 }} />
            <div>
              <div style={{ fontWeight: 800, color: '#092544', fontSize: '1.05rem' }}>{COMPANY.name}</div>
              <div style={{ color: '#6b6b6b', fontSize: '0.85rem' }}>{COMPANY.address}</div>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0.75rem' }}>
            <tbody>
              {previewRow('Customer Name', momData.customerName)}
              {previewRow('Contact Person', momData.customerPerson)}
              {previewRow('Contact No', momData.custContact)}
              {previewRow('End Customer', momData.endCustName)}
              {previewRow('Engineer', momData.enggName)}
              {previewRow('Site', momData.siteLocation)}
              {previewRow('Project', momData.projectName)}
              {previewRow('MOM Date', momData.momDate)}
              {previewRow('Reporting Time', momData.reportingTime)}
              {previewRow('Close Time', momData.momCloseTime)}
            </tbody>
          </table>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ background: '#fff9e6', padding: '0.75rem', borderRadius: 6 }}>
              <strong>A) OBSERVATIONS</strong>
              <div style={{ whiteSpace: 'pre-wrap', marginTop: '0.5rem', color: '#333', fontFamily: 'monospace' }}>{momData.observationNotes || '-'}</div>
            </div>
            <div style={{ background: '#e8f8f1', padding: '0.75rem', borderRadius: 6 }}>
              <strong>B) SOLUTIONS IMPLEMENTED</strong>
              <div style={{ whiteSpace: 'pre-wrap', marginTop: '0.5rem', color: '#333', fontFamily: 'monospace' }}>{momData.solutionNotes || '-'}</div>
            </div>
          </div>

          <div style={{ background: '#eef6ff', padding: '0.75rem', borderRadius: 6, marginTop: '0.75rem' }}>
            <strong>CONCLUSION</strong>
            <div style={{ whiteSpace: 'pre-wrap', marginTop: '0.5rem', color: '#333', fontFamily: 'monospace' }}>{momData.conclusion || '-'}</div>
          </div>
        </div>

        {/* Saved MoMs table */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ margin: '0 0 0.5rem 0' }}>Saved MoMs</h3>
          {savedMoms.length === 0 ? (
            <div style={{ color: '#777' }}>No saved MoMs yet — click "Save MoM (Preview)" to store a copy.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', border: '1px solid #eee' }}>
              <thead>
                <tr style={{ background: '#f7f9fc' }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Saved At</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Customer</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Project</th>
                  <th style={{ padding: '0.5rem' }}></th>
                </tr>
              </thead>
              <tbody>
                {savedMoms.map((s) => (
                  <tr key={s.id}>
                    <td style={{ padding: '0.5rem' }}>{new Date(s.savedAt).toLocaleString()}</td>
                    <td style={{ padding: '0.5rem' }}>{s.customerName}</td>
                    <td style={{ padding: '0.5rem' }}>{s.projectName}</td>
                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                      <button onClick={() => downloadPdf(s)} style={{ marginRight: 8 }}>PDF</button>
                      <button onClick={() => downloadMoM(s)} style={{ marginRight: 8 }}>TXT</button>
                      <button onClick={() => setMomData(s)} style={{ marginRight: 8 }}>Load</button>
                      <button onClick={() => deleteSaved(s.id)} style={{ color: '#c00' }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  )
}
