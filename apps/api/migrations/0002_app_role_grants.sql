-- Cấp quyền cho role ứng dụng (non-owner) nếu tồn tại. Role được tạo ở tầng hạ tầng
-- (infra/postgres/init.sql) để mật khẩu không nằm trong migration.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'htm_app') THEN
    GRANT USAGE ON SCHEMA public TO htm_app;
    GRANT SELECT ON tenants TO htm_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      departments, users, refresh_tokens, projects, project_members,
      material_requests, material_request_items, material_request_events,
      site_reports, doc_counters TO htm_app;
    GRANT SELECT, INSERT, UPDATE ON outbox_events TO htm_app;
    GRANT USAGE, SELECT ON SEQUENCE outbox_events_id_seq TO htm_app;
    GRANT EXECUTE ON FUNCTION app_current_tenant() TO htm_app;
  END IF;
END $$;
