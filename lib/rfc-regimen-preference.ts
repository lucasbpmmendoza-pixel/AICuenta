const STORAGE_KEY = 'rfc_isr_regimen_map'

type RegimenMap = Record<string, string>

function readMap(): RegimenMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as RegimenMap : {}
  } catch {
    return {}
  }
}

function writeMap(map: RegimenMap): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

export function saveRegimenForRfc(rfc: string, regimenCode: string): void {
  if (!rfc || !regimenCode) return
  const key = rfc.trim().toUpperCase()
  const map = readMap()
  map[key] = regimenCode
  writeMap(map)
}

export function readRegimenForRfc(rfc: string): string | null {
  if (!rfc) return null
  const key = rfc.trim().toUpperCase()
  const map = readMap()
  return map[key] ?? null
}