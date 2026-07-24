import type { ResolveMediaInput, ResolvedMediaCandidate } from '../base/media.types'

export const resolveKkphimMedia = async ({ episode }: ResolveMediaInput): Promise<ResolvedMediaCandidate[]> => {
  if (!episode.link_m3u8) return []

  return [
    {
      playbackUrl: episode.link_m3u8,
      format: 'm3u8',
      providerKey: 'kkphim',
      resolverType: 'direct'
    }
  ]
}
