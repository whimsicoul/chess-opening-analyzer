import { NavLink } from 'react-router-dom';
import './Navbar.css';

export default function Navbar() {
  return (
    <nav className="navbar">
      <span className="navbar-brand">Chess Analyzer</span>
      <div className="navbar-links">
        <NavLink to="/" end>Home</NavLink>
        <NavLink to="/repertoire">Repertoire</NavLink>
        <NavLink to="/upload">Upload</NavLink>
        <NavLink to="/games">Games</NavLink>
      </div>
    </nav>
  );
}
