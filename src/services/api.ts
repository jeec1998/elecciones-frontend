function resolveApiBaseUrl(): string {
  const raw = (
    import.meta.env.BACKEND_URL ||
    import.meta.env.VITE_API_URL ||
    "https://controlelectoral2026.lat/api"
  ).trim();

  let normalized = raw.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(normalized)) {
    const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(normalized);
    normalized = `${isLocal ? "http" : "https"}://${normalized}`;
  }
  if (!/\/api$/i.test(normalized)) {
    normalized = `${normalized}/api`;
  }
  return normalized;
}

export const API_BASE_URL = resolveApiBaseUrl();
// Origen del servidor sin "/api" (para armar URLs de fotos: /api/uploads/...)
export const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "");

async function parseErrorDetail(response: Response, fallback: string): Promise<string> {
  const err = await response.json().catch(() => null);
  if (err && typeof err.detail === "string" && err.detail.trim()) {
    return err.detail;
  }
  return fallback;
}

// Soporta tanto URLs absolutas (Cloudflare R2, data:, blob:) como rutas relativas (/api/uploads/...)
export function resolvePhotoUrl(url: string): string {
  if (!url) return "";
  if (/^(https?:\/\/|data:|blob:)/i.test(url)) {
    return url;
  }
  return `${API_ORIGIN}${url}`;
}

function getHeaders() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
  };
}

export interface Candidate {
  id: string;
  name: string;
  list_number: string;
  party_name: string;
  dignity: string;
  canton?: string;
  parroquia?: string;
  photo_url?: string;
}

export interface Recinto {
  id: string;
  provincia: string;
  canton: string;
  parroquia: string;
  name: string;
  total_mesas_femeninas: number;
  total_mesas_masculinas: number;
  total_mesas_mixtas: number;
}

export interface Acta {
  id: string;
  recinto_id: string;
  mesa_number: number;
  gender: string;
  dignity: string;
  votes: Record<string, number>;
  white_votes: number;
  null_votes: number;
  total_voters: number;
  photo_urls?: string[];
  photo_personal_urls?: string[];
  status: "Ingresada" | "En Verificación" | "Validada" | "Con Novedad";
  novedad_comment?: string;
  entered_by: string;
  verified_by?: string;
  created_at: string;
  updated_at: string;
}

// --- OFF-LINE MOCK DATABASE SYSTEM ---

const MOCK_ACTA_PHOTO = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='1200' viewBox='0 0 800 1200'><rect width='100%25' height='100%25' fill='%23f8fafc'/><rect x='40' y='40' width='720' height='1120' rx='10' fill='none' stroke='%23cbd5e1' stroke-width='4'/><line x1='80' y1='120' x2='720' y2='120' stroke='%23cbd5e1' stroke-width='2'/><text x='400' y='250' font-family='sans-serif' font-size='32' font-weight='bold' fill='%23334155' text-anchor='middle'>ACTA ELECTORAL (PUBLICA)</text><text x='400' y='300' font-family='sans-serif' font-size='20' fill='%2364748b' text-anchor='middle'>MODO DEMO OFFLINE</text><line x1='100' y1='450' x2='700' y2='450' stroke='%23e2e8f0' stroke-width='2'/><circle cx='250' cy='950' r='40' fill='none' stroke='%2394a3b8' stroke-width='2'/><text x='250' y='1030' font-family='sans-serif' font-size='16' fill='%2364748b' text-anchor='middle'>Firma Presidente</text><circle cx='550' cy='950' r='40' fill='none' stroke='%2394a3b8' stroke-width='2'/><text x='550' y='1030' font-family='sans-serif' font-size='16' fill='%2364748b' text-anchor='middle'>Firma Delegado</text></svg>";

const MOCK_ACTA_PERSONAL_PHOTO = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='1200' viewBox='0 0 800 1200'><rect width='100%25' height='100%25' fill='%23fffbeb'/><rect x='40' y='40' width='720' height='1120' rx='10' fill='none' stroke='%23fcd34d' stroke-width='4'/><line x1='80' y1='120' x2='720' y2='120' stroke='%23fcd34d' stroke-width='2'/><text x='400' y='250' font-family='sans-serif' font-size='32' font-weight='bold' fill='%2378350f' text-anchor='middle'>COPIA DE ACTA PERSONAL</text><text x='400' y='300' font-family='sans-serif' font-size='20' fill='%23b45309' text-anchor='middle'>MODO DEMO OFFLINE</text><line x1='100' y1='450' x2='700' y2='450' stroke='%23fde68a' stroke-width='2'/><circle cx='250' cy='950' r='40' fill='none' stroke='%23b45309' stroke-width='2'/><text x='250' y='1030' font-family='sans-serif' font-size='16' fill='%23b45309' text-anchor='middle'>Firma Presidente</text><circle cx='550' cy='950' r='40' fill='none' stroke='%23b45309' stroke-width='2'/><text x='550' y='1030' font-family='sans-serif' font-size='16' fill='%23b45309' text-anchor='middle'>Firma Delegado</text></svg>";

