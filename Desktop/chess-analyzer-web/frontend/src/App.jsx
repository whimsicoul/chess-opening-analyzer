import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Repertoire from './pages/Repertoire';
import Upload from './pages/Upload';
import Games from './pages/Games';

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/repertoire" element={<Repertoire />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/games" element={<Games />} />
      </Routes>
    </BrowserRouter>
  );
}
