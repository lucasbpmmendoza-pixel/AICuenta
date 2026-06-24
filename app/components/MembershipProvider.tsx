'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export interface MembershipState {
  isFree: boolean
  estado: string | null
  planId: number | null
  loading: boolean
}

const DEFAULT: MembershipState = { isFree: true, estado: null, planId: null, loading: true }

const MembershipContext = createContext<MembershipState>(DEFAULT)

interface Props {
  initial?: { isFree: boolean; estado: string | null; planId: number | null }
  children: ReactNode
}

export function MembershipProvider({ initial, children }: Props) {
  const [state, setState] = useState<MembershipState>(
    initial ? { ...initial, loading: false } : DEFAULT,
  )

  useEffect(() => {
    if (initial) return
    let cancelled = false
    fetch('/api/billing/membership', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        setState({
          isFree: Boolean(data.isFree),
          estado: data.estado ?? null,
          planId: data.planId ?? null,
          loading: false,
        })
      })
      .catch(() => {
        if (!cancelled) setState((s) => ({ ...s, loading: false }))
      })
    return () => {
      cancelled = true
    }
  }, [initial])

  return <MembershipContext.Provider value={state}>{children}</MembershipContext.Provider>
}

export function useMembership(): MembershipState {
  return useContext(MembershipContext)
}
