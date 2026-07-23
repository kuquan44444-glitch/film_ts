import axios, { AxiosError, AxiosInstance, isAxiosError } from 'axios'
import {
  data,
  episodeData,
  episodeServer,
  film,
  imageSet,
  items,
  list,
  movieSource,
  option,
  taxonomyItem
} from 'src/types'
import PATH from '../utils/path'

export type paramOption = {
  page?: string
  sort_field?: string
  category?: string
  country?: string
  year?: string
}

type ApiEnvelope<T> = Promise<{ data: data<T> }>

type ProviderConfig = {
  key: movieSource
  label: string
  baseURL: string
  priority: number
}

type SearchParams = {
  keyword: string
  page: string
}

const DEFAULT_IMAGE = '/img-error.webp'

const providers: ProviderConfig[] = [
  {
    key: 'ophim',
    label: 'OPhim',
    baseURL: import.meta.env.VITE_API_URL || 'https://ophim1.com',
    priority: 1
  },
  {
    key: 'kkphim',
    label: 'KKPhim',
    baseURL: import.meta.env.VITE_KKPHIM_API_URL || 'https://phimapi.com',
    priority: 2
  },
  {
    key: 'vsmov',
    label: 'VSMOV',
    baseURL: import.meta.env.VITE_VSMOV_API_URL || 'https://vsmov.com/api',
    priority: 3
  },
  {
    key: 'nguonc',
    label: 'Nguonc',
    baseURL: import.meta.env.VITE_NGUONC_API_URL || 'https://phim.nguonc.com/api',
    priority: 4
  }
]

const providerMap = providers.reduce<Record<movieSource, ProviderConfig>>(
  (result, provider) => {
    result[provider.key] = provider
    return result
  },
  {} as Record<movieSource, ProviderConfig>
)

const clients = providers.reduce<Record<movieSource, AxiosInstance>>(
  (result, provider) => {
    result[provider.key] = axios.create({
      baseURL: provider.baseURL,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      responseType: 'json',
      timeout: 12000
    })
    return result
  },
  {} as Record<movieSource, AxiosInstance>
)

const providerOrder: movieSource[] = ['ophim', 'kkphim', 'vsmov', 'nguonc']
const optionProviderOrder: movieSource[] = ['ophim', 'kkphim', 'vsmov']
const manualSourceLabels: Record<movieSource, string> = {
  ophim: 'vietsub 1',
  kkphim: 'vietsub 2',
  vsmov: 'thuyết minh 1',
  nguonc: 'thuyết minh 2'
}

const getProviderIndex = (source: movieSource) => providerOrder.findIndex((item) => item === source) + 1

const hasPlayableEpisodeLink = (episode: episodeData) => Boolean(episode.link_embed || episode.link_m3u8)

const describeProviderError = (error: unknown) => {
  if (!isAxiosError(error)) {
    return error instanceof Error ? error.message : 'Lỗi không xác định'
  }

  const responseStatus = error.response?.status
  const responseMessage =
    toStringValue((error.response?.data as Record<string, unknown> | undefined)?.message) || error.message

  if (responseStatus) {
    return `HTTP ${responseStatus}${responseMessage ? ` - ${responseMessage}` : ''}`
  }

  if (error.code === 'ECONNABORTED') {
    return `Timeout - ${responseMessage || 'Provider phản hồi quá chậm'}`
  }

  return responseMessage || 'Lỗi axios không xác định'
}

const logProviderDebug = (
  message: string,
  payload?: Record<string, unknown>,
  level: 'info' | 'warn' | 'error' = 'info'
) => {
  const prefix = `[Provider Debug] ${message}`
  if (level === 'warn') {
    console.warn(prefix, payload ?? {})
    return
  }

  if (level === 'error') {
    console.error(prefix, payload ?? {})
    return
  }

  console.info(prefix, payload ?? {})
}

const wrapData = <T>(payload: T, message = 'Tải dữ liệu thành công'): { data: data<T> } => ({
  data: {
    status: 'success',
    message,
    data: payload
  }
})

const uniqueStrings = (values: Array<string | undefined | null>) =>
  Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]))

const toStringValue = (value: unknown) => {
  if (value === null || value === undefined) return ''
  return String(value)
}

const toNumberValue = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()

const slugify = (value: string) =>
  normalizeText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const cleanServerName = (value: string) => value.replace(/\s+/g, ' ').trim()

const joinUrl = (base: string, path: string) => {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path
  return `${normalizedBase}${normalizedPath}`
}

