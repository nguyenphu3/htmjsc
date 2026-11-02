# Ghi chú triển khai production

- **API** (`apps/api/Dockerfile`): stateless, scale ngang theo CPU (HPA). Liveness `/healthz`, readiness `/readyz`.
  SIGTERM được xử lý: ngừng nhận request, chờ request đang chạy (tối đa 15s), đóng pool.
- **Worker**: cùng image, `node dist/worker.js`. Chạy N bản song song an toàn (`FOR UPDATE SKIP LOCKED`).
- **Migrate**: Job chạy `node dist/db/migrate.js` trước mỗi lần deploy, dùng `MIGRATION_DATABASE_URL` (role owner).
  Có advisory lock nên nhiều Job chạy trùng cũng không hỏng schema.
- **Database**: Postgres managed (RDS/Cloud SQL/Supabase). App kết nối bằng role `htm_app` (không phải owner)
  để RLS có hiệu lực. Đặt PgBouncer ở chế độ transaction pooling: `set_config(..., true)` chỉ sống trong transaction nên tương thích.
- **Secrets**: `JWT_SECRET`, mật khẩu DB qua secret manager. Không commit `.env`.
- **Web**: build tĩnh, đẩy lên CDN/object storage, hoặc dùng image nginx đi kèm.
