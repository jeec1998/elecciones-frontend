import React, { useState, useEffect } from "react";
import { api, resolvePhotoUrl, type Acta, type Candidate, type Recinto } from "../services/api";

interface VerificacionProps {
  user: {
    username: string;
    fullName: string;
    role: string;
  };
  onNavigateToDashboard: () => void;
}

export const Verificacion: React.FC<VerificacionProps> = ({ user, onNavigateToDashboard }) => {
  const [actas, setActas] = useState<Acta[]>([]);
  const [selectedActa, setSelectedActa] = useState<Acta | null>(null);
  const [candidates, setCandidates] = useState<Record<string, Candidate>>({});
  const [recintos, setRecintos] = useState<Record<string, Recinto>>({});

  // Controles de imagen
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  // Selector de imagen activa en verificación
  const [activePhotoType, setActivePhotoType] = useState<"publica" | "personal">("publica");
  const [photoIndex, setPhotoIndex] = useState(0);

  // Formulario verificación
  const [comment, setComment] = useState("");
  const [auditLoading, setAuditLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("En Verificación");

  // Resetear el índice al cambiar el tipo de foto
  useEffect(() => {
    setPhotoIndex(0);
  }, [activePhotoType]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar actas
  const loadActas = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.getActas(filterStatus || undefined);
      setActas(list);

      // Cargar candidatos y recintos faltantes para resolver nombres
      const allCandidates = await api.getCandidates();
      const candMap: Record<string, Candidate> = {};
      allCandidates.forEach(c => { candMap[c.id] = c; });
      setCandidates(candMap);

      const allRecintos = await api.getRecintos();
      const recMap: Record<string, Recinto> = {};
      allRecintos.forEach(r => { recMap[r.id] = r; });
      setRecintos(recMap);
    } catch (err: any) {
      setError(err.message || "Error al cargar las actas para auditoría");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActas();
    setSelectedActa(null);
  }, [filterStatus]);

  // Selección de acta para auditar
  const handleSelectActa = async (acta: Acta) => {
    setSelectedActa(acta);
    setZoom(1);
    setRotation(0);
    setComment(acta.novedad_comment || "");
    setActivePhotoType("publica");
    setPhotoIndex(0);
  };

  // Controles de zoom y rotación
  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);
  const handleResetImage = () => {
    setZoom(1);
    setRotation(0);
  };

  // Auditar acta
  const handleAudit = async (status: "Validada" | "Con Novedad") => {
    if (!selectedActa) return;
    if (status === "Con Novedad" && !comment.trim()) {
      alert("Por favor ingrese el comentario de la novedad detallando el descuadre observado.");
      return;
    }

    setAuditLoading(true);
    try {
      await api.verifyActa(selectedActa.id, status, comment);
      alert(`Acta auditada con éxito como: ${status}`);
      setSelectedActa(null);
      loadActas();
    } catch (err: any) {
      alert(err.message || "Error al procesar la auditoría");
    } finally {
      setAuditLoading(false);
    }
  };

  const getCandidateName = (cid: string) => {
    return candidates[cid] ? `${candidates[cid].name} (${candidates[cid].list_number})` : `Candidato #${cid}`;
  };

  const getCandidateParty = (cid: string) => {
    return candidates[cid] ? candidates[cid].party_name : "";
  };

  const getRecintoName = (rid: string) => {
    return recintos[rid] ? recintos[rid].name : `Recinto #${rid}`;
  };

  const getRecintoGeo = (rid: string) => {
    if (recintos[rid]) {
      const r = recintos[rid];
      return `${r.provincia} > ${r.canton} > ${r.parroquia}`;
    }
    return "";
  };

  // Calcular la suma de votos digitados en pantalla para el acta activa
  const getActaSum = (acta: Acta) => {
    const cSum = Object.values(acta.votes).reduce((a, b) => a + b, 0);
    return cSum + acta.white_votes + acta.null_votes;
  };

  const currentPhotos = selectedActa
    ? (activePhotoType === "publica" ? (selectedActa.photo_urls || []) : (selectedActa.photo_personal_urls || []))
    : [];
  const currentPhoto = currentPhotos[photoIndex] || "";

  return (
    <div className="dashboard-body animate-fade-in" style={{ minHeight: "100vh" }}>
      <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>

        {/* TOP BAR */}
        <header
          style={{
            background: "rgba(15, 23, 42, 0.9)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            padding: "1rem 2rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}
        >
          <div className="flex-center" style={{ gap: "1rem" }}>
            <button
              onClick={onNavigateToDashboard}
              className="btn btn-secondary"
              style={{ width: "auto", padding: "0.5rem 1rem", fontSize: "0.85rem" }}
            >
              ← Volver al Dashboard
            </button>
            <h1 className="glow-text" style={{ fontSize: "1.5rem", fontWeight: "800" }}>
              Centro de Auditoría Escrutinio
            </h1>
          </div>
          <div style={{ fontSize: "0.85rem", opacity: 0.8 }}>
            Auditor: <strong>{user.fullName}</strong>
          </div>
        </header>

        {/* WORKSPACE */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* LISTA DE ACTAS (Panel Izquierdo si no hay seleccionada, o barra lateral si hay seleccionada) */}
          <div
            style={{
              width: selectedActa ? "320px" : "100%",
              borderRight: "1px solid rgba(255, 255, 255, 0.08)",
              padding: "1.5rem",
              overflowY: "auto",
              display: selectedActa ? "none" : "block", // Ocultar lista en pantallas pequeñas al auditar
            }}
            className="animate-fade-in"
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <h3 style={{ fontSize: "1.2rem", fontWeight: "700" }}>Actas Recibidas</h3>

              {/* Filtro de Estados */}
              <select
                className="input-field"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{ backgroundColor: "#1e293b", color: "#fff", borderColor: "rgba(255,255,255,0.1)", padding: "0.3rem 0.6rem", fontSize: "0.8rem" }}
              >
                <option value="En Verificación">Pendientes ({actas.filter(a => a.status === "En Verificación").length})</option>
                <option value="Con Novedad">Con Novedad ({actas.filter(a => a.status === "Con Novedad").length})</option>
                <option value="Validada">Validadas ({actas.filter(a => a.status === "Validada").length})</option>
                <option value="">Todas ({actas.length})</option>
              </select>
            </div>

            {loading ? (
              <div className="flex-center" style={{ height: "200px" }}>
                <div className="spinner" />
              </div>
            ) : error ? (
              <div className="badge badge-danger" style={{ display: "block", padding: "1rem", textAlign: "center" }}>{error}</div>
            ) : actas.length === 0 ? (
              <p style={{ textAlign: "center", color: "var(--neutral-300)", padding: "3rem" }}>
                No se encontraron actas con el estado seleccionado.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {actas.map(acta => (
                  <div
                    key={acta.id}
                    className="glass-card"
                    onClick={() => handleSelectActa(acta)}
                    style={{
                      cursor: "pointer",
                      padding: "1rem",
                      borderLeft: `4px solid ${
                        acta.status === "En Verificación" ? "var(--warning)" :
                        acta.status === "Con Novedad" ? "var(--danger)" : "var(--success)"
                      }`
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                      <span style={{ fontWeight: "700", fontSize: "0.95rem" }}>
                        Mesa {acta.mesa_number} ({acta.gender})
                      </span>
                      <span className={`badge ${
                        acta.status === "En Verificación" ? "badge-warning" :
                        acta.status === "Con Novedad" ? "badge-danger" : "badge-success"
                      }`} style={{ fontSize: "0.6rem" }}>
                        {acta.status}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--neutral-300)" }}>
                      <strong>Dignidad:</strong> {acta.dignity.toUpperCase()}
                      <br />
                      <strong>Recinto:</strong> {getRecintoName(acta.recinto_id)}
                    </div>
                    <div style={{ fontSize: "0.7rem", opacity: 0.6, marginTop: "0.5rem", textAlign: "right" }}>
                      Ingresado por: {acta.entered_by}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ÁREA DE AUDITORÍA LADO A LADO */}
          {selectedActa && (
            <div style={{ flex: 1, display: "flex", height: "100%", overflow: "hidden" }} className="animate-fade-in">

              {/* PANEL IZQUIERDO: VISOR DE FOTO */}
              <div
                style={{
                  flex: 1,
                  backgroundColor: "#020617",
                  borderRight: "1px solid rgba(255, 255, 255, 0.08)",
                  display: "flex",
                  flexDirection: "column",
                  position: "relative"
                }}
              >
                {/* Controles de Imagen */}
                <div
                  style={{
                    position: "absolute",
                    top: "1rem",
                    left: "1rem",
                    zIndex: 10,
                    display: "flex",
                    gap: "0.5rem",
                    backgroundColor: "rgba(15,23,42,0.85)",
                    padding: "0.5rem",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(255,255,255,0.1)"
                  }}
                >
                  <button onClick={handleZoomIn} className="btn btn-secondary" style={{ width: "36px", padding: "0", height: "36px" }} title="Acercar">+</button>
                  <button onClick={handleZoomOut} className="btn btn-secondary" style={{ width: "36px", padding: "0", height: "36px" }} title="Alejar">-</button>
                  <button onClick={handleRotate} className="btn btn-secondary" style={{ width: "36px", padding: "0", height: "36px" }} title="Rotar 90°">⟳</button>
                  <button onClick={handleResetImage} className="btn btn-secondary" style={{ width: "auto", padding: "0 0.75rem", height: "36px", fontSize: "0.75rem" }}>Reset</button>
                </div>

                {/* Selector de tipo de foto en el visor */}
                <div
                  style={{
                    position: "absolute",
                    top: "1rem",
                    right: "1rem",
                    zIndex: 10,
                    display: "flex",
                    gap: "0.25rem",
                    backgroundColor: "rgba(15,23,42,0.85)",
                    padding: "0.25rem",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(255,255,255,0.1)"
                  }}
                >
                  <button
                    onClick={() => setActivePhotoType("publica")}
                    className="btn"
                    style={{
                      width: "auto",
                      padding: "0.4rem 0.8rem",
                      fontSize: "0.75rem",
                      backgroundColor: activePhotoType === "publica" ? "var(--primary)" : "transparent",
                      color: activePhotoType === "publica" ? "white" : "var(--neutral-300)",
                      borderRadius: "6px",
                      height: "30px",
                      border: "none"
                    }}
                  >
                    Acta Pública
                  </button>
                  <button
                    onClick={() => setActivePhotoType("personal")}
                    className="btn"
                    style={{
                      width: "auto",
                      padding: "0.4rem 0.8rem",
                      fontSize: "0.75rem",
                      backgroundColor: activePhotoType === "personal" ? "var(--primary)" : "transparent",
                      color: activePhotoType === "personal" ? "white" : "var(--neutral-300)",
                      borderRadius: "6px",
                      height: "30px",
                      border: "none"
                    }}
                  >
                    Acta Personal
                  </button>
                </div>

                {/* Contenedor del Canvas / Imagen */}
                <div
                  style={{
                    flex: 1,
                    overflow: "auto",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "2rem"
                  }}
                >
                  {currentPhoto ? (
                    <img
                      src={resolvePhotoUrl(currentPhoto)}
                      alt={`Acta ${activePhotoType === "publica" ? "Pública" : "Personal"} - Página ${photoIndex + 1}`}
                      style={{
                        maxWidth: "100%",
                        maxHeight: "100%",
                        objectFit: "contain",
                        transform: `scale(${zoom}) rotate(${rotation}deg)`,
                        transition: "transform 0.2s ease",
                        boxShadow: "0 0 30px rgba(0,0,0,0.5)"
                      }}
                    />
                  ) : (
                    <p style={{ color: "var(--neutral-300)" }}>
                      No se subieron imágenes para el acta {activePhotoType === "publica" ? "pública" : "personal"}.
                    </p>
                  )}
                </div>

                {/* Controles de Paginación */}
                {currentPhotos.length > 1 && (
                  <div
                    style={{
                      padding: "0.75rem",
                      backgroundColor: "rgba(15, 23, 42, 0.85)",
                      borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: "1rem",
                      zIndex: 10
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setPhotoIndex(prev => Math.max(0, prev - 1))}
                      disabled={photoIndex === 0}
                      className="btn btn-secondary"
                      style={{ width: "auto", padding: "0.25rem 0.75rem", height: "30px", fontSize: "0.75rem" }}
                    >
                      ← Ant
                    </button>

                    <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                      {currentPhotos.map((_, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setPhotoIndex(idx)}
                          style={{
                            padding: "0.25rem 0.5rem",
                            fontSize: "0.75rem",
                            borderRadius: "4px",
                            border: "none",
                            backgroundColor: photoIndex === idx ? "var(--primary)" : "rgba(255,255,255,0.1)",
                            color: "white",
                            cursor: "pointer",
                            fontWeight: photoIndex === idx ? "bold" : "normal"
                          }}
                        >
                          Pág {idx + 1}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => setPhotoIndex(prev => Math.min(currentPhotos.length - 1, prev + 1))}
                      disabled={photoIndex === currentPhotos.length - 1}
                      className="btn btn-secondary"
                      style={{ width: "auto", padding: "0.25rem 0.75rem", height: "30px", fontSize: "0.75rem" }}
                    >
                      Sig →
                    </button>
                  </div>
                )}
              </div>

              {/* PANEL DERECHO: COMPARACIÓN DE VOTOS Y ACCIONES */}
              <div
                style={{
                  width: "420px",
                  backgroundColor: "rgba(15, 23, 42, 0.5)",
                  padding: "2rem 1.5rem",
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: "1.5rem"
                }}
              >
                <div>
                  <button
                    onClick={() => setSelectedActa(null)}
                    className="btn btn-secondary"
                    style={{ width: "auto", padding: "0.4rem 0.8rem", fontSize: "0.75rem", marginBottom: "1rem" }}
                  >
                    ← Volver a la Lista
                  </button>

                  <h2 style={{ fontSize: "1.35rem", fontWeight: "800", color: "#fff", marginBottom: "0.25rem" }}>
                    Mesa #{selectedActa.mesa_number} ({selectedActa.gender})
                  </h2>
                  <p style={{ fontSize: "0.8rem", color: "var(--neutral-300)" }}>
                    {getRecintoGeo(selectedActa.recinto_id)}
                  </p>
                  <p style={{ fontSize: "0.85rem", color: "var(--primary)", fontWeight: "600", marginTop: "0.25rem" }}>
                    {getRecintoName(selectedActa.recinto_id)}
                  </p>
                </div>

                <div style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }} />

                {/* VOTOS DIGITADOS */}
                <div>
                  <h4 style={{ fontSize: "0.9rem", color: "var(--neutral-300)", marginBottom: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Votos Digitados ({selectedActa.dignity.toUpperCase()})
                  </h4>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                    {Object.entries(selectedActa.votes).map(([cid, voteCount]) => (
                      <div
                        key={cid}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          backgroundColor: "rgba(255,255,255,0.02)",
                          padding: "0.6rem 0.75rem",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid rgba(255,255,255,0.04)"
                        }}
                      >
                        <div style={{ flex: 1, paddingRight: "0.75rem" }}>
                          <div style={{ fontWeight: "600", fontSize: "0.85rem" }}>{getCandidateName(cid)}</div>
                          <span style={{ fontSize: "0.7rem", opacity: 0.6 }}>{getCandidateParty(cid)}</span>
                        </div>
                        <span style={{ fontSize: "1.1rem", fontWeight: "800", color: "var(--primary)" }}>
                          {voteCount}
                        </span>
                      </div>
                    ))}

                    {/* Blancos y Nulos */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginTop: "0.25rem" }}>
                      <div style={{ backgroundColor: "rgba(245, 158, 11, 0.05)", padding: "0.5rem", borderRadius: "var(--radius-sm)", border: "1px solid rgba(245, 158, 11, 0.15)", display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "0.8rem", color: "var(--warning)" }}>Blancos:</span>
                        <strong style={{ fontSize: "0.95rem" }}>{selectedActa.white_votes}</strong>
                      </div>
                      <div style={{ backgroundColor: "rgba(244, 63, 94, 0.05)", padding: "0.5rem", borderRadius: "var(--radius-sm)", border: "1px solid rgba(244, 63, 94, 0.15)", display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "0.8rem", color: "var(--danger)" }}>Nulos:</span>
                        <strong style={{ fontSize: "0.95rem" }}>{selectedActa.null_votes}</strong>
                      </div>
                    </div>

                    {/* Totales y checksum */}
                    <div
                      style={{
                        marginTop: "0.5rem",
                        padding: "0.75rem",
                        borderRadius: "var(--radius-sm)",
                        backgroundColor: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        fontSize: "0.85rem",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.25rem"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Total Digitado en Padrón:</span>
                        <strong>{selectedActa.total_voters}</strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Suma de Votos:</span>
                        <strong style={{ color: getActaSum(selectedActa) === selectedActa.total_voters ? "var(--success)" : "var(--danger)" }}>
                          {getActaSum(selectedActa)}
                        </strong>
                      </div>
                      <div style={{ fontSize: "0.75rem", fontStyle: "italic", textAlign: "right", color: getActaSum(selectedActa) === selectedActa.total_voters ? "var(--success)" : "var(--danger)" }}>
                        {getActaSum(selectedActa) === selectedActa.total_voters ? "✓ Cuadre Matemático" : "✗ Acta descuadrada aritméticamente"}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }} />

                {/* ACCIONES DE VERIFICACIÓN */}
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div className="input-group">
                    <label className="input-label" style={{ color: "var(--neutral-300)" }}>Comentario Auditor (Requerido para Novedades)</label>
                    <textarea
                      className="input-field"
                      placeholder="Ej. La lista 5 tiene 45 votos en la foto pero se ingresaron 54. O: El acta cuadra con la foto."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={3}
                      style={{
                        backgroundColor: "rgba(15, 23, 42, 0.6)",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        color: "#fff",
                        resize: "none",
                        fontFamily: "var(--font-body)",
                        fontSize: "0.85rem"
                      }}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <button
                      onClick={() => handleAudit("Con Novedad")}
                      className="btn btn-secondary"
                      disabled={auditLoading}
                      style={{
                        backgroundColor: "rgba(244, 63, 94, 0.1)",
                        color: "var(--danger)",
                        border: "1px solid rgba(244, 63, 94, 0.3)"
                      }}
                    >
                      Reportar Novedad
                    </button>
                    <button
                      onClick={() => handleAudit("Validada")}
                      className="btn btn-primary"
                      disabled={auditLoading}
                      style={{
                        backgroundColor: "var(--success)",
                        boxShadow: "0 0 15px rgba(16, 185, 129, 0.2)"
                      }}
                    >
                      Validar Acta
                    </button>
                  </div>
                </div>

              </div>

            </div>
          )}

        </div>
      </div>
    </div>
  );
};