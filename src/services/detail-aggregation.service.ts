import { providerMap } from 'src/apis/filmSourceAdapters'
import type { AggregatedDetailResult } from 'src/domain/aggregation.types'
import type { UnifiedEpisode, UnifiedEpisodeServer, UnifiedMovie, UnifiedMovieDetail } from 'src/domain/movie.types'
import type { episodeData, episodeServer, film, imageSet, items, movieSource, taxonomyItem } from 'src/types'
import { createLegacyItemDedupeKeys } from './aggregation-shared'

export type DetailAggregationInput = {
  films: film[]
}

const uniqueStrings = (values: Array<string | undefined | null>) =>
  Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]))

const uniqueTaxonomy = (values: taxonomyItem[]) =>
  Array.from(new Map(values.map((item) => [item.slug || item.id || item.name, item])).values())

const slugifyEpisode = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const createEpisodeMergeKey = (episode: episodeData) => {
  const slugValue = slugifyEpisode(episode.slug)
  if (slugValue) return `slug:${slugValue}`

  const filenameValue = slugifyEpisode(episode.filename)
  if (filenameValue) return `file:${filenameValue}`

  return `name:${slugifyEpisode(episode.name || 'full')}`
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

const extractEpisodeOrder = (episode: episodeData, fallbackIndex: number) => {
  const numericValue = Number(episode.name)
  if (Number.isFinite(numericValue) && numericValue > 0) {
    return numericValue
  }

  const matchedNumber = episode.filename.match(/\d+/)?.[0] ?? episode.slug.match(/\d+/)?.[0]
  if (matchedNumber) {
    return Number(matchedNumber)
  }

  return fallbackIndex + 1
}

const createUnifiedEpisodeServer = (server: episodeServer, index: number): UnifiedEpisodeServer => ({
  serverId: `${server.source}:${server.server_name}:${index}`,
  displayName: server.server_name,
  providerKey: server.source,
  priority: server.priority
})

const createUnifiedEpisode = (
  episode: episodeData,
  server: episodeServer,
  serverIndex: number,
  fallbackIndex: number
): UnifiedEpisode => ({
  episodeKey: createEpisodeMergeKey(episode),
  displayName: episode.name || episode.filename || `Tập ${fallbackIndex + 1}`,
  order: extractEpisodeOrder(episode, fallbackIndex),
  servers: [createUnifiedEpisodeServer(server, serverIndex)]
})

const mergeUnifiedEpisodes = (servers: episodeServer[]) => {
  const episodeMap = new Map<string, UnifiedEpisode>()

  servers.forEach((server, serverIndex) => {
    server.server_data.forEach((episode, episodeIndex) => {
      const nextEpisode = createUnifiedEpisode(episode, server, serverIndex, episodeIndex)
      const currentEpisode = episodeMap.get(nextEpisode.episodeKey)

      if (!currentEpisode) {
        episodeMap.set(nextEpisode.episodeKey, nextEpisode)
        return
      }

      const serverMap = new Map(
        [...currentEpisode.servers, ...nextEpisode.servers].map((entry) => [entry.providerKey, entry] as const)
      )
      currentEpisode.displayName =
        currentEpisode.displayName || nextEpisode.displayName || `Tập ${currentEpisode.order || nextEpisode.order}`
      currentEpisode.order = Math.min(currentEpisode.order, nextEpisode.order)
      currentEpisode.servers = Array.from(serverMap.values()).sort((left, right) => left.priority - right.priority)
    })
  })

  return Array.from(episodeMap.values()).sort((left, right) => left.order - right.order)
}

const mergeLegacyFilms = (films: film[]) => {
  const sortedFilms = [...films].sort(
    (left, right) => providerMap[left.item.source].priority - providerMap[right.item.source].priority
  )
  const [primary, ...restFilms] = sortedFilms
  const mergedImageUrls: imageSet = {
    thumb: uniqueStrings(sortedFilms.flatMap((entry) => entry.item.image_urls.thumb)),
    poster: uniqueStrings(sortedFilms.flatMap((entry) => entry.item.image_urls.poster))
  }
  const mergedEpisodes = sortedFilms
    .flatMap((entry) => {
      const provider = providerMap[entry.item.source]
      const mergedServerData = mergeEpisodeEntries(entry.item.episodes.flatMap((server) => server.server_data))

      if (!mergedServerData.length) return []

      return [
        {
          server_name: provider.sourceButtonLabel,
          original_server_name:
            uniqueStrings(entry.item.episodes.map((server) => server.original_server_name)).join(' / ') ||
            provider.label,
          source: entry.item.source,
          source_label: entry.item.source_label,
          priority: provider.priority,
          server_data: mergedServerData
        }
      ]
    })
    .sort((left, right) => left.priority - right.priority)
  const mergedCategories = uniqueTaxonomy(sortedFilms.flatMap((entry) => entry.item.category))
  const mergedCountries = uniqueTaxonomy(sortedFilms.flatMap((entry) => entry.item.country))
  const mergedSourceSlugs = sortedFilms.reduce<Partial<Record<movieSource, string>>>((result, entry) => {
    Object.assign(result, entry.item.source_slugs)
    return result
  }, {})
  const availableSources = Array.from(
    new Map(
      sortedFilms.map((entry) => [
        entry.item.source,
        {
          source: entry.item.source,
          label: entry.item.source_label,
          slug: entry.item.slug
        }
      ])
    ).values()
  ).sort((left, right) => providerMap[left.source].priority - providerMap[right.source].priority)

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
      actor: uniqueStrings(sortedFilms.flatMap((entry) => entry.item.actor)),
      director: uniqueStrings(sortedFilms.flatMap((entry) => entry.item.director)),
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

export const mapLegacyItemToUnifiedMovie = (item: items): UnifiedMovie => {
  const dedupeKeys = createLegacyItemDedupeKeys(item)

  return {
    id: dedupeKeys[0] || `${item.source}:${item.slug}`,
    canonicalSlug: item.slug,
    titleVi: item.name,
    titleOriginal: item.origin_name,
    year: item.year,
    type: item.type,
    countries: item.country,
    categories: item.category,
    posterCandidates: item.image_urls.poster,
    thumbCandidates: item.image_urls.thumb,
    sources: Object.keys(item.source_slugs || { [item.source]: item.slug }) as Array<keyof typeof providerMap>,
    sourceSlugs: {
      [item.source]: item.slug,
      ...(item.source_slugs || {})
    },
    dedupeKeys
  }
}

const mapLegacyFilmToUnifiedMovieDetail = (legacyFilm: film): UnifiedMovieDetail => {
  const unifiedMovie = mapLegacyItemToUnifiedMovie(legacyFilm.item)
  const mergedEpisodes = mergeUnifiedEpisodes(legacyFilm.item.episodes)
  const availableSources = Array.from(
    new Set(legacyFilm.item.available_sources.map((entry) => entry.source))
  ) as UnifiedMovieDetail['availableSources']

  return {
    ...unifiedMovie,
    content: legacyFilm.item.content,
    actors: uniqueStrings(legacyFilm.item.actor),
    directors: uniqueStrings(legacyFilm.item.director),
    trailerUrl: legacyFilm.item.trailer_url,
    episodes: mergedEpisodes,
    availableSources
  }
}

export const aggregateDetailResults = async (input: DetailAggregationInput): Promise<AggregatedDetailResult> => {
  const sortedFilms = [...input.films].sort(
    (left, right) => providerMap[left.item.source].priority - providerMap[right.item.source].priority
  )
  const legacyFilm = mergeLegacyFilms(sortedFilms)

  return {
    detail: mapLegacyFilmToUnifiedMovieDetail(legacyFilm),
    legacyFilm
  }
}
