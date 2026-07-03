const SS = SpreadsheetApp.getActiveSpreadsheet();

const SHEET_SV = "SinhVien";
const SHEET_LICH = "LichHoc";
const SHEET_DOT1 = "DotHoc1";
const SHEET_DOT2 = "DotHoc2";
const SHEET_LOG = "Log";

const TIMEZONE = "Asia/Ho_Chi_Minh";
const ABSENCE_LIMIT = 2; // Vang >= 2 => Cam thi

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  const p = e.parameter || {};
  const action = p.action;

  try {
    if (action === "get_student") {
      return json(getStudent(p.mssv));
    }

    if (action === "check_rfid") {
      return json(checkRFID(p.uid, p.dot, p.buoi));
    }

    if (action === "check_finger") {
      return json(checkFinger(p.fid, p.dot, p.buoi));
    }

    if (action === "add_rfid") {
      return json(addRFID(p.mssv, p.uid));
    }

    if (action === "add_finger") {
      return json(addFinger(p.mssv, p.fid));
    }

    if (action === "delete_rfid") {
      return json(clearStudentRFID(p.mssv));
    }

    if (action === "delete_finger") {
      return json(clearStudentFinger(p.mssv));
    }

    if (action === "clear_credentials") {
     return json(clearStudentCredentials(p.mssv));
    }

    if (action === "get_current_session") {
      return json(getCurrentSession(p.dot));
    }

    if (action === "open_session") {
      return json(openSession(p.dot, p.buoi));
    }

    if (action === "open_next_session") {
      return json(openNextSession(p.dot));
    }

    if (action === "close_current_session") {
      return json(closeCurrentSession(p.dot));
    }

    if (action === "set_makeup_session") {
      return json(setMakeupSession(
        p.dot,
        p.buoi,
        p.ngay,
        p.giobd,
        p.giokt,
        p.ghichu
      ));
    }

    if (action === "manual_attendance") {
      return json(manualAttendance(p.mssv, p.dot, p.buoi, p.ghichu));
    }

    return json({
      ok: false,
      message: "Action khong hop le"
    });
  } catch (err) {
    return json({
      ok: false,
      message: err.toString()
    });
  }
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet(name) {
  const sh = SS.getSheetByName(name);
  if (!sh) throw new Error("Khong tim thay sheet: " + name);
  return sh;
}

function findRowByValue(sheet, col, value) {
  const last = sheet.getLastRow();
  if (last < 2) return -1;

  const data = sheet.getRange(2, col, last - 1, 1).getValues();
  value = String(value || "").trim();

  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === value) {
      return i + 2;
    }
  }

  return -1;
}

// ================= SINH VIEN =================

function getStudent(mssv) {
  const sv = getSheet(SHEET_SV);
  const row = findRowByValue(sv, 1, mssv);

  if (row === -1) {
    return {
      ok: false,
      message: "Khong tim thay MSSV"
    };
  }

  return {
    ok: true,
    mssv: sv.getRange(row, 1).getValue(),
    hoten: sv.getRange(row, 2).getValue(),
    lop: sv.getRange(row, 3).getValue(),
    uid: sv.getRange(row, 4).getValue(),
    fid: sv.getRange(row, 5).getValue(),
    ghichu: sv.getRange(row, 6).getValue()
  };
}

function getStudentNameByMSSV(mssv) {
  const sv = getSheet(SHEET_SV);
  const row = findRowByValue(sv, 1, mssv);

  if (row === -1) {
    return "";
  }

  return String(sv.getRange(row, 2).getValue() || "").trim();
}

function addRFID(mssv, uid) {
  const sv = getSheet(SHEET_SV);

  mssv = String(mssv || "").trim();
  uid = normalizeUID(uid);

  if (mssv === "" || uid === "") {
    return {
      ok: false,
      message: "Thieu MSSV hoac UID"
    };
  }

  const row = findRowByValue(sv, 1, mssv);

  if (row === -1) {
    return {
      ok: false,
      message: "MSSV khong ton tai trong SinhVien"
    };
  }

  const duplicateRow = findRowByValue(sv, 4, uid);

  if (duplicateRow !== -1 && duplicateRow !== row) {
    return {
      ok: false,
      message: "RFID da gan cho MSSV khac"
    };
  }

  sv.getRange(row, 4).setValue(uid);

  return {
    ok: true,
    mssv: mssv,
    uid: uid,
    message: "Da gan RFID cho MSSV"
  };
}

function addFinger(mssv, fid) {
  const sv = getSheet(SHEET_SV);

  mssv = String(mssv || "").trim();
  fid = String(fid || "").trim();

  if (mssv === "" || fid === "") {
    return {
      ok: false,
      message: "Thieu MSSV hoac ID van tay"
    };
  }

  const row = findRowByValue(sv, 1, mssv);

  if (row === -1) {
    return {
      ok: false,
      message: "MSSV khong ton tai trong SinhVien"
    };
  }

  const duplicateRow = findRowByValue(sv, 5, fid);

  if (duplicateRow !== -1 && duplicateRow !== row) {
    return {
      ok: false,
      message: "ID van tay da gan cho MSSV khac"
    };
  }

  sv.getRange(row, 5).setValue(fid);

  return {
    ok: true,
    mssv: mssv,
    fid: fid,
    message: "Da gan van tay cho MSSV"
  };
}

function clearStudentRFID(mssv) {
  const sv = getSheet(SHEET_SV);
  const row = findRowByValue(sv, 1, mssv);

  if (row === -1) {
    return {
      ok: false,
      message: "Khong tim thay MSSV"
    };
  }

  const uid = sv.getRange(row, 4).getValue();
  sv.getRange(row, 4).clearContent();

  return {
    ok: true,
    mssv: mssv,
    uid: uid,
    message: "Da xoa RFID, giu MSSV va van tay"
  };
}

function clearStudentFinger(mssv) {
  const sv = getSheet(SHEET_SV);
  const row = findRowByValue(sv, 1, mssv);

  if (row === -1) {
    return {
      ok: false,
      message: "Khong tim thay MSSV"
    };
  }

  const fid = sv.getRange(row, 5).getValue();
  sv.getRange(row, 5).clearContent();

  return {
    ok: true,
    mssv: mssv,
    fid: fid,
    message: "Da xoa van tay, giu MSSV va RFID"
  };
}

