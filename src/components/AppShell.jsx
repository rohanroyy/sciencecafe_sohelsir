import { LogOut } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import LanguageToggle from './LanguageToggle';
import { useLanguage } from '../context/LanguageContext';
import { getAvatarUrl } from '../utils/avatars';
import PullToRefresh from './PullToRefresh';

export default function AppShell({
  userName,
  userSubtitle,
  avatarUrl,
  avatarGender = 'Male',
  avatarId = '',
  avatarLetter = '?',
  tabs = [],
  activeTab,
  onTabChange,
  onLogout,
  headerActions,
  onRefresh,
  children,
}) {
  const { t } = useLanguage();
  const resolvedAvatar = getAvatarUrl(avatarUrl, avatarGender, avatarId);

  return (
    <div className="app-shell">
      <header className="app-header glass">
        <div className="app-header-main">
          <img src={resolvedAvatar} alt="" className="avatar avatar-md" />
          <div className="app-header-text">
            <p className="app-header-greeting">{t('welcome')}</p>
            <h1 className="app-header-name">{userName}</h1>
            {userSubtitle && <p className="app-header-sub">{userSubtitle}</p>}
          </div>
        </div>
        <div className="app-header-actions">
          <LanguageToggle />
          <ThemeToggle />
          {headerActions}
          {onLogout && (
            <button type="button" className="icon-btn icon-btn-danger" onClick={onLogout} aria-label={t('logout')}>
              <LogOut size={18} strokeWidth={1.75} />
            </button>
          )}
        </div>
      </header>

      {/* app-main owns no scroll itself — PullToRefresh is the scroll container */}
      <main className="app-main" style={{ overflow: 'hidden', padding: 0 }}>
        <PullToRefresh onRefresh={onRefresh}>
          <div style={{ padding: '1rem', paddingBottom: 'calc(var(--nav-height) + env(safe-area-inset-bottom) + 1rem)' }}>
            {children}
          </div>
        </PullToRefresh>
      </main>

      {tabs.length > 0 && (
        <nav className="bottom-nav glass" aria-label="Main navigation">
          {tabs.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              className={`bottom-nav-item ${activeTab === id ? 'active' : ''}`}
              onClick={() => onTabChange(id)}
            >
              <Icon size={22} strokeWidth={activeTab === id ? 2.25 : 1.75} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
