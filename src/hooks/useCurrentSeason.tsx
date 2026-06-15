import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { fetchAppSettings, clearAppSettingsCache, FALLBACK_ACTIVE_SEASON } from '@/lib/season'

interface CurrentSeasonContextType {
  /** The active season (admin-controlled, from app_settings). */
  activeSeason: number
  /** Number of early weeks where unpaid players are still shown on leaderboards. */
  graceWeeks: number
  /** True until the value has been loaded from the database. */
  loading: boolean
  /** Re-read app_settings from the DB (e.g. after an admin changes the season). */
  refresh: () => Promise<void>
}

const CurrentSeasonContext = createContext<CurrentSeasonContextType | undefined>(undefined)

export function CurrentSeasonProvider({ children }: { children: React.ReactNode }) {
  // Start from the fallback (last completed season) so the UI shows real data
  // immediately, then update once the DB value resolves.
  const [activeSeason, setActiveSeason] = useState(FALLBACK_ACTIVE_SEASON)
  const [graceWeeks, setGraceWeeks] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const settings = await fetchAppSettings()
    setActiveSeason(settings.activeSeason)
    setGraceWeeks(settings.graceWeeks)
    setLoading(false)
  }

  const refresh = async () => {
    clearAppSettingsCache()
    await load()
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <CurrentSeasonContext.Provider value={{ activeSeason, graceWeeks, loading, refresh }}>
      {children}
    </CurrentSeasonContext.Provider>
  )
}

export function useCurrentSeason() {
  const ctx = useContext(CurrentSeasonContext)
  if (!ctx) {
    throw new Error('useCurrentSeason must be used within a CurrentSeasonProvider')
  }
  return ctx
}

/**
 * Season state for a selector/dropdown: starts at the active season and updates
 * to it once loaded from the DB, but never overrides a value the user has set.
 * Drop-in replacement for `useState(2025)` style season defaults.
 */
export function useSeasonState(): [number, React.Dispatch<React.SetStateAction<number>>] {
  const { activeSeason, loading } = useCurrentSeason()
  const [season, setSeason] = useState(activeSeason)
  const defaulted = useRef(false)
  useEffect(() => {
    if (!loading && !defaulted.current) {
      setSeason(activeSeason)
      defaulted.current = true
    }
  }, [loading, activeSeason])
  return [season, setSeason]
}