function clearStudentCredentials(mssv) {
  const sv = getSheet(SHEET_SV);
  const row = findRowByValue(sv, 1, mssv);

  if (row === -1) {
    return {
      ok: false,
      message: "Khong tim thay MSSV"
    };
  }

  const uid = sv.getRange(row, 4).getValue();
  const fid = sv.getRange(row, 5).getValue();

  sv.getRange(row, 4).clearContent();
  sv.getRange(row, 5).clearContent();

  return {
    ok: true,
    mssv: mssv,
    uid: uid,
    fid: fid,
    message: "Da xoa RFID va van tay, giu MSSV"
  };
}

// ================= LICHHOC =================

function normalizeStatus(value) {
  const s = String(value || "").trim().toUpperCase();

  if (s === "OPEN") return "OPEN";
  if (s === "READY") return "READY";
  if (s === "CLOSED" || s === "CLOSE") return "CLOSED";
  if (s === "NGHI" || s === "NGHỈ") return "NGHI";
  if (s === "MANUAL") return "OPEN";

  return "PENDING";
}

function parseDateOnly(value) {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const s = String(value || "").trim();
  if (s === "") return null;

  if (s.indexOf("/") >= 0) {
    const parts = s.split("/");
    const day = Number(parts[0]);
    const month = Number(parts[1]);
    const year = Number(parts[2]);
    return new Date(year, month - 1, day);
  }

  if (s.indexOf("-") >= 0) {
    const parts = s.split("-");
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    return new Date(year, month - 1, day);
  }

  return null;
}

function parseTimeHM(value) {
  if (value instanceof Date) {
    return {
      h: value.getHours(),
      m: value.getMinutes()
    };
  }

  if (typeof value === "number") {
    const totalMinutes = Math.round(value * 24 * 60);
    return {
      h: Math.floor(totalMinutes / 60),
      m: totalMinutes % 60
    };
  }

  const s = String(value || "").trim();
  if (s === "") return null;

  const parts = s.split(":");

  return {
    h: Number(parts[0]),
    m: Number(parts[1] || 0)
  };
}

function buildDateTime(dateValue, timeValue) {
  const d = parseDateOnly(dateValue);
  const t = parseTimeHM(timeValue);

  if (!d || !t) return null;

  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    t.h,
    t.m,
    0
  );
}

function getLichHocData() {
  const sh = getSheet(SHEET_LICH);
  const last = sh.getLastRow();

  if (last < 2) {
    return {
      sheet: sh,
      values: []
    };
  }

  return {
    sheet: sh,
    values: sh.getRange(2, 1, last - 1, 11).getValues()
  };
}

function findLichRow(dot, buoi) {
  const lich = getLichHocData();
  const values = lich.values;

  dot = String(dot || "").trim();
  buoi = Number(buoi);

  let fallback = null;

  for (let i = 0; i < values.length; i++) {
    const rowDot = String(values[i][0]).trim();
    const rowBuoi = Number(values[i][1]);
    const status = normalizeStatus(values[i][7]);
    const loaiBuoi = String(values[i][8] || "").trim().toUpperCase();

    if (rowDot === dot && rowBuoi === buoi) {
      const item = {
        sheet: lich.sheet,
        rowIndex: i + 2,
        data: values[i]
      };

      // Ưu tiên dòng học thật / học bù còn dùng được
      if (status !== "NGHI" && loaiBuoi !== "NGHI") {
        return item;
      }

      // Nếu chỉ còn dòng NGHI thì giữ lại để báo lỗi phù hợp
      if (!fallback) {
        fallback = item;
      }
    }
  }

  return fallback;
}

function getOpenSession(dot) {
  const lich = getLichHocData();
  const values = lich.values;

  dot = String(dot || "").trim();

  for (let i = 0; i < values.length; i++) {
    const rowDot = String(values[i][0]).trim();
    const status = normalizeStatus(values[i][7]);

    if ((dot === "" || rowDot === dot) && status === "OPEN") {
      return {
        ok: true,
        dot: rowDot,
        buoi: Number(values[i][1]),
        rowIndex: i + 2,
        message: "Buoi hoc dang mo"
      };
    }
  }

  return null;
}

function hasOpenSession(dot) {
  return getOpenSession(dot) !== null;
}

function autoUpdateSessions(dotFilter) {
  const lich = getLichHocData();
  const sh = lich.sheet;
  const values = lich.values;
  const now = new Date();

  const dotsNeedRebuild = {};

  dotFilter = String(dotFilter || "").trim();

  // Tu dong dong buoi da het gio
  for (let i = 0; i < values.length; i++) {
    const row = values[i];

    const dot = String(row[0]).trim();
    const buoi = Number(row[1]);
    const endTime = buildDateTime(row[3], row[5]);
    const status = normalizeStatus(row[7]);

    if (dotFilter !== "" && dot !== dotFilter) continue;

    if (status === "OPEN" && endTime && now > endTime) {
      sh.getRange(i + 2, 8).setValue("CLOSED");

      if (String(row[9] || "").trim() === "") {
        sh.getRange(i + 2, 10).setValue(formatDateOnly(now));
      }

      dotsNeedRebuild[dot] = true;
    }
  }

  // Tu dong mo buoi PENDING neu den gio
  const refreshed = getLichHocData().values;

  for (let i = 0; i < refreshed.length; i++) {
    const row = refreshed[i];

    const dot = String(row[0]).trim();
    const buoi = Number(row[1]);
    const status = normalizeStatus(row[7]);

    if (dotFilter !== "" && dot !== dotFilter) continue;

    // Buoi 1 admin tu mo thu cong
    if (buoi === 1) continue;

    if (status !== "READY") continue;
    if (hasOpenSession(dot)) continue;

    const startTime = buildDateTime(row[3], row[4]);
    const endTime = buildDateTime(row[3], row[5]);
    const earlyMin = Number(row[6] || 45);

    if (!startTime || !endTime) continue;

    const allowStart = new Date(startTime.getTime() - earlyMin * 60 * 1000);

    if (now >= allowStart && now <= endTime) {
      sh.getRange(i + 2, 8).setValue("OPEN");

      if (String(row[9] || "").trim() === "") {
        sh.getRange(i + 2, 10).setValue(formatDateOnly(now));
      }

      return {
        ok: true,
        dot: dot,
        buoi: buoi,
        message: "Tu dong mo buoi hoc"
      };
    }
  }

  for (const dot in dotsNeedRebuild) {
    rebuildDotSummary(dot);
    prepareNextSession(dot);
  }

  return {
    ok: true,
    message: "Da cap nhat lich hoc"
  };
}

