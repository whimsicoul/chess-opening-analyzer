import { useContext, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { OnboardingProvider, useOnboarding } from './context/OnboardingContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import GuidanceModal from './components/GuidanceModal';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import WhiteRepertoire from './pages/WhiteRepertoire';
import BlackRepertoire from './pages/BlackRepertoire';
import Games from './pages/Games';
import Stats from './pages/Stats';
import Visualization from './pages/Visualization';
import Settings from './pages/Settings';

function AppInner() {
  const { tourActive, skipTour, startTour } = useOnboarding();

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
      <Navbar onOpenGuidance={startTour} />
      <GuidanceModal open={tourActive} onClose={skipTour} />
      <Routes>
        {/* Public */}
        <Route path="/"             element={<Home />} />
        <Route path="/login"        element={<Login />} />
        <Route path="/register"     element={<Register />} />
        <Route path="/verify-email" element={<VerifyEmail />} />

        {/* Protected */}
        <Route path="/white-repertoire" element={<ProtectedRoute><WhiteRepertoire /></ProtectedRoute>} />
        <Route path="/black-repertoire" element={<ProtectedRoute><BlackRepertoire /></ProtectedRoute>} />
        <Route path="/repertoire"       element={<Navigate to="/white-repertoire" replace />} />
        <Route path="/games"            element={<ProtectedRoute><Games /></ProtectedRoute>} />
        <Route path="/stats"            element={<ProtectedRoute><Stats /></ProtectedRoute>} />
        <Route path="/visualization"    element={<ProtectedRoute><Visualization /></ProtectedRoute>} />
        <Route path="/settings"         element={<ProtectedRoute><Settings /></ProtectedRoute>} />

        {/* Redirects */}
        <Route path="/upload"    element={<Navigate to="/games" replace />} />
        <Route path="/analytics" element={<Navigate to="/stats" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <OnboardingProvider>
        <AppInner />
      </OnboardingProvider>
    </AuthProvider>
  );
}
