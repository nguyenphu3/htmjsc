# Lộ trình mở rộng tới hàng triệu người dùng

MVP chạy tốt trên **1 API + 1 Postgres** cho hàng nghìn doanh nghiệp nhỏ. Các bước dưới đây được làm *khi số liệu đòi hỏi*,
và kiến trúc hiện tại đã chừa sẵn đường cho từng bước.

| Giai đoạn | Quy mô | Việc cần làm | Đã chuẩn bị sẵn trong MVP |
|---|---|---|---|
| 0 | 1 doanh nghiệp (H.T.M), ~50 user | `docker compose` trên 1 VM, backup Postgres hằng ngày | Docker, migrate tự động, health check |
| 1 | 100 tenant, ~5k user | Postgres managed + PITR; 2–3 replica API sau LB; CDN cho SPA; Sentry/OTel | API stateless, graceful shutdown, requestId, log JSON |
| 2 | 1k tenant, ~50k user | PgBouncer; Redis cho rate limit (`@fastify/rate-limit` có sẵn store Redis) và cache danh bạ; worker gửi email/Zalo | `set_config(..., true)` tương thích transaction pooling; outbox + worker `SKIP LOCKED` |
| 3 | 10k tenant, ~500k user | Read replica cho dashboard/báo cáo; partition `material_request_events`, `outbox_events` theo tháng; object storage (S3) cho ảnh hiện trường, presigned URL | Index bắt đầu bằng `tenant_id`; bảng sự kiện append-only; keyset pagination |
| 4 | Hàng triệu user | Shard theo `tenant_id` (Citus hoặc nhiều cụm Postgres + bảng định tuyến tenant); tách module nóng thành service (thông báo, báo cáo); event bus (Kafka/SQS) thay polling outbox | Mọi khoá/ràng buộc/truy vấn đã kèm `tenant_id` ⇒ dữ liệu một tenant luôn nằm trọn một shard; ranh giới module rõ |

## Ngân sách hiệu năng (mục tiêu)

- p95 API < 150 ms cho đọc, < 300 ms cho ghi.
- Mọi truy vấn danh sách dùng index, không `OFFSET`, `LIMIT ≤ 100`.
- Truy vấn bị huỷ sau 10 s (`statement_timeout`), kết nối chờ tối đa 5 s.

## Tính năng tiếp theo (theo giá trị nghiệp vụ)

1. Thông báo realtime (Zalo OA / email / web push) từ outbox — người duyệt không phải mở app để biết.
2. Đính kèm ảnh hiện trường & báo giá (S3 presigned).
3. Báo giá & đơn mua hàng (PO) từ đề nghị đã duyệt; nhà cung cấp; so sánh giá.
4. Lệnh sản xuất cho Xưởng: bóc tách khối lượng từ bản vẽ shop, kho Ninh Bình.
5. Hồ sơ dự toán, hợp đồng, thanh quyết toán (P. Dự án ↔ HCKT); xuất Excel cho kế toán.
6. Ứng dụng mobile (React Native) dùng lại `@htm/shared` và cùng API.
7. Self-signup tenant + billing để mở bán SaaS.
