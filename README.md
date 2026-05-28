# Checkin Đoàn Kết

Web chấm công có 4 tab chính sau khi đăng nhập:

## Tab 1: Lịch & chấm công

- Chọn ngày trên lịch.
- Bấm chấm công cho ngày đã chọn.
- Nếu chấm nhầm có thể xoá chấm công.
- Hiển thị danh sách người đã chấm trong ngày.
- Hiển thị số tiền phải trả bên cạnh từng người (sau khi tính ở Tab 2).
- Hiển thị tổng thu trong ngày.
- Có nút hiện mã QR (`public/qr.jpg`).
- Có thể chọn ngày và xuất file Excel (`.csv`) cho ngày đó.

## Tab 2: Data nhập

- Chỉ `admin` hoặc người được admin cấp quyền mới được nhập.
- Admin có dòng thêm/xoá người được phép nhập.
- Nhập các biến:
  - `SC`, `TC`, `SS`, `TS`, `SB`, `TB`, `SG`, `TG`
- Nhập công thức:
  - Nam cố định
  - Nữ cố định
  - Nam giao lưu
  - Nữ giao lưu
- Công thức hỗ trợ `+ - * /` và biến (ví dụ `SC`, `TG`, `NCD`, `NuCD`, hoặc `'TG'`).
- `NCD` và `NuCD` tự tính từ danh sách chấm công theo giới tính.
- Bấm `Tính và lưu` để ghi tiền phải trả cho từng người trong Tab 1.
- Có nút sao chép nhanh biến/công thức từ ngày khác vào ngày đang chọn.

## Tab 3: Game cầu lông

- Game hứng cầu bằng phím mũi tên trái/phải.
- Độ khó tăng mỗi 35 giây.
- Có bảng xếp hạng điểm cao nhất theo tài khoản đã đăng ký.

## Tab 4: Thành viên cố định

- Hiển thị danh sách tất cả tài khoản thành viên cố định đã đăng ký.
- Có thống kê tổng số, số Nam, số Nữ.
- Hiển thị vai trò (Admin hoặc Thành viên).

## Auth

- Đăng ký gồm: Họ tên, Username, Mật khẩu, Giới tính (Nam/Nữ).
- Đăng nhập mở cửa sổ mới `dashboard.html`.
- Quên mật khẩu: nhập mã `doanketreal` để đổi.

## Chạy local

```bash
node server.js
```

App chạy mặc định ở:
- `http://localhost:3000`

## Biến môi trường

- `PORT`
- `AUTH_SECRET`
- `RESET_PASSWORD_CODE` (mặc định: `doanketreal`)

## Dữ liệu lưu

File:
- `data/attendance.json`

Cấu trúc chính:
- `users`
- `attendance`
- `dayConfigs`
- `dataEditors`
- `gameScores`
