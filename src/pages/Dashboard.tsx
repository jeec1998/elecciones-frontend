import React, { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import {
  CIRCUNSCRIPCION_INFO,
  getCandidateCircunscripcion,
  getRecintoCircunscripcion,
  isRiobamba,
  type CircunscripcionNumber,
} from "../utils/circunscripcion";

interface DashboardProps {
  user: {
    username: string;
    fullName: string;
    role: string;
  };
  onLogout: () => void;
  onNavigateToVerify: () => void;
  onNavigateToAdmin: () => void;
  onNavigateToTv: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, onLogout, onNavigateToVerify, onNavigateToAdmin, onNavigateToTv }) => {
  // Filtros
  const [dignity, setDignity] = useState("alcalde");
  const [geography, setGeography] = useState<any[]>([]);
  const [provincias, setProvincias] = useState<string[]>([]);
  const [cantones, setCantones] = useState<string[]>([]);
  const [parroquias, setParroquias] = useState<string[]>([]);

  const [selectedProvincia, setSelectedProvincia] = useState("");
  const [selectedCanton, setSelectedCanton] = useState("");
  const [selectedParroquia, setSelectedParroquia] = useState("");

  // Resultados consolidados
  const [summary, setSummary] = useState<any>({
    total_mesas: 0,
    mesas_escrutadas: 0,
    escrutinio_percentage: 0,
    total_valid_votes: 0,
    total_white_votes: 0,
    total_null_votes: 0,
    total_votes_emitidos: 0,
  });
  const [candidateResults, setCandidateResults] = useState<any[]>([]);
  const [geoBreakdown, setGeoBreakdown] = useState<any[]>([]);

  // Alertas / Actas con novedad
  const [noveltyActasCount, setNoveltyActasCount] = useState(0);

  const [loading, setLoading] = useState(false);

  // Paginación de resultados de candidatos
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  const [pageCirc1, setPageCirc1] = useState(1);
  const [pageCirc2, setPageCirc2] = useState(1);

  // Volver a la página 1 al cambiar de dignidad o de filtros
  useEffect(() => {
    setPage(1);
    setPageCirc1(1);
    setPageCirc2(1);
  }, [dignity, selectedProvincia, selectedCanton, selectedParroquia]);

  const buildPageNumbers = (current: number, total: number): (number | "…")[] => {
    const nums: (number | "…")[] = [];
    for (let p = 1; p <= total; p++) {
      if (p === 1 || p === total || Math.abs(p - current) <= 1) nums.push(p);
      else if (nums[nums.length - 1] !== "…") nums.push("…");
    }
    return nums;
  };

  const pageBtnStyle = (active: boolean, disabled = false): React.CSSProperties => ({
    minWidth: "38px",
    padding: "0.45rem 0.75rem",
    borderRadius: "8px",
    border: active ? "1px solid var(--primary)" : "1px solid rgba(255,255,255,0.1)",
    background: active ? "var(--primary)" : "rgba(255,255,255,0.04)",
    color: disabled ? "rgba(255,255,255,0.25)" : "#fff",
    fontSize: "0.85rem",
    fontWeight: 700,
    cursor: disabled ? "default" : "pointer",
  });

  // Cargar geografía
  useEffect(() => {
    const fetchGeo = async () => {
      try {
        const geo = await api.getGeography();
        setGeography(geo);
        setProvincias(geo.map((g: any) => g.provincia));
        if (geo.length > 0) {
          // Por defecto seleccionar la primera provincia y cantón para mostrar datos rápido
          const firstProv = geo[0];
          setSelectedProvincia(firstProv.provincia);
          setCantones(firstProv.cantones.map((c: any) => c.name));

          if (firstProv.cantones.length > 0) {
            const firstCant = firstProv.cantones[0];
            setSelectedCanton(firstCant.name);
            setParroquias(firstCant.parroquias);
          }
        }
      } catch (err) {
        console.error("Error al cargar geografía:", err);
      }
    };
    fetchGeo();
  }, []);

  // Manejo de cambios en filtros
  const handleProvinciaChange = (prov: string) => {
    setSelectedProvincia(prov);
    setSelectedCanton("");
    setSelectedParroquia("");
    const provData = geography.find(g => g.provincia === prov);
    if (provData) {
      setCantones(provData.cantones.map((c: any) => c.name));
    } else {
      setCantones([]);
    }
  };

  const handleCantonChange = (cant: string) => {
    setSelectedCanton(cant);
    setSelectedParroquia("");
    const provData = geography.find(g => g.provincia === selectedProvincia);
    if (provData) {
      const cantData = provData.cantones.find((c: any) => c.name === cant);
      if (cantData) {
        setParroquias(cantData.parroquias);
      }
    }
  };

  // Cargar datos del dashboard (en paralelo y compatible con backend nuevo o anterior)
  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const [dash, bd] = await Promise.all([
        api.getDashboard(
          dignity,
          selectedProvincia || undefined,
          selectedCanton || undefined,
          selectedParroquia || undefined
        ),
        selectedCanton
          ? api.getGeographicalBreakdown(dignity, selectedCanton)
          : Promise.resolve([]),
      ]);

      let results = dash.candidate_results || [];
      if (
        dignity === "concejal_urbano" &&
        isRiobamba(selectedCanton) &&
        results.some((c: any) => !c.parroquia)
      ) {
        try {
          const catalog = await api.getCandidates("concejal_urbano", selectedCanton);
          const parrById = new Map(catalog.map(c => [c.id, c.parroquia]));
          results = results.map((c: any) => ({
            ...c,
            parroquia: c.parroquia || parrById.get(c.id),
          }));
        } catch {
          // Si falla el catálogo, se mantiene la lista sin enriquecer
        }
      }

      setSummary(dash.summary);
      setCandidateResults(results);
      setGeoBreakdown(bd);

      if (typeof dash.summary?.novelty_actas_count === "number") {
        setNoveltyActasCount(dash.summary.novelty_actas_count);
      } else {
        const noveltyActas = await api.getActas("Con Novedad", undefined, dignity);
        setNoveltyActasCount(Array.isArray(noveltyActas) ? noveltyActas.length : 0);
      }
    } catch (err) {
      console.error("Error cargando consolidados:", err);
    } finally {
      setLoading(false);
    }
  }, [dignity, selectedProvincia, selectedCanton, selectedParroquia]);

  // Escuchar cambios en filtros de consulta y pausar polling cuando la pestaña está en segundo plano
  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(() => {
      if (!document.hidden) {
        fetchDashboardData();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  return (
    <div className="dashboard-body animate-fade-in">
      <div className="dashboard-layout">

        {/* SIDEBAR */}
        <aside className="sidebar">
          <div>
            <div className="flex-center" style={{ gap: "0.75rem", justifyContent: "flex-start", marginBottom: "1rem" }}>
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "rgba(59,130,246,0.15)",
                  border: "1px solid rgba(59,130,246,0.3)"
                }}
                className="flex-center"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5">
                  <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                  <path d="M22 12A10 10 0 0 0 12 2v10z" />
                </svg>
              </div>
              <div>
                <h2 style={{ fontSize: "1.1rem", fontWeight: "700" }}>Escrutinio Real</h2>
                <span style={{ fontSize: "0.7rem", opacity: 0.6 }}>War Room Electoral</span>
              </div>
            </div>
            <div style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", margin: "1rem 0" }} />

            <nav style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--neutral-300)", fontWeight: "600", padding: "0.5rem" }}>
                Dignidades
              </div>
              <button
                onClick={() => setDignity("prefecto")}
                className="btn"
                style={{
                  justifyContent: "flex-start",
                  backgroundColor: dignity === "prefecto" ? "rgba(59, 130, 246, 0.15)" : "transparent",
                  color: dignity === "prefecto" ? "var(--primary)" : "var(--neutral-100)",
                  border: dignity === "prefecto" ? "1px solid rgba(59,130,246,0.3)" : "1px solid transparent",
                  fontSize: "0.9rem"
                }}
              >
                Prefecto Provincial
              </button>
              <button
                onClick={() => setDignity("alcalde")}
                className="btn"
                style={{
                  justifyContent: "flex-start",
                  backgroundColor: dignity === "alcalde" ? "rgba(59, 130, 246, 0.15)" : "transparent",
                  color: dignity === "alcalde" ? "var(--primary)" : "var(--neutral-100)",
                  border: dignity === "alcalde" ? "1px solid rgba(59,130,246,0.3)" : "1px solid transparent",
                  fontSize: "0.9rem"
                }}
              >
                Alcalde Cantonal
              </button>
              <button
                onClick={() => setDignity("concejal_urbano")}
                className="btn"
                style={{
                  justifyContent: "flex-start",
                  backgroundColor: dignity === "concejal_urbano" ? "rgba(59, 130, 246, 0.15)" : "transparent",
                  color: dignity === "concejal_urbano" ? "var(--primary)" : "var(--neutral-100)",
                  border: dignity === "concejal_urbano" ? "1px solid rgba(59,130,246,0.3)" : "1px solid transparent",
                  fontSize: "0.9rem"
                }}
              >
                Concejales Urbanos
              </button>
              <button
                onClick={() => setDignity("concejal_rural")}
                className="btn"
                style={{
                  justifyContent: "flex-start",
                  backgroundColor: dignity === "concejal_rural" ? "rgba(59, 130, 246, 0.15)" : "transparent",
                  color: dignity === "concejal_rural" ? "var(--primary)" : "var(--neutral-100)",
                  border: dignity === "concejal_rural" ? "1px solid rgba(59,130,246,0.3)" : "1px solid transparent",
                  fontSize: "0.9rem"
                }}
              >
                Concejales Rurales
              </button>
              <button
                onClick={() => setDignity("junta_parroquial")}
                className="btn"
                style={{
                  justifyContent: "flex-start",
                  backgroundColor: dignity === "junta_parroquial" ? "rgba(59, 130, 246, 0.15)" : "transparent",
                  color: dignity === "junta_parroquial" ? "var(--primary)" : "var(--neutral-100)",
                  border: dignity === "junta_parroquial" ? "1px solid rgba(59,130,246,0.3)" : "1px solid transparent",
                  fontSize: "0.9rem"
                }}
              >
                Junta Parroquial
              </button>

              <div style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", margin: "1rem 0" }} />

              <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--neutral-300)", fontWeight: "600", padding: "0.5rem" }}>
                Procesos
              </div>
              <button
                onClick={onNavigateToVerify}
                className="btn"
                style={{
                  justifyContent: "flex-start",
                  backgroundColor: "transparent",
                  color: "var(--neutral-100)",
                  fontSize: "0.9rem"
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                Auditar Actas
              </button>

              <button
                onClick={onNavigateToTv}
                className="btn"
                style={{
                  justifyContent: "flex-start",
                  backgroundColor: "transparent",
                  color: "var(--neutral-100)",
                  fontSize: "0.9rem"
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                Modo TV Slideshow
              </button>

              {user.role === "admin" && (
                <button
                  onClick={onNavigateToAdmin}
                  className="btn"
                  style={{
                    justifyContent: "flex-start",
                    backgroundColor: "transparent",
                    color: "var(--neutral-100)",
                    fontSize: "0.9rem"
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  Administración
                </button>
              )}
            </nav>
          </div>

          <div style={{ marginTop: "auto" }}>
            <div style={{ fontSize: "0.8rem", color: "var(--neutral-300)", marginBottom: "0.5rem" }}>
              Conectado: <strong>{user.fullName}</strong>
            </div>
            <button className="btn btn-secondary" onClick={onLogout} style={{ fontSize: "0.8rem", padding: "0.5rem" }}>
              Cerrar Sesión
            </button>
          </div>
        </aside>

        {/* CONTENIDO PRINCIPAL */}
        <main className="main-content">

          {/* TOP NAV / FILTROS */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "2rem",
              flexWrap: "wrap",
              gap: "1rem"
            }}
          >
            <div>
              <h1 className="glow-text" style={{ fontSize: "2rem", fontWeight: "800", textTransform: "capitalize" }}>
                Elecciones: {dignity.replace("_", " ")}
              </h1>
              <p style={{ color: "var(--neutral-300)", fontSize: "0.9rem" }}>
                Estadísticas de conteo de votos oficiales en tiempo real.
              </p>
            </div>

            {/* FILTROS GEOGRÁFICOS */}
            <div className="flex-center" style={{ gap: "0.75rem", flexWrap: "wrap" }}>
              <div className="flex-center" style={{ gap: "0.5rem" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--neutral-300)" }}>Provincia:</span>
                <select
                  className="input-field"
                  value={selectedProvincia}
                  onChange={(e) => handleProvinciaChange(e.target.value)}
                  style={{ backgroundColor: "#1e293b", color: "#fff", borderColor: "rgba(255,255,255,0.1)", padding: "0.4rem 0.8rem" }}
                >
                  <option value="">Todas</option>
                  {provincias.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div className="flex-center" style={{ gap: "0.5rem" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--neutral-300)" }}>Cantón:</span>
                <select
                  className="input-field"
                  value={selectedCanton}
                  onChange={(e) => handleCantonChange(e.target.value)}
                  disabled={!selectedProvincia}
                  style={{ backgroundColor: "#1e293b", color: "#fff", borderColor: "rgba(255,255,255,0.1)", padding: "0.4rem 0.8rem" }}
                >
                  <option value="">Todos</option>
                  {cantones.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="flex-center" style={{ gap: "0.5rem" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--neutral-300)" }}>Parroquia:</span>
                <select
                  className="input-field"
                  value={selectedParroquia}
                  onChange={(e) => setSelectedParroquia(e.target.value)}
                  disabled={!selectedCanton}
                  style={{ backgroundColor: "#1e293b", color: "#fff", borderColor: "rgba(255,255,255,0.1)", padding: "0.4rem 0.8rem" }}
                >
                  <option value="">Todas</option>
                  {parroquias.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <button
                onClick={fetchDashboardData}
                className="btn btn-primary"
                style={{ width: "auto", padding: "0.5rem 1rem" }}
              >
                {loading ? "..." : "Actualizar"}
              </button>
            </div>
          </div>

          {/* SUMMARY CARDS */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1.5rem", marginBottom: "2rem" }}>

            {/* PROGRESO ESCRUTINIO */}
            <div className="glass-card flex-center" style={{ justifyContent: "space-between" }}>
              <div>
                <span style={{ fontSize: "0.8rem", color: "var(--neutral-300)", fontWeight: "500" }}>Escrutado</span>
                <h2 style={{ fontSize: "1.85rem", fontWeight: "800", color: "var(--primary)" }}>
                  {summary.escrutinio_percentage}%
                </h2>
                <p style={{ fontSize: "0.75rem", opacity: 0.7 }}>
                  {summary.mesas_escrutadas} de {summary.total_mesas} mesas
                </p>
              </div>
              {/* SVG circular progress */}
              <svg width="60" height="60" viewBox="0 0 36 36">
                <path
                  className="circle-bg"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth="3.5"
                />
                <path
                  className="circle"
                  strokeDasharray={`${summary.escrutinio_percentage}, 100`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>

            {/* VOTOS VÁLIDOS */}
            <div className="glass-card">
              <span style={{ fontSize: "0.8rem", color: "var(--neutral-300)", fontWeight: "500" }}>Votos Válidos (Candidatos)</span>
              <h2 style={{ fontSize: "1.85rem", fontWeight: "800", color: "var(--success)" }}>
                {summary.total_valid_votes.toLocaleString()}
              </h2>
              <p style={{ fontSize: "0.75rem", opacity: 0.7 }}>
                {summary.total_valid_votes > 0 ? ((summary.total_valid_votes / summary.total_votes_emitidos) * 100).toFixed(1) : 0}% del total emitido
              </p>
            </div>

            {/* VOTOS BLANCOS / NULOS */}
            <div className="glass-card">
              <span style={{ fontSize: "0.8rem", color: "var(--neutral-300)", fontWeight: "500" }}>Blancos / Nulos</span>
              <div style={{ display: "flex", gap: "1rem", alignItems: "baseline" }}>
                <h2 style={{ fontSize: "1.5rem", fontWeight: "800", color: "var(--warning)" }}>
                  {summary.total_white_votes.toLocaleString()} <span style={{ fontSize: "0.8rem", fontWeight: "400", color: "var(--neutral-300)" }}>blancos</span>
                </h2>
                <h2 style={{ fontSize: "1.5rem", fontWeight: "800", color: "var(--danger)" }}>
                  {summary.total_null_votes.toLocaleString()} <span style={{ fontSize: "0.8rem", fontWeight: "400", color: "var(--neutral-300)" }}>nulos</span>
                </h2>
              </div>
              <p style={{ fontSize: "0.75rem", opacity: 0.7 }}>
                Emitidos: {summary.total_votes_emitidos.toLocaleString()}
              </p>
            </div>

            {/* NOVEDADES / ALERTAS */}
            <div className="glass-card flex-center" style={{ justifyContent: "space-between" }}>
              <div>
                <span style={{ fontSize: "0.8rem", color: "var(--neutral-300)", fontWeight: "500" }}>Actas con Novedad</span>
                <h2 style={{ fontSize: "1.85rem", fontWeight: "800", color: noveltyActasCount > 0 ? "var(--danger)" : "var(--success)" }}>
                  {noveltyActasCount}
                </h2>
                <p style={{ fontSize: "0.75rem", opacity: 0.7 }}>
                  Requieren auditoría visual
                </p>
              </div>
              {noveltyActasCount > 0 && (
                <div
                  className="flex-center"
                  style={{ width: "40px", height: "40px", borderRadius: "50%", backgroundColor: "rgba(244,63,94,0.15)", border: "1px solid rgba(244,63,94,0.3)" }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2.5">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>
              )}
            </div>

          </div>

          {/* MAIN RESULTS GRID */}
          {(() => {
            const isRiobambaUrban = dignity === "concejal_urbano" && isRiobamba(selectedCanton);
            const selectedCirc = isRiobambaUrban
              ? getRecintoCircunscripcion(selectedCanton, selectedParroquia)
              : null;

            const buildCircList = (circ: CircunscripcionNumber) => {
              const list = candidateResults.filter(
                (c: any) => getCandidateCircunscripcion(c.parroquia) === circ
              );
              const totalVotes = list.reduce((sum: number, c: any) => sum + (c.votes || 0), 0);
              return list.map((c: any) => ({
                ...c,
                percentage_valid:
                  totalVotes > 0 ? Number((((c.votes || 0) / totalVotes) * 100).toFixed(2)) : 0,
              }));
            };

            const renderCandidateCard = (
              sectionKey: string,
              title: string,
              subtitle: string | null,
              items: any[],
              activePage: number,
              onPageChange: (next: number) => void
            ) => {
              const sectionTotalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
              const sectionCurrentPage = Math.min(activePage, sectionTotalPages);
              const sectionPageStart = (sectionCurrentPage - 1) * PAGE_SIZE;
              const sectionPaged = items.slice(sectionPageStart, sectionPageStart + PAGE_SIZE);
              const sectionMaxVotes = Math.max(0, ...items.map((c: any) => c.votes || 0)) || 1;
              const sectionPageNumbers = buildPageNumbers(sectionCurrentPage, sectionTotalPages);
              const winnerGradId = `winnerGradient-${sectionKey}`;
              const standardGradId = `standardGradient-${sectionKey}`;

              return (
                <div key={sectionKey} className="glass-card">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      flexWrap: "wrap",
                      gap: "0.5rem",
                      marginBottom: "1.5rem",
                      borderBottom: "1px solid rgba(255,255,255,0.08)",
                      paddingBottom: "0.75rem",
                    }}
                  >
                    <h3 style={{ fontSize: "1.25rem", fontWeight: "700", margin: 0 }}>{title}</h3>
                    {subtitle && (
                      <span style={{ fontSize: "0.8rem", color: "var(--neutral-300)" }}>
                        {subtitle}
                      </span>
                    )}
                  </div>

                  {items.length === 0 ? (
                    <p style={{ color: "var(--neutral-300)", textAlign: "center", padding: "2rem" }}>
                      Aún no hay actas validadas registradas para esta consulta.
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

                      {/* CHART SVG DINÁMICO */}
                      <div style={{ backgroundColor: "rgba(15,23,42,0.4)", borderRadius: "var(--radius-md)", padding: "1.5rem 1rem" }}>
                        <svg key={`chart-${sectionKey}-${sectionCurrentPage}`} viewBox={`0 0 500 ${Math.max(120, sectionPaged.length * 50)}`} width="100%">
                          {sectionPaged.map((cand, i) => {
                            const index = sectionPageStart + i; // posición real en el ranking
                            const yPosition = i * 50 + 20;
                            const barWidth = (cand.votes / sectionMaxVotes) * 320;

                            return (
                              <g key={cand.id} style={{ animation: `fadeIn 0.5s ${i * 0.08}s ease forwards`, opacity: 0 }}>
                                {/* Número de Lista */}
                                <rect x="0" y={yPosition - 12} width="35" height="18" rx="4" fill="rgba(59,130,246,0.15)" stroke="rgba(59,130,246,0.3)" strokeWidth="0.5" />
                                <text x="17.5" y={yPosition + 1} fill="var(--primary)" fontSize="9" fontWeight="700" textAnchor="middle">
                                  L.{cand.list_number}
                                </text>

                                {/* Nombre del Candidato */}
                                <text x="45" y={yPosition - 2} fill="#fff" fontSize="10.5" fontWeight="600">
                                  {cand.name}
                                </text>

                                {/* Barra de Fondo */}
                                <rect x="45" y={yPosition + 4} width="320" height="8" rx="4" fill="rgba(255,255,255,0.05)" />

                                {/* Barra de Votos */}
                                <rect
                                  x="45"
                                  y={yPosition + 4}
                                  width={Math.max(5, barWidth)}
                                  height="8"
                                  rx="4"
                                  fill={index === 0 ? `url(#${winnerGradId})` : `url(#${standardGradId})`}
                                />

                                {/* Porcentaje */}
                                <text x="375" y={yPosition + 12} fill="#fff" fontSize="12" fontWeight="800">
                                  {cand.percentage_valid}%
                                </text>

                                {/* Votos absolutos */}
                                <text x="430" y={yPosition + 12} fill="var(--neutral-300)" fontSize="10" fontWeight="500">
                                  {cand.votes.toLocaleString()} v.
                                </text>
                              </g>
                            );
                          })}
                          {/* Degradados para el gráfico */}
                          <defs>
                            <linearGradient id={winnerGradId} x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor="#10b981" />
                              <stop offset="100%" stopColor="#059669" />
                            </linearGradient>
                            <linearGradient id={standardGradId} x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor="#3b82f6" />
                              <stop offset="100%" stopColor="#1d4ed8" />
                            </linearGradient>
                          </defs>
                        </svg>
                      </div>

                      {/* TABLA DE RESULTADOS */}
                      <table className="custom-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Lista</th>
                            <th>Candidato / Partido</th>
                            <th style={{ textAlign: "right" }}>Votos</th>
                            <th style={{ textAlign: "right" }}>% Válidos</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sectionPaged.map((cand, i) => {
                            const idx = sectionPageStart + i; // posición real en el ranking
                            return (
                            <tr key={cand.id}>
                              <td style={{ color: "var(--neutral-300)", fontWeight: 700 }}>{idx + 1}</td>
                              <td>
                                <span
                                  style={{
                                    backgroundColor: idx === 0 ? "rgba(16, 185, 129, 0.15)" : "rgba(255,255,255,0.05)",
                                    border: `1px solid ${idx === 0 ? "var(--success)" : "rgba(255,255,255,0.1)"}`,
                                    color: idx === 0 ? "var(--success)" : "var(--neutral-50)",
                                    padding: "0.2rem 0.5rem",
                                    borderRadius: "4px",
                                    fontSize: "0.75rem",
                                    fontWeight: "700"
                                  }}
                                >
                                  Lista {cand.list_number}
                                </span>
                              </td>
                              <td>
                                <div style={{ fontWeight: "600" }}>{cand.name}</div>
                                <div style={{ fontSize: "0.75rem", color: "var(--neutral-300)" }}>{cand.party_name}</div>
                              </td>
                              <td style={{ textAlign: "right", fontWeight: "700" }}>
                                {cand.votes.toLocaleString()}
                              </td>
                              <td style={{ textAlign: "right", fontWeight: "800", color: idx === 0 ? "var(--success)" : "#fff" }}>
                                {cand.percentage_valid}%
                              </td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>

                      {/* PAGINACIÓN */}
                      {sectionTotalPages > 1 && (
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: "0.75rem",
                            paddingTop: "1rem",
                            borderTop: "1px solid rgba(255,255,255,0.08)"
                          }}
                        >
                          <span style={{ fontSize: "0.85rem", color: "var(--neutral-300)" }}>
                            Mostrando {sectionPageStart + 1}–{sectionPageStart + sectionPaged.length} de {items.length} candidatos
                          </span>
                          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                            <button
                              type="button"
                              style={pageBtnStyle(false, sectionCurrentPage === 1)}
                              disabled={sectionCurrentPage === 1}
                              onClick={() => onPageChange(sectionCurrentPage - 1)}
                            >
                              ‹ Anterior
                            </button>
                            {sectionPageNumbers.map((p, i) =>
                              p === "…" ? (
                                <span key={`dots-${i}`} style={{ color: "var(--neutral-300)", padding: "0.45rem 0.25rem" }}>…</span>
                              ) : (
                                <button
                                  key={p}
                                  type="button"
                                  style={pageBtnStyle(p === sectionCurrentPage)}
                                  onClick={() => onPageChange(p)}
                                >
                                  {p}
                                </button>
                              )
                            )}
                            <button
                              type="button"
                              style={pageBtnStyle(false, sectionCurrentPage === sectionTotalPages)}
                              disabled={sectionCurrentPage === sectionTotalPages}
                              onClick={() => onPageChange(sectionCurrentPage + 1)}
                            >
                              Siguiente ›
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            };

            const circsToShow: CircunscripcionNumber[] = selectedCirc ? [selectedCirc] : [1, 2];

            return (
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "1.5rem", alignItems: "start" }}>

                {/* CANDIDATE VOTE DETAIL */}
                {isRiobambaUrban ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                    {circsToShow.map((circ) =>
                      renderCandidateCard(
                        `circ-${circ}`,
                        `Concejales Urbanos — ${CIRCUNSCRIPCION_INFO[circ].title}`,
                        `Parroquias: ${CIRCUNSCRIPCION_INFO[circ].parroquiasLabel}`,
                        buildCircList(circ),
                        circ === 1 ? pageCirc1 : pageCirc2,
                        circ === 1 ? setPageCirc1 : setPageCirc2
                      )
                    )}
                  </div>
                ) : (
                  renderCandidateCard(
                    "general",
                    "Resultados de Candidatos (Votos Válidos)",
                    null,
                    candidateResults,
                    page,
                    setPage
                  )
                )}

            {/* GEOGRAPHICAL BREAKDOWN PARISHES */}
            <div className="glass-card">
              <h3 style={{ fontSize: "1.25rem", fontWeight: "700", marginBottom: "1.5rem", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "0.75rem" }}>
                Desglose por Parroquias
              </h3>

              {geoBreakdown.length === 0 ? (
                <p style={{ color: "var(--neutral-300)", textAlign: "center", padding: "2rem" }}>
                  Seleccione un Cantón para ver el desglose parroquial detallado.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {geoBreakdown.map((item) => (
                    <div
                      key={item.parroquia}
                      style={{
                        backgroundColor: "rgba(255,255,255,0.02)",
                        border: "1px solid rgba(255,255,255,0.04)",
                        borderRadius: "var(--radius-md)",
                        padding: "1rem",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.5rem"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: "700", fontSize: "1rem" }}>{item.parroquia}</span>
                        <span className="badge badge-info" style={{ fontSize: "0.7rem" }}>
                          {item.escrutinio_percentage}% Escrutado
                        </span>
                      </div>

                      {item.winner.id ? (
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            fontSize: "0.85rem",
                            backgroundColor: "rgba(16, 185, 129, 0.08)",
                            padding: "0.5rem",
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid rgba(16, 185, 129, 0.15)"
                          }}
                        >
                          <div>
                            <span style={{ color: "var(--neutral-300)" }}>Líder: </span>
                            <strong style={{ color: "var(--success)" }}>{item.winner.name}</strong>
                          </div>
                          <strong style={{ color: "var(--success)" }}>{item.winner.percentage}%</strong>
                        </div>
                      ) : (
                        <div style={{ fontSize: "0.85rem", color: "var(--neutral-300)", fontStyle: "italic" }}>
                          Sin votos reportados
                        </div>
                      )}

                      <div style={{ fontSize: "0.75rem", color: "var(--neutral-300)", display: "flex", justifyContent: "space-between" }}>
                        <span>Mesas escrutadas: {item.mesas_escrutadas} / {item.total_mesas}</span>
                        <span>Votos válidos: {item.total_valid_votes.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
            );
          })()}

        </main>
      </div>
    </div>
  );
};