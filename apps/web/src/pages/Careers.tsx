import { useState, useEffect, useRef, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { 
  Briefcase, 
  MapPin, 
  Clock, 
  Coins, 
  CheckCircle2, 
  Utensils, 
  Heart, 
  ArrowRight, 
  Send, 
  RefreshCw, 
  Globe
} from 'lucide-react';
import { apiFetch, errorMessage } from '../lib/api';

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
}

export default function Careers() {
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Application form state
  const formRef = useRef<HTMLDivElement | null>(null);
  const [formData, setFormData] = useState({
    jobId: '',
    jobTitle: '',
    name: '',
    nameKana: '',
    email: '',
    phone: '',
    desiredEmploymentType: 'PART_TIME',
    availability: '',
    message: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    apiFetch('/api/v1/jobs')
      .then(res => (res.ok ? res.json() : []))
      .then(data => {
        setJobs(data);
        if (data.length > 0) {
          setFormData(prev => ({
            ...prev,
            jobId: data[0].id,
            jobTitle: data[0].titleJa,
          }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSelectJobForApply = (job: JobPosting) => {
    setFormData(prev => ({
      ...prev,
      jobId: job.id,
      jobTitle: job.titleJa,
      desiredEmploymentType: job.employmentType,
    }));
    setSubmitted(false);
    if (formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleSubmitApplication = async (e: FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim() || !formData.phone.trim()) {
      toast.error('お名前、メールアドレス、電話番号を入力してください。');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch('/api/v1/jobs/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setSubmitted(true);
        toast.success('応募を受け付けました！担当者よりご連絡いたします。');
      } else {
        toast.error(await errorMessage(res, '応募の送信に失敗しました。'));
      }
    } catch {
      toast.error('通信エラーが発生しました。お電話でもご応募いただけます。');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredJobs = jobs.filter(j => {
    if (selectedCategory === 'ALL') return true;
    return j.category === selectedCategory;
  });

  return (
    <main style={{ backgroundColor: '#faf7f2', minHeight: '100vh', color: '#1f2937' }}>
      <title>採用情報・求人募集 (Careers) | Adarsha (アダルサ) 熊谷</title>
      <meta name="description" content="本格インド料理アダルサの求人・採用情報です。ホール、キッチン（カレーシェフ）、デリバリースタッフを募集中。絶品まかない無料、ビザサポートあり！" />
      <link rel="canonical" href="https://pnglike.com/careers" />
      <meta property="og:title" content="採用情報・求人募集 (Careers) | Adarsha (アダルサ) 熊谷" />
      <meta property="og:description" content="本格インド料理アダルサの求人・採用情報です。ホール、キッチン、デリバリースタッフ募集中。" />
      <meta property="og:type" content="website" />
      <meta property="og:url" content="https://pnglike.com/careers" />
      <meta property="og:image" content="https://pnglike.com/bg-hero-img.webp" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="採用情報・求人募集 | Adarsha (アダルサ)" />
      <meta name="twitter:description" content="本格インド料理アダルサの求人・採用情報です。" />
      <meta name="twitter:image" content="https://pnglike.com/bg-hero-img.webp" />

      {/* Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            'itemListElement': [
              {
                '@type': 'ListItem',
                'position': 1,
                'name': 'ホーム',
                'item': 'https://pnglike.com/'
              },
              {
                '@type': 'ListItem',
                'position': 2,
                'name': '採用情報',
                'item': 'https://pnglike.com/careers'
              }
            ]
          })
        }}
      />

      {/* Hero Section */}
      <div style={{
        background: 'linear-gradient(135deg, #1f2937 0%, #311042 50%, #451a03 100%)',
        color: '#fff',
        padding: 'clamp(3.5rem, 7vw, 5.5rem) 20px',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at 75% 25%, rgba(217, 119, 6, 0.25), transparent 50%), radial-gradient(circle at 20% 80%, rgba(236, 72, 153, 0.15), transparent 45%)',
          pointerEvents: 'none',
        }} />

        <div style={{ maxWidth: '820px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: 'rgba(251, 191, 36, 0.2)',
            color: '#fbbf24',
            border: '1px solid rgba(251, 191, 36, 0.35)',
            borderRadius: '9999px',
            padding: '4px 16px',
            fontSize: '0.85rem',
            fontWeight: 800,
            marginBottom: '1rem',
          }}>
            <Briefcase size={15} /> WE ARE HIRING !
          </div>

          <h1 style={{
            fontSize: 'clamp(2rem, 5vw, 3rem)',
            fontWeight: 900,
            lineHeight: 1.2,
            letterSpacing: '-0.5px',
            margin: '0 0 1rem',
          }}>
            スパイス香るアダルサで、<br />
            <span style={{ color: '#fbbf24' }}>私たちと一緒に働きませんか？</span>
          </h1>

          <p style={{ fontSize: 'clamp(0.95rem, 2vw, 1.1rem)', color: '#fde68a', margin: '0 auto 1.5rem', maxWidth: '650px', lineHeight: 1.6 }}>
            本格インド料理をお届けするアットホームなレストランです。<br />
            未経験の方も大歓迎！美味しいまかないと温かい仲間があなたを待っています。
          </p>

          <button
            type="button"
            onClick={() => formRef.current?.scrollIntoView({ behavior: 'smooth' })}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: '#d97706',
              color: '#fff',
              border: 'none',
              padding: '12px 28px',
              borderRadius: '9999px',
              fontSize: '1rem',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(217, 119, 6, 0.4)',
              transition: 'transform 0.15s ease',
            }}
          >
            今すぐ求人に応募する <ArrowRight size={18} />
          </button>
        </div>
      </div>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: 'clamp(2.5rem, 5vw, 4.5rem) 20px' }}>

        {/* Benefits Highlights Section */}
        <div style={{ marginBottom: '3.5rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <span style={{ color: '#d97706', fontWeight: 800, fontSize: '0.85rem', letterSpacing: '1px' }}>
              CALTURE & BENEFITS
            </span>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#111827', margin: '0.35rem 0 0' }}>
              アダルサで働く5つの魅力
            </h2>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '16px',
          }}>
            <BenefitCard
              icon={<Utensils size={24} color="#d97706" />}
              title="絶品まかない無料"
              desc="シフトの日は本場シェフが作る出来立ての本格カレー＆焼き立てナンが無料で食べられます！"
            />
            <BenefitCard
              icon={<Clock size={24} color="#2563eb" />}
              title="柔軟なシフト制"
              desc="週2日・1日3時間から勤務OK！学業や家事、Wワークと無理なく両立できます。"
            />
            <BenefitCard
              icon={<Globe size={24} color="#7c3aed" />}
              title="国際的な環境 & ビザ支援"
              desc="インド出身のシェフたちと楽しく交流。技能ビザや特定技能などのビザサポートも万全です。"
            />
            <BenefitCard
              icon={<Heart size={24} color="#e11d48" />}
              title="未経験でも安心サポート"
              desc="先輩スタッフが丁寧にフォローします。接客や調理が初めての方もすぐ馴染めます。"
            />
            <BenefitCard
              icon={<Coins size={24} color="#059669" />}
              title="交通費支給 & 昇給制度"
              desc="交通費支給、制服貸与、車・バイク・自転車通勤もOK！頑張りに応じて随時昇給あり。"
            />
          </div>
        </div>

        {/* Job Openings Section */}
        <div style={{ marginBottom: '4rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
            <div>
              <span style={{ color: '#d97706', fontWeight: 800, fontSize: '0.85rem', letterSpacing: '1px' }}>
                JOB OPENINGS
              </span>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#111827', margin: '0.25rem 0 0' }}>
                現在募集中の職種 ({filteredJobs.length}件)
              </h2>
            </div>

            {/* Category Filter */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[
                { id: 'ALL', label: 'すべて' },
                { id: 'HALL', label: 'ホール・接客' },
                { id: 'KITCHEN', label: 'キッチン・調理' },
                { id: 'DELIVERY', label: 'デリバリー・配達' },
              ].map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '9999px',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: selectedCategory === cat.id ? '#d97706' : '#fff',
                    color: selectedCategory === cat.id ? '#fff' : '#4b5563',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
              <RefreshCw size={24} className="animate-spin" style={{ display: 'inline', marginRight: '8px' }} />
              求人情報を読み込み中…
            </div>
          ) : filteredJobs.length === 0 ? (
            <div style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              padding: '3rem 2rem',
              textAlign: 'center',
              border: '1px solid #e5e7eb',
              color: '#6b7280',
            }}>
              現在このカテゴリーでの募集はございません。お気軽にお問い合わせください。
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {filteredJobs.map(job => (
                <div
                  key={job.id}
                  style={{
                    backgroundColor: '#fff',
                    borderRadius: '16px',
                    padding: 'clamp(1.5rem, 3vw, 2rem)',
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '1rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <span style={{
                          backgroundColor: job.category === 'KITCHEN' ? '#fef3c7' : job.category === 'HALL' ? '#e0e7ff' : '#ecfdf5',
                          color: job.category === 'KITCHEN' ? '#b45309' : job.category === 'HALL' ? '#3730a3' : '#047857',
                          padding: '3px 10px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 800,
                        }}>
                          {job.category === 'KITCHEN' ? '🍳 キッチン' : job.category === 'HALL' ? '☕ ホール' : job.category === 'DELIVERY' ? '🛵 デリバリー' : 'その他'}
                        </span>
                        <span style={{
                          backgroundColor: '#f3f4f6',
                          color: '#374151',
                          padding: '3px 10px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                        }}>
                          {job.employmentType === 'FULL_TIME' ? '正社員' : job.employmentType === 'PART_TIME' ? 'アルバイト・パート' : '契約社員'}
                        </span>
                      </div>

                      <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#111827' }}>
                        {job.titleJa}
                      </h3>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSelectJobForApply(job)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        backgroundColor: '#d97706',
                        color: '#fff',
                        border: 'none',
                        padding: '8px 18px',
                        borderRadius: '8px',
                        fontWeight: 700,
                        fontSize: '0.88rem',
                        cursor: 'pointer',
                        transition: 'opacity 0.15s ease',
                      }}
                    >
                      この職種に応募する <ArrowRight size={15} />
                    </button>
                  </div>

                  {/* Job Specs Grid */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '10px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    marginBottom: '1rem',
                  }}>
                    <div style={specItemStyle}>
                      <Coins size={16} color="#d97706" />
                      <div>
                        <span style={{ fontSize: '0.72rem', color: '#6b7280', display: 'block' }}>給与</span>
                        <strong style={{ fontSize: '0.9rem', color: '#111827' }}>{job.salaryJa}</strong>
                      </div>
                    </div>
                    <div style={specItemStyle}>
                      <Clock size={16} color="#2563eb" />
                      <div>
                        <span style={{ fontSize: '0.72rem', color: '#6b7280', display: 'block' }}>勤務時間</span>
                        <span style={{ fontSize: '0.85rem', color: '#111827', fontWeight: 600 }}>{job.hoursJa}</span>
                      </div>
                    </div>
                    <div style={specItemStyle}>
                      <MapPin size={16} color="#059669" />
                      <div>
                        <span style={{ fontSize: '0.72rem', color: '#6b7280', display: 'block' }}>勤務地</span>
                        <span style={{ fontSize: '0.85rem', color: '#111827', fontWeight: 600 }}>{job.locationJa}</span>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <div style={{ fontSize: '0.9rem', lineHeight: 1.7, color: '#374151', marginBottom: '0.75rem' }}>
                    {job.descriptionJa}
                  </div>

                  {/* Requirements & Benefits */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', marginTop: '0.75rem' }}>
                    {job.requirementsJa && (
                      <div style={{ fontSize: '0.82rem', color: '#4b5563', lineHeight: 1.6 }}>
                        <strong style={{ color: '#1f2937' }}>【求める人物像・資格】:</strong> {job.requirementsJa}
                      </div>
                    )}
                    {job.benefitsJa && (
                      <div style={{ fontSize: '0.82rem', color: '#4b5563', lineHeight: 1.6 }}>
                        <strong style={{ color: '#1f2937' }}>【待遇・福利厚生】:</strong> {job.benefitsJa}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Dynamic Job Application Form Section */}
        <div ref={formRef} style={{ scrollMarginTop: '2rem' }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '20px',
            padding: 'clamp(2rem, 5vw, 3rem)',
            boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
            border: '1.5px solid #fde68a',
            position: 'relative',
          }}>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#ecfdf5',
                color: '#047857',
                padding: '4px 14px',
                borderRadius: '9999px',
                fontSize: '0.8rem',
                fontWeight: 800,
                marginBottom: '0.5rem',
              }}>
                <Send size={14} /> ENTRY FORM
              </div>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#111827', margin: 0 }}>
                求人応募フォーム
              </h2>
              <p style={{ color: '#6b7280', fontSize: '0.88rem', margin: '0.5rem 0 0' }}>
                ご応募内容を確認の上、採用担当者より3営業日以内にお電話またはメールにてご連絡いたします。
              </p>
            </div>

            {submitted ? (
              <div style={{
                textAlign: 'center',
                padding: '3rem 1.5rem',
                backgroundColor: '#ecfdf5',
                borderRadius: '14px',
                border: '1.5px solid #a7f3d0',
              }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  backgroundColor: '#059669',
                  color: '#fff',
                  display: 'grid',
                  placeItems: 'center',
                  margin: '0 auto 1rem',
                }}>
                  <CheckCircle2 size={36} />
                </div>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#065f46', margin: '0 0 0.5rem' }}>
                  ご応募ありがとうございます！
                </h3>
                <p style={{ color: '#047857', fontSize: '0.95rem', lineHeight: 1.6, maxWidth: '500px', margin: '0 auto 1.5rem' }}>
                  応募内容を受け付けました。採用担当者より書類確認の上、ご連絡いたします。
                </p>
                <button
                  type="button"
                  onClick={() => setSubmitted(false)}
                  style={{
                    padding: '8px 20px',
                    borderRadius: '8px',
                    backgroundColor: '#fff',
                    border: '1px solid #a7f3d0',
                    color: '#065f46',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  別の応募内容を入力する
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmitApplication} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                
                {/* Desired Position */}
                <div>
                  <label style={labelStyle}>
                    希望職種 <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    value={formData.jobId}
                    onChange={e => {
                      const selected = jobs.find(j => j.id === e.target.value);
                      setFormData(prev => ({
                        ...prev,
                        jobId: e.target.value,
                        jobTitle: selected ? selected.titleJa : '',
                        desiredEmploymentType: selected ? selected.employmentType : prev.desiredEmploymentType,
                      }));
                    }}
                    style={inputStyle}
                    required
                  >
                    <option value="">希望職種を選択してください</option>
                    {jobs.map(j => (
                      <option key={j.id} value={j.id}>{j.titleJa}</option>
                    ))}
                    <option value="other">その他の職種・相談して決めたい</option>
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
                  {/* Name */}
                  <div>
                    <label style={labelStyle}>
                      お名前 <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      placeholder="例: 山田 太郎"
                      style={inputStyle}
                      required
                    />
                  </div>

                  {/* Furigana */}
                  <div>
                    <label style={labelStyle}>フリガナ</label>
                    <input
                      type="text"
                      value={formData.nameKana}
                      onChange={e => setFormData({ ...formData, nameKana: e.target.value })}
                      placeholder="例: ヤマダ タロウ"
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
                  {/* Phone */}
                  <div>
                    <label style={labelStyle}>
                      電話番号 <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={e => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="例: 090-1234-5678"
                      style={inputStyle}
                      required
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <label style={labelStyle}>
                      メールアドレス <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                      placeholder="例: yamada@example.com"
                      style={inputStyle}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
                  {/* Desired Type */}
                  <div>
                    <label style={labelStyle}>希望雇用形態</label>
                    <select
                      value={formData.desiredEmploymentType}
                      onChange={e => setFormData({ ...formData, desiredEmploymentType: e.target.value })}
                      style={inputStyle}
                    >
                      <option value="PART_TIME">アルバイト・パート</option>
                      <option value="FULL_TIME">正社員</option>
                      <option value="CONTRACT">契約社員</option>
                    </select>
                  </div>

                  {/* Availability */}
                  <div>
                    <label style={labelStyle}>勤務希望（曜日・時間帯・開始時期など）</label>
                    <input
                      type="text"
                      value={formData.availability}
                      onChange={e => setFormData({ ...formData, availability: e.target.value })}
                      placeholder="例: 週3日（火・木・土のディナー希望）"
                      style={inputStyle}
                    />
                  </div>
                </div>

                {/* Self PR / Message */}
                <div>
                  <label style={labelStyle}>志望動機・自己PR・飲食経験・ご質問</label>
                  <textarea
                    rows={4}
                    value={formData.message}
                    onChange={e => setFormData({ ...formData, message: e.target.value })}
                    placeholder="カレーやスパイスが好き、接客経験がある、短時間で働きたいなど、自由にご記入ください。"
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>

                {/* Privacy note */}
                <div style={{ fontSize: '0.8rem', color: '#6b7280', lineHeight: 1.5 }}>
                  ※ ご入力いただいた個人情報は採用選考および応募者様へのご連絡の目的のみに利用いたします。
                  詳しくは当店の <Link to="/privacy-policy" target="_blank" style={{ color: '#b45309', textDecoration: 'underline' }}>プライバシーポリシー</Link> をご確認ください。
                </div>

                {/* Submit button */}
                <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      backgroundColor: '#d97706',
                      color: '#fff',
                      border: 'none',
                      padding: '14px 40px',
                      borderRadius: '9999px',
                      fontSize: '1.05rem',
                      fontWeight: 800,
                      cursor: submitting ? 'not-allowed' : 'pointer',
                      opacity: submitting ? 0.7 : 1,
                      boxShadow: '0 4px 16px rgba(217, 119, 6, 0.35)',
                      transition: 'transform 0.15s ease',
                    }}
                  >
                    {submitting ? (
                      <>
                        <RefreshCw size={18} className="animate-spin" /> 送信中…
                      </>
                    ) : (
                      <>
                        <Send size={18} /> 応募内容を送信する
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

      </div>
    </main>
  );
}

function BenefitCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div style={{
      backgroundColor: '#fff',
      borderRadius: '14px',
      padding: '20px',
      border: '1px solid #e5e7eb',
      boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
    }}>
      <div style={{
        width: '48px',
        height: '48px',
        borderRadius: '12px',
        backgroundColor: '#faf7f2',
        display: 'grid',
        placeItems: 'center',
        marginBottom: '12px',
      }}>
        {icon}
      </div>
      <h3 style={{ margin: '0 0 6px', fontSize: '1.05rem', fontWeight: 800, color: '#111827' }}>
        {title}
      </h3>
      <p style={{ margin: 0, fontSize: '0.84rem', color: '#6b7280', lineHeight: 1.6 }}>
        {desc}
      </p>
    </div>
  );
}

const labelStyle = {
  display: 'block',
  fontSize: '0.86rem',
  fontWeight: 700,
  color: '#374151',
  marginBottom: '6px',
};

const inputStyle = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: '8px',
  border: '1px solid #d1d5db',
  fontSize: '0.92rem',
  boxSizing: 'border-box' as const,
  backgroundColor: '#fff',
  outline: 'none',
  color: '#111827',
};

const specItemStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
};
