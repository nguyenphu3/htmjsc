/**
 * Dữ liệu khởi tạo theo Sơ đồ tổ chức Công ty CP TM&DV Thiết bị Y tế H.T.M, hiệu lực 01/08/2026
 * (QĐ 0012–0015/QĐ-HTM/2026). Email là địa chỉ tạm (@htm.local) — đổi sang email thật khi triển khai.
 */
import type { Role } from '@htm/shared';

export interface SeedDept {
  code: string;
  name: string;
  parent?: string;
  decisionRef?: string;
}

export interface SeedUser {
  key: string;
  fullName: string;
  title: string;
  gradeCode?: string;
  dept: string;
  manager?: string;
  roles: Role[];
}

export const TENANT = { slug: 'htm', name: 'Công ty CP Thương mại và Dịch vụ Thiết bị Y tế H.T.M' };

export const DEPARTMENTS: SeedDept[] = [
  { code: 'BGD', name: 'Ban Giám đốc' },
  { code: 'HCKT', name: 'Phòng Hành chính kế toán', parent: 'BGD', decisionRef: 'QĐ 0012/QĐ-HTM/2026' },
  { code: 'DA', name: 'Phòng Dự án', parent: 'BGD', decisionRef: 'QĐ 0013/QĐ-HTM/2026' },
  { code: 'DVBH', name: 'Phòng Dịch vụ và bán hàng', parent: 'BGD', decisionRef: 'QĐ 0014/QĐ-HTM/2026' },
  { code: 'XSX', name: 'Xưởng sản xuất', parent: 'BGD', decisionRef: 'QĐ 0015/QĐ-HTM/2026' },
];

/** Trưởng đơn vị theo mã phòng -> key người dùng. HCKT: quyết định chưa nêu tên người phụ trách. */
export const DEPARTMENT_HEADS: Record<string, string> = {
  BGD: 'dat-gd',
  DA: 'thin',
  DVBH: 'dat-dv',
  XSX: 'thanh-xuong',
};

const crew = (key: string, fullName: string): SeedUser => ({
  key,
  fullName,
  title: 'Nhân viên triển khai, thi công, lắp đặt',
  gradeCode: 'A.01',
  dept: 'DA',
  manager: 'thin',
  roles: ['staff'],
});

