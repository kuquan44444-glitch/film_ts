import type { PlaybackCandidate, PlaybackSelectionResult } from 'src/domain/playback.types'
import { providerMap } from 'src/providers/registry'
import type { episodeData, episodeServer } from 'src/types'
import { resolveProxyUrl } from './proxy-url.service'
import { createPlaybackCandidateKey, getPlaybackHealth } from './playback-health.service'

export type PlaybackServerEntry = {
  server: episodeServer
  serverId: string
  index: number
}

type BuildPlaybackCandidatesInput = {
  serverEntries: PlaybackServerEntry[]
  preferredEpisode?: episodeData
  preferredServerId?: string
  proxyMode?: boolean
}

type SelectPlaybackCandidateOptions = {
  lockedServerId?: string
}

const PROBE_TIMEOUT_MS = 4500

const getEpisodeMergeKey = (episode: episodeData) =>
  episode.slug || episode.filename || episode.name.trim().toLowerCase().replace(/\s+/g, '-')

const getEpisodeForServer = (server: episodeServer, preferredEpisode?: episodeData) => {
  if (!preferredEpisode) return server.server_data[0]

  return (
    server.server_data.find(
      (entry) =>
        entry.slug === preferredEpisode.slug ||
        entry.name === preferredEpisode.name ||
        entry.filename === preferredEpisode.filename
    ) ?? server.server_data[0]
  )
}

const getProviderBaseScore = (candidate: Pick<PlaybackCandidate, 'providerKey' | 'resolverType' | 'format'>) => {
  const providerWeight: Record<PlaybackCandidate['providerKey'], number> = {
    ophim: 36,
    kkphim: 24,
    vsmov: 20,
    nguonc: 0
  }

  const formatBonus = candidate.format === 'm3u8' ? 10 : 8
  const resolverBonus = candidate.resolverType === 'direct' ? 12 : 6

  return providerWeight[candidate.providerKey] + formatBonus + resolverBonus
}

const createProbeController = (timeoutMs: number) => {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  return {
    controller,
    dispose: () => window.clearTimeout(timeoutId)
  }
}

const probePlaybackUrl = async (candidate: PlaybackCandidate) => {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') {
    return {
      ok: true,
      latencyMs: 0
    }
  }

  const startedAt = Date.now()

  try {
    const headProbe = createProbeController(PROBE_TIMEOUT_MS)
    try {
      const response = await window.fetch(candidate.playbackUrl, {
        method: 'HEAD',
        signal: headProbe.controller.signal
      })

      if (response.ok) {
        return {
          ok: true,
          latencyMs: Date.now() - startedAt
        }
      }
    } finally {
      headProbe.dispose()
    }
  } catch {
    // Fall through to GET probe below.
  }

  try {
    const getProbe = createProbeController(PROBE_TIMEOUT_MS)
    try {
      const response = await window.fetch(candidate.playbackUrl, {
        method: 'GET',
        headers: {
          Range: 'bytes=0-0'
        },
        signal: getProbe.controller.signal
      })

      return {
        ok: response.ok || response.status === 206,
        latencyMs: Date.now() - startedAt
      }
    } finally {
      getProbe.dispose()
    }
  } catch {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt
    }
  }
}

const rankCandidate = async (candidate: PlaybackCandidate, preferredServerId?: string): Promise<PlaybackCandidate> => {
  const probeResult = await probePlaybackUrl(candidate)
  const latencyBonus =
    probeResult.latencyMs === 0 ? 0 : Math.max(0, Math.round((PROBE_TIMEOUT_MS - probeResult.latencyMs) / 200))
  const preferredServerBonus = preferredServerId && candidate.serverId === preferredServerId ? 18 : 0
  const probeBonus = probeResult.ok ? 24 : -18

  return {
    ...candidate,
    healthScore: getProviderBaseScore(candidate) + latencyBonus + preferredServerBonus + probeBonus,
    lastCheckedAt: Date.now()
  }
}

export const buildPlaybackCandidates = async ({
  serverEntries,
  preferredEpisode,
  preferredServerId,
  proxyMode = false
}: BuildPlaybackCandidatesInput): Promise<PlaybackCandidate[]> => {
  const resolvedCandidates = await Promise.all(
    serverEntries.map(async ({ server, serverId }) => {
      const provider = providerMap[server.source]
      const matchedEpisode = getEpisodeForServer(server, preferredEpisode)

      if (!provider?.resolveMedia || !matchedEpisode) return []

      const mediaCandidates = await provider.resolveMedia({
        episode: matchedEpisode,
        server
      })

      return mediaCandidates
        .filter((entry) => Boolean(entry.playbackUrl))
        .map<PlaybackCandidate>((entry) => ({
          serverId,
          episodeKey: getEpisodeMergeKey(matchedEpisode),
          episodeSlug: matchedEpisode.slug,
          episodeName: matchedEpisode.name,
          versionLabel: server.version_label || 'Vietsub',
          playbackUrl: resolveProxyUrl({
            target: 'media',
            providerKey: entry.providerKey,
            url: entry.playbackUrl,
            proxyMode
          }),
          format: entry.format,
          qualityLabel: entry.qualityLabel,
          providerKey: entry.providerKey,
          resolverType: entry.resolverType,
          viaProxy: proxyMode,
          healthScore: 0
        }))
    })
  )

  const candidates = resolvedCandidates.flat()
  const rankedCandidates = await Promise.all(candidates.map((candidate) => rankCandidate(candidate, preferredServerId)))
  const healthyCandidates = rankedCandidates.filter((candidate) => candidate.healthScore > 0)

  return healthyCandidates.length ? healthyCandidates : rankedCandidates
}

const getRuntimeCandidateScore = (candidate: PlaybackCandidate) => {
  const health = getPlaybackHealth(
    createPlaybackCandidateKey({
      providerKey: candidate.providerKey,
      serverId: candidate.serverId,
      episodeKey: candidate.episodeKey,
      playbackUrl: candidate.playbackUrl
    })
  )

  return candidate.healthScore + health.successCount * 4 - health.failureCount * 6
}

export const selectPlaybackCandidate = (
  candidates: PlaybackCandidate[],
  options: SelectPlaybackCandidateOptions = {}
): PlaybackSelectionResult => {
  const rankedCandidates = [...candidates].sort((left, right) => {
    const leftLockedPriority = options.lockedServerId && left.serverId === options.lockedServerId ? 1 : 0
    const rightLockedPriority = options.lockedServerId && right.serverId === options.lockedServerId ? 1 : 0

    if (leftLockedPriority !== rightLockedPriority) {
      return rightLockedPriority - leftLockedPriority
    }

    return getRuntimeCandidateScore(right) - getRuntimeCandidateScore(left)
  })

  return {
    selected: rankedCandidates[0] ?? null,
    fallbackQueue: rankedCandidates.slice(1)
  }
}
