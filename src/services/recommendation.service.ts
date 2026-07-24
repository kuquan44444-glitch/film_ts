import type { UnifiedMovie } from 'src/domain/movie.types'

export type RecommendationInput = {
  currentMovie: UnifiedMovie
  candidates: UnifiedMovie[]
  seenMovieIds?: string[]
  limit?: number
}

const createSlugSet = (values: Array<{ slug: string }>) => new Set(values.map((item) => item.slug).filter(Boolean))

const countOverlap = (leftValues: Array<{ slug: string }>, rightValues: Array<{ slug: string }>) => {
  const leftSet = createSlugSet(leftValues)
  const rightSet = createSlugSet(rightValues)
  let matchedCount = 0

  leftSet.forEach((value) => {
    if (rightSet.has(value)) {
      matchedCount += 1
    }
  })

  return matchedCount
}

const hasSharedDedupeKey = (currentMovie: UnifiedMovie, candidate: UnifiedMovie) =>
  candidate.dedupeKeys.some((key) => currentMovie.dedupeKeys.includes(key))

const calculateRecommendationScore = (currentMovie: UnifiedMovie, candidate: UnifiedMovie) => {
  const categoryMatches = countOverlap(currentMovie.categories, candidate.categories)
  const countryMatches = countOverlap(currentMovie.countries, candidate.countries)
  const yearDistance = Math.abs(currentMovie.year - candidate.year)
  let score = 0

  score += categoryMatches * 32
  score += countryMatches * 20

  if (currentMovie.type && candidate.type && currentMovie.type === candidate.type) {
    score += 18
  }

  if (yearDistance === 0) score += 14
  else if (yearDistance <= 1) score += 10
  else if (yearDistance <= 3) score += 5

  if (candidate.sources.some((source) => !currentMovie.sources.includes(source))) {
    score += 6
  }

  return score
}

export const buildRecommendations = async ({
  currentMovie,
  candidates,
  seenMovieIds = [],
  limit = 10
}: RecommendationInput): Promise<UnifiedMovie[]> =>
  candidates
    .filter((candidate) => {
      if (candidate.id === currentMovie.id) return false
      if (seenMovieIds.includes(candidate.id)) return false
      if (hasSharedDedupeKey(currentMovie, candidate)) return false
      return true
    })
    .map((candidate) => ({
      candidate,
      score: calculateRecommendationScore(currentMovie, candidate)
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score
      }

      return right.candidate.year - left.candidate.year
    })
    .slice(0, limit)
    .map((entry) => entry.candidate)
