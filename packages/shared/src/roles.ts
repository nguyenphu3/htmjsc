/**
 * Vai trò hệ thống. Một người có thể giữ nhiều vai trò
 * (ví dụ Phó P. Dự án phụ trách mua hàng = manager + procurement).
 */
export const ROLES = [
  'admin', // Quản trị hệ thống (cấu hình tổ chức, người dùng)
  'director', // Ban giám đốc: xem toàn bộ, phê duyệt mọi đề nghị
  'manager', // Trưởng/Phó phòng, Quản đốc: quản lý dự án, duyệt đề nghị của dự án mình phụ trách
  'procurement', // Mua hàng toàn Công ty: xử lý đề nghị mua
  'workshop', // Xưởng sản xuất: xử lý đề nghị sản xuất
  'accountant', // Kế toán: xem chi phí, đối soát
  'staff', // Nhân viên: tạo đề nghị, nhật ký công trình cho dự án mình tham gia
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Quản trị',
  director: 'Ban giám đốc',
  manager: 'Quản lý',
  procurement: 'Mua hàng',
  workshop: 'Xưởng',
  accountant: 'Kế toán',
  staff: 'Nhân viên',
};

export function hasAnyRole(userRoles: readonly string[], ...wanted: Role[]): boolean {
  return wanted.some((r) => userRoles.includes(r));
}
