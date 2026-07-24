import type { PlaybackCandidate, PlaybackSelectionResult } from 'src/domain/playback.types'
import { getPlaybackHealth } from './playback-health.service'

export const selectPlaybackCandidate = (candidates: PlaybackCandidate[]): PlaybackSelectionResult => {
  const rankedCandidates = [...candidates].sort((left, right) => {
    const leftHealth = getPlaybackHealth(`${left.providerKey}:${left.episodeKey}:${left.playbackUrl}`)
    const rightHealth = getPlaybackHealth(`${right.providerKey}:${right.episodeKey}:${right.playbackUrl}`)
    const leftScore = left.healthScore + leftHealth.successCount - leftHealth.failureCount
    const rightScore = right.healthScore + rightHealth.successCount - rightHealth.failureCount

    return rightScore - leftScore
  })

  return {
    selected: rankedCandidates[0] ?? null,
    fallbackQueue: rankedCandidates.slice(1)
  }
}
