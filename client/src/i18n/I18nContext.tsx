import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { translate, type TranslationKey, type UiLanguage } from './translations';

const UI_LANGUAGE_STORAGE_KEY = 'restaurant_ui_language';

interface I18nContextValue {
  language: UiLanguage;
  setLanguage: (language: UiLanguage) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export const detectUiLanguage = (): UiLanguage => {
  try {
    const stored = localStorage.getItem(UI_LANGUAGE_STORAGE_KEY);
    if (stored === 'zh-CN' || stored === 'es-NI') return stored;
  } catch {
    // Storage may be unavailable in privacy mode.
  }

  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh')
    ? 'zh-CN'
    : 'es-NI';
};

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<UiLanguage>(detectUiLanguage);

  const setLanguage = (nextLanguage: UiLanguage) => {
    setLanguageState(nextLanguage);
    try {
      localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, nextLanguage);
    } catch {
      // The current session still keeps the selected language.
    }
  };

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<I18nContextValue>(() => ({
    language,
    setLanguage,
    t: key => translate(language, key),
  }), [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = (): I18nContextValue => {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within I18nProvider');
  return context;
};