const MOCK_CANDIDATE_PHOTO = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='150' height='150' viewBox='0 0 150 150'><rect width='100%25' height='100%25' fill='%231e293b'/><circle cx='75' cy='55' r='25' fill='%2364748b'/><path d='M35 120c0-20 16-35 40-35s40 15 40 35z' fill='%2364748b'/><text x='50%25' y='140' font-family='sans-serif' font-size='10' fill='%2394a3b8' text-anchor='middle'>Demo Offline</text></svg>";

// El modo demo offline solo funciona en desarrollo (npm run dev), nunca en producción
const isOffline = () => import.meta.env.DEV && localStorage.getItem("offline_mode") === "true";

function initOfflineDB() {
  if (localStorage.getItem("offline_initialized") === "true") return;

  const mockUsers = [
    { username: "superadmin", role: "admin", full_name: "Super Administrador (Chimborazo)", is_active: true },
    { username: "digitador1", role: "digitador", full_name: "Juan Guamán (Delegado Colegio Maldonado)", assigned_recinto_id: "recinto_maldonado", is_active: true },
    { username: "coord1", role: "coordinator", full_name: "Martha Vizuete (Coordinadora Colegio Maldonado)", assigned_recinto_id: "recinto_maldonado", is_active: true },
    { username: "tv", role: "viewer", full_name: "Visualizador TV (Chimborazo)", is_active: true }
  ];

  const mockRecintos: Recinto[] = [
    { id: "recinto_maldonado", provincia: "Chimborazo", canton: "Riobamba", parroquia: "Maldonado", name: "Colegio Nacional Centenario Maldonado", total_mesas_femeninas: 6, total_mesas_masculinas: 6, total_mesas_mixtas: 0 },
    { id: "recinto_ue_riobamba", provincia: "Chimborazo", canton: "Riobamba", parroquia: "Lizarzaburu", name: "Unidad Educativa Riobamba", total_mesas_femeninas: 5, total_mesas_masculinas: 5, total_mesas_mixtas: 0 },
    { id: "recinto_san_luis", provincia: "Chimborazo", canton: "Riobamba", parroquia: "San Luis", name: "Unidad Educativa San Luis", total_mesas_femeninas: 3, total_mesas_masculinas: 3, total_mesas_mixtas: 0 },
    { id: "recinto_guano_apg", provincia: "Chimborazo", canton: "Guano", parroquia: "Guano", name: "Colegio Alfredo Pérez Guerrero", total_mesas_femeninas: 4, total_mesas_masculinas: 4, total_mesas_mixtas: 0 },
    { id: "recinto_colta_th", provincia: "Chimborazo", canton: "Colta", parroquia: "Cajabamba", name: "Unidad Educativa Tomás de Heres", total_mesas_femeninas: 3, total_mesas_masculinas: 3, total_mesas_mixtas: 0 }
  ];

  const mockCandidates: Candidate[] = [
    { id: "cand_prefecto_ch_pk", name: "Hermel Tayupanda", list_number: "18", party_name: "Pachakutik", dignity: "prefecto", photo_url: MOCK_CANDIDATE_PHOTO },
    { id: "cand_prefecto_ch_rc", name: "Juan Carlos León", list_number: "5", party_name: "Revolución Ciudadana", dignity: "prefecto", photo_url: MOCK_CANDIDATE_PHOTO },
    { id: "cand_prefecto_ch_id", name: "Candidato Prefecto ID", list_number: "12", party_name: "Izquierda Democrática", dignity: "prefecto", photo_url: MOCK_CANDIDATE_PHOTO },

    { id: "cand_alcalde_rio_ve", name: "John Vinueza", list_number: "61-20", party_name: "Alianza Vecinos", dignity: "alcalde", canton: "Riobamba", photo_url: MOCK_CANDIDATE_PHOTO },
    { id: "cand_alcalde_rio_pk", name: "Marco Murillo", list_number: "18", party_name: "Pachakutik", dignity: "alcalde", canton: "Riobamba", photo_url: MOCK_CANDIDATE_PHOTO },
    { id: "cand_alcalde_rio_rc", name: "Doryan Jara", list_number: "5", party_name: "Revolución Ciudadana", dignity: "alcalde", canton: "Riobamba", photo_url: MOCK_CANDIDATE_PHOTO },

    { id: "cand_concejal_maldonado_rc", name: "Candidato Concejal RC (Maldonado)", list_number: "5", party_name: "Revolución Ciudadana", dignity: "concejal_urbano", canton: "Riobamba", parroquia: "Maldonado", photo_url: MOCK_CANDIDATE_PHOTO },
    { id: "cand_concejal_maldonado_ve", name: "Candidato Concejal Vecinos (Maldonado)", list_number: "61-20", party_name: "Alianza Vecinos", dignity: "concejal_urbano", canton: "Riobamba", parroquia: "Maldonado", photo_url: MOCK_CANDIDATE_PHOTO },

    { id: "cand_junta_sanluis_pk", name: "Vocal Parroquial PK (San Luis)", list_number: "18", party_name: "Pachakutik", dignity: "junta_parroquial", canton: "Riobamba", parroquia: "San Luis", photo_url: MOCK_CANDIDATE_PHOTO },
    { id: "cand_junta_sanluis_rc", name: "Vocal Parroquial RC (San Luis)", list_number: "5", party_name: "Revolución Ciudadana", dignity: "junta_parroquial", canton: "Riobamba", parroquia: "San Luis", photo_url: MOCK_CANDIDATE_PHOTO },

    { id: "cand_alcalde_gua_pk", name: "Alfonso Villarroel", list_number: "18", party_name: "Pachakutik", dignity: "alcalde", canton: "Guano", photo_url: MOCK_CANDIDATE_PHOTO },
    { id: "cand_alcalde_gua_rc", name: "Valeria Silva", list_number: "5", party_name: "Revolución Ciudadana", dignity: "alcalde", canton: "Guano", photo_url: MOCK_CANDIDATE_PHOTO },

    { id: "cand_alcalde_col_pk", name: "Simón Bolívar Gualán", list_number: "18", party_name: "Pachakutik", dignity: "alcalde", canton: "Colta", photo_url: MOCK_CANDIDATE_PHOTO },
    { id: "cand_alcalde_col_rc", name: "María Chimbo", list_number: "5", party_name: "Revolución Ciudadana", dignity: "alcalde", canton: "Colta", photo_url: MOCK_CANDIDATE_PHOTO }
  ];

  // Generación de actas simuladas iniciales
  const mockActas: Acta[] = [];
  const nowStr = new Date().toISOString();

  let pseudoRandom = 42;
  const nextRandom = () => {
    pseudoRandom = (pseudoRandom * 9301 + 49297) % 233280;
    return pseudoRandom / 233280;
  };

  const candsByDignityCanton: Record<string, string[]> = {
    "prefecto": ["cand_prefecto_ch_pk", "cand_prefecto_ch_rc", "cand_prefecto_ch_id"],
    "alcalde_Riobamba": ["cand_alcalde_rio_ve", "cand_alcalde_rio_pk", "cand_alcalde_rio_rc"],
    "alcalde_Guano": ["cand_alcalde_gua_pk", "cand_alcalde_gua_rc"],
    "alcalde_Colta": ["cand_alcalde_col_pk", "cand_alcalde_col_rc"]
  };

  for (const rec of mockRecintos) {
    const rId = rec.id;
    const canton = rec.canton;

    const genders: {num: number, gen: string}[] = [];
    for (let m = 1; m <= rec.total_mesas_femeninas; m++) genders.push({ num: m, gen: "Femenina" });
    for (let m = 1; m <= rec.total_mesas_masculinas; m++) genders.push({ num: m, gen: "Masculina" });

    for (const { num, gen } of genders) {
      // 1. Prefectos (75% de probabilidad)
      if (nextRandom() < 0.75) {
        const v_pk = Math.floor(40 + nextRandom() * 90);
        const v_rc = Math.floor(35 + nextRandom() * 75);
        const v_id = Math.floor(15 + nextRandom() * 45);
        const white = Math.floor(5 + nextRandom() * 17);
        const null_v = Math.floor(10 + nextRandom() * 25);
        const total = v_pk + v_rc + v_id + white + null_v;

        const randVal = nextRandom();
        let status: "Validada" | "En Verificación" | "Con Novedad" = "En Verificación";
        let verified_by: string | null = null;
        if (randVal < 0.70) {
          status = "Validada";
          verified_by = "coord1";
        } else if (randVal > 0.95) {
          status = "Con Novedad";
          verified_by = "coord1";
        }

        mockActas.push({
          id: `${rId}:${num}:${gen}:prefecto`,
          recinto_id: rId,
          mesa_number: num,
          gender: gen,
          dignity: "prefecto",
          votes: {
            "cand_prefecto_ch_pk": v_pk,
            "cand_prefecto_ch_rc": v_rc,
            "cand_prefecto_ch_id": v_id
          },
          white_votes: white,
          null_votes: null_v,
          total_voters: status !== "Con Novedad" ? total : total - Math.floor(5 + nextRandom() * 15),
          photo_urls: [MOCK_ACTA_PHOTO],
          photo_personal_urls: [MOCK_ACTA_PERSONAL_PHOTO],
          status,
          novedad_comment: status === "Con Novedad" ? "Descuadre en firmas" : undefined,
          entered_by: "digitador1",
          verified_by: verified_by || undefined,
          created_at: nowStr,
          updated_at: nowStr
        });
      }

      // 2. Alcalde (70% de probabilidad)
      if (nextRandom() < 0.70) {
        const cands = candsByDignityCanton[`alcalde_${canton}`] || [];
        if (cands.length > 0) {
          const votes: Record<string, number> = {};
          let votesSum = 0;
          for (const cid of cands) {
            const v = Math.floor(40 + nextRandom() * 100);
            votes[cid] = v;
            votesSum += v;
          }
          const white = Math.floor(5 + nextRandom() * 15);
          const null_v = Math.floor(8 + nextRandom() * 20);
          const total = votesSum + white + null_v;

          const randVal = nextRandom();
          let status: "Validada" | "En Verificación" | "Con Novedad" = "En Verificación";
          let verified_by: string | null = null;
          if (randVal < 0.75) {
            status = "Validada";
            verified_by = "coord1";
          } else if (randVal > 0.95) {
            status = "Con Novedad";
            verified_by = "coord1";
          }

          mockActas.push({
            id: `${rId}:${num}:${gen}:alcalde`,
            recinto_id: rId,
            mesa_number: num,
            gender: gen,
            dignity: "alcalde",
            votes,
            white_votes: white,
            null_votes: null_v,
            total_voters: status !== "Con Novedad" ? total : total - Math.floor(5 + nextRandom() * 10),
            photo_urls: [MOCK_ACTA_PHOTO],
            photo_personal_urls: [MOCK_ACTA_PERSONAL_PHOTO],
            status,
            novedad_comment: status === "Con Novedad" ? "Votos nulos inconsistentes" : undefined,
            entered_by: "digitador1",
            verified_by: verified_by || undefined,
            created_at: nowStr,
            updated_at: nowStr
          });
        }
      }
    }
  }

  localStorage.setItem("electoral_offline_users", JSON.stringify(mockUsers));
  localStorage.setItem("electoral_offline_recintos", JSON.stringify(mockRecintos));
  localStorage.setItem("electoral_offline_candidates", JSON.stringify(mockCandidates));
  localStorage.setItem("electoral_offline_actas", JSON.stringify(mockActas));
  localStorage.setItem("offline_initialized", "true");
}

