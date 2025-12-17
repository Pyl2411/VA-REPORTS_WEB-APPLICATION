import React, { useEffect, useState } from 'react'
import { useAuth } from './AuthContext'

export default function MomForm() {
  const { token } = useAuth()
  const [formData, setFormData] = useState(() => {
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
      momDate: '',
      reportingTime: '',
      momCloseTime: '',
      manHours: '',
      enggName: '',
      siteLocation: lastSite,
      projectName: '',
      observation: '',
      solution: '',
      conclusion: '',
    }
  })

  const [fetchingLocation, setFetchingLocation] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [locationAccess, setLocationAccess] = useState(false)
  const [locationName, setLocationName] = useState('')

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

  // Reverse geocode coordinates to get readable address
  const reverseGeocode = async (lat, lng) => {
    try {
      setFetchingLocation(true)
      // Try Google first if configured
      const googleApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
      if (googleApiKey) {
        try {
          const res = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${googleApiKey}&language=en&region=in`
          )
          if (res.ok) {
            const data = await res.json()
            if (data && data.status === 'OK' && data.results && data.results.length > 0) {
              const addr = data.results[0].formatted_address
              setLocationName(addr)
              return addr
            }
          }
        } catch (e) {
          console.warn('Google geocode failed', e)
        }
      }

      // Fallback: Nominatim
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=en`
        const resp = await fetch(url, { headers: { 'User-Agent': 'Vickhardth App' } })
        if (resp.ok) {
          const jd = await resp.json()
          if (jd && jd.display_name) {
            setLocationName(jd.display_name)
            return jd.display_name
          }
        }
      } catch (e) {
        console.warn('Nominatim failed', e)
      }

      const coords = `${lat.toFixed(6)}, ${lng.toFixed(6)}`
      setLocationName(coords)
      return coords
    } finally {
      setFetchingLocation(false)
    }
  }

  const getCurrentLocation = async () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser')
      return
    }

    setLocationError('')
    setFetchingLocation(true)

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const lat = position.coords.latitude
          const lng = position.coords.longitude

          setFormData((prev) => ({ ...prev, siteLocation: `${lat.toFixed(6)}, ${lng.toFixed(6)}` }))
          setLocationAccess(true)

          const address = await reverseGeocode(lat, lng)
          if (address) {
            setFormData((prev) => ({ ...prev, siteLocation: address }))
            try { localStorage.setItem('lastSiteLocation', address) } catch (e) {}
          }
        } catch (err) {
          console.error('Error processing location', err)
          setLocationError('Location captured but address lookup failed. Coordinates saved.')
        }
      },
      (error) => {
        setLocationAccess(false)
        setFetchingLocation(false)
        let errorMessage = 'Location access denied or unavailable. Please enable location services.'
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location access denied. Please allow location access in your browser settings.'
            break
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information is unavailable. Please check your device settings.'
            break
          case error.TIMEOUT:
            errorMessage = 'Location request timed out. Please try again.'
            break
        }
        setLocationError(errorMessage)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    let v = value
    if (name === 'custContact') v = value.replace(/\D/g, '')
    setFormData({ ...formData, [name]: v })
    if (name === 'siteLocation') {
      try {
        localStorage.setItem('lastSiteLocation', v)
      } catch (err) {
        // ignore
      }
    }
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
          <input
            className="input"
            placeholder="Customer Contact No"
            name="custContact"
            value={formData.custContact}
            onChange={handleChange}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={15}
          />
          <input type="date" className="input" name="momDate" value={formData.momDate} onChange={handleChange} />
          <input className="input" placeholder="Reporting Time" name="reportingTime" value={formData.reportingTime} onChange={handleChange} />
          <input className="input" placeholder="Close Time" name="momCloseTime" value={formData.momCloseTime} onChange={handleChange} />
          <input className="input" placeholder="Man Hours" name="manHours" value={formData.manHours} onChange={handleChange} />
          <input className="input" placeholder="Engineer Name" name="enggName" value={formData.enggName} onChange={handleChange} />
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" placeholder="Site Location" name="siteLocation" value={formData.siteLocation} onChange={handleChange} style={{ flex: 1 }} />
            <button type="button" onClick={getCurrentLocation} style={{ padding: '0.5rem 0.75rem' }}>
              {fetchingLocation ? 'Detecting...' : 'Detect'}
            </button>
          </div>
          {locationError && <div style={{ color: 'crimson', marginTop: 6 }}>{locationError}</div>}
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
