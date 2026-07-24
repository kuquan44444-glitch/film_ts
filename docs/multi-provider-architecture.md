# Thiết Kế Kiến Trúc Multi Provider

## Mục Tiêu

Biến hệ thống hiện tại từ frontend gọi API nhiều nguồn theo kiểu failover/merge cục bộ thành một `Movie Aggregator` đúng nghĩa:

- nhiều nguồn chỉ là provider
- website chỉ có một giao diện dữ liệu thống nhất
- không lộ tên provider ở UI người dùng
- không dùng iframe cho player chính
- tự chấm điểm nguồn phát theo thời gian thực
- tự fallback khi lỗi phát

## Phân Tích Kiến Trúc Hiện Tại

### Công nghệ hiện tại

- `React + TypeScript + Vite`
- `React Router`
- `React Query`
- `Tailwind`

### Trục kiến trúc hiện tại

- `src/apis/filmApis.ts`
  - file nghiệp vụ lớn nhất
  - chịu trách nhiệm gọi nhiều provider, normalize và merge
- `src/apis/filmSourceAdapters.ts`
  - nơi khai báo endpoint builder và extractor cho từng provider
- `src/pages/Home.tsx`
  - trang chủ đang lấy dữ liệu theo từng query riêng
- `src/pages/Search.tsx`
  - tìm kiếm 1 query, nhưng backend thực tế đang dùng `first successful`
- `src/pages/Detail.tsx`
  - lấy detail đã được merge
- `src/pages/Film.tsx`
  - player hiện tại dùng `video + hls.js` hoặc fallback sang `iframe`

### Vấn đề hiện tại

- `list/search/options` chưa phải aggregator thật, vẫn là chọn provider đầu tiên thành công.
- `detail` đã có merge đa nguồn nhưng logic dồn quá nhiều vào một file lớn.
- provider layer chưa tách thành adapter file độc lập theo đúng yêu cầu mở rộng.
- player vẫn phụ thuộc `iframe` trong nhiều trường hợp.
- chưa có pipeline riêng cho `metadata aggregation` và `media aggregation`.
- chưa có health scoring theo provider và theo stream.
- proxy mới chỉ tồn tại ở dev qua Vite proxy.

## Luồng Dữ Liệu Hiện Tại

### Home

- `Home.tsx` gọi 4 query tách rời cho `phim bộ/phim lẻ` và `đề cử/mới`.
- Mỗi query gọi `filmApis.getListFilm(...)`.
- `getListFilm` hiện dùng chiến lược `firstSuccessful`, không merge đa nguồn.

### Search

- `Search.tsx` cập nhật URL theo từng lần gõ.
- `filmApis.getSearchFilm(...)` dùng `firstSuccessful`.
- Chưa có debounce.
- Chưa có dedupe đa provider.

### Detail

- `Detail.tsx` gọi `filmApis.getFilm(slug)`.
- `getFilm` gọi nhiều provider song song rồi merge metadata và episode.
- Đây là phần gần với kiến trúc aggregator nhất của code hiện tại.

### Player

- `Film.tsx` nhận `episodes` đã merge.
- Player chọn `m3u8` nếu có, nếu không thì quay sang `iframe`.
- Fallback hiện tại là:
  - đổi playback mode
  - nếu vẫn lỗi thì đổi server/provider

## Nguyên Tắc Kiến Trúc Mục Tiêu

- Mỗi provider là một adapter độc lập.
- Không provider nào được hardcode làm mặc định vĩnh viễn.
- Tất cả page chỉ đọc từ unified domain model.
- Metadata pipeline và media pipeline tách riêng.
- Mọi quyết định chọn stream đều dựa trên runtime scoring.
- UI không hiển thị tên provider; chỉ hiển thị `Server 1`, `Server 2`, `Server 3`.

## Kiến Trúc Thư Mục Mục Tiêu

