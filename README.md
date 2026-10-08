# Kho Sách Nói

Thư viện sách nói tiếng Việt — tóm tắt & diễn giải những cuốn sách hay nhất về động lực, kinh doanh và kỹ năng. Mỗi chương chỉ vài phút, nghe vừa đủ một chuyến xe.

Phong cách thiết kế: **dark glass premium** (nền #07090f, card kính mờ, accent vàng gold #e8b34b).

- Trang chủ: https://hieppro.vercel.app (deploy từ repo này qua Vercel)
- Web tĩnh 100%, không cần build step.

## Cấu trúc thư mục

```
hieppro-audiobook/
├── index.html            # khung trang (nav, hero, lưới sách, chi tiết, trình phát)
├── styles.css            # dark glass premium, mobile-first
├── app.js                # render từ data/books.json + trình phát sticky
├── data/
│   ├── books.json        # metadata các sách đã có audio (đang phục vụ)
│   └── books-new.json    # metadata sách chờ audio (để merge vào books.json sau)
├── audio/
│   ├── nghi-giau-lam-giau/chuong-N-*.mp3
│   └── cha-giau-cha-ngheo/chuong-N-*.mp3
├── content/              # kịch bản .txt của từng chương (tham khảo)
├── assets/
│   └── covers/<slug>.jpg # bìa sách vuông 1600×1600, không chữ
└── vercel.json
```

## Cách thêm sách mới

1. Tạo thư mục `audio/<slug>/`, bỏ các file mp3 vào (đặt tên `chuong-1-....mp3`, `chuong-2-....mp3`, …).
2. (Khuyên dùng) Tạo bìa vuông tối thiểu 800×800 tại `assets/covers/<slug>.jpg` — phong cách dark, **không vẽ chữ** (tiêu đề overlay bằng HTML).
3. Thêm 1 entry vào `data/books.json` theo schema:

```json
{
  "slug": "ten-sach",
  "title": "Tên Sách",
  "author": "Tác giả",
  "category": "Động lực | Kinh doanh | Kỹ năng",
  "cover": "assets/covers/ten-sach.jpg",
  "description": "Mô tả ngắn 1–2 câu.",
  "source": "Tên sách gốc – Tác giả",
  "chapters": [
    { "n": 1, "title": "Tên chương", "file": "audio/ten-sach/chuong-1-....mp3", "duration_secs": 150 }
  ]
}
```

`duration_secs` (mp3 64kbps CBR) = `kích thước file (byte) × 8 / 64000`, làm tròn.

4. Commit + push — Vercel tự deploy.

## Chạy thử local

```bash
cd hieppro-audiobook
python3 -m http.server 8080
# mở http://localhost:8080
```

(Lưu ý: mở file trực tiếp bằng `file://` sẽ khiến `fetch('data/books.json')` bị chặn bởi CORS — bắt buộc chạy qua http server.)

## Tính năng trình phát

- Sticky dưới cùng, nút lớn dễ bấm khi lái xe: phát/tạm dừng, chương trước/tiếp, ±15 giây, thanh tiến trình kéo được
- Tốc độ 0.75x–2x, hẹn giờ tắt 15/30/60 phút
- Tự chuyển chương tiếp theo khi hết chương
- Lưu vị trí nghe (localStorage) → nút "Nghe tiếp" trên thanh nav
- Hỗ trợ MediaSession: điều khiển từ màn hình khóa / bluetooth xe hơi
