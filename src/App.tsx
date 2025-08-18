import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import MagicLoginPage from './pages/MagicLoginPage'
import PickSheetPage from './pages/PickSheetPage'
import AnonymousPicksPage from './pages/AnonymousPicksPage'
import LeaderboardPage from './pages/LeaderboardPage'
import AdminDashboard from './pages/AdminDashboard'
import ProfilePage from './pages/ProfilePage'

function App() {
  console.log('🚀 [STARTUP] App component rendering')
  
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-stone-50">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/magic-login" element={<MagicLoginPage />} />
            <Route path="/picks" element={<PickSheetPage />} />
            <Route path="/anonymous-picks" element={<AnonymousPicksPage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  )
}

export default App