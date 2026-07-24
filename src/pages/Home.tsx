import { Card, Filter } from 'src/components'
import { useQuery } from 'react-query'
import { Link, createSearchParams } from 'react-router-dom'
import filmApis from 'src/apis/filmApis'
import { useQueryConfig } from 'src/hooks'
import PATH from 'src/utils/path'
import { Helmet } from 'react-helmet-async'
import { useMemo } from 'react'

const Home = () => {
  const queryConfig = useQueryConfig()
  const newYear = useMemo(
    () =>
      new Date().getMonth() + 1 < 2 ? (new Date().getFullYear() - 1).toString() : new Date().getFullYear().toString(),
    []
  )

  const { data } = useQuery({
    queryKey: ['home-aggregate', queryConfig, newYear],
    queryFn: () => filmApis.getHomeSections(queryConfig, newYear),
    staleTime: 5 * 60 * 1000,
    keepPreviousData: true
  })

  const homeSections = data?.data.data.sections || []
  const featuredSection = homeSections.find((section) => section.key === 'featured')
  const latestOddSection = homeSections.find((section) => section.key === 'latest-odd')
  const latestSeriesSection = homeSections.find((section) => section.key === 'latest-series')

  return (
    <>
      <Helmet>
        <title>Xem phim Online miễn phí - VPhim</title>
        <meta
          name='description'
          content='Web xem phim online miễn phí lớn nhất được cập nhật liên tục mỗi ngày - Cùng tham gia xem phim và thảo luận với hơn 10 triệu thành viên 🎉 tại VPhim ❤️💛💚'
        />
      </Helmet>
      <div className='container mt-[45px] px-4'>
        <Filter />
        <div className='mt-4'>
          {title({ title: 'Phim đề cử', isHiddenArrow: true })}
          <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-[22px] py-3'>
            {featuredSection ? featuredSection.items.map((item) => <Card key={item._id} data={item} />) : skeleton()}
          </div>
        </div>
        <div className='mt-8'>
          {title({ title: 'Phim lẻ mới cập nhật', titleSmall: 'Phim lẻ mới', link: `${PATH.odd}` })}
          <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-[22px] py-3'>
            {latestOddSection ? latestOddSection.items.map((item) => <Card key={item._id} data={item} />) : skeleton()}
          </div>
        </div>
        <div className='mt-8'>
          {title({ title: 'Phim bộ mới cập nhật', titleSmall: 'Phim bộ mới', link: `${PATH.series}` })}
          <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-[22px] py-3'>
            {latestSeriesSection
              ? latestSeriesSection.items.map((item) => <Card key={item._id} data={item} />)
              : skeleton()}
          </div>
        </div>
      </div>
    </>
  )
}
export default Home

const title = ({
  title,
  titleSmall = '',
  isHiddenArrow = false,
  link = ''
}: {
  title: string
  titleSmall?: string
  isHiddenArrow?: boolean
  link?: string
}) => {
  return (
    <div className='flex justify-between items-end pb-1 border-b border-[#1b3c5d]'>
      <h2 className='uppercase text-[#b1a21e] text-2xl font-display font-medium'>
        <span className='hidden sm:inline'>{title}</span>
        <span className='inline sm:hidden'>{titleSmall === '' ? title : titleSmall}</span>
      </h2>
      {!isHiddenArrow && (
        <Link
          to={{
            pathname: `${PATH.list}/${link}`,
            search: createSearchParams({
              page: '1',
              sort_field: 'modified.time',
              category: '',
              country: '',
              year: ''
            }).toString()
          }}
          className='text-white/80 hover:text-white text-lg p-1 whitespace-nowrap'
        >
          <span className='hidden sm:inline'>Xem tất cả</span>
          <span className='sm:hidden inline'>Thêm</span>
          <svg
            className='ml-1 w-2 h-[17px] fill-current inline'
            xmlns='http://www.w3.org/2000/svg'
            viewBox='0 0 192 512'
          >
            <path d='M0 384.662V127.338c0-17.818 21.543-26.741 34.142-14.142l128.662 128.662c7.81 7.81 7.81 20.474 0 28.284L34.142 398.804C21.543 411.404 0 402.48 0 384.662z' />
          </svg>
        </Link>
      )}
    </div>
  )
}

const skeleton = () => (
  <>
    {Array(10)
      .fill(0)
      .map((_, i) => (
        <div key={i} className='flex flex-col animate-pulse'>
          <div className='h-[210px] sm:h-[384px] w-full mb-1 bg-slate-700' />
          <div className='h-2 w-[80%] mt-1 rounded-full bg-slate-700' />
          <div className='h-2 w-[60%] mt-2 rounded-full bg-slate-700' />
        </div>
      ))}
  </>
)