function getCurrentSession(dot) {
  autoUpdateSessions(dot);

  const open = getOpenSession(dot);

  if (!open) {
    return {
      ok: false,
      message: "Chua co buoi hoc dang mo"
    };
  }

  return open;
}

function openSession(dot, buoi) {
  dot = String(dot || "").trim();
  buoi = Number(buoi);

  if (dot === "" || !buoi) {
    return {
      ok: false,
      message: "Thieu DotHoc hoac Buoi"
    };
  }

  if (hasOpenSession(dot)) {
    return {
      ok: false,
      message: "Dang co buoi hoc OPEN"
    };
  }

  const found = findLichRow(dot, buoi);

  if (!found) {
    return {
      ok: false,
      message: "Khong tim thay buoi trong LichHoc"
    };
  }

  const status = normalizeStatus(found.data[7]);

  if (status === "CLOSED") {
    return {
      ok: false,
      message: "Buoi da dong"
    };
  }

  if (status === "NGHI") {
    return {
      ok: false,
      message: "Buoi nghi, khong the mo"
    };
  }

  found.sheet.getRange(found.rowIndex, 8).setValue("OPEN");

  if (String(found.data[9] || "").trim() === "") {
    found.sheet.getRange(found.rowIndex, 10).setValue(formatDateOnly(new Date()));
  }

  return {
    ok: true,
    dot: dot,
    buoi: buoi,
    message: "Da mo buoi hoc"
  };
}

function openNextSession(dot) {
  dot = String(dot || "").trim();

  if (dot === "") {
    return {
      ok: false,
      message: "Thieu DotHoc"
    };
  }

  autoUpdateSessions(dot);

  if (hasOpenSession(dot)) {
    return {
      ok: false,
      message: "Dang co buoi hoc OPEN"
    };
  }

  const lich = getLichHocData();
  const values = lich.values;
  const now = new Date();

  // Neu da co buoi READY, kiem tra xem da den gio de mo chua
  for (let i = 0; i < values.length; i++) {
    const row = values[i];

    const rowDot = String(row[0]).trim();
    const buoi = Number(row[1]);
    const status = normalizeStatus(row[7]);

    if (rowDot !== dot) continue;
    if (status !== "READY") continue;

    const startTime = buildDateTime(row[3], row[4]);
    const endTime = buildDateTime(row[3], row[5]);
    const earlyMin = Number(row[6] || 45);

    if (!startTime || !endTime) {
      return {
        ok: false,
        message: "Buoi READY chua co ngay/gio hoc"
      };
    }

    const allowStart = new Date(startTime.getTime() - earlyMin * 60 * 1000);

    if (now < allowStart) {
      return {
        ok: false,
        dot: rowDot,
        buoi: buoi,
        message: "Chua den gio mo buoi " + buoi
      };
    }

    if (now > endTime) {
      return {
        ok: false,
        dot: rowDot,
        buoi: buoi,
        message: "Buoi " + buoi + " da qua gio"
      };
    }

    return openSession(dot, buoi);
  }

  // Neu chua co READY thi chuan bi buoi PENDING dau tien
  return prepareNextSession(dot);
}
function closeCurrentSession(dot) {
  dot = String(dot || "").trim();

  const open = getOpenSession(dot);

  if (!open) {
    return {
      ok: false,
      message: "Khong co buoi OPEN"
    };
  }

  const lich = getSheet(SHEET_LICH);
  lich.getRange(open.rowIndex, 8).setValue("CLOSED");
  lich.getRange(open.rowIndex, 10).setValue(formatDateOnly(new Date()));

  rebuildDotSummary(open.dot);

  // Sau khi dong buoi hien tai, tu dong chuan bi buoi tiep theo
  const next = prepareNextSession(open.dot);

  return {
    ok: true,
    dot: open.dot,
    buoi: open.buoi,
    nextBuoi: next.ok ? next.buoi : "",
    message: next.ok
      ? "Da dong buoi, chuan bi buoi " + next.buoi
      : "Da dong buoi hoc"
  };
}
function setMakeupSession(dot, buoi, ngay, giobd, giokt, ghichu) {
  dot = String(dot || "").trim();
  buoi = Number(buoi);

  if (dot === "" || !buoi) {
    return {
      ok: false,
      message: "Thieu DotHoc hoac Buoi"
    };
  }

  ngay = String(ngay || "").trim();
  giobd = String(giobd || "").trim();
  giokt = String(giokt || "").trim();

  if (ngay === "" || giobd === "" || giokt === "") {
    return {
      ok: false,
      message: "Thieu ngay/gio hoc bu"
    };
  }

  const lich = getLichHocData();
  const sh = lich.sheet;
  const values = lich.values;

  let originalIndex = -1;
  let originalRow = null;

  // Tìm dòng gốc của buổi cần bù.
  // Ưu tiên dòng không phải BU để đánh dấu NGHI.
  for (let i = 0; i < values.length; i++) {
    const rowDot = String(values[i][0]).trim();
    const rowBuoi = Number(values[i][1]);
    const loaiBuoi = String(values[i][8] || "").trim().toUpperCase();

    if (rowDot === dot && rowBuoi === buoi && loaiBuoi !== "BU") {
      originalIndex = i + 2;
      originalRow = values[i];
      break;
    }
  }

  if (originalIndex === -1) {
    return {
      ok: false,
      message: "Khong tim thay buoi goc de hoc bu"
    };
  }

  const ngayGoc = originalRow[3];
  const tuan = originalRow[2];
  const choPhepSom = originalRow[6] || 45;

  // Dòng gốc chuyển thành NGHI, không tính vắng
  sh.getRange(originalIndex, 8).setValue("NGHI");
  sh.getRange(originalIndex, 9).setValue("NGHI");
  sh.getRange(originalIndex, 11).setValue(
    "Nghi, hoc bu ngay " + ngay
  );

  // Thêm dòng mới cho buổi học bù
  sh.appendRow([
    dot,                         // DotHoc
    buoi,                        // Buoi
    tuan,                        // Tuan
    ngay,                        // NgayHoc
    giobd,                       // GioBatDau
    giokt,                       // GioKetThuc
    choPhepSom,                  // ChoPhepSomPhut
    "READY",                   // TrangThai
    "BU",                        // LoaiBuoi
    "",                          // NgayThucTe
    ghichu || ("Hoc bu buoi " + buoi + ", ngay goc " + formatDateOnly(parseDateOnly(ngayGoc)))
  ]);

  return {
    ok: true,
    dot: dot,
    buoi: buoi,
    message: "Da them lich hoc bu buoi " + buoi
  };
}

