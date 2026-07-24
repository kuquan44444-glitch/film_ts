# Khảo Sát Provider API

Ngày khảo sát: `2026-07-24`

Môi trường kiểm tra:

- Tài liệu public của từng provider
- Kiểm tra request thực tế từ sandbox Linux
- Đo thời gian phản hồi gần đúng theo từng request đơn lẻ
- Kiểm tra header `Access-Control-Allow-Origin`
- Kiểm tra khả năng lấy metadata, episode và link phát phù hợp cho player thống nhất

Lưu ý:

- Cột `CORS` bên dưới nói về API layer trước tiên. Media endpoint có thể khác.
- Tốc độ phản hồi là mẫu đo tại thời điểm khảo sát, không phải SLA.
- Tiêu chí đánh giá ưu tiên theo mục tiêu mới của dự án:
  - giao diện thống nhất
  - không lộ provider
  - không dùng iframe
  - ưu tiên `m3u8` hoặc `mp4`
  - có thể fallback tự động

## Bảng Tổng Hợp

| Provider | Hoạt động | Search API | Detail API | Episode API | `m3u8/mp4` | CORS | Tốc độ phản hồi | Kết luận |
|---|---|---:|---:|---:|---:|---:|---|---|
| OPhim | Có | Có | Có | Có | Có trực tiếp `m3u8` | Có (`*`) | Tốt, khoảng `190-240ms` | Tích hợp core |
| KKPhim | Có | Có | Có | Có | Có `m3u8` trong API nhưng sample chết | Có (`*`) | Tốt, khoảng `220-320ms` | Tích hợp có health check media |
| VSMOV | Có | Có | Có | Có | Không trả `m3u8` trực tiếp, nhưng có thể suy ra từ player page | Có ở API, media `m3u8` có `*` | Khá tốt, khoảng `220-330ms` | Tích hợp qua media resolver |
| Nguồn C | Có | Có | Có | Có | Không có direct `m3u8/mp4`, thiên về embed | Có (`*`) | API nhanh, search chậm hơn (`21-869ms`) | Chỉ dùng metadata/search/detail, không đưa vào player pool |
| Zophim / AniSrc | Có nhưng contract yếu | Có | Có kiểu `list/{slug}` | Có | Không có direct `m3u8/mp4`, thiên về embed page | Không | Chậm, khoảng `700-1900ms` | Loại khỏi core |

## Chi Tiết Theo Provider

### 1. OPhim

Tài liệu:

- `https://ophim17.cc/api-document`

Endpoint khảo sát:

- List: `https://ophim1.com/danh-sach/phim-moi-cap-nhat?page=1`
- Search: `https://ophim1.com/v1/api/tim-kiem?keyword=avengers&page=1&limit=5`
- Detail: `https://ophim1.com/phim/avengers-hoi-ket`

Kết quả:

- API đang hoạt động ổn định.
- Search, detail, episode đều có.
- Trả `link_m3u8` trực tiếp trong `server_data`.
- API có `Access-Control-Allow-Origin: *`.
- Sample media kiểm tra hoạt động được và `m3u8` cũng có `CORS: *`.

Đánh giá:

- Đây là provider tốt nhất để làm nguồn media core ở giai đoạn đầu.
- Phù hợp với player thống nhất và fallback tự động.

Kết luận:

- Nên tích hợp đầy đủ: list, search, detail, recommendation source, media source.

### 2. KKPhim

Tài liệu:

- `https://www.kkphim2.com/api-document`
- Mirror tài liệu rõ hơn: `https://kkphim.com/tai-lieu-api`

Endpoint khảo sát:

- List: `https://phimapi.com/danh-sach/phim-moi-cap-nhat?page=1`
- Search: `https://phimapi.com/v1/api/tim-kiem?keyword=avengers&page=1&limit=5`
- Detail: `https://phimapi.com/phim/avengers-tran-chien-cuoi-cung`

Kết quả:

- API đang hoạt động.
- Search, detail, episode đều có.
- Trả `link_m3u8` trực tiếp trong API.
- API có `Access-Control-Allow-Origin: *`.
- Tuy nhiên sample `m3u8` lấy được từ detail tại thời điểm kiểm tra trả `404`.

Đánh giá:

- KKPhim vẫn hữu ích cho metadata, list và search.
- Media source không thể tin cậy nếu chỉ dựa vào việc có `link_m3u8`; bắt buộc phải có bước health check runtime trước khi cho vào candidate pool.

Kết luận:

- Nên tích hợp.
- Nhưng phải hạ mức tin cậy media so với OPhim.
- Bắt buộc đưa vào cơ chế `preflight health check` và `success-rate scoring`.

### 3. VSMOV

Tài liệu:

- `https://vsmov.com/api-document`

Endpoint khảo sát:

- List: `https://vsmov.com/api/danh-sach/phim-moi-cap-nhat?page=1`
- Search: `https://vsmov.com/api/tim-kiem?keyword=avengers&page=1&limit=5`
- Detail: `https://vsmov.com/api/phim/avengers-3-cuoc-chien-vo-cuc`

Kết quả:

- API hoạt động tốt.
- Search, detail, episode đều có.
- API trả `link_embed` dạng trang player HTML, không trả `link_m3u8` trực tiếp trong JSON.
- Trong player HTML có thể suy ra URL `https://v6.streamvsmov.com/stream/{hash}/master.m3u8`.
- API có `CORS: *`.
- Direct media URL suy ra được cũng có `CORS: *`.

