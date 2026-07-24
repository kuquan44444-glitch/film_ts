import type { ResolveMediaInput, ResolvedMediaCandidate } from '../base/media.types'

const deriveVsmovStreamUrl = (embedUrl: string) => {
  const streamMatch = embedUrl.match(/\/stream\/([^/?#]+)/i)
  if (streamMatch?.[1]) {
    return `https://v6.streamvsmov.com/stream/${streamMatch[1]}/master.m3u8`
  }

  return ''
}

export const resolveVsmovMedia = async ({ episode }: ResolveMediaInput): Promise<ResolvedMediaCandidate[]> => {
  const derivedUrl = deriveVsmovStreamUrl(episode.link_embed)
  if (!derivedUrl) return []

  return [
    {
      playbackUrl: derivedUrl,
      format: 'm3u8',
      providerKey: 'vsmov',
      resolverType: 'derived'
    }
  ]
}