// ================= DIEM DANH =================

function checkRFID(uid, dot, buoi) {
  const sv = getSheet(SHEET_SV);

  uid = normalizeUID(uid);

  const row = findRowByValue(sv, 4, uid);

  if (row === -1) {
    return {
      ok: false,
      message: "The chua dang ky"
    };
  }

  const mssv = sv.getRange(row, 1).getValue();

  return diemDanh(mssv, dot, buoi, "RFID", "");
}

function checkFinger(fid, dot, buoi) {
  const sv = getSheet(SHEET_SV);
  const row = findRowByValue(sv, 5, fid);

  if (row === -1) {
    return {
      ok: false,
      message: "Van tay chua dang ky"
    };
  }

  const mssv = sv.getRange(row, 1).getValue();

  return diemDanh(mssv, dot, buoi, "VAN_TAY", "");
}

function resolveAttendanceSession(dot, buoi) {
  autoUpdateSessions(dot);

  const open = getOpenSession(dot);

  if (open) {
    return open;
  }

  dot = String(dot || "").trim();
  buoi = Number(buoi);

  if (dot !== "" && buoi) {
    const found = findLichRow(dot, buoi);

    if (!found) {
      return {
        ok: false,
        message: "Buoi hoc chua cau hinh trong LichHoc"
      };
    }

    const status = normalizeStatus(found.data[7]);

    if (status === "CLOSED") {
      return {
        ok: false,
        message: "Buoi da dong"
      };
    }

    if (status === "NGHI") {
      return {
        ok: false,
        message: "Buoi nghi"
      };
    }

    if (status === "READY") {
      return {
        ok: false,
        message: "Chua den gio hoc"
      };
    }

    return {
      ok: false,
      message: "Chua mo buoi hoc"
    };
  }

  return {
    ok: false,
    message: "Chua co buoi hoc dang mo"
  };
}
function diemDanh(mssv, dot, buoi, hinhThuc, ghiChu) {
  const hoten = getStudentNameByMSSV(mssv);
  const session = resolveAttendanceSession(dot, buoi);

  if (!session.ok) {
    return {
      ok: false,
      mssv: mssv,
      hoten: hoten,
      message: session.message
    };
  }
  dot = session.dot;
  buoi = Number(session.buoi);

  if (daDiemDanh(mssv, dot, buoi)) {
    return {
      ok: false,
      duplicate: true,
      mssv: mssv,
      hoten: hoten,
      dot: dot,
      buoi: buoi,
      message: "Da diem danh"
    };
  }
  const logSheet = getSheet(SHEET_LOG);
  const now = new Date();

  logSheet.appendRow([
    now,
    mssv,
    dot,
    buoi,
    hinhThuc,
    ghiChu || ""
  ]);

  rebuildDotSummary(dot);

  return {
    ok: true,
    mssv: mssv,
    hoten: hoten,
    dot: dot,
    buoi: buoi,
    method: hinhThuc,
    message: "Diem danh thanh cong"
  };
}
function manualAttendance(mssv, dot, buoi, ghiChu) {
  mssv = String(mssv || "").trim();

  if (getStudent(mssv).ok !== true) {
    return {
      ok: false,
      message: "MSSV khong ton tai"
    };
  }

  return diemDanh(
    mssv,
    dot,
    buoi,
    "ADMIN",
    ghiChu || "Them diem danh thu cong"
  );
}

function daDiemDanh(mssv, dot, buoi) {
  const logSheet = getSheet(SHEET_LOG);
  const last = logSheet.getLastRow();

  if (last < 2) return false;

  const data = logSheet.getRange(2, 1, last - 1, 6).getValues();

  for (let i = 0; i < data.length; i++) {
    const rowMSSV = String(data[i][1]).trim();
    const rowDot = String(data[i][2]).trim();
    const rowBuoi = Number(data[i][3]);

    if (
      rowMSSV === String(mssv).trim() &&
      rowDot === String(dot).trim() &&
      rowBuoi === Number(buoi)
    ) {
      return true;
    }
  }

  return false;
}

// ================= TONG HOP DOT HOC =================

function rebuildDotSummary(dot) {
  const summarySheet = getSheet(dot);
  const sv = getSheet(SHEET_SV);
  const logSheet = getSheet(SHEET_LOG);

  const svLast = sv.getLastRow();
  if (svLast < 2) return;

  const students = sv.getRange(2, 1, svLast - 1, 3).getValues();

  const closedBuoiList = getClosedBuoiList(dot);
  const closedCount = closedBuoiList.length;

  const logMap = getLogMap(dot);

  const output = [];

  for (let i = 0; i < students.length; i++) {
    const mssv = String(students[i][0]).trim();
    if (mssv === "") continue;

    const logs = logMap[mssv] || [];
    const presentSet = {};

    for (let j = 0; j < logs.length; j++) {
      presentSet[Number(logs[j].buoi)] = true;
    }

    const presentCount = Object.keys(presentSet).length;

    const absentList = [];

    for (let k = 0; k < closedBuoiList.length; k++) {
      const b = Number(closedBuoiList[k].buoi);

      if (!presentSet[b]) {
        absentList.push(closedBuoiList[k]);
      }
    }

    const absentCount = absentList.length;
    const percent = closedCount > 0 ? (absentCount / closedCount) * 100 : 0;
    const status = absentCount >= ABSENCE_LIMIT ? "Cam thi" : "";

    const ghiChu = absentList.map(item => {
      return "Vang buoi " + item.buoi + " (" + item.ngay + ")";
    }).join("; ");

    const history = logs.map(item => {
      return "Buoi" + item.buoi + ": " + item.time + " - " + item.method;
    }).join("; ");

    output.push([
      mssv,
      presentCount,
      absentCount,
      percent,
      status,
      ghiChu,
      history
    ]);
  }

  const last = summarySheet.getLastRow();

  if (last >= 2) {
    summarySheet.getRange(2, 1, last - 1, 7).clearContent();
  }

  if (output.length > 0) {
    summarySheet.getRange(2, 1, output.length, 7).setValues(output);
  }
}

