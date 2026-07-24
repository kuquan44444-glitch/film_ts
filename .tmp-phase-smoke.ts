import filmApis from './src/apis/filmApis'
import PATH from './src/utils/path'

const main = async () => {
  const home = await filmApis.getHomeSections({}, '2025')
  const list = await filmApis.getListFilm(PATH.odd, { page: '1' })
  const search = await filmApis.getSearchFilm({ keyword: 'avengers', page: '1' })
  const detail = await filmApis.getFilm('avengers-hoi-ket')

  console.log(
    JSON.stringify(
      {
        homeSections: home.data.data.sections.map((section) => ({
          key: section.key,
          count: section.items.length
        })),
        listItems: list.data.data.items.length,
        searchItems: search.data.data.items.length,
        detailTitle: detail.data.data.item.name,
        detailSources: detail.data.data.item.available_sources.map((item) => item.source),
        recommendationCount: detail.data.data.recommendations?.length || 0,
        serverCount: detail.data.data.item.episodes.length
      },
      null,
      2
    )
  )
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
