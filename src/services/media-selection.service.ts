import type { PlaybackCandidate, PlaybackSelectionResult } from 'src/domain/playback.types'
import { getPlaybackHealth } from './playback-health.service'

const PROBE_TIMEOUT_MS = 2500

export const getPlaybackCandidateKey = (candidate: PlaybackCandidate) =>
  `${candidate.providerKey}:${candidate.episodeKey}:${candidate.playbackUrl}`

const getRankedScore = (candidate: PlaybackCandidate) => {
  const candidateHealth = getPlaybackHealth(getPlaybackCandidateKey(candidate))
  return candidate.healthScore + candidateHealth.successCount - candidateHealth.failureCount
}

const createProbeSignal = (timeoutMs: number) => {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  return {
    signal: controller.signal,
    cleanup: () => window.clearTimeout(timeoutId)
  }
}

const probePlaybackCandidate = async (candidate: PlaybackCandidate): Promise<PlaybackCandidate> => {
  if (typeof window === 'undefined') return candidate

  const { signal, cleanup } = createProbeSignal(PROBE_TIMEOUT_MS)
  const startedAt = Date.now()

  try {
    const response = await fetch(candidate.playbackUrl, {
      method: 'HEAD',
      mode: 'cors',
      signal
    })
    const responseTime = Date.now() - startedAt
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
    const isExpectedFormat =
      candidate.format === 'm3u8'
        ? contentType.includes('mpegurl') || contentType.includes('application/octet-stream')
        : true
    const latencyBonus = responseTime < 1200 ? 6 : responseTime < 2200 ? 3 : 0

    return {
      ...candidate,
      healthScore: candidate.healthScore + (response.ok && isExpectedFormat ? 12 + latencyBonus : -18),
      lastCheckedAt: Date.now()
    }
  } catch {
    return {
      ...candidate,
      healthScore: candidate.healthScore - 12,
      lastCheckedAt: Date.now()
    }
  } finally {
    cleanup()
  }
}

export const selectPlaybackCandidate = (candidates: PlaybackCandidate[]): PlaybackSelectionResult => {
  const rankedCandidates = [...candidates].sort((left, right) => getRankedScore(right) - getRankedScore(left))

  return {
    selected: rankedCandidates[0] ?? null,
    fallbackQueue: rankedCandidates.slice(1)
  }
}

export const preparePlaybackSelection = async (candidates: PlaybackCandidate[]): Promise<PlaybackSelectionResult> => {
  const probedCandidates = await Promise.all(candidates.map((candidate) => probePlaybackCandidate(candidate)))
  return selectPlaybackCandidate(probedCandidates)
}
