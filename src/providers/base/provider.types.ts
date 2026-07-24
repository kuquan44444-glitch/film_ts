export type ProviderKey = 'ophim' | 'kkphim' | 'vsmov' | 'nguonc'

export type ProviderOptionType = 'genres' | 'country'

export type PlaybackMode = 'm3u8' | 'embed'

export type ProviderCapabilities = {
  list: boolean
  search: boolean
  detail: boolean
  directMedia: boolean
  requiresMediaResolver: boolean
}

export type ProviderListParams = {
  page?: string
  sort_field?: string
  category?: string
  country?: string
  year?: string
}

export type ProviderSearchParams = {
  keyword: string
  page: string
}

export type ProviderRequestParams = ProviderListParams | ProviderSearchParams

export type ProviderPayload = Record<string, unknown>