const buildImageCandidates = ({
  provider,
  value,
  imageBase,
  kind
}: {
  provider: ProviderConfig
  value: string
  imageBase?: string
  kind: 'thumb' | 'poster'
}) => {
  const rawValue = toStringValue(value)
  const candidates: string[] = []

  if (rawValue) {
    candidates.push(rawValue)

    if (!/^https?:\/\//i.test(rawValue)) {
      if (imageBase) {
        candidates.push(joinUrl(imageBase, rawValue))
      }

      if (provider.key === 'ophim' || provider.key === 'kkphim') {
        candidates.push(joinUrl('https://img.ophim.live/uploads/movies', rawValue))
        candidates.push(joinUrl('https://img.ophim1.com/uploads/movies', rawValue))
        candidates.push(joinUrl('https://phimimg.com', rawValue))
      }

      if (provider.key === 'vsmov') {
        candidates.push(joinUrl('https://vsmov.com/storage/images', rawValue))
      }
    }
  }

  if (provider.key === 'ophim' || provider.key === 'kkphim') {
    const fallbackName = rawValue.split('/').filter(Boolean).pop()
    if (fallbackName) {
      candidates.push(joinUrl('https://img.ophim.live/uploads/movies', fallbackName))
      candidates.push(joinUrl('https://img.ophim1.com/uploads/movies', fallbackName))
      candidates.push(joinUrl('https://phimimg.com/uploads/movies', fallbackName))
    }
  }

  if (kind === 'poster' && candidates.length === 0) {
    candidates.push(DEFAULT_IMAGE)
  }

  return uniqueStrings(candidates)
}

const normalizeTaxonomyItems = (input: unknown): taxonomyItem[] => {
  if (Array.isArray(input)) {
    return input
      .map((entry, index) => {
        const record = entry as Record<string, unknown>
        const name = toStringValue(record.name)
        if (!name) return null
        return {
          id: toStringValue(record.id ?? record._id ?? index),
          name,
          slug: toStringValue(record.slug) || slugify(name)
        }
      })
      .filter(Boolean) as taxonomyItem[]
  }

  if (input && typeof input === 'object') {
    return Object.values(input as Record<string, unknown>).flatMap((groupEntry) => {
      const record = groupEntry as Record<string, unknown>
      const list = Array.isArray(record.list) ? record.list : []
      return list
        .map((item, index) => {
          const listRecord = item as Record<string, unknown>
          const name = toStringValue(listRecord.name)
          if (!name) return null
          return {
            id: toStringValue(listRecord.id ?? listRecord._id ?? index),
            name,
            slug: toStringValue(listRecord.slug) || slugify(name)
          }
        })
        .filter(Boolean) as taxonomyItem[]
    })
  }

  return []
}

const pickNguoncCountry = (categoryInput: unknown) => {
  if (!categoryInput || typeof categoryInput !== 'object') return []
  return Object.values(categoryInput as Record<string, unknown>).flatMap((entry) => {
    const record = entry as Record<string, unknown>
    const group = record.group as Record<string, unknown> | undefined
    const list = Array.isArray(record.list) ? record.list : []
    return toStringValue(group?.name) === 'Quốc gia' ? normalizeTaxonomyItems(list) : []
  })
}

const pickNguoncCategory = (categoryInput: unknown) => {
  if (!categoryInput || typeof categoryInput !== 'object') return []
  return Object.values(categoryInput as Record<string, unknown>).flatMap((entry) => {
    const record = entry as Record<string, unknown>
    const group = record.group as Record<string, unknown> | undefined
    const list = Array.isArray(record.list) ? record.list : []
    return toStringValue(group?.name) === 'Thể loại' ? normalizeTaxonomyItems(list) : []
  })
}

const createDefaultSeo = (title: string, ogImage: string[], ogUrl: string) => ({
  og_type: 'website',
  titleHead: title,
  descriptionHead: title,
  og_image: ogImage,
  og_url: ogUrl
})

const createDefaultFilmSeo = (title: string, ogImage: string[], ogUrl: string): film['seoOnPage'] => ({
  og_type: 'website',
  titleHead: title,
  descriptionHead: title,
  og_image: ogImage,
  og_url: ogUrl,
  updated_time: Date.now(),
  seoSchema: {
    name: title,
    dateModified: '',
    dateCreated: '',
    url: ogUrl,
    datePublished: '',
    image: ogImage[0] || DEFAULT_IMAGE,
    director: ''
  }
})

