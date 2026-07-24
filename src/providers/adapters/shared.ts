import PATH from 'src/utils/path'
import type { LegacyProviderAdapter } from '../base/provider.adapter'
import type {
  ProviderCapabilities,
  ProviderKey,
  ProviderOptionType,
  ProviderPayload,
  ProviderRequestParams
} from '../base/provider.types'

const shouldUseSourceProxy = import.meta.env.DEV && import.meta.env.VITE_USE_SOURCE_PROXY === 'true'

export const providerCapabilities = ({
  directMedia,
  requiresMediaResolver
}: Pick<ProviderCapabilities, 'directMedia' | 'requiresMediaResolver'>): ProviderCapabilities => ({
  list: true,
  search: true,
  detail: true,
  directMedia,
  requiresMediaResolver
})

export const getBaseURL = (proxyPath: string, envValue: string | undefined, fallbackBaseURL: string) =>
  shouldUseSourceProxy ? proxyPath : envValue || fallbackBaseURL

export const getNestedPayload = (payload: ProviderPayload) => (payload.data as ProviderPayload | undefined) ?? payload

export const getDefaultMovie = (payload: ProviderPayload) => {
  const nestedPayload = getNestedPayload(payload)
  return (
    (nestedPayload.item as ProviderPayload | undefined) ??
    (nestedPayload.movie as ProviderPayload | undefined) ??
    (payload.movie as ProviderPayload | undefined) ??
    {}
  )
}

export const getDefaultEpisodes = (payload: ProviderPayload) => {
  const nestedPayload = getNestedPayload(payload)
  return ((nestedPayload.episodes as unknown[]) ?? (payload.episodes as unknown[]) ?? []) as ProviderPayload[]
}

export const getDefaultOptionItems = (payload: ProviderPayload) => {
  const nestedPayload = getNestedPayload(payload)
  return ((nestedPayload.items as unknown[]) ?? (payload.items as unknown[]) ?? []) as unknown[]
}

export const defaultOptionEndpoint = (type: ProviderOptionType) => (type === 'genres' ? '/the-loai' : '/quoc-gia')

export const defaultRequestParams = (params?: ProviderRequestParams) =>
  params ? ({ ...params } as Record<string, unknown>) : undefined

export const defaultListPayload = (payload: ProviderPayload) => getNestedPayload(payload)

export const defaultListItems = (payload: ProviderPayload) => {
  const nestedPayload = getNestedPayload(payload)
  return ((nestedPayload.items as unknown[]) ?? (payload.items as unknown[]) ?? []) as unknown[]
}

export const defaultImageBase = (payload: ProviderPayload) => {
  const nestedPayload = getNestedPayload(payload)
  return String(nestedPayload.pathImage ?? payload.pathImage ?? '')
}

export const createProviderAdapter = (adapter: LegacyProviderAdapter) => adapter

export const getAdapterPriority = (providerKey: ProviderKey) => {
  const priorityMap: Record<ProviderKey, number> = {
    kkphim: 1,
    vsmov: 2,
    nguonc: 3,
    ophim: 4
  }

  return priorityMap[providerKey]
}

export const buildNguoncListEndpoint = (type: string, params?: ProviderRequestParams) => {
  if (params && 'category' in params && params.category) return `/films/the-loai/${params.category}`
  if (params && 'country' in params && params.country) return `/films/quoc-gia/${params.country}`
  if (params && 'year' in params && params.year) return `/films/nam-phat-hanh/${params.year}`
  if (type === PATH.new) return '/films/phim-moi-cap-nhat'
  return `/films/danh-sach/${type}`
}
