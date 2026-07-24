import type { items, movieSource, taxonomyItem } from 'src/types'
import { providerMap } from 'src/apis/filmSourceAdapters'

export type LegacyItemCandidate = {
  item: items
  position: number
  searchScore?: number
}

export type LegacyAggregateEntry = {
  item: items
  dedupeKeys: Set<string>
  rankScore: number
  freshestTimestamp: number
  searchScore: number
}

const SEARCH_PROVIDER_CONFIDENCE: Record<movieSource, number> = {
  ophim: 18,
  kkphim: 16,
  vsmov: 12,
  nguonc: 8
}

const uniqueStrings = (values: Array<string | undefined | null>) =>
  Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]))

const uniqueTaxonomy = (values: taxonomyItem[]) =>
  Array.from(new Map(values.map((item) => [item.slug || item.id || item.name, item])).values())

export const normalizeAggregationText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()

export const slugifyAggregationText = (value: string) =>
  normalizeAggregationText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export const parseTimestampValue = (value: string) => {
  if (!value) return 0

  const numericValue = Number(value)
  if (Number.isFinite(numericValue) && numericValue > 0) {
    return numericValue
  }

  const parsedDate = Date.parse(value)
  return Number.isFinite(parsedDate) ? parsedDate : 0
}

const buildYearKeys = (title: string, year: number) => {
  const normalizedTitle = slugifyAggregationText(title)
  if (!normalizedTitle) return []

  const keys = [`title:${normalizedTitle}`]
  if (year > 0) {
    keys.unshift(`title-year:${normalizedTitle}:${year}`)
  }

  return keys
}

export const createLegacyItemDedupeKeys = (item: items) => {
  const sourceKeys = Object.entries(item.source_slugs || {}).flatMap(([source, slug]) => {
    const normalizedSlug = slugifyAggregationText(slug || '')
    return normalizedSlug ? [`source:${source}:${normalizedSlug}`] : []
  })

  return uniqueStrings([
    ...sourceKeys,
    ...buildYearKeys(item.origin_name, item.year),
    ...buildYearKeys(item.name, item.year)
  ])
}

const getItemCompletenessScore = (item: items) =>
  Number(Boolean(item.name)) * 12 +
  Number(Boolean(item.origin_name)) * 10 +
  Number(Boolean(item.thumb_url)) * 6 +
  Number(Boolean(item.poster_url)) * 6 +
  Number(Boolean(item.episode_current)) * 4 +
  Number(Boolean(item.quality)) * 3 +
  Number(Boolean(item.lang)) * 2 +
  item.category.length +
  item.country.length

const shouldReplacePrimaryItem = (currentItem: items, nextItem: items) => {
  const currentCompleteness = getItemCompletenessScore(currentItem)
  const nextCompleteness = getItemCompletenessScore(nextItem)

  if (nextCompleteness !== currentCompleteness) {
    return nextCompleteness > currentCompleteness
  }

  const currentPriority = providerMap[currentItem.source].priority
  const nextPriority = providerMap[nextItem.source].priority

  if (nextPriority !== currentPriority) {
    return nextPriority < currentPriority
  }

  return parseTimestampValue(nextItem.modified.time) > parseTimestampValue(currentItem.modified.time)
}

export const mergeLegacyItems = (baseItem: items, incomingItem: items): items => {
  const primaryItem = shouldReplacePrimaryItem(baseItem, incomingItem) ? incomingItem : baseItem
  const secondaryItem = primaryItem === baseItem ? incomingItem : baseItem

  return {
    ...primaryItem,
    modified: {
      time:
        parseTimestampValue(primaryItem.modified.time) >= parseTimestampValue(secondaryItem.modified.time)
          ? primaryItem.modified.time
          : secondaryItem.modified.time
    },
    thumb_url: primaryItem.thumb_url || secondaryItem.thumb_url,
    poster_url: primaryItem.poster_url || secondaryItem.poster_url,
    time: primaryItem.time || secondaryItem.time,
    episode_current: primaryItem.episode_current || secondaryItem.episode_current,
    quality: primaryItem.quality || secondaryItem.quality,
    lang: primaryItem.lang || secondaryItem.lang,
    category: uniqueTaxonomy([...primaryItem.category, ...secondaryItem.category]),
    country: uniqueTaxonomy([...primaryItem.country, ...secondaryItem.country]),
    image_urls: {
      thumb: uniqueStrings([...primaryItem.image_urls.thumb, ...secondaryItem.image_urls.thumb]),
      poster: uniqueStrings([...primaryItem.image_urls.poster, ...secondaryItem.image_urls.poster])
    },
    source_slugs: {
      ...(secondaryItem.source_slugs || {}),
      ...(primaryItem.source_slugs || {})
    }
  }
}

