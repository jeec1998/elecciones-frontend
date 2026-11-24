import React, { useState, useEffect, Suspense } from "react";
import { Login } from "./pages/Login";
import { RegisterVotos } from "./pages/RegisterVotos";

const isDigitadorMode = import.meta.env.VITE_APP_MODE === "digitador";

// Lazy-load modules only in full mode to allow Rollup tree-shaking in digitador mode
const Dashboard = !isDigitadorMode
  ? React.lazy(() => import("./pages/Dashboard").then(m => ({ default: m.Dashboard })))
  : () => null;

const Verificacion = !isDigitadorMode
  ? React.lazy(() => import("./pages/Verificacion").then(m => ({ default: m.Verificacion })))
  : () => null;

const Administracion = !isDigitadorMode
  ? React.lazy(() => import("./pages/Administracion").then(m => ({ default: m.Administracion })))
  : () => null;

const TvDashboard = !isDigitadorMode
  ? React.lazy(() => import("./pages/TvDashboard").then(m => ({ default: m.TvDashboard })))
  : () => null;

interface UserState {
  username: string;
  role: string;
  fullName: string;
  assignedRecintoId?: string;
}

export const App: React.FC = () => {
  const [user, setUser] = useState<UserState | null>(null);
  const [currentView, setCurrentView] = useState<"login" | "dashboard" | "registro-votos" | "verificacion" | "administracion" | "tv-dashboard">("login");
  const [loading, setLoading] = useState(true);

  // Intentar restaurar sesión activa al arrancar
  useEffect(() => {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");
    const username = localStorage.getItem("username");
    const fullName = localStorage.getItem("fullName");
    const assignedRecintoId = localStorage.getItem("assignedRecintoId") || undefined;

    if (token && role && username && fullName) {
      if (isDigitadorMode && role !== "digitador") {
        // En modo digitador exclusivo, borrar sesión si el rol guardado no coincide
        localStorage.clear();
        setUser(null);
        setCurrentView("login");
      } else {
        const restoredUser = { username, role, fullName, assignedRecintoId };
        setUser(restoredUser);
        
        // Decidir vista por defecto según rol
        if (role === "digitador") {
          setCurrentView("registro-votos");
        } else if (role === "viewer") {
          setCurrentView("tv-dashboard");
        } else {
          setCurrentView("dashboard");
        }
      }
    } else {
      setCurrentView("login");
    }
    setLoading(false);
  }, []);

  const handleLoginSuccess = (loggedInUser: UserState) => {
    if (isDigitadorMode && loggedInUser.role !== "digitador") {
      localStorage.clear();
      setUser(null);
      setCurrentView("login");
      return;
    }
    setUser(loggedInUser);
    if (loggedInUser.role === "digitador") {
      setCurrentView("registro-votos");
    } else if (loggedInUser.role === "viewer") {
      setCurrentView("tv-dashboard");
    } else {
      setCurrentView("dashboard");
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    setUser(null);
    setCurrentView("login");
  };

  if (loading) {
    return (
      <div className="dashboard-body flex-center" style={{ minHeight: "100vh" }}>
        <div className="spinner" />
      </div>
    );
  }

  // Renderizar vistas protegidas según estado y rol
  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  // Si estamos en modo digitador exclusivo, forzar renderizado directo
  if (isDigitadorMode) {
    return <RegisterVotos user={user} onLogout={handleLogout} />;
  }

  return (
    <Suspense fallback={
      <div className="dashboard-body flex-center" style={{ minHeight: "100vh" }}>
        <div className="spinner" />
      </div>
    }>
      {(() => {
        switch (currentView) {
          case "registro-votos":
            return <RegisterVotos user={user} onLogout={handleLogout} />;
            
          case "dashboard":
            if (user.role === "digitador") {
              // Un digitador común no debe acceder al dashboard general
              return <RegisterVotos user={user} onLogout={handleLogout} />;
            }
            return (
              <Dashboard 
                user={user} 
                onLogout={handleLogout} 
                onNavigateToVerify={() => setCurrentView("verificacion")} 
                onNavigateToAdmin={() => setCurrentView("administracion")}
                onNavigateToTv={() => setCurrentView("tv-dashboard")}
              />
            );
            
          case "verificacion":
            if (user.role === "digitador") {
              return <RegisterVotos user={user} onLogout={handleLogout} />;
            }
            return (
              <Verificacion 
                user={user} 
                onNavigateToDashboard={() => setCurrentView("dashboard")} 
              />
            );
            
          case "administracion":
            if (user.role !== "admin") {
              return <RegisterVotos user={user} onLogout={handleLogout} />;
            }
            return (
              <Administracion 
                user={user} 
                onNavigateToDashboard={() => setCurrentView("dashboard")} 
              />
            );

          case "tv-dashboard":
            return (
              <TvDashboard 
                onExit={() => {
                  if (user.role === "viewer") {
                    handleLogout();
                  } else {
                    setCurrentView("dashboard");
                  }
                }} 
              />
            );
            
          default:
            return <Login onLoginSuccess={handleLoginSuccess} />;
        }
      })()}
    </Suspense>
  );
};

export default App;

