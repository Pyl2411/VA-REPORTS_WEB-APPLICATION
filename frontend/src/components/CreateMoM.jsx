import { useEffect, useState } from 'react'
import { useAuth } from './AuthContext'
import './OnboardingForm.css'

export default function CreateMoM() {
  const { token, user } = useAuth()
  
  const COMPANY = {
    name: 'VICKHARDTH AUTOMATION',
    subtitle: 'Automation System Integrators • Turnkey Projects • Control Panel Manufacturers',
    contact: 'VATRA | TATRA | SARVATRA (LLL: +9) 9/66 46 / 899',
    email: 'e-mail: sales@vickhardth.com , services@vickhardth.com',
    logo: '/src/assets/logo.jpeg', // Update this path to your actual logo
  }

  // Country codes for dropdown
  const countryCodes = [
    { code: '+91', country: 'India', flag: '🇮🇳' },
    { code: '+1', country: 'USA/Canada', flag: '🇺🇸' },
    { code: '+44', country: 'UK', flag: '🇬🇧' },
    { code: '+61', country: 'Australia', flag: '🇦🇺' },
    { code: '+971', country: 'UAE', flag: '🇦🇪' },
    { code: '+65', country: 'Singapore', flag: '🇸🇬' },
    { code: '+60', country: 'Malaysia', flag: '🇲🇾' },
    { code: '+92', country: 'Pakistan', flag: '🇵🇰' },
    { code: '+880', country: 'Bangladesh', flag: '🇧🇩' },
    { code: '+94', country: 'Sri Lanka', flag: '🇱🇰' },
    { code: '+86', country: 'China', flag: '🇨🇳' },
    { code: '+81', country: 'Japan', flag: '🇯🇵' },
    { code: '+82', country: 'South Korea', flag: '🇰🇷' },
    { code: '+33', country: 'France', flag: '🇫🇷' },
    { code: '+49', country: 'Germany', flag: '🇩🇪' },
    { code: '+7', country: 'Russia', flag: '🇷🇺' },
    { code: '+27', country: 'South Africa', flag: '🇿🇦' },
  ]
  
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [autoFill] = useState(false)
  const [momData, setMomData] = useState(() => {
    let lastSite = ''
    try {
      lastSite = localStorage.getItem('lastSiteLocation') || ''
    } catch (e) {
      lastSite = ''
    }
    return {
      customerName: '',
      customerPerson: '',
      custContact: '',
      custCountryCode: '+91',
      endCustName: '',
      endCustContact: '',
      endCustCountryCode: '+91',
      endCustPerson: '',
      enggName: user?.username || '',
      siteLocation: lastSite,
      momDate: new Date().toISOString().slice(0, 10).split('-').reverse().join('/'),
      reportingTime: '',
      momCloseTime: '',
      manHours: '',
      manHoursMoreThan9: 'No',
      billingDays: 'Day',
      siteStartDate: new Date().toISOString().slice(0, 10).split('-').reverse().join('/'),
      siteEndDate: '',
      projectName: '',
      projectNo: '',
      observationNotes: '',
      solutionNotes: '',
      conclusion: '',
      locationLat: '',
      locationLng: '',
    }
  })

  // Location states - UPDATED
  const [isFetchingLocation, setIsFetchingLocation] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [locationAccess, setLocationAccess] = useState(false)

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

  const formatDateForDisplay = (dateString) => {
    if (!dateString) return ''
    // Handle both yyyy-mm-dd and dd/mm/yyyy formats
    if (dateString.includes('-')) {
      const [year, month, day] = dateString.split('-')
      return `${day}/${month}/${year}`
    }
    return dateString
  }

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

      // Calculate man hours
      let manHours = ''
      if (reportingTime && momCloseTime) {
        const start = new Date(`2000-01-01T${reportingTime}:00`)
        const end = new Date(`2000-01-01T${momCloseTime}:00`)
        const diffMs = end - start
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
        const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
        manHours = `${diffHours.toString().padStart(2, '0')}:${diffMinutes.toString().padStart(2, '0')}`
      }

      // Determine if man hours > 9
      const manHoursMoreThan9 = manHours ? (parseInt(manHours.split(':')[0]) > 9 ? 'Yes' : 'No') : 'No'
      
      // Calculate billing days
      const billingDays = manHoursMoreThan9 === 'Yes' ? '2' : 'Day'

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
        momDate: formatDateForDisplay(date),
        reportingTime: reportingTime,
        momCloseTime: momCloseTime,
        manHours: manHours,
        manHoursMoreThan9: manHoursMoreThan9,
        billingDays: billingDays,
        siteStartDate: formatDateForDisplay(date),
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
    let v = value
    
    // Format date to dd/mm/yyyy when changed
    if (field === 'momDate' || field === 'siteStartDate' || field === 'siteEndDate') {
      if (v.includes('-')) {
        const [year, month, day] = v.split('-')
        v = `${day}/${month}/${year}`
      }
    }
    
    if (field === 'custContact' || field === 'endCustContact') {
      v = String(value || '').replace(/\D/g, '')
    }
    
    setMomData(prev => ({ ...prev, [field]: v }))
    
    if (field === 'siteLocation') {
      try { localStorage.setItem('lastSiteLocation', v) } catch (e) {}
    }
    
    // Auto-calculate man hours and billing days when times change
    if (field === 'reportingTime' || field === 'momCloseTime') {
      const currentReportingTime = field === 'reportingTime' ? value : momData.reportingTime
      const currentMomCloseTime = field === 'momCloseTime' ? value : momData.momCloseTime
      
      if (currentReportingTime && currentMomCloseTime) {
        const start = new Date(`2000-01-01T${currentReportingTime}:00`)
        const end = new Date(`2000-01-01T${currentMomCloseTime}:00`)
        
        if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
          const diffMs = end - start
          const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
          const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
          const manHoursStr = `${diffHours.toString().padStart(2, '0')}:${diffMinutes.toString().padStart(2, '0')}`
          const moreThan9 = diffHours > 9 ? 'Yes' : 'No'
          const billingDays = diffHours > 9 ? '2' : 'Day'
          
          setMomData(prev => ({
            ...prev,
            manHours: manHoursStr,
            manHoursMoreThan9: moreThan9,
            billingDays: billingDays
          }))
        }
      }
    }
  }

  // ===== ENHANCED LOCATION FUNCTION =====
  const fetchCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      return;
    }
    
    setIsFetchingLocation(true);
    setLocationError('');
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          
          // Update location coordinates
          setMomData(prev => ({
            ...prev,
            locationLat: latitude.toString(),
            locationLng: longitude.toString()
          }));
          
          // First try to get location name from reverse geocoding
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`
          );
          
          if (response.ok) {
            const data = await response.json();
            const address = data.address || {};
            
            // Build location string
            const locationParts = [];
            if (address.road) locationParts.push(address.road);
            if (address.suburb) locationParts.push(address.suburb);
            if (address.city || address.town || address.village) 
              locationParts.push(address.city || address.town || address.village);
            if (address.state) locationParts.push(address.state);
            
            let locationName = locationParts.join(', ');
            
            // If no detailed address, use coordinates
            if (!locationName) {
              locationName = `Lat: ${latitude.toFixed(6)}, Long: ${longitude.toFixed(6)}`;
            } else {
              locationName += ` (Lat: ${latitude.toFixed(6)}, Long: ${longitude.toFixed(6)})`;
            }
            
            setMomData(prev => ({ 
              ...prev, 
              siteLocation: locationName 
            }));
            setLocationAccess(true);
            try {
              localStorage.setItem('lastSiteLocation', locationName);
            } catch (e) {}
          } else {
            // Fallback to coordinates if reverse geocoding fails
            const fallbackLocation = `Latitude: ${latitude.toFixed(6)}, Longitude: ${longitude.toFixed(6)}`;
            setMomData(prev => ({
              ...prev,
              siteLocation: fallbackLocation
            }));
            setLocationError('Could not fetch address from coordinates');
            try {
              localStorage.setItem('lastSiteLocation', fallbackLocation);
            } catch (e) {}
          }
        } catch (error) {
          console.error('Reverse geocoding failed:', error);
          // Use coordinates as fallback
          const fallbackLocation = `Latitude: ${position.coords.latitude.toFixed(6)}, Longitude: ${position.coords.longitude.toFixed(6)}`;
          setMomData(prev => ({
            ...prev,
            siteLocation: fallbackLocation
          }));
          setLocationError('Failed to get address from coordinates');
          try {
            localStorage.setItem('lastSiteLocation', fallbackLocation);
          } catch (e) {}
        } finally {
          setIsFetchingLocation(false);
        }
      },
      (error) => {
        setIsFetchingLocation(false);
        switch(error.code) {
          case error.PERMISSION_DENIED:
            setLocationError('Location access was denied. Please enable location services.');
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError('Location information is unavailable.');
            break;
          case error.TIMEOUT:
            setLocationError('Location request timed out.');
            break;
          default:
            setLocationError('An unknown error occurred while fetching location.');
            break;
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  }

  const downloadMoM = (data) => {
    const t = data || momData
    const lines = []
    lines.push('VICKHARDTH AUTOMATION')
    lines.push('Automation System Integrators • Turnkey Projects • Control Panel Manufacturers')
    lines.push(`[ ] VATRA | [ ] TATRA | [ ] SARVATRA(LLL: +9) 9/66 46 / 899, e-mail: sales@vickhardth.com , services@vickhardth.com`)
    lines.push('')
    lines.push('='.repeat(80))
    lines.push('')
    lines.push(`| CUSTOMER NAME           | ${(t.customerName || '').padEnd(30)} | MOM DATE (DD-MM-YY)           | ${(t.momDate || '').padEnd(10)} |`)
    lines.push(`|                         | ${''.padEnd(30)} | *REPORTING TIME (FORMAT: 24 HRS) | ${(t.reportingTime || '').padEnd(10)} |`)
    lines.push(`| *CUSTOMER PERSON        | ${(t.customerPerson || '').padEnd(30)} | *MOM CLOSE TIME (FORMAT: 24 HRS) | ${(t.momCloseTime || '').padEnd(10)} |`)
    lines.push(`| *CUST CONTACT NO.       | ${(t.custCountryCode || '')} ${(t.custContact || '').padEnd(30)} | *MAN HOURS (HH:MM)            | ${(t.manHours || '').padEnd(10)} |`)
    lines.push(`| *END CUST. NAME         | ${(t.endCustName || '').padEnd(30)} | *MAN HOURS>=9 HRS (YES /NO)   | ${(t.manHoursMoreThan9 || '').padEnd(10)} |`)
    lines.push(`| END CUST. CONTACT       | ${(t.endCustCountryCode || '')} ${(t.endCustContact || '').padEnd(30)} | *BILLING DAYS (HRS <=9 HRS =1, HRS >9 HRS =2 | ${(t.billingDays || '').padEnd(10)} |`)
    lines.push(`| END CUST. PERSON        | ${(t.endCustPerson || '').padEnd(30)} | *SITE START DATE (DD-MM-YY)   | ${(t.siteStartDate || '').padEnd(10)} |`)
    lines.push(`| *ENGG NAME              | ${(t.enggName || '').padEnd(30)} | *SITE END DATE (DD-MM-YY)     | ${(t.siteEndDate || '').padEnd(10)} |`)
    lines.push(`| *SITE LOCATION          | ${(t.siteLocation || '').padEnd(30)} | *PROJECT NAME                 | ${(t.projectName || '').padEnd(10)} |`)
    lines.push(`|                         | ${''.padEnd(30)} | *PROJECT NO                   | ${(t.projectNo || '').padEnd(10)} |`)
    lines.push('')
    lines.push('*A) OBSERVATION OR PRE-SITE REPORT BEFORE IMPLEMENTING ANY SOLUTIONS ON REACHING SITE')
    lines.push('[GENERAL/ELECT. / PLC/VFD/AUTOMATION SW./MECH. ETC]')
    lines.push('')
    lines.push('| S. N. | DESCRIPTION OF OBSERVATIONS |')
    lines.push('|-------|-----------------------------|')
    
    const obsLines = (t.observationNotes || '').split('\n').filter(line => line.trim())
    obsLines.forEach((line, index) => {
      const sn = String.fromCharCode(97 + index) + ')'
      lines.push(`| ${sn.padEnd(5)} | ${line.padEnd(27)} |`)
    })
    
    if (obsLines.length === 0) {
      lines.push('|       |                             |')
    }
    
    lines.push('')
    lines.push('*B) SOLUTIONS IMPLEMENTED/SUGGESTIONS, BY VA ENGG. ON SITE [GENERAL/PLC]')
    lines.push('')
    lines.push('| S. N. | DESCRIPTION OF OBSERVATIONS |')
    lines.push('|-------|-----------------------------|')
    
    const solLines = (t.solutionNotes || '').split('\n').filter(line => line.trim())
    solLines.forEach((line, index) => {
      const sn = String.fromCharCode(97 + index) + ')'
      lines.push(`| ${sn.padEnd(5)} | ${line.padEnd(27)} |`)
    })
    
    if (solLines.length === 0) {
      lines.push('|       |                             |')
    }
    
    lines.push('')
    lines.push('*CONCLUSION')
    lines.push('')
    lines.push(t.conclusion || '')
    lines.push('')
    lines.push('AUTHORISED SIGNATORIES')
    lines.push('*FOR M/S VICKHARDTH AUTOMATION')
    lines.push('')
    lines.push('AUTHORISED SIGNATORIES')
    lines.push(`*CUSTOMER NAME FOR ${t.customerName || ''}`)
    lines.push(`END CUST. NAME FOR ${t.endCustName || ''}`)

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const safeDate = (t.momDate || '').replace(/\//g, '-')
    a.download = `MoM-${safeDate || 'unknown-date'}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const downloadPdf = async (data) => {
  const used = data || momData
  try {
    const { jsPDF } = await import('jspdf')
    const autoTableModule = await import('jspdf-autotable')
    const autoTable = autoTableModule && (autoTableModule.default || autoTableModule)

    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    let y = 8

    // ===== Header with Logo and Company Info =====
    // Add logo if available
    try {
      const logoImg = new Image()
      logoImg.src = COMPANY.logo
      await new Promise((resolve, reject) => {
        logoImg.onload = resolve
        logoImg.onerror = reject
      })
      doc.addImage(logoImg, 'PNG', 10, 5, 20, 20)
    } catch (err) {
      console.log('Logo not available, proceeding without it')
    }

    // Company name and details
    doc.setFontSize(13)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(0, 0, 0)
    doc.text(COMPANY.name, pageWidth / 2, 10, { align: 'center' })
    y = 15
    
    doc.setFontSize(8)
    doc.setFont(undefined, 'normal')
    doc.text('Automation System Integrators • Turnkey Projects • Control Panel Manufacturers', pageWidth / 2, y, { align: 'center' })
    y += 4
    
    doc.setFontSize(7)
    doc.text(`[ ] VATRA | [ ] TATRA | [ ] SARVATRA(LLL: +9) 9/66 46 / 899, e-mail: sales@vickhardth.com , services@vickhardth.com`, pageWidth / 2, y, { align: 'center' })
    y += 12

    // ===== Main Details Table =====
    const detailsTable = [
      [
        { content: 'CUSTOMER NAME', styles: { fillColor: [240, 240, 240] } },
        used.customerName || '',
        { content: 'MOM DATE (DD-MM-YY)', styles: { fillColor: [240, 240, 240] } },
        used.momDate || ''
      ],
      [
        { content: '*CUSTOMER PERSON', styles: { fillColor: [240, 240, 240] } },
        used.customerPerson || '',
        { content: '*REPORTING TIME (FORMAT: 24 HRS)', styles: { fillColor: [240, 240, 240] } },
        used.reportingTime || ''
      ],
      // FIXED: Added country code to contact number
      [
        { content: '*CUST CONTACT NO.', styles: { fillColor: [240, 240, 240] } },
        `${used.custCountryCode || '+91'} ${used.custContact || ''}`,
        { content: '*MOM CLOSE TIME (FORMAT: 24 HRS)', styles: { fillColor: [240, 240, 240] } },
        used.momCloseTime || ''
      ],
      [
        { content: '*END CUST. NAME', styles: { fillColor: [240, 240, 240] } },
        used.endCustName || '',
        { content: '*MAN HOURS (HH:MM)', styles: { fillColor: [240, 240, 240] } },
        used.manHours || ''
      ],
      // FIXED: Added country code to end customer contact
      [
        { content: 'END CUST. CONTACT', styles: { fillColor: [240, 240, 240] } },
        `${used.endCustCountryCode || '+91'} ${used.endCustContact || ''}`,
        { content: '*MAN HOURS>=9 HRS (YES /NO)', styles: { fillColor: [240, 240, 240] } },
        used.manHoursMoreThan9 || ''
      ],
      [
        { content: 'END CUST. PERSON', styles: { fillColor: [240, 240, 240] } },
        used.endCustPerson || '',
        { content: '*BILLING DAYS (HRS <=9 HRS =1, HRS >9 HRS =2', styles: { fillColor: [240, 240, 240] } },
        used.billingDays || ''
      ],
      [
        { content: '*ENGG NAME', styles: { fillColor: [240, 240, 240] } },
        used.enggName || '',
        { content: '*SITE START DATE (DD-MM-YY)', styles: { fillColor: [240, 240, 240] } },
        used.siteStartDate || ''
      ],
      [
        { content: '*SITE LOCATION', styles: { fillColor: [240, 240, 240] } },
        used.siteLocation || '',
        { content: '*SITE END DATE (DD-MM-YY)', styles: { fillColor: [240, 240, 240] } },
        used.siteEndDate || ''
      ],
      [
        { content: '*PROJECT NAME', styles: { fillColor: [240, 240, 240] } },
        used.projectName || '',
        { content: '*PROJECT NO', styles: { fillColor: [240, 240, 240] } },
        used.projectNo || ''
      ],
    ]

    autoTable(doc, {
      startY: y,
      head: [],
      body: detailsTable,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
      columnStyles: {
        0: { cellWidth: 45, halign: 'left' },
        1: { cellWidth: 45, halign: 'left' },
        2: { cellWidth: 45, halign: 'left' },
        3: { cellWidth: 45, halign: 'left' },
      },
    })

    y = doc.lastAutoTable.finalY + 6

    // ===== Section A: Observations =====
    doc.setFontSize(9)
    doc.setFont(undefined, 'bold')
    doc.text("*A) OBSERVATION OR PRE-SITE REPORT BEFORE IMPLEMENTING ANY SOLUTIONS ON REACHING SITE", 10, y)
    y += 4
    doc.setFontSize(8)
    doc.setFont(undefined, 'normal')
    doc.text('[GENERAL/ELECT. / PLC/VFD/AUTOMATION SW./MECH. ETC]', 10, y)
    y += 6

    const obsLines = (used.observationNotes || '')
      .split('\n')
      .filter(line => line.trim())
      .map((line, idx) => [
        { content: `${String.fromCharCode(97 + idx)})`, styles: { halign: 'center' } },
        line
      ])

    if (obsLines.length === 0) {
      obsLines.push(['', ''])
    }

    autoTable(doc, {
      startY: y,
      head: [['S. N.', 'DESCRIPTION OF OBSERVATIONS']],
      body: obsLines,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [220, 220, 220], textColor: 0, fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 15, halign: 'center' },
        1: { cellWidth: 175, halign: 'left', overflow: 'linebreak' },
      },
    })

    y = doc.lastAutoTable.finalY + 6

    // ===== Section B: Solutions =====
    doc.setFontSize(9)
    doc.setFont(undefined, 'bold')
    doc.text("*B) SOLUTIONS IMPLEMENTED/SUGGESTIONS, BY VA ENGG. ON SITE [GENERAL/PLC]", 10, y)
    y += 6

    const solLines = (used.solutionNotes || '')
      .split('\n')
      .filter(line => line.trim())
      .map((line, idx) => [
        { content: `${String.fromCharCode(97 + idx)})`, styles: { halign: 'center' } },
        line
      ])

    if (solLines.length === 0) {
      solLines.push(['', ''])
    }

    autoTable(doc, {
      startY: y,
      head: [['S. N.', 'DESCRIPTION OF OBSERVATIONS']],
      body: solLines,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [220, 220, 220], textColor: 0, fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 15, halign: 'center' },
        1: { cellWidth: 175, halign: 'left', overflow: 'linebreak' },
      },
    })

    y = doc.lastAutoTable.finalY + 6

    // ===== Conclusion with Table Format =====
    doc.setFontSize(9)
    doc.setFont(undefined, 'bold')
    doc.text('*CONCLUSION', 10, y)
    y += 6

    // Create a table for conclusion with 2 columns
    const conLines = doc.splitTextToSize(used.conclusion || '', 180)
    
    // Create table rows for conclusion
    const conTableData = conLines.map((line, idx) => [
      { content: idx === 0 ? 'DESCRIPTION' : '', styles: { fillColor: [240, 240, 240] } },
      line
    ])

    if (conTableData.length === 0) {
      conTableData.push(['DESCRIPTION', ''])
    }

    autoTable(doc, {
      startY: y,
      head: [['', '']],
      body: conTableData,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [220, 220, 220], textColor: 0, fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 45, halign: 'left', fillColor: [240, 240, 240] },
        1: { cellWidth: 145, halign: 'left', overflow: 'linebreak' },
      },
    })

    y = doc.lastAutoTable.finalY + 10

    // ===== Signature Section =====
    doc.setFontSize(9)
    doc.setFont(undefined, 'bold')
    doc.text('AUTHORISED SIGNATORIES', 10, y)
    doc.text('AUTHORISED SIGNATORIES', pageWidth / 2, y)
    y += 4

    doc.setFontSize(8)
    doc.setFont(undefined, 'normal')
    doc.text('*FOR M/S VICKHARDTH AUTOMATION', 10, y)
    doc.text(`*CUSTOMER NAME FOR ${used.customerName || ''}`, pageWidth / 2, y)
    y += 4
    doc.text(`END CUST. NAME FOR ${used.endCustName || ''}`, pageWidth / 2, y)

    const safeDate = (used.momDate || '').replace(/\//g, '-') || new Date().toISOString().slice(0, 10).split('-').reverse().join('/')
    const name = `MoM-${safeDate}.pdf`
    
    try {
      let pdfBlob
      try {
        const arrayBuf = doc.output('arraybuffer')
        pdfBlob = new Blob([arrayBuf], { type: 'application/pdf' })
      } catch (oErr) {
        try {
          pdfBlob = doc.output('blob')
        } catch (oErr2) {
          pdfBlob = null
        }
      }

      if (pdfBlob) {
        const url = URL.createObjectURL(pdfBlob)
        const a = document.createElement('a')
        a.href = url
        a.download = name
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      } else {
        try {
          doc.save(name)
        } catch (saveErr) {
          downloadMoM(data)
        }
      }
    } catch (finalErr) {
      console.error('Unexpected error during PDF generation/download', finalErr)
      downloadMoM(data)
    }
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

  const renderPreviewGridRow = (row, idx) => (
    <>
      <div key={`${idx}-0`} style={{ background: '#f0f0f0', padding: '0.5rem', fontWeight: 'bold' }}>{row[0]}</div>
      <div key={`${idx}-1`} style={{ background: '#fff', padding: '0.5rem' }}>{row[1] || ''}</div>
      <div key={`${idx}-2`} style={{ background: '#f0f0f0', padding: '0.5rem', fontWeight: 'bold' }}>{row[2]}</div>
      <div key={`${idx}-3`} style={{ background: '#fff', padding: '0.5rem' }}>{row[3] || ''}</div>
    </>
  )

  // Custom CSS for phone input with country code
  const phoneInputStyles = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginTop: '0.25rem'
  }

  const countryCodeSelectStyles = {
    padding: '0.5rem',
    borderRadius: '4px',
    border: '1px solid #ccc',
    background: 'white',
    minWidth: '90px'
  }

  const phoneInputFieldStyles = {
    flex: 1,
    padding: '0.5rem',
    borderRadius: '4px',
    border: '1px solid #ccc'
  }

  return (
    <section className="vh-form-shell">
      <header className="vh-form-header" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem' }}>
        <div style={{ flexShrink: 0 }}>
          <img 
            src={COMPANY.logo} 
            alt="Vickhardth Automation Logo" 
            style={{ width: '60px', height: '60px', objectFit: 'contain' }}
            onError={(e) => {
              e.target.style.display = 'none'
            }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <p className="vh-form-label">Create MoM</p>
          <h2 style={{ margin: '0.25rem 0' }}>Minutes of Meeting - Vickhardth Automation</h2>
          <p style={{ color: '#666', margin: 0 }}>Auto-populated from daily and hourly reports for the selected date.</p>
        </div>
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
                <input 
                  value={momData.customerName} 
                  onChange={(e) => handleChange('customerName', e.target.value)} 
                  style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }} 
                />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label>Customer Person:</label>
                <input 
                  value={momData.customerPerson} 
                  onChange={(e) => handleChange('customerPerson', e.target.value)} 
                  style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }} 
                />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label>Contact No:</label>
                <div style={phoneInputStyles}>
                  <select
                    value={momData.custCountryCode}
                    onChange={(e) => handleChange('custCountryCode', e.target.value)}
                    style={countryCodeSelectStyles}
                  >
                    {countryCodes.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.flag} {country.code} ({country.country})
                      </option>
                    ))}
                  </select>
                  <input
                    value={momData.custContact}
                    onChange={(e) => handleChange('custContact', e.target.value)}
                    style={phoneInputFieldStyles}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={15}
                    placeholder="Phone number"
                  />
                </div>
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label>End Cust Name:</label>
                <input 
                  value={momData.endCustName} 
                  onChange={(e) => handleChange('endCustName', e.target.value)} 
                  style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }} 
                />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label>End Cust Contact:</label>
                <div style={phoneInputStyles}>
                  <select
                    value={momData.endCustCountryCode}
                    onChange={(e) => handleChange('endCustCountryCode', e.target.value)}
                    style={countryCodeSelectStyles}
                  >
                    {countryCodes.map((country) => (
                      <option key={`end-${country.code}`} value={country.code}>
                        {country.flag} {country.code} ({country.country})
                      </option>
                    ))}
                  </select>
                  <input
                    value={momData.endCustContact}
                    onChange={(e) => handleChange('endCustContact', e.target.value)}
                    style={phoneInputFieldStyles}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={15}
                    placeholder="Phone number"
                  />
                </div>
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label>End Cust Person:</label>
                <input 
                  value={momData.endCustPerson} 
                  onChange={(e) => handleChange('endCustPerson', e.target.value)} 
                  style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }} 
                />
              </div>
            </fieldset>
          </div>

          {/* Right Column */}
          <div>
            <fieldset style={{ border: '1px solid #ddd', padding: '1rem', borderRadius: 4 }}>
              <legend>Visit Details</legend>
              <div style={{ marginBottom: '0.75rem' }}>
                <label>Engg Name:</label>
                <input 
                  value={momData.enggName} 
                  onChange={(e) => handleChange('enggName', e.target.value)} 
                  style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }} 
                />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label>Site Location:</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input 
                    value={momData.siteLocation} 
                    onChange={(e) => handleChange('siteLocation', e.target.value)} 
                    style={{ 
                      flex: 1, 
                      padding: '0.5rem', 
                      marginTop: '0.25rem',
                      border: locationError ? '1px solid #dc3545' : '1px solid #ced4da'
                    }} 
                    placeholder="Click location button or enter manually"
                  />
                  <button
                    type="button"
                    onClick={fetchCurrentLocation}
                    disabled={isFetchingLocation}
                    style={{
                      marginTop: '0.25rem',
                      padding: '0.5rem',
                      background: isFetchingLocation ? '#6c757d' : '#17a2b8',
                      color: 'white',
                      border: 'none',
                      borderRadius: 4,
                      cursor: isFetchingLocation ? 'not-allowed' : 'pointer',
                      minWidth: '40px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title="Get current location"
                  >
                    {isFetchingLocation ? (
                      <span style={{ fontSize: '0.8rem' }}>...</span>
                    ) : (
                      '📍'
                    )}
                  </button>
                </div>
                {locationError && (
                  <div style={{ color: '#dc3545', fontSize: '0.85rem', marginTop: '4px' }}>
                    {locationError}
                  </div>
                )}
                {isFetchingLocation && !locationError && (
                  <div style={{ color: '#17a2b8', fontSize: '0.85rem', marginTop: '4px' }}>
                    Fetching your location...
                  </div>
                )}
              </div>
              
              <div style={{ marginBottom: '0.75rem' }}>
                <label>MOM Date (DD/MM/YYYY):</label>
                <input 
                  type="text" 
                  value={momData.momDate} 
                  onChange={(e) => handleChange('momDate', e.target.value)} 
                  placeholder="DD/MM/YYYY"
                  style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }} 
                />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label>Reporting Time (24 HRS):</label>
                <input 
                  type="time" 
                  value={momData.reportingTime} 
                  onChange={(e) => handleChange('reportingTime', e.target.value)} 
                  style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }} 
                />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label>MOM Close Time (24 HRS):</label>
                <input 
                  type="time" 
                  value={momData.momCloseTime} 
                  onChange={(e) => handleChange('momCloseTime', e.target.value)} 
                  style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }} 
                />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label>Man Hours (HH:MM):</label>
                <input 
                  value={momData.manHours} 
                  onChange={(e) => handleChange('manHours', e.target.value)} 
                  placeholder="HH:MM" 
                  style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }} 
                />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label>Man Hours &gt;=9 HRS (Yes/No):</label>
                <select 
                  value={momData.manHoursMoreThan9} 
                  onChange={(e) => handleChange('manHoursMoreThan9', e.target.value)} 
                  style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
                >
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </select>
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label>Billing Days:</label>
                <input 
                  value={momData.billingDays} 
                  onChange={(e) => handleChange('billingDays', e.target.value)} 
                  placeholder="Day or 2" 
                  style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }} 
                />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label>Site Start Date (DD/MM/YYYY):</label>
                <input 
                  type="text" 
                  value={momData.siteStartDate} 
                  onChange={(e) => handleChange('siteStartDate', e.target.value)} 
                  placeholder="DD/MM/YYYY"
                  style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }} 
                />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label>Site End Date (DD/MM/YYYY):</label>
                <input 
                  type="text" 
                  value={momData.siteEndDate} 
                  onChange={(e) => handleChange('siteEndDate', e.target.value)} 
                  placeholder="DD/MM/YYYY"
                  style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }} 
                />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label>Project Name:</label>
                <input 
                  value={momData.projectName} 
                  onChange={(e) => handleChange('projectName', e.target.value)} 
                  style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }} 
                />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label>Project No:</label>
                <input 
                  value={momData.projectNo} 
                  onChange={(e) => handleChange('projectNo', e.target.value)} 
                  style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }} 
                />
              </div>
            </fieldset>
          </div>
        </div>

        {/* Observations */}
        <fieldset style={{ border: '1px solid #ddd', padding: '1rem', borderRadius: 4, marginBottom: '1.5rem' }}>
          <legend>A) OBSERVATION OR PRE-SITE REPORT BEFORE IMPLEMENTING ANY SOLUTIONS ON REACHING SITE [GENERAL/ELECT. / PLC/VFD/AUTOMATION SW./MECH. ETC]</legend>
          <textarea
            value={momData.observationNotes}
            onChange={(e) => handleChange('observationNotes', e.target.value)}
            rows={5}
            style={{ width: '100%', padding: '0.5rem', fontFamily: 'monospace', marginTop: '0.5rem' }}
            placeholder="Enter observations, each on a new line..."
          />
        </fieldset>

        {/* Solutions */}
        <fieldset style={{ border: '1px solid #ddd', padding: '1rem', borderRadius: 4, marginBottom: '1.5rem' }}>
          <legend>B) SOLUTIONS IMPLEMENTED/SUGGESTIONS, BY VA ENGG. ON SITE [GENERAL/PLC]</legend>
          <textarea
            value={momData.solutionNotes}
            onChange={(e) => handleChange('solutionNotes', e.target.value)}
            rows={6}
            style={{ width: '100%', padding: '0.5rem', fontFamily: 'monospace', marginTop: '0.5rem' }}
            placeholder="Enter solutions, each on a new line..."
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
            placeholder="Enter conclusion..."
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

        {/* Live Preview with Logo */}
        <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: '1rem', background: '#fcfcff', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <img 
              src={COMPANY.logo} 
              alt="Company Logo" 
              style={{ width: '50px', height: '50px', objectFit: 'contain' }}
              onError={(e) => {
                e.target.style.display = 'none'
              }}
            />
            <div>
              <div style={{ fontWeight: 800, color: '#092544', fontSize: '1.2rem' }}>{COMPANY.name}</div>
              <div style={{ color: '#6b6b6b', fontSize: '0.9rem' }}>{COMPANY.subtitle}</div>
              <div style={{ color: '#6b6b6b', fontSize: '0.8rem' }}>{COMPANY.contact}</div>
              <div style={{ color: '#6b6b6b', fontSize: '0.8rem' }}>{COMPANY.email}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', background: '#e0e0e0', marginBottom: '1rem' }}>
            {[
              ['CUSTOMER NAME', momData.customerName, 'MOM DATE (DD-MM-YY)', momData.momDate],
              ['*CUSTOMER PERSON', momData.customerPerson, '*REPORTING TIME (FORMAT: 24 HRS)', momData.reportingTime],
              ['*CUST CONTACT NO.', `${momData.custCountryCode || ''} ${momData.custContact || ''}`, '*MOM CLOSE TIME (FORMAT: 24 HRS)', momData.momCloseTime],
              ['*END CUST. NAME', momData.endCustName, '*MAN HOURS (HH:MM)', momData.manHours],
              ['END CUST. CONTACT', `${momData.endCustCountryCode || ''} ${momData.endCustContact || ''}`, '*MAN HOURS>=9 HRS (YES /NO)', momData.manHoursMoreThan9],
              ['END CUST. PERSON', momData.endCustPerson, '*BILLING DAYS (HRS <=9 HRS =1, HRS >9 HRS =2', momData.billingDays],
              ['*ENGG NAME', momData.enggName, '*SITE START DATE (DD-MM-YY)', momData.siteStartDate],
              ['*SITE LOCATION', momData.siteLocation, '*SITE END DATE (DD-MM-YY)', momData.siteEndDate],
              ['*PROJECT NAME', momData.projectName, '*PROJECT NO', momData.projectNo],
            ].map((row, idx) => renderPreviewGridRow(row, idx))}
          </div>

          <div style={{ background: '#fff9e6', padding: '0.75rem', borderRadius: 6, marginBottom: '1rem' }}>
            <strong>A) OBSERVATION OR PRE-SITE REPORT BEFORE IMPLEMENTING ANY SOLUTIONS ON REACHING SITE</strong>
            <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.5rem' }}>[GENERAL/ELECT. / PLC/VFD/AUTOMATION SW./MECH. ETC]</div>
            <div style={{ background: '#fff', padding: '0.5rem', borderRadius: 4 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#e0e0e0' }}>
                    <th style={{ padding: '0.5rem', border: '1px solid #ccc', width: '50px' }}>S. N.</th>
                    <th style={{ padding: '0.5rem', border: '1px solid #ccc' }}>DESCRIPTION OF OBSERVATIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {momData.observationNotes.split('\n').filter(line => line.trim()).map((line, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '0.5rem', border: '1px solid #ccc', textAlign: 'center' }}>{String.fromCharCode(97 + idx)})</td>
                      <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>{line}</td>
                    </tr>
                  ))}
                  {momData.observationNotes.split('\n').filter(line => line.trim()).length === 0 && (
                    <tr>
                      <td style={{ padding: '0.5rem', border: '1px solid #ccc', textAlign: 'center' }}></td>
                      <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ background: '#e8f8f1', padding: '0.75rem', borderRadius: 6, marginBottom: '1rem' }}>
            <strong>B) SOLUTIONS IMPLEMENTED/SUGGESTIONS, BY VA ENGG. ON SITE [GENERAL/PLC]</strong>
            <div style={{ background: '#fff', padding: '0.5rem', borderRadius: 4, marginTop: '0.5rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#e0e0e0' }}>
                    <th style={{ padding: '0.5rem', border: '1px solid #ccc', width: '50px' }}>S. N.</th>
                    <th style={{ padding: '0.5rem', border: '1px solid #ccc' }}>DESCRIPTION OF OBSERVATIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {momData.solutionNotes.split('\n').filter(line => line.trim()).map((line, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '0.5rem', border: '1px solid #ccc', textAlign: 'center' }}>{String.fromCharCode(97 + idx)})</td>
                      <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>{line}</td>
                    </tr>
                  ))}
                  {momData.solutionNotes.split('\n').filter(line => line.trim()).length === 0 && (
                    <tr>
                      <td style={{ padding: '0.5rem', border: '1px solid #ccc', textAlign: 'center' }}></td>
                      <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ background: '#eef6ff', padding: '0.75rem', borderRadius: 6 }}>
            <strong>CONCLUSION</strong>
            <div style={{ background: '#fff', padding: '0.5rem', borderRadius: 4, marginTop: '0.5rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#e0e0e0' }}>
                    <th style={{ padding: '0.5rem', border: '1px solid #ccc', width: '100px' }}></th>
                    <th style={{ padding: '0.5rem', border: '1px solid #ccc' }}>DESCRIPTION</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '0.5rem', border: '1px solid #ccc', background: '#f0f0f0', fontWeight: 'bold' }}></td>
                    <td style={{ padding: '0.5rem', border: '1px solid #ccc', whiteSpace: 'pre-wrap' }}>{momData.conclusion || '-'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <strong>AUTHORISED SIGNATORIES</strong><br/>
                <span style={{ fontSize: '0.9rem' }}>*FOR M/S VICKHARDTH AUTOMATION</span>
              </div>
              <div>
                <strong>AUTHORISED SIGNATORIES</strong><br/>
                <span style={{ fontSize: '0.9rem' }}>*CUSTOMER NAME FOR {momData.customerName || ''}</span><br/>
                <span style={{ fontSize: '0.9rem' }}>END CUST. NAME FOR {momData.endCustName || ''}</span>
              </div>
            </div>
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