function getClosedBuoiList(dot) {
  const lich = getLichHocData().values;
  const result = [];

  for (let i = 0; i < lich.length; i++) {
    const rowDot = String(lich[i][0]).trim();
    const buoi = Number(lich[i][1]);
    const ngay = lich[i][3];
    const status = normalizeStatus(lich[i][7]);

    if (rowDot === dot && status === "CLOSED") {
      result.push({
        buoi: buoi,
        ngay: formatDateOnly(parseDateOnly(ngay))
      });
    }
  }

  result.sort((a, b) => a.buoi - b.buoi);

  return result;
}

function getLogMap(dot) {
  const logSheet = getSheet(SHEET_LOG);
  const last = logSheet.getLastRow();
  const map = {};

  if (last < 2) return map;

  const data = logSheet.getRange(2, 1, last - 1, 6).getValues();

  for (let i = 0; i < data.length; i++) {
    const time = data[i][0];
    const mssv = String(data[i][1]).trim();
    const rowDot = String(data[i][2]).trim();
    const buoi = Number(data[i][3]);
    const method = String(data[i][4]).trim();

    if (rowDot !== dot) continue;

    if (!map[mssv]) {
      map[mssv] = [];
    }

    map[mssv].push({
      time: formatTime(time),
      buoi: buoi,
      method: method
    });
  }

  for (const mssv in map) {
    map[mssv].sort((a, b) => a.buoi - b.buoi);
  }

  return map;
}

// ================= FORMAT =================

function formatTime(date) {
  return Utilities.formatDate(
    new Date(date),
    TIMEZONE,
    "yyyy-MM-dd HH:mm:ss"
  );
}

function formatDateOnly(date) {
  if (!date) return "";

  return Utilities.formatDate(
    new Date(date),
    TIMEZONE,
    "dd/MM/yyyy"
  );
}
function prepareNextSession(dot) {
  dot = String(dot || "").trim();

  const lich = getLichHocData();
  const sh = lich.sheet;
  const values = lich.values;

  // Neu da co buoi READY thi giu nguyen, khong tao READY moi
  for (let i = 0; i < values.length; i++) {
    const rowDot = String(values[i][0]).trim();
    const buoi = Number(values[i][1]);
    const status = normalizeStatus(values[i][7]);

    if (rowDot === dot && status === "READY") {
      return {
        ok: true,
        dot: dot,
        buoi: buoi,
        message: "Da co buoi READY"
      };
    }
  }

  // Neu chua co READY thi chuan bi buoi PENDING dau tien
  for (let i = 0; i < values.length; i++) {
    const rowDot = String(values[i][0]).trim();
    const buoi = Number(values[i][1]);
    const status = normalizeStatus(values[i][7]);

    if (rowDot === dot && status === "PENDING") {
      sh.getRange(i + 2, 8).setValue("READY");

      return {
        ok: true,
        dot: dot,
        buoi: buoi,
        message: "Da chuan bi buoi tiep theo"
      };
    }
  }

  return {
    ok: false,
    message: "Khong con buoi PENDING"
  };
}

// ================= IMPORT DANH SACH SINH VIEN =================
// Chức năng:
// 1. Tạo menu "Đồ án điểm danh"
// 2. Tự nhận dạng sheet import
// 3. Nhận dạng MSSV + HoTen hoặc MSSV + Họ lót + Tên
// 4. Nếu không có lớp thì để trống
// 5. Không xóa dữ liệu SinhVien cũ
// 6. Chỉ thêm sinh viên mới xuống phía dưới
// 7. Tạo dòng ngăn cách giữa các lần import
// 8. Tự định dạng Times New Roman, cỡ 13

const IMPORT_IGNORE_SHEETS = [
  "SinhVien",
  "LichHoc",
  "Log",
  "DotHoc1",
  "DotHoc2"
];

const IMPORT_SV_HEADERS = [
  "MSSV",
  "HoTen",
  "Lop",
  "UID_RFID",
  "ID_VanTay",
  "GhiChu"
];

const IMPORT_FONT = "Times New Roman";
const IMPORT_FONT_SIZE = 13;
const IMPORT_TRIGGER_FUNCTION = "autoImportOnChange";

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Đồ án điểm danh")
    .addItem("Chuẩn hóa sheet đang mở", "importActiveSheetToSinhVien")
    .addItem("Tự tìm sheet và chuẩn hóa", "autoFindAndImportSinhVien")
    .addSeparator()
    .addItem("Bật tự động sau khi import file", "installAutoImportTrigger")
    .addItem("Tắt tự động sau khi import file", "removeAutoImportTrigger")
    .addToUi();
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeUID(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-F0-9]/g, "");
}

function findColumnIndex(headers, aliases) {
  const normHeaders = headers.map(h => normalizeText(h));
  const normAliases = aliases.map(a => normalizeText(a));

  // Khớp chính xác trước
  for (let i = 0; i < normHeaders.length; i++) {
    if (normAliases.includes(normHeaders[i])) {
      return i;
    }
  }

  // Khớp gần đúng theo hướng header chứa alias.
  // Không dùng alias.includes(header) để tránh nhầm cột "Tên" thành "Họ tên" hoặc "Tên lớp".
  for (let i = 0; i < normHeaders.length; i++) {
    for (const alias of normAliases) {
      if (alias.length >= 4 && normHeaders[i].includes(alias)) {
        return i;
      }
    }
  }

  return -1;
}

