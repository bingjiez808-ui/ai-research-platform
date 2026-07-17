import { createContext, useContext, useState, useEffect } from 'react';

const AppContext = createContext();

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [watchlist, setWatchlist] = useState([]);
  const [portfolio, setPortfolio] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem('ai_research_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setUser(parsed);
      } catch (e) {
        // ignore
      }
    }
  }, []);

  const login = (userData) => {
    setUser(userData);
    localStorage.setItem('ai_research_user', JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    setWatchlist([]);
    setPortfolio(null);
    localStorage.removeItem('ai_research_user');
  };

  return (
    <AppContext.Provider value={{ user, login, logout, watchlist, setWatchlist, portfolio, setPortfolio }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
