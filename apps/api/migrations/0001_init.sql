-- HTM Ops · schema khởi tạo
-- Nguyên tắc:
--   * Mọi bảng nghiệp vụ có tenant_id (multi-tenant ngay từ ngày đầu).
--   * Row Level Security (RLS) cưỡng chế cô lập dữ liệu giữa các tenant, kể cả khi code quên lọc.
--   * Khoá chính UUID (sinh phía DB), index luôn bắt đầu bằng tenant_id.


CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- ---------- Tenants ----------
CREATE TABLE tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{2,64}$'),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------- Departments (phòng ban, cây tổ chức) ----------
CREATE TABLE departments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code          text NOT NULL,
  name          text NOT NULL,
  parent_id     uuid REFERENCES departments(id) ON DELETE SET NULL,
  head_user_id  uuid,
  decision_ref  text,             -- số quyết định kiện toàn, ví dụ QĐ 0013/QĐ-HTM/2026
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

-- ---------- Users ----------
CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email          text NOT NULL CHECK (email = lower(email)),
  full_name      text NOT NULL,
  password_hash  text NOT NULL,
  title          text,
  grade_code     text,              -- mã ngạch/bậc theo quyết định, ví dụ B.05
  department_id  uuid REFERENCES departments(id) ON DELETE SET NULL,
  manager_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  roles          text[] NOT NULL DEFAULT ARRAY['staff'],
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  last_login_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);
CREATE INDEX users_tenant_department_idx ON users (tenant_id, department_id);
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE departments
  ADD CONSTRAINT departments_head_user_fk FOREIGN KEY (head_user_id) REFERENCES users(id) ON DELETE SET NULL;

-- ---------- Refresh tokens (xoay vòng, phát hiện dùng lại) ----------
CREATE TABLE refresh_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  replaced_by  uuid,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (tenant_id, user_id);

-- ---------- Projects (công trình / dự án) ----------
CREATE TABLE projects (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code         text NOT NULL,
  name         text NOT NULL,
  client_name  text,
  location     text,
  region       text NOT NULL CHECK (region IN ('north', 'central', 'south')),
  status       text NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'on_hold', 'completed')),
  manager_id   uuid NOT NULL REFERENCES users(id),
  start_date   date,
  end_date     date,
  budget_vnd   bigint CHECK (budget_vnd >= 0),
  created_by   uuid NOT NULL REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE INDEX projects_list_idx ON projects (tenant_id, created_at DESC, id DESC);
CREATE INDEX projects_manager_idx ON projects (tenant_id, manager_id);
CREATE TRIGGER projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE project_members (
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'member',
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX project_members_user_idx ON project_members (tenant_id, user_id);

-- ---------- Material requests (đề nghị vật tư) ----------
CREATE TABLE material_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code          text NOT NULL,
  project_id    uuid NOT NULL REFERENCES projects(id),
  title         text NOT NULL,
  fulfillment   text NOT NULL CHECK (fulfillment IN ('purchase', 'production')),
  status        text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'in_progress', 'delivered', 'cancelled')),
  needed_by     date,
  note          text,
  requested_by  uuid NOT NULL REFERENCES users(id),
  version       integer NOT NULL DEFAULT 1,  -- optimistic locking
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX mr_list_idx ON material_requests (tenant_id, created_at DESC, id DESC);
CREATE INDEX mr_status_idx ON material_requests (tenant_id, status, fulfillment);
CREATE INDEX mr_project_idx ON material_requests (tenant_id, project_id);
CREATE INDEX mr_requester_idx ON material_requests (tenant_id, requested_by);
CREATE TRIGGER mr_updated_at BEFORE UPDATE ON material_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE material_request_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  request_id   uuid NOT NULL REFERENCES material_requests(id) ON DELETE CASCADE,
  position     integer NOT NULL,
  name         text NOT NULL,
  spec         text,
  unit         text NOT NULL,
  quantity     numeric(18, 3) NOT NULL CHECK (quantity > 0),
  UNIQUE (request_id, position)
);

-- Lịch sử trạng thái: append-only, phục vụ audit và timeline.
CREATE TABLE material_request_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  request_id   uuid NOT NULL REFERENCES material_requests(id) ON DELETE CASCADE,
  actor_id     uuid NOT NULL REFERENCES users(id),
  action       text NOT NULL,
  from_status  text,
  to_status    text NOT NULL,
  comment      text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mr_events_request_idx ON material_request_events (request_id, created_at);

-- ---------- Site reports (nhật ký công trình) ----------
CREATE TABLE site_reports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  report_date       date NOT NULL,
  workforce         integer NOT NULL CHECK (workforce >= 0),
  progress_percent  integer NOT NULL CHECK (progress_percent BETWEEN 0 AND 100),
  summary           text NOT NULL,
  issues            text,
  author_id         uuid NOT NULL REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, report_date, author_id)
);
CREATE INDEX site_reports_project_idx ON site_reports (tenant_id, project_id, report_date DESC);

-- ---------- Số chứng từ theo tenant/năm (không trùng, không cần sequence riêng) ----------
CREATE TABLE doc_counters (
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  year       integer NOT NULL,
  value      integer NOT NULL,
  PRIMARY KEY (tenant_id, kind, year)
);

-- ---------- Transactional outbox: sự kiện cho worker (thông báo, tích hợp) ----------
CREATE TABLE outbox_events (
  id             bigserial PRIMARY KEY,
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  topic          text NOT NULL,
  payload        jsonb NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  available_at   timestamptz NOT NULL DEFAULT now(),
  attempts       integer NOT NULL DEFAULT 0,
  processed_at   timestamptz,
  last_error     text
);
CREATE INDEX outbox_pending_idx ON outbox_events (available_at) WHERE processed_at IS NULL;

-- ---------- Row Level Security ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'departments', 'users', 'refresh_tokens', 'projects', 'project_members',
    'material_requests', 'material_request_items', 'material_request_events',
    'site_reports', 'doc_counters'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant())',
      t
    );
  END LOOP;
END $$;
-- outbox_events không bật RLS: chỉ worker hệ thống đọc, app chỉ INSERT.
