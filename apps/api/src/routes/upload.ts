import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';
import { requireStaff } from '../middleware/auth.js';

const router = express.Router();

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// The extension is chosen from the file's actual bytes, never from the client's filename or MIME type.
function detectImageExtension(bytes: Buffer): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return '.jpg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  return null;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

router.post('/', requireStaff, upload.single('image'), async (req, res) => {
  if (!req.file) throw new AppError(400, 'NO_FILE', 'No file uploaded');

  const extension = detectImageExtension(req.file.buffer);
  if (!extension) throw new AppError(415, 'UNSUPPORTED_FILE', 'Only JPEG, PNG and WebP images are allowed');

  const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extension}`;
  await fs.mkdir(config.uploadDir, { recursive: true });
  await fs.writeFile(path.join(config.uploadDir, filename), req.file.buffer);

  res.status(201).json({ imageUrl: `/uploads/${filename}` });
});

export default router;
