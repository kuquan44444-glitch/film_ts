# Kế Hoạch Migration Multi Provider

Tài liệu này được suy ra từ `docs/provider-survey.md` và `docs/multi-provider-architecture.md` để thay thế file migration plan đang được tham chiếu trong `docs/README.md`.

Mục tiêu là triển khai đúng kiến trúc đã thống nhất, không tự thay đổi thiết kế nếu không thật sự cần thiết, và chỉ chuyển sang phase tiếp theo khi phase hiện tại đã ổn định.

## Nguyên Tắc Thực Thi

- Giữ nguyên định hướng `Movie Aggregator` đa provider.
- Không đưa `zophim/anisrc` vào core.
- Phase 1 provider set:
  - `ophim`: metadata + media
  - `kkphim`: metadata + media có health check
  - `vsmov`: metadata + media qua resolver
  - `nguonc`: metadata only
- Không lộ tên provider ở UI người dùng.
- Không dùng `iframe` cho player chính.
- Tách riêng `metadata pipeline` và `media pipeline`.
- Chỉ chuyển phase khi đã:
  - build thành công
  - sửa xong lỗi phát sinh
  - rà soát không làm hỏng chức năng cũ
  - cập nhật lại docs nếu có thay đổi

## Baseline Trước Khi Code

Mục tiêu:

- Xác nhận codebase hiện tại build được.
- Ghi nhận lỗi sẵn có nếu có để tránh nhầm với lỗi do phase mới gây ra.

Việc cần làm:

1. Chạy `build`.
2. Chạy `lint` nếu cần để nắm baseline.
3. Ghi nhận các giới hạn hiện tại:
   - `list/search` đang là `firstSuccessful`
   - `detail` đã merge một phần
   - `watch` còn phụ thuộc `iframe`

Không đổi kiến trúc ở bước này.

### Ghi nhận sau baseline

- Môi trường sandbox chưa cài dependency local, nên cần chạy `npm install` trước khi build/lint ổn định.
- Sau khi cài dependency local:
  - `build` chạy thành công với `typescript@5.0.2`
  - `lint` chạy thành công qua script dùng `ESLINT_USE_FLAT_CONFIG=false`
- Đây là xử lý tương thích môi trường/tooling, không thay đổi kiến trúc ứng dụng.

## Phase 1: Nền Tảng Kiến Trúc

Mục tiêu:

- Dựng lớp nền mới mà chưa thay đổi hành vi người dùng ở phạm vi lớn.
- Chuẩn bị hạ tầng để refactor từng phần mà không làm vỡ UI hiện có.

Phạm vi:

- Tạo cấu trúc thư mục mới theo tài liệu:
  - `src/providers/base`
  - `src/providers/adapters`
  - `src/providers/resolvers`
  - `src/providers/registry.ts`
  - `src/domain`
  - `src/services`
  - `src/storage`
  - `src/hooks` bổ sung nếu cần
  - `src/apis/movieGateway.ts`
- Tách định nghĩa adapter hiện tại khỏi `src/apis/filmSourceAdapters.ts` sang registry/adapters mới.
- Tạo unified domain model cho:
  - movie metadata
  - detail
  - episode
  - playback candidate
- Tạo service skeleton:
  - home aggregation
  - search aggregation
  - detail aggregation
  - recommendation
  - media selection
  - playback health
  - proxy URL
- Giữ `filmApis` hoặc một facade tương thích để UI hiện tại chưa phải refactor toàn bộ ngay.

Tiêu chí hoàn thành:

- Code build thành công.
- Kiến trúc file mới có thể dùng cho các phase sau.
- Chưa làm thay đổi hành vi UI theo hướng phá vỡ flow cũ.

### Trạng thái triển khai

- Hoàn thành.
- Đã tạo:
  - `src/providers/base`
  - `src/providers/adapters`
  - `src/providers/resolvers`
  - `src/providers/registry.ts`
  - `src/domain`
  - `src/services`
  - `src/storage`
  - `src/hooks/useProxyMode.ts`
  - `src/apis/movieGateway.ts`
- `src/apis/filmSourceAdapters.ts` hiện là lớp tương thích, re-export từ provider registry mới.
- `filmApis` vẫn được giữ để không buộc refactor UI ngay trong Phase 1.
- Đã build thành công sau khi hoàn tất Phase 1.
- Các phase sau tiếp tục bám trên facade này để giảm phạm vi refactor theo từng bước.

## Phase 2: Aggregation Cho List/Home/Search

Mục tiêu:

- Thay `firstSuccessful` bằng aggregator thật cho `home`, `list`, `search`.

Phạm vi:

- Home:
  - gọi đồng thời các provider bằng `Promise.allSettled`
  - normalize về unified model
  - merge và dedupe toàn màn hình
  - áp dụng section strategy
- List:
  - chuyển từ single-source sang aggregated pool
  - giữ nguyên filter/sort/pagination ở mức tương thích tối đa với UI hiện có
- Search:
  - query nhiều provider song song
  - normalize, merge, dedupe
  - thêm `debounce 300-500ms`
  - thêm search score + sort
  - cache theo key aggregate

Tiêu chí hoàn thành:

- `Home`, `List`, `Search` không còn phụ thuộc `firstSuccessful`.
- Kết quả không lộ provider ở UI.
- Chức năng filter/search/pagination cũ vẫn hoạt động ổn định trong phạm vi tương thích.

## Phase 3: Detail Aggregation Và Recommendation

Mục tiêu:

- Chuẩn hóa `detail` theo unified domain model và tách riêng metadata/media pipeline.

Phạm vi:

