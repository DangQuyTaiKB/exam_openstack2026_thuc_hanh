module.exports = {
  EXAM_TITLE:    process.env.EXAM_TITLE || "Bài thi thực hành",
  SESSION_NAME:  process.env.SESSION_NAME || "Thực hành — HK1 2024",

  EXAM_DURATION_MINUTES: Number(process.env.EXAM_DURATION_MINUTES || 90),
  EXAM_FILENAME:  process.env.EXAM_FILENAME || "de_thi_thuc_hanh.docx",
  MAX_UPLOAD_MB:  Number(process.env.MAX_UPLOAD_MB || 50),

  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "admin123",
  PORT:           Number(process.env.PORT || 3001),
  UPLOADS_DIR:    process.env.UPLOADS_DIR,
  EXAMS_DIR:      process.env.EXAMS_DIR,
};
