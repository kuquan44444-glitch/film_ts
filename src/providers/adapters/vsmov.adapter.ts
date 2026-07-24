import type { LegacyProviderAdapter } from '../base/provider.adapter'
import {
  createProviderAdapter,
  defaultImageBase,
  defaultListItems,
  defaultListPayload,
  defaultOptionEndpoint,
  defaultRequestParams,
  getDefaultEpisodes,
  getDefaultMovie,
  getDefaultOptionItems,
  getBaseURL,
  providerCapabilities
} from './shared'

const vsmovAdapter: LegacyProviderAdapter = createProviderAdapter({
  key: 'vsmov',
  label: 'VSMOV',
  sourceButtonLabel: 'VSMOV',
  priority: 2,
  playbackPreference: ['m3u8'],
  capabilities: providerCapabilities({
    directMedia: false,
    requiresMediaResolver: true
  }),
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
})

export default vsmovAdapter
