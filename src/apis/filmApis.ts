import axios, { AxiosError, AxiosInstance, isAxiosError } from 'axios'
import { data, episodeData, episodeServer, film, items, list, movieSource, option, taxonomyItem } from 'src/types'
import providerAdapters, { optionProviderOrder, providerMap, providerOrder } from './filmSourceAdapters'
import type { ProviderAdapter, ProviderSearchParams } from './filmSourceAdapters'
import PATH from '../utils/path'
import { aggregateDetailResults, mapLegacyItemToUnifiedMovie } from 'src/services/detail-aggregation.service'
import { aggregateHomeSections } from 'src/services/home-aggregation.service'
import { buildRecommendations } from 'src/services/recommendation.service'
import { aggregateSearchResults } from 'src/services/search-aggregation.service'
import { aggregateLegacyItems, sortAggregatedEntries } from 'src/services/aggregation-shared'

export type paramOption = {
  page?: string
  sort_field?: string
  category?: string
  country?: string
  year?: string
}

type ApiEnvelope<T> = Promise<{ data: data<T> }>
type HomeSectionResponse = {
  key: string
  title: string
  items: items[]
}

type HomeSectionsPayload = {
  sections: HomeSectionResponse[]
}

const DEFAULT_IMAGE = '/img-error.webp'
type SearchParams = ProviderSearchParams

const clients = providerAdapters.reduce<Record<movieSource, AxiosInstance>>(
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
  provider: ProviderAdapter
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
  provider: ProviderAdapter
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
  provider: ProviderAdapter
  type: string
  params?: paramOption
}): list => {
  const nestedData = provider.extractListPayload(payload)
  const itemsData = provider.extractListItems(payload)
  const imageBase = toStringValue(provider.extractImageBase(payload))
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

const normalizeOptionResponse = (payload: Record<string, unknown>, provider: ProviderAdapter): option => {
  const rawItems = provider.extractOptionItems(payload) as Record<string, unknown>[]
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

const inferVersionLabel = (serverName: string, fallbackLang: string) => {
  const normalizedServerName = cleanServerName(serverName).toLowerCase()
  const normalizedLang = fallbackLang.trim().toLowerCase()

  if (
    normalizedServerName.includes('thuyet minh') ||
    normalizedServerName.includes('thuyết minh') ||
    normalizedLang.includes('thuyet minh') ||
    normalizedLang.includes('thuyết minh')
  ) {
    return 'Thuyết minh'
  }

  if (
    normalizedServerName.includes('vietsub') ||
    normalizedServerName.includes('viet sub') ||
    normalizedLang.includes('vietsub') ||
    normalizedLang.includes('viet sub')
  ) {
    return 'Vietsub'
  }

  return 'Vietsub'
}

const normalizeFilmResponse = ({
  payload,
  provider
}: {
  payload: Record<string, unknown>
  provider: ProviderAdapter
}): film => {
  const nestedData = provider.extractListPayload(payload)
  const movieRaw = provider.extractMovie(payload)
  const imageBase = toStringValue(provider.extractImageBase(payload))
  const baseItem = normalizeItem({
    rawItem: movieRaw,
    provider,
    imageBase
  })
  const rawEpisodes = provider.extractEpisodes(payload)

  const servers: episodeServer[] = rawEpisodes
    .map((server, index) => {
      const rawServerItems = ((server.server_data as unknown[]) ?? (server.items as unknown[]) ?? []) as Record<
        string,
        unknown
      >[]
      const serverData = rawServerItems.map(normalizeEpisodeData).filter((entry) => entry.link_embed || entry.link_m3u8)
      if (!serverData.length) return null
      const originalServerName = cleanServerName(toStringValue(server.server_name || `${provider.label} ${index + 1}`))
      return {
        server_name: originalServerName,
        original_server_name: originalServerName,
        source: provider.key,
        source_label: provider.label,
        version_label: inferVersionLabel(originalServerName, baseItem.lang),
        priority: provider.priority,
        server_data: serverData
      }
    })
    .filter(Boolean) as episodeServer[]

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
          slug: baseItem.slug
        }
      ],
      source_slugs: baseItem.source_slugs,
      episodes: servers
    }
  }
}

