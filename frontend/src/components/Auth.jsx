import React, { useMemo, useState } from "react";
import { api } from "../api";
import "../styles/auth.css";


export default function Auth({ onAuth }) {
  const [mode, setMode] = useState("login"); // 'login' | 'register'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isLogin = mode === "login";

  const title = useMemo(() => (isLogin ? "Accedi" : "Crea account"), [isLogin]);
  const subtitle = useMemo(
    () =>
      isLogin
        ? "Entra nel pannello per gestire conti, movimenti e contabilità."
        : "Registrati per creare un account.",
    [isLogin]
  );

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const fn = isLogin ? api.login : api.register;
      const res = await fn(email.trim(), password);
      onAuth(res.token, res.user);
    } catch (err) {
      setError(err?.message || "Errore");
    } finally {
      setLoading(false);
    }
  }

  function toggleMode() {
    setError("");
    setMode((m) => (m === "login" ? "register" : "login"));
  }

  return (
    <div className="auth-page">
      <div className="auth-bg" aria-hidden="true" />

      <div className="auth-card" role="region" aria-label="Login">
        <div className="auth-header">
          <div className="auth-badge">Gestionale ASD</div>
          <h2 className="auth-title">{title}</h2>
          <p className="auth-subtitle">{subtitle}</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span className="auth-label">Email</span>
            <input
              className="auth-input"
              type="email"
              placeholder="nome@azienda.it"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              inputMode="email"
            />
          </label>

          <label className="auth-field">
            <span className="auth-label">Password</span>

            <div className="auth-password">
              <input
                className="auth-input"
                type={showPwd ? "text" : "password"}
                placeholder="Min. 6 caratteri"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={isLogin ? "current-password" : "new-password"}
              />

              <button
                type="button"
                className="auth-eye"
                onClick={() => setShowPwd((v) => !v)}
                aria-label={showPwd ? "Nascondi password" : "Mostra password"}
                title={showPwd ? "Nascondi" : "Mostra"}
              >
                {showPwd ? "🙈" : "👁️"}
              </button>
            </div>
          </label>

          {error ? <div className="auth-error">{error}</div> : null}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? "Attendere…" : isLogin ? "Entra" : "Crea account"}
          </button>


        </form>

        <div className="auth-note">
          <div className="auth-dot" />
          <span>
            Suggerimento: su Render Free il primo accesso può essere lento (cold
            start). Dopo il primo caricamento va molto più veloce.
          </span>
        </div>
      </div>
    </div>
  );
}
