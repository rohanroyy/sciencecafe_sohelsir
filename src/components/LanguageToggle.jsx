import { Languages } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export default function LanguageToggle({ className = '' }) {
  const { lang, toggleLang } = useLanguage();

  return (
    <button
      type="button"
      className={`lang-toggle ${className}`}
      onClick={toggleLang}
      aria-label="Toggle language"
    >
      <Languages size={16} strokeWidth={1.75} />
      <span>{lang === 'en' ? 'বাং' : 'EN'}</span>
    </button>
  );
}
