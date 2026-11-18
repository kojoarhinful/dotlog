import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { App } from './App'
import { AuthProvider, useAuth } from './lib/auth'
import { Boot, Login } from './pages/Login'
import { Home } from './pages/Home'
import { NotFound } from './pages/NotFound'
import { Recover } from './pages/Recover'
import { ResetPassword } from './pages/ResetPassword'
import { SetPassword } from './pages/SetPassword'
import { Signup } from './pages/Signup'
import { Terms } from './pages/Terms'
import { Unlock } from './pages/Unlock'
import './styles.css'

function Protected() {
  const { user, loading, unlocked } = useAuth()

  if (loading) return <Boot />
  if (!user) return <Navigate to="/login" replace />
  if (!unlocked) return <Unlock />

  return <App key={user.id} user={user} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/signup/password" element={<SetPassword />} />
          <Route path="/recover" element={<Recover />} />
          <Route path="/recover/reset" element={<ResetPassword />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/log" element={<Protected />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
)
