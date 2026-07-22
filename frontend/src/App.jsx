import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import Repertoire from './pages/Repertoire';
import Games from './pages/Games';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';

function AppInner() {
  useEffect(() => {
    const onMove = (e) => {
      const distX = window.innerWidth - e.clientX;
      const distY = e.clientY;
      const near = distX < 320 && distY < 320;
      document.body.classList.toggle('board-creep', near);
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        {/* Public */}
        <Route path="/"             element={<Home />} />
        <Route path="/login"        element={<Login />} />
        <Route path="/register"     element={<Register />} />
        <Route path="/verify-email" element={<VerifyEmail />} />

        {/* Protected */}
        <Route path="/repertoire"       element={<ProtectedRoute><Repertoire /></ProtectedRoute>} />
        <Route path="/games"            element={<ProtectedRoute><Games /></ProtectedRoute>} />
        <Route path="/analytics"        element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
        <Route path="/settings"         element={<ProtectedRoute><Settings /></ProtectedRoute>} />

        {/* Redirects */}
        <Route path="/upload"             element={<Navigate to="/games" replace />} />
        <Route path="/white-repertoire"   element={<Navigate to="/repertoire" replace />} />
        <Route path="/black-repertoire"   element={<Navigate to="/repertoire" replace />} />
        <Route path="/stats"              element={<Navigate to="/analytics" replace />} />
        <Route path="/visualization"      element={<Navigate to="/analytics" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
