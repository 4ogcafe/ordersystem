import express from 'express';
import { z } from 'zod';
import { notFound, validationError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { requireAdmin } from '../middleware/auth.js';
import { publicCache } from '../middleware/cache.js';

const router = express.Router();

const postSchema = z.object({
  title: z.string().trim().min(1, 'タイトルを入力してください').max(255),
  slug: z.string().trim().max(191).optional(),
  content: z.string().trim().min(1, '本文を入力してください'),
  excerpt: z.string().trim().max(1000).optional(),
  coverImage: z.string().trim().max(500).optional(),
  category: z.string().trim().max(100).optional(),
  tags: z.array(z.string().trim()).optional(),
  author: z.string().trim().max(100).optional(),
  readTimeMinutes: z.number().int().min(1).max(120).default(3),
  isPublished: z.boolean().default(true),
  publishedAt: z.string().datetime().optional().nullable(),
  metaTitle: z.string().trim().max(255).optional().nullable(),
  metaDescription: z.string().trim().max(1000).optional().nullable(),
});

// Admin: Get all blog posts including drafts
router.get('/admin/all', requireAdmin, async (_req, res) => {
  try {
    const posts = await (prisma as any).blogPost.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({ posts });
  } catch (err: any) {
    res.json({ posts: [] });
  }
});

// Admin: Create new blog post
router.post('/admin', requireAdmin, async (req, res) => {
  const data = postSchema.parse(req.body);
  let slug = data.slug;
  if (!slug) {
    slug = `post-${Date.now().toString(36)}`;
  } else {
    slug = slug.toLowerCase().replace(/[^a-z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF-]+/gu, '-').replace(/^-+|-+$/g, '');
    if (!slug) slug = `post-${Date.now().toString(36)}`;
  }

  // Check unique slug
  const existing = await (prisma as any).blogPost.findUnique({ where: { slug } });
  if (existing) {
    slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const post = await (prisma as any).blogPost.create({
    data: {
      ...data,
      slug,
      publishedAt: data.publishedAt ? new Date(data.publishedAt) : (data.isPublished ? new Date() : null),
    },
  });

  res.status(201).json({ success: true, post });
});

// Admin: Update blog post
router.put('/admin/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const data = postSchema.partial().parse(req.body);

  if (data.slug) {
    const existing = await (prisma as any).blogPost.findFirst({
      where: { slug: data.slug, id: { not: id } },
    });
    if (existing) {
      data.slug = `${data.slug}-${Math.random().toString(36).slice(2, 6)}`;
    }
  }

  const updateData: any = { ...data };
  if (data.publishedAt !== undefined) {
    updateData.publishedAt = data.publishedAt ? new Date(data.publishedAt) : null;
  }

  const post = await (prisma as any).blogPost.update({
    where: { id },
    data: updateData,
  });

  res.json({ success: true, post });
});

// Admin: Delete blog post
router.delete('/admin/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  await (prisma as any).blogPost.delete({ where: { id } });
  res.json({ success: true });
});

// Public: Get published blog posts list
router.get('/', publicCache, async (req, res) => {
  try {
    const category = typeof req.query.category === 'string' && req.query.category !== 'all' ? req.query.category : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 30));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const where: any = { isPublished: true };
    if (category) where.category = category;
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { excerpt: { contains: search } },
        { content: { contains: search } },
      ];
    }

    const [posts, total, allCategories] = await Promise.all([
      (prisma as any).blogPost.findMany({
        where,
        select: {
          id: true,
          slug: true,
          title: true,
          excerpt: true,
          coverImage: true,
          category: true,
          tags: true,
          author: true,
          readTimeMinutes: true,
          publishedAt: true,
          createdAt: true,
        },
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
      }),
      (prisma as any).blogPost.count({ where }),
      (prisma as any).blogPost.findMany({
        where: { isPublished: true, category: { not: null } },
        select: { category: true },
        distinct: ['category'],
      }),
    ]);

    const categories = allCategories.map((c: any) => c.category).filter(Boolean);

    res.json({ posts, total, categories });
  } catch (err) {
    res.json({ posts: [], total: 0, categories: [] });
  }
});

// Public: Get single blog post by slug or ID
router.get('/:slug', publicCache, async (req, res) => {
  const { slug } = req.params;
  try {
    const post = await (prisma as any).blogPost.findFirst({
      where: {
        OR: [{ slug }, { id: slug }],
      },
    });

    if (!post) {
      throw notFound('BlogPost', slug);
    }

    const relatedPosts = await (prisma as any).blogPost.findMany({
      where: {
        id: { not: post.id },
        isPublished: true,
      },
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        coverImage: true,
        category: true,
        readTimeMinutes: true,
        publishedAt: true,
      },
      orderBy: { publishedAt: 'desc' },
      take: 3,
    });

    res.json({ post, relatedPosts });
  } catch (err: any) {
    if (err?.status === 404) throw err;
    throw notFound('BlogPost', slug);
  }
});

export default router;
