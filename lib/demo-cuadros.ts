// Comparte el "RFC del cliente" detectado en la herramienta demo
// "Crea tus cuadros gratis" con el Dashboard demo (misma pestaña, vía localStorage).
// Solo se usa en modo demo.

export const DEMO_CLIENT_RFC_KEY = 'demo_client_rfc'

export interface DemoClientRfc {
  rfc: string
  nombre: string
}

export function saveDemoClientRfc(value: DemoClientRfc): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(DEMO_CLIENT_RFC_KEY, JSON.stringify(value))
  } catch {}
}

export function readDemoClientRfc(): DemoClientRfc | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(DEMO_CLIENT_RFC_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DemoClientRfc
    return parsed && typeof parsed.rfc === 'string' && parsed.rfc ? parsed : null
  } catch {
    return null
  }
}

export function clearDemoClientRfc(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(DEMO_CLIENT_RFC_KEY)
  } catch {}
}

// Persiste el cuadro de CFDIs cargado para que sobreviva la navegación por la app.
export const DEMO_CUADRO_ROWS_KEY = 'demo_cuadro_rows'

export function saveDemoCuadroRows(rows: unknown[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(DEMO_CUADRO_ROWS_KEY, JSON.stringify(rows))
  } catch {}
}

export function readDemoCuadroRows<T = unknown>(): T[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(DEMO_CUADRO_ROWS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

export function clearDemoCuadroRows(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(DEMO_CUADRO_ROWS_KEY)
  } catch {}
}
