import type { ResolveMediaInput, ResolvedMediaCandidate } from './media.types'
import type {
  PlaybackMode,
  ProviderCapabilities,
  ProviderKey,
  ProviderListParams,
  ProviderOptionType,
  ProviderPayload,
  ProviderRequestParams,
  ProviderSearchParams
} from './provider.types'

export type LegacyProviderAdapter = {
  key: ProviderKey
  label: string
  sourceButtonLabel: string
  priority: number
  playbackPreference: PlaybackMode[]
  baseURL: string
  capabilities: ProviderCapabilities
  buildSearchEndpoint: () => string
  buildListEndpoint: (type: string, params?: ProviderListParams) => string
  buildFilmEndpoint: (slug: string) => string
  buildOptionEndpoint: (type: ProviderOptionType) => string
  buildRequestParams: (params?: ProviderRequestParams) => Record<string, unknown> | undefined
  extractListPayload: (payload: ProviderPayload) => ProviderPayload
  extractListItems: (payload: ProviderPayload) => unknown[]
  extractImageBase: (payload: ProviderPayload) => string
  extractOptionItems: (payload: ProviderPayload) => unknown[]
  extractMovie: (payload: ProviderPayload) => ProviderPayload
  extractEpisodes: (payload: ProviderPayload) => ProviderPayload[]
  resolveMedia?: (input: ResolveMediaInput) => Promise<ResolvedMediaCandidate[]>
}

export type ProviderAdapter = LegacyProviderAdapter

export type ProviderSearchInput = ProviderSearchParams