```text
src/
  providers/
    base/
      provider.types.ts
      provider.adapter.ts
      media.types.ts
    adapters/
      ophim.adapter.ts
      kkphim.adapter.ts
      vsmov.adapter.ts
      nguonc.adapter.ts
      zophim.adapter.ts
    resolvers/
      vsmov.resolver.ts
      ophim.resolver.ts
      kkphim.resolver.ts
    registry.ts
  domain/
    movie.types.ts
    aggregation.types.ts
    playback.types.ts
  services/
    home-aggregation.service.ts
    search-aggregation.service.ts
    detail-aggregation.service.ts
    recommendation.service.ts
    media-selection.service.ts
    playback-health.service.ts
    proxy-url.service.ts
  storage/
    playback-preference.storage.ts
    proxy-mode.storage.ts
  hooks/
    useProxyMode.ts
    usePlaybackSelection.ts
  apis/
    movieGateway.ts
```

## Thiết Kế Provider Adapter

### Interface đề xuất

```ts
export interface ProviderAdapter {
  key: ProviderKey
  label: string
  capabilities: {
    list: boolean
    search: boolean
    detail: boolean
    directMedia: boolean
    requiresMediaResolver: boolean
  }
  getHomeSections(input: HomeQueryInput): Promise<ProviderMovie[]>
  search(input: SearchQueryInput): Promise<ProviderMovie[]>
  getDetail(input: DetailQueryInput): Promise<ProviderMovieDetail | null>
  resolveMedia?(input: ResolveMediaInput): Promise<ResolvedMediaCandidate[]>
}
```

### Quy tắc adapter

- Không adapter nào import adapter khác.
- Mỗi adapter tự chịu trách nhiệm:
  - build endpoint
  - parse schema riêng
  - normalize về model trung gian
  - expose capability flags
- Media resolver là module riêng, không nhồi vào page.

### Tách metadata khỏi media

- `getDetail()` chỉ lo metadata và danh sách episode/server thô.
- `resolveMedia()` chỉ lo convert các stream thô thành direct playable candidate.
- Provider như `Nguồn C` có thể `getDetail()` nhưng không `resolveMedia()`.

## Unified Domain Model

### `UnifiedMovie`

- `id`
- `canonicalSlug`
- `titleVi`
- `titleOriginal`
- `year`
- `type`
- `countries`
- `categories`
- `posterCandidates`
- `thumbCandidates`
- `sources`
- `sourceSlugs`
- `dedupeKeys`

### `UnifiedMovieDetail`

- kế thừa `UnifiedMovie`
- `content`
- `actors`
- `directors`
- `trailerUrl`
- `episodes`
- `availableSources`

### `UnifiedEpisode`

- `episodeKey`
- `displayName`
- `order`
- `servers`

### `PlaybackCandidate`

- `serverId`
- `episodeKey`
- `playbackUrl`
- `format: 'm3u8' | 'mp4'`
- `qualityLabel`
- `providerKey`
- `resolverType`
- `viaProxy`
- `healthScore`
- `lastCheckedAt`

## Home Aggregation Design

### Yêu cầu

- Gọi đồng thời tất cả provider.
- Dùng `Promise.allSettled`.
- Chuẩn hóa dữ liệu.
- Gộp.
- Loại trùng toàn màn hình.
- Cache `5-10 phút`.

### Pipeline đề xuất

1. Gọi song song `getHomeSections()` hoặc `getListByType()` cho từng provider.
2. Flatten thành một pool chung.
3. Normalize thành `UnifiedMovie`.
4. Sinh `dedupe key`.
5. Duyệt từng section theo thứ tự UI.
6. Khi một phim đã xuất hiện ở section trước, đánh dấu vào `seenMovieKeys`.
7. Section sau tự bỏ qua phim đã seen và lấy phim khác.

### Dedupe key đề xuất

Ưu tiên theo thứ tự:

1. `tmdb/imdb id` nếu provider có
2. `normalized(original_name + year)`
3. `normalized(name + year)`
4. `source_slugs` mapping hỗ trợ đối chiếu