const normalizeItem = ({
  rawItem,
  provider,
  imageBase
}: {
  rawItem: Record<string, unknown>
  provider: ProviderConfig
  imageBase?: string
}): items => {
  const thumbCandidates = buildImageCandidates({
    provider,
    value: toStringValue(rawItem.thumb_url),
    imageBase,
    kind: 'thumb'
  })
  const posterCandidates = buildImageCandidates({
    provider,
    value: toStringValue(rawItem.poster_url),
    imageBase,
    kind: 'poster'
  })
  const name = toStringValue(rawItem.name)
  const slug = toStringValue(rawItem.slug)
  const category =
    provider.key === 'nguonc' ? pickNguoncCategory(rawItem.category) : normalizeTaxonomyItems(rawItem.category)
  const country =
    provider.key === 'nguonc' ? pickNguoncCountry(rawItem.category) : normalizeTaxonomyItems(rawItem.country)

  return {
    modified: {
      time: toStringValue(
        (rawItem.modified as Record<string, unknown> | undefined)?.time ?? rawItem.modified ?? rawItem.created
      )
    },
    _id: toStringValue(rawItem._id ?? rawItem.id ?? slug),
    name,
    slug,
    origin_name: toStringValue(rawItem.origin_name ?? rawItem.original_name),
    type: toStringValue(rawItem.type),
    thumb_url: thumbCandidates[0] || posterCandidates[0] || DEFAULT_IMAGE,
    poster_url: posterCandidates[0] || thumbCandidates[0] || DEFAULT_IMAGE,
    sub_docquyen: Boolean(rawItem.sub_docquyen),
    chieurap: Boolean(rawItem.chieurap),
    time: toStringValue(rawItem.time),
    episode_current: toStringValue(rawItem.episode_current ?? rawItem.current_episode),
    quality: toStringValue(rawItem.quality),
    lang: toStringValue(rawItem.lang ?? rawItem.language),
    year: toNumberValue(rawItem.year ?? rawItem.release_year),
    category,
    country,
    source: provider.key,
    source_label: provider.label,
    image_urls: {
      thumb: thumbCandidates.length ? thumbCandidates : posterCandidates,
      poster: posterCandidates.length ? posterCandidates : thumbCandidates
    },
    source_slugs: {
      [provider.key]: slug
    }
  }
}

const normalizePagination = (input: Record<string, unknown>, fallbackPage: number) => ({
  totalItems: toNumberValue(input.totalItems ?? input.total_items),
  totalItemsPerPage: toNumberValue(input.totalItemsPerPage ?? input.items_per_page, 24),
  currentPage: toNumberValue(input.currentPage ?? input.current_page, fallbackPage),
  pageRanges: toNumberValue(input.pageRanges ?? input.totalPages ?? input.total_page)
})

const normalizeListResponse = ({
  payload,
  provider,
  type,
  params
}: {
  payload: Record<string, unknown>
  provider: ProviderConfig
  type: string
  params?: paramOption
}): list => {
  const nestedData = (payload.data as Record<string, unknown> | undefined) ?? payload
  const itemsData = (nestedData.items as unknown[]) ?? (payload.items as unknown[]) ?? []
  const imageBase = toStringValue(nestedData.pathImage ?? payload.pathImage)
  const mappedItems = itemsData.map((item) =>
    normalizeItem({
      rawItem: item as Record<string, unknown>,
      provider,
      imageBase
    })
  )
  const paginationSource = ((nestedData.params as Record<string, unknown> | undefined)?.pagination ??
    (nestedData.pagination as Record<string, unknown> | undefined) ??
    (payload.pagination as Record<string, unknown> | undefined) ??
    (nestedData.paginate as Record<string, unknown> | undefined) ??
    ({} as Record<string, unknown>)) as Record<string, unknown>
  const currentPage = toNumberValue(params?.page, 1)
  const pagination = normalizePagination(paginationSource, currentPage)
  const title = toStringValue(nestedData.titlePage) || `Danh sách ${type}`
  const ogImages = uniqueStrings(
    ((nestedData.seoOnPage as Record<string, unknown> | undefined)?.og_image as string[] | undefined) ?? [
      mappedItems[0]?.poster_url,
      mappedItems[0]?.thumb_url
    ]
  )

  return {
    seoOnPage:
      (nestedData.seoOnPage as list['seoOnPage'] | undefined) ??
      createDefaultSeo(title, ogImages, `${PATH.list}/${type}`),
    breadCrumb: (nestedData.breadCrumb as list['breadCrumb']) ?? [],
    titlePage: title,
    items: mappedItems,
    params: {
      type_slug: type,
      filterCategory: params?.category ? [params.category] : [],
      filterCountry: params?.country ? [params.country] : [],
      filterYear: params?.year || '',
      filterType: type,
      sortField: params?.sort_field || 'modified.time',
      sortType: 'desc',
      pagination
    }
  }
}

const normalizeOptionResponse = (payload: Record<string, unknown>): option => {
  const nestedData = (payload.data as Record<string, unknown> | undefined) ?? payload
  const rawItems = ((nestedData.items as unknown[]) ?? (payload.items as unknown[]) ?? []) as Record<string, unknown>[]
  return {
    items: rawItems.map((item, index) => ({
      name: toStringValue(item.name),
      slug: toStringValue(item.slug),
      _id: toStringValue(item._id ?? item.id ?? index)
    }))
  }
}

const normalizeEpisodeData = (input: Record<string, unknown>): episodeData => ({
  name: toStringValue(input.name || 'Full'),
  slug: toStringValue(input.slug ?? slugify(toStringValue(input.name || 'full'))),
  filename: toStringValue(input.filename ?? input.name ?? 'Episode'),
  link_embed: toStringValue(input.link_embed ?? input.embed),
  link_m3u8: toStringValue(input.link_m3u8 ?? input.m3u8)
})

