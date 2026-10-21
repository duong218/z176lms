/**
 * Controller Quản lý Tài liệu Ôn tập & Học tập (Study Document Management).
 * Hỗ trợ tải lên file tài liệu (PDF/Word/Excel), phân quyền truy cập theo đơn vị/phòng ban và stream file an toàn.
 */

import fs from 'fs';
import path from 'path';
import * as studyDocumentService from '../services/study-document.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ApiError } from '../utils/api-error.js';
import { writeAudit } from '../services/audit.service.js';

const DOCUMENT_TYPES = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

// Danh sách tài liệu cho Quản trị viên / Giám khảo / Leader (không lọc phòng ban)
export const list = asyncHandler(async (req, res) => {
  const { topicId } = req.query;
  const data = await studyDocumentService.listDocumentsForStaff({ topicId });
  res.json({ success: true, message: 'OK', code: 'STUDY_DOCUMENT_LIST_OK', data });
});

// Danh sách tài liệu cho Thí sinh (chỉ xem được tài liệu chung hoặc tài liệu thuộc phòng ban của mình)
export const listForCandidate = asyncHandler(async (req, res) => {
  const { topicId } = req.query;
  const data = await studyDocumentService.listDocumentsForCandidate(req.auth.userId, { topicId });
  res.json({ success: true, message: 'OK', code: 'STUDY_DOCUMENT_LIST_OK', data });
});

// Tải lên tài liệu ôn tập mới (PDF, Docx, Xlsx)
export const create = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'Vui lòng chọn file tài liệu', 'DOCUMENT_FILE_REQUIRED');
  }
  const { topicId, title, scope, departmentId } = req.body ?? {};
  const data = await studyDocumentService.createDocument(
    { topicId, title, scope, departmentId, file: req.file },
    req.auth.userId,
  );

  await writeAudit({
    actorUserId: req.auth.userId,
    action: 'UPLOAD_STUDY_DOCUMENT',
    resourceType: 'StudyDocument',
    resourceId: data._id,
    metadata: { detail: `Đăng tài liệu ôn tập: ${data.title}` },
    ipAddress: req.ip,
  });

  res.status(201).json({
    success: true,
    message: 'Đăng tài liệu thành công',
    code: 'STUDY_DOCUMENT_CREATED',
    data,
  });
});

// Gỡ bỏ (vô hiệu hóa) tài liệu ôn tập
export const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const data = await studyDocumentService.deactivateDocument(id, req.auth);

  await writeAudit({
    actorUserId: req.auth.userId,
    action: 'DEACTIVATE_STUDY_DOCUMENT',
    resourceType: 'StudyDocument',
    resourceId: id,
    metadata: { detail: `Gỡ tài liệu ôn tập: ${id}` },
    ipAddress: req.ip,
  });

  res.json({ success: true, message: 'Đã gỡ tài liệu', code: 'STUDY_DOCUMENT_DEACTIVATED', data });
});

// Truyền phát file an toàn: chế độ xem trước (inline) hoặc tải về (attachment) sau khi kiểm tra quyền
export const download = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const mode = req.query.mode === 'inline' ? 'inline' : 'attachment';
  const doc = await studyDocumentService.getDocumentForAccess(id, req.auth);

  const rawName = doc.originalFileName || `${doc.title || 'tai-lieu'}`;
  const encodedName = encodeURIComponent(rawName);

  // Content-Type suy từ đuôi file (đã lọc khi upload), KHÔNG tin doc.mimeType do client gửi:
  // file .pdf giả "text/html" mở bằng Blob URL sẽ chạy script trên origin của app.
  res.setHeader('Content-Type', DOCUMENT_TYPES[path.extname(rawName).toLowerCase()] ?? 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `${mode}; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
  );

  fs.createReadStream(path.resolve(doc.filePath)).pipe(res);
});