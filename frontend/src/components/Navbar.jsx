import { useContext } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import './Navbar.css';

export default function Navbar() {
  const { isAuthenticated, user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <nav className="navbar">
      <NavLink to="/" className="navbar-brand">
        <img src="/small-logo.png" alt="OpeningAnalyzer" className="navbar-logo" />
        <span className="navbar-name">Opening<span>Analyzer</span></span>
      </NavLink>

      <div className="navbar-links">
        <NavLink to="/games">Upload</NavLink>
        <NavLink to="/analytics">Analytics</NavLink>
        <NavLink to="/repertoire">Repertoire</NavLink>
        {isAuthenticated ? (
          <>
            <NavLink to="/settings" title="Account Settings">⚙</NavLink>
            <div className="navbar-user">
              <span className="navbar-username">{user?.username}</span>
              <button className="navbar-logout" onClick={handleLogout}>Log out</button>
            </div>
          </>
        ) : (
          <>
            <NavLink to="/login">Sign In</NavLink>
            <NavLink to="/register" className="navbar-register">Signup</NavLink>
          </>
        )}
      </div>
    </nav>
  );
}
