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
- Đã tạo cây thư mục mới cho:
  - `src/providers`
  - `src/domain`
  - `src/services`
  - `src/storage`
  - `src/apis/movieGateway.ts`
- Đã tách provider adapter khỏi `src/apis/filmSourceAdapters.ts` sang registry/adapters mới.
- Đã giữ `filmApis` làm facade tương thích để UI hiện tại tiếp tục hoạt động.
- Đã thêm service skeleton cho aggregation, recommendation, media selection, playback health và proxy URL.
- Chưa triển khai `Phase 2` trở đi.
- Chưa thay player hiện tại sang unified player không `iframe`.
- Chưa bật proxy runtime từ UI.
