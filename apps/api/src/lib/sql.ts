/**
 * Tiền tố cho các truy vấn có $1 = userId nhưng không phải nhánh nào cũng dùng tới
 * (ví dụ Ban giám đốc xem tất cả). Khai báo kiểu cho $1 để Postgres không báo lỗi tham số thừa.
 */
export const WITH_ME = 'WITH _me AS (SELECT $1::uuid AS id) ';