const createEpisodeMergeKey = (episode: episodeData) => {
  const slugValue = slugify(episode.slug)
  if (slugValue) return `slug:${slugValue}`

  const filenameValue = slugify(episode.filename)
  if (filenameValue) return `file:${filenameValue}`

  return `name:${slugify(episode.name || 'full')}`
}

const mergeEpisodeEntries = (episodes: episodeData[]) =>
  Array.from(
    episodes.reduce<Map<string, episodeData>>((result, episode) => {
      const mergeKey = createEpisodeMergeKey(episode)
      const currentEntry = result.get(mergeKey)

      if (!currentEntry) {
        result.set(mergeKey, episode)
        return result
      }

      result.set(mergeKey, {
        ...currentEntry,
        name: currentEntry.name || episode.name,
        slug: currentEntry.slug || episode.slug,
        filename: currentEntry.filename || episode.filename,
        link_embed: currentEntry.link_embed || episode.link_embed,
        link_m3u8: currentEntry.link_m3u8 || episode.link_m3u8
      })
      return result
    }, new Map())
  ).map(([, value]) => value)

const normalizeFilmResponse = ({
  payload,
  provider
}: {
  payload: Record<string, unknown>
  provider: ProviderConfig
}): film => {
  const nestedData = (payload.data as Record<string, unknown> | undefined) ?? payload
  const movieRaw =
    (nestedData.item as Record<string, unknown> | undefined) ??
    (payload.movie as Record<string, unknown> | undefined) ??
    (nestedData.movie as Record<string, unknown> | undefined) ??
    {}
  const imageBase = toStringValue(nestedData.pathImage ?? payload.pathImage)
  const baseItem = normalizeItem({
    rawItem: movieRaw,
    provider,
    imageBase
  })
  const rawEpisodes = ((nestedData.episodes as unknown[]) ?? (payload.episodes as unknown[]) ?? []) as Record<
    string,
    unknown
  >[]

  const servers: episodeServer[] = rawEpisodes
    .map((server, index) => {
      const rawServerItems = ((server.server_data as unknown[]) ?? (server.items as unknown[]) ?? []) as Record<
        string,
        unknown
      >[]
      const normalizedEpisodes = rawServerItems.map(normalizeEpisodeData)
      const serverData = normalizedEpisodes.filter(hasPlayableEpisodeLink)
      const originalServerName = cleanServerName(toStringValue(server.server_name || `${provider.label} ${index + 1}`))
      const totalEpisodes = normalizedEpisodes.length
      const playableEpisodes = serverData.length
      const serverStatus: episodeServer['status'] = playableEpisodes > 0 ? 'ready' : 'error'
      const issue =
        totalEpisodes === 0
          ? 'Server không trả về tập nào'
          : playableEpisodes === 0
          ? 'Tất cả tập của server đều thiếu link embed và m3u8'
          : undefined

      if (totalEpisodes !== playableEpisodes) {
        logProviderDebug(`Provider ${getProviderIndex(provider.key)} - lọc tập không hợp lệ`, {
          provider: provider.label,
          source: provider.key,
          server: originalServerName,
          totalEpisodes,
          playableEpisodes,
          removedEpisodes: totalEpisodes - playableEpisodes,
          removedReason: 'Thiếu link embed và m3u8'
        })
      }

      if (totalEpisodes === 0) return null

      return {
        server_name: originalServerName,
        original_server_name: originalServerName,
        source: provider.key,
        source_label: provider.label,
        priority: provider.priority,
        total_episodes: totalEpisodes,
        playable_episodes: playableEpisodes,
        status: serverStatus,
        issue,
        server_data: serverData
      }
    })
    .filter(Boolean) as episodeServer[]

  const providerTotalEpisodes = servers.reduce((total, server) => total + server.total_episodes, 0)
  const providerPlayableEpisodes = mergeEpisodeEntries(servers.flatMap((server) => server.server_data)).length
  const providerStatus: 'ready' | 'error' = providerPlayableEpisodes > 0 ? 'ready' : 'error'
  const providerIssue =
    rawEpisodes.length === 0
      ? 'Provider không trả về server nào'
      : providerPlayableEpisodes === 0
      ? 'Provider có dữ liệu nhưng không còn source phát hợp lệ sau normalize'
      : undefined

  logProviderDebug(`Provider ${getProviderIndex(provider.key)} - normalize hoàn tất`, {
    provider: provider.label,
    source: provider.key,
    totalServers: rawEpisodes.length,
    normalizedServers: servers.length,
    totalEpisodes: providerTotalEpisodes,
    playableEpisodes: providerPlayableEpisodes,
    status: providerStatus,
    issue: providerIssue || null
  })

  const seoOnPage =
    (nestedData.seoOnPage as film['seoOnPage'] | undefined) ??
    createDefaultFilmSeo(baseItem.name, [baseItem.poster_url, baseItem.thumb_url], `${PATH.film}/${baseItem.slug}`)

  return {
    seoOnPage: {
      ...seoOnPage,
      seoSchema:
        seoOnPage.seoSchema ??
        ({
          name: baseItem.name,
          dateModified: baseItem.modified.time,
          dateCreated: baseItem.modified.time,
          url: `${PATH.film}/${baseItem.slug}`,
          datePublished: baseItem.modified.time,
          image: baseItem.poster_url,
          director: toStringValue(movieRaw.director)
        } as film['seoOnPage']['seoSchema']),
      og_image: uniqueStrings(seoOnPage.og_image ?? [baseItem.poster_url, baseItem.thumb_url]),
      updated_time: seoOnPage.updated_time ?? Date.now()
    },
    breadCrumb: (nestedData.breadCrumb as film['breadCrumb']) ?? [],
    params: {
      slug: baseItem.slug
    },
    item: {
      created: {
        time: toStringValue(
          (movieRaw.created as Record<string, unknown> | undefined)?.time ?? movieRaw.created ?? baseItem.modified.time
        )
      },
      modified: {
        time: baseItem.modified.time
      },
      _id: baseItem._id,
      name: baseItem.name,
      origin_name: baseItem.origin_name,
      content: toStringValue(movieRaw.content ?? movieRaw.description),
      type: baseItem.type,
      status: toStringValue(movieRaw.status),
      thumb_url: baseItem.thumb_url,
      poster_url: baseItem.poster_url,
      is_copyright: Boolean(movieRaw.is_copyright),
      sub_docquyen: baseItem.sub_docquyen,
      chieurap: baseItem.chieurap,
      trailer_url: toStringValue(movieRaw.trailer_url),
      time: baseItem.time,
      episode_current: baseItem.episode_current,
      episode_total: toStringValue(movieRaw.episode_total ?? movieRaw.total_episodes),
      quality: baseItem.quality,
      lang: baseItem.lang,
      notify: toStringValue(movieRaw.notify),
      showtimes: toStringValue(movieRaw.showtimes),
      slug: baseItem.slug,
      year: baseItem.year,
      view: toNumberValue(movieRaw.view),
      actor: Array.isArray(movieRaw.actor)
        ? (movieRaw.actor as string[])
        : uniqueStrings(
            toStringValue(movieRaw.casts)
              .split(',')
              .map((entry) => entry.trim())
          ),
      director: Array.isArray(movieRaw.director)
        ? (movieRaw.director as string[])
        : uniqueStrings(
            toStringValue(movieRaw.director)
              .split(',')
              .map((entry) => entry.trim())
          ),
      category: baseItem.category,
      country: baseItem.country,
      source: baseItem.source,
      source_label: baseItem.source_label,
      image_urls: baseItem.image_urls,
      available_sources: [
        {
          source: provider.key,
          label: provider.label,
          slug: baseItem.slug,
          provider_index: getProviderIndex(provider.key),
          total_episodes: providerTotalEpisodes,
          playable_episodes: providerPlayableEpisodes,
          status: providerStatus,
          issue: providerIssue
        }
      ],
      source_slugs: baseItem.source_slugs,
      episodes: servers
    }
  }
}