function getMSSVAliases() {
  return [
    "MSSV",
    "MaSV",
    "Ma SV",
    "Mã SV",
    "Ma sinh vien",
    "Mã sinh viên",
    "Ma so sinh vien",
    "Mã số sinh viên",
    "So hieu sinh vien",
    "Số hiệu sinh viên",
    "Student ID",
    "StudentID",
    "Student Code",
    "StudentCode"
  ];
}

function getHoTenAliases() {
  return [
    "HoTen",
    "Ho Ten",
    "Họ tên",
    "Ho va ten",
    "Họ và tên",
    "Ten sinh vien",
    "Tên sinh viên",
    "Ho ten sinh vien",
    "Họ tên sinh viên",
    "Full name",
    "Fullname",
    "Student name",
    "StudentName"
  ];
}

function getHoLotAliases() {
  return [
    "Ho lot",
    "Họ lót",
    "Ho dem",
    "Họ đệm",
    "Ho va ten dem",
    "Họ và tên đệm",
    "Last name",
    "Lastname",
    "Middle name",
    "Middlename"
  ];
}

function getTenAliases() {
  return [
    "Ten",
    "Tên",
    "First name",
    "Firstname",
    "Given name",
    "Givenname"
  ];
}

function getLopAliases() {
  return [
    "Lop",
    "Lớp",
    "Lop hoc",
    "Lớp học",
    "Ma lop",
    "Mã lớp",
    "Ten lop",
    "Tên lớp",
    "Class",
    "Class name",
    "ClassName"
  ];
}

function getRFIDAliases() {
  return [
    "UID_RFID",
    "UID RFID",
    "UIDRFID",
    "UID",
    "RFID",
    "Ma RFID",
    "Mã RFID",
    "Ma the",
    "Mã thẻ",
    "Ma the RFID",
    "Mã thẻ RFID",
    "RFID UID",
    "Card UID",
    "CardID",
    "Card ID",
    "Ma so the",
    "Mã số thẻ"
  ];
}

function findHeaderRowIndex(data) {
  for (let r = 0; r < Math.min(data.length, 20); r++) {
    const headers = data[r];

    const colMSSV = findColumnIndex(headers, getMSSVAliases());
    const colHoTen = findColumnIndex(headers, getHoTenAliases());
    const colHoLot = findColumnIndex(headers, getHoLotAliases());
    const colTen = findColumnIndex(headers, getTenAliases());

    if (
      colMSSV !== -1 &&
      (
        colHoTen !== -1 ||
        (colHoLot !== -1 && colTen !== -1)
      )
    ) {
      return r;
    }
  }

  return -1;
}

function isSheetAlreadyImported(sheet) {
  const props = PropertiesService.getDocumentProperties();
  const raw = props.getProperty("IMPORTED_SHEET_IDS") || "[]";

  let ids = [];
  try {
    ids = JSON.parse(raw);
  } catch (err) {
    ids = [];
  }

  return ids.includes(String(sheet.getSheetId()));
}

function markSheetImported(sheet) {
  const props = PropertiesService.getDocumentProperties();
  const raw = props.getProperty("IMPORTED_SHEET_IDS") || "[]";

  let ids = [];
  try {
    ids = JSON.parse(raw);
  } catch (err) {
    ids = [];
  }

  const id = String(sheet.getSheetId());

  if (!ids.includes(id)) {
    ids.push(id);
    props.setProperty("IMPORTED_SHEET_IDS", JSON.stringify(ids));
  }
}

function isValidImportSheet(sheet, options) {
  options = options || {};

  const sheetName = sheet.getName();

  if (IMPORT_IGNORE_SHEETS.includes(sheetName)) {
    return false;
  }

  if (options.skipImported && isSheetAlreadyImported(sheet)) {
    return false;
  }

  const data = sheet.getDataRange().getValues();

  if (data.length < 2) {
    return false;
  }

  const headerRowIndex = findHeaderRowIndex(data);
  return headerRowIndex !== -1;
}

function findImportSheetAuto(options) {
  options = options || {};

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const activeSheet = ss.getActiveSheet();

  // Ưu tiên sheet đang mở
  if (isValidImportSheet(activeSheet, options)) {
    return activeSheet;
  }

  // Sau khi import file, sheet mới thường nằm gần cuối danh sách
  const sheets = ss.getSheets();

  for (let i = sheets.length - 1; i >= 0; i--) {
    if (isValidImportSheet(sheets[i], options)) {
      return sheets[i];
    }
  }

  throw new Error("Không tìm thấy sheet import có cột MSSV và Họ tên hoặc Họ lót + Tên.");
}

function getOrCreateSinhVienSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_SV);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_SV);
  }

  ensureSinhVienHeader(sheet);
  return sheet;
}

function ensureSinhVienHeader(sheet) {
  const lastRow = sheet.getLastRow();

  if (lastRow === 0) {
    sheet.getRange(1, 1, 1, IMPORT_SV_HEADERS.length).setValues([IMPORT_SV_HEADERS]);
  } else {
    const firstRow = sheet.getRange(1, 1, 1, IMPORT_SV_HEADERS.length).getValues()[0];
    const currentHeader = firstRow.map(v => String(v || "").trim()).join("|");
    const expectedHeader = IMPORT_SV_HEADERS.join("|");

    if (currentHeader !== expectedHeader) {
      sheet.getRange(1, 1, 1, IMPORT_SV_HEADERS.length).setValues([IMPORT_SV_HEADERS]);
    }
  }

  const headerRange = sheet.getRange(1, 1, 1, IMPORT_SV_HEADERS.length);
  headerRange
    .setFontFamily(IMPORT_FONT)
    .setFontSize(IMPORT_FONT_SIZE)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");
}

function getExistingMSSVMap(sheet) {
  const result = {};
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return result;
  }

  const values = sheet.getRange(2, 1, lastRow - 1, IMPORT_SV_HEADERS.length).getValues();

  for (let i = 0; i < values.length; i++) {
    const mssv = String(values[i][0] || "").trim();

    if (!mssv) continue;
    if (mssv === "MSSV") continue;

    result[mssv] = {
      rowIndex: i + 2,
      uid: normalizeUID(values[i][3]),
      fid: String(values[i][4] || "").trim()
    };
  }

  return result;
}

