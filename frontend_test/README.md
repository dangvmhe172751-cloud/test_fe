# Hệ thống quản lý trung tâm đào tạo — bản mẫu Front-end

Ứng dụng React + TypeScript chạy hoàn toàn với dữ liệu mô phỏng trong bộ nhớ (chưa có back-end).

## Yêu cầu

- Node.js `^20.19.0 || >=22.12.0` (theo `engines` của Vite 8)
- Yarn (repo có `yarn.lock`)

## Cài đặt

```bash
yarn install
```

## Chạy

```bash
yarn dev        # dev server (Vite), mở URL in ra ở terminal
yarn test       # chạy test (Vitest)
yarn test:watch # test ở chế độ watch
yarn build      # tsc -b + vite build → dist/
yarn preview    # xem thử bản build
yarn lint       # ESLint
```

## Kiến trúc

Ba lớp, phụ thuộc theo một chiều: `features/` → `mocks/` → `shared/domain/`.

- **`shared/domain/`** — lõi nghiệp vụ, TypeScript thuần, không import React nên có thể port sang back-end. Chứa `types.ts` (14 bảng dữ liệu), `time.ts` (giờ là số nguyên phút, khoảng nửa mở `[start, end)`, một hàm `overlaps()` duy nhất), `scheduleIndex.ts` (index theo `resource|date`), `generate.ts` (mẫu lặp → buổi cụ thể), `suggest.ts`, `metrics.ts` và `rules/` — mỗi luật là một pure function có `severity`, gom vào một hàm `validate()`.
- **`mocks/`** — `seed.ts` sinh dữ liệu bằng PRNG có seed cố định; `store.ts` (Zustand) đóng vai "database" với `apply()` là đường ghi duy nhất; `api.ts` là cổng ghi: validate trước, chặn khi có `error`, cho qua `warning` sau xác nhận.
- **`features/`** — các màn hình (dashboard, thời khoá biểu, lớp, đăng ký, danh mục) dựng bằng Ant Design + Recharts, định tuyến trong `app/router.tsx`. Xuất `.xlsx` tiếng Việt qua `exceljs` ở `shared/export/`.

Tải lại trang là dữ liệu về seed gốc. Chi tiết bộ luật (R01–R14, E01–E13, X01–X03, M01–M06): xem [ARCHITECTURE.md](ARCHITECTURE.md).
