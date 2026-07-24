import type { LegacyProviderAdapter } from '../base/provider.adapter'
import type { ProviderPayload } from '../base/provider.types'
import {
  buildNguoncListEndpoint,
  createProviderAdapter,
  defaultImageBase,
  defaultListItems,
  defaultListPayload,
  defaultOptionEndpoint,
  getBaseURL,
  getDefaultEpisodes,
  getDefaultMovie,
  getDefaultOptionItems,
  getNestedPayload,
  providerCapabilities
} from './shared'

const nguoncAdapter: LegacyProviderAdapter = createProviderAdapter({
  key: 'nguonc',
  label: 'Nguồn C',
  shortLabel: 'N',
  sourceButtonLabel: 'Nguồn C',
  priority: 3,
  playbackPreference: ['embed', 'm3u8'],
  capabilities: providerCapabilities({
    directMedia: false,
    requiresMediaResolver: false
  }),
  baseURL: getBaseURL('/proxy/nguonc', import.meta.env.VITE_NGUONC_API_URL, 'https://phim.nguonc.com/api'),
  buildSearchEndpoint: () => '/films/search',
  buildListEndpoint: buildNguoncListEndpoint,
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
      (payload.movie as ProviderPayload | undefined) ??
      (nestedPayload.movie as ProviderPayload | undefined) ??
      getDefaultMovie(payload)
    )
  },
  extractEpisodes: (payload) => {
    const movie = (payload.movie as ProviderPayload | undefined) ?? getDefaultMovie(payload)
    return ((movie.episodes as unknown[]) ?? getDefaultEpisodes(payload)) as ProviderPayload[]
  }
})

export default nguoncAdapter
