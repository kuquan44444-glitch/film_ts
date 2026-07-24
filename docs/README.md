# Multi Provider Handoff Docs

Tài liệu này được tạo để phục vụ giai đoạn phân tích và lập kế hoạch triển khai hệ thống Movie Aggregator đa provider.

Không có file code ứng dụng nào bị sửa trong bước này.

## Danh sách tài liệu

- `docs/provider-survey.md`
  - Khảo sát thực tế từng provider
  - Đánh giá hoạt động, CORS, tốc độ, media capability
  - Danh sách provider nên tích hợp hoặc loại bỏ

- `docs/multi-provider-architecture.md`
  - Phân tích kiến trúc hiện tại
  - Luồng dữ liệu hiện tại
  - Thiết kế kiến trúc Multi Provider mục tiêu
  - Thiết kế Adapter, Aggregation, Recommendation, Player, Proxy

- `docs/migration-plan.md`
  - Danh sách file cần sửa/thêm/xóa
  - Kế hoạch migration theo phase
  - Rủi ro, chiến lược rollout và kiểm thử
  - Hướng dẫn cài đặt/chạy và định hướng cấu hình Proxy

## Tình trạng hiện tại

- Đã hoàn thành giai đoạn phân tích và lập kế hoạch.
- Đã hoàn thành `Phase 1: Nền Tảng Kiến Trúc`.
- Đã hoàn thành `Phase 2: Aggregation Cho List/Home/Search`.
- Đã hoàn thành `Phase 3: Detail Aggregation Và Recommendation`.
- Đã tạo cây thư mục mới cho:
  - `src/providers`
  - `src/domain`
  - `src/services`
  - `src/storage`
  - `src/apis/movieGateway.ts`
- Đã tách provider adapter khỏi `src/apis/filmSourceAdapters.ts` sang registry/adapters mới.
- Đã giữ `filmApis` làm facade tương thích để UI hiện tại tiếp tục hoạt động.
- Đã thay `firstSuccessful` của `list/search` bằng aggregation thật qua nhiều provider.
- Đã thêm dedupe/sort layer dùng chung cho `Home`, `List`, `Search`.
- `Home` đã đi qua một query aggregate và dedupe toàn màn hình giữa các section.
- `Search` đã query đa provider song song, có `debounce 400ms` và sort theo search score.
- `List`, `Home`, `Search` vẫn đi qua facade `filmApis` để hạn chế lan rộng phạm vi refactor.
- `Detail` đã đi qua `detail-aggregation.service` và có recommendation từ `recommendation.service`.
- `build` và `lint` hiện chạy sạch lại sau khi cài dependency local đúng version trong repo.
- `Film` đã dùng unified player `video + hls.js`, không còn fallback sang `iframe`.
- `Film` đã có chọn thủ công `Phiên bản` (`Vietsub` / `Thuyết minh`) và `Máy chủ` (`Server 1/2/3`) theo dữ liệu aggregate hiện có.
- Luồng đổi lại server đã được sửa để luôn resolve lại nguồn phát khi người dùng chọn tay, kể cả sau khi auto fallback vừa chuyển sang server khác.
- Local playback preference hiện lưu thêm `preferredVersionLabel` bên cạnh `preferredServerIndex` và `preferredPlaybackMode`.
- Chưa bật proxy runtime từ UI.
