import React, { useEffect, useMemo, useState } from 'react';
import { api } from './api';

import Auth from './components/Auth';
import Dashboard from './pages/Dashboard';
import Entries from './pages/Entries';
import Accounts from './pages/Accounts';
import Bilancio from './pages/Bilancio';
import AdminUsers from './pages/AdminUsers';
import AdminAudit from './pages/AdminAudit';
import Insegnanti from "./pages/Insegnanti";
import Tesserati from './pages/Tesserati';
import "./styles/layout.css";
import "./styles/table.css";
import "./styles/tesserati.css";
import "./styles/insegnanti.css";
import "./styles/entries.css";
import "./styles/dashboard.css";
import "./styles/cards.css";
import "./styles/auth.css";

export default function App() {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);

  // ✅ NON partire dalla dashboard (cold start Render + query stats = lentezza percepita)
  const [page, setPage] = useState('tesserati');

  const isAdmin = useMemo(() => {
    if (!user) return false;
    if (user.is_admin === true) return true;
    return String(user.role || '').toLowerCase() === 'admin';
  }, [user]);

  const allowedPages = useMemo(() => {
    if (isAdmin) return new Set(['dashboard', 'users', 'audit', 'entries', 'accounts', 'bilancio', 'tesserati', 'insegnanti']);
    return new Set(['dashboard', 'tesserati', 'insegnanti']);
  }, [isAdmin]);

  // ✅ Warmup backend appena apri il sito (vale anche quando sei ancora nella login page)
  useEffect(() => {
    api.health().catch(() => {});
  }, []);

  // load session
  useEffect(() => {
    const saved = localStorage.getItem('gestionale_auth');
    if (saved) {
      try {
        const { token: t, user: u } = JSON.parse(saved);
        setToken(t);
        setUser(u);

        // ✅ se ripristini la sessione, parti comunque su una pagina leggera
        setPage('tesserati');
      } catch {
        // ignore
      }
    }
  }, []);

  // ✅ refresh /me quando ho token (ruolo admin sempre corretto)
  // Non blocca la UI (è async), e con api.js nuovo ha retry anti-coldstart
  useEffect(() => {
    if (!token) return;

    let alive = true;

    (async () => {
      try {
        const me = await api.me(token);

        if (!alive) return;

        const mergedUser = {
          ...(user || {}),
          ...me,
          role: me.role || user?.role || 'user',
          is_admin: !!me.is_admin,
        };

        setUser(mergedUser);

        localStorage.setItem('gestionale_auth', JSON.stringify({
          token,
          user: mergedUser
        }));
      } catch {
        // se fallisce, non bloccare UI
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function handleAuth(newToken, newUser) {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('gestionale_auth', JSON.stringify({ token: newToken, user: newUser }));

    // ✅ pagina leggera dopo login
    setPage('tesserati');

    // ✅ warmup "light" dopo login (NO dashboard qui!)
    api.warmupAfterLogin?.(newToken, newUser);
  }

  function handleLogout() {
    setToken(null);
    setUser(null);
    localStorage.removeItem('gestionale_auth');
    setPage('tesserati');
  }

  useEffect(() => {
    if (!token) return;
    if (!allowedPages.has(page)) setPage('tesserati');
  }, [page, allowedPages, token]);

  if (!token) return <Auth onAuth={handleAuth} />;

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Gestionale ASD</h1>
          <div className="subtitle">{user?.email}</div>
        </div>

        <nav className="nav">
          <button
            className={page === 'tesserati' ? 'nav-btn active' : 'nav-btn'}
            onClick={() => setPage('tesserati')}
          >
            Tesserati
          </button>

          <button
            className={page === 'insegnanti' ? 'nav-btn active' : 'nav-btn'}
            onClick={() => setPage('insegnanti')}
          >
            Insegnanti
          </button>

          <button
            className={page === 'dashboard' ? 'nav-btn active' : 'nav-btn'}
            onClick={() => setPage('dashboard')}
          >
            Dashboard
          </button>

          {isAdmin && (
            <>
              <button
                className={page === 'users' ? 'nav-btn active' : 'nav-btn'}
                onClick={() => setPage('users')}
              >
                Utenti
              </button>

              <button
                className={page === 'audit' ? 'nav-btn active' : 'nav-btn'}
                onClick={() => setPage('audit')}
              >
                Audit
              </button>

              <button
                className={page === 'entries' ? 'nav-btn active' : 'nav-btn'}
                onClick={() => setPage('entries')}
              >
                Prima nota
              </button>

              <button
                className={page === 'accounts' ? 'nav-btn active' : 'nav-btn'}
                onClick={() => setPage('accounts')}
              >
                Conti
              </button>

              <button
                className={page === 'bilancio' ? 'nav-btn active' : 'nav-btn'}
                onClick={() => setPage('bilancio')}
              >
                Bilancio
              </button>
            </>
          )}

          <button className="nav-btn" onClick={handleLogout}>
            Esci
          </button>
        </nav>
      </header>

      <main className="app-main">
        {page === 'tesserati' && <Tesserati token={token} user={user} />}
        {page === 'insegnanti' && <Insegnanti token={token} user={user} />}

        {/* ✅ Dashboard viene caricata SOLO se ci clicchi (quindi niente chiamate pesanti al primo accesso) */}
        {page === 'dashboard' && <Dashboard token={token} isAdmin={isAdmin} />}

        {isAdmin && page === 'entries' && <Entries token={token} user={user} />}
        {isAdmin && page === 'accounts' && <Accounts token={token} user={user} />}
        {isAdmin && page === 'bilancio' && <Bilancio token={token} user={user} />}
        {isAdmin && page === 'users' && <AdminUsers token={token} user={user} />}
        {isAdmin && page === 'audit' && <AdminAudit token={token} user={user} />}
      </main>
    </div>
  );
}
