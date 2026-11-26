import React, { useState, useEffect, useRef } from "react";
import { api, type Candidate, type Recinto } from "../services/api";

// Compara textos sin importar mayúsculas ni tildes ("Riobamba" == "RIOBAMBA", "Alausí" == "ALAUSI")
const norm = (s?: string) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();

interface RegisterVotosProps {
  user: {
    username: string;
    fullName: string;
    role: string;
    assignedRecintoId?: string;
  };
  onLogout: () => void;
}

export const RegisterVotos: React.FC<RegisterVotosProps> = ({ user, onLogout }) => {
  // Estados geográficos
  const [geography, setGeography] = useState<any[]>([]);
  const [provincias, setProvincias] = useState<string[]>([]);
  const [cantones, setCantones] = useState<string[]>([]);
  const [parroquias, setParroquias] = useState<string[]>([]);
  const [recintos, setRecintos] = useState<Recinto[]>([]);

  // Selección activa
  const [selectedProvincia, setSelectedProvincia] = useState("");
  const [selectedCanton, setSelectedCanton] = useState("");
  const [selectedParroquia, setSelectedParroquia] = useState("");
  const [selectedRecintoId, setSelectedRecintoId] = useState("");
  const [mesaNumber, setMesaNumber] = useState<number | "">("");
  const [gender, setGender] = useState("Femenina");
  const [dignity, setDignity] = useState("prefecto");
  // Recinto asignado al usuario (un usuario por recinto, sin mesa fija)
  const [assignedRecinto, setAssignedRecinto] = useState<Recinto | null>(null);

  // Candidatos y votos
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [votes, setVotes] = useState<Record<string, number>>({});
  const [whiteVotes, setWhiteVotes] = useState<number>(0);
  const [nullVotes, setNullVotes] = useState<number>(0);
  const [totalVoters, setTotalVoters] = useState<number>(0);

  // Foto y carga - Acta Pública
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [compressing, setCompressing] = useState(false);
  const [compressedBlobs, setCompressedBlobs] = useState<Blob[]>([]);

  // Foto y carga - Acta Personal (Copia del Delegado)
  const [personalPhotoPreviews, setPersonalPhotoPreviews] = useState<string[]>([]);
  const [personalCompressing, setPersonalCompressing] = useState(false);
  const [personalCompressedBlobs, setPersonalCompressedBlobs] = useState<Blob[]>([]);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const isSubmittingRef = useRef(false);
  const pendingUploadRef = useRef<{
    key: string;
    actaId: string;
    publicUploaded: number;
    personalUploaded: number;
  } | null>(null);

  // Cargar geografía al inicio
  useEffect(() => {
    const fetchGeo = async () => {
      try {
        const geo = await api.getGeography();
        setGeography(geo);
        setProvincias(geo.map((g: any) => g.provincia));
      } catch (err) {
        console.error("Error al cargar geografía:", err);
      }
    };
    fetchGeo();
  }, []);

  // Si el usuario tiene un recinto asignado, seleccionarlo automáticamente
  // Ya no depende de que coincida con la geografía: provincia, cantón y parroquia
  // se toman directamente del recinto, así los candidatos cargan siempre.
  useEffect(() => {
    if (!user.assignedRecintoId) return;
    const loadAssignedRecinto = async () => {
      try {
        const rec = await api.getRecinto(user.assignedRecintoId!);
        setAssignedRecinto(rec);
        setSelectedProvincia(rec.provincia);
        setSelectedCanton(rec.canton);
        setSelectedParroquia(rec.parroquia);
        setSelectedRecintoId(rec.id);
        setRecintos([rec]);
      } catch (err) {
        console.error("Error cargando recinto asignado:", err);
        setMessage({ type: "error", text: "No se pudo cargar el recinto asignado a su usuario" });
      }
    };
    loadAssignedRecinto();
  }, [user.assignedRecintoId]);

  // Recinto activo (asignado o elegido en los selectores)
  const currentRecinto: any = recintos.find(r => r.id === selectedRecintoId) || assignedRecinto;

  // Lista de JRV del recinto según sus mesas femeninas / masculinas / mixtas
  const mesasDisponibles: { value: string; label: string; numero: number; genero: string }[] = [];
  if (currentRecinto) {
    const grupos: [string, number][] = [
      ["Femenina", Number(currentRecinto.total_mesas_femeninas) || 0],
      ["Masculina", Number(currentRecinto.total_mesas_masculinas) || 0],
      ["Mixta", Number(currentRecinto.total_mesas_mixtas) || 0],
    ];
    grupos.forEach(([genero, total]) => {
      for (let n = 1; n <= total; n++) {
        mesasDisponibles.push({ value: `${n}|${genero}`, label: `JRV ${n} ${genero}`, numero: n, genero });
      }
    });
  }
  const mesaSeleccionada = mesaNumber ? `${mesaNumber}|${gender}` : "";

  // Manejadores de geografía
  const handleProvinciaChange = (prov: string) => {
    setSelectedProvincia(prov);
    setSelectedCanton("");
    setSelectedParroquia("");
    setSelectedRecintoId("");
    setRecintos([]);
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
    setSelectedRecintoId("");
    setRecintos([]);
    const provData = geography.find(g => g.provincia === selectedProvincia);
    if (provData) {
      const cantData = provData.cantones.find((c: any) => c.name === cant);
      if (cantData) {
        setParroquias(cantData.parroquias);
      }
    }
  };

  const handleParroquiaChange = async (parr: string) => {
    setSelectedParroquia(parr);
    setSelectedRecintoId("");
    try {
      const list = await api.getRecintos(selectedProvincia, selectedCanton, parr);
      setRecintos(list);
    } catch (err) {
      console.error(err);
    }
  };

  // Cargar candidatos cuando cambia la geografía o la dignidad
  useEffect(() => {
    const fetchCandidates = async () => {
      if (!dignity) return;
      try {
        // Prefectos: solo provincia (sin cantón ni parroquia)
        // Alcalde, concejales: solo cantón
        // Vocal junta parroquial: cantón y parroquia
        const canton =
          dignity === "prefecto" ? undefined : selectedCanton || undefined;
        const parroquia =
          dignity === "junta_parroquial" ? selectedParroquia || undefined : undefined;

        // Si se necesita cantón y aún no está cargado, esperar
        if (dignity !== "prefecto" && !canton) {
          setCandidates([]);
          return;
        }

        let cands = await api.getCandidates(dignity, canton, parroquia);

        // Respaldo: si no llegó nada (p. ej. candidato guardado como "Riobamba" y recinto como "RIOBAMBA"),
        // traer todos los de la dignidad y filtrar aquí sin importar mayúsculas ni tildes.
        if (cands.length === 0 && (canton || parroquia)) {
          const todos = await api.getCandidates(dignity, undefined, undefined);
          cands = todos.filter((c: any) =>
            (!canton || norm(c.canton) === norm(canton)) &&
            (!parroquia || norm(c.parroquia) === norm(parroquia))
          );
        }
        setCandidates(cands);

        const initialVotes: Record<string, number> = {};
        cands.forEach(c => {
          initialVotes[c.id] = 0;
        });
        setVotes(initialVotes);
      } catch (err) {
        console.error("Error cargando candidatos:", err);
      }
    };
    fetchCandidates();
  }, [dignity, selectedCanton, selectedParroquia]);

  // Modificar votos individuales
  const handleVoteChange = (candidateId: string, val: string) => {
    const parsed = parseInt(val) || 0;
    setVotes(prev => ({
      ...prev,
      [candidateId]: parsed
    }));
  };

  // Sumar todos los votos ingresados (candidatos + blancos + nulos)
  const calculateSum = () => {
    const candidateSum = Object.values(votes).reduce((a, b) => a + b, 0);
    return candidateSum + whiteVotes + nullVotes;
  };

  const isMathCorrect = () => {
    return calculateSum() === totalVoters;
  };

  // Compresión de imagen usando HTML5 Canvas (Client-side)
  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCompressing(true);
    try {
      const compressed = await compressImageOnClient(file);
      pendingUploadRef.current = null;
      setPhotoPreviews(prev => {
        prev.forEach(url => URL.revokeObjectURL(url));
        return [URL.createObjectURL(file)];
      });
      setCompressedBlobs([compressed]);
    } catch (err) {
      console.error("Error comprimiendo imagen pública:", err);
      setMessage({ type: "error", text: "No se pudo procesar la imagen" });
    } finally {
      setCompressing(false);
    }
    e.target.value = "";
  };

  const handlePersonalPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPersonalCompressing(true);
    try {
      const compressed = await compressImageOnClient(file);
      pendingUploadRef.current = null;
      setPersonalPhotoPreviews(prev => {
        prev.forEach(url => URL.revokeObjectURL(url));
        return [URL.createObjectURL(file)];
      });
      setPersonalCompressedBlobs([compressed]);
    } catch (err) {
      console.error("Error comprimiendo imagen personal:", err);
      setMessage({ type: "error", text: "No se pudo procesar la imagen de copia personal" });
    } finally {
      setPersonalCompressing(false);
    }
    e.target.value = "";
  };

  const handleRemovePhoto = (index: number) => {
    pendingUploadRef.current = null;
    setPhotoPreviews(prev => {
      if (prev[index]) URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
    setCompressedBlobs(prev => prev.filter((_, i) => i !== index));
  };

  const handleRemovePersonalPhoto = (index: number) => {
    pendingUploadRef.current = null;
    setPersonalPhotoPreviews(prev => {
      if (prev[index]) URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
    setPersonalCompressedBlobs(prev => prev.filter((_, i) => i !== index));
  };

  const compressImageOnClient = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH = 1200; // Resolución óptima para lectura de actas
          let width = img.width;
          let height = img.height;

          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error("Error al obtener blob del canvas"));
              }
            },
            "image/jpeg",
            0.6 // Reducción a calidad del 60%
          );
        };
        img.onerror = (e) => reject(e);
      };
      reader.onerror = (e) => reject(e);
    });
  };

  // Guardar acta en el servidor
  const handleSaveActa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current || loading) return;
    setMessage(null);

    // Validaciones
    if (!selectedRecintoId) return setMessage({ type: "error", text: "Seleccione el recinto" });
    if (!mesaNumber) return setMessage({ type: "error", text: "Seleccione la mesa (JRV) que va a digitar" });
    if (!window.confirm(`Va a registrar ${dignity.replace(/_/g, " ").toUpperCase()} de la JRV ${mesaNumber} ${gender}. ¿Es correcto?`)) return;
    if (!totalVoters) return setMessage({ type: "error", text: "Ingrese el total de firmantes" });
    if (compressedBlobs.length === 0) return setMessage({ type: "error", text: "Debe capturar al menos una foto del acta pública oficial" });
    if (personalCompressedBlobs.length === 0) return setMessage({ type: "error", text: "Debe capturar al menos una foto de su copia personal" });

    if (!isMathCorrect()) {
      if (!window.confirm("¡Alerta! La suma de los votos no coincide con el total de sufragantes en el padrón. ¿Desea ingresar el acta con esta novedad?")) {
        return;
      }
    }

    isSubmittingRef.current = true;
    setLoading(true);
    const attemptKey = `${selectedRecintoId}:${mesaNumber}:${gender}:${dignity}:${compressedBlobs.length}:${personalCompressedBlobs.length}`;

    try {
      let actaId =
        pendingUploadRef.current && pendingUploadRef.current.key === attemptKey
          ? pendingUploadRef.current.actaId
          : "";

      // 1. Crear o actualizar el acta con los votos (idempotente ante reintentos de red móvil)
      if (!actaId) {
        const registeredActa = await api.createActa({
          recinto_id: selectedRecintoId,
          mesa_number: Number(mesaNumber),
          gender,
          dignity,
          votes,
          white_votes: whiteVotes,
          null_votes: nullVotes,
          total_voters: totalVoters
        });
        actaId = registeredActa.id;
        pendingUploadRef.current = {
          key: attemptKey,
          actaId,
          publicUploaded: 0,
          personalUploaded: 0,
        };
      }

      // 2. Subir las fotos del acta oficial pública pendientes secuencialmente
      const startPublic = pendingUploadRef.current?.publicUploaded ?? 0;
      for (let i = startPublic; i < compressedBlobs.length; i++) {
        await api.uploadActaPhoto(actaId, compressedBlobs[i]);
        if (pendingUploadRef.current) {
          pendingUploadRef.current.publicUploaded = i + 1;
        }
      }

      // 3. Subir las fotos de la copia del acta personal pendientes secuencialmente
      const startPersonal = pendingUploadRef.current?.personalUploaded ?? 0;
      for (let i = startPersonal; i < personalCompressedBlobs.length; i++) {
        await api.uploadActaPhotoPersonal(actaId, personalCompressedBlobs[i]);
        if (pendingUploadRef.current) {
          pendingUploadRef.current.personalUploaded = i + 1;
        }
      }

      pendingUploadRef.current = null;
      setMessage({ type: "success", text: "Acta registrada y subidas todas las imágenes con éxito." });

      // Limpiar formulario excepto ubicación para agilizar la siguiente mesa
      setMesaNumber("");
      setVotes(prev => {
        const reset: Record<string, number> = {};
        Object.keys(prev).forEach(k => reset[k] = 0);
        return reset;
      });
      setWhiteVotes(0);
      setNullVotes(0);
      setTotalVoters(0);
      photoPreviews.forEach(url => URL.revokeObjectURL(url));
      personalPhotoPreviews.forEach(url => URL.revokeObjectURL(url));
      setPhotoPreviews([]);
      setCompressedBlobs([]);
      setPersonalPhotoPreviews([]);
      setPersonalCompressedBlobs([]);
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err.message || "Error al registrar el acta. Puede presionar Enviar nuevamente para reintentar."
      });
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
    }
  };

  const currentSum = calculateSum();

  return (
    <div className="mobile-container animate-fade-in">
      {/* Cabecera Móvil */}
      <header
        style={{
          background: "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)",
          color: "white",
          padding: "1rem 1.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "var(--shadow-sm)"
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.15rem", fontWeight: "700" }}>Control Electoral</h1>
          <p style={{ fontSize: "0.75rem", opacity: 0.85 }}>{user.fullName}</p>
        </div>
        <button
          onClick={onLogout}
          style={{
            background: "rgba(255,255,255,0.15)",
            border: "none",
            color: "white",
            padding: "0.4rem 0.8rem",
            borderRadius: "var(--radius-sm)",
            fontSize: "0.8rem",
            fontWeight: "600",
            cursor: "pointer"
          }}
        >
          Salir
        </button>
      </header>

      {/* Formulario */}
      <main style={{ flex: 1, padding: "1rem", overflowY: "auto" }}>
        {message && (
          <div
            className={`badge ${message.type === "success" ? "badge-success" : "badge-danger"}`}
            style={{
              padding: "1rem",
              marginBottom: "1rem",
              width: "100%",
              display: "block",
              textAlign: "center",
              fontSize: "0.9rem",
              borderRadius: "var(--radius-md)",
              textTransform: "none",
              fontWeight: "500"
            }}
          >
            {message.text}
          </div>
        )}

        <form onSubmit={handleSaveActa}>
          {/* UBICACIÓN */}
          <div className="mobile-card">
            <h3 style={{ fontSize: "1rem", marginBottom: "1rem", color: "#1e3a8a", borderBottom: "1px solid #f1f5f9", paddingBottom: "0.5rem" }}>
              1. Ubicación Electoral
            </h3>

            {!user.assignedRecintoId ? (
              <>
                <div className="input-group">
                  <label className="input-label">Provincia</label>
                  <select
                    className="input-field"
                    value={selectedProvincia}
                    onChange={(e) => handleProvinciaChange(e.target.value)}
                  >
                    <option value="">-- Seleccione --</option>
                    {provincias.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                <div className="input-group">
                  <label className="input-label">Cantón</label>
                  <select
                    className="input-field"
                    value={selectedCanton}
                    onChange={(e) => handleCantonChange(e.target.value)}
                    disabled={!selectedProvincia}
                  >
                    <option value="">-- Seleccione --</option>
                    {cantones.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="input-group">
                  <label className="input-label">Parroquia</label>
                  <select
                    className="input-field"
                    value={selectedParroquia}
                    onChange={(e) => handleParroquiaChange(e.target.value)}
                    disabled={!selectedCanton}
                  >
                    <option value="">-- Seleccione --</option>
                    {parroquias.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                <div className="input-group">
                  <label className="input-label">Recinto Electoral</label>
                  <select
                    className="input-field"
                    value={selectedRecintoId}
                    onChange={(e) => setSelectedRecintoId(e.target.value)}
                    disabled={recintos.length === 0}
                  >
                    <option value="">-- Seleccione --</option>
                    {recintos.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              </>
            ) : (
              <div style={{ backgroundColor: "#f8fafc", padding: "0.75rem", borderRadius: "var(--radius-md)", fontSize: "0.85rem", color: "#334155" }}>
                <strong>Recinto Asignado:</strong> {currentRecinto?.name || "Cargando..."}
                <br />
                <strong>Cantón:</strong> {selectedCanton} &nbsp;·&nbsp; <strong>Parroquia:</strong> {selectedParroquia}
              </div>
            )}

            {mesasDisponibles.length > 0 ? (
              // El recinto tiene mesas configuradas: se elige la JRV de una lista (ya trae el género)
              <div className="input-group" style={{ marginTop: "1rem" }}>
                <label className="input-label">Mesa / JRV</label>
                <select
                  className="input-field"
                  value={mesaSeleccionada}
                  onChange={(e) => {
                    if (!e.target.value) { setMesaNumber(""); return; }
                    const [num, gen] = e.target.value.split("|");
                    setMesaNumber(Number(num));
                    setGender(gen);
                  }}
                  style={{ fontWeight: 600 }}
                >
                  <option value="">-- Seleccione la mesa --</option>
                  {["Femenina", "Masculina", "Mixta"].map(g => {
                    const opts = mesasDisponibles.filter(m => m.genero === g);
                    return opts.length > 0 ? (
                      <optgroup key={g} label={`Mesas ${g}s`}>
                        {opts.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </optgroup>
                    ) : null;
                  })}
                </select>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "0.75rem", marginTop: "1rem" }}>
                <div className="input-group">
                  <label className="input-label">Mesa / JRV</label>
                  <input
                    className="input-field"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Ej. 1"
                    value={mesaNumber}
                    onChange={(e) => setMesaNumber(e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">Género</label>
                  <select
                    className="input-field"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                  >
                    <option value="Femenina">Femenina</option>
                    <option value="Masculina">Masculina</option>
                    <option value="Mixta">Mixta</option>
                  </select>
                </div>
              </div>
            )}

            <div className="input-group" style={{ marginTop: "0.5rem" }}>
              <label className="input-label">Dignidad a Digitar</label>
              <select
                className="input-field"
                value={dignity}
                onChange={(e) => setDignity(e.target.value)}
                style={{ fontWeight: "600", borderColor: "var(--primary)" }}
              >
                <option value="prefecto">Prefecto y Viceprefecto</option>
                <option value="alcalde">Alcalde</option>
                <option value="concejal_urbano">Concejales Urbanos</option>
                <option value="concejal_rural">Concejales Rurales</option>
                <option value="junta_parroquial">Vocal Junta Parroquial</option>
              </select>
            </div>
          </div>

          {/* VOTOS CANDIDATOS */}
          <div className="mobile-card">
            <h3 style={{ fontSize: "1rem", marginBottom: "1rem", color: "#1e3a8a", borderBottom: "1px solid #f1f5f9", paddingBottom: "0.5rem" }}>
              2. Votos por Lista / Candidato
            </h3>

            {candidates.length === 0 ? (
              <p style={{ fontSize: "0.9rem", color: "var(--neutral-700)", textAlign: "center", padding: "1rem" }}>
                No hay candidatos registrados para los filtros seleccionados.
              </p>
            ) : (
              candidates.map(cand => (
                <div
                  key={cand.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "1rem",
                    paddingBottom: "0.75rem",
                    borderBottom: "1px solid #f8fafc"
                  }}
                >
                  <div style={{ flex: 1, paddingRight: "1rem" }}>
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      <span
                        style={{
                          backgroundColor: "#1e3a8a",
                          color: "white",
                          padding: "0.1rem 0.4rem",
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                          fontWeight: "700"
                        }}
                      >
                        {cand.list_number}
                      </span>
                      <span style={{ fontSize: "0.9rem", fontWeight: "600" }}>{cand.name}</span>
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "var(--neutral-700)" }}>{cand.party_name}</span>
                  </div>
                  <input
                    className="input-field"
                    type="number"
                    min="0"
                    pattern="[0-9]*"
                    inputMode="numeric"
                    style={{ width: "80px", textAlign: "center", padding: "0.5rem" }}
                    value={votes[cand.id] ?? 0}
                    onChange={(e) => handleVoteChange(cand.id, e.target.value)}
                  />
                </div>
              ))
            )}
          </div>

          {/* BLANCOS, NULOS Y TOTAL */}
          <div className="mobile-card">
            <h3 style={{ fontSize: "1rem", marginBottom: "1rem", color: "#1e3a8a", borderBottom: "1px solid #f1f5f9", paddingBottom: "0.5rem" }}>
              3. Blancos, Nulos y Totales
            </h3>

            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "0.75rem" }}>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label className="input-label">Votos Blancos</label>
                <input
                  className="input-field"
                  type="number"
                  min="0"
                  inputMode="numeric"
                  placeholder="0"
                  value={whiteVotes === 0 ? "" : whiteVotes}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/^0+(?=\d)/, "");
                    setWhiteVotes(clean === "" ? 0 : Math.max(0, parseInt(clean, 10) || 0));
                  }}
                />
              </div>

              <div className="input-group" style={{ marginBottom: 0 }}>
                <label className="input-label">Votos Nulos</label>
                <input
                  className="input-field"
                  type="number"
                  min="0"
                  inputMode="numeric"
                  placeholder="0"
                  value={nullVotes === 0 ? "" : nullVotes}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/^0+(?=\d)/, "");
                    setNullVotes(clean === "" ? 0 : Math.max(0, parseInt(clean, 10) || 0));
                  }}
                />
              </div>
            </div>

            <div className="input-group" style={{ marginTop: "1rem" }}>
              <label className="input-label"><strong>Total Sufragantes (Padrón)</strong></label>
              <input
                className="input-field"
                type="number"
                min="0"
                placeholder="Total firmas en el padrón"
                value={totalVoters || ""}
                onChange={(e) => setTotalVoters(Number(e.target.value) || 0)}
                style={{ fontSize: "1.1rem", fontWeight: "700", borderColor: "#64748b" }}
              />
            </div>

            {/* Cuadre matemático */}
            <div
              style={{
                marginTop: "1.25rem",
                padding: "0.75rem 1rem",
                borderRadius: "var(--radius-md)",
                backgroundColor: isMathCorrect() ? "rgba(16, 185, 129, 0.1)" : "rgba(244, 63, 94, 0.1)",
                color: isMathCorrect() ? "var(--success)" : "var(--danger)",
                border: `1px solid ${isMathCorrect() ? "rgba(16, 185, 129, 0.3)" : "rgba(244, 63, 94, 0.3)"}`,
                fontSize: "0.85rem",
                fontWeight: "600",
                display: "flex",
                justifyContent: "space-between"
              }}
            >
              <span>Suma Digitada: {currentSum}</span>
              <span>
                {isMathCorrect() ? "✓ CUADRA" : `✗ NO CUADRA (Dif: ${currentSum - totalVoters})`}
              </span>
            </div>
          </div>

          {/* CAPTURA DE FOTO OFICIAL PÚBLICA */}
          <div className="mobile-card">
            <h3 style={{ fontSize: "1rem", marginBottom: "1rem", color: "#1e3a8a", borderBottom: "1px solid #f1f5f9", paddingBottom: "0.5rem" }}>
              4. Fotos del Acta Pública (Pared / CNE)
            </h3>

            {photoPreviews.length > 0 ? (
              <div
                style={{
                  position: "relative",
                  border: "1px solid var(--neutral-200)",
                  borderRadius: "10px",
                  overflow: "hidden",
                  backgroundColor: "#0f172a",
                  maxHeight: "260px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <img
                  src={photoPreviews[0]}
                  alt="Acta Pública capturada"
                  style={{ width: "100%", maxHeight: "260px", objectFit: "contain", display: "block" }}
                />
                <button
                  type="button"
                  onClick={() => handleRemovePhoto(0)}
                  disabled={loading}
                  style={{
                    position: "absolute",
                    top: "8px",
                    right: "8px",
                    backgroundColor: "rgba(244, 63, 94, 0.95)",
                    color: "white",
                    border: "2px solid white",
                    borderRadius: "50%",
                    width: "32px",
                    height: "32px",
                    fontSize: "1.1rem",
                    fontWeight: "bold",
                    lineHeight: 1,
                    cursor: loading ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.35)"
                  }}
                  title="Quitar foto para tomar otra"
                  aria-label="Quitar foto del acta pública"
                >
                  ×
                </button>
              </div>
            ) : (
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label
                  className="btn btn-secondary flex-center"
                  style={{
                    flexDirection: "column",
                    padding: "1.25rem",
                    border: "2px dashed var(--neutral-300)",
                    backgroundColor: "#f8fafc",
                    height: "auto",
                    gap: "0.5rem",
                    cursor: compressing ? "wait" : "pointer"
                  }}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  <span style={{ fontSize: "0.85rem", color: "#475569", fontWeight: "600" }}>
                    📷 Tomar Foto del Acta Pública
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: "none" }}
                    disabled={compressing || loading}
                    onChange={handlePhotoChange}
                  />
                </label>
              </div>
            )}

            {compressing && (
              <p style={{ fontSize: "0.8rem", color: "var(--primary)", textAlign: "center", marginTop: "0.5rem" }}>
                Procesando y comprimiendo imagen pública...
              </p>
            )}
          </div>

          {/* CAPTURA DE FOTO PERSONAL */}
          <div className="mobile-card">
            <h3 style={{ fontSize: "1rem", marginBottom: "1rem", color: "#1e3a8a", borderBottom: "1px solid #f1f5f9", paddingBottom: "0.5rem" }}>
              5. Fotos del Acta Personal (Copia del Delegado)
            </h3>

            {personalPhotoPreviews.length > 0 ? (
              <div
                style={{
                  position: "relative",
                  border: "1px solid var(--neutral-200)",
                  borderRadius: "10px",
                  overflow: "hidden",
                  backgroundColor: "#0f172a",
                  maxHeight: "260px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <img
                  src={personalPhotoPreviews[0]}
                  alt="Acta Personal capturada"
                  style={{ width: "100%", maxHeight: "260px", objectFit: "contain", display: "block" }}
                />
                <button
                  type="button"
                  onClick={() => handleRemovePersonalPhoto(0)}
                  disabled={loading}
                  style={{
                    position: "absolute",
                    top: "8px",
                    right: "8px",
                    backgroundColor: "rgba(244, 63, 94, 0.95)",
                    color: "white",
                    border: "2px solid white",
                    borderRadius: "50%",
                    width: "32px",
                    height: "32px",
                    fontSize: "1.1rem",
                    fontWeight: "bold",
                    lineHeight: 1,
                    cursor: loading ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.35)"
                  }}
                  title="Quitar foto para tomar otra"
                  aria-label="Quitar foto del acta personal"
                >
                  ×
                </button>
              </div>
            ) : (
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label
                  className="btn btn-secondary flex-center"
                  style={{
                    flexDirection: "column",
                    padding: "1.25rem",
                    border: "2px dashed var(--neutral-300)",
                    backgroundColor: "#f8fafc",
                    height: "auto",
                    gap: "0.5rem",
                    cursor: personalCompressing ? "wait" : "pointer"
                  }}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  <span style={{ fontSize: "0.85rem", color: "#475569", fontWeight: "600" }}>
                    📷 Tomar Foto del Acta Personal
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: "none" }}
                    disabled={personalCompressing || loading}
                    onChange={handlePersonalPhotoChange}
                  />
                </label>
              </div>
            )}

            {personalCompressing && (
              <p style={{ fontSize: "0.8rem", color: "var(--primary)", textAlign: "center", marginTop: "0.5rem" }}>
                Procesando y comprimiendo imagen personal...
              </p>
            )}
          </div>

          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading || compressing || personalCompressing}
            style={{ fontSize: "1.1rem", padding: "1rem", marginBottom: "2rem" }}
          >
            {loading ? (
              <div className="flex-center" style={{ gap: "0.5rem" }}>
                <div className="spinner" style={{ width: "20px", height: "20px", borderWidth: "2px" }} />
                Subiendo Acta y Copias ({compressedBlobs.length + personalCompressedBlobs.length} fotos)...
              </div>
            ) : (
              "Enviar Acta de Mesa"
            )}
          </button>
        </form>
      </main>
    </div>
  );
};