const express  = require("express");
const multer   = require("multer");
const archiver = require("archiver");
const path     = require("path");
const fs       = require("fs");
const rateLimit = require("express-rate-limit");
const cfg      = require("./config");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/api/", rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));

const UPLOADS_DIR = cfg.UPLOADS_DIR || path.join(__dirname, "uploads");
const EXAMS_DIR   = cfg.EXAMS_DIR || path.join(__dirname, "exams");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(EXAMS_DIR,   { recursive: true });

// ── Multer: bài nộp của học viên ──────────────────────────────────────────
const studentUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext  = path.extname(file.originalname);
      const base = path.basename(file.originalname, ext)
        .replace(/[^\w\sÀ-ỹ\-]/g, "").trim().replace(/\s+/g, "_");
      cb(null, `${base}_${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: cfg.MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = [".zip",".rar",".7z",".pdf",".docx",".doc",".png",".jpg",".jpeg"];
    ok.includes(path.extname(file.originalname).toLowerCase())
      ? cb(null, true)
      : cb(new Error("Định dạng không được phép"));
  }
});

// ── Multer: đề thi upload từ admin ────────────────────────────────────────
const examUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, EXAMS_DIR),
    filename:    (req, file, cb) => cb(null, file.originalname)
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    [".docx",".doc",".pdf"].includes(path.extname(file.originalname).toLowerCase())
      ? cb(null, true) : cb(new Error("Chỉ .docx / .doc / .pdf"));
  }
});

// ── Helper: đọc/ghi log JSON ───────────────────────────────────────────────
const logPath = path.join(UPLOADS_DIR, "submissions.json");
function readLog() {
  try { return JSON.parse(fs.readFileSync(logPath, "utf8")); } catch { return []; }
}
function writeLog(data) { fs.writeFileSync(logPath, JSON.stringify(data, null, 2)); }
function checkAdmin(req, res) {
  const pw = req.query.password || req.body?.password;
  if (pw !== cfg.ADMIN_PASSWORD) { res.status(401).json({ error: "Sai mật khẩu" }); return false; }
  return true;
}

// ── API: info cho trang học viên ──────────────────────────────────────────
app.get("/api/info", (req, res) => {
  res.json({
    title:    cfg.EXAM_TITLE,
    session:  cfg.SESSION_NAME,
    duration: cfg.EXAM_DURATION_MINUTES,
    maxMb:    cfg.MAX_UPLOAD_MB,
  });
});

// ── API: tải đề thi ────────────────────────────────────────────────────────
app.get("/api/download-exam", (req, res) => {
  const filename = req.query.file || cfg.EXAM_FILENAME;
  const filePath = path.join(EXAMS_DIR, path.basename(filename));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Chưa có đề thi" });
  res.download(filePath);
});

// ── API: học viên nộp bài ─────────────────────────────────────────────────
app.post("/api/submit", studentUpload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Không có file" });
  const { studentName } = req.body;
  if (!studentName?.trim()) return res.status(400).json({ error: "Thiếu họ tên" });

  const logs = readLog();
  logs.push({
    id:           Date.now(),
    studentName:  studentName.trim(),
    originalName: req.file.originalname,
    savedName:    req.file.filename,
    size:         req.file.size,
    session:      cfg.SESSION_NAME,
    submittedAt:  new Date().toISOString(),
  });
  writeLog(logs);
  res.json({ ok: true });
});

// ── ADMIN: danh sách bài nộp ──────────────────────────────────────────────
app.get("/api/admin/list", (req, res) => {
  if (!checkAdmin(req, res)) return;
  const logs = readLog().reverse();
  res.json({ submissions: logs, total: logs.length });
});

// ── ADMIN: tải 1 file ─────────────────────────────────────────────────────
app.get("/api/admin/download/:filename", (req, res) => {
  if (!checkAdmin(req, res)) return;
  const fp = path.join(UPLOADS_DIR, path.basename(req.params.filename));
  if (!fs.existsSync(fp)) return res.status(404).json({ error: "Không tìm thấy file" });
  res.download(fp);
});

// ── ADMIN: tải tất cả bài nộp (zip) ──────────────────────────────────────
app.get("/api/admin/download-all", (req, res) => {
  if (!checkAdmin(req, res)) return;
  const files = fs.readdirSync(UPLOADS_DIR).filter(f => f !== "submissions.json");
  if (!files.length) return res.status(404).json({ error: "Chưa có bài nộp" });
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename=bai_nop_${Date.now()}.zip`);
  const archive = archiver("zip", { zlib: { level: 6 } });
  archive.pipe(res);
  files.forEach(f => archive.file(path.join(UPLOADS_DIR, f), { name: f }));
  archive.finalize();
});

// ── ADMIN: list file đề thi ───────────────────────────────────────────────
app.get("/api/admin/exam-files", (req, res) => {
  if (!checkAdmin(req, res)) return;
  const files = fs.readdirSync(EXAMS_DIR)
    .filter(f => [".docx",".doc",".pdf"].includes(path.extname(f).toLowerCase()))
    .map(f => ({ name: f, size: fs.statSync(path.join(EXAMS_DIR, f)).size }));
  res.json({ files });
});

// ── ADMIN: upload đề thi mới ──────────────────────────────────────────────
app.post("/api/admin/upload-exam", examUpload.single("file"), (req, res) => {
  if (!checkAdmin(req, res)) return;
  if (!req.file) return res.status(400).json({ error: "Không có file" });
  res.json({ ok: true, filename: req.file.filename });
});

// ── ADMIN: xoá toàn bộ bài nộp ───────────────────────────────────────────
app.delete("/api/admin/clear", (req, res) => {
  if (!checkAdmin(req, res)) return;
  fs.readdirSync(UPLOADS_DIR).forEach(f => fs.unlinkSync(path.join(UPLOADS_DIR, f)));
  res.json({ ok: true });
});

// ── Start ─────────────────────────────────────────────────────────────────
app.listen(cfg.PORT, () => {
  console.log(`\n🛠  Thi thực hành: http://localhost:${cfg.PORT}`);
  console.log(`🔒  Admin:         http://localhost:${cfg.PORT}/admin.html\n`);
});
