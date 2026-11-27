export type CircunscripcionNumber = 1 | 2;

const CIRCUNSCRIPCION_1_PARROQUIAS = new Set(["YARUQUIES", "LIZARZABURU", "VELOZ"]);
const CIRCUNSCRIPCION_2_PARROQUIAS = new Set(["MALDONADO", "VELASCO"]);

export const CIRCUNSCRIPCION_INFO: Record<
  CircunscripcionNumber,
  { title: string; parroquiasLabel: string }
> = {
  1: {
    title: "Circunscripción 1",
    parroquiasLabel: "Yaruquíes, Lizarzaburu, Veloz",
  },
  2: {
    title: "Circunscripción 2",
    parroquiasLabel: "Maldonado, Velasco",
  },
};

export function normalizeGeo(value?: string): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

export function isRiobamba(canton?: string): boolean {
  return normalizeGeo(canton) === "RIOBAMBA";
}

export function getRecintoCircunscripcion(
  canton?: string,
  parroquia?: string
): CircunscripcionNumber | null {
  if (!isRiobamba(canton)) return null;
  const p = normalizeGeo(parroquia);
  if (!p) return null;
  if (CIRCUNSCRIPCION_1_PARROQUIAS.has(p)) return 1;
  if (CIRCUNSCRIPCION_2_PARROQUIAS.has(p)) return 2;
  if (/\b1\b/.test(p)) return 1;
  if (/\b2\b/.test(p)) return 2;
  return null;
}

export function getCandidateCircunscripcion(
  parroquia?: string
): CircunscripcionNumber | null {
  const p = normalizeGeo(parroquia);
  if (!p) return null;
  if (/\b1\b/.test(p)) return 1;
  if (/\b2\b/.test(p)) return 2;
  return getRecintoCircunscripcion("RIOBAMBA", parroquia);
}