function getExistingRFIDSet(sheet) {
  const result = new Set();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return result;
  }

  const values = sheet.getRange(2, 4, lastRow - 1, 1).getValues();

  for (let i = 0; i < values.length; i++) {
    const uid = normalizeUID(values[i][0]);

    if (uid) {
      result.add(uid);
    }
  }

  return result;
}

function getSourceInfo(sourceSheet) {
  const data = sourceSheet.getDataRange().getValues();

  if (data.length < 2) {
    throw new Error("Sheet nguồn không có dữ liệu.");
  }

  const headerRowIndex = findHeaderRowIndex(data);

  if (headerRowIndex === -1) {
    throw new Error("Không tìm thấy hàng tiêu đề chứa MSSV và Họ tên hoặc Họ lót + Tên.");
  }

  const headers = data[headerRowIndex];

  return {
    data: data,
    headerRowIndex: headerRowIndex,
    colMSSV: findColumnIndex(headers, getMSSVAliases()),
    colHoTen: findColumnIndex(headers, getHoTenAliases()),
    colHoLot: findColumnIndex(headers, getHoLotAliases()),
    colTen: findColumnIndex(headers, getTenAliases()),
    colLop: findColumnIndex(headers, getLopAliases()),
    colRFID: findColumnIndex(headers, getRFIDAliases())
  };
}

function buildNormalizedStudents(sourceSheet, existingMSSVMap, existingRFIDSet) {
  const info = getSourceInfo(sourceSheet);
  const output = [];
  const rfidUpdates = [];

  const seenMSSVInSource = new Set();
  const seenRFIDInSource = new Set();

  let skippedEmpty = 0;
  let skippedDuplicateInSource = 0;
  let skippedAlreadyExists = 0;
  let updatedExistingRFID = 0;
  let skippedDuplicateRFID = 0;
  let skippedConflictRFID = 0;

  for (let r = info.headerRowIndex + 1; r < info.data.length; r++) {
    const row = info.data[r];

    const mssv = String(row[info.colMSSV] || "").trim();

    let hoten = "";

    if (info.colHoTen !== -1) {
      hoten = String(row[info.colHoTen] || "").trim();
    } else {
      const hoLot = info.colHoLot !== -1 ? String(row[info.colHoLot] || "").trim() : "";
      const ten = info.colTen !== -1 ? String(row[info.colTen] || "").trim() : "";
      hoten = (hoLot + " " + ten).replace(/\s+/g, " ").trim();
    }

    const lop = info.colLop >= 0 ? String(row[info.colLop] || "").trim() : "";
    let uidRFID = info.colRFID >= 0 ? normalizeUID(row[info.colRFID]) : "";
    let ghiChu = "";

    if (!mssv || !hoten) {
      skippedEmpty++;
      continue;
    }

    if (seenMSSVInSource.has(mssv)) {
      skippedDuplicateInSource++;
      continue;
    }

    seenMSSVInSource.add(mssv);

    if (uidRFID) {
      if (seenRFIDInSource.has(uidRFID)) {
        uidRFID = "";
        ghiChu = "UID_RFID bi trung trong file import, can kiem tra";
        skippedDuplicateRFID++;
      } else {
        seenRFIDInSource.add(uidRFID);
      }
    }

    const existedStudent = existingMSSVMap[mssv];

    if (existedStudent) {
      skippedAlreadyExists++;

      // Nếu sinh viên đã có trong SinhVien nhưng UID_RFID đang trống,
      // cho phép cập nhật UID từ file nhà trường.
      if (uidRFID && !existedStudent.uid) {
        if (!existingRFIDSet.has(uidRFID)) {
          rfidUpdates.push({
            rowIndex: existedStudent.rowIndex,
            uid: uidRFID
          });
          existingRFIDSet.add(uidRFID);
          updatedExistingRFID++;
        } else {
          skippedConflictRFID++;
        }
      }

      continue;
    }

    if (uidRFID && existingRFIDSet.has(uidRFID)) {
      uidRFID = "";
      ghiChu = "UID_RFID da ton tai trong SinhVien, can kiem tra";
      skippedConflictRFID++;
    }

    if (uidRFID) {
      existingRFIDSet.add(uidRFID);
    }

    output.push([
      mssv,
      hoten,
      lop,
      uidRFID,
      "",
      ghiChu
    ]);
  }

  return {
    rows: output,
    rfidUpdates: rfidUpdates,
    skippedEmpty: skippedEmpty,
    skippedDuplicateInSource: skippedDuplicateInSource,
    skippedAlreadyExists: skippedAlreadyExists,
    updatedExistingRFID: updatedExistingRFID,
    skippedDuplicateRFID: skippedDuplicateRFID,
    skippedConflictRFID: skippedConflictRFID
  };
}

function appendSeparatorRow(sheet, sourceSheet) {
  const lastRow = sheet.getLastRow();

  // Nếu sheet chỉ có header thì không cần tạo dòng ngăn
  if (lastRow < 2) {
    return null;
  }

  const rowIndex = lastRow + 1;
  const now = Utilities.formatDate(new Date(), TIMEZONE, "dd/MM/yyyy HH:mm:ss");

  sheet.getRange(rowIndex, 1, 1, IMPORT_SV_HEADERS.length).setValues([[
    "",
    "----- IMPORT: " + sourceSheet.getName() + " - " + now + " -----",
    "",
    "",
    "",
    ""
  ]]);

  const range = sheet.getRange(rowIndex, 1, 1, IMPORT_SV_HEADERS.length);
  range
    .setFontFamily(IMPORT_FONT)
    .setFontSize(IMPORT_FONT_SIZE)
    .setFontWeight("bold")
    .setBackground("#eeeeee")
    .setHorizontalAlignment("center")
    .setBorder(true, false, true, false, false, false);

  return rowIndex;
}

