import type { LegacyProviderAdapter } from '../base/provider.adapter'
import {
  createProviderAdapter,
  defaultImageBase,
  defaultListItems,
  defaultListPayload,
  defaultOptionEndpoint,
  defaultRequestParams,
  getBaseURL,
  getDefaultEpisodes,
  getDefaultMovie,
  getDefaultOptionItems,
  providerCapabilities
} from './shared'

const ophimAdapter: LegacyProviderAdapter = createProviderAdapter({
  key: 'ophim',
  label: 'OPhim',
  shortLabel: 'O',
  sourceButtonLabel: 'OPhim (legacy)',
  priority: 4,
  playbackPreference: ['m3u8', 'embed'],
  capabilities: providerCapabilities({
    directMedia: true,
    requiresMediaResolver: false
  }),
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
})

export default ophimAdapter
