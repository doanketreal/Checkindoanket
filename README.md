# Checkin Đoàn Kết

Ứng dụng chấm công theo **ngày trên lịch**.

## Tính năng chính

- Đăng ký tài khoản (không dùng mã nhân viên).
- Đăng nhập và mở cửa sổ chấm công mới (`dashboard.html`).
- Quên mật khẩu bằng mã đặt lại: `doanketreal`.
- Tab 1: Lịch theo tháng, chọn ngày để chấm công.
- Có thể xoá chấm công khi thao tác nhầm.
- Tab 2: Danh sách các lần đã chấm.
- Phân quyền:
  - `admin`: xem và xoá tất cả bản ghi.
  - `member`: chỉ xem/xoá bản ghi của chính mình.

## Chạy local

```bash
node server.js
```

Mặc định:
- `http://localhost:3000`

## Biến môi trường

- `PORT`
- `AUTH_SECRET`
- `RESET_PASSWORD_CODE` (mặc định là `doanketreal`)

Ví dụ:

```bash
AUTH_SECRET=mot-chuoi-bi-mat-rat-dai
RESET_PASSWORD_CODE=doanketreal
```

## API chính

### Auth

- `POST /api/auth/register`
  - body: `{ "fullName": "Nguyễn Văn A", "username": "nguyenvana", "password": "123456" }`
- `POST /api/auth/login`
  - body: `{ "username": "nguyenvana", "password": "123456" }`
- `POST /api/auth/reset-password`
  - body: `{ "username": "nguyenvana", "resetCode": "doanketreal", "newPassword": "654321" }`
- `GET /api/auth/me`
  - header: `Authorization: Bearer <token>`

### Attendance

- `GET /api/attendance/calendar?month=2026-05`
- `GET /api/attendance?date=2026-05-28`
- `POST /api/attendance`
  - body: `{ "date": "2026-05-28" }`
- `DELETE /api/attendance/<recordId>`

## Lưu ý

- Dữ liệu lưu trong `data/attendance.json`.
- Nếu deploy gói Free trên Render, cần chú ý hạn chế lưu trữ lâu dài của filesystem.