export const USERS: SeedUser[] = [
  // Ban Giám đốc
  { key: 'dat-gd', fullName: 'Nguyễn Tuấn Đạt', title: 'Giám đốc', dept: 'BGD', roles: ['director', 'admin'] },

  // Phòng Dự án (26 người)
  { key: 'thin', fullName: 'Dương Đắc Thìn', title: 'Phó Giám đốc, Trưởng phòng Dự án', gradeCode: 'E.02', dept: 'DA', manager: 'dat-gd', roles: ['director', 'manager'] },
  { key: 'phu', fullName: 'Nguyễn Văn Phú', title: 'Phó P. Dự án: quản lý triển khai thi công, khu vực miền Nam', gradeCode: 'D.03', dept: 'DA', manager: 'thin', roles: ['manager'] },
  { key: 'bau', fullName: 'Vũ Tuấn Báu', title: 'Phó P. Dự án: quản lý triển khai thi công', gradeCode: 'D.03', dept: 'DA', manager: 'thin', roles: ['manager'] },
  { key: 'giang', fullName: 'Trần Thị Khánh Giang', title: 'Phó P. Dự án: phụ trách mua hàng toàn Công ty', gradeCode: 'D.03', dept: 'DA', manager: 'thin', roles: ['manager', 'procurement'] },
  { key: 'hong', fullName: 'Nguyễn Thị Ánh Hồng', title: 'Nhân viên mua hàng', gradeCode: 'B.05', dept: 'DA', manager: 'giang', roles: ['procurement'] },
  { key: 'thu', fullName: 'Lê Thị Ngọc Thu', title: 'Chuyên viên dự án: hồ sơ dự toán, HĐ, thanh quyết toán', gradeCode: 'B.01', dept: 'DA', manager: 'thin', roles: ['staff'] },
  { key: 'hoa', fullName: 'Lê Thị Hoa', title: 'Chuyên viên dự án: hồ sơ dự toán, HĐ, thanh quyết toán', gradeCode: 'B.01', dept: 'DA', manager: 'thin', roles: ['staff'] },
  { key: 'dung', fullName: 'Trần Tiến Dũng', title: 'CB dự án: triển khai công tác đấu thầu', gradeCode: 'B.01', dept: 'DA', manager: 'thin', roles: ['staff'] },
  { key: 'long', fullName: 'Nguyễn Ngọc Long', title: 'Kỹ sư dự án: thiết kế, shop, kế hoạch vật tư, triển khai', gradeCode: 'B.01', dept: 'DA', manager: 'thin', roles: ['staff'] },
  { key: 'dang', fullName: 'Nguyễn Bá Đăng', title: 'CB dự án, triển khai dự án tại công trình', gradeCode: 'C.04', dept: 'DA', manager: 'thin', roles: ['staff'] },
  { key: 'doan', fullName: 'Trần Việt Đoàn', title: 'CB dự án, triển khai dự án tại công trình', gradeCode: 'C.03', dept: 'DA', manager: 'thin', roles: ['staff'] },
  { key: 'hung', fullName: 'Trần Văn Hưng', title: 'CB dự án, triển khai dự án tại công trình', gradeCode: 'C.04', dept: 'DA', manager: 'thin', roles: ['staff'] },
  { key: 'hoang', fullName: 'Nguyễn Mạnh Hoàng', title: 'CB dự án, triển khai dự án tại công trình', gradeCode: 'C.03', dept: 'DA', manager: 'thin', roles: ['staff'] },
  crew('tuan', 'Hà Như Tuấn'),
  crew('quy', 'Vũ Văn Quý'),
  crew('loi', 'Hà Văn Lợi'),
  crew('truong', 'Nguyễn Xuân Trường'),
  crew('hoan', 'Bùi Vinh Hoàn'),
  crew('chuong', 'Tô Văn Chương'),
  crew('hieu', 'Trần Đình Hiếu'),
  crew('tuyen', 'Vũ Công Tuyển'),
  crew('phong', 'Phạm Xuân Phong'),
  crew('doan2', 'Nguyễn Văn Đoàn'),
  crew('hop', 'Đinh Văn Hợp'),
  crew('thien', 'Nguyễn Văn Thiện'),
  crew('tuan2', 'Dương Đắc Tuấn'),

  // Phòng Hành chính kế toán (8 người, báo cáo Phụ trách phòng — chưa nêu tên -> báo cáo Giám đốc)
  { key: 'cuong', fullName: 'Nghiêm Xuân Cường', title: 'Kế toán tổng hợp', gradeCode: 'B.04', dept: 'HCKT', manager: 'dat-gd', roles: ['accountant'] },
  { key: 'my', fullName: 'Nguyễn Thị Trà My', title: 'Kế toán', gradeCode: 'B.05', dept: 'HCKT', manager: 'dat-gd', roles: ['accountant'] },
  { key: 'huong', fullName: 'Vũ Thị Hường', title: 'Kế toán', gradeCode: 'B.05', dept: 'HCKT', manager: 'dat-gd', roles: ['accountant'] },
  { key: 'thanh-kt', fullName: 'Nguyễn Thị Thanh', title: 'Kế toán', gradeCode: 'B.05', dept: 'HCKT', manager: 'dat-gd', roles: ['accountant'] },
  { key: 'ha', fullName: 'Đinh Thị Thúy Hà', title: 'Cán bộ hành chính - kế toán', gradeCode: 'B.04', dept: 'HCKT', manager: 'dat-gd', roles: ['accountant'] },
  { key: 'tung', fullName: 'Phạm Thanh Tùng', title: 'Nhân viên kho Hà Nội', gradeCode: 'A.05', dept: 'HCKT', manager: 'dat-gd', roles: ['staff'] },
  { key: 'thinh', fullName: 'Nguyễn Danh Thịnh', title: 'Nhân viên lái xe', gradeCode: 'A.06', dept: 'HCKT', manager: 'dat-gd', roles: ['staff'] },
  { key: 'van', fullName: 'Nguyễn Thị Vân', title: 'Nhân viên vệ sinh', gradeCode: 'A.08', dept: 'HCKT', manager: 'dat-gd', roles: ['staff'] },

  // Phòng Dịch vụ và bán hàng (4 người)
  { key: 'dat-dv', fullName: 'Vũ Đức Đạt', title: 'Phó phòng, phụ trách P. Dịch vụ và bán hàng', gradeCode: 'D.03', dept: 'DVBH', manager: 'dat-gd', roles: ['manager'] },
  { key: 'thuy', fullName: 'Điền Anh Thúy', title: 'Cán bộ kinh doanh', gradeCode: 'B.02', dept: 'DVBH', manager: 'dat-dv', roles: ['staff'] },
  { key: 'thanh-kt2', fullName: 'Nguyễn Trọng Thành', title: 'Cán bộ kỹ thuật', gradeCode: 'B.02', dept: 'DVBH', manager: 'dat-dv', roles: ['staff'] },
  { key: 'viet', fullName: 'Nguyễn Quốc Việt', title: 'Nhân sự kỹ thuật, tổng hợp và chuẩn bị tài liệu kỹ thuật', gradeCode: 'B.05', dept: 'DVBH', manager: 'dat-dv', roles: ['staff'] },

  // Xưởng sản xuất (6 người)
  { key: 'thanh-xuong', fullName: 'Vũ Văn Thanh', title: 'Quản đốc Xưởng sản xuất', gradeCode: 'D.02', dept: 'XSX', manager: 'dat-gd', roles: ['manager', 'workshop'] },
  { key: 'lananh', fullName: 'Điền Thị Lan Anh', title: 'Hành chính và kho tại Ninh Bình', gradeCode: 'B.05', dept: 'XSX', manager: 'thanh-xuong', roles: ['workshop'] },
  { key: 'quan', fullName: 'Điền Văn Quân', title: 'Thi công, triển khai bản vẽ sản xuất; bóc tách khối lượng dự trù vật tư', gradeCode: 'B.05', dept: 'XSX', manager: 'thanh-xuong', roles: ['workshop'] },
  { key: 'thai', fullName: 'Vũ Văn Thái', title: 'Nhân viên sản xuất', gradeCode: 'A.02', dept: 'XSX', manager: 'thanh-xuong', roles: ['staff'] },
  { key: 'xuan', fullName: 'Điền Văn Xuân', title: 'Lái xe, nhân viên sản xuất', gradeCode: 'A.06', dept: 'XSX', manager: 'thanh-xuong', roles: ['staff'] },
  { key: 'chung', fullName: 'Lê Văn Chung', title: 'Nhân viên sản xuất', gradeCode: 'A.02', dept: 'XSX', manager: 'thanh-xuong', roles: ['staff'] },
];

/** Bỏ dấu tiếng Việt, tạo email tạm duy nhất. */
export function emailFor(fullName: string, taken: Set<string>): string {
  const base = fullName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .split(/\s+/)
    .join('.');
  let email = `${base}@htm.local`;
  for (let i = 2; taken.has(email); i++) email = `${base}${i}@htm.local`;
  taken.add(email);
  return email;
}
