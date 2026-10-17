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
---
---