### Section strategy

- Không chia source theo section.
- Mỗi section lấy từ cùng một aggregated pool nhưng áp dụng rule riêng.
- Ví dụ:
  - `Trending`: sort theo view/update/freshness score
  - `Phim mới`: sort theo modified time
  - `Anime`: filter theo category/type
  - `TV Show`: filter theo type

## Search Aggregation Design

### Yêu cầu

- Search tất cả provider cùng lúc.
- Gộp kết quả.
- Không hiển thị phim trùng.
- Cache kết quả.

### Pipeline đề xuất

1. Debounce input `300-500ms`.
2. Query tất cả provider bằng `Promise.allSettled`.
3. Normalize.
4. Gộp và dedupe.
5. Gắn `searchScore`:
  - exact title match
  - original title match
  - year match
  - source confidence
6. Sort theo `searchScore desc`, sau đó `freshness desc`.

### Cache

- `React Query staleTime`: `5 phút`
- `gcTime`: `10-15 phút`
- Key: `['search-aggregate', keyword, filters, proxyMode]`

## Recommendation Design

### Yêu cầu

- Lấy từ tất cả provider.
- Không hiển thị:
  - phim đang xem
  - phim đã xuất hiện trên màn hình
  - phim trùng

### Chiến lược

- Dùng metadata hiện tại của phim:
  - category overlap
  - country overlap
  - year proximity
  - same type
- Query nhiều provider theo:
  - category chính
  - country chính
  - title keyword fallback
- Merge, dedupe và filter theo `seenMovieKeys`.

## Detail Aggregation Design

### Yêu cầu

- Lấy metadata từ tất cả provider.
- Gom toàn bộ episode.
- Gom toàn bộ server.
- Gom toàn bộ link phát thành một danh sách thống nhất.

### Pipeline

1. Chọn `canonical movie identity`.
2. Gọi detail từ tất cả provider.
3. Match phim tương ứng bằng:
  - source slug mapping
  - normalized title
  - original title
  - year
4. Merge metadata field-by-field:
  - title: ưu tiên giá trị đầy đủ nhất
  - description: ưu tiên dài hơn nhưng sanitize
  - actor/director/category/country: union
  - images: union
5. Merge episode list:
  - match theo `slug/name/order`
  - tạo `UnifiedEpisode`
6. Tạo `raw media candidates` cho mỗi episode.

## Player Design

### Yêu cầu

- Chỉ một player duy nhất.
- Không dùng iframe.
- Chỉ phát `m3u8` hoặc `mp4`.
- Không lộ provider.

### Đề xuất

- `Video.js + hls.js`
- Hoặc `Plyr + hls.js`

Khuyến nghị:

- Dùng `Video.js` nếu cần plugin ecosystem và analytics dễ hơn.
- Dùng `Plyr` nếu muốn UI gọn hơn.

### Cấu trúc UI

- Player chính
- Thanh trạng thái:
  - `Đang kiểm tra chất lượng nguồn...`
  - `Đang chuyển server...`
- Danh sách server:
  - `Server 1`
  - `Server 2`
  - `Server 3`
- Nút `Proxy OFF / ON`

### Local storage

- `preferredServerIndex`
- `preferredPlaybackMode`
- `proxyMode`

## Auto Server Selection Design

### Mục tiêu

Tự chọn stream tốt nhất theo thời gian thực, không dựa trên thứ tự hardcode.

### Pipeline

1. Thu thập mọi `PlaybackCandidate` hợp lệ.
2. Chuẩn hóa format:
  - direct `m3u8`
  - direct `mp4`
  - derived `m3u8` qua resolver
3. Chạy preflight check có timeout ngắn:
  - `HEAD` hoặc `GET range`
  - status code
  - content-type
  - thời gian phản hồi
4. Tính `healthScore`.

### `healthScore` đề xuất

