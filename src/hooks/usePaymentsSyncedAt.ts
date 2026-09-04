import { useEffect, useState } from 'react'
import { getPaymentsSyncedAtLabel } from '@/lib/season'

/**
 * The payment watermark label ("Sep 4, 7:45 AM CT") for player-facing
 * notices, or null while loading / before the first stamped import --
 * callers render nothing rather than a made-up date.
 */
export function usePaymentsSyncedAt(): string | null {
  const [label, setLabel] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    getPaymentsSyncedAtLabel().then(v => { if (alive) setLabel(v) }).catch(() => {})
    return () => { alive = false }
  }, [])
  return label
}
