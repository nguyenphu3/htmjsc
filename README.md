# HTM Ops

Nền tảng vận hành cho doanh nghiệp **thương mại – dịch vụ – thi công thiết bị y tế**, xây dựng từ sơ đồ tổ chức
Công ty CP TM&DV Thiết bị Y tế H.T.M (hiệu lực 01/08/2026, QĐ 0012–0015/QĐ-HTM/2026).

MVP số hoá luồng phối hợp tốn thời gian nhất giữa các phòng ban:

```
CB công trình (P. Dự án)  ──lập──▶  Đề nghị vật tư  ──duyệt──▶  Phó phòng phụ trách dự án / Ban GĐ
                                                              │
                         ┌────────────── Mua hàng ────────────┤ (Phó P. Dự án phụ trách mua hàng toàn Công ty)
                         └────────────── Xưởng SX ────────────┘ (Quản đốc, Xưởng Ninh Bình)
                                                              ▼
                                                   Giao tới công trình  ──▶  Kế toán đối soát
```

Kèm theo: quản lý dự án/công trình, thành viên, **nhật ký công trình** (nhân lực, % tiến độ, vướng mắc),
**sơ đồ tổ chức** sống, và bảng điều khiển "việc chờ tôi xử lý" cho từng vai trò.

## Giả định sản phẩm

Sơ đồ tổ chức không mô tả sản phẩm, nên các giả định sau được dùng (cần lãnh đạo xác nhận):

1. Người dùng đầu tiên là **chính H.T.M** (45 tài khoản được seed theo sơ đồ). Hệ thống được thiết kế **multi-tenant**
   ngay từ đầu để bán dạng SaaS cho các doanh nghiệp thi công/thiết bị cùng mô hình — đó là đường tới hàng triệu người dùng.
2. Luồng giá trị cao nhất là **Dự án ↔ Mua hàng ↔ Xưởng** (mục "Quan hệ phối hợp" trong sơ đồ).
3. Người duyệt đề nghị vật tư là **quản lý dự án** (Phó P. Dự án); Ban giám đốc duyệt được mọi đề nghị; không ai tự duyệt đề nghị của mình.
4. "Mua hàng" xử lý đề nghị hình thức *mua ngoài*; "Xưởng" xử lý đề nghị hình thức *tự sản xuất*.
5. Phòng HCKT chưa có tên người phụ trách → nhân sự HCKT tạm báo cáo Giám đốc.
6. Email trong seed là địa chỉ tạm `@htm.local`; đổi sang email thật trước khi dùng.

## Chạy nhanh

**Docker (toàn bộ hệ thống):**

```bash
SEED_PASSWORD='mat-khau-manh-cua-ban' docker compose up --build
# Mở http://localhost:8080 · Mã tổ chức: htm · admin@htm.local
```

**Phát triển:**

```bash
npm install
cp apps/api/.env.example apps/api/.env      # điền JWT_SECRET, SEED_PASSWORD
# Postgres 16: tạo role theo infra/postgres/init.sql + role owner "htm"
npm run db:migrate && npm run db:seed
npm run dev:api        # http://localhost:4000
npm run dev:web        # http://localhost:5173 (proxy /api -> 4000)
npm test               # test state machine + test tích hợp API trên Postgres thật
```

Tài khoản mẫu (mật khẩu = `SEED_PASSWORD`): email là họ tên không dấu nối bằng dấu chấm.

| Vai trò | Ví dụ |
|---|---|
| Giám đốc (admin) | `admin@htm.local` |
| Phó P. Dự án, quản lý dự án miền Nam | `nguyen.van.phu@htm.local` |
| Phó P. Dự án, phụ trách mua hàng | `tran.thi.khanh.giang@htm.local` |
| Nhân viên mua hàng | `nguyen.thi.anh.hong@htm.local` |
| CB dự án tại công trình | `nguyen.ba.dang@htm.local` |
| Quản đốc Xưởng | `vu.van.thanh@htm.local` |
| Kế toán tổng hợp | `nghiem.xuan.cuong@htm.local` |

## Tài liệu

- [Kiến trúc hệ thống, cấu trúc file, kiến trúc UI](docs/architecture.md)
- [Database schema](docs/database.md)
- [API endpoints](docs/api.md)
- [Lộ trình mở rộng tới hàng triệu người dùng](docs/scaling.md)

## Stack

TypeScript end-to-end · Node 22 + Fastify 5 · PostgreSQL 16 (RLS) · React 18 + TanStack Query + Vite ·
Zod (schema dùng chung client/server) · Vitest · Docker · GitHub Actions.
