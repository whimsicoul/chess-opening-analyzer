import { useContext } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { useOnboarding } from '../context/OnboardingContext';
import './Navbar.css';

export default function Navbar({ onOpenGuidance }) {
  const { isAuthenticated, user, logout } = useContext(AuthContext);
  const { tourActive, tourStep } = useOnboarding();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <nav className="navbar">
      <NavLink to="/" className="navbar-brand">
        <div className="navbar-logo">♟</div>
        <span className="navbar-name">Opening<span>Analyzer</span></span>
      </NavLink>

      <div className="navbar-links">
        {isAuthenticated ? (
          <>
            <NavLink to="/white-repertoire">♔ White</NavLink>
            <NavLink to="/black-repertoire">♚ Black</NavLink>
<NavLink to="/games">Games</NavLink>
            <NavLink to="/stats">Analytics</NavLink>
            <NavLink to="/visualization">Visualization</NavLink>
            <button
              className={`navbar-help${tourActive && tourStep === 9 ? ' navbar-help--pulse' : ''}`}
              onClick={onOpenGuidance}
              title="How to use OpeningAnalyzer"
            >?</button>
            <NavLink to="/settings" title="Account Settings">⚙</NavLink>
            <div className="navbar-user">
              <span className="navbar-username">{user?.username}</span>
              <button className="navbar-logout" onClick={handleLogout}>Log out</button>
            </div>
          </>
        ) : (
          <>
            <NavLink to="/login">Sign In</NavLink>
            <NavLink to="/register" className="navbar-register">Get Started</NavLink>
          </>
        )}
      </div>
    </nav>
  );
}
