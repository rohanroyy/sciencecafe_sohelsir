import React, { createContext, useContext, useState } from 'react';
import { translations } from '../i18n/translations';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    return localStorage.getItem('sc-lang') || 'en';
  });

  const toggleLang = () => {
    setLang((l) => {
      const next = l === 'en' ? 'bn' : 'en';
      localStorage.setItem('sc-lang', next);
      return next;
    });
  };

  const setLanguage = (next) => {
    setLang(next);
    localStorage.setItem('sc-lang', next);
  };

  const t = (key) => translations[lang]?.[key] ?? translations.en[key] ?? key;

  return (
    <LanguageContext.Provider value={{ lang, setLanguage, toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
