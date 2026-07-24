import type { ProviderKey } from './provider.types'

export type RawEpisode = {
  name: string
  slug: string
  filename: string
  link_embed: string
  link_m3u8: string
}

export type RawEpisodeServer = {
  server_name: string
  original_server_name: string
  source: ProviderKey
  source_label: string
  priority: number
  server_data: RawEpisode[]
}

export type ResolveMediaInput = {
  episode: RawEpisode
  server: RawEpisodeServer
}

export type ResolvedMediaCandidate = {
  playbackUrl: string
  format: 'm3u8' | 'mp4'
  providerKey: ProviderKey
  qualityLabel?: string
  resolverType: 'direct' | 'derived'
}
