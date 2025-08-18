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
import BlogPage from './pages/BlogPage'
import BlogPostPage from './pages/BlogPostPage'
import AdminBlogPage from './pages/AdminBlogPage'
import BlogEditorPage from './pages/BlogEditorPage'

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
            <Route path="/blog" element={<BlogPage />} />
            <Route path="/blog/:slug" element={<BlogPostPage />} />
            <Route path="/admin/blog" element={<AdminBlogPage />} />
            <Route path="/admin/blog/new" element={<BlogEditorPage />} />
            <Route path="/admin/blog/edit/:postId" element={<BlogEditorPage />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  )
}

export default App