import React, { useState, useEffect } from "react";
import { api, API_BASE_URL, type Recinto, type Candidate } from "../services/api";

interface AdministracionProps {
  user: {
    username: string;
    fullName: string;
    role: string;
  };
  onNavigateToDashboard: () => void;
}

export const Administracion: React.FC<AdministracionProps> = ({ user, onNavigateToDashboard }) => {
  const [activeTab, setActiveTab] = useState<"usuarios" | "candidatos" | "recintos">("usuarios");

  // Listados cargados
  const [recintosList, setRecintosList] = useState<Recinto[]>([]);
  const [candidatesList, setCandidatesList] = useState<Candidate[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  // Estados de edición
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [editingRecintoId, setEditingRecintoId] = useState<string | null>(null);

  // --- FORM STATES ---
  // Crear Usuario
  const [userUsername, setUserUsername] = useState("");
  const [userFullName, setUserFullName] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userRole, setUserRole] = useState("digitador");
  const [userRecintoId, setUserRecintoId] = useState("");
  const [userMesa, setUserMesa] = useState<number | "">("");
  const [userGender, setUserGender] = useState("Femenina");

  // Crear/Editar Candidato
  const [candName, setCandName] = useState("");
  const [candList, setCandList] = useState("");
  const [candParty, setCandParty] = useState("");
  const [candDignity, setCandDignity] = useState("alcalde");
  const [candCanton, setCandCanton] = useState("Riobamba");
  const [candParroquia, setCandParroquia] = useState("");
  const [candPhoto, setCandPhoto] = useState("");

  // Crear/Editar Recinto
  const [recProvincia, setRecProvincia] = useState("Chimborazo");
  const [recCanton, setRecCanton] = useState("Riobamba");
  const [recParroquia, setRecParroquia] = useState("");
  const [recName, setRecName] = useState("");
  const [recFem, setRecFem] = useState<number>(0);
  const [recMasc, setRecMasc] = useState<number>(0);
  const [recMix, setRecMix] = useState<number>(0);

  // Estados comunes
  const [formLoading, setFormLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Cargar datos
  const loadData = async () => {
    setLoadingList(true);
    try {
      const recs = await api.getRecintos();
      setRecintosList(recs);
      const cands = await api.getCandidates();
      setCandidatesList(cands);
    } catch (err) {
      console.error("Error al cargar catálogos:", err);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const clearStatus = () => {
    setStatusMessage(null);
  };

  // --- SUBMITS ---

  // Guardar/Crear Usuario
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    clearStatus();

    if (!userUsername.trim() || !userFullName.trim() || !userPassword.trim()) {
      setStatusMessage({ type: "error", text: "Complete los campos obligatorios del usuario" });
      return;
    }

    setFormLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          username: userUsername,
          password: userPassword,
          full_name: userFullName,
          role: userRole,
          assigned_recinto_id: userRecintoId || null,
          assigned_mesa: userMesa ? Number(userMesa) : null,
          assigned_gender: userGender || null
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Error al registrar el usuario");
      }

      setStatusMessage({ type: "success", text: `Usuario ${userUsername} registrado exitosamente.` });
      setUserUsername("");
      setUserFullName("");
      setUserPassword("");
      setUserRecintoId("");
      setUserMesa("");
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "No se pudo registrar el usuario" });
    } finally {
      setFormLoading(false);
    }
  };

  // Guardar (Crear o Editar) Candidato
  const handleSaveCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    clearStatus();

    if (!candName.trim() || !candList.trim() || !candParty.trim()) {
      setStatusMessage({ type: "error", text: "Complete el nombre, lista y partido político" });
      return;
    }

    setFormLoading(true);
    try {
      const payload = {
        name: candName,
        list_number: candList,
        party_name: candParty,
        dignity: candDignity,
        canton: candDignity !== "prefecto" ? candCanton : undefined,
        parroquia: candDignity !== "prefecto" && candParroquia ? candParroquia : undefined,
        photo_url: candPhoto || undefined
      };

      if (editingCandidateId) {
        await api.updateCandidate(editingCandidateId, payload);
        setStatusMessage({ type: "success", text: `Candidato ${candName} modificado con éxito.` });
        setEditingCandidateId(null);
      } else {
        await api.createCandidate(payload);
        setStatusMessage({ type: "success", text: `Candidato ${candName} (Lista ${candList}) registrado.` });
      }

      setCandName("");
      setCandList("");
      setCandParty("");
      setCandParroquia("");
      setCandPhoto("");
      loadData();
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "Error al guardar candidato" });
    } finally {
      setFormLoading(false);
    }
  };

  // Iniciar edición de candidato
  const handleStartEditCandidate = (cand: Candidate) => {
    setEditingCandidateId(cand.id);
    setCandName(cand.name);
    setCandList(cand.list_number);
    setCandParty(cand.party_name);
    setCandDignity(cand.dignity);
    setCandCanton(cand.canton || "Riobamba");
    setCandParroquia(cand.parroquia || "");
    setCandPhoto(cand.photo_url || "");
    setStatusMessage(null);
  };

  const handleCancelEditCandidate = () => {
    setEditingCandidateId(null);
    setCandName("");
    setCandList("");
    setCandParty("");
    setCandParroquia("");
    setCandPhoto("");
  };

  // Eliminar candidato
  const handleDeleteCandidate = async (candidateId: string, name: string) => {
    if (!window.confirm(`¿Está seguro de que desea eliminar al candidato ${name}?`)) {
      return;
    }
    setFormLoading(true);
    try {
      await api.deleteCandidate(candidateId);
      setStatusMessage({ type: "success", text: `Candidato ${name} eliminado con éxito.` });
      loadData();
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "Error al eliminar candidato" });
    } finally {
      setFormLoading(false);
    }
  };

  // Guardar (Crear o Editar) Recinto
  const handleSaveRecinto = async (e: React.FormEvent) => {
    e.preventDefault();
    clearStatus();

    if (!recProvincia.trim() || !recCanton.trim() || !recParroquia.trim() || !recName.trim()) {
      setStatusMessage({ type: "error", text: "Complete la ubicación y el nombre del recinto" });
      return;
    }

    setFormLoading(true);
    try {
      const payload = {
        provincia: recProvincia,
        canton: recCanton,
        parroquia: recParroquia,
        name: recName,
        total_mesas_femeninas: Number(recFem) || 0,
        total_mesas_masculinas: Number(recMasc) || 0,
        total_mesas_mixtas: Number(recMix) || 0
      };

      if (editingRecintoId) {
        await api.updateRecinto(editingRecintoId, payload);
        setStatusMessage({ type: "success", text: `Recinto ${recName} modificado con éxito.` });
        setEditingRecintoId(null);
      } else {
        await api.createRecinto(payload);
        setStatusMessage({ type: "success", text: `Recinto ${recName} registrado con éxito.` });
      }

      setRecName("");
      setRecParroquia("");
      setRecFem(0);
      setRecMasc(0);
      setRecMix(0);
      loadData();
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "Error al guardar recinto" });
    } finally {
      setFormLoading(false);
    }
  };

  // Iniciar edición de Recinto
  const handleStartEditRecinto = (rec: Recinto) => {
    setEditingRecintoId(rec.id);
    setRecProvincia(rec.provincia);
    setRecCanton(rec.canton);
    setRecParroquia(rec.parroquia);
    setRecName(rec.name);
    setRecFem(rec.total_mesas_femeninas);
    setRecMasc(rec.total_mesas_masculinas);
    setRecMix(rec.total_mesas_mixtas);
    setStatusMessage(null);
  };

  const handleCancelEditRecinto = () => {
    setEditingRecintoId(null);
    setRecName("");
    setRecParroquia("");
    setRecFem(0);
    setRecMasc(0);
    setRecMix(0);
  };

  // Eliminar Recinto
  const handleDeleteRecinto = async (recintoId: string, name: string) => {
    if (!window.confirm(`¿Está seguro de que desea eliminar el recinto electoral ${name}?`)) {
      return;
    }
    setFormLoading(true);
    try {
      await api.deleteRecinto(recintoId);
      setStatusMessage({ type: "success", text: `Recinto ${name} eliminado con éxito.` });
      loadData();
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "Error al eliminar recinto" });
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div className="dashboard-body animate-fade-in" style={{ minHeight: "100vh" }}>
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>

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
              Panel de Administración (Superadmin)
            </h1>
          </div>
          <div style={{ fontSize: "0.85rem", opacity: 0.8 }}>
            Chimborazo: <strong>{user.fullName}</strong>
          </div>
        </header>

        {/* CONTENEDOR PRINCIPAL */}
        <main style={{ flex: 1, padding: "2rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>

          {/* TABS SELECTOR */}
          <div className="flex-center" style={{ justifyContent: "flex-start", gap: "1rem", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "1rem" }}>
            <button
              className="btn"
              onClick={() => { setActiveTab("usuarios"); clearStatus(); }}
              style={{
                width: "auto",
                backgroundColor: activeTab === "usuarios" ? "var(--primary)" : "rgba(255,255,255,0.05)",
                color: "#fff",
                fontSize: "0.9rem",
                padding: "0.5rem 1.25rem"
              }}
            >
              Crear Usuarios (Delegados/Coordinadores)
            </button>
            <button
              className="btn"
              onClick={() => { setActiveTab("candidatos"); clearStatus(); }}
              style={{
                width: "auto",
                backgroundColor: activeTab === "candidatos" ? "var(--primary)" : "rgba(255,255,255,0.05)",
                color: "#fff",
                fontSize: "0.9rem",
                padding: "0.5rem 1.25rem"
              }}
            >
              Candidatos y Listas (CRUD)
            </button>
            <button
              className="btn"
              onClick={() => { setActiveTab("recintos"); clearStatus(); }}
              style={{
                width: "auto",
                backgroundColor: activeTab === "recintos" ? "var(--primary)" : "rgba(255,255,255,0.05)",
                color: "#fff",
                fontSize: "0.9rem",
                padding: "0.5rem 1.25rem"
              }}
            >
              Recintos Electorales (CRUD)
            </button>
          </div>

          {/* MENSAJES DE ESTADO */}
          {statusMessage && (
            <div
              className={`badge ${statusMessage.type === "success" ? "badge-success" : "badge-danger"}`}
              style={{
                padding: "1rem",
                width: "100%",
                textAlign: "center",
                display: "block",
                textTransform: "none",
                fontSize: "0.95rem",
                borderRadius: "var(--radius-md)"
              }}
            >
              {statusMessage.text}
            </div>
          )}

          {/* DISEÑO EN 2 COLUMNAS */}
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.5fr", gap: "2rem", alignItems: "start" }}>

            {/* COLUMNA FORMULARIO DE ACCIÓN */}
            <div className="glass-card">

              {/* FORMULARIO USUARIOS */}
              {activeTab === "usuarios" && (
                <form onSubmit={handleCreateUser}>
                  <h3 style={{ fontSize: "1.2rem", fontWeight: "700", marginBottom: "1.5rem", color: "#fff" }}>
                    Registrar Nuevo Usuario Elector
                  </h3>

                  <div className="input-group">
                    <label className="input-label" style={{ color: "var(--neutral-300)" }}>Usuario de Acceso (Único) *</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Ej. mrodriguez"
                      value={userUsername}
                      onChange={(e) => setUserUsername(e.target.value.toLowerCase().trim())}
                      style={{ backgroundColor: "rgba(15,23,42,0.4)", color: "#fff", borderColor: "rgba(255,255,255,0.1)" }}
                    />
                  </div>

                  <div className="input-group">
                    <label className="input-label" style={{ color: "var(--neutral-300)" }}>Nombre Completo *</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Ej. Martha Rodríguez"
                      value={userFullName}
                      onChange={(e) => setUserFullName(e.target.value)}
                      style={{ backgroundColor: "rgba(15,23,42,0.4)", color: "#fff", borderColor: "rgba(255,255,255,0.1)" }}
                    />
                  </div>

                  <div className="input-group">
                    <label className="input-label" style={{ color: "var(--neutral-300)" }}>Contraseña *</label>
                    <input
                      type="password"
                      className="input-field"
                      placeholder="Contraseña inicial"
                      value={userPassword}
                      onChange={(e) => setUserPassword(e.target.value)}
                      style={{ backgroundColor: "rgba(15,23,42,0.4)", color: "#fff", borderColor: "rgba(255,255,255,0.1)" }}
                    />
                  </div>

                  <div className="input-group">
                    <label className="input-label" style={{ color: "var(--neutral-300)" }}>Rol de Sistema</label>
                    <select
                      className="input-field"
                      value={userRole}
                      onChange={(e) => setUserRole(e.target.value)}
                      style={{ backgroundColor: "rgba(15,23,42,0.4)", color: "#fff", borderColor: "rgba(255,255,255,0.1)" }}
                    >
                      <option value="digitador">Digitador / Delegado de Mesa</option>
                      <option value="coordinator">Coordinador de Recinto</option>
                      <option value="admin">Administrador (Superadmin)</option>
                    </select>
                  </div>

                  {userRole !== "admin" && (
                    <>
                      <div className="input-group">
                        <label className="input-label" style={{ color: "var(--neutral-300)" }}>Asignar Recinto (Opcional)</label>
                        <select
                          className="input-field"
                          value={userRecintoId}
                          onChange={(e) => setUserRecintoId(e.target.value)}
                          style={{ backgroundColor: "rgba(15,23,42,0.4)", color: "#fff", borderColor: "rgba(255,255,255,0.1)" }}
                        >
                          <option value="">-- Sin asignar --</option>
                          {recintosList.map(r => (
                            <option key={r.id} value={r.id}>{r.name} ({r.canton})</option>
                          ))}
                        </select>
                      </div>

                      {userRole === "digitador" && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                          <div className="input-group">
                            <label className="input-label" style={{ color: "var(--neutral-300)" }}>Mesa asignada</label>
                            <input
                              type="number"
                              className="input-field"
                              placeholder="Ej. 1"
                              value={userMesa}
                              onChange={(e) => setUserMesa(e.target.value === "" ? "" : Number(e.target.value))}
                              style={{ backgroundColor: "rgba(15,23,42,0.4)", color: "#fff", borderColor: "rgba(255,255,255,0.1)" }}
                            />
                          </div>
                          <div className="input-group">
                            <label className="input-label" style={{ color: "var(--neutral-300)" }}>Género de mesa</label>
                            <select
                              className="input-field"
                              value={userGender}
                              onChange={(e) => setUserGender(e.target.value)}
                              style={{ backgroundColor: "rgba(15,23,42,0.4)", color: "#fff", borderColor: "rgba(255,255,255,0.1)" }}
                            >
                              <option value="Femenina">Femenina</option>
                              <option value="Masculina">Masculina</option>
                              <option value="Mixta">Mixta</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  <button className="btn btn-primary" type="submit" disabled={formLoading} style={{ marginTop: "1rem" }}>
                    {formLoading ? "Registrando..." : "Registrar y Asignar Usuario"}
                  </button>
                </form>
              )}

              {/* FORMULARIO CANDIDATOS */}
              {activeTab === "candidatos" && (
                <form onSubmit={handleSaveCandidate}>
                  <h3 style={{ fontSize: "1.2rem", fontWeight: "700", marginBottom: "1.5rem", color: "#fff" }}>
                    {editingCandidateId ? "Modificar Candidato" : "Agregar Nuevo Candidato"}
                  </h3>

                  <div className="input-group">
                    <label className="input-label" style={{ color: "var(--neutral-300)" }}>Nombre Completo *</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Ej. Hermel Tayupanda"
                      value={candName}
                      onChange={(e) => setCandName(e.target.value)}
                      style={{ backgroundColor: "rgba(15,23,42,0.4)", color: "#fff", borderColor: "rgba(255,255,255,0.1)" }}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "1rem" }}>
                    <div className="input-group">
                      <label className="input-label" style={{ color: "var(--neutral-300)" }}>Nº Lista *</label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Ej. 18"
                        value={candList}
                        onChange={(e) => setCandList(e.target.value)}
                        style={{ backgroundColor: "rgba(15,23,42,0.4)", color: "#fff", borderColor: "rgba(255,255,255,0.1)" }}
                      />
                    </div>
                    <div className="input-group">
                      <label className="input-label" style={{ color: "var(--neutral-300)" }}>Partido / Alianza *</label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Ej. Pachakutik"
                        value={candParty}
                        onChange={(e) => setCandParty(e.target.value)}
                        style={{ backgroundColor: "rgba(15,23,42,0.4)", color: "#fff", borderColor: "rgba(255,255,255,0.1)" }}
                      />
                    </div>
                  </div>

                  <div className="input-group">
                    <label className="input-label" style={{ color: "var(--neutral-300)" }}>Dignidad Elector</label>
                    <select
                      className="input-field"
                      value={candDignity}
                      onChange={(e) => setCandDignity(e.target.value)}
                      style={{ backgroundColor: "rgba(15,23,42,0.4)", color: "#fff", borderColor: "rgba(255,255,255,0.1)" }}
                    >
                      <option value="prefecto">Prefecto y Viceprefecto (Provincial)</option>
                      <option value="alcalde">Alcalde (Cantonal)</option>
                      <option value="concejal_urbano">Concejales Urbanos</option>
                      <option value="concejal_rural">Concejales Rurales</option>
                      <option value="junta_parroquial">Vocal Junta Parroquial</option>
                    </select>
                  </div>

                  {candDignity !== "prefecto" && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                      <div className="input-group">
                        <label className="input-label" style={{ color: "var(--neutral-300)" }}>Cantón (Chimborazo)</label>
                        <select
                          className="input-field"
                          value={candCanton}
                          onChange={(e) => setCandCanton(e.target.value)}
                          style={{ backgroundColor: "rgba(15,23,42,0.4)", color: "#fff", borderColor: "rgba(255,255,255,0.1)" }}
                        >
                          <option value="Riobamba">Riobamba</option>
                          <option value="Guano">Guano</option>
                          <option value="Colta">Colta</option>
                          <option value="Alausí">Alausí</option>
                          <option value="Chambo">Chambo</option>
                          <option value="Chunchi">Chunchi</option>
                          <option value="Cumandá">Cumandá</option>
                          <option value="Guamote">Guamote</option>
                          <option value="Pallatanga">Pallatanga</option>
                          <option value="Penipe">Penipe</option>
                        </select>
                      </div>

                      <div className="input-group">
                        <label className="input-label" style={{ color: "var(--neutral-300)" }}>Parroquia (Opcional)</label>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="Ej. Maldonado"
                          value={candParroquia}
                          onChange={(e) => setCandParroquia(e.target.value)}
                          style={{ backgroundColor: "rgba(15,23,42,0.4)", color: "#fff", borderColor: "rgba(255,255,255,0.1)" }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="input-group">
                    <label className="input-label" style={{ color: "var(--neutral-300)" }}>URL de Fotografía</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Ej. https://url-foto.com/candidato.jpg"
                      value={candPhoto}
                      onChange={(e) => setCandPhoto(e.target.value)}
                      style={{ backgroundColor: "rgba(15,23,42,0.4)", color: "#fff", borderColor: "rgba(255,255,255,0.1)" }}
                    />
                  </div>

                  <div style={{ display: "flex", gap: "1rem" }}>
                    <button className="btn btn-primary" type="submit" disabled={formLoading} style={{ marginTop: "1rem" }}>
                      {formLoading ? "Guardando..." : editingCandidateId ? "Guardar Cambios" : "Registrar Candidato"}
                    </button>
                    {editingCandidateId && (
                      <button
                        className="btn btn-secondary"
                        type="button"
                        onClick={handleCancelEditCandidate}
                        style={{ marginTop: "1rem" }}
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </form>
              )}

              {/* FORMULARIO RECINTOS */}
              {activeTab === "recintos" && (
                <form onSubmit={handleSaveRecinto}>
                  <h3 style={{ fontSize: "1.2rem", fontWeight: "700", marginBottom: "1.5rem", color: "#fff" }}>
                    {editingRecintoId ? "Modificar Recinto" : "Registrar Recinto Electoral"}
                  </h3>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <div className="input-group">
                      <label className="input-label" style={{ color: "var(--neutral-300)" }}>Provincia</label>
                      <input
                        type="text"
                        className="input-field"
                        value={recProvincia}
                        onChange={(e) => setRecProvincia(e.target.value)}
                        disabled
                        style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "var(--neutral-300)" }}
                      />
                    </div>
                    <div className="input-group">
                      <label className="input-label" style={{ color: "var(--neutral-300)" }}>Cantón *</label>
                      <select
                        className="input-field"
                        value={recCanton}
                        onChange={(e) => setRecCanton(e.target.value)}
                        style={{ backgroundColor: "rgba(15,23,42,0.4)", color: "#fff", borderColor: "rgba(255,255,255,0.1)" }}
                      >
                        <option value="Riobamba">Riobamba</option>
                        <option value="Guano">Guano</option>
                        <option value="Colta">Colta</option>
                        <option value="Alausí">Alausí</option>
                        <option value="Chambo">Chambo</option>
                      </select>
                    </div>
                  </div>

                  <div className="input-group">
                    <label className="input-label" style={{ color: "var(--neutral-300)" }}>Parroquia *</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Ej. Maldonado o San Luis"
                      value={recParroquia}
                      onChange={(e) => setRecParroquia(e.target.value)}
                      style={{ backgroundColor: "rgba(15,23,42,0.4)", color: "#fff", borderColor: "rgba(255,255,255,0.1)" }}
                    />
                  </div>

                  <div className="input-group">
                    <label className="input-label" style={{ color: "var(--neutral-300)" }}>Nombre del Establecimiento / Recinto *</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Ej. Colegio Maldonado"
                      value={recName}
                      onChange={(e) => setRecName(e.target.value)}
                      style={{ backgroundColor: "rgba(15,23,42,0.4)", color: "#fff", borderColor: "rgba(255,255,255,0.1)" }}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginTop: "0.5rem" }}>
                    <div className="input-group">
                      <label className="input-label" style={{ color: "var(--neutral-300)" }}>Mesas Fem.</label>
                      <input
                        type="number"
                        className="input-field"
                        value={recFem}
                        onChange={(e) => setRecFem(Number(e.target.value) || 0)}
                        style={{ backgroundColor: "rgba(15,23,42,0.4)", color: "#fff", borderColor: "rgba(255,255,255,0.1)" }}
                      />
                    </div>
                    <div className="input-group">
                      <label className="input-label" style={{ color: "var(--neutral-300)" }}>Mesas Masc.</label>
                      <input
                        type="number"
                        className="input-field"
                        value={recMasc}
                        onChange={(e) => setRecMasc(Number(e.target.value) || 0)}
                        style={{ backgroundColor: "rgba(15,23,42,0.4)", color: "#fff", borderColor: "rgba(255,255,255,0.1)" }}
                      />
                    </div>
                    <div className="input-group">
                      <label className="input-label" style={{ color: "var(--neutral-300)" }}>Mesas Mixtas</label>
                      <input
                        type="number"
                        className="input-field"
                        value={recMix}
                        onChange={(e) => setRecMix(Number(e.target.value) || 0)}
                        style={{ backgroundColor: "rgba(15,23,42,0.4)", color: "#fff", borderColor: "rgba(255,255,255,0.1)" }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "1rem" }}>
                    <button className="btn btn-primary" type="submit" disabled={formLoading} style={{ marginTop: "1rem" }}>
                      {formLoading ? "Guardando..." : editingRecintoId ? "Guardar Cambios" : "Registrar Recinto"}
                    </button>
                    {editingRecintoId && (
                      <button
                        className="btn btn-secondary"
                        type="button"
                        onClick={handleCancelEditRecinto}
                        style={{ marginTop: "1rem" }}
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </form>
              )}

            </div>

            {/* COLUMNA LISTADOS EXISTENTES (Con botones de Editar y Eliminar) */}
            <div className="glass-card" style={{ maxHeight: "75vh", overflowY: "auto" }}>
              <h3 style={{ fontSize: "1.2rem", fontWeight: "700", marginBottom: "1.25rem", color: "#fff" }}>
                {activeTab === "recintos" ? "Recintos Registrados" : activeTab === "candidatos" ? "Candidatos Registrados" : "Usuarios Activos (Catálogo)"}
              </h3>

              {loadingList ? (
                <div className="flex-center" style={{ height: "150px" }}>
                  <div className="spinner" />
                </div>
              ) : activeTab === "recintos" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {recintosList.map(r => (
                    <div
                      key={r.id}
                      style={{
                        backgroundColor: "rgba(255,255,255,0.02)",
                        padding: "0.75rem 1rem",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid rgba(255,255,255,0.04)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}
                    >
                      <div>
                        <strong style={{ color: "#fff" }}>{r.name}</strong>
                        <div style={{ fontSize: "0.8rem", color: "var(--neutral-300)", marginTop: "0.25rem" }}>
                          {r.provincia} &gt; {r.canton} &gt; {r.parroquia} |
                          <strong> Mesas:</strong> F:{r.total_mesas_femeninas} M:{r.total_mesas_masculinas} Mix:{r.total_mesas_mixtas}
                        </div>
                      </div>

                      {/* BOTONES DE ACCIÓN CRUD */}
                      <div className="flex-center" style={{ gap: "0.5rem" }}>
                        <button
                          onClick={() => handleStartEditRecinto(r)}
                          className="btn btn-secondary"
                          style={{ width: "auto", padding: "0.3rem 0.6rem", fontSize: "0.75rem", backgroundColor: "rgba(59,130,246,0.15)", color: "var(--primary)" }}
                          title="Editar Recinto"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDeleteRecinto(r.id, r.name)}
                          className="btn btn-secondary"
                          style={{ width: "auto", padding: "0.3rem 0.6rem", fontSize: "0.75rem", backgroundColor: "rgba(244,63,94,0.15)", color: "var(--danger)" }}
                          title="Eliminar Recinto"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : activeTab === "candidatos" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {candidatesList.map(c => (
                    <div
                      key={c.id}
                      style={{
                        backgroundColor: "rgba(255,255,255,0.02)",
                        padding: "0.75rem 1rem",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid rgba(255,255,255,0.04)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                          <span style={{ fontSize: "0.7rem", backgroundColor: "var(--primary)", color: "white", padding: "0.1rem 0.3rem", borderRadius: "3px" }}>L.{c.list_number}</span>
                          <strong style={{ color: "#fff" }}>{c.name}</strong>
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--neutral-300)", marginTop: "0.25rem" }}>
                          {c.party_name} | <span style={{ textTransform: "capitalize", color: "var(--primary)" }}>{c.dignity.replace("_", " ")}</span>
                          {c.canton && ` (${c.canton})`}
                        </div>
                      </div>

                      {/* BOTONES DE ACCIÓN CRUD */}
                      <div className="flex-center" style={{ gap: "0.5rem" }}>
                        <button
                          onClick={() => handleStartEditCandidate(c)}
                          className="btn btn-secondary"
                          style={{ width: "auto", padding: "0.3rem 0.6rem", fontSize: "0.75rem", backgroundColor: "rgba(59,130,246,0.15)", color: "var(--primary)" }}
                          title="Editar Candidato"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDeleteCandidate(c.id, c.name)}
                          className="btn btn-secondary"
                          style={{ width: "auto", padding: "0.3rem 0.6rem", fontSize: "0.75rem", backgroundColor: "rgba(244,63,94,0.15)", color: "var(--danger)" }}
                          title="Eliminar Candidato"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: "0.9rem", color: "var(--neutral-300)", lineHeight: "1.6" }}>
                  <p>Por razones de seguridad electoral, el listado de usuarios con contraseñas encriptadas solo se puede auditar mediante la base de datos de MongoDB.</p>
                  <p style={{ marginTop: "0.5rem" }}>Una vez creado el usuario, este ya puede iniciar sesión en la app inmediatamente utilizando su usuario y contraseña definidos en el formulario de la izquierda.</p>
                </div>
              )}

            </div>

          </div>

        </main>
      </div>
    </div>
  );
};