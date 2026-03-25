import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import WhiteRepertoire from './pages/WhiteRepertoire';
import BlackRepertoire from './pages/BlackRepertoire';
import Games from './pages/Games';
import Stats from './pages/Stats';
import Visualization from './pages/Visualization';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Navbar />
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
          <Route path="/games"         element={<ProtectedRoute><Games /></ProtectedRoute>} />
          <Route path="/stats"         element={<ProtectedRoute><Stats /></ProtectedRoute>} />
          <Route path="/visualization" element={<ProtectedRoute><Visualization /></ProtectedRoute>} />

          {/* Redirects */}
          <Route path="/upload"    element={<Navigate to="/games" replace />} />
          <Route path="/analytics" element={<Navigate to="/stats" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
