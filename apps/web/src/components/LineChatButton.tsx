import { useEffect, useState } from 'react';
import { getPublic } from '../lib/api';

interface PublicLineConfig {
  enabled: boolean;
  addFriendUrl: string;
  basicId: string;
  showFloatButton: boolean;
  floatButtonLabelJa: string;
}

/** Floating “chat on LINE” entry for public pages. Hidden when admin disables the widget. */
export default function LineChatButton() {
  const [config, setConfig] = useState<PublicLineConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPublic<PublicLineConfig>('/api/v1/line/public')
      .then((data) => {
        if (!cancelled) setConfig(data);
      })
      .catch(() => {
        if (!cancelled) setConfig(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!config?.enabled || !config.showFloatButton || !config.addFriendUrl) return null;

  return (
    <a
      href={config.addFriendUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="line-chat-fab"
      aria-label={config.floatButtonLabelJa || 'LINEで相談'}
      title={config.floatButtonLabelJa || 'LINEで相談'}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
        <path d="M24 10.304c0-5.369-5.383-9.738-12-9.738-6.616 0-12 4.369-12 9.738 0 4.814 3.54 8.796 8.284 9.502.321.071.758.218.868.5.101.258.065.656.03 1.01-.036.368-.239 1.439-.29 1.742-.061.359-.283 1.391 1.22.762 1.503-.63 8.118-4.785 10.849-8.026 1.956-2.316 3.039-4.887 3.039-5.49zm-15.004 3.045H5.824a.654.654 0 01-.652-.653V7.202c0-.361.293-.653.652-.653.36 0 .653.292.653.653v4.841h2.519c.361 0 .653.292.653.653s-.292.653-.653.653zm3.013 0h-1.303a.654.654 0 01-.653-.653V7.202c0-.361.293-.653.653-.653.361 0 .652.292.652.653v5.494c0 .361-.291.653-.652.653zm4.276 0h-1.303a.654.654 0 01-.652-.653V9.124l-2.029 3.029a.656.656 0 01-.385.264.664.664 0 01-.166.021.654.654 0 01-.652-.653V7.202c0-.361.293-.653.652-.653.36 0 .653.292.653.653v3.524l2.029-3.029a.656.656 0 01-.385.264.664.664 0 01-.166.021c.361 0 .653.292.653.653v5.494c0 .361-.293.653-.653.653zm5.79-.653c0 .361-.293.653-.653.653h-2.519a.654.654 0 01-.652-.653V7.202c0-.361.292-.653.652-.653.361 0 .653.292.653.653v4.841h1.866c.36 0 .653.292.653.653z" />
      </svg>
      <span className="line-chat-fab-label">{config.floatButtonLabelJa || 'LINEで相談'}</span>
    </a>
  );
}
