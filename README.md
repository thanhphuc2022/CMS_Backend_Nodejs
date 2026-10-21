# 🌐 Enterprise CMS Backend - Node.js + MongoDB + TinyMCE

Hệ thống quản lý nội dung (CMS) dành cho website doanh nghiệp, hỗ trợ quản trị tin tức, banner, logo, nội dung tùy chỉnh với trình soạn thảo WYSIWYG (TinyMCE). 
Hệ thống được bảo vệ bằng xác thực JWT và phân quyền người dùng. API được triển khai trên Vercel.

---

## 🚀 Tính năng nổi bật

- ✅ Quản lý tin tức: thêm / sửa / xoá / xem
- ✅ Quản lý nội dung trang: giới thiệu, liên hệ, chính sách...
- ✅ Quản lý banner, logo, ảnh tĩnh
- ✅ Trình soạn thảo **TinyMCE** WYSIWYG + upload hình ảnh
- ✅ **Xác thực JWT** cho quản trị viên
- ✅ **Phân quyền người dùng** (Admin / Editor)
- ✅ **Đăng nhập, quản lý tài khoản**
- ✅ Gửi **email khi có người liên hệ**
- ✅ RESTful API dễ tích hợp frontend (SPA hoặc SSR)
- ✅ Triển khai nhanh trên **Vercel**

---

## 🛠️ Công nghệ sử dụng

- **Node.js** + **Express** + **TypeScript**
- **MongoDB** + **Mongoose**
- **TinyMCE Cloud**
- **JWT** + **bcrypt** (xác thực người dùng)
- **Nodemailer** (gửi email liên hệ)
- **Multer** (upload ảnh)
- **Cloudinary / Local Storage**
- **Vercel** (triển khai backend serverless)

---

## 🔐 Hệ thống người dùng

| Role      | Quyền |
|-----------|-------|
| **Admin** (`role === true`) | Quản trị tài khoản và các chức năng quản trị |
| **Tài khoản thường** (`role === false`) | Đăng bài và upload ảnh phục vụ soạn thảo sau khi đăng nhập |

---
## ⚙️ Cấu hình môi trường `.env`

### 🖥️ Cấu hình máy chủ
```env
SERVER_PORT=
```

### 🔒 JWT Token cho xác thực bảo mật
```env
JWT_SECRET_REFRESH=
JWT_SECRET_ACCESS=
```

### ☁️ Cấu hình Cloudinary để lưu trữ hình ảnh
```env
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_SECRET=
CLOUDINARY_API_KEY=
```

### 🛢️ Tài khoản MongoDB
```env
MONGO_USERNAME=
MONGO_PASSWORD=
```

### 📧 Thông tin email dùng để gửi liên hệ và thông báo
```env
EMAIL_API=
EMAIL_ADDRESS=
EMAIL_PASSWORD=
```

Đăng ký và reset OTP gửi qua Gmail SMTP bằng `EMAIL_ADDRESS` và `EMAIL_PASSWORD` (mật khẩu ứng dụng Google). `EMAIL_API` chỉ còn dùng cho endpoint liên hệ đang dùng SendGrid.

### OTP / API đăng ký và đặt lại mật khẩu

OTP được lưu dưới dạng digest trong MongoDB, sử dụng `JWT_SECRET_REFRESH` làm khóa HMAC và có hiệu lực 60 giây. Cấu hình hai JWT secret bằng giá trị riêng, mạnh và không dùng lại secret đã bị lộ.

Luồng `/register` và `/forgotpass` trả thêm `challengeId`; gửi `challengeId` cùng `otp` tới `/postregister` hoặc `/forgotpassword`. Frontend cần được cập nhật tương ứng trước khi triển khai thay đổi này.

## Kiểm thử

- `npm test`: chạy bộ hồi quy bảo mật và test đăng ký transactional (4A).
- `npm run test:registration`: chỉ chạy test đăng ký 4A.
- Khi không có `MONGODB_TEST_URI`, integration MongoDB thật được **skip**; test mock pass không xác nhận transaction hoặc unique index trên DB triển khai.
- Khi cấu hình `MONGODB_TEST_URI`, suite integration có thao tác ghi và tạo index trên database test `cms_registration_test`. Xem [hướng dẫn kiểm chứng 4A](tests/registration.README.md) trước khi chạy; không dùng DB production.

## Giới hạn cập nhật đồng thời và cleanup ảnh

Update Post/News hiện lọc theo `_id` và giá trị `avatar` đã đọc. Cơ chế này có thể phát hiện xung đột khi request khác thay thumbnail, nhưng **không phải kiểm soát phiên bản toàn bộ bài viết**. Nếu hai request chỉ sửa nội dung và giữ nguyên `avatar`, cả hai vẫn có thể trả thành công và lần ghi sau ghi đè lần trước. Chưa được coi mọi cập nhật đồng thời đều bị chặn bằng 409.

Cleanup vật lý và gỡ tham chiếu registry của update/delete Post/News vẫn đang hoãn do race giữa create và cleanup (3B). Ảnh và metadata dư có thể còn lại sau khi sửa/xóa bài. Không tái sử dụng `cleanupResourceImages()` cho các luồng này trước khi cơ chế phối hợp được sửa và kiểm chứng.
---
---

