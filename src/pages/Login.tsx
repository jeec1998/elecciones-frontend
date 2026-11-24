import React, { useState } from "react";
import { api } from "../services/api";

const isDigitadorMode = import.meta.env.VITE_APP_MODE === "digitador";

interface LoginProps {
  onLoginSuccess: (user: {
    username: string;
    role: string;
    fullName: string;
    assignedRecintoId?: string;
  }) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Estados para Acceso Simplificado TV
  const [showTvPin, setShowTvPin] = useState(false);
  const [tvPin, setTvPin] = useState("");
  const [isOfflineMode, setIsOfflineMode] = useState(
    import.meta.env.DEV && localStorage.getItem("offline_mode") === "true"
  );

  const handleOfflineToggle = (checked: boolean) => {
    setIsOfflineMode(checked);
    localStorage.setItem("offline_mode", checked ? "true" : "false");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password.trim()) {
      setError("Por favor complete todos los campos");
      return;
    }

    setLoading(true);
    try {
      const data = await api.login(username, password);

      if (isDigitadorMode && data.role !== "digitador") {
        localStorage.clear();
        setError("Acceso denegado: Esta aplicación está configurada únicamente para digitadores.");
        setLoading(false);
        return;
      }

      localStorage.setItem("token", data.access_token);
      localStorage.setItem("role", data.role);
      localStorage.setItem("username", username);
      localStorage.setItem("fullName", data.full_name);
      if (data.assigned_recinto_id) {
        localStorage.setItem("assignedRecintoId", data.assigned_recinto_id);
      } else {
        localStorage.removeItem("assignedRecintoId");
      }

      onLoginSuccess({
        username,
        role: data.role,
        fullName: data.full_name,
        assignedRecintoId: data.assigned_recinto_id,
      });
    } catch (err: any) {
      setError(err.message || "Error de conexión con el servidor");
    } finally {
      setLoading(false);
    }
  };

  const handleTvPinSubmit = async (pinCode: string) => {
    setError(null);
    if (pinCode.length < 4) {
      setError("El PIN debe tener 4 dígitos");
      return;
    }

    setLoading(true);
    try {
      // Usamos el usuario 'tv' con el pin ingresado
      const data = await api.login("tv", pinCode);
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("role", data.role);
      localStorage.setItem("username", "tv");
      localStorage.setItem("fullName", data.full_name);

      onLoginSuccess({
        username: "tv",
        role: data.role,
        fullName: data.full_name,
      });
    } catch (err: any) {
      setError(err.message || "Código PIN incorrecto o inválido");
      setTvPin(""); // Limpiar pin en caso de error
    } finally {
      setLoading(false);
    }
  };

  const handleKeypadPress = (val: string) => {
    if (loading) return;
    setError(null);

    if (val === "C") {
      setTvPin("");
    } else if (val === "⌫") {
      setTvPin((prev) => prev.slice(0, -1));
    } else {
      if (tvPin.length < 4) {
        const newPin = tvPin + val;
        setTvPin(newPin);
        // Si llega a 4 dígitos, enviar automáticamente
        if (newPin.length === 4) {
          handleTvPinSubmit(newPin);
        }
      }
    }
  };

  return (
    <div
      className="dashboard-body flex-center animate-fade-in"
      style={{
        minHeight: "100vh",
        background: "radial-gradient(circle at 10% 20%, rgb(4, 8, 22) 0%, rgb(13, 22, 47) 90.1%)",
        position: "relative",
        overflow: "hidden"
      }}
    >
      <style>{`
        .keypad-btn {
          background: rgba(30, 41, 59, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: white;
          font-size: 1.5rem;
          font-weight: 700;
          height: 55px;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.15s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .keypad-btn:hover:not(:disabled) {
          background: rgba(59, 130, 246, 0.2);
          border-color: rgba(59, 130, 246, 0.4);
          box-shadow: 0 0 10px rgba(59, 130, 246, 0.2);
          transform: scale(1.05);
        }
        .keypad-btn:active:not(:disabled) {
          transform: scale(0.95);
        }
        .pin-dot {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.3);
          transition: all 0.2s ease;
        }
        .pin-dot.filled {
          background-color: var(--primary);
          border-color: var(--primary);
          box-shadow: 0 0 10px var(--primary-glow);
        }
      `}</style>

      {/* Círculos decorativos de fondo con desenfoque */}
      <div
        style={{
          position: "absolute",
          width: "300px",
          height: "300px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, rgba(0,0,0,0) 70%)",
          top: "10%",
          left: "15%",
          filter: "blur(40px)"
        }}
      />
      <div
        style={{
          position: "absolute",
          width: "250px",
          height: "250px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(16, 185, 129, 0.1) 0%, rgba(0,0,0,0) 70%)",
          bottom: "15%",
          right: "10%",
          filter: "blur(40px)"
        }}
      />

      <div className="glass-card" style={{ width: "100%", maxWidth: "420px", padding: "2.5rem", zIndex: 2 }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          {/* Icono de urna electoral estilizado */}
          <div
            className="flex-center"
            style={{
              width: "60px",
              height: "60px",
              borderRadius: "50%",
              backgroundColor: "rgba(59, 130, 246, 0.1)",
              border: "1px solid rgba(59, 130, 246, 0.3)",
              margin: "0 auto 1rem auto",
              boxShadow: "0 0 15px rgba(59, 130, 246, 0.2)"
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 12V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v7" />
              <rect x="2" y="12" width="20" height="9" rx="2" />
              <path d="M12 16h.01" />
            </svg>
          </div>
          <h2 style={{ fontSize: "1.75rem", fontWeight: "700", marginBottom: "0.25rem", color: "#fff" }}>
            Control Electoral
          </h2>
          <p style={{ color: "var(--neutral-300)", fontSize: "0.875rem" }}>
            {showTvPin ? "Acceso Smart TV (Código PIN)" : isDigitadorMode ? "Módulo Digitador - Control Electoral" : "Elecciones Seccionales Ecuador"}
          </p>
        </div>

        {error && (
          <div
            className="badge badge-danger"
            style={{
              display: "flex",
              padding: "0.75rem 1rem",
              borderRadius: "var(--radius-md)",
              marginBottom: "1.25rem",
              width: "100%",
              textTransform: "none",
              fontWeight: "500",
              fontSize: "0.875rem",
              lineHeight: "1.25"
            }}
          >
            {error}
          </div>
        )}

        {/* MODO VISTA DE PIN PARA TV */}
        {showTvPin ? (
          <div>
            {/* Visualizador de PIN */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "1.25rem",
                marginBottom: "2rem",
                marginTop: "0.5rem"
              }}
            >
              {[0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className={`pin-dot ${tvPin.length > idx ? "filled" : ""}`}
                />
              ))}
            </div>

            {/* Teclado Numérico en Pantalla */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "0.75rem",
                marginBottom: "1.5rem"
              }}
            >
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map((btn) => (
                <button
                  key={btn}
                  type="button"
                  className="keypad-btn"
                  onClick={() => handleKeypadPress(btn)}
                  disabled={loading}
                  style={{
                    color: btn === "C" ? "#f43f5e" : btn === "⌫" ? "#60a5fa" : "white"
                  }}
                >
                  {btn}
                </button>
              ))}
            </div>

            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => {
                setShowTvPin(false);
                setError(null);
                setTvPin("");
              }}
              disabled={loading}
              style={{
                backgroundColor: "rgba(255,255,255,0.05)",
                color: "var(--neutral-300)"
              }}
            >
              Volver a Ingreso Normal
            </button>
          </div>
        ) : (
          /* MODO FORMULARIO ESTÁNDAR */
          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label className="input-label" htmlFor="username" style={{ color: "var(--neutral-300)" }}>
                Usuario
              </label>
              <input
                className="input-field"
                type="text"
                id="username"
                placeholder="Ingrese su usuario"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                style={{
                  backgroundColor: "rgba(15, 23, 42, 0.6)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  color: "#fff"
                }}
              />
            </div>

            <div className="input-group" style={{ marginBottom: "2rem" }}>
              <label className="input-label" htmlFor="password" style={{ color: "var(--neutral-300)" }}>
                Contraseña
              </label>
              <input
                className="input-field"
                type="password"
                id="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                style={{
                  backgroundColor: "rgba(15, 23, 42, 0.6)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  color: "#fff"
                }}
              />
            </div>

            {/* Interruptor de modo demo: solo visible en desarrollo, oculto en producción */}
            {import.meta.env.DEV && (
            <div style={{ display: "flex", alignItems: "center", marginBottom: "1.5rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#94a3b8", fontSize: "0.875rem", cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={isOfflineMode}
                  onChange={(e) => handleOfflineToggle(e.target.checked)}
                  style={{
                    accentColor: "#3b82f6",
                    width: "16px",
                    height: "16px",
                    cursor: "pointer"
                  }}
                />
                Modo Demo Offline (Sin servidor)
              </label>
            </div>
            )}

            <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginBottom: "1rem" }}>
              {loading ? (
                <div className="flex-center" style={{ gap: "0.5rem" }}>
                  <div className="spinner" style={{ width: "20px", height: "20px", borderWidth: "2px" }} />
                  Autenticando...
                </div>
              ) : (
                "Ingresar al Sistema"
              )}
            </button>

            {!isDigitadorMode && (
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  setShowTvPin(true);
                  setError(null);
                }}
                style={{
                  backgroundColor: "rgba(59, 130, 246, 0.1)",
                  color: "#60a5fa",
                  border: "1px solid rgba(59,130,246,0.2)"
                }}
              >
                🖥️ Acceso Smart TV (Código PIN)
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
};