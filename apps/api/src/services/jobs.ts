import { prisma } from '../lib/prisma.js';

export interface JobPosting {
  id: string;
  titleJa: string;
  category: 'HALL' | 'KITCHEN' | 'DELIVERY' | 'OTHER';
  employmentType: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT';
  salaryJa: string;
  hoursJa: string;
  locationJa: string;
  descriptionJa: string;
  requirementsJa?: string;
  benefitsJa?: string;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface JobApplication {
  id: string;
  jobId?: string;
  jobTitle?: string;
  name: string;
  nameKana?: string;
  email: string;
  phone: string;
  desiredEmploymentType?: string;
  availability?: string;
  message?: string;
  status: 'NEW' | 'REVIEWING' | 'CONTACTED' | 'HIRED' | 'REJECTED';
  createdAt: string;
  ip?: string;
}

const JOBS_SECRET_KEY = 'CAREERS_JOBS_LIST';
const APPLICATIONS_SECRET_KEY = 'CAREERS_APPLICATIONS_LIST';

export const DEFAULT_JOBS: JobPosting[] = [
  {
    id: 'job-hall-01',
    titleJa: 'ホール・接客サービススタッフ（アルバイト・パート）',
    category: 'HALL',
    employmentType: 'PART_TIME',
    salaryJa: '時給 1,200円〜1,500円（研修期間あり・昇給随時）',
    hoursJa: '10:00〜15:00 / 17:00〜22:00（週2日・1日3時間〜OK、シフト相談可能）',
    locationJa: '埼玉県熊谷市（熊谷駅徒歩圏内・車/バイク通勤OK）',
    descriptionJa: 'お客様のご案内、オーダー受付、お料理や本格ナンの配膳、お会計（レジ対応）、テーブルの片付けなど。明るく活気のあるアットホームなレストランです。英語やヒンディー語が飛び交う国際的な環境で、自然と異文化交流や語学力も身につきます！',
    requirementsJa: '未経験大歓迎！学生・主婦(夫)・フリーター・Wワーク歓迎。笑顔で元気にお客様と接することができる方。接客・飲食経験者は大歓迎です。',
    benefitsJa: '絶品まかない無料（出来立てカレー＆焼き立てナン！）、交通費規定支給、制服貸与、昇給あり、自転車・バイク・車通勤可、社割あり。',
    isActive: true,
    displayOrder: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'job-kitchen-02',
    titleJa: 'インド料理カレーシェフ・キッチン調理スタッフ（正社員・契約社員）',
    category: 'KITCHEN',
    employmentType: 'FULL_TIME',
    salaryJa: '月給 250,000円〜380,000円（経験・能力を考慮の上優遇） / アルバイト時給 1,250円〜',
    hoursJa: '10:00〜22:00（実働8時間 / 休憩あり / シフト制・月6〜8日休み）',
    locationJa: '埼玉県熊谷市（熊谷駅徒歩圏内）',
    descriptionJa: '本場インドのスパイスを使用したカレー調理、タンドール窯でのナンやタンドリーチキンの焼き上げ、仕込み、食材管理など。インド出身のベテランシェフと一緒に伝統的な味を追求します。将来自分のお店を持ちたい方も歓迎！',
    requirementsJa: '調理経験者優遇（タンドール・インド料理経験者は特に大歓迎！）。未経験でも料理が好きな方、スパイスを学びたい方は丁寧に指導します。外国籍の方大歓迎・ビザサポートあり（技能ビザ・特定技能等）。',
    benefitsJa: '社会保険完備、ビザ取得・更新サポート、まかない無料（美味しいインド家庭料理・カレー付き）、賞与・昇給制度、制服貸与。',
    isActive: true,
    displayOrder: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'job-delivery-03',
    titleJa: 'デリバリー・配達スタッフ（アルバイト・パート）',
    category: 'DELIVERY',
    employmentType: 'PART_TIME',
    salaryJa: '時給 1,250円〜1,600円（配達手当・インセンティブあり）',
    hoursJa: '11:00〜14:30 / 17:30〜21:30（ランチのみ・ディナーのみOK、週1日〜OK）',
    locationJa: '埼玉県熊谷市周辺（配達エリア：店舗から約3〜5km圏内）',
    descriptionJa: '出来立ての本格カレーやナンをお客様のご自宅やオフィスへ安全・迅速にお届けするお仕事です。配達がない時間帯は簡単な店内サポートやテイクアウトの梱包をお手伝いいただきます。',
    requirementsJa: '原付免許または普通自動車免許をお持ちの方。安全運転を第一に行動できる方。土地勘のある方歓迎。',
    benefitsJa: '絶品まかない付き、配達車両・ヘルメット・雨具貸与、ガソリン代支給、配達件数に応じたインセンティブ手当あり。',
    isActive: true,
    displayOrder: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

/** Get all jobs (admin view includes inactive) */
export async function getAllJobs(): Promise<JobPosting[]> {
  try {
    const record = await prisma.appSecret.findUnique({ where: { id: JOBS_SECRET_KEY } });
    if (record?.publicKey) {
      const parsed = JSON.parse(record.publicKey);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to load jobs, using defaults', err);
  }
  return DEFAULT_JOBS;
}

/** Get only active jobs for public site */
export async function getPublicActiveJobs(): Promise<JobPosting[]> {
  const all = await getAllJobs();
  return all
    .filter(j => j.isActive)
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

/** Save full job list */
export async function saveAllJobs(jobs: JobPosting[]): Promise<JobPosting[]> {
  const json = JSON.stringify(jobs);
  await prisma.appSecret.upsert({
    where: { id: JOBS_SECRET_KEY },
    create: { id: JOBS_SECRET_KEY, publicKey: json, privateKey: '' },
    update: { publicKey: json },
  });
  return jobs;
}

/** Create a new job */
export async function createJob(input: Omit<JobPosting, 'id' | 'createdAt' | 'updatedAt'>): Promise<JobPosting> {
  const all = await getAllJobs();
  const now = new Date().toISOString();
  const newJob: JobPosting = {
    ...input,
    id: 'job_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
    createdAt: now,
    updatedAt: now,
  };
  const updated = [newJob, ...all];
  await saveAllJobs(updated);
  return newJob;
}

/** Update an existing job */
export async function updateJob(id: string, patch: Partial<JobPosting>): Promise<JobPosting> {
  const all = await getAllJobs();
  const idx = all.findIndex(j => j.id === id);
  if (idx === -1) {
    throw new Error('求人が見つかりませんでした。');
  }
  const updatedJob = {
    ...all[idx],
    ...patch,
    id: all[idx].id,
    updatedAt: new Date().toISOString(),
  };
  all[idx] = updatedJob;
  await saveAllJobs(all);
  return updatedJob;
}

/** Delete a job */
export async function deleteJob(id: string): Promise<boolean> {
  const all = await getAllJobs();
  const filtered = all.filter(j => j.id !== id);
  await saveAllJobs(filtered);
  return true;
}

/** Get all job applications */
export async function getAllApplications(): Promise<JobApplication[]> {
  try {
    const record = await prisma.appSecret.findUnique({ where: { id: APPLICATIONS_SECRET_KEY } });
    if (record?.publicKey) {
      const parsed = JSON.parse(record.publicKey);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to load job applications', err);
  }
  return [];
}

/** Save full applications list */
export async function saveAllApplications(apps: JobApplication[]): Promise<JobApplication[]> {
  const json = JSON.stringify(apps);
  await prisma.appSecret.upsert({
    where: { id: APPLICATIONS_SECRET_KEY },
    create: { id: APPLICATIONS_SECRET_KEY, publicKey: json, privateKey: '' },
    update: { publicKey: json },
  });
  return apps;
}

/** Submit a new job application */
export async function submitJobApplication(input: Omit<JobApplication, 'id' | 'status' | 'createdAt'>): Promise<JobApplication> {
  const all = await getAllApplications();
  const newApp: JobApplication = {
    ...input,
    id: 'app_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
    status: 'NEW',
    createdAt: new Date().toISOString(),
  };
  const updated = [newApp, ...all];
  await saveAllApplications(updated);

  // Also create a record in ContactMessage so admin sees it in notification center
  try {
    await prisma.contactMessage.create({
      data: {
        name: `【求人応募】${input.name} (${input.jobTitle || '希望職種指定なし'})`,
        email: input.email,
        phone: input.phone,
        type: 'GENERAL',
        message: `【求人応募】\n希望職種: ${input.jobTitle || '指定なし'}\n希望雇用形態: ${input.desiredEmploymentType || '指定なし'}\nシフト希望: ${input.availability || 'なし'}\n志望動機・PR:\n${input.message || 'なし'}`,
        ip: input.ip ?? null,
      },
    });
  } catch (err) {
    console.warn('Could not mirror job application to contactMessage', err);
  }

  return newApp;
}

/** Update application status */
export async function updateApplicationStatus(id: string, status: JobApplication['status']): Promise<JobApplication> {
  const all = await getAllApplications();
  const idx = all.findIndex(a => a.id === id);
  if (idx === -1) {
    throw new Error('応募者データが見つかりませんでした。');
  }
  all[idx].status = status;
  await saveAllApplications(all);
  return all[idx];
}

/** Delete an application */
export async function deleteApplication(id: string): Promise<boolean> {
  const all = await getAllApplications();
  const filtered = all.filter(a => a.id !== id);
  await saveAllApplications(filtered);
  return true;
}
