export type ProxyTarget = 'api' | 'media'

export type ProxyUrlInput = {
  target: ProxyTarget
  providerKey?: string
  url: string
  proxyMode: boolean
}

export const resolveProxyUrl = ({ target, providerKey, url, proxyMode }: ProxyUrlInput) => {
  if (!proxyMode || !url) return url

  const encodedUrl = encodeURIComponent(url)

  if (target === 'api' && providerKey) {
    return `/proxy/api/${providerKey}?url=${encodedUrl}`
  }

  return `/proxy/media?url=${encodedUrl}`
}