```text
healthScore =
  successRateWeight +
  recentLatencyWeight +
  directMediaBonus +
  providerReliabilityWeight +
  recentPlaybackSuccessWeight
```

### Provider policy

- `OPhim`: direct media, score tốt
- `KKPhim`: direct media nhưng phải verify sống
- `VSMOV`: cần resolver trước rồi mới chấm điểm
- `Nguồn C`: không vào pool media phase đầu

## Fallback Design

### Trigger

- timeout
- HLS fatal error
- network error
- stalled
- manifest invalid
- segment load error
- stream unavailable

### Quy tắc fallback

1. Ưu tiên retry trong cùng episode với candidate kế tiếp.
2. Nếu hết candidate trong episode thì chuyển server logic kế tiếp.
3. Nếu người dùng đã chọn server thủ công, vẫn fallback trong nhóm đó trước.
4. Ghi nhận failure vào health store để giảm score trong vài phút tiếp theo.

### UX

- Không hiện provider name.
- Chỉ báo: `Server hiện tại lỗi, đang chuyển sang Server 2`.

## Proxy Design

### Yêu cầu

- Nút `Proxy OFF / ON`
- Mặc định `OFF`
- Khi `ON`, toàn bộ API request và media request đi qua proxy

### Kiến trúc đề xuất

#### Option A: Node.js Proxy

- Route:
  - `/proxy/api/:provider/*`
  - `/proxy/media/*`
- Chức năng:
  - forward request
  - inject headers
  - rewrite playlist URL nếu là `m3u8`
  - bypass ISP block
  - optional cache

#### Option B: Cloudflare Worker

- Ưu tiên cho production edge
- Phù hợp với:
  - rewrite `m3u8`
  - proxy media segment
  - hide upstream

Khuyến nghị:

- Phase đầu dùng `Node.js proxy` để debug dễ hơn.
- Phase production tối ưu bằng `Cloudflare Worker`.

### Quy tắc rewrite playlist

- Khi proxy `m3u8`, cần rewrite relative segment URL thành absolute hoặc tiếp tục đi qua `/proxy/media`.
- Segment `.ts`, `.m4s`, key file cũng phải đi qua proxy nếu upstream có vấn đề.

## Thiết Kế State Và Cache

### React Query

- Home: `staleTime 5-10 phút`
- Search: `5 phút`
- Detail: `5 phút`
- Recommendation: `5 phút`
- Player health probe: `30-90 giây`, cache ngắn

### Client state

- `proxyMode`
- `selectedEpisode`
- `selectedServerIndex`
- `candidateList`
- `playbackStatus`
- `lastFailureReason`

## Định Hướng Refactor Từ Code Hiện Tại

### Giữ lại

- React Router
- React Query
- phần lớn UI page/component
- schema type hiện có làm mốc chuyển đổi

### Refactor

- tách `filmApis.ts` thành service nhỏ hơn
- tách `filmSourceAdapters.ts` thành adapter file độc lập
- thay `firstSuccessful` bằng aggregation pipeline
- thay player fallback cục bộ bằng `media-selection service`

### Loại bỏ dần

- phụ thuộc `iframe` trong `Film.tsx`
- logic provider priority cứng trong UI
- coupling mạnh giữa page và provider schema thô

## Quyết Định Kiến Trúc Đề Xuất

### Provider set phase 1

- `ophim`
- `kkphim`
- `vsmov`
- `nguonc` metadata only

### Zophim

- Không đưa vào core phase 1.
- Chỉ xem như nguồn thử nghiệm anime nếu sau này cần track riêng.

## Kết Luận

Codebase hiện tại có nền tảng tốt để đi tiếp:

- đã có normalization cơ bản
- đã có multi-provider mindset
- đã có detail merge

Nhưng để đạt mục tiêu mới, kiến trúc cần chuyển từ:

- `frontend failover + page-level playback handling`

sang:

- `provider adapter layer + aggregation services + unified player + runtime health scoring + proxy-aware delivery`
