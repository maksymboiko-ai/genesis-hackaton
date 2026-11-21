'use client'

import { api } from './api'
import { clearSession } from './session'

/** Ends the server session, then the local one. Never throws. */
export async function signOutEverywhere() {
  try {
    await api.logOut()
  } catch {}
  clearSession()
}