const createAggregateEntry = (candidate: LegacyItemCandidate): LegacyAggregateEntry => ({
  item: candidate.item,
  dedupeKeys: new Set(createLegacyItemDedupeKeys(candidate.item)),
  rankScore: Math.max(40 - candidate.position, 1) + (10 - providerMap[candidate.item.source].priority),
  freshestTimestamp: parseTimestampValue(candidate.item.modified.time),
  searchScore: candidate.searchScore || 0
})

const mergeAggregateEntries = (target: LegacyAggregateEntry, source: LegacyAggregateEntry) => {
  target.item = mergeLegacyItems(target.item, source.item)
  target.rankScore += source.rankScore
  target.freshestTimestamp = Math.max(target.freshestTimestamp, source.freshestTimestamp)
  target.searchScore = Math.max(target.searchScore, source.searchScore)

  for (const key of source.dedupeKeys) {
    target.dedupeKeys.add(key)
  }
}

export const aggregateLegacyItems = (candidates: LegacyItemCandidate[]) => {
  const keyToEntry = new Map<string, LegacyAggregateEntry>()
  const aggregateEntries: LegacyAggregateEntry[] = []

  for (const candidate of candidates) {
    const nextEntry = createAggregateEntry(candidate)
    const matchedEntries = Array.from(
      new Set(
        Array.from(nextEntry.dedupeKeys)
          .map((key) => keyToEntry.get(key))
          .filter(Boolean) as LegacyAggregateEntry[]
      )
    )

    const targetEntry = matchedEntries[0]

    if (!targetEntry) {
      aggregateEntries.push(nextEntry)
      for (const key of nextEntry.dedupeKeys) {
        keyToEntry.set(key, nextEntry)
      }
      continue
    }

    mergeAggregateEntries(targetEntry, nextEntry)

    for (const duplicatedEntry of matchedEntries.slice(1)) {
      if (duplicatedEntry === targetEntry) continue
      mergeAggregateEntries(targetEntry, duplicatedEntry)
      const duplicatedIndex = aggregateEntries.indexOf(duplicatedEntry)
      if (duplicatedIndex >= 0) {
        aggregateEntries.splice(duplicatedIndex, 1)
      }
    }

    for (const key of targetEntry.dedupeKeys) {
      keyToEntry.set(key, targetEntry)
    }
  }

  return aggregateEntries
}

export const sortAggregatedEntries = (entries: LegacyAggregateEntry[], sortField: string) => {
  const sortedEntries = [...entries]

  sortedEntries.sort((left, right) => {
    if (sortField === 'year' && left.item.year !== right.item.year) {
      return right.item.year - left.item.year
    }

    if (sortField === 'view' && left.rankScore !== right.rankScore) {
      return right.rankScore - left.rankScore
    }

    if (left.freshestTimestamp !== right.freshestTimestamp) {
      return right.freshestTimestamp - left.freshestTimestamp
    }

    if (left.rankScore !== right.rankScore) {
      return right.rankScore - left.rankScore
    }

    return right.item.year - left.item.year
  })

  return sortedEntries
}

export const scoreSearchCandidate = (keyword: string, item: items, position: number) => {
  const normalizedKeyword = normalizeAggregationText(keyword)
  const title = normalizeAggregationText(item.name)
  const originalTitle = normalizeAggregationText(item.origin_name)
  const slug = slugifyAggregationText(item.slug)
  const detectedYear = normalizedKeyword.match(/\b(19|20)\d{2}\b/)?.[0]
  let score = SEARCH_PROVIDER_CONFIDENCE[item.source] + Math.max(20 - position, 1)

  if (!normalizedKeyword) return score

  if (title === normalizedKeyword) score += 120
  else if (title.includes(normalizedKeyword)) score += 70

  if (originalTitle === normalizedKeyword) score += 110
  else if (originalTitle.includes(normalizedKeyword)) score += 65

  if (slug === slugifyAggregationText(keyword)) score += 90
  else if (slug.includes(slugifyAggregationText(keyword))) score += 50

  const keywordTokens = normalizedKeyword.split(/\s+/).filter(Boolean)
  const tokenMatches = keywordTokens.filter((token) => title.includes(token) || originalTitle.includes(token)).length
  score += tokenMatches * 8

  if (detectedYear && Number(detectedYear) === item.year) {
    score += 16
  }

  return score
}
