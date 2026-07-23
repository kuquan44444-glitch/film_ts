type VerificationRow = {
  slug: string
  backendProviders: number
  frontendProviders: number
  providers: Array<{
    source: string
    label: string
    totalEpisodes: number
    playableEpisodes: number
    status: string
    issue?: string
  }>
}

const SAMPLE_SIZE = 100
const PAGE_SIZE_ESTIMATE = 24
const pageCount = Math.ceil(SAMPLE_SIZE / PAGE_SIZE_ESTIMATE) + 1
const providerOrder = ['ophim', 'kkphim', 'vsmov', 'nguonc'] as const
type ProviderKey = (typeof providerOrder)[number]

const providers: Record<ProviderKey, { label: string; baseUrl: string }> = {
  ophim: { label: 'OPhim', baseUrl: 'https://ophim1.com' },
  kkphim: { label: 'KKPhim', baseUrl: 'https://phimapi.com' },
  vsmov: { label: 'VSMOV', baseUrl: 'https://vsmov.com/api' },
  nguonc: { label: 'Nguonc', baseUrl: 'https://phim.nguonc.com/api' }
}

const toStringValue = (value: unknown) => {
  if (value === null || value === undefined) return ''
  return String(value)
}

const toNumberValue = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const uniqueStrings = (values: Array<string | undefined | null>) =>
  Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]))

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

const getFilmEndpoint = (provider: ProviderKey, slug: string) =>
  `${providers[provider].baseUrl}${provider === 'nguonc' ? `/film/${slug}` : `/phim/${slug}`}`

const getSearchEndpoint = (provider: ProviderKey, keyword: string) => {
  const params = new URLSearchParams({ page: '1' })
  if (provider === 'nguonc') {
    params.set('keyword', keyword)
    return `${providers[provider].baseUrl}/films/search?${params.toString()}`
  }

  params.set('keyword', keyword)
  if (provider === 'kkphim') {
    return `${providers[provider].baseUrl}/v1/api/tim-kiem?${params.toString()}`
  }

  return `${providers[provider].baseUrl}/tim-kiem?${params.toString()}`
}

const getListEndpoint = (page: number) => `https://ophim1.com/danh-sach/phim-moi-cap-nhat?page=${page}`