const getFilmByProvider = async (provider: ProviderAdapter, slug: string) => {
  const response = await clients[provider.key].get<Record<string, unknown>>(provider.buildFilmEndpoint(slug))
  return normalizeFilmResponse({
    payload: response.data,
    provider
  })
}

const searchFilmsByProvider = async (provider: ProviderAdapter, keyword: string) => {
  const searchParams: SearchParams = {
    keyword,
    page: '1'
  }
  const response = await clients[provider.key].get<Record<string, unknown>>(provider.buildSearchEndpoint(), {
    params: provider.buildRequestParams(searchParams)
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

const findAlternativeFilmForProvider = async (provider: ProviderAdapter, baseItem: film['item']) => {
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

type ProviderListResult = {
  provider: ProviderAdapter
  data: list
}

const getListByProvider = async (
  provider: ProviderAdapter,
  type: string,
  params?: paramOption
): Promise<ProviderListResult> => {
  const response = await clients[provider.key].get<Record<string, unknown>>(provider.buildListEndpoint(type, params), {
    params: provider.buildRequestParams(params)
  })

  return {
    provider,
    data: normalizeListResponse({
      payload: response.data,
      provider,
      type,
      params
    })
  }
}

const getSearchByProvider = async (provider: ProviderAdapter, params: SearchParams): Promise<ProviderListResult> => {
  const response = await clients[provider.key].get<Record<string, unknown>>(provider.buildSearchEndpoint(), {
    params: provider.buildRequestParams(params)
  })

  return {
    provider,
    data: normalizeListResponse({
      payload: response.data,
      provider,
      type: PATH.search,
      params
    })
  }
}

const createRecommendationKeyword = (baseFilm: film) => {
  const titleCandidate = uniqueStrings([baseFilm.item.origin_name, baseFilm.item.name])[0] || ''
  const normalizedTitle = titleCandidate
    .split(/[:(|-]/)[0]
    .replace(/\s+/g, ' ')
    .trim()

  return normalizedTitle.split(' ').slice(0, 6).join(' ').trim()
}

const getRecommendationsForFilm = async (baseFilm: film) => {
  const primaryCategory = baseFilm.item.category[0]?.slug
  const primaryCountry = baseFilm.item.country[0]?.slug
  const searchKeyword = createRecommendationKeyword(baseFilm)
  const recommendationRequests = providerOrder.flatMap((source) => {
    const provider = providerMap[source]
    const requests: Array<Promise<ProviderListResult>> = []

    if (primaryCategory) {
      requests.push(
        getListByProvider(provider, PATH.new, {
          page: '1',
          category: primaryCategory
        })
      )
    }

    if (primaryCountry) {
      requests.push(
        getListByProvider(provider, PATH.new, {
          page: '1',
          country: primaryCountry
        })
      )
    }

    if (searchKeyword) {
      requests.push(
        getSearchByProvider(provider, {
          keyword: searchKeyword,
          page: '1'
        })
      )
    }

    return requests
  })

  if (!recommendationRequests.length) return []

  const settledResults = await Promise.allSettled(recommendationRequests)
  const aggregateEntries = sortAggregatedEntries(
    aggregateLegacyItems(
      settledResults
        .flatMap((result) => (result.status === 'fulfilled' ? result.value.data.items : []))
        .map((item, position) => ({
          item,
          position
        }))
    ),
    'modified.time'
  )
  const legacyItemsById = new Map<string, items>()
  const unifiedCandidates = aggregateEntries.map((entry) => {
    const unifiedMovie = mapLegacyItemToUnifiedMovie(entry.item)
    legacyItemsById.set(unifiedMovie.id, entry.item)
    return unifiedMovie
  })
  const recommendationMovies = await buildRecommendations({
    currentMovie: mapLegacyItemToUnifiedMovie(baseFilm.item),
    candidates: unifiedCandidates,
    seenMovieIds: [mapLegacyItemToUnifiedMovie(baseFilm.item).id],
    limit: 10
  })

  return recommendationMovies
    .map((movie) => legacyItemsById.get(movie.id))
    .filter((item): item is items => Boolean(item))
}

const buildAggregatedList = ({
  sources,
  type,
  params,
  message,
  itemsOverride
}: {
  sources: ProviderListResult[]
  type: string
  params?: paramOption
  message: string
  itemsOverride?: items[]
}) => {
  const primarySource = sources[0]
  const currentPage = toNumberValue(params?.page, 1)
  const pageSize = Math.max(
    ...sources.map((source) => source.data.params.pagination.totalItemsPerPage).filter(Boolean),
    24
  )
  const sortedItems =
    itemsOverride ||
    sortAggregatedEntries(
      aggregateLegacyItems(
        sources
          .flatMap((source) => source.data.items)
          .map((item, index) => ({
            item,
            position: index
          }))
      ),
      params?.sort_field || 'modified.time'
    ).map((entry) => entry.item)
  const totalItems = Math.max(
    sortedItems.length + Math.max(currentPage - 1, 0) * pageSize,
    sources.reduce((sum, source) => sum + source.data.params.pagination.totalItems, 0)
  )
  const aggregatedList: list = {
    ...primarySource.data,
    seoOnPage: {
      ...primarySource.data.seoOnPage,
      og_image: uniqueStrings([
        ...primarySource.data.seoOnPage.og_image,
        ...sortedItems.flatMap((item) => item.image_urls.poster).slice(0, 6),
        ...sortedItems.flatMap((item) => item.image_urls.thumb).slice(0, 6)
      ])
    },
    titlePage: primarySource.data.titlePage,
    items: sortedItems.slice(0, pageSize),
    params: {
      ...primarySource.data.params,
      type_slug: type,
      filterCategory: params?.category ? [params.category] : [],
      filterCountry: params?.country ? [params.country] : [],
      filterYear: params?.year || '',
      filterType: type,
      sortField: params?.sort_field || primarySource.data.params.sortField,
      pagination: {
        totalItems,
        totalItemsPerPage: pageSize,
        currentPage,
        pageRanges: Math.max(Math.ceil(totalItems / pageSize), currentPage)
      }
    }
  }

  return wrapData(aggregatedList, message)
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
  executor: (provider: ProviderAdapter) => Promise<T>
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
        const response = await clients[provider.key].get<Record<string, unknown>>(
          provider.buildOptionEndpoint('genres')
        )
        return wrapData(normalizeOptionResponse(response.data, provider), `Đã tải thể loại từ ${provider.label}`)
      }
    })
  },
  async getCountry(): ApiEnvelope<option> {
    return firstSuccessful({
      sourceOrder: optionProviderOrder,
      executor: async (provider) => {
        const response = await clients[provider.key].get<Record<string, unknown>>(
          provider.buildOptionEndpoint('country')
        )
        return wrapData(normalizeOptionResponse(response.data, provider), `Đã tải quốc gia từ ${provider.label}`)
      }
    })
  },
  async getHomeSections(
    params?: paramOption & { keyword?: string },
    featuredYear?: string
  ): ApiEnvelope<HomeSectionsPayload> {
    const [featuredSeries, featuredOdd, latestOdd, latestSeries] = await Promise.all([
      filmApis.getListFilm(PATH.series, {
        ...params,
        page: '1',
        sort_field: 'view',
        year: featuredYear || params?.year || ''
      }),
      filmApis.getListFilm(PATH.odd, {
        ...params,
        page: '1',
        sort_field: 'view',
        year: featuredYear || params?.year || ''
      }),
      filmApis.getListFilm(PATH.odd, {
        ...params,
        page: '1'
      }),
      filmApis.getListFilm(PATH.series, {
        ...params,
        page: '1'
      })
    ])

    const aggregatedHome = await aggregateHomeSections({
      sections: [
        {
          key: 'featured',
          title: 'Phim đề cử',
          items: [...featuredSeries.data.data.items.slice(0, 5), ...featuredOdd.data.data.items.slice(0, 5)],
          maxItems: 10
        },
        {
          key: 'latest-odd',
          title: 'Phim lẻ mới cập nhật',
          items: latestOdd.data.data.items,
          maxItems: 10
        },
        {
          key: 'latest-series',
          title: 'Phim bộ mới cập nhật',
          items: latestSeries.data.data.items,
          maxItems: 10
        }
      ]
    })

    return wrapData(aggregatedHome, 'Đã tải trang chủ từ nhiều nguồn')
  },
  async getListFilm(type: string, params?: paramOption): ApiEnvelope<list> {
    const settledResults = await Promise.allSettled(
      providerOrder.map(async (source) => getListByProvider(providerMap[source], type, params))
    )
    const successfulLists = settledResults.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))

    if (!successfulLists.length) {
      const firstError = settledResults.find((result) => result.status === 'rejected')
      if (firstError && firstError.status === 'rejected') {
        throw firstError.reason
      }

      throw new Error('Không thể tải dữ liệu từ các nguồn phim.')
    }

    return buildAggregatedList({
      sources: successfulLists,
      type,
      params,
      message: 'Đã tải danh sách từ nhiều nguồn'
    })
  },
  async getSearchFilm(params: SearchParams): ApiEnvelope<list> {
    const settledResults = await Promise.allSettled(
      providerOrder.map(async (source) => getSearchByProvider(providerMap[source], params))
    )
    const successfulLists = settledResults.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))

    if (!successfulLists.length) {
      const firstError = settledResults.find((result) => result.status === 'rejected')
      if (firstError && firstError.status === 'rejected') {
        throw firstError.reason
      }

      throw new Error('Không thể tải dữ liệu tìm kiếm từ các nguồn phim.')
    }

    const aggregatedSearch = await aggregateSearchResults({
      keyword: params.keyword,
      items: successfulLists.flatMap((source) => source.data.items)
    })

    return buildAggregatedList({
      sources: successfulLists.map((source, index) => ({
        ...source,
        data: {
          ...source.data,
          items: index === 0 ? aggregatedSearch.items : []
        }
      })),
      type: PATH.search,
      params,
      message: 'Đã tải tìm kiếm từ nhiều nguồn',
      itemsOverride: aggregatedSearch.items
    })
  },
  async getFilm(slug: string): ApiEnvelope<film> {
    const settledResults = await Promise.allSettled(
      providerOrder.map(async (source) => getFilmByProvider(providerMap[source], slug))
    )

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
    const alternativeResults = await Promise.allSettled(
      missingSources.map(async (source) => findAlternativeFilmForProvider(providerMap[source], primaryFilm.item))
    )
    const alternativeFilms = alternativeResults.flatMap((result) =>
      result.status === 'fulfilled' && result.value ? [result.value] : []
    )
    const mergedFilms = [...successfulFilms, ...alternativeFilms].sort(
      (left, right) => providerMap[left.item.source].priority - providerMap[right.item.source].priority
    )
    const aggregatedDetail = await aggregateDetailResults({
      films: mergedFilms
    })
    const recommendations = await getRecommendationsForFilm(aggregatedDetail.legacyFilm)

    return wrapData(
      {
        ...aggregatedDetail.legacyFilm,
        recommendations
      },
      'Đã tải chi tiết phim từ nhiều nguồn'
    )
  }
}
export default filmApis