Đánh giá:

- VSMOV vẫn có thể tích hợp cho kiến trúc `single player`.
- Cần một `media resolver` riêng để chuyển `link_embed` thành direct stream URL.
- Không nên dùng iframe với provider này trong kiến trúc mới.

Kết luận:

- Nên tích hợp, nhưng chỉ sau khi có `VSMOV media resolver`.

### 4. Nguồn C

Tài liệu:

- `https://phim.nguonc.com/api-document`

Endpoint khảo sát:

- List: `https://phim.nguonc.com/api/films/phim-moi-cap-nhat?page=1`
- Search: `https://phim.nguonc.com/api/films/search?keyword=hoa&page=1`
- Detail: `https://phim.nguonc.com/api/film/hoa-sen-den`
- Detail mẫu khác để xác nhận schema tập phim: `https://phim.nguonc.com/api/film/hoa-thien-cot`

Kết quả:

- API hoạt động tốt, phản hồi nhanh.
- Search, detail, episode đều có.
- Episode nằm trong `movie.episodes[].items[]`.
- Media trả về chủ yếu là `embed` URL, không có direct `m3u8/mp4`.
- Embed sample bị chặn `403` bởi Cloudflare khi kiểm tra trực tiếp.
- API có `CORS: *`, nhưng media layer không phù hợp với yêu cầu player mới.

Đánh giá:

- Nguồn C phù hợp để tăng độ phủ catalog, metadata, search, category, country.
- Không phù hợp để đưa trực tiếp vào pool phát nếu dự án kiên quyết `no iframe`.

Kết luận:

- Nên tích hợp ở vai trò metadata/search/detail provider.
- Không dùng làm media provider ở phase đầu.

### 5. Zophim / AniSrc

Tài liệu công khai yêu cầu:

- `https://api-zophim.blogspot.com/?m=1`

Phát hiện thực tế:

- Trang blog công khai không phải API chuẩn REST thống nhất.
- Trong HTML có nhúng hướng dẫn endpoint:
  - `https://anisrc.top/api/v1/update/{page}`
  - `https://anisrc.top/api/v1/list/{slug}`
  - `https://anisrc.top/api/v1/search/{key}/{page}`

Endpoint khảo sát:

- List: `https://anisrc.top/api/v1/update/1`
- Search: `https://anisrc.top/api/v1/search/naruto/1`
- Detail/list tập: `https://anisrc.top/api/v1/list/naruto-shippuden`

Kết quả:

- Endpoint vẫn phản hồi.
- Search/list có dữ liệu.
- Contract dữ liệu yếu, không phải JSON object chuẩn ổn định cho aggregator tổng quát.
- Response dạng từng object nối dòng, khó dùng trực tiếp.
- Không có `CORS` trên API.
- Media thiên về player page như `ssplay.net`, không có direct `m3u8/mp4` public rõ ràng.
- Tốc độ chậm hơn các provider còn lại khá nhiều.

Đánh giá:

- Có thể dùng như một nguồn anime thử nghiệm nếu chấp nhận proxy + parser + risk cao.
- Không đạt tiêu chí ổn định cho core provider của website phim tổng hợp.

Kết luận:

- Không nên tích hợp vào core architecture.

## Danh Sách Provider Nên Tích Hợp

### Tích hợp đầy đủ

- `OPhim`
- `KKPhim`
- `VSMOV` sau khi có media resolver

### Tích hợp hạn chế

- `Nguồn C`
  - dùng cho metadata
  - dùng cho list/search/detail aggregation
  - không dùng cho player candidate pool ở phase đầu

## Danh Sách Provider Bị Loại

- `Zophim / AniSrc`
  - contract dữ liệu không sạch
  - không có CORS
  - thiên về anime riêng
  - không có direct media chuẩn cho player thống nhất
  - độ ổn định và tính maintain thấp hơn các provider còn lại

## Đề Xuất Provider Bổ Sung

Trong phạm vi khảo sát này, không tìm được thêm một public movie API tiếng Việt có contract đủ rõ, đủ ổn định và phù hợp hơn nhóm `OPhim / KKPhim / VSMOV / Nguồn C`.

Phát hiện phụ:

- `AniSrc` là nguồn anime chuyên biệt lộ ra từ trang Zophim, nhưng không phù hợp đưa vào core provider set.
- `kkphim.com/tai-lieu-api` chỉ là mirror tài liệu cho `phimapi.com`, không phải provider mới.

## Kết Luận Cho Kiến Trúc Mới

Provider set đề xuất cho phase triển khai đầu tiên:

- `ophim`: metadata + media
- `kkphim`: metadata + media có health check
- `vsmov`: metadata + media sau resolver
- `nguonc`: metadata only, không cấp media phase đầu

Provider loại khỏi core:

- `zophim/anisrc`

## Quy Tắc Tích Hợp Provider Trong Dự Án Mới

- Không hardcode một provider làm default.
- Mỗi provider phải có `adapter`, `normalizer`, `health policy`, `media resolver` riêng nếu cần.
- Metadata aggregation và media aggregation phải là hai pipeline tách biệt.
- Provider có metadata tốt nhưng media yếu vẫn được giữ ở metadata pipeline.
- Provider có media tốt nhưng metadata yếu vẫn có thể giữ ở media pipeline.
