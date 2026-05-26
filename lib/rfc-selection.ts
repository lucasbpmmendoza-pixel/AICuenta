const SELECTED_RFC_KEY = 'selected_rfc'

export function readSelectedRfc(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(SELECTED_RFC_KEY)
}

export function saveSelectedRfc(rfc: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(SELECTED_RFC_KEY, rfc)
}