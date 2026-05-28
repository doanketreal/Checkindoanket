# Checkin Doan Ket (Co Tai Khoan)

Web cham cong co:
- Dang ky tai khoan
- Dang nhap/dang xuat
- Check-in/check-out theo tai khoan da dang nhap
- Tong hop va lich su cham cong
- Phan quyen:
  - `admin`: xem tat ca du lieu
  - `member`: chi xem du lieu cua minh

Tai khoan dau tien dang ky se la `admin`.

## 1) Chay local

Neu may co `npm`:

```bash
npm start
```

Neu khong co `npm`:

```bash
node server.js
```

App chay mac dinh o:
- `http://localhost:3000`

## 2) ENV production

Dat bien moi truong sau khi deploy:

- `PORT` (do nen tang cung cap)
- `AUTH_SECRET` (bat buoc tu dat chuoi dai va bi mat)

Vi du:

```bash
AUTH_SECRET=doan-ket-secret-rat-dai-va-kho-doan
```

## 3) Day code len GitHub

Trong thu muc du an:

```bash
git init
git add .
git commit -m "feat: attendance app with auth"
git branch -M main
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin main
```

## 4) Deploy public tu GitHub (de moi nguoi truy cap)

Co 2 cach:

### Cach A (de nhat): Render Web Service

1. Vao Render -> `New` -> `Web Service`.
2. Ket noi repo GitHub `Checkindoanket`.
3. Cau hinh:
   - Runtime: `Node`
   - Build Command: de trong
   - Start Command: `node server.js`
4. Them ENV:
   - `AUTH_SECRET=...` (tu dat)
5. Bam `Create Web Service`.
6. Sau khi deploy xong se co URL dang:
   - `https://<service-name>.onrender.com`

### Cach B: VPS + No-IP

1. May/VPS chay `node server.js` 24/7.
2. Cai No-IP DUC de cap nhat IP dong.
3. Port forwarding (neu chay may nha): WAN -> LAN `3000`.
4. Mo Firewall cho port app.

## 5) Neu ban van muon dung No-IP voi app deploy cloud

Neu app da deploy Render thi URL da cong khai, thuong khong can No-IP nua.
No-IP phu hop nhat khi ban tu host tai nha/VPS IP dong.

## 6) API chinh

### Auth
- `POST /api/auth/register`
  - body: `{ "fullName": "Nguyen Van A", "employeeId": "NV001", "username": "nguyenvana", "password": "123456" }`
- `POST /api/auth/login`
  - body: `{ "username": "nguyenvana", "password": "123456" }`
- `GET /api/auth/me`
  - header: `Authorization: Bearer <token>`

### Attendance
- `POST /api/checkin` (can token)
- `POST /api/checkout` (can token)
- `GET /api/summary/today` (can token)
- `GET /api/records?employeeId=NV001&date=2026-05-28` (can token)

## 7) Luu y bao mat

- Doi `AUTH_SECRET` khi deploy that.
- Khuyen nghi dung HTTPS (Render mac dinh da co HTTPS).
- Khong commit du lieu that nhay cam len GitHub public.
