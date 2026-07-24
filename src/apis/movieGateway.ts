import filmApis from './filmApis'
import { aggregateDetailResults } from 'src/services/detail-aggregation.service'
import { aggregateHomeSections } from 'src/services/home-aggregation.service'
import { selectPlaybackCandidate } from 'src/services/media-selection.service'
import {
  getPlaybackHealth,
  markPlaybackHealthFailure,
  markPlaybackHealthSuccess
} from 'src/services/playback-health.service'
import { resolveProxyUrl } from 'src/services/proxy-url.service'
import { buildRecommendations } from 'src/services/recommendation.service'
import { aggregateSearchResults } from 'src/services/search-aggregation.service'

export const movieGatewayServices = {
  aggregateHomeSections,
  aggregateSearchResults,
  aggregateDetailResults,
  buildRecommendations,
  selectPlaybackCandidate,
  getPlaybackHealth,
  markPlaybackHealthSuccess,
  markPlaybackHealthFailure,
  resolveProxyUrl
}

const movieGateway = {
  ...filmApis,
  services: movieGatewayServices
}

export default movieGateway
