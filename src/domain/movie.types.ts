import type { ProviderKey } from 'src/providers/base/provider.types'

export type UnifiedTaxonomy = {
  id: string
  name: string
  slug: string
}

export type UnifiedImageSet = {
  thumb: string[]
  poster: string[]
}

export type UnifiedMovie = {
  id: string
  canonicalSlug: string
  titleVi: string
  titleOriginal: string
  year: number
  type: string
  countries: UnifiedTaxonomy[]
  categories: UnifiedTaxonomy[]
  posterCandidates: string[]
  thumbCandidates: string[]
  sources: ProviderKey[]
  sourceSlugs: Partial<Record<ProviderKey, string>>
  dedupeKeys: string[]
}

export type UnifiedEpisodeServer = {
  serverId: string
  displayName: string
  providerKey: ProviderKey
  priority: number
}

export type UnifiedEpisode = {
  episodeKey: string
  displayName: string
  order: number
  servers: UnifiedEpisodeServer[]
}

export type UnifiedMovieDetail = UnifiedMovie & {
  content: string
  actors: string[]
  directors: string[]
  trailerUrl: string
  episodes: UnifiedEpisode[]
  availableSources: ProviderKey[]
}
