import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { toast } from 'react-hot-toast';
import { 
  Briefcase, 
  Users, 
  Plus, 
  Trash2, 
  Edit3, 
  RefreshCw, 
  ExternalLink, 
  Mail, 
  Phone, 
  CheckCircle2, 
  X
} from 'lucide-react';
import { apiFetch, errorMessage } from '../../lib/api';

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
}

const EMPTY_JOB: Omit<JobPosting, 'id' | 'createdAt' | 'updatedAt'> = {
  titleJa: '',
  category: 'HALL',
  employmentType: 'PART_TIME',
  salaryJa: '時給 1,200円〜',
  hoursJa: '10:00〜15:00 / 17:00〜22:00（週2日・1日3時間〜OK）',
  locationJa: '埼玉県熊谷市（熊谷駅徒歩圏内）',
  descriptionJa: '',
  requirementsJa: '未経験歓迎！笑顔で元気にお仕事できる方。',
  benefitsJa: '絶品まかない無料、交通費支給、制服貸与。',
  isActive: true,
  displayOrder: 0,
};

export default function CareersTab() {
  const [subTab, setSubTab] = useState<'JOBS' | 'APPLICATIONS'>('JOBS');
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit/Create Modal State
  const [editingJob, setEditingJob] = useState<JobPosting | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formDraft, setFormDraft] = useState(EMPTY_JOB);
  const [savingJob, setSavingJob] = useState(false);

  // View application details modal
  const [selectedApp, setSelectedApp] = useState<JobApplication | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [jobsRes, appsRes] = await Promise.all([
        apiFetch('/api/v1/jobs/admin/all'),
        apiFetch('/api/v1/jobs/admin/applications'),
      ]);
      if (jobsRes.ok) {
        setJobs(await jobsRes.json());
      }
      if (appsRes.ok) {
        setApplications(await appsRes.json());
      }
    } catch {
      toast.error('データの取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenCreate = () => {
    setFormDraft({ ...EMPTY_JOB, displayOrder: jobs.length + 1 });
    setIsCreating(true);
    setEditingJob(null);
  };

  const handleOpenEdit = (job: JobPosting) => {
    setFormDraft({
      titleJa: job.titleJa,
      category: job.category,
      employmentType: job.employmentType,
      salaryJa: job.salaryJa,
      hoursJa: job.hoursJa,
      locationJa: job.locationJa,
      descriptionJa: job.descriptionJa,
      requirementsJa: job.requirementsJa || '',
      benefitsJa: job.benefitsJa || '',
      isActive: job.isActive,
      displayOrder: job.displayOrder,
    });
    setEditingJob(job);
    setIsCreating(false);
  };

  const handleSaveJob = async (e: FormEvent) => {
    e.preventDefault();
    if (!formDraft.titleJa.trim()) {
      toast.error('職種名を入力してください。');
      return;
    }

    setSavingJob(true);
    try {
      const url = editingJob
        ? `/api/v1/jobs/admin/${editingJob.id}`
        : '/api/v1/jobs/admin';
      const method = editingJob ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formDraft),
      });

      if (res.ok) {
        toast.success(editingJob ? '求人情報を更新しました！' : '新しい求人を作成しました！');
        setEditingJob(null);
        setIsCreating(false);
        loadData();
      } else {
        toast.error(await errorMessage(res, '保存に失敗しました。'));
      }
    } catch {
      toast.error('通信エラーが発生しました。');
    } finally {
      setSavingJob(false);
    }
  };

  const handleToggleJobStatus = async (job: JobPosting) => {
    try {
      const res = await apiFetch(`/api/v1/jobs/admin/${job.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !job.isActive }),
      });
      if (res.ok) {
        toast.success(job.isActive ? '求人を非公開にしました。' : '求人を公開しました！');
        loadData();
      }
    } catch {
      toast.error('ステータスの更新に失敗しました。');
    }
  };

  const handleDeleteJob = async (id: string) => {
    if (!window.confirm('この求人を削除してもよろしいですか？')) return;
    try {
      const res = await apiFetch(`/api/v1/jobs/admin/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('求人を削除しました。');
        loadData();
      }
    } catch {
      toast.error('削除に失敗しました。');
    }
  };

  const handleUpdateAppStatus = async (id: string, status: JobApplication['status']) => {
    try {
      const res = await apiFetch(`/api/v1/jobs/admin/applications/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        toast.success('応募者のステータスを更新しました。');
        loadData();
        if (selectedApp && selectedApp.id === id) {
          setSelectedApp(prev => prev ? { ...prev, status } : null);
        }
      }
    } catch {
      toast.error('更新に失敗しました。');
    }
  };

  const handleDeleteApp = async (id: string) => {
    if (!window.confirm('この応募者データを削除してもよろしいですか？')) return;
    try {
      const res = await apiFetch(`/api/v1/jobs/admin/applications/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('応募データを削除しました。');
        if (selectedApp?.id === id) setSelectedApp(null);
        loadData();
      }
    } catch {
      toast.error('削除に失敗しました。');
    }
  };

  const newApplicationsCount = applications.filter(a => a.status === 'NEW').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Top Banner Card */}
      <section style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={iconBadge}>
                <Briefcase size={22} color="#fff" />
              </div>
              <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#111827' }}>
                採用管理・求人情報 (Careers Management)
              </h2>
            </div>
            <p style={{ margin: '0.4rem 0 0', color: '#6b7280', fontSize: '0.875rem', lineHeight: 1.5 }}>
              ウェブサイトの「採用情報」ページに掲載する求人票の作成・編集、およびWebから届いた応募者の選考管理を行えます。
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <a
              href="/careers"
              target="_blank"
              rel="noopener noreferrer"
              style={secondaryButton}
            >
              <ExternalLink size={15} /> 公開採用ページを確認 ↗
            </a>
            {subTab === 'JOBS' && (
              <button
                type="button"
                onClick={handleOpenCreate}
                style={primaryButton}
              >
                <Plus size={16} /> 新規求人を作成
              </button>
            )}
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '1.5rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '0.75rem' }}>
          <button
            type="button"
            onClick={() => setSubTab('JOBS')}
            style={{
              ...tabBtnStyle,
              borderBottom: subTab === 'JOBS' ? '2.5px solid #d97706' : '2.5px solid transparent',
              color: subTab === 'JOBS' ? '#d97706' : '#6b7280',
              fontWeight: subTab === 'JOBS' ? 800 : 600,
            }}
          >
            <Briefcase size={16} /> 求人票の管理 ({jobs.length}件)
          </button>
          <button
            type="button"
            onClick={() => setSubTab('APPLICATIONS')}
            style={{
              ...tabBtnStyle,
              borderBottom: subTab === 'APPLICATIONS' ? '2.5px solid #d97706' : '2.5px solid transparent',
              color: subTab === 'APPLICATIONS' ? '#d97706' : '#6b7280',
              fontWeight: subTab === 'APPLICATIONS' ? 800 : 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Users size={16} /> 応募者一覧 ({applications.length}名)
            {newApplicationsCount > 0 && (
              <span style={{
                backgroundColor: '#ef4444',
                color: '#fff',
                fontSize: '0.72rem',
                fontWeight: 800,
                padding: '1px 6px',
                borderRadius: '9999px',
              }}>
                新着 {newApplicationsCount}
              </span>
            )}
          </button>
        </div>
      </section>

      {/* SUBTAB 1: Job Postings List */}
      {subTab === 'JOBS' && (
        <section style={panelStyle}>
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
              <RefreshCw size={20} className="animate-spin" style={{ display: 'inline', marginRight: '6px' }} />
              求人情報を読み込み中…
            </div>
          ) : jobs.length === 0 ? (
            <div style={{ padding: '3rem 1rem', textAlign: 'center', color: '#9ca3af' }}>
              求人はまだ作成されていません。「新規求人を作成」ボタンから追加してください。
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {jobs.map(job => (
                <div
                  key={job.id}
                  style={{
                    backgroundColor: '#fff',
                    borderRadius: '12px',
                    border: '1px solid #e5e7eb',
                    padding: '16px 20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '16px',
                    flexWrap: 'wrap',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: '260px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        backgroundColor: job.isActive ? '#ecfdf5' : '#f3f4f6',
                        color: job.isActive ? '#047857' : '#6b7280',
                        border: `1px solid ${job.isActive ? '#a7f3d0' : '#e5e7eb'}`,
                      }}>
                        {job.isActive ? '● 公開中' : '○ 非公開'}
                      </span>
                      <span style={{
                        backgroundColor: '#fef3c7',
                        color: '#92400e',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                      }}>
                        {job.category === 'KITCHEN' ? 'キッチン' : job.category === 'HALL' ? 'ホール' : job.category === 'DELIVERY' ? 'デリバリー' : 'その他'}
                      </span>
                      <span style={{
                        backgroundColor: '#f3f4f6',
                        color: '#374151',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                      }}>
                        {job.employmentType === 'FULL_TIME' ? '正社員' : job.employmentType === 'PART_TIME' ? 'アルバイト・パート' : '契約社員'}
                      </span>
                    </div>

                    <h3 style={{ margin: '0 0 4px', fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>
                      {job.titleJa}
                    </h3>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '0.82rem', color: '#6b7280' }}>
                      <span>給与: <strong>{job.salaryJa}</strong></span>
                      <span>時間: {job.hoursJa}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => handleToggleJobStatus(job)}
                      style={{
                        ...secondaryButton,
                        padding: '6px 12px',
                        fontSize: '0.8rem',
                        color: job.isActive ? '#6b7280' : '#059669',
                      }}
                    >
                      {job.isActive ? '非公開にする' : '公開する'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(job)}
                      style={{ ...secondaryButton, padding: '6px 12px', fontSize: '0.8rem' }}
                    >
                      <Edit3 size={14} /> 編集
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteJob(job.id)}
                      style={{ ...secondaryButton, padding: '6px 10px', color: '#ef4444', borderColor: '#fca5a5' }}
                      title="求人を削除"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* SUBTAB 2: Job Applications List */}
      {subTab === 'APPLICATIONS' && (
        <section style={panelStyle}>
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
              <RefreshCw size={20} className="animate-spin" style={{ display: 'inline', marginRight: '6px' }} />
              応募者データを読み込み中…
            </div>
          ) : applications.length === 0 ? (
            <div style={{ padding: '3rem 1rem', textAlign: 'center', color: '#9ca3af' }}>
              まだ求人への応募はありません。ウェブサイトの「採用情報」から応募があるとここに一覧表示されます。
            </div>
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '10px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb', color: '#4b5563', textAlign: 'left', borderBottom: '1.5px solid #e5e7eb' }}>
                    <th style={thStyle}>応募日時</th>
                    <th style={thStyle}>お名前 / 連絡先</th>
                    <th style={thStyle}>希望職種</th>
                    <th style={thStyle}>希望雇用形態</th>
                    <th style={thStyle}>選考ステータス</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>操作・詳細</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map(app => (
                    <tr key={app.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={tdStyle}>
                        <div style={{ color: '#4b5563', fontSize: '0.8rem' }}>
                          {new Date(app.createdAt).toLocaleDateString('ja-JP')}
                        </div>
                        <div style={{ color: '#9ca3af', fontSize: '0.72rem' }}>
                          {new Date(app.createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>

                      <td style={tdStyle}>
                        <div style={{ fontWeight: 700, color: '#111827' }}>
                          {app.name} {app.nameKana && <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 400 }}>({app.nameKana})</span>}
                        </div>
                        <div style={{ display: 'flex', gap: '10px', fontSize: '0.78rem', color: '#4b5563', marginTop: '2px' }}>
                          <a href={`tel:${app.phone}`} style={{ color: '#d97706', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            <Phone size={12} /> {app.phone}
                          </a>
                          <a href={`mailto:${app.email}`} style={{ color: '#2563eb', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            <Mail size={12} /> {app.email}
                          </a>
                        </div>
                      </td>

                      <td style={tdStyle}>
                        <span style={{ fontWeight: 600, color: '#1f2937' }}>
                          {app.jobTitle || '職種指定なし'}
                        </span>
                      </td>

                      <td style={tdStyle}>
                        <span style={{ fontSize: '0.8rem', color: '#4b5563' }}>
                          {app.desiredEmploymentType === 'FULL_TIME' ? '正社員' : app.desiredEmploymentType === 'PART_TIME' ? 'アルバイト・パート' : (app.desiredEmploymentType || '指定なし')}
                        </span>
                      </td>

                      <td style={tdStyle}>
                        <select
                          value={app.status}
                          onChange={e => handleUpdateAppStatus(app.id, e.target.value as JobApplication['status'])}
                          style={{
                            ...selectStyle,
                            fontWeight: 700,
                            padding: '4px 8px',
                            borderRadius: '6px',
                            backgroundColor: app.status === 'NEW' ? '#fef2f2' : app.status === 'CONTACTED' ? '#eff6ff' : app.status === 'HIRED' ? '#ecfdf5' : '#f9fafb',
                            color: app.status === 'NEW' ? '#dc2626' : app.status === 'CONTACTED' ? '#1d4ed8' : app.status === 'HIRED' ? '#047857' : '#4b5563',
                            border: `1px solid ${app.status === 'NEW' ? '#fecaca' : app.status === 'CONTACTED' ? '#bfdbfe' : app.status === 'HIRED' ? '#a7f3d0' : '#e5e7eb'}`,
                          }}
                        >
                          <option value="NEW">🔴 新着 (NEW)</option>
                          <option value="REVIEWING">🟡 書類選考中</option>
                          <option value="CONTACTED">🔵 面接調整・連絡済</option>
                          <option value="HIRED">🟢 採用決定！</option>
                          <option value="REJECTED">⚪ 不採用 / 終了</option>
                        </select>
                      </td>

                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => setSelectedApp(app)}
                            style={{ ...secondaryButton, padding: '4px 10px', fontSize: '0.78rem' }}
                          >
                            詳細を見る
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteApp(app.id)}
                            style={{ ...secondaryButton, padding: '4px 8px', color: '#ef4444', borderColor: '#fca5a5' }}
                            title="応募データを削除"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Modal: Create or Edit Job Posting */}
      {(isCreating || editingJob) && (
        <div style={modalOverlayStyle} onClick={e => e.target === e.currentTarget && (setIsCreating(false), setEditingJob(null))}>
          <div style={modalContentStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#111827' }}>
                {editingJob ? '求人票の編集' : '新規求人票の作成'}
              </h3>
              <button
                type="button"
                onClick={() => { setIsCreating(false); setEditingJob(null); }}
                style={closeBtnStyle}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveJob} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>職種名 (タイトル) *</label>
                <input
                  type="text"
                  value={formDraft.titleJa}
                  onChange={e => setFormDraft({ ...formDraft, titleJa: e.target.value })}
                  placeholder="例: ホール・接客サービススタッフ"
                  style={inputStyle}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>カテゴリー</label>
                  <select
                    value={formDraft.category}
                    onChange={e => setFormDraft({ ...formDraft, category: e.target.value as JobPosting['category'] })}
                    style={selectStyle}
                  >
                    <option value="HALL">ホール・接客</option>
                    <option value="KITCHEN">キッチン・調理</option>
                    <option value="DELIVERY">デリバリー・配達</option>
                    <option value="OTHER">その他</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>雇用形態</label>
                  <select
                    value={formDraft.employmentType}
                    onChange={e => setFormDraft({ ...formDraft, employmentType: e.target.value as JobPosting['employmentType'] })}
                    style={selectStyle}
                  >
                    <option value="PART_TIME">アルバイト・パート</option>
                    <option value="FULL_TIME">正社員</option>
                    <option value="CONTRACT">契約社員</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>給与 *</label>
                  <input
                    type="text"
                    value={formDraft.salaryJa}
                    onChange={e => setFormDraft({ ...formDraft, salaryJa: e.target.value })}
                    placeholder="例: 時給 1,200円〜1,500円"
                    style={inputStyle}
                    required
                  />
                </div>

                <div>
                  <label style={labelStyle}>勤務地 *</label>
                  <input
                    type="text"
                    value={formDraft.locationJa}
                    onChange={e => setFormDraft({ ...formDraft, locationJa: e.target.value })}
                    placeholder="例: 埼玉県熊谷市（熊谷駅徒歩圏内）"
                    style={inputStyle}
                    required
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>勤務時間 *</label>
                <input
                  type="text"
                  value={formDraft.hoursJa}
                  onChange={e => setFormDraft({ ...formDraft, hoursJa: e.target.value })}
                  placeholder="例: 10:00〜15:00 / 17:00〜22:00（週2日・1日3時間〜OK）"
                  style={inputStyle}
                  required
                />
              </div>

              <div>
                <label style={labelStyle}>仕事内容 *</label>
                <textarea
                  rows={3}
                  value={formDraft.descriptionJa}
                  onChange={e => setFormDraft({ ...formDraft, descriptionJa: e.target.value })}
                  placeholder="仕事内容の詳細を記入してください。"
                  style={{ ...inputStyle, resize: 'vertical' }}
                  required
                />
              </div>

              <div>
                <label style={labelStyle}>求める人物像・応募資格</label>
                <input
                  type="text"
                  value={formDraft.requirementsJa || ''}
                  onChange={e => setFormDraft({ ...formDraft, requirementsJa: e.target.value })}
                  placeholder="例: 未経験歓迎！笑顔で元気にお客様と接することができる方。"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>待遇・福利厚生</label>
                <input
                  type="text"
                  value={formDraft.benefitsJa || ''}
                  onChange={e => setFormDraft({ ...formDraft, benefitsJa: e.target.value })}
                  placeholder="例: 絶品まかない無料、交通費支給、制服貸与、昇給あり。"
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>
                  <input
                    type="checkbox"
                    checked={formDraft.isActive}
                    onChange={e => setFormDraft({ ...formDraft, isActive: e.target.checked })}
                    style={{ width: '18px', height: '18px', accentColor: '#059669' }}
                  />
                  求人を公開する（ウェブサイトに表示）
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '1rem', borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => { setIsCreating(false); setEditingJob(null); }}
                  style={secondaryButton}
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={savingJob}
                  style={{ ...primaryButton, opacity: savingJob ? 0.7 : 1 }}
                >
                  {savingJob ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  求人情報を保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: View Applicant Details */}
      {selectedApp && (
        <div style={modalOverlayStyle} onClick={e => e.target === e.currentTarget && setSelectedApp(null)}>
          <div style={{ ...modalContentStyle, maxWidth: '580px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '0.75rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#111827' }}>
                  応募者詳細: {selectedApp.name} 様
                </h3>
                <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                  応募日時: {new Date(selectedApp.createdAt).toLocaleString('ja-JP')}
                </span>
              </div>
              <button type="button" onClick={() => setSelectedApp(null)} style={closeBtnStyle}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.9rem' }}>
              <div style={detailRowStyle}>
                <span style={detailLabelStyle}>フリガナ:</span>
                <span>{selectedApp.nameKana || '未入力'}</span>
              </div>
              <div style={detailRowStyle}>
                <span style={detailLabelStyle}>電話番号:</span>
                <strong><a href={`tel:${selectedApp.phone}`} style={{ color: '#d97706' }}>{selectedApp.phone}</a></strong>
              </div>
              <div style={detailRowStyle}>
                <span style={detailLabelStyle}>メールアドレス:</span>
                <a href={`mailto:${selectedApp.email}`} style={{ color: '#2563eb' }}>{selectedApp.email}</a>
              </div>
              <div style={detailRowStyle}>
                <span style={detailLabelStyle}>応募職種:</span>
                <strong>{selectedApp.jobTitle || '職種指定なし'}</strong>
              </div>
              <div style={detailRowStyle}>
                <span style={detailLabelStyle}>希望雇用形態:</span>
                <span>{selectedApp.desiredEmploymentType || '指定なし'}</span>
              </div>
              <div style={detailRowStyle}>
                <span style={detailLabelStyle}>シフト・勤務希望:</span>
                <span>{selectedApp.availability || 'なし'}</span>
              </div>
              <div style={{ marginTop: '8px' }}>
                <span style={{ ...detailLabelStyle, display: 'block', marginBottom: '4px' }}>志望動機・自己PR・メッセージ:</span>
                <div style={{
                  backgroundColor: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  whiteSpace: 'pre-line',
                  lineHeight: 1.6,
                  color: '#374151',
                }}>
                  {selectedApp.message || '（記入なし）'}
                </div>
              </div>

              <div style={{ marginTop: '1rem', borderTop: '1px solid #e5e7eb', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>選考ステータス:</span>
                  <select
                    value={selectedApp.status}
                    onChange={e => handleUpdateAppStatus(selectedApp.id, e.target.value as JobApplication['status'])}
                    style={selectStyle}
                  >
                    <option value="NEW">🔴 新着 (NEW)</option>
                    <option value="REVIEWING">🟡 書類選考中</option>
                    <option value="CONTACTED">🔵 面接調整・連絡済</option>
                    <option value="HIRED">🟢 採用決定！</option>
                    <option value="REJECTED">⚪ 不採用 / 終了</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <a
                    href={`tel:${selectedApp.phone}`}
                    style={{ ...primaryButton, padding: '6px 12px', fontSize: '0.85rem', textDecoration: 'none' }}
                  >
                    <Phone size={14} /> 電話をかける
                  </a>
                  <a
                    href={`mailto:${selectedApp.email}?subject=${encodeURIComponent('【アダルサ】求人へのご応募ありがとうございます')}`}
                    style={{ ...secondaryButton, padding: '6px 12px', fontSize: '0.85rem', textDecoration: 'none' }}
                  >
                    <Mail size={14} /> メール送信
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

const panelStyle: CSSProperties = {
  backgroundColor: '#fff',
  borderRadius: '12px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  border: '1px solid #e5e7eb',
  padding: '1.5rem',
};

const iconBadge: CSSProperties = {
  width: '36px',
  height: '36px',
  borderRadius: '8px',
  backgroundColor: '#d97706',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const primaryButton: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  backgroundColor: '#d97706',
  color: '#fff',
  border: 'none',
  padding: '8px 16px',
  borderRadius: '8px',
  fontWeight: 600,
  fontSize: '0.875rem',
  cursor: 'pointer',
};

const secondaryButton: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  backgroundColor: '#fff',
  color: '#374151',
  border: '1px solid #d1d5db',
  padding: '8px 14px',
  borderRadius: '8px',
  fontWeight: 600,
  fontSize: '0.875rem',
  cursor: 'pointer',
  textDecoration: 'none',
};

const tabBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: '8px 14px',
  fontSize: '0.92rem',
  cursor: 'pointer',
  transition: 'color 0.15s ease',
};

const thStyle: CSSProperties = {
  padding: '10px 12px',
  fontWeight: 600,
  fontSize: '0.82rem',
};

const tdStyle: CSSProperties = {
  padding: '12px',
  verticalAlign: 'middle',
};

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: '0.84rem',
  fontWeight: 700,
  color: '#374151',
  marginBottom: '4px',
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '6px',
  border: '1px solid #d1d5db',
  fontSize: '0.9rem',
  boxSizing: 'border-box',
  outline: 'none',
  backgroundColor: '#fff',
};

const selectStyle: CSSProperties = {
  padding: '8px 10px',
  borderRadius: '6px',
  border: '1px solid #d1d5db',
  fontSize: '0.88rem',
  backgroundColor: '#fff',
  outline: 'none',
  cursor: 'pointer',
  width: '100%',
  boxSizing: 'border-box',
};

const modalOverlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '20px',
};

const modalContentStyle: CSSProperties = {
  backgroundColor: '#fff',
  borderRadius: '16px',
  padding: '1.75rem',
  width: '100%',
  maxWidth: '680px',
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
};

const closeBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: '#6b7280',
  padding: '4px',
};

const detailRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
};

const detailLabelStyle: CSSProperties = {
  fontWeight: 700,
  color: '#4b5563',
  width: '140px',
  flexShrink: 0,
};
