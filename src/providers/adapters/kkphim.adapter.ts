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

const kkphimAdapter: LegacyProviderAdapter = createProviderAdapter({
  key: 'kkphim',
  label: 'KKPhim',
  shortLabel: 'K',
  sourceButtonLabel: 'KKPhim',
  priority: 1,
  playbackPreference: ['embed', 'm3u8'],
  capabilities: providerCapabilities({
    directMedia: true,
    requiresMediaResolver: false
  }),
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
})

export default kkphimAdapter
