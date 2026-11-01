import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <main className="section centered" style={{ minHeight: '50vh' }}>
      <title>ページが見つかりません | Adarsha</title>
      <meta name="robots" content="noindex" />
      <h1 className="section-title">ページが見つかりません</h1>
      <p className="section-sub">お探しのページは移動または削除された可能性があります。</p>
      <Link to="/" className="btn-warm" style={{ display: 'inline-block', marginTop: '1.5rem', textDecoration: 'none' }}>
        ホームへ戻る
      </Link>
    </main>
  );
}