const getFilmByProvider = async (provider: ProviderConfig, slug: string) => {
  const response = await clients[provider.key].get<Record<string, unknown>>(getProviderFilmEndpoint(provider.key, slug))
  return normalizeFilmResponse({
    payload: response.data,
    provider
  })
}

const searchFilmsByProvider = async (provider: ProviderConfig, keyword: string) => {
  const searchParams: SearchParams = {
    keyword,
    page: '1'
  }
  const response = await clients[provider.key].get<Record<string, unknown>>(getProviderSearchEndpoint(provider.key), {
    params: buildRequestParams(provider.key, searchParams)
  })

  return normalizeListResponse({
    payload: response.data,
    provider,
    type: PATH.search,
    params: searchParams
  }).items
}

const scoreFilmCandidate = (
  baseItem: film['item'],
  candidate: Pick<items, 'name' | 'origin_name' | 'year' | 'type' | 'slug'>
) => {
  const baseNames = uniqueStrings([baseItem.origin_name, baseItem.name])
  const candidateNames = uniqueStrings([candidate.origin_name, candidate.name])
  const baseSlug = slugify(baseItem.slug)
  const candidateSlug = slugify(candidate.slug)
  let score = 0

  if (baseSlug && candidateSlug) {
    if (baseSlug === candidateSlug) {
      score = Math.max(score, 150)
    } else if (baseSlug.includes(candidateSlug) || candidateSlug.includes(baseSlug)) {
      score = Math.max(score, 85)
    }
  }

  for (const baseName of baseNames) {
    const normalizedBaseName = normalizeText(baseName)
    if (!normalizedBaseName) continue

    for (const candidateName of candidateNames) {
      const normalizedCandidateName = normalizeText(candidateName)
      if (!normalizedCandidateName) continue

      if (normalizedBaseName === normalizedCandidateName) {
        score = Math.max(score, 120)
        continue
      }

      const comparableLength = Math.min(normalizedBaseName.length, normalizedCandidateName.length)
      if (
        comparableLength >= 6 &&
        (normalizedBaseName.includes(normalizedCandidateName) || normalizedCandidateName.includes(normalizedBaseName))
      ) {
        score = Math.max(score, 70)
      }
    }
  }

  if (baseItem.year && candidate.year && baseItem.year === candidate.year) {
    score += 20
  }

  if (baseItem.type && candidate.type && baseItem.type === candidate.type) {
    score += 10
  }

  return score
}

