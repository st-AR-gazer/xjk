import { randomUUID } from "node:crypto";
import { safeUnlink } from "./filesystem.js";
import { safeExt } from "./values.js";

const MEBIBYTE = 1024 * 1024;

function unexpectedFieldError(fieldname, message) {
  const text = typeof message === "function" ? message(fieldname) : message;
  return new Error(text || `Unexpected upload field: ${fieldname}`);
}

export function hasAllowedSuffix(filename, suffixes) {
  const normalized = String(filename || "").toLowerCase();
  return suffixes.some((suffix) => normalized.endsWith(String(suffix).toLowerCase()));
}

export function isTrackmaniaMapFilename(filename) {
  return hasAllowedSuffix(filename, [".map.gbx", ".gbx"]);
}

export function isTrackmaniaReplayFilename(filename) {
  return hasAllowedSuffix(filename, [".replay.gbx"]);
}

export function isTrackmaniaGhostFilename(filename) {
  return hasAllowedSuffix(filename, [".ghost.gbx", ".gbx"]);
}

export function getMapUploadExtension(filename) {
  return hasAllowedSuffix(filename, [".map.gbx"]) ? ".Map.Gbx" : safeExt(filename, ".Gbx");
}

export function createFieldUpload({
  multer,
  fields,
  maxFileMb,
  maxFiles,
  maxFields = 16,
  maxFieldMb = 1,
  fileFilter,
  unexpectedFieldMessage,
  createId = randomUUID,
}) {
  const fieldEntries = Object.entries(fields);
  const fieldByName = new Map(fieldEntries);

  const storage = multer.diskStorage({
    destination: (_req, file, callback) => {
      const field = fieldByName.get(file.fieldname);
      if (!field) {
        callback(unexpectedFieldError(file.fieldname, unexpectedFieldMessage));
        return;
      }
      callback(null, field.directory);
    },
    filename: (_req, file, callback) => {
      const field = fieldByName.get(file.fieldname);
      if (!field) {
        callback(unexpectedFieldError(file.fieldname, unexpectedFieldMessage));
        return;
      }

      const id = createId();
      const filename = field.buildFilename
        ? field.buildFilename({ file, id })
        : `${id}${safeExt(file.originalname, field.fallbackExtension || ".bin")}`;
      callback(null, filename);
    },
  });

  const validateFile =
    fileFilter ||
    ((_req, file, callback) => {
      const field = fieldByName.get(file.fieldname);
      if (!field) {
        callback(unexpectedFieldError(file.fieldname, unexpectedFieldMessage));
        return;
      }
      if (field.accept && !field.accept(file)) {
        callback(new Error(field.errorMessage || "Unsupported file type."));
        return;
      }
      callback(null, true);
    });

  const fileLimit = maxFiles ?? fieldEntries.length;
  const limits = {
    fileSize: maxFileMb * MEBIBYTE,
    files: fileLimit,
    fields: maxFields,
    fieldSize: maxFieldMb * MEBIBYTE,
    parts: fileLimit + maxFields,
  };

  return multer({ storage, limits, fileFilter: validateFile });
}

export function listUploadedFiles(req) {
  const files = [];
  const seen = new Set();
  const add = (file) => {
    if (!file || typeof file !== "object" || seen.has(file)) return;
    seen.add(file);
    files.push(file);
  };

  add(req?.file);
  if (Array.isArray(req?.files)) {
    req.files.forEach(add);
  } else if (req?.files && typeof req.files === "object") {
    Object.values(req.files).forEach((value) => {
      if (Array.isArray(value)) value.forEach(add);
      else add(value);
    });
  }
  return files;
}

export async function cleanupUploadedFiles(req, { unlink = safeUnlink } = {}) {
  await Promise.all(listUploadedFiles(req).map((file) => unlink(file.path)));
}

export function createUploadBudgetMiddleware({ maxTotalMb, fieldLimitsMb = {}, unlink = safeUnlink }) {
  const maxTotalBytes = Math.max(1, Number(maxTotalMb) || 1) * MEBIBYTE;
  return async (req, res, next) => {
    const files = listUploadedFiles(req);
    const fieldOverage = files.find((file) => {
      const fieldLimitMb = Number(fieldLimitsMb[file.fieldname]);
      return fieldLimitMb > 0 && Math.max(0, Number(file.size) || 0) > fieldLimitMb * MEBIBYTE;
    });
    if (fieldOverage) {
      await Promise.all(files.map((file) => unlink(file.path)));
      const fieldLimitMb = Number(fieldLimitsMb[fieldOverage.fieldname]);
      return res.status(413).json({
        error: `Upload field '${fieldOverage.fieldname}' is too large. Max ${fieldLimitMb} MB.`,
        code: "UPLOAD_FIELD_BUDGET_EXCEEDED",
      });
    }

    const uploadedBytes = files.reduce((total, file) => total + Math.max(0, Number(file.size) || 0), 0);
    if (uploadedBytes <= maxTotalBytes) return next();

    await Promise.all(files.map((file) => unlink(file.path)));
    return res.status(413).json({
      error: `Combined upload is too large. Max ${maxTotalMb} MB per request.`,
      code: "UPLOAD_BUDGET_EXCEEDED",
    });
  };
}
