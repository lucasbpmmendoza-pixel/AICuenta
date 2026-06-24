'use client'

import { useSyncExternalStore } from 'react'
import { getSnapshot, subscribe } from './chatbot-store'

export function useChatbotStore() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
