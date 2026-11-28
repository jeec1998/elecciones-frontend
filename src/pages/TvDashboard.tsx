import React, { useState, useEffect, useMemo, useCallback } from "react";
import { api, resolvePhotoUrl, type Recinto } from "../services/api";
import {
  CIRCUNSCRIPCION_INFO,
  getCandidateCircunscripcion,
  getRecintoCircunscripcion,
  isRiobamba,
  type CircunscripcionNumber,
} from "../utils/circunscripcion";

interface TvDashboardProps {
  onExit: () => void;
}

// ⚠️ Verifica que estos IDs coincidan con los que usa tu backend / vista principal
type Scope = "general" | "provincial" | "cantonal" | "parroquial";
const DIGNIDADES: { id: string; label: string; icon: string; scope: Scope }[] = [
  { id: "general", label: "Dashboard General", icon: "📊", scope: "general" },
  { id: "prefecto", label: "Prefecto Provincial", icon: "👑", scope: "provincial" },
  { id: "alcalde", label: "Alcalde Cantonal", icon: "🏢", scope: "cantonal" },
  { id: "concejal_urbano", label: "Concejales Urbanos", icon: "🏙️", scope: "cantonal" },
  { id: "concejal_rural", label: "Concejales Rurales", icon: "🌾", scope: "cantonal" },
  { id: "junta_parroquial", label: "Junta Parroquial", icon: "🏡", scope: "parroquial" },
];

const PROVINCIA = "Chimborazo";
const CANTON_POR_DEFECTO = "RIOBAMBA";
const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#f43f5e", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#a855f7"];
const BAR_COLORS = [
  "linear-gradient(90deg, #3b82f6 0%, #00f0ff 100%)",
  "linear-gradient(90deg, #10b981 0%, #10ffaa 100%)",
  "linear-gradient(90deg, #f59e0b 0%, #ffd000 100%)",
  "linear-gradient(90deg, #f43f5e 0%, #ff5c75 100%)",
  "linear-gradient(90deg, #8b5cf6 0%, #d946ef 100%)",
  "linear-gradient(90deg, #06b6d4 0%, #22d3ee 100%)",
  "linear-gradient(90deg, #ec4899 0%, #f472b6 100%)",
];