// Getters y Setters para base de datos local
const getLocalUsers = () => JSON.parse(localStorage.getItem("electoral_offline_users") || "[]");
const getLocalRecintos = (): Recinto[] => JSON.parse(localStorage.getItem("electoral_offline_recintos") || "[]");
const saveLocalRecintos = (data: Recinto[]) => localStorage.setItem("electoral_offline_recintos", JSON.stringify(data));
const getLocalCandidates = (): Candidate[] => JSON.parse(localStorage.getItem("electoral_offline_candidates") || "[]");
const saveLocalCandidates = (data: Candidate[]) => localStorage.setItem("electoral_offline_candidates", JSON.stringify(data));
const getLocalActas = (): Acta[] => JSON.parse(localStorage.getItem("electoral_offline_actas") || "[]");
const saveLocalActas = (data: Acta[]) => localStorage.setItem("electoral_offline_actas", JSON.stringify(data));

// --- API METHODS INTERCEPTORS ---

export const api = {
  // Auth
  async login(username: string, password: string) {
    if (isOffline()) {
      initOfflineDB();
      await new Promise(resolve => setTimeout(resolve, 300));

      const users = getLocalUsers();
      const user = users.find((u: any) => u.username === username);

      const credentials: Record<string, string> = {
        superadmin: "superadmin123",
        digitador1: "digitador123",
        coord1: "coord123",
        tv: "2026"
      };

      if (!user || credentials[username] !== password) {
        throw new Error("Usuario o contraseña incorrectos");
      }

      if (!user.is_active) {
        throw new Error("Usuario inactivo");
      }

      return {
        access_token: "mock-offline-token-" + username,
        token_type: "bearer",
        role: user.role,
        full_name: user.full_name,
        assigned_recinto_id: user.assigned_recinto_id
      };
    }

    const response = await fetch(`${API_BASE_URL}/auth/login-json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) {
      throw new Error(await parseErrorDetail(response, "Error de credenciales"));
    }
    return response.json();
  },

  async registerUser(data: {
    username: string;
    password: string;
    full_name: string;
    role: string;
    assigned_recinto_id: string | null;
    assigned_mesa: number | null;
    assigned_gender: string | null;
  }) {
    if (isOffline()) {
      initOfflineDB();
      const users = getLocalUsers();
      users.push({
        username: data.username,
        role: data.role,
        full_name: data.full_name,
        assigned_recinto_id: data.assigned_recinto_id || undefined,
        is_active: true,
      });
      localStorage.setItem("electoral_offline_users", JSON.stringify(users));
      return { username: data.username, role: data.role, full_name: data.full_name };
    }

    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(await parseErrorDetail(response, "Error al registrar el usuario"));
    }
    return response.json();
  },

  // Elections Configuration
  async getGeography() {
    if (isOffline()) {
      initOfflineDB();
      const recintos = getLocalRecintos();

      const structure: Record<string, Record<string, Set<string>>> = {};

      for (const r of recintos) {
        if (!structure[r.provincia]) structure[r.provincia] = {};
        if (!structure[r.provincia][r.canton]) structure[r.provincia][r.canton] = new Set();
        structure[r.provincia][r.canton].add(r.parroquia);
      }

      return Object.keys(structure).map(prov => ({
        provincia: prov,
        cantones: Object.keys(structure[prov]).map(cant => ({
          name: cant,
          parroquias: Array.from(structure[prov][cant])
        }))
      }));
    }

    const response = await fetch(`${API_BASE_URL}/elections/geography`, {
      headers: getHeaders(),
    });
    if (!response.ok) {
      throw new Error(await parseErrorDetail(response, "Error al obtener la geografía electoral"));
    }
    return response.json();
  },

  async getRecintos(provincia?: string, canton?: string, parroquia?: string): Promise<Recinto[]> {
    if (isOffline()) {
      initOfflineDB();
      let recintos = getLocalRecintos();
      if (provincia) recintos = recintos.filter(r => r.provincia === provincia);
      if (canton) recintos = recintos.filter(r => r.canton === canton);
      if (parroquia) recintos = recintos.filter(r => r.parroquia === parroquia);
      return recintos;
    }

    const params = new URLSearchParams();
    if (provincia) params.append("provincia", provincia);
    if (canton) params.append("canton", canton);
    if (parroquia) params.append("parroquia", parroquia);

    const response = await fetch(`${API_BASE_URL}/elections/recintos?${params}`, {
      headers: getHeaders(),
    });
    if (!response.ok) {
      throw new Error(await parseErrorDetail(response, "Error al obtener los recintos"));
    }
    return response.json();
  },

  async getRecinto(recintoId: string): Promise<Recinto> {
    if (isOffline()) {
      initOfflineDB();
      const recintos = getLocalRecintos();
      const rec = recintos.find(r => r.id === recintoId);
      if (!rec) throw new Error("No se pudo obtener la información del recinto");
      return rec;
    }

    const response = await fetch(`${API_BASE_URL}/elections/recintos/${encodeURIComponent(recintoId)}`, {
      headers: getHeaders(),
    });
    if (!response.ok) {
      throw new Error(await parseErrorDetail(response, "No se pudo obtener la información del recinto"));
    }
    return response.json();
  },

  async getCandidates(dignity?: string, canton?: string, parroquia?: string): Promise<Candidate[]> {
    if (isOffline()) {
      initOfflineDB();
      let candidates = getLocalCandidates();
      if (dignity) candidates = candidates.filter(c => c.dignity === dignity);
      if (canton) candidates = candidates.filter(c => c.canton === canton || !c.canton);
      if (parroquia) candidates = candidates.filter(c => c.parroquia === parroquia || !c.parroquia);
      return candidates;
    }

    const params = new URLSearchParams();
    if (dignity) params.append("dignity", dignity);
    if (canton) params.append("canton", canton);
    if (parroquia) params.append("parroquia", parroquia);

    const response = await fetch(`${API_BASE_URL}/elections/candidates?${params}`, {
      headers: getHeaders(),
    });
    if (!response.ok) {
      throw new Error(await parseErrorDetail(response, "Error al obtener los candidatos"));
    }
    return response.json();
  },

  async createRecinto(data: {
    provincia: string;
    canton: string;
    parroquia: string;
    name: string;
    total_mesas_femeninas: number;
    total_mesas_masculinas: number;
    total_mesas_mixtas: number;
  }): Promise<Recinto> {
    if (isOffline()) {
      initOfflineDB();
      const recintos = getLocalRecintos();
      const id = "recinto_" + Date.now();
      const newRecinto: Recinto = { id, ...data };
      recintos.push(newRecinto);
      saveLocalRecintos(recintos);
      return newRecinto;
    }

    const response = await fetch(`${API_BASE_URL}/elections/recintos`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(await parseErrorDetail(response, "Error al crear el recinto"));
    }
    return response.json();
  },

  async createCandidate(data: {
    name: string;
    list_number: string;
    party_name: string;
    dignity: string;
    canton?: string;
    parroquia?: string;
    photo_url?: string;
  }): Promise<Candidate> {
    if (isOffline()) {
      initOfflineDB();
      const candidates = getLocalCandidates();
      const id = "cand_" + Date.now();
      const newCandidate: Candidate = { id, ...data };
      candidates.push(newCandidate);
      saveLocalCandidates(candidates);
      return newCandidate;
    }

    const response = await fetch(`${API_BASE_URL}/elections/candidates`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(await parseErrorDetail(response, "Error al registrar el candidato"));
    }
    return response.json();
  },

  async updateRecinto(recintoId: string, data: {
    provincia: string;
    canton: string;
    parroquia: string;
    name: string;
    total_mesas_femeninas: number;
    total_mesas_masculinas: number;
    total_mesas_mixtas: number;
  }): Promise<Recinto> {
    if (isOffline()) {
      initOfflineDB();
      const recintos = getLocalRecintos();
      const idx = recintos.findIndex(r => r.id === recintoId);
      if (idx === -1) throw new Error("Error al actualizar el recinto");
      const updated = { ...recintos[idx], ...data };
      recintos[idx] = updated;
      saveLocalRecintos(recintos);
      return updated;
    }

    const response = await fetch(`${API_BASE_URL}/elections/recintos/${encodeURIComponent(recintoId)}`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(await parseErrorDetail(response, "Error al actualizar el recinto"));
    }
    return response.json();
  },

  async deleteRecinto(recintoId: string): Promise<void> {
    if (isOffline()) {
      initOfflineDB();
      let recintos = getLocalRecintos();
      recintos = recintos.filter(r => r.id !== recintoId);
      saveLocalRecintos(recintos);

      // Borrar actas asociadas
      let actas = getLocalActas();
      actas = actas.filter(a => a.recinto_id !== recintoId);
      saveLocalActas(actas);
      return;
    }

    const response = await fetch(`${API_BASE_URL}/elections/recintos/${encodeURIComponent(recintoId)}`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    if (!response.ok) {
      throw new Error(await parseErrorDetail(response, "Error al eliminar el recinto"));
    }
  },

  async updateCandidate(candidateId: string, data: {
    name: string;
    list_number: string;
    party_name: string;
    dignity: string;
    canton?: string;
    parroquia?: string;
    photo_url?: string;
  }): Promise<Candidate> {
    if (isOffline()) {
      initOfflineDB();
      const candidates = getLocalCandidates();
      const idx = candidates.findIndex(c => c.id === candidateId);
      if (idx === -1) throw new Error("Error al actualizar el candidato");
      const updated = { ...candidates[idx], ...data };
      candidates[idx] = updated;
      saveLocalCandidates(candidates);
      return updated;
    }

    const response = await fetch(`${API_BASE_URL}/elections/candidates/${encodeURIComponent(candidateId)}`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(await parseErrorDetail(response, "Error al actualizar el candidato"));
    }
    return response.json();
  },

  async deleteCandidate(candidateId: string): Promise<void> {
    if (isOffline()) {
      initOfflineDB();
      let candidates = getLocalCandidates();
      candidates = candidates.filter(c => c.id !== candidateId);
      saveLocalCandidates(candidates);
      return;
    }

    const response = await fetch(`${API_BASE_URL}/elections/candidates/${encodeURIComponent(candidateId)}`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    if (!response.ok) {
      throw new Error(await parseErrorDetail(response, "Error al eliminar el candidato"));
    }
  },

  // Votes Entry
  async createActa(data: {
    recinto_id: string;
    mesa_number: number;
    gender: string;
    dignity: string;
    votes: Record<string, number>;
    white_votes: number;
    null_votes: number;
    total_voters: number;
  }): Promise<Acta> {
    if (isOffline()) {
      initOfflineDB();
      const actas = getLocalActas();
      const id = `${data.recinto_id}:${data.mesa_number}:${data.gender}:${data.dignity}`;
      const nowStr = new Date().toISOString();

      const newActa: Acta = {
        id,
        ...data,
        status: "En Verificación",
        entered_by: localStorage.getItem("username") || "digitador1",
        created_at: nowStr,
        updated_at: nowStr,
        photo_urls: [],
        photo_personal_urls: []
      };

      const idx = actas.findIndex(a => a.id === id);
      if (idx !== -1) {
        newActa.photo_urls = actas[idx].photo_urls;
        newActa.photo_personal_urls = actas[idx].photo_personal_urls;
        newActa.created_at = actas[idx].created_at;
        actas[idx] = newActa;
      } else {
        actas.push(newActa);
      }

      saveLocalActas(actas);
      return newActa;
    }

    const response = await fetch(`${API_BASE_URL}/votes/actas`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(await parseErrorDetail(response, "Error al registrar los votos"));
    }
    return response.json();
  },

  async uploadActaPhoto(actaId: string, file: Blob): Promise<Acta> {
    if (isOffline()) {
      initOfflineDB();
      const actas = getLocalActas();
      const idx = actas.findIndex(a => a.id === actaId);
      if (idx === -1) throw new Error("Error al subir la imagen del acta");

      const localUrl = URL.createObjectURL(file);
      const photo_urls = actas[idx].photo_urls || [];
      photo_urls.push(localUrl);

      actas[idx].photo_urls = photo_urls;
      actas[idx].updated_at = new Date().toISOString();
      saveLocalActas(actas);
      return actas[idx];
    }

    const token = localStorage.getItem("token");
    const formData = new FormData();
    formData.append("file", file, "acta_photo.jpg");

    const response = await fetch(`${API_BASE_URL}/votes/actas/${encodeURIComponent(actaId)}/upload-photo`, {
      method: "POST",
      headers: {
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
      },
      body: formData,
    });
    if (!response.ok) {
      throw new Error(await parseErrorDetail(response, "Error al subir la imagen del acta"));
    }
    return response.json();
  },

  async uploadActaPhotoPersonal(actaId: string, file: Blob): Promise<Acta> {
    if (isOffline()) {
      initOfflineDB();
      const actas = getLocalActas();
      const idx = actas.findIndex(a => a.id === actaId);
      if (idx === -1) throw new Error("Error al subir la copia del acta personal");

      const localUrl = URL.createObjectURL(file);
      const photo_personal_urls = actas[idx].photo_personal_urls || [];
      photo_personal_urls.push(localUrl);

      actas[idx].photo_personal_urls = photo_personal_urls;
      actas[idx].updated_at = new Date().toISOString();
      saveLocalActas(actas);
      return actas[idx];
    }

    const token = localStorage.getItem("token");
    const formData = new FormData();
    formData.append("file", file, "acta_photo_personal.jpg");

    const response = await fetch(`${API_BASE_URL}/votes/actas/${encodeURIComponent(actaId)}/upload-photo-personal`, {
      method: "POST",
      headers: {
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
      },
      body: formData,
    });
    if (!response.ok) {
      throw new Error(await parseErrorDetail(response, "Error al subir la copia del acta personal"));
    }
    return response.json();
  },

  async getActas(status?: string, recintoId?: string, dignity?: string): Promise<Acta[]> {
    if (isOffline()) {
      initOfflineDB();
      let actas = getLocalActas();
      if (status) actas = actas.filter(a => a.status === status);
      if (recintoId) actas = actas.filter(a => a.recinto_id === recintoId);
      if (dignity) actas = actas.filter(a => a.dignity === dignity);
      return actas;
    }

    const params = new URLSearchParams();
    if (status) params.append("status", status);
    if (recintoId) params.append("recinto_id", recintoId);
    if (dignity) params.append("dignity", dignity);

    const response = await fetch(`${API_BASE_URL}/votes/actas?${params}`, {
      headers: getHeaders(),
    });
    if (!response.ok) {
      throw new Error(await parseErrorDetail(response, "Error al obtener las actas"));
    }
    return response.json();
  },

  async getActa(actaId: string): Promise<Acta> {
    if (isOffline()) {
      initOfflineDB();
      const actas = getLocalActas();
      const act = actas.find(a => a.id === actaId);
      if (!act) throw new Error("No se pudo obtener la información del acta");
      return act;
    }

    const response = await fetch(`${API_BASE_URL}/votes/actas/${encodeURIComponent(actaId)}`, {
      headers: getHeaders(),
    });
    if (!response.ok) {
      throw new Error(await parseErrorDetail(response, "No se pudo obtener la información del acta"));
    }
    return response.json();
  },

  async verifyActa(actaId: string, status: "Validada" | "Con Novedad", comment?: string): Promise<Acta> {
    if (isOffline()) {
      initOfflineDB();
      const actas = getLocalActas();
      const idx = actas.findIndex(a => a.id === actaId);
      if (idx === -1) throw new Error("Error al verificar el acta");

      actas[idx].status = status;
      actas[idx].novedad_comment = comment;
      actas[idx].verified_by = localStorage.getItem("username") || "coord1";
      actas[idx].updated_at = new Date().toISOString();

      saveLocalActas(actas);
      return actas[idx];
    }

    const response = await fetch(`${API_BASE_URL}/votes/actas/${encodeURIComponent(actaId)}/verify`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ status, novedad_comment: comment }),
    });
    if (!response.ok) {
      throw new Error(await parseErrorDetail(response, "Error al verificar el acta"));
    }
    return response.json();
  },

  // Dashboard & Analytical Reports
  async getDashboard(dignity: string, provincia?: string, canton?: string, parroquia?: string) {
    if (isOffline()) {
      initOfflineDB();
      const recintos = getLocalRecintos();
      const candidates = getLocalCandidates();
      const actas = getLocalActas();

      // 1. Obtener recintos filtrados
      let filteredRecintos = recintos;
      if (provincia) filteredRecintos = filteredRecintos.filter(r => r.provincia === provincia);
      if (canton) filteredRecintos = filteredRecintos.filter(r => r.canton === canton);
      if (parroquia) filteredRecintos = filteredRecintos.filter(r => r.parroquia === parroquia);

      const recintoIds = filteredRecintos.map(r => r.id);
      let total_expected_mesas = 0;
      for (const r of filteredRecintos) {
        total_expected_mesas += (r.total_mesas_femeninas || 0) + (r.total_mesas_masculinas || 0) + (r.total_mesas_mixtas || 0);
      }

      if (recintoIds.length === 0) {
        return {
          summary: {
            total_mesas: 0,
            mesas_escrutadas: 0,
            escrutinio_percentage: 0.0,
            total_valid_votes: 0,
            total_white_votes: 0,
            total_null_votes: 0,
            total_votes_emitidos: 0
          },
          candidate_results: []
        };
      }

      // 2. Obtener actas filtradas por dignidad y recinto
      const filteredActas = actas.filter(a => a.dignity === dignity && recintoIds.includes(a.recinto_id));

      let mesas_escrutadas = 0;
      let total_white = 0;
      let total_null = 0;
      let total_voters = 0;
      const votes_by_candidate: Record<string, number> = {};

      for (const a of filteredActas) {
        mesas_escrutadas++;
        total_white += a.white_votes || 0;
        total_null += a.null_votes || 0;
        total_voters += a.total_voters || 0;

        for (const [cid, count] of Object.entries(a.votes || {})) {
          votes_by_candidate[cid] = (votes_by_candidate[cid] || 0) + count;
        }
      }

      // 3. Obtener candidatos relevantes
      let candidateQuery = candidates.filter(c => c.dignity === dignity);
      if (["alcalde", "concejal_urbano", "concejal_rural"].includes(dignity) && canton) {
        candidateQuery = candidateQuery.filter(c => c.canton === canton);
      }
      if (dignity === "junta_parroquial" && parroquia) {
        candidateQuery = candidateQuery.filter(c => c.parroquia === parroquia);
      }

      const candidatesInfo: Record<string, Candidate> = {};
      for (const c of candidateQuery) {
        candidatesInfo[c.id] = c;
      }

      // 4. Calcular resultados
      let total_valid_votes = 0;
      for (const val of Object.values(votes_by_candidate)) {
        total_valid_votes += val;
      }
      const total_votes_emitidos = total_valid_votes + total_white + total_null;

      const candidate_results: any[] = [];

      // Sumar resultados y añadir candidatos con 0 votos
      for (const cand of candidateQuery) {
        const votes = votes_by_candidate[cand.id] || 0;
        const pct_valid = total_valid_votes > 0 ? (votes / total_valid_votes * 100) : 0.0;
        const pct_total = total_votes_emitidos > 0 ? (votes / total_votes_emitidos * 100) : 0.0;

        candidate_results.push({
          id: cand.id,
          name: cand.name,
          list_number: cand.list_number,
          party_name: cand.party_name,
          photo_url: cand.photo_url,
          votes,
          percentage_valid: Number(pct_valid.toFixed(2)),
          percentage_total: Number(pct_total.toFixed(2))
        });
      }

      candidate_results.sort((a, b) => b.votes - a.votes);
      const escrutinio_percentage = total_expected_mesas > 0 ? (mesas_escrutadas / total_expected_mesas * 100) : 0.0;

      return {
        summary: {
          total_mesas: total_expected_mesas,
          mesas_escrutadas: mesas_escrutadas,
          escrutinio_percentage: Number(escrutinio_percentage.toFixed(2)),
          total_valid_votes: total_valid_votes,
          total_white_votes: total_white,
          total_null_votes: total_null,
          total_votes_emitidos: total_votes_emitidos
        },
        candidate_results
      };
    }

    const params = new URLSearchParams({ dignity });
    if (provincia) params.append("provincia", provincia);
    if (canton) params.append("canton", canton);
    if (parroquia) params.append("parroquia", parroquia);

    const response = await fetch(`${API_BASE_URL}/reports/dashboard?${params}`, {
      headers: getHeaders(),
    });
    if (!response.ok) {
      throw new Error("Error al obtener los datos consolidados");
    }
    return response.json();
  },

  async getGeographicalBreakdown(dignity: string, canton?: string) {
    if (isOffline()) {
      initOfflineDB();
      const recintos = getLocalRecintos();
      const candidates = getLocalCandidates();
      const actas = getLocalActas();

      // 1. Obtener recintos por canton
      let filteredRecintos = recintos;
      if (canton) filteredRecintos = filteredRecintos.filter(r => r.canton === canton);

      const recintosMap: Record<string, string> = {};
      const parroquia_expected_mesas: Record<string, number> = {};

      for (const r of filteredRecintos) {
        recintosMap[r.id] = r.parroquia;
        const mesasCount = (r.total_mesas_femeninas || 0) + (r.total_mesas_masculinas || 0) + (r.total_mesas_mixtas || 0);
        parroquia_expected_mesas[r.parroquia] = (parroquia_expected_mesas[r.parroquia] || 0) + mesasCount;
      }

      if (Object.keys(recintosMap).length === 0) return [];

      // 2. Obtener actas
      const recintoIds = Object.keys(recintosMap);
      const filteredActas = actas.filter(a => a.dignity === dignity && recintoIds.includes(a.recinto_id));

      const parroquia_votes: Record<string, Record<string, number>> = {};
      const parroquia_escrutadas: Record<string, number> = {};

      for (const a of filteredActas) {
        const parr = recintosMap[a.recinto_id];
        if (!parr) continue;

        parroquia_escrutadas[parr] = (parroquia_escrutadas[parr] || 0) + 1;
        if (!parroquia_votes[parr]) parroquia_votes[parr] = {};

        for (const [cid, votes] of Object.entries(a.votes || {})) {
          parroquia_votes[parr][cid] = (parroquia_votes[parr][cid] || 0) + votes;
        }
      }

      // 3. Nombres de candidatos
      const candidatesName: Record<string, string> = {};
      for (const c of candidates.filter(cand => cand.dignity === dignity)) {
        candidatesName[c.id] = `${c.name} (${c.list_number})`;
      }

      // 4. Formatear
      const result: any[] = [];
      for (const [parr, expected] of Object.entries(parroquia_expected_mesas)) {
        const escrutadas = parroquia_escrutadas[parr] || 0;
        const pct_escrutado = expected > 0 ? (escrutadas / expected * 100) : 0.0;

        const votesDict = parroquia_votes[parr] || {};
        let winner_id: string | null = null;
        let winner_name = "Sin datos";
        let winner_votes = 0;

        let total_valid = 0;
        for (const v of Object.values(votesDict)) {
          total_valid += v;
        }

        if (Object.keys(votesDict).length > 0) {
          let maxVotes = -1;
          for (const [cid, v] of Object.entries(votesDict)) {
            if (v > maxVotes) {
              maxVotes = v;
              winner_id = cid;
            }
          }
          if (winner_id) {
            winner_votes = votesDict[winner_id];
            winner_name = candidatesName[winner_id] || "Desconocido";
          }
        }

        const winner_percentage = total_valid > 0 && winner_id ? (winner_votes / total_valid * 100) : 0.0;

        result.push({
          parroquia: parr,
          total_mesas: expected,
          mesas_escrutadas: escrutadas,
          escrutinio_percentage: Number(pct_escrutado.toFixed(2)),
          winner: {
            id: winner_id,
            name: winner_name,
            votes: winner_votes,
            percentage: Number(winner_percentage.toFixed(2))
          },
          total_valid_votes: total_valid
        });
      }

      return result;
    }

    const params = new URLSearchParams({ dignity });
    if (canton) params.append("canton", canton);

    const response = await fetch(`${API_BASE_URL}/reports/geographical-breakdown?${params}`, {
      headers: getHeaders(),
    });
    if (!response.ok) {
      throw new Error(await parseErrorDetail(response, "Error al obtener el desglose geográfico"));
    }
    return response.json();
  }
};