# Hệ thống quản lý trung tâm đào tạo — bản mẫu Front-end

Bản dựng mẫu FE với dữ liệu mô phỏng. Trọng tâm là **conflict engine**: mọi thao tác thay đổi
dữ liệu đều đi qua một bộ luật duy nhất trước khi được ghi.

```bash
yarn dev      # chạy app
yarn test     # 77 test cho engine + xuất Excel + render trang
yarn build    # typecheck + build production
yarn lint
```

## Nguyên tắc kiến trúc chống xung đột

| # | Quyết định | Vì sao |
|---|---|---|
| 1 | `Session` là nguồn sự thật duy nhất của lịch | Mẫu lặp luôn được materialize thành buổi cụ thể trước khi kiểm tra — không bao giờ so 2 recurrence rule với nhau |
| 2 | Thời gian trong ngày là số nguyên phút (`startMin`/`endMin`), ngày là chuỗi `YYYY-MM-DD` | So sánh integer/chuỗi, không dính timezone, DST, serialize |
| 3 | Khoảng nửa mở `[start, end)` | 8:00–10:00 và 10:00–12:00 không trùng. Chỉ có **một** hàm `overlaps()` trong toàn hệ thống |
| 4 | Index theo `resource\|date` | Kiểm tra 1 buổi chỉ duyệt các buổi cùng phòng/GV cùng ngày |
| 5 | Mỗi luật là 1 pure function có `severity` | `error` chặn, `warning` cho qua sau xác nhận, `info` để hiển thị. Thêm luật = thêm 1 object |
| 6 | Một hàm `validate()` cho mọi tình huống | Kéo-thả, sinh lịch hàng loạt, đăng ký, xuất file — cùng một đường |
| 7 | `shared/domain` là TS thuần, không import React | Port nguyên si sang Back-end để dùng chung spec luật |

> Validate ở Front-end chỉ phục vụ UX. Nó **không** xử lý được race condition (2 người cùng đặt
> một phòng, cùng giành chỗ cuối của lớp). Chốt chặn cuối phải là transaction + unique constraint
> ở Back-end.

## Cấu trúc

```
src/
  shared/domain/          ← lõi, TS thuần, có test
    types.ts              14 bảng dữ liệu
    time.ts               overlaps() và các tiện ích thời gian
    scheduleIndex.ts      index theo resource|date
    generate.ts           mẫu lặp → danh sách buổi cụ thể
    suggest.ts            gợi ý khe trống / phòng / GV thay thế
    metrics.ts            metric registry (M01–M06)
    rules/
      engine.ts           validate() + isBlocked()
      schedule.ts         R01–R14
      enrollment.ts       E01–E13
      exportRules.ts      X01–X03
  shared/export/          xuất .xlsx tiếng Việt
  mocks/                  seed 14 bảng + cổng ghi dữ liệu (api.ts)
  features/               các màn hình
```

## Bộ luật

**Xếp lịch (R01–R14)** — trùng phòng, trùng GV, trùng lịch học viên, quá sức chứa, ngoài giờ mở
cửa, ngày lễ/bảo trì, GV nghỉ phép/ngoài giờ rảnh, sai chuyên môn, ngoài khoảng ngày lớp, thiếu
thiết bị, GV vượt tải tuần, thiếu giờ nghỉ giữa 2 buổi, sửa buổi đã dạy, lớp đã công bố bị đổi lịch.

**Đăng ký (E01–E13)** — lớp chưa mở, đăng ký trùng, trùng khoá, lớp đầy → hàng chờ, trùng lịch cá
nhân, thiếu khoá tiên quyết, sai tuổi/trình độ, học viên nợ phí/tạm dừng, vào lớp trễ, giữ chỗ chờ
học phí, chuyển lớp, rút lớp muộn, nhận hàng chờ.

**Xuất file (X01–X03)** — che PII theo vai trò, giới hạn số dòng, chặn kết quả rỗng.

**Thống kê (M01–M06)** — mỗi chỉ số khai báo một lần trong `METRICS`, kỳ nửa mở `[from, to)`,
buổi huỷ loại khỏi tử số, `pending`/`waitlisted` không tính sĩ số, mẫu số 0 trả `null` (hiện `—`),
mọi số click được để drill-down.

## Xuất Excel tiếng Việt

Xuất `.xlsx` thật bằng `exceljs`, không dùng CSV. Ba nguyên nhân "lỗi font" phổ biến đều được
tránh: (1) không xuất CSV thiếu BOM, (2) không xuất HTML đổi đuôi `.xls`, (3) chỉ dùng font
Unicode (Calibri), không dùng `.VnTime`/`VNI-Times`.

`src/shared/export/xlsx.test.ts` giải nén file vừa tạo và đọc lại `xl/sharedStrings.xml` để xác
minh chuỗi có dấu được lưu nguyên vẹn — không chỉ tin là đúng.

## Dữ liệu mô phỏng

14 bảng, sinh bằng PRNG có seed cố định nên mọi lần chạy ra cùng dữ liệu. Neo vào tuần hiện tại
để mở app là thấy lịch. Seed cố ý cài sẵn 2 xung đột để thấy engine làm việc ngay:
một buổi của L06 bị dời vào phòng P201 trùng giờ lớp L05, và một buổi của L04 rơi vào ngày GV03
nghỉ phép.

Đổi vai trò ở góc phải trên (Quản trị / Học vụ / Giáo viên / Học viên) để thấy luật X01 che dữ
liệu cá nhân.

## Chưa làm

- Điểm danh: đã có bảng `attendances` và chỉ số chuyên cần, chưa có màn hình nhập điểm danh.
- CRUD thêm/sửa cho giáo viên, học viên, phòng, khóa học (hiện chỉ xem + xuất).
- Back-end. Toàn bộ dữ liệu nằm trong bộ nhớ, tải lại trang là về seed gốc.