const findAlternativeFilmForProvider = async (provider: ProviderConfig, baseItem: film['item']) => {
  const keywords = uniqueStrings([baseItem.origin_name, baseItem.name, baseItem.slug.replace(/-/g, ' ')])
  let bestMatch: items | null = null
  let bestScore = 0

  for (const keyword of keywords) {
    try {
      const candidates = await searchFilmsByProvider(provider, keyword)
      for (const candidate of candidates) {
        const score = scoreFilmCandidate(baseItem, candidate)
        if (score > bestScore) {
          bestMatch = candidate
          bestScore = score
        }
      }
    } catch {
      continue
    }
  }

  if (!bestMatch || bestScore < 80) return null

  try {
    const matchedFilm = await getFilmByProvider(provider, bestMatch.slug)
    return scoreFilmCandidate(baseItem, matchedFilm.item) >= 80 ? matchedFilm : null
  } catch {
    return null
  }
}

const mergeFilmData = (films: film[]) => {
  const [primary, ...restFilms] = films
  const mergedImageUrls: imageSet = {
    thumb: uniqueStrings(films.flatMap((entry) => entry.item.image_urls.thumb)),
    poster: uniqueStrings(films.flatMap((entry) => entry.item.image_urls.poster))
  }
  const mergedEpisodes = films
    .flatMap((entry) => {
      const provider = providerMap[entry.item.source]
      const mergedServerData = mergeEpisodeEntries(entry.item.episodes.flatMap((server) => server.server_data))
      const totalEpisodes =
        entry.item.available_sources[0]?.total_episodes ||
        entry.item.episodes.reduce((total, server) => total + server.total_episodes, 0)
      const mergedStatus: episodeServer['status'] = mergedServerData.length > 0 ? 'ready' : 'error'
      const issue =
        entry.item.available_sources[0]?.issue ||
        (!mergedServerData.length ? 'Provider không còn source phát hợp lệ sau merge' : undefined)

      logProviderDebug(`Provider ${getProviderIndex(entry.item.source)} - merge hoàn tất`, {
        provider: entry.item.source_label,
        source: entry.item.source,
        totalEpisodes,
        playableEpisodes: mergedServerData.length,
        serversBeforeMerge: entry.item.episodes.length,
        sourceLabels: entry.item.episodes.map((server) => server.original_server_name),
        status: mergedStatus,
        issue: issue || null
      })

      return [
        {
          server_name: manualSourceLabels[entry.item.source],
          original_server_name:
            uniqueStrings(entry.item.episodes.map((server) => server.original_server_name)).join(' / ') ||
            provider.label,
          source: entry.item.source,
          source_label: entry.item.source_label,
          priority: provider.priority,
          total_episodes: totalEpisodes,
          playable_episodes: mergedServerData.length,
          status: mergedStatus,
          issue,
          server_data: mergedServerData
        }
      ]
    })
    .sort((left, right) => left.priority - right.priority)
  const mergedCategories = Array.from(
    new Map(films.flatMap((entry) => entry.item.category).map((item) => [item.slug, item])).values()
  )
  const mergedCountries = Array.from(
    new Map(films.flatMap((entry) => entry.item.country).map((item) => [item.slug, item])).values()
  )
  const mergedSourceSlugs = films.reduce<Partial<Record<movieSource, string>>>((result, entry) => {
    Object.assign(result, entry.item.source_slugs)
    return result
  }, {})
  const availableSources = Array.from(
    new Map(
      films.map((entry) => [
        entry.item.source,
        entry.item.available_sources[0] ??
          (() => {
            const playableEpisodes = mergeEpisodeEntries(
              entry.item.episodes.flatMap((server) => server.server_data)
            ).length
            return {
              source: entry.item.source,
              label: entry.item.source_label,
              slug: entry.item.slug,
              provider_index: getProviderIndex(entry.item.source),
              total_episodes: entry.item.episodes.reduce((total, server) => total + server.total_episodes, 0),
              playable_episodes: playableEpisodes,
              status: playableEpisodes > 0 ? 'ready' : 'error',
              issue: undefined
            }
          })()
      ])
    ).values()
  ).sort((left, right) => left.provider_index - right.provider_index)

  return {
    ...primary,
    seoOnPage: {
      ...primary.seoOnPage,
      og_image: uniqueStrings([
        ...(primary.seoOnPage.og_image || []),
        ...mergedImageUrls.poster,
        ...mergedImageUrls.thumb
      ])
    },
    item: {
      ...primary.item,
      content: primary.item.content || restFilms.find((entry) => entry.item.content)?.item.content || '',
      trailer_url:
        primary.item.trailer_url || restFilms.find((entry) => entry.item.trailer_url)?.item.trailer_url || '',
      time: primary.item.time || restFilms.find((entry) => entry.item.time)?.item.time || '',
      quality: primary.item.quality || restFilms.find((entry) => entry.item.quality)?.item.quality || '',
      lang: primary.item.lang || restFilms.find((entry) => entry.item.lang)?.item.lang || '',
      actor: uniqueStrings(films.flatMap((entry) => entry.item.actor)),
      director: uniqueStrings(films.flatMap((entry) => entry.item.director)),
      category: mergedCategories,
      country: mergedCountries,
      image_urls: mergedImageUrls,
      thumb_url: mergedImageUrls.thumb[0] || primary.item.thumb_url,
      poster_url: mergedImageUrls.poster[0] || primary.item.poster_url,
      available_sources: availableSources,
      source_slugs: mergedSourceSlugs,
      episodes: mergedEpisodes
    }
  }
}

