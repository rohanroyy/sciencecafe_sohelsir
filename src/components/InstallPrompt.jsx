import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

const DISMISS_KEY = 'sc-install-dismissed';

function isStandaloneApp() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function wasDismissedRecently() {
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const dismissedAt = Number(raw);
  if (Number.isNaN(dismissedAt)) return false;
  return Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000;
}

export default function InstallPrompt() {
  const { t } = useLanguage();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (isStandaloneApp() || wasDismissedRecently()) return;

    const onBeforeInstall = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    if (isIOS() && !isStandaloneApp()) {
      const timer = window.setTimeout(() => setIosHint(true), 1500);
      return () => {
        window.clearTimeout(timer);
        window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      };
    }

    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
    setIosHint(false);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    dismiss();
  };

  if (!visible && !iosHint) return null;

  return (
    <div className="install-banner glass" role="dialog" aria-label={t('installAppTitle')}>
      <div className="install-banner-icon">
        {iosHint ? <Share size={20} strokeWidth={1.75} /> : <Download size={20} strokeWidth={1.75} />}
      </div>
      <div className="install-banner-text">
        <strong>{t('installAppTitle')}</strong>
        <p>{iosHint ? t('installAppIosHint') : t('installAppDesc')}</p>
      </div>
      <div className="install-banner-actions">
        {!iosHint && deferredPrompt && (
          <button type="button" className="btn btn-primary btn-sm" onClick={handleInstall}>
            {t('installApp')}
          </button>
        )}
        <button type="button" className="icon-btn" onClick={dismiss} aria-label={t('close')}>
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
