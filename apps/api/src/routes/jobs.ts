import express from 'express';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { requireAdmin } from '../middleware/auth.js';
import {
  getAllJobs,
  getPublicActiveJobs,
  createJob,
  updateJob,
  deleteJob,
  getAllApplications,
  submitJobApplication,
  updateApplicationStatus,
  deleteApplication,
  type JobApplication,
} from '../services/jobs.js';

const router = express.Router();

const jobSchema = z.object({
  titleJa: z.string().trim().min(1, '職種名を入力してください').max(150),
  category: z.enum(['HALL', 'KITCHEN', 'DELIVERY', 'OTHER']),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT']),
  salaryJa: z.string().trim().min(1, '給与情報を入力してください').max(150),
  hoursJa: z.string().trim().min(1, '勤務時間を入力してください').max(200),
  locationJa: z.string().trim().min(1, '勤務地を入力してください').max(150),
  descriptionJa: z.string().trim().min(1, '仕事内容を入力してください').max(2000),
  requirementsJa: z.string().trim().max(1000).optional(),
  benefitsJa: z.string().trim().max(1000).optional(),
  isActive: z.boolean().default(true),
  displayOrder: z.number().int().default(0),
});

const applicationSchema = z.object({
  jobId: z.string().optional(),
  jobTitle: z.string().trim().optional(),
  name: z.string().trim().min(1, 'お名前を入力してください').max(100),
  nameKana: z.string().trim().max(100).optional(),
  email: z.string().trim().email('有効なメールアドレスを入力してください').max(150),
  phone: z.string().trim().min(8, '有効な電話番号を入力してください').max(30),
  desiredEmploymentType: z.string().trim().max(50).optional(),
  availability: z.string().trim().max(200).optional(),
  message: z.string().trim().max(2000).optional(),
});

// Public: Get active job openings
router.get('/', async (_req, res) => {
  const jobs = await getPublicActiveJobs();
  res.json(jobs);
});

// Public: Submit job application
router.post('/apply', async (req, res) => {
  try {
    const parsed = applicationSchema.parse(req.body);
    const ip = req.ip || req.socket.remoteAddress || undefined;
    const application = await submitJobApplication({
      ...parsed,
      ip,
    });
    res.status(201).json({
      success: true,
      message: 'ご応募ありがとうございます。採用担当より折り返しご連絡いたします。',
      applicationId: application.id,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new AppError(400, 'VALIDATION_ERROR', err.errors[0]?.message || '入力内容をご確認ください');
    }
    const message = err instanceof Error ? err.message : '応募処理に失敗しました。';
    throw new AppError(400, 'APPLICATION_ERROR', message);
  }
});

// Admin: Get all jobs (including draft / inactive)
router.get('/admin/all', requireAdmin, async (_req, res) => {
  const jobs = await getAllJobs();
  res.json(jobs);
});

// Admin: Create job posting
router.post('/admin', requireAdmin, async (req, res) => {
  try {
    const parsed = jobSchema.parse(req.body);
    const created = await createJob(parsed);
    res.status(201).json(created);
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new AppError(400, 'VALIDATION_ERROR', err.errors[0]?.message || '入力内容をご確認ください');
    }
    throw err;
  }
});

// Admin: Update job posting
router.put('/admin/:id', requireAdmin, async (req, res) => {
  try {
    const parsed = jobSchema.partial().parse(req.body);
    const updated = await updateJob(req.params.id, parsed);
    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new AppError(400, 'VALIDATION_ERROR', err.errors[0]?.message || '入力内容をご確認ください');
    }
    throw err;
  }
});

// Admin: Delete job posting
router.delete('/admin/:id', requireAdmin, async (req, res) => {
  await deleteJob(req.params.id);
  res.json({ success: true });
});

// Admin: Get all job applications
router.get('/admin/applications', requireAdmin, async (_req, res) => {
  const apps = await getAllApplications();
  res.json(apps);
});

// Admin: Update application status
router.patch('/admin/applications/:id/status', requireAdmin, async (req, res) => {
  const statusSchema = z.object({
    status: z.enum(['NEW', 'REVIEWING', 'CONTACTED', 'HIRED', 'REJECTED']),
  });
  const { status } = statusSchema.parse(req.body);
  const updated = await updateApplicationStatus(req.params.id, status as JobApplication['status']);
  res.json(updated);
});

// Admin: Delete application
router.delete('/admin/applications/:id', requireAdmin, async (req, res) => {
  await deleteApplication(req.params.id);
  res.json({ success: true });
});

export default router;
