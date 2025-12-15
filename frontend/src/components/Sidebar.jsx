import './Sidebar.css'
import { useAuth } from './AuthContext'
// sidebar doesn't manage MoM state; CreateMoM is a separate page

const highlights = [
  'Structured onboarding for field engineers',
  'Live issue escalation with online support tracking',
  'Project level accountability for Vickhardth operations',
]

const quickLinks = [
  { label: 'Corporate site', href: 'https://vickhardth.com/' },
  { label: 'Quality policy', href: 'https://vickhardth.com/quality/' },
  { label: 'Contact PMO', href: 'mailto:pmo@vickhardth.com' },
]

function Sidebar({ currentPage, onPageChange }) {
  const { user } = useAuth()
  // CreateMoM is a separate page; Sidebar only navigates to it

  return (
    <aside className="vh-sidebar">
      <div className="vh-brand">
        <span className="vh-pill">VICKHARDTH</span>
        <h1>
          Site <span>Pulse</span>
        </h1>
        <p className="vh-tagline">Daily reporting hub for site engineers.</p>
      </div>

      <nav className="vh-nav">
        <h2>Reports</h2>
        <ul className="vh-nav-links">
          <li>
            <button
              className={currentPage === 'hourly' ? 'active' : ''}
              onClick={() => onPageChange('hourly')}
              type="button"
            >
              Hourly Report
            </button>
          </li>
          <li>
            <button
              className={currentPage === 'daily' ? 'active' : ''}
              onClick={() => onPageChange('daily')}
              type="button"
            >
              Daily Target Report
            </button>
          </li>
        </ul>
      </nav>

      {/* Activity Display for all roles */}
      {user && (
        <>
          <nav className="vh-nav">
            <h2>Monitoring</h2>
            <ul className="vh-nav-links">
              <li>
                <button
                  className={currentPage === 'activity' ? 'active' : ''}
                  onClick={() => onPageChange('activity')}
                  type="button"
                >
                  📊 View Activities
                  {(user.role === 'Manager' || user.role === 'Team Leader') && <span style={{ fontSize: '0.75rem', marginLeft: '0.25rem' }}> (All)</span>}
                  {(user.role === 'Senior Engineer' || user.role === 'Junior Engineer') && <span style={{ fontSize: '0.75rem', marginLeft: '0.25rem' }}> (Mine)</span>}
                </button>
              </li>
            </ul>
          </nav>

          {/* Create MoM panel */}
          <section className="vh-nav" style={{ marginTop: '1rem' }}>
            <h2>Create MoM</h2>
            <ul className="vh-nav-links">
              <li>
                <button className={currentPage === 'create-mom' ? 'active' : ''} onClick={() => onPageChange('create-mom')} type="button">Create MoM (Download)</button>
              </li>
            </ul>
          </section>
        </>
      )}

      <section className="vh-highlight">
        <h2>Why log here?</h2>
        <ul>
          {highlights.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="vh-quick-links">
        <h2>Quick links</h2>
        <ul>
          {quickLinks.map((link) => (
            <li key={link.label}>
              <a href={link.href} target="_blank" rel="noreferrer">
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="vh-meta">
        <p>
          Need help? Ping the PMO on Teams or request live assistance directly
          through the form.
        </p>
        <small>Data syncs to MySQL for audit-ready records.</small>
      </section>
    </aside>
  )
}

export default Sidebar


