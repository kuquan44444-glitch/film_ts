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

## Phạm vi bước hiện tại

- Đã đọc và phân tích codebase hiện có.
- Đã khảo sát các provider được yêu cầu.
- Đã đề xuất kiến trúc mục tiêu và migration plan.
- Chưa sửa code ứng dụng.
- Chưa triển khai proxy runtime.
- Chưa refactor player hoặc provider adapter.