const getProviderSearchEndpoint = (provider: movieSource) => {
  if (provider === 'kkphim') return '/v1/api/tim-kiem'
  if (provider === 'nguonc') return '/films/search'
  return '/tim-kiem'
}

const getProviderListEndpoint = (provider: movieSource, type: string, params?: paramOption) => {
  if (provider === 'kkphim') return `/v1/api/danh-sach/${type}`
  if (provider !== 'nguonc') return `/danh-sach/${type}`

  if (params?.category) return `/films/the-loai/${params.category}`
  if (params?.country) return `/films/quoc-gia/${params.country}`
  if (params?.year) return `/films/nam-phat-hanh/${params.year}`
  if (type === PATH.new) return '/films/phim-moi-cap-nhat'
  return `/films/danh-sach/${type}`
}

const getProviderFilmEndpoint = (provider: movieSource, slug: string) =>
  provider === 'nguonc' ? `/film/${slug}` : `/phim/${slug}`

const getProviderOptionEndpoint = (type: 'genres' | 'country') => (type === 'genres' ? '/the-loai' : '/quoc-gia')

const buildRequestParams = (provider: movieSource, params?: paramOption | SearchParams) => {
  if (provider === 'nguonc') {
    return {
      page: params?.page || '1',
      keyword: 'keyword' in (params || {}) ? (params as SearchParams).keyword : undefined
    }
  }

  return params
}

const isAxios404 = (error: unknown) => {
  if (!isAxiosError(error)) return false
  return (error as AxiosError).response?.status === 404
}

