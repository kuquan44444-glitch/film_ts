import type { film, items, list, option } from 'src/types'
import type { ProviderKey } from 'src/providers/base/provider.types'
import type { UnifiedMovie, UnifiedMovieDetail } from './movie.types'

export type ProviderResult<T> = {
  providerKey: ProviderKey
  data: T
}

export type AggregatedSection = {
  key: string
  title: string
  items: UnifiedMovie[]
}

export type AggregatedHomeResult = {
  sections: AggregatedSection[]
}

export type AggregatedSearchResult = {
  keyword: string
  items: UnifiedMovie[]
}

export type AggregatedDetailResult = {
  detail: UnifiedMovieDetail
}

export type LegacyGatewayResult = {
  list?: list
  film?: film
  option?: option
  items?: items[]
}
