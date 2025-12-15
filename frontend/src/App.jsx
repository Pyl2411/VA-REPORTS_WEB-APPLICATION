import { useState } from 'react'
import Sidebar from './components/Sidebar'
import AuthForm from './components/AuthForm'
import HourlyReportForm from './components/HourlyReportForm'
import DailyTargetForm from './components/DailyTargetForm'
import ActivityDisplay from './components/ActivityDisplay'
import CreateMoM from './components/CreateMoM'
import { AuthProvider, useAuth } from './components/AuthContext'
import './App.css'
import './index.css'

function Content() {
  const { user, logout } = useAuth()
  const [currentPage, setCurrentPage] = useState('hourly')

  return (
    <div className="vh-app-shell">
      <Sidebar currentPage={currentPage} onPageChange={setCurrentPage} />
      <main className="vh-content">
        <div className="vh-topbar">
          {user ? (
            <>
              <span>Signed in as {user.username}</span>
              <button type="button" onClick={logout}>
                Logout
              </button>
            </>
          ) : (
            <span>Please login or register to continue</span>
          )}
        </div>
        {user ? (
          currentPage === 'hourly' ? (
            <HourlyReportForm />
          ) : currentPage === 'daily' ? (
            <DailyTargetForm />
          ) : currentPage === 'activity' ? (
            <ActivityDisplay />
          ) : currentPage === 'create-mom' ? (
            <CreateMoM />
          ) : (
            <HourlyReportForm />
          )
        ) : (
          <AuthForm />
        )}
      </main>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <Content />
    </AuthProvider>
  )
}

export default App