const EMPTY_SUMMARY = {
  total_mesas: 0,
  mesas_escrutadas: 0,
  escrutinio_percentage: 0,
  total_valid_votes: 0,
  total_white_votes: 0,
  total_null_votes: 0,
  total_votes_emitidos: 0,
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const norm = (s?: string) => (s || "").trim().toUpperCase();
// Lee el primer campo numérico que exista en el acta (tolerante a nombres distintos)
const pick = (obj: any, keys: string[]) => {
  for (const k of keys) if (obj && typeof obj[k] === "number") return obj[k];
  return 0;
};

const Donut: React.FC<{ items: { key: string; pct: number }[]; center: React.ReactNode }> = ({ items, center }) => {
  return (
    <div style={{ position: "relative", width: 170, height: 170, margin: "0 auto 1.25rem" }}>
      <svg width="100%" height="100%" viewBox="0 0 42 42">
        <circle cx="21" cy="21" r="15.9155" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="5" />
        {items.map((it, idx) => {
          if (it.pct <= 0) return null;
          const accBefore = items.slice(0, idx).reduce((sum, prev) => sum + (prev.pct > 0 ? prev.pct : 0), 0);
          const offset = 100 - accBefore + 25;
          return (
            <circle key={it.key} cx="21" cy="21" r="15.9155" fill="none"
              stroke={COLORS[idx % COLORS.length]} strokeWidth="5"
              strokeDasharray={`${it.pct} ${100 - it.pct}`} strokeDashoffset={offset} />
          );
        })}
      </svg>
      <div className="donut-center">{center}</div>
    </div>
  );
};

export const TvDashboard: React.FC<TvDashboardProps> = ({ onExit }) => {
  const [recintosMap, setRecintosMap] = useState<Record<string, Recinto>>({});

  // Filtros
  const [dignityId, setDignityId] = useState<string>("general");
  const [canton, setCanton] = useState<string>("");     // "" = Todos
  const [parroquia, setParroquia] = useState<string>(""); // "" = Todas
  const [circunscripcion, setCircunscripcion] = useState<"" | "1" | "2">("");
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);

  // Datos vista detallada
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<any>(EMPTY_SUMMARY);
  const [apiCandidates, setApiCandidates] = useState<any[]>([]);
  const [actas, setActas] = useState<any[]>([]);
  const [serverZones, setServerZones] = useState<any[] | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Datos Dashboard General
  const [generalStats, setGeneralStats] = useState<Record<string, any>>({});
  const [generalLoading, setGeneralLoading] = useState(false);

  const dignity = DIGNIDADES.find(d => d.id === dignityId) || DIGNIDADES[0];

  // ---------- Catálogos geográficos derivados de los recintos ----------
  const cantones = useMemo(() => {
    const set = new Set<string>();
    Object.values(recintosMap).forEach((r: any) => r.canton && set.add(r.canton));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [recintosMap]);

  const parroquias = useMemo(() => {
    if (!canton) return [];
    const set = new Set<string>();
    Object.values(recintosMap).forEach((r: any) => {
      if (norm(r.canton) === norm(canton) && r.parroquia) set.add(r.parroquia);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [recintosMap, canton]);

  // ---------- Carga inicial de recintos ----------
  useEffect(() => {
    (async () => {
      try {
        const list = await api.getRecintos();
        const map: Record<string, Recinto> = {};
        list.forEach((r: any) => (map[r.id] = r));
        setRecintosMap(map);
      } catch (err) {
        console.error("Error al cargar recintos:", err);
      }
    })();
  }, []);

  // Las dignidades cantonales/parroquiales necesitan un cantón: se elige uno por defecto
  useEffect(() => {
    if ((dignity.scope === "cantonal" || dignity.scope === "parroquial") && !canton && cantones.length > 0) {
      const def = cantones.find(c => norm(c) === CANTON_POR_DEFECTO) || cantones[0];
      setCanton(def);
    }
  }, [dignity.scope, canton, cantones]);

  // ---------- Dashboard General: Prefectura + Alcaldía de cada cantón (1 sola petición) ----------
  const fetchGeneralDashboard = useCallback(async () => {
    if (cantones.length === 0) return;
    setGeneralLoading(true);
    try {
      const results = await api.getTvGeneral(PROVINCIA, cantones);
      setGeneralStats(results);
      setLastUpdate(new Date());
    } catch (err) {
      console.error("Error cargando resumen general TV:", err);
    } finally {
      setGeneralLoading(false);
    }
  }, [cantones]);

  // ---------- Vista detallada ----------
  const fetchDetailedData = useCallback(async () => {
    if (dignity.scope === "general") {
      await fetchGeneralDashboard();
      return;
    }
    if (dignity.scope !== "provincial" && !canton) return; // esperando cantón por defecto

    setLoading(true);
    setError(null);
    try {
      const detail = await api.getTvDetail(
        dignity.id,
        PROVINCIA,
        canton || undefined,
        parroquia || undefined
      );
      let results = detail.candidate_results || [];
      if (
        dignity.id === "concejal_urbano" &&
        isRiobamba(canton) &&
        results.some((c: any) => !c.parroquia)
      ) {
        try {
          const catalog = await api.getCandidates("concejal_urbano", canton);
          const parrById = new Map(catalog.map(c => [c.id, c.parroquia]));
          results = results.map((c: any) => ({
            ...c,
            parroquia: c.parroquia || parrById.get(c.id),
          }));
        } catch {
          // Si falla el catálogo, se mantiene la lista sin enriquecer
        }
      }
      setSummary(detail.summary || EMPTY_SUMMARY);
      setApiCandidates(results);
      if (Array.isArray(detail.zones)) {
        setServerZones(detail.zones);
        setActas([]);
      } else {
        setServerZones(null);
        setActas(detail.actas || []);
      }
      setLastUpdate(new Date());
    } catch (err) {
      console.error("Error cargando datos de TV:", err);
      setError("Error de conexión al obtener datos en tiempo real");
    } finally {
      setLoading(false);
    }
  }, [dignity.id, dignity.scope, canton, parroquia, fetchGeneralDashboard]);

  useEffect(() => {
    setSelectedCandidateId(null);
    fetchDetailedData();
    // Refresco cada 15 s + jitter aleatorio (0-5 s) para escalar a 300 espectadores sin picos simultáneos
    const intervalMs = 15000 + Math.floor(Math.random() * 5000);
    const t = setInterval(() => {
      if (!document.hidden) {
        fetchDetailedData();
      }
    }, intervalMs);
    return () => clearInterval(t);
  }, [fetchDetailedData]);

  // ---------- Actas filtradas por cantón / parroquia ----------
  const filteredActas = useMemo(() => {
    return actas.filter(a => {
      const r: any = recintosMap[a.recinto_id];
      if (!r) return false;
      if (canton && norm(r.canton) !== norm(canton)) return false;
      if (parroquia && norm(r.parroquia) !== norm(parroquia)) return false;
      return true;
    });
  }, [actas, recintosMap, canton, parroquia]);

  // Si hay parroquia seleccionada y estamos usando fallback sin serverZones, recalculamos desde actas
  const { candidateResults, viewSummary } = useMemo(() => {
    if (serverZones !== null || !parroquia) return { candidateResults: apiCandidates, viewSummary: summary };

    const totals: Record<string, number> = {};
    let white = 0, nulls = 0;
    filteredActas.forEach(a => {
      Object.entries(a.votes || {}).forEach(([id, v]) => {
        totals[id] = (totals[id] || 0) + (Number(v) || 0);
      });
      white += pick(a, ["white_votes", "blank_votes", "votos_blancos", "blancos"]);
      nulls += pick(a, ["null_votes", "votos_nulos", "nulos"]);
    });
    const valid = Object.values(totals).reduce((s, n) => s + n, 0);
    const list = apiCandidates
      .map(c => {
        const votes = totals[c.id] || 0;
        return { ...c, votes, percentage_valid: valid > 0 ? round2((votes / valid) * 100) : 0 };
      })
      .sort((a, b) => b.votes - a.votes);

    const mesasParroquia = Object.values(recintosMap)
      .filter((r: any) => norm(r.canton) === norm(canton) && norm(r.parroquia) === norm(parroquia))
      .reduce((s: number, r: any) => s + (r.num_juntas ?? r.total_mesas ?? r.juntas ?? 0), 0);
    const escrutadas = filteredActas.length;

    return {
      candidateResults: list,
      viewSummary: {
        total_mesas: mesasParroquia || escrutadas,
        mesas_escrutadas: escrutadas,
        escrutinio_percentage: mesasParroquia ? round2((escrutadas / mesasParroquia) * 100) : 0,
        total_valid_votes: valid,
        total_white_votes: white,
        total_null_votes: nulls,
        total_votes_emitidos: valid + white + nulls,
      },
    };
  }, [serverZones, parroquia, apiCandidates, summary, filteredActas, recintosMap, canton]);

  // Nivel de desglose: Provincia→Cantón, Cantón→Parroquia, Parroquia→Recinto
  const breakdownLevel = !canton ? "Cantón" : !parroquia ? "Parroquia" : "Recinto";
  const groupKeyOf = (r: any) =>
    !canton ? r.canton : !parroquia ? r.parroquia : r.nombre || r.name || r.id;

  // Desglose general (votos válidos y actas por zona + líder de cada zona)
  const zoneBreakdown = useMemo(() => {
    if (serverZones !== null) {
      return serverZones.map((z: any) => {
        const leaderId = Object.entries(z.by_cand || {}).sort((a: any, b: any) => b[1] - a[1])[0]?.[0];
        const leader = apiCandidates.find(c => c.id === leaderId);
        return { location: z.location, votes: z.votes, actas: z.actas, leader };
      });
    }
    const zones: Record<string, { votes: number; actas: number; byCand: Record<string, number> }> = {};
    filteredActas.forEach(a => {
      const r: any = recintosMap[a.recinto_id];
      const key = groupKeyOf(r) || "Sin dato";
      if (!zones[key]) zones[key] = { votes: 0, actas: 0, byCand: {} };
      zones[key].actas += 1;
      Object.entries(a.votes || {}).forEach(([id, v]) => {
        const n = Number(v) || 0;
        zones[key].votes += n;
        zones[key].byCand[id] = (zones[key].byCand[id] || 0) + n;
      });
    });
    return Object.entries(zones)
      .map(([location, z]) => {
        const leaderId = Object.entries(z.byCand).sort((a, b) => b[1] - a[1])[0]?.[0];
        const leader = apiCandidates.find(c => c.id === leaderId);
        return { location, votes: z.votes, actas: z.actas, leader };
      })
      .sort((a, b) => b.votes - a.votes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverZones, filteredActas, recintosMap, apiCandidates, canton, parroquia]);

  // Desglose del candidato seleccionado
  const candidateBreakdown = useMemo(() => {
    if (!selectedCandidateId) return { list: [] as any[], totalVotes: 0 };
    if (serverZones !== null) {
      const list = serverZones
        .map((z: any) => ({
          location: z.location,
          votes: Number(z.by_cand?.[selectedCandidateId]) || 0,
        }))
        .filter((z: any) => z.votes > 0);
      const totalVotes = list.reduce((s: number, z: any) => s + z.votes, 0);
      return {
        list: list
          .map((z: any) => ({
            ...z,
            percentage: totalVotes ? round2((z.votes / totalVotes) * 100) : 0,
          }))
          .sort((a: any, b: any) => b.votes - a.votes),
        totalVotes,
      };
    }
    const map: Record<string, number> = {};
    filteredActas.forEach(a => {
      const v = Number(a.votes?.[selectedCandidateId]) || 0;
      if (v > 0) {
        const key = groupKeyOf(recintosMap[a.recinto_id]) || "Sin dato";
        map[key] = (map[key] || 0) + v;
      }
    });
    const totalVotes = Object.values(map).reduce((s, n) => s + n, 0);
    const list = Object.entries(map)
      .map(([location, votes]) => ({ location, votes, percentage: totalVotes ? round2((votes / totalVotes) * 100) : 0 }))
      .sort((a, b) => b.votes - a.votes);
    return { list, totalVotes };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCandidateId, serverZones, filteredActas, recintosMap, canton, parroquia]);

  // ---------- Navegación ----------
  const goTo = (id: string, c?: string) => {
    setDignityId(id);
    if (c !== undefined) setCanton(c);
    if (id === "prefecto" && c === undefined) setCanton("");
    setParroquia("");
    setCircunscripcion("");
    setSelectedCandidateId(null);
  };

  // ---------- Componentes de render ----------
  const renderGeneralCard = (key: string, title: string, onClick: () => void, big = false) => {
    const data = generalStats[key];
    if (!data) {
      return (
        <div key={key} className="tv-card flex-center" style={{ minHeight: 150, color: "#64748b" }}>
          {generalLoading ? <div className="spinner" /> : <>Esperando transmisión — {title}</>}
        </div>
      );
    }
    const sum = data.summary || EMPTY_SUMMARY;
    const cands = data.candidate_results || [];
    const leader = cands[0];
    const second = cands[1];
    const hasVotes = leader && leader.votes > 0;

    return (
      <div key={key} className="tv-card gen-card" onClick={onClick} style={big ? { gridColumn: "1 / -1" } : undefined}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: big ? "1.35rem" : "1.05rem", fontWeight: 800, color: "#60a5fa" }}>{title}</h3>
          <span className="pill">{sum.escrutinio_percentage}% escrutado</span>
        </div>

        {hasVotes ? (
          <div className="leader-box">
            {leader.photo_url
              ? <img src={resolvePhotoUrl(leader.photo_url)} alt={leader.name} className="avatar" />
              : <div className="avatar avatar-empty">👤</div>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: "0.65rem", color: "#fbbf24", fontWeight: 800 }}>LÍDER ACTUAL</span>
              <h4 className="ellipsis" style={{ fontSize: big ? "1.2rem" : "0.95rem", fontWeight: 700 }}>{leader.name}</h4>
              <p className="ellipsis" style={{ fontSize: "0.7rem", color: "#94a3b8" }}>Lista {leader.list_number} · {leader.party_name}</p>
              {second && (
                <p className="ellipsis" style={{ fontSize: "0.7rem", color: "#64748b", marginTop: 2 }}>
                  2º {second.name} — {second.percentage_valid}%
                </p>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: big ? "1.8rem" : "1.35rem", fontWeight: 800, color: "#10b981" }}>{leader.percentage_valid}%</span>
              <p style={{ fontSize: "0.7rem", color: "#64748b" }}>{leader.votes.toLocaleString()} votos</p>
            </div>
          </div>
        ) : (
          <div className="leader-box" style={{ justifyContent: "center", color: "#64748b", fontSize: "0.85rem" }}>
            Sin actas registradas
          </div>
        )}

        <div className="progress-bar-container" style={{ height: 8 }}>
          <div className="progress-bar-fill" style={{ width: `${sum.escrutinio_percentage}%`, background: BAR_COLORS[0] }} />
        </div>
        <div className="card-foot">
          <span>Válidos: <strong>{(sum.total_valid_votes || 0).toLocaleString()}</strong></span>
          <span>Juntas: <strong>{sum.mesas_escrutadas}/{sum.total_mesas}</strong></span>
        </div>
      </div>
    );
  };

  const renderGeneralDashboard = () => (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.25rem", flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 4 }}>
      <div className="tv-card neon-border-blue banner">
        <div>
          <h2 style={{ fontSize: "2rem", fontWeight: 800 }}>CENTRO DE MONITOREO CHIMBORAZO 2026</h2>
          <p style={{ color: "#94a3b8", marginTop: 4 }}>
            Prefectura y Alcaldías de los {cantones.length} cantones · Clic en una tarjeta para ver el detalle
          </p>
        </div>
        {lastUpdate && <span className="pill">Actualizado {lastUpdate.toLocaleTimeString()}</span>}
      </div>

      <div className="gen-grid">
        {renderGeneralCard("prefecto", "👑 PREFECTURA DE CHIMBORAZO", () => goTo("prefecto", ""), true)}
        {cantones.map(c =>
          renderGeneralCard(`alcalde_${c}`, `🏢 ALCALDÍA DE ${c.toUpperCase()}`, () => goTo("alcalde", c))
        )}
      </div>
    </div>
  );

  const renderDetailedView = () => {
    const isRiobambaUrban = dignity.id === "concejal_urbano" && isRiobamba(canton);
    const activeCirc: CircunscripcionNumber | null = isRiobambaUrban
      ? circunscripcion === "1"
        ? 1
        : circunscripcion === "2"
          ? 2
          : getRecintoCircunscripcion(canton, parroquia)
      : null;

    const buildCircList = (circ: CircunscripcionNumber) => {
      const list = candidateResults.filter(
        (c: any) => getCandidateCircunscripcion(c.parroquia) === circ
      );
      const totalVotes = list.reduce((sum: number, c: any) => sum + (c.votes || 0), 0);
      return list.map((c: any) => ({
        ...c,
        percentage_valid: totalVotes > 0 ? round2(((c.votes || 0) / totalVotes) * 100) : 0,
      }));
    };

    const visibleCandidates =
      isRiobambaUrban && activeCirc !== null ? buildCircList(activeCirc) : candidateResults;

    const visibleZones =
      isRiobambaUrban && activeCirc !== null && !parroquia
        ? zoneBreakdown.filter(z => getRecintoCircunscripcion(canton, z.location) === activeCirc)
        : zoneBreakdown;

    const selectedCandidate = visibleCandidates.find(c => c.id === selectedCandidateId);
    const s = viewSummary;
    const circLabel = activeCirc ? ` › ${CIRCUNSCRIPCION_INFO[activeCirc].title}` : "";
    const zona = parroquia
      ? `${canton} › ${parroquia}`
      : canton
        ? `Cantón ${canton}${circLabel}`
        : "Provincia de Chimborazo";
    const zoneTotal = visibleZones.reduce((acc, z) => acc + z.votes, 0);

    const renderCandidateRow = (cand: any, index: number) => {
      const active = selectedCandidateId === cand.id;
      return (
        <div key={cand.id} className={`cand-row ${active ? "active" : ""}`}
          onClick={() => setSelectedCandidateId(active ? null : cand.id)}>
          <div className={`rank ${index === 0 && cand.votes > 0 ? "first" : ""}`}>{index + 1}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", marginBottom: 6 }}>
              <div className="ellipsis">
                <span className="badge-list">L. {cand.list_number}</span>
                <strong style={{ fontSize: "1.2rem" }}>{cand.name}</strong>
                <span style={{ fontSize: "0.8rem", color: "#64748b", marginLeft: 8 }}>{cand.party_name}</span>
              </div>
              <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                <strong style={{ fontSize: "1.35rem", color: index === 0 ? "#10b981" : "#00f0ff" }}>{cand.percentage_valid}%</strong>
                <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{(cand.votes || 0).toLocaleString()} votos</div>
              </div>
            </div>
            <div className="progress-bar-container" style={{ height: 16 }}>
              <div className="progress-bar-fill" style={{ width: `${cand.percentage_valid}%`, background: BAR_COLORS[index % BAR_COLORS.length] }} />
            </div>
          </div>
        </div>
      );
    };

    return (
      <div className="animate-fade-in" style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1.25rem", overflow: "hidden" }}>
        {/* BANNER */}
        <div className="tv-card neon-border-blue banner">
          <div>
            <span style={{ fontSize: "0.85rem", color: "#3b82f6", fontWeight: 700, letterSpacing: 1 }}>{zona.toUpperCase()}</span>
            <h2 style={{ fontSize: "2.3rem", fontWeight: 800, marginTop: 4 }}>{dignity.icon} {dignity.label}</h2>
            {isRiobambaUrban && activeCirc && (
              <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                {CIRCUNSCRIPCION_INFO[activeCirc].title}: {CIRCUNSCRIPCION_INFO[activeCirc].parroquiasLabel}
              </span>
            )}
            {dignity.scope === "parroquial" && !parroquia && (
              <span style={{ fontSize: "0.8rem", color: "#fbbf24" }}>Seleccione una parroquia para ver su Junta Parroquial</span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: "0.85rem", color: "#94a3b8", textTransform: "uppercase" }}>Avance escrutinio</span>
              <h3 style={{ fontSize: "2.3rem", fontWeight: 800, color: "#00f0ff", margin: 0 }}>{s.escrutinio_percentage}%</h3>
              <span style={{ fontSize: "0.8rem", color: "#64748b" }}>{s.mesas_escrutadas} / {s.total_mesas} juntas</span>
            </div>
            <svg width="75" height="75" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.9155" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#00f0ff" strokeWidth="3.2"
                strokeDasharray={`${s.escrutinio_percentage}, 100`} strokeDashoffset="25"
                style={{ transition: "stroke-dasharray 0.8s ease" }} />
            </svg>
          </div>
        </div>

        {/* CUERPO */}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: visibleCandidates.length ? "3fr 2fr" : "1fr", gap: "1.25rem", minHeight: 0 }}>
          {/* CANDIDATOS */}
          <div className="tv-card" style={{ gap: "0.75rem", overflowY: "auto" }}>
            <div className="section-head">
              <span>RESULTADOS DE CANDIDATOS (VOTOS VÁLIDOS) · CLIC PARA DESGLOSE</span>
              {selectedCandidateId && <span className="badge badge-warning">Desglose activo</span>}
            </div>

            {error && <div style={{ color: "#f43f5e", textAlign: "center" }}>⚠️ {error}</div>}
            {loading && visibleCandidates.length === 0 && (
              <div style={{ textAlign: "center", color: "#94a3b8", padding: "2rem" }}>
                <div className="spinner" style={{ margin: "0 auto 1rem" }} /> Cargando candidatos...
              </div>
            )}
            {!loading && !error && visibleCandidates.length === 0 && (
              <div style={{ textAlign: "center", color: "#64748b", padding: "2rem" }}>
                <h3>Sin candidatos / actas para esta selección</h3>
                <p>Esperando transmisión de datos...</p>
              </div>
            )}

            {isRiobambaUrban && activeCirc === null ? (
              ([1, 2] as CircunscripcionNumber[]).map(circ => {
                const list = buildCircList(circ);
                if (list.length === 0) return null;
                return (
                  <div key={circ} style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "0.75rem" }}>
                    <div className="section-head" style={{ color: "#60a5fa", marginTop: circ === 2 ? "0.5rem" : 0 }}>
                      <span>{CIRCUNSCRIPCION_INFO[circ].title.toUpperCase()}</span>
                      <span style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 500 }}>
                        {CIRCUNSCRIPCION_INFO[circ].parroquiasLabel}
                      </span>
                    </div>
                    {list.map((cand, idx) => renderCandidateRow(cand, idx))}
                  </div>
                );
              })
            ) : (
              visibleCandidates.map((cand, index) => renderCandidateRow(cand, index))
            )}
          </div>

          {/* PANEL DERECHO */}
          {visibleCandidates.length > 0 && (
            <div className="tv-card" style={{ minHeight: 0, overflow: "hidden" }}>
              {selectedCandidate ? (
                <>
                  <div className="section-head">
                    <span style={{ color: "#fbbf24" }}>VOTOS POR {breakdownLevel.toUpperCase()}</span>
                    <button className="btn-close" onClick={() => setSelectedCandidateId(null)}>✕ General</button>
                  </div>
                  <div style={{ textAlign: "center", marginBottom: "0.75rem" }}>
                    <h3 style={{ fontSize: "1.15rem", fontWeight: 800 }}>{selectedCandidate.name}</h3>
                    <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>Lista {selectedCandidate.list_number} · {selectedCandidate.party_name}</span>
                  </div>
                  <Donut items={candidateBreakdown.list.map(l => ({ key: l.location, pct: l.percentage }))}
                    center={<><span className="mini">Votos totales</span><div className="big">{candidateBreakdown.totalVotes.toLocaleString()}</div></>} />
                  <div className="legend">
                    {candidateBreakdown.list.length === 0
                      ? <p style={{ color: "#64748b", textAlign: "center", padding: "1rem" }}>Sin votos registrados aún.</p>
                      : candidateBreakdown.list.map((l, idx) => (
                        <div key={l.location} className="legend-row">
                          <span><i style={{ background: COLORS[idx % COLORS.length] }} />{l.location}</span>
                          <strong>{l.votes.toLocaleString()} ({l.percentage}%)</strong>
                        </div>
                      ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="section-head"><span>DESGLOSE POR {breakdownLevel.toUpperCase()}</span></div>
                  <Donut
                    items={visibleZones.map(z => ({ key: z.location, pct: zoneTotal ? round2((z.votes / zoneTotal) * 100) : 0 }))}
                    center={<><span className="mini">Votos válidos</span><div className="big">{(s.total_valid_votes || 0).toLocaleString()}</div></>} />
                  <div className="legend">
                    {visibleZones.length === 0 ? (
                      <p style={{ color: "#64748b", textAlign: "center", padding: "1rem" }}>Sin actas reportadas en esta zona.</p>
                    ) : visibleZones.map((z, idx) => (
                      <div key={z.location} className="zone-row"
                        onClick={() => {
                          if (!canton) { setCanton(z.location); }
                          else if (!parroquia) { setParroquia(z.location); setCircunscripcion(""); }
                        }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontWeight: 700 }}><i style={{ background: COLORS[idx % COLORS.length] }} />{z.location}</span>
                          <strong>{z.votes.toLocaleString()} v.</strong>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "#64748b", marginTop: 2 }}>
                          <span className="ellipsis">{z.leader ? `Lidera: ${z.leader.name}` : "—"}</span>
                          <span>{z.actas} actas</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* PIE */}
        <footer className="summary-grid">
          <div className="summary-box"><span>VOTOS VÁLIDOS</span><strong style={{ color: "#3b82f6" }}>{(s.total_valid_votes || 0).toLocaleString()}</strong></div>
          <div className="summary-box"><span>VOTOS BLANCOS</span><strong style={{ color: "#cbd5e1" }}>{(s.total_white_votes || 0).toLocaleString()}</strong></div>
          <div className="summary-box"><span>VOTOS NULOS</span><strong style={{ color: "#f43f5e" }}>{(s.total_null_votes || 0).toLocaleString()}</strong></div>
          <div className="summary-box" style={{ background: "rgba(59,130,246,0.06)", borderColor: "rgba(59,130,246,0.25)" }}>
            <span style={{ color: "#60a5fa" }}>TOTAL EMITIDOS</span><strong>{(s.total_votes_emitidos || 0).toLocaleString()}</strong>
          </div>
        </footer>
      </div>
    );
  };

  const showFilters = dignity.scope !== "general";

  return (
    <div className="tv-root">
      <style>{`
        .tv-root { background:#020617; color:#f8fafc; min-height:100vh; height:100vh; width:100vw; font-family:'Outfit','Inter',sans-serif; display:flex; overflow:hidden; }
        .tv-card { background:rgba(15,23,42,0.65); backdrop-filter:blur(20px); border:1px solid rgba(255,255,255,0.08); border-radius:20px; padding:1.5rem; box-shadow:0 20px 50px rgba(0,0,0,0.5); display:flex; flex-direction:column; }
        .neon-border-blue { box-shadow:0 0 25px rgba(59,130,246,0.25); border:1px solid rgba(59,130,246,0.4); }
        .banner { flex-direction:row; justify-content:space-between; align-items:center; padding:1.25rem 2rem; background:linear-gradient(135deg, rgba(30,41,59,0.8) 0%, rgba(15,23,42,0.9) 100%); }
        .flex-center { align-items:center; justify-content:center; }
        .ellipsis { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .pill { font-size:0.75rem; color:#00f0ff; font-weight:700; background:rgba(0,240,255,0.1); padding:0.25rem 0.6rem; border-radius:6px; white-space:nowrap; }
        .gen-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(340px, 1fr)); gap:1.1rem; }
        .gen-card { gap:0.8rem; cursor:pointer; transition:all .25s ease; padding:1.2rem; }
        .gen-card:hover { border-color:#3b82f6; box-shadow:0 0 30px rgba(59,130,246,0.2); transform:translateY(-3px); }
        .leader-box { display:flex; align-items:center; gap:0.8rem; background:rgba(255,255,255,0.02); padding:0.65rem; border-radius:12px; border:1px solid rgba(255,255,255,0.04); min-height:70px; }
        .avatar { width:48px; height:48px; border-radius:50%; object-fit:cover; border:2px solid #10b981; flex-shrink:0; }
        .avatar-empty { background:rgba(255,255,255,0.06); display:flex; align-items:center; justify-content:center; font-size:1.2rem; border:none; }
        .card-foot { display:flex; justify-content:space-between; font-size:0.75rem; color:#94a3b8; }
        .section-head { display:flex; justify-content:space-between; align-items:center; font-size:0.8rem; color:#94a3b8; font-weight:700; border-bottom:1px solid rgba(255,255,255,0.06); padding-bottom:0.5rem; margin-bottom:0.5rem; }
        .cand-row { display:flex; align-items:center; gap:1.1rem; cursor:pointer; padding:0.7rem 1rem; border-radius:14px; background:rgba(255,255,255,0.01); border:1px solid rgba(255,255,255,0.04); transition:all .2s; }
        .cand-row:hover { background:rgba(255,255,255,0.04); border-color:rgba(255,255,255,0.1); }
        .cand-row.active { background:rgba(59,130,246,0.15); border-color:rgba(59,130,246,0.5); box-shadow:0 0 15px rgba(59,130,246,0.15); }
        .rank { font-size:1.1rem; font-weight:800; width:32px; height:32px; flex-shrink:0; border-radius:50%; background:rgba(255,255,255,0.05); color:#94a3b8; border:1px solid rgba(255,255,255,0.1); display:flex; align-items:center; justify-content:center; }
        .rank.first { background:rgba(251,191,36,0.15); color:#fbbf24; }
        .badge-list { font-size:0.8rem; font-weight:800; background:#3b82f6; color:#fff; padding:0.1rem 0.45rem; border-radius:6px; margin-right:0.6rem; }
        .progress-bar-container { background:rgba(255,255,255,0.04); border-radius:9999px; width:100%; overflow:hidden; border:1px solid rgba(255,255,255,0.05); }
        .progress-bar-fill { height:100%; border-radius:9999px; transition:width 1s cubic-bezier(0.1,0.8,0.3,1); box-shadow:0 0 15px rgba(59,130,246,0.5); }
        .donut-center { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); text-align:center; }
        .donut-center .mini { font-size:0.65rem; color:#94a3b8; }
        .donut-center .big { font-size:1.3rem; font-weight:800; }
        .legend { flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:0.35rem; padding-right:4px; }
        .legend i, .zone-row i { display:inline-block; width:9px; height:9px; border-radius:2px; margin-right:6px; }
        .legend-row { display:flex; justify-content:space-between; font-size:0.8rem; color:#cbd5e1; padding:0.2rem 0; }
        .zone-row { font-size:0.82rem; color:#cbd5e1; padding:0.45rem 0.6rem; border-radius:10px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.04); cursor:pointer; }
        .zone-row:hover { border-color:rgba(59,130,246,0.4); }
        .btn-close { background:rgba(244,63,94,0.15); border:1px solid rgba(244,63,94,0.4); color:#f43f5e; padding:0.2rem 0.5rem; border-radius:8px; font-size:0.7rem; font-weight:700; cursor:pointer; }
        .summary-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:1.25rem; }
        .summary-box { text-align:center; padding:1rem; background:rgba(30,41,59,0.35); border:1px solid rgba(255,255,255,0.05); border-radius:16px; }
        .summary-box span { font-size:0.75rem; color:#94a3b8; display:block; }
        .summary-box strong { font-size:1.5rem; }
        .side { width:270px; flex-shrink:0; background:rgba(15,23,42,0.95); border-right:1px solid rgba(255,255,255,0.08); display:flex; flex-direction:column; padding:1.75rem 1.1rem; gap:1.25rem; overflow-y:auto; }
        .side-label { font-size:0.7rem; color:#64748b; font-weight:800; letter-spacing:1px; text-transform:uppercase; margin-bottom:0.5rem; }
        .nav-btn { width:100%; padding:0.75rem 0.9rem; border-radius:12px; border:none; background:rgba(255,255,255,0.02); color:#94a3b8; font-weight:700; font-size:0.88rem; text-align:left; cursor:pointer; transition:all .2s; }
        .nav-btn:hover { background:rgba(255,255,255,0.06); color:#fff; }
        .nav-btn.active { background:linear-gradient(135deg,#1e3a8a 0%,#3b82f6 100%); color:#fff; }
        .tv-select { width:100%; padding:0.6rem 0.7rem; border-radius:10px; background:#0f172a; color:#e2e8f0; border:1px solid rgba(255,255,255,0.12); font-weight:600; font-size:0.85rem; }
        .tv-select:disabled { opacity:0.45; }
      `}</style>

      {/* SIDEBAR */}
      <aside className="side">
        <div>
          <h2 style={{ fontSize: "1.3rem", fontWeight: 900, background: "linear-gradient(135deg,#60a5fa 0%,#00f0ff 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: 1 }}>
            CONTROL TV
          </h2>
          <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700 }}>OPERADOR GENERAL</span>
        </div>

        <div>
          <div className="side-label">Dignidades</div>
          <nav style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {DIGNIDADES.map(d => (
              <button key={d.id} className={`nav-btn ${dignityId === d.id ? "active" : ""}`}
                onClick={() => goTo(d.id, d.scope === "provincial" ? "" : undefined)}>
                {d.icon} {d.label}
              </button>
            ))}
          </nav>
        </div>

        {showFilters && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div className="side-label" style={{ marginBottom: 0 }}>Filtros</div>
            <label style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
              Cantón
              <select className="tv-select" value={canton}
                onChange={e => { setCanton(e.target.value); setParroquia(""); setCircunscripcion(""); setSelectedCandidateId(null); }}>
                {dignity.scope === "provincial" && <option value="">Todos</option>}
                {cantones.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
              Parroquia
              <select className="tv-select" value={parroquia} disabled={!canton}
                onChange={e => { setParroquia(e.target.value); setCircunscripcion(""); setSelectedCandidateId(null); }}>
                <option value="">Todas</option>
                {parroquias.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            {dignity.id === "concejal_urbano" && isRiobamba(canton) && (
              <label style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                Circunscripción
                <select className="tv-select" value={circunscripcion}
                  onChange={e => {
                    setCircunscripcion(e.target.value as "" | "1" | "2");
                    setParroquia("");
                    setSelectedCandidateId(null);
                  }}>
                  <option value="">Ambas (1 y 2)</option>
                  <option value="1">Circunscripción 1</option>
                  <option value="2">Circunscripción 2</option>
                </select>
              </label>
            )}
          </div>
        )}

        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {lastUpdate && (
            <span style={{ fontSize: "0.7rem", color: "#64748b", textAlign: "center" }}>
              Últ. actualización {lastUpdate.toLocaleTimeString()} · auto 15 s
            </span>
          )}
          <button onClick={fetchDetailedData} className="btn btn-secondary" style={{ width: "100%", padding: "0.7rem", fontWeight: 700 }}>
            🔄 Refrescar
          </button>
          <button onClick={onExit} className="btn-close" style={{ padding: "0.75rem", fontSize: "0.85rem", borderRadius: 12 }}>
            SALIR DE MODO TV
          </button>
        </div>
      </aside>

      {/* CONTENIDO */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", padding: "1.75rem", overflow: "hidden", position: "relative" }}>
        {dignity.scope === "general" ? renderGeneralDashboard() : renderDetailedView()}
      </main>
    </div>
  );
};