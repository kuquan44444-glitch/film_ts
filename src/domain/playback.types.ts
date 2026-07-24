import type { ProviderKey } from 'src/providers/base/provider.types'

export type PlaybackCandidate = {
  serverId: string
  episodeKey: string
  episodeSlug: string
  episodeName: string
  versionLabel: string
  playbackUrl: string
  format: 'm3u8' | 'mp4'
  qualityLabel?: string
  providerKey: ProviderKey
  resolverType: 'direct' | 'derived'
  viaProxy: boolean
  healthScore: number
  lastCheckedAt?: number
}

export type PlaybackSelectionResult = {
  selected: PlaybackCandidate | null
  fallbackQueue: PlaybackCandidate[]
}

export type PlaybackHealthSnapshot = {
  candidateKey: string
  successCount: number
  failureCount: number
  lastFailureAt?: number
  lastSuccessAt?: number
}
