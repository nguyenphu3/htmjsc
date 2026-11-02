-- Chạy một lần khi khởi tạo cluster (docker-entrypoint-initdb.d).
-- Role ứng dụng KHÔNG sở hữu bảng -> Row Level Security luôn có hiệu lực.
-- Production: đổi mật khẩu qua secret manager, không dùng giá trị mặc định này.
CREATE ROLE htm_app LOGIN PASSWORD 'htm_app_dev';