- Refactor `getFilm()` sang `detail-aggregation.service`.
- Chọn `canonical movie identity`.
- Match chéo provider bằng:
  - source slug mapping
  - normalized title
  - original title
  - year
- Merge metadata field-by-field theo rules trong kiến trúc.
- Merge episode/server thành `UnifiedEpisode`.
- Sinh raw media candidates cho từng episode.
- Thêm `recommendation.service` theo metadata overlap và dedupe.

Tiêu chí hoàn thành:

- `Detail` đọc dữ liệu từ pipeline mới.
- Metadata phong phú hơn nhưng không làm hỏng route/detail cũ.
- Recommendation có thể được bật bằng unified data mà không lệch kiến trúc.

### Trạng thái triển khai

- Hoàn thành.
- `filmApis.getFilm()` đã đi qua `detail-aggregation.service`.
- `Detail` đang đọc dữ liệu detail đã merge từ pipeline unified hiện tại.
- Recommendation đã được bật từ `recommendation.service` dựa trên metadata overlap và dedupe.
- Build và lint đều đã chạy thành công sau khi rà soát Phase 3.

## Phase 4: Player Thống Nhất Và Tự Fallback

Mục tiêu:

- Thay player hiện tại bằng player thống nhất, không dùng `iframe`.

Phạm vi:

- Chỉ phát `m3u8` hoặc `mp4`.
- Tạo `resolveMedia()` cho provider cần resolver, ưu tiên:
  - `vsmov` resolver
- `nguonc` không vào media pool ở phase đầu.
- Tạo `media-selection.service`:
  - thu thập playback candidates
  - preflight check timeout ngắn
  - tính `healthScore`
  - chọn candidate tốt nhất
- Tạo `playback-health.service` để ghi nhận thành công/thất bại ngắn hạn.
- Cập nhật UI watch page:
  - chỉ hiện `Server 1`, `Server 2`, `Server 3`
  - có trạng thái loading/fallback
  - bỏ phụ thuộc provider priority cứng trong UI
- Lưu local preference:
  - `preferredServerIndex`
  - `preferredPlaybackMode`
  - `proxyMode`

Tiêu chí hoàn thành:

- Player chính không còn dùng `iframe` cho movie playback.
- Tự fallback giữa candidate hợp lệ khi phát lỗi.
- Không lộ tên provider cho người dùng.

### Trạng thái triển khai

- Hoàn thành.
- `Film.tsx` đã bỏ fallback `iframe`; player chỉ còn phát media trực tiếp `m3u8/mp4`.
- Watch page đã resolve media qua provider resolver hiện có và gom candidate theo từng tập.
- `media-selection.service` đã có preflight probe timeout ngắn, tính lại `healthScore` và xếp hạng candidate.
- `playback-health.service` đang ghi nhận success/failure ngắn hạn để hỗ trợ lần chọn tiếp theo.
- UI xem phim chỉ hiển thị `Server 1..n`, không lộ tên provider.
- Khi nguồn hiện tại lỗi hoặc phản hồi chậm, player tự chuyển sang candidate kế tiếp của cùng tập.
- Đã lưu `preferredServerIndex` và `preferredPlaybackMode` trong local storage.
- `proxyMode` storage/hook đã tồn tại, nhưng runtime proxy UI vẫn thuộc `Phase 5`.
- Build và lint đều đã chạy thành công sau khi hoàn tất Phase 4.

## Phase 5: Proxy Mode Runtime

Mục tiêu:

- Bổ sung proxy-aware delivery theo đúng kiến trúc đã chốt.

Phạm vi:

- Tạo `proxy-url.service`.
- Tạo storage/hook cho `proxyMode`.
- Bổ sung nút `Proxy OFF / ON`.
- Khi `ON`:
  - API request đi qua proxy
  - media request đi qua proxy
- Phase đầu ưu tiên `Node.js proxy` dễ debug.
- Tài liệu hóa hướng đi `Cloudflare Worker` cho production.
- Nếu có proxy `m3u8`, phải rewrite playlist và segment URL đúng rule.

Tiêu chí hoàn thành:

- Có thể bật/tắt proxy mode từ UI.
- Không làm hỏng luồng non-proxy mặc định.
- Tài liệu cấu hình proxy được cập nhật rõ ràng.

## Thứ Tự Thực Hiện Bắt Buộc

1. Baseline trước khi code
2. Phase 1: Nền tảng kiến trúc
3. Phase 2: Aggregation cho list/home/search
4. Phase 3: Detail aggregation và recommendation
5. Phase 4: Player thống nhất và tự fallback
6. Phase 5: Proxy mode runtime

Không được nhảy phase trừ khi phát hiện blocker kỹ thuật thật sự cần xử lý để phase hiện tại chạy được.

## Checklist Sau Mỗi Phase

1. Build dự án.
2. Sửa toàn bộ lỗi compile/lint phát sinh do phase đó.
3. Kiểm tra các luồng cũ vẫn hoạt động:
   - trang chủ
   - danh sách
   - tìm kiếm
   - chi tiết phim
   - trang xem phim
4. Kiểm tra không lộ provider trái với kiến trúc mục tiêu.
5. Cập nhật docs nếu có thay đổi implementation hoặc quyết định kỹ thuật nhỏ.
6. Chỉ khi mọi mục phía trên ổn định mới sang phase tiếp theo.

## Ghi Chú Rollout

- Ưu tiên giữ compatibility bằng facade trong các phase đầu để hạn chế sửa lan rộng.
- Mọi thay đổi khác thiết kế chỉ được phép khi:
  - có blocker kỹ thuật rõ ràng
  - không có cách triển khai khác bám docs
  - thay đổi được cập nhật lại tài liệu ngay
