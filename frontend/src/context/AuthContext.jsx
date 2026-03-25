import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api';

export const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

function decodeToken(token) {
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return decoded;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    localStorage.removeItem('chess_token');
    sessionStorage.removeItem('chess_token');
    setUser(null);
  }, []);

  const login = useCallback((token, username, remember = false) => {
    const storage = remember ? localStorage : sessionStorage;
    storage.setItem('chess_token', token);
    const payload = decodeToken(token);
    setUser({ user_id: payload ? parseInt(payload.sub) : null, username });
  }, []);

  // On mount: validate stored token
  useEffect(() => {
    const token = localStorage.getItem('chess_token') || sessionStorage.getItem('chess_token');
    if (!token) {
      setLoading(false);
      return;
    }

    const payload = decodeToken(token);
    if (!payload || payload.exp * 1000 < Date.now()) {
      logout();
      setLoading(false);
      return;
    }

    // Verify with server
    api.get('/auth/me')
      .then(res => {
        setUser({ user_id: res.data.id, username: res.data.username });
      })
      .catch(() => {
        logout();
      })
      .finally(() => setLoading(false));
  }, [logout]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}
