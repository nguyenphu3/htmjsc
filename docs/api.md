# API endpoints

Base URL: `/api/v1`. JSON. Xác thực: `Authorization: Bearer <accessToken>` (trừ `/auth/login|refresh|logout`).
Lỗi: `{ "error": { "code", "message", "details?", "requestId" } }` — mã: `UNAUTHORIZED` 401, `FORBIDDEN` 403,
`NOT_FOUND` 404, `CONFLICT`/`INVALID_TRANSITION` 409, `VALIDATION_FAILED` 422, `RATE_LIMITED` 429.
Danh sách trả `{ data, nextCursor }`; truyền `?cursor=` để lấy trang sau, `?limit=` (≤100).

## Hệ thống
| Method | Path | Mô tả |
|---|---|---|
| GET | `/healthz` | Liveness |
| GET | `/readyz` | Readiness (kiểm tra DB) |

## Auth
| Method | Path | Body | Mô tả |
|---|---|---|---|
| POST | `/auth/login` | `{ tenant, email, password }` | Trả `accessToken`, `refreshToken`, `user`; đặt cookie `htm_rt` |
| POST | `/auth/refresh` | `{ refreshToken? }` (hoặc cookie) | Xoay vòng token |
| POST | `/auth/logout` | `{ refreshToken? }` | Thu hồi phiên |
| GET | `/auth/me` | | Người dùng hiện tại |

## Tổ chức
| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| GET | `/departments` | mọi người | Cây phòng ban + số nhân sự |
| GET | `/users?departmentId&q&limit` | mọi người | Danh bạ |
| GET | `/users/:id` | mọi người | |
| POST | `/users` | admin | Tạo tài khoản |
| PATCH | `/users/:id` | admin | Sửa vai trò, phòng ban, khoá tài khoản (thu hồi phiên) |

## Dự án
| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| GET | `/projects?status&region&q&mine` | theo phạm vi xem | Danh sách |
| POST | `/projects` | admin/director/manager | Tạo |
| GET | `/projects/:id` | thành viên hoặc vai trò xem-tất-cả | Trả thêm `permissions` |
| PATCH | `/projects/:id` | QL dự án, Ban GĐ | Sửa |
| GET | `/projects/:id/members` | xem được dự án | |
| POST | `/projects/:id/members` | QL dự án, Ban GĐ | `{ userId, role? }` |
| DELETE | `/projects/:id/members/:userId` | QL dự án, Ban GĐ | |
| GET | `/projects/:id/site-reports` | xem được dự án | Nhật ký |
| POST | `/projects/:id/site-reports` | thành viên | `{ reportDate, workforce, progressPercent, summary, issues? }` |

## Đề nghị vật tư
| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| GET | `/material-requests?view=all\|mine\|inbox&status&projectId&fulfillment` | theo phạm vi | `inbox` = đang chờ chính tôi |
| POST | `/material-requests` | thành viên dự án | `{ projectId, title, fulfillment, neededBy?, note?, items[], submit? }` |
| GET | `/material-requests/:id` | theo phạm vi | Kèm `items`, `events`, `actions` (thao tác tôi được làm) |
| PATCH | `/material-requests/:id` | người lập, khi Nháp | Sửa nội dung/hạng mục |
| POST | `/material-requests/:id/transitions` | theo state machine | `{ action, comment? }` — `submit, approve, reject, start, deliver, cancel, reopen` |

## Tổng quan
| Method | Path | Mô tả |
|---|---|---|
| GET | `/dashboard/summary` | `projectsByStatus`, `requestsByStatus`, `inboxCount` |