function formatSinhVienSheet(sheet) {
  const lastRow = Math.max(sheet.getLastRow(), 1);
  const lastCol = IMPORT_SV_HEADERS.length;

  sheet.getRange(1, 1, lastRow, lastCol)
    .setFontFamily(IMPORT_FONT)
    .setFontSize(IMPORT_FONT_SIZE)
    .setNumberFormat("@");

  sheet.getRange(1, 1, 1, lastCol)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  sheet.autoResizeColumns(1, lastCol);
}

function importSheetToSinhVien(sourceSheet, options) {
  options = options || {};

  const sinhVienSheet = getOrCreateSinhVienSheet();
  const existingMSSVMap = getExistingMSSVMap(sinhVienSheet);
  const existingRFIDSet = getExistingRFIDSet(sinhVienSheet);
  const normalized = buildNormalizedStudents(sourceSheet, existingMSSVMap, existingRFIDSet);

  for (let i = 0; i < normalized.rfidUpdates.length; i++) {
    const item = normalized.rfidUpdates[i];
    sinhVienSheet.getRange(item.rowIndex, 4).setValue(item.uid);
  }

  if (normalized.rows.length === 0) {
    formatSinhVienSheet(sinhVienSheet);
    markSheetImported(sourceSheet);

    if (!options.silent) {
      SpreadsheetApp.getUi().alert(
        "Không có sinh viên mới để thêm.\n\n" +
        "Sheet nguồn: " + sourceSheet.getName() + "\n" +
        "UID_RFID đã cập nhật cho sinh viên cũ: " + normalized.updatedExistingRFID + "\n" +
        "Dòng thiếu MSSV/Họ tên: " + normalized.skippedEmpty + "\n" +
        "MSSV trùng trong file import: " + normalized.skippedDuplicateInSource + "\n" +
        "MSSV đã tồn tại trong SinhVien: " + normalized.skippedAlreadyExists + "\n" +
        "UID_RFID trùng trong file import: " + normalized.skippedDuplicateRFID + "\n" +
        "UID_RFID bị trùng với dữ liệu cũ: " + normalized.skippedConflictRFID
      );
    }

    return;
  }

  appendSeparatorRow(sinhVienSheet, sourceSheet);

  const startRow = sinhVienSheet.getLastRow() + 1;

  sinhVienSheet
    .getRange(startRow, 1, normalized.rows.length, IMPORT_SV_HEADERS.length)
    .setValues(normalized.rows);

  const newRange = sinhVienSheet.getRange(startRow, 1, normalized.rows.length, IMPORT_SV_HEADERS.length);
  newRange
    .setFontFamily(IMPORT_FONT)
    .setFontSize(IMPORT_FONT_SIZE)
    .setNumberFormat("@");

  formatSinhVienSheet(sinhVienSheet);
  markSheetImported(sourceSheet);

  if (!options.silent) {
    SpreadsheetApp.getUi().alert(
      "Đã thêm/cập nhật dữ liệu vào sheet SinhVien.\n\n" +
      "Sheet nguồn: " + sourceSheet.getName() + "\n" +
      "Số sinh viên mới được thêm: " + normalized.rows.length + "\n" +
      "UID_RFID đã cập nhật cho sinh viên cũ: " + normalized.updatedExistingRFID + "\n" +
      "Dòng thiếu MSSV/Họ tên: " + normalized.skippedEmpty + "\n" +
      "MSSV trùng trong file import: " + normalized.skippedDuplicateInSource + "\n" +
      "MSSV đã tồn tại nên bỏ qua: " + normalized.skippedAlreadyExists + "\n" +
      "UID_RFID trùng trong file import: " + normalized.skippedDuplicateRFID + "\n" +
      "UID_RFID bị trùng với dữ liệu cũ: " + normalized.skippedConflictRFID
    );
  }
}

function importActiveSheetToSinhVien() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const activeSheet = ss.getActiveSheet();

  if (!isValidImportSheet(activeSheet, { skipImported: false })) {
    throw new Error("Sheet đang mở không có cột MSSV và Họ tên hoặc Họ lót + Tên.");
  }

  importSheetToSinhVien(activeSheet, {
    silent: false
  });
}

function autoFindAndImportSinhVien() {
  const sourceSheet = findImportSheetAuto({
    skipImported: false
  });

  importSheetToSinhVien(sourceSheet, {
    silent: false
  });
}

function autoImportOnChange(e) {
  const changeType = e && e.changeType ? e.changeType : "";

  // Khi import XLSX/CSV bằng "Chèn trang tính mới", thường phát sinh INSERT_GRID.
  // OTHER giữ lại để dự phòng vì một số thao tác import có thể được Sheets ghi nhận khác nhau.
  if (changeType !== "INSERT_GRID" && changeType !== "OTHER") {
    return;
  }

  Utilities.sleep(1500);

  try {
    const sourceSheet = findImportSheetAuto({
      skipImported: true
    });

    importSheetToSinhVien(sourceSheet, {
      silent: true
    });

    SpreadsheetApp.getActiveSpreadsheet().toast(
      "Đã tự động chuẩn hóa và thêm dữ liệu vào SinhVien.",
      "Đồ án điểm danh",
      5
    );
  } catch (err) {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      "Không tự import: " + err.message,
      "Đồ án điểm danh",
      8
    );
  }
}

function installAutoImportTrigger() {
  removeAutoImportTrigger();

  ScriptApp.newTrigger(IMPORT_TRIGGER_FUNCTION)
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onChange()
    .create();

  SpreadsheetApp.getUi().alert(
    "Đã bật tự động chuẩn hóa sau khi import file.\n\n" +
    "Từ lần sau, khi bạn import XLSX/CSV bằng cách chèn trang tính mới, hệ thống sẽ tự tìm sheet mới và thêm dữ liệu vào SinhVien."
  );
}

function removeAutoImportTrigger() {
  const triggers = ScriptApp.getProjectTriggers();

  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === IMPORT_TRIGGER_FUNCTION) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

function resetImportedSheetHistory() {
  PropertiesService.getDocumentProperties().deleteProperty("IMPORTED_SHEET_IDS");

  SpreadsheetApp.getUi().alert(
    "Đã xóa lịch sử các sheet đã import.\n\n" +
    "Chỉ dùng chức năng này khi bạn muốn import lại một sheet cũ."
  );
}
