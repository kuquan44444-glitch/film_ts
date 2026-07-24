import { Card } from 'src/components'
import { useQuery } from 'react-query'
import filmApis from 'src/apis/filmApis'
import { useQueryConfig, useScrollTop } from 'src/hooks'
import Pagination from 'src/components/Pagination'
import { useNavigate, createSearchParams } from 'react-router-dom'
import PATH from 'src/utils/path'
import { Helmet } from 'react-helmet-async'
import { useEffect, useState } from 'react'

const Search = () => {
  const navigate = useNavigate()
  const queryConfig = useQueryConfig()
  const [keywordInput, setKeywordInput] = useState(queryConfig.keyword || '')

  useEffect(() => {
    setKeywordInput(queryConfig.keyword || '')
  }, [queryConfig.keyword])

  useEffect(() => {
    const trimmedKeyword = keywordInput.trim()
    const currentKeyword = queryConfig.keyword || ''

    if (trimmedKeyword === currentKeyword) return

    const timer = window.setTimeout(() => {
      navigate({
        pathname: PATH.search,
        search: createSearchParams({
          keyword: trimmedKeyword,
          page: '1'
        }).toString()
      })
    }, 400)

    return () => window.clearTimeout(timer)
  }, [keywordInput, navigate, queryConfig.keyword])

  const { data } = useQuery({
    queryKey: ['tim-kiem', { keyword: queryConfig.keyword, page: queryConfig.page }],
    queryFn: () => filmApis.getSearchFilm({ keyword: queryConfig.keyword, page: queryConfig.page }),
    staleTime: 5 * 60 * 1000,
    keepPreviousData: true,
    enabled: Boolean(queryConfig.keyword?.trim())
  })
  const dataSearch = data?.data.data

  useScrollTop([queryConfig])

  return (
    <>
      <Helmet>
        <title>{`VPhim | ${dataSearch?.seoOnPage.titleHead}`}</title>
        <meta name='description' content={`${dataSearch?.seoOnPage.descriptionHead}. Xem phim miễn phí tại VPhim`} />
      </Helmet>
      <div className='container px-4 mt-14'>
        <input
          onChange={(e) => setKeywordInput(e.target.value)}
          type='text'
          value={keywordInput}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          placeholder='Nhập tên phim...'
          className='w-full p-3 rounded-md text-xl outline-none'
        />
        {dataSearch && dataSearch.items.length > 0 && (
          <>
            <div className='mt-4'>
              <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-[22px] py-3'>
                {dataSearch.items.map((item) => (
                  <Card key={item._id} data={item} />
                ))}
              </div>
            </div>
            <div className='mt-4'>
              <Pagination
                queryConfig={{ keyword: queryConfig.keyword }}
                page={dataSearch.params.pagination.currentPage}
                totalPage={Math.ceil(
                  dataSearch.params.pagination.totalItems / dataSearch.params.pagination.totalItemsPerPage
                )}
              />
            </div>
          </>
        )}
        {dataSearch && dataSearch.items.length <= 0 && (
          <p className='w-full h-[50vh] text-center text-xl text-white flex justify-center items-center'>
            Không tìm thấy phim với kết quả tìm kiếm.
          </p>
        )}
        {!queryConfig.keyword?.trim() && (
          <p className='w-full h-[50vh] text-center text-xl text-white flex justify-center items-center'>
            Nhập tên phim để bắt đầu tìm kiếm.
          </p>
        )}
        {!dataSearch && queryConfig.keyword?.trim() && (
          <div className='mt-4'>
            <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-[22px] py-3'>
              {Array(10)
                .fill(0)
                .map((_, i) => (
                  <div key={i} className='flex flex-col animate-pulse'>
                    <div className='h-[210px] sm:h-[384px] w-full mb-1 bg-slate-700' />
                    <div className='h-2 w-[80%] mt-1 rounded-full bg-slate-700' />
                    <div className='h-2 w-[60%] mt-2 rounded-full bg-slate-700' />
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
export default Search
