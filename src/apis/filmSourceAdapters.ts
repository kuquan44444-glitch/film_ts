import type { movieSource } from 'src/types'
import PATH from 'src/utils/path'

export type PlaybackMode = 'm3u8' | 'embed'

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

type ProviderRequestParams = ProviderListParams | ProviderSearchParams
type ProviderOptionType = 'genres' | 'country'
type PayloadRecord = Record<string, unknown>

export type ProviderAdapter = {
  key: movieSource
  label: string
  sourceButtonLabel: string
  priority: number
  playbackPreference: PlaybackMode[]
  baseURL: string
  buildSearchEndpoint: () => string
  buildListEndpoint: (type: string, params?: ProviderListParams) => string
  buildFilmEndpoint: (slug: string) => string
  buildOptionEndpoint: (type: ProviderOptionType) => string
  buildRequestParams: (params?: ProviderRequestParams) => Record<string, unknown> | undefined
  extractListPayload: (payload: PayloadRecord) => PayloadRecord
  extractListItems: (payload: PayloadRecord) => unknown[]
  extractImageBase: (payload: PayloadRecord) => string
  extractOptionItems: (payload: PayloadRecord) => unknown[]
  extractMovie: (payload: PayloadRecord) => PayloadRecord
  extractEpisodes: (payload: PayloadRecord) => PayloadRecord[]
}

const shouldUseSourceProxy = import.meta.env.DEV && import.meta.env.VITE_USE_SOURCE_PROXY === 'true'

const getBaseURL = (proxyPath: string, envValue: string | undefined, fallbackBaseURL: string) =>
  shouldUseSourceProxy ? proxyPath : envValue || fallbackBaseURL

const getNestedPayload = (payload: PayloadRecord) => (payload.data as PayloadRecord | undefined) ?? payload

const getDefaultMovie = (payload: PayloadRecord) => {
  const nestedPayload = getNestedPayload(payload)
  return (
    (nestedPayload.item as PayloadRecord | undefined) ??
    (nestedPayload.movie as PayloadRecord | undefined) ??
    (payload.movie as PayloadRecord | undefined) ??
    {}
  )
}

const getDefaultEpisodes = (payload: PayloadRecord) => {
  const nestedPayload = getNestedPayload(payload)
  return ((nestedPayload.episodes as unknown[]) ?? (payload.episodes as unknown[]) ?? []) as PayloadRecord[]
}

const getDefaultOptionItems = (payload: PayloadRecord) => {
  const nestedPayload = getNestedPayload(payload)
  return ((nestedPayload.items as unknown[]) ?? (payload.items as unknown[]) ?? []) as unknown[]
}

const defaultOptionEndpoint = (type: ProviderOptionType) => (type === 'genres' ? '/the-loai' : '/quoc-gia')

const defaultRequestParams = (params?: ProviderRequestParams) =>
  params ? ({ ...params } as Record<string, unknown>) : undefined

const defaultListPayload = (payload: PayloadRecord) => getNestedPayload(payload)

const defaultListItems = (payload: PayloadRecord) => {
  const nestedPayload = getNestedPayload(payload)
  return ((nestedPayload.items as unknown[]) ?? (payload.items as unknown[]) ?? []) as unknown[]
}

const defaultImageBase = (payload: PayloadRecord) => {
  const nestedPayload = getNestedPayload(payload)
  return String(nestedPayload.pathImage ?? payload.pathImage ?? '')
}