const firstSuccessful = async <T>({
  sourceOrder,
  executor
}: {
  sourceOrder: movieSource[]
  executor: (provider: ProviderConfig) => Promise<T>
}) => {
  let lastError: unknown

  for (const source of sourceOrder) {
    try {
      return await executor(providerMap[source])
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Không thể tải dữ liệu từ các nguồn phim.')
}

const filmApis = {
  async getGenres(): ApiEnvelope<option> {
    return firstSuccessful({
      sourceOrder: optionProviderOrder,
      executor: async (provider) => {
        const response = await clients[provider.key].get<Record<string, unknown>>(getProviderOptionEndpoint('genres'))
        return wrapData(normalizeOptionResponse(response.data), `Đã tải thể loại từ ${provider.label}`)
      }
    })
  },
  async getCountry(): ApiEnvelope<option> {
    return firstSuccessful({
      sourceOrder: optionProviderOrder,
      executor: async (provider) => {
        const response = await clients[provider.key].get<Record<string, unknown>>(getProviderOptionEndpoint('country'))
        return wrapData(normalizeOptionResponse(response.data), `Đã tải quốc gia từ ${provider.label}`)
      }
    })
  },
  async getListFilm(type: string, params?: paramOption): ApiEnvelope<list> {
    return firstSuccessful({
      sourceOrder: providerOrder,
      executor: async (provider) => {
        const response = await clients[provider.key].get<Record<string, unknown>>(
          getProviderListEndpoint(provider.key, type, params),
          {
            params: buildRequestParams(provider.key, params)
          }
        )
        return wrapData(
          normalizeListResponse({
            payload: response.data,
            provider,
            type,
            params
          }),
          `Đã tải danh sách từ ${provider.label}`
        )
      }
    })
  },
  async getSearchFilm(params: SearchParams): ApiEnvelope<list> {
    return firstSuccessful({
      sourceOrder: providerOrder,
      executor: async (provider) => {
        const response = await clients[provider.key].get<Record<string, unknown>>(
          getProviderSearchEndpoint(provider.key),
          {
            params: buildRequestParams(provider.key, params)
          }
        )
        return wrapData(
          normalizeListResponse({
            payload: response.data,
            provider,
            type: PATH.search,
            params
          }),
          `Đã tải tìm kiếm từ ${provider.label}`
        )
      }
    })
  },
  async getFilm(slug: string): ApiEnvelope<film> {
    logProviderDebug('Bắt đầu tải phim đa provider', {
      slug,
      providers: providerOrder.map((source) => ({
        providerIndex: getProviderIndex(source),
        source,
        label: providerMap[source].label
      }))
    })

    const settledResults = await Promise.allSettled(
      providerOrder.map(async (source) => getFilmByProvider(providerMap[source], slug))
    )

    settledResults.forEach((result, index) => {
      const source = providerOrder[index]
      const provider = providerMap[source]

      if (result.status === 'fulfilled') {
        const providerInfo = result.value.item.available_sources[0]
        logProviderDebug(`Provider ${getProviderIndex(source)} - fetch thành công`, {
          provider: provider.label,
          source,
          slug: result.value.item.slug,
          totalEpisodes: providerInfo?.total_episodes ?? 0,
          playableEpisodes: providerInfo?.playable_episodes ?? 0,
          status: providerInfo?.status ?? 'error',
          issue: providerInfo?.issue || null
        })
        return
      }

      logProviderDebug(
        `Provider ${getProviderIndex(source)} - fetch thất bại`,
        {
          provider: provider.label,
          source,
          slug,
          reason: describeProviderError(result.reason)
        },
        'warn'
      )
    })

    const successfulFilms = settledResults
      .flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
      .sort((left, right) => providerMap[left.item.source].priority - providerMap[right.item.source].priority)

    if (!successfulFilms.length) {
      const notFoundError = settledResults.find((result) => result.status === 'rejected' && !isAxios404(result.reason))
      if (notFoundError && notFoundError.status === 'rejected') {
        throw notFoundError.reason
      }
      throw new Error('Không tìm thấy phim ở tất cả nguồn đã cấu hình.')
    }

    const fetchedSources = new Set(successfulFilms.map((entry) => entry.item.source))
    const primaryFilm = successfulFilms[0]
    const missingSources = providerOrder.filter((source) => !fetchedSources.has(source))
    if (missingSources.length) {
      logProviderDebug('Phát hiện provider còn thiếu, bắt đầu tìm slug thay thế', {
        slug,
        missingProviders: missingSources.map((source) => ({
          providerIndex: getProviderIndex(source),
          source,
          label: providerMap[source].label
        }))
      })
    }

    const alternativeResults = await Promise.allSettled(
      missingSources.map(async (source) => findAlternativeFilmForProvider(providerMap[source], primaryFilm.item))
    )

    alternativeResults.forEach((result, index) => {
      const source = missingSources[index]
      const provider = providerMap[source]

      if (result.status === 'fulfilled' && result.value) {
        const providerInfo = result.value.item.available_sources[0]
        logProviderDebug(`Provider ${getProviderIndex(source)} - tìm slug thay thế thành công`, {
          provider: provider.label,
          source,
          matchedSlug: result.value.item.slug,
          totalEpisodes: providerInfo?.total_episodes ?? 0,
          playableEpisodes: providerInfo?.playable_episodes ?? 0,
          status: providerInfo?.status ?? 'error',
          issue: providerInfo?.issue || null
        })
        return
      }

      if (result.status === 'rejected') {
        logProviderDebug(
          `Provider ${getProviderIndex(source)} - không lấy được provider thay thế`,
          {
            provider: provider.label,
            source,
            reason: describeProviderError(result.reason)
          },
          'warn'
        )
        return
      }

      logProviderDebug(
        `Provider ${getProviderIndex(source)} - bị loại khỏi kết quả cuối`,
        {
          provider: provider.label,
          source,
          reason: 'Không tìm được phim tương ứng đủ điểm khớp hoặc provider không có dữ liệu thay thế'
        },
        'warn'
      )
    })

    const alternativeFilms = alternativeResults.flatMap((result) =>
      result.status === 'fulfilled' && result.value ? [result.value] : []
    )
    const mergedFilms = [...successfulFilms, ...alternativeFilms].sort(
      (left, right) => providerMap[left.item.source].priority - providerMap[right.item.source].priority
    )
    const mergedFilm = mergeFilmData(mergedFilms)

    logProviderDebug('Kết quả merge provider cuối cùng', {
      slug,
      totalProviders: mergedFilm.item.available_sources.length,
      providers: mergedFilm.item.available_sources.map((provider) => ({
        providerIndex: provider.provider_index,
        source: provider.source,
        label: provider.label,
        totalEpisodes: provider.total_episodes,
        playableEpisodes: provider.playable_episodes,
        status: provider.status,
        issue: provider.issue || null
      }))
    })

    return wrapData(mergedFilm, 'Đã tải chi tiết phim từ nhiều nguồn')
  }
}
export default filmApis