const fetchJson = async (url: string) => {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} - ${url}`)
  }

  return (await response.json()) as Record<string, unknown>
}

const normalizeListItems = (payload: Record<string, unknown>, provider: ProviderKey) => {
  const nestedData = (payload.data as Record<string, unknown> | undefined) ?? payload
  const itemsData = (nestedData.items as unknown[]) ?? (payload.items as unknown[]) ?? []

  return itemsData.map((item) => {
    const record = item as Record<string, unknown>
    return {
      slug: toStringValue(record.slug),
      name: toStringValue(record.name),
      origin_name: toStringValue(record.origin_name ?? record.original_name),
      year: toNumberValue(record.year ?? record.release_year),
      type: toStringValue(record.type),
      source: provider
    }
  })
}

const getPlayableEpisodeCount = (payload: Record<string, unknown>) => {
  const nestedData = (payload.data as Record<string, unknown> | undefined) ?? payload
  const rawEpisodes = ((nestedData.episodes as unknown[]) ?? (payload.episodes as unknown[]) ?? []) as Record<
    string,
    unknown
  >[]

  const playableEntries = rawEpisodes.flatMap((server) => {
    const items = ((server.server_data as unknown[]) ?? (server.items as unknown[]) ?? []) as Record<string, unknown>[]
    return items.filter((item) => toStringValue(item.link_embed ?? item.embed) || toStringValue(item.link_m3u8 ?? item.m3u8))
  })

  const uniquePlayableEntries = Array.from(
    new Map(
      playableEntries.map((item) => {
        const name = toStringValue(item.name || 'Full')
        const slug = slugify(toStringValue(item.slug ?? name))
        const filename = slugify(toStringValue(item.filename ?? item.name ?? name))
        const key = slug ? `slug:${slug}` : filename ? `file:${filename}` : `name:${slugify(name)}`
        return [key, item]
      })
    ).values()
  )

  return {
    totalEpisodes: rawEpisodes.reduce((total, server) => {
      const items = ((server.server_data as unknown[]) ?? (server.items as unknown[]) ?? []) as unknown[]
      return total + items.length
    }, 0),
    playableEpisodes: uniquePlayableEntries.length
  }
}

const getBaseFilmItem = (payload: Record<string, unknown>, provider: ProviderKey) => {
  const nestedData = (payload.data as Record<string, unknown> | undefined) ?? payload
  const movieRaw =
    (nestedData.item as Record<string, unknown> | undefined) ??
    (payload.movie as Record<string, unknown> | undefined) ??
    (nestedData.movie as Record<string, unknown> | undefined) ??
    {}
  const episodeInfo = getPlayableEpisodeCount(payload)

  return {
    slug: toStringValue(movieRaw.slug),
    name: toStringValue(movieRaw.name),
    origin_name: toStringValue(movieRaw.origin_name ?? movieRaw.original_name),
    year: toNumberValue(movieRaw.year ?? movieRaw.release_year),
    type: toStringValue(movieRaw.type),
    source: provider,
    label: providers[provider].label,
    totalEpisodes: episodeInfo.totalEpisodes,
    playableEpisodes: episodeInfo.playableEpisodes
  }
}

const scoreFilmCandidate = (
  baseItem: { name: string; origin_name: string; year: number; type: string; slug: string },
  candidate: { name: string; origin_name: string; year: number; type: string; slug: string }
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

const searchFilmsByProvider = async (provider: ProviderKey, keyword: string) => {
  const payload = await fetchJson(getSearchEndpoint(provider, keyword))
  return normalizeListItems(payload, provider)
}

const getFilmByProvider = async (provider: ProviderKey, slug: string) => {
  const payload = await fetchJson(getFilmEndpoint(provider, slug))
  return getBaseFilmItem(payload, provider)
}

const findAlternativeFilmForProvider = async (
  provider: ProviderKey,
  baseItem: { name: string; origin_name: string; year: number; type: string; slug: string }
) => {
  const keywords = uniqueStrings([baseItem.origin_name, baseItem.name, baseItem.slug.replace(/-/g, ' ')])
  let bestMatch:
    | { slug: string; name: string; origin_name: string; year: number; type: string; source: ProviderKey }
    | null = null
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
    return scoreFilmCandidate(baseItem, matchedFilm) >= 80 ? matchedFilm : null
  } catch {
    return null
  }
}

const main = async () => {
  const slugs: string[] = []

  for (let page = 1; page <= pageCount && slugs.length < SAMPLE_SIZE; page += 1) {
    const response = await fetchJson(getListEndpoint(page))
    const pageSlugs = normalizeListItems(response, 'ophim')
      .map((item) => item.slug)
      .filter(Boolean)
    for (const slug of pageSlugs) {
      if (!slugs.includes(slug)) {
        slugs.push(slug)
      }
      if (slugs.length >= SAMPLE_SIZE) break
    }
  }

  const sampleSlugs = slugs.slice(0, SAMPLE_SIZE)
  const rows: VerificationRow[] = []
  const failures: Array<{ slug: string; reason: string }> = []

  for (const [index, slug] of sampleSlugs.entries()) {
    try {
      const settledResults = await Promise.allSettled(providerOrder.map(async (provider) => getFilmByProvider(provider, slug)))
      const successfulFilms = settledResults
        .flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
        .sort((left, right) => providerOrder.indexOf(left.source) - providerOrder.indexOf(right.source))

      if (!successfulFilms.length) {
        failures.push({
          slug,
          reason: 'Khong lay duoc phim tu tat ca provider'
        })
        continue
      }

      const primaryFilm = successfulFilms[0]
      const fetchedSources = new Set(successfulFilms.map((film) => film.source))
      const missingSources = providerOrder.filter((source) => !fetchedSources.has(source))
      const alternativeResults = await Promise.all(
        missingSources.map(async (source) => findAlternativeFilmForProvider(source, primaryFilm))
      )
      const mergedProviders = [...successfulFilms, ...alternativeResults.filter(Boolean)].sort(
        (left, right) => providerOrder.indexOf(left.source) - providerOrder.indexOf(right.source)
      )

      rows.push({
        slug,
        backendProviders: mergedProviders.length,
        frontendProviders: mergedProviders.length,
        providers: mergedProviders.map((provider) => ({
          source: provider.source,
          label: provider.label,
          totalEpisodes: provider.totalEpisodes,
          playableEpisodes: provider.playableEpisodes,
          status: provider.playableEpisodes > 0 ? 'ready' : 'error',
          issue:
            provider.playableEpisodes > 0 ? undefined : 'Provider co du lieu nhung khong con source phat hop le sau normalize/merge'
        }))
      })

      if ((index + 1) % 10 === 0) {
        console.info(`[verifyProviders] Da kiem tra ${index + 1}/${sampleSlugs.length} phim`)
      }
    } catch (error) {
      failures.push({
        slug,
        reason: error instanceof Error ? error.message : 'Loi khong xac dinh'
      })
    }
  }

  const mismatches = rows.filter((row) => row.backendProviders !== row.frontendProviders)
  const providerCountSummary = rows.reduce<Record<string, number>>((result, row) => {
    const key = String(row.backendProviders)
    result[key] = (result[key] || 0) + 1
    return result
  }, {})

  console.info(
    JSON.stringify(
      {
        sampleRequested: SAMPLE_SIZE,
        sampleCollected: sampleSlugs.length,
        verifiedFilms: rows.length,
        failedFilms: failures.length,
        mismatches: mismatches.length,
        providerCountSummary,
        mismatchSamples: mismatches.slice(0, 10),
        failedSamples: failures.slice(0, 10)
      },
      null,
      2
    )
  )

  if (mismatches.length > 0 || failures.length > 0) {
    process.exitCode = 1
  }
}

void main()