const providerAdapters: ProviderAdapter[] = [
  {
    key: 'kkphim',
    label: 'KKPhim',
    sourceButtonLabel: 'KKPhim',
    priority: 1,
    playbackPreference: ['embed', 'm3u8'],
    baseURL: getBaseURL('/proxy/kkphim', import.meta.env.VITE_KKPHIM_API_URL, 'https://phimapi.com'),
    buildSearchEndpoint: () => '/v1/api/tim-kiem',
    buildListEndpoint: (type) => `/danh-sach/${type}`,
    buildFilmEndpoint: (slug) => `/phim/${slug}`,
    buildOptionEndpoint: defaultOptionEndpoint,
    buildRequestParams: defaultRequestParams,
    extractListPayload: defaultListPayload,
    extractListItems: defaultListItems,
    extractImageBase: defaultImageBase,
    extractOptionItems: getDefaultOptionItems,
    extractMovie: getDefaultMovie,
    extractEpisodes: getDefaultEpisodes
  },
  {
    key: 'vsmov',
    label: 'VSMOV',
    sourceButtonLabel: 'VSMOV',
    priority: 2,
    playbackPreference: ['embed', 'm3u8'],
    baseURL: getBaseURL('/proxy/vsmov', import.meta.env.VITE_VSMOV_API_URL, 'https://vsmov.com/api'),
    buildSearchEndpoint: () => '/tim-kiem',
    buildListEndpoint: (type) => `/danh-sach/${type}`,
    buildFilmEndpoint: (slug) => `/phim/${slug}`,
    buildOptionEndpoint: defaultOptionEndpoint,
    buildRequestParams: defaultRequestParams,
    extractListPayload: defaultListPayload,
    extractListItems: defaultListItems,
    extractImageBase: defaultImageBase,
    extractOptionItems: getDefaultOptionItems,
    extractMovie: getDefaultMovie,
    extractEpisodes: getDefaultEpisodes
  },
  {
    key: 'nguonc',
    label: 'Nguồn C',
    sourceButtonLabel: 'Nguồn C',
    priority: 3,
    playbackPreference: ['embed', 'm3u8'],
    baseURL: getBaseURL('/proxy/nguonc', import.meta.env.VITE_NGUONC_API_URL, 'https://phim.nguonc.com/api'),
    buildSearchEndpoint: () => '/films/search',
    buildListEndpoint: (type, params) => {
      if (params?.category) return `/films/the-loai/${params.category}`
      if (params?.country) return `/films/quoc-gia/${params.country}`
      if (params?.year) return `/films/nam-phat-hanh/${params.year}`
      if (type === PATH.new) return '/films/phim-moi-cap-nhat'
      return `/films/danh-sach/${type}`
    },
    buildFilmEndpoint: (slug) => `/film/${slug}`,
    buildOptionEndpoint: defaultOptionEndpoint,
    buildRequestParams: (params) => ({
      page: params?.page || '1',
      keyword: params && 'keyword' in params ? params.keyword : undefined
    }),
    extractListPayload: defaultListPayload,
    extractListItems: defaultListItems,
    extractImageBase: defaultImageBase,
    extractOptionItems: getDefaultOptionItems,
    extractMovie: (payload) => {
      const nestedPayload = getNestedPayload(payload)
      return (
        (payload.movie as PayloadRecord | undefined) ??
        (nestedPayload.movie as PayloadRecord | undefined) ??
        getDefaultMovie(payload)
      )
    },
    extractEpisodes: (payload) => {
      const movie = (payload.movie as PayloadRecord | undefined) ?? getDefaultMovie(payload)
      return ((movie.episodes as unknown[]) ?? getDefaultEpisodes(payload)) as PayloadRecord[]
    }
  },
  {
    key: 'ophim',
    label: 'OPhim',
    sourceButtonLabel: 'OPhim (legacy)',
    priority: 4,
    playbackPreference: ['m3u8', 'embed'],
    baseURL: getBaseURL(
      '/proxy/ophim',
      import.meta.env.VITE_OPHIM_API_URL || import.meta.env.VITE_API_URL,
      'https://ophim1.com'
    ),
    buildSearchEndpoint: () => '/tim-kiem',
    buildListEndpoint: (type) => `/danh-sach/${type}`,
    buildFilmEndpoint: (slug) => `/phim/${slug}`,
    buildOptionEndpoint: defaultOptionEndpoint,
    buildRequestParams: defaultRequestParams,
    extractListPayload: defaultListPayload,
    extractListItems: defaultListItems,
    extractImageBase: defaultImageBase,
    extractOptionItems: getDefaultOptionItems,
    extractMovie: getDefaultMovie,
    extractEpisodes: getDefaultEpisodes
  }
]

export const providerMap = providerAdapters.reduce<Record<movieSource, ProviderAdapter>>(
  (result, provider) => {
    result[provider.key] = provider
    return result
  },
  {} as Record<movieSource, ProviderAdapter>
)

export const providerOrder = providerAdapters.map((provider) => provider.key)
export const optionProviderOrder: movieSource[] = ['kkphim', 'vsmov', 'ophim']

export const getPlaybackPreference = (source?: movieSource) =>
  source ? providerMap[source]?.playbackPreference ?? ['embed', 'm3u8'] : ['embed', 'm3u8']

export default providerAdapters
