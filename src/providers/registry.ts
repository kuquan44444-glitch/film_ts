import type { ProviderAdapter } from './base/provider.adapter'
import type { PlaybackMode, ProviderKey } from './base/provider.types'
import kkphimAdapter from './adapters/kkphim.adapter'
import nguoncAdapter from './adapters/nguonc.adapter'
import ophimAdapter from './adapters/ophim.adapter'
import vsmovAdapter from './adapters/vsmov.adapter'
import { resolveKkphimMedia } from './resolvers/kkphim.resolver'
import { resolveOphimMedia } from './resolvers/ophim.resolver'
import { resolveVsmovMedia } from './resolvers/vsmov.resolver'

const providers: ProviderAdapter[] = [
  {
    ...kkphimAdapter,
    resolveMedia: resolveKkphimMedia
  },
  {
    ...vsmovAdapter,
    resolveMedia: resolveVsmovMedia
  },
  nguoncAdapter,
  {
    ...ophimAdapter,
    resolveMedia: resolveOphimMedia
  }
]

export const providerMap = providers.reduce<Record<ProviderKey, ProviderAdapter>>(
  (result, provider) => {
    result[provider.key] = provider
    return result
  },
  {} as Record<ProviderKey, ProviderAdapter>
)

export const providerOrder = providers.map((provider) => provider.key)
export const optionProviderOrder: ProviderKey[] = ['kkphim', 'vsmov', 'ophim']

export const getPlaybackPreference = (source?: ProviderKey): PlaybackMode[] =>
  source ? providerMap[source]?.playbackPreference ?? ['embed', 'm3u8'] : ['embed', 'm3u8']

export const enabledProviders = providers.filter((provider) => provider.capabilities.detail)

export default providers
