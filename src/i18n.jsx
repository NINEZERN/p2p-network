import {createContext, useCallback, useContext, useEffect, useState} from 'react';
import translations from './translations.json';

export const languages = ['en', 'pl', 'ru'];
export function translate(text, language) {
  if (typeof text !== 'string' || language === 'ru') return text;
  const key = text.trim();
  const translated = translations[key]?.[language];
  if (translated) return text.replace(key, () => translated);
  // Connection errors may contain a localized service error after a fixed prefix.
  const prefix = 'Не удалось установить соединение. Выйдите и войдите в комнату повторно.';
  if (key.startsWith(prefix)) {
    const detail = key.slice(prefix.length).trim();
    return translations[prefix][language] + (detail ? ' ' + translate(detail, language) : '');
  }
  return text;
}
function savedLanguage() {
  try {
    const saved = localStorage.getItem('mgla-language');
    if (languages.includes(saved)) return saved;
  } catch { /* The language still works when browser storage is unavailable. */ }
  return 'en';
}
const LanguageContext = createContext(null);
export function LanguageProvider({children}) {
  const [language, changeLanguage] = useState(savedLanguage);
  const setLanguage = useCallback(value => {
    if (!languages.includes(value)) return;
    changeLanguage(value);
    try { localStorage.setItem('mgla-language', value); } catch { /* Keep the in-memory preference. */ }
  }, []);
  const t = useCallback(text => translate(text, language), [language]);
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = t('Mgła — пространство без лишних следов.');
    document.querySelector('meta[name="description"]')?.setAttribute('content', t('Общайтесь и делитесь файлами без регистрации и личных данных.'));
  }, [language, t]);
  return <LanguageContext.Provider value={{language, setLanguage, t, locale:language}}>{children}</LanguageContext.Provider>;
}
export function useLanguage() { return useContext(LanguageContext); }
