const fs = require('fs');
const path = require('path');

class I18n {
  constructor() {
    this.locales = {};
    this.defaultLocale = 'en';
    this.supportedLocales = ['en', 'zh'];
    this.loadLocales();
  }

  loadLocales() {
    const localesDir = path.join(__dirname, '../locales');
    
    this.supportedLocales.forEach(locale => {
      try {
        const localeFile = path.join(localesDir, `${locale}.json`);
        if (fs.existsSync(localeFile)) {
          this.locales[locale] = JSON.parse(fs.readFileSync(localeFile, 'utf8'));
        }
      } catch (error) {
        console.warn(`Failed to load locale ${locale}:`, error.message);
      }
    });
  }

  /**
   * Get translation for a key with optional interpolation
   * @param {string} key - The translation key (e.g., 'auth.invalidCredentials')
   * @param {string} locale - The locale to use
   * @param {object} params - Parameters for interpolation
   * @returns {string} The translated string
   */
  t(key, locale = this.defaultLocale, params = {}) {
    // Ensure we have a supported locale
    if (!this.supportedLocales.includes(locale)) {
      locale = this.defaultLocale;
    }

    // Get the locale data
    const localeData = this.locales[locale] || this.locales[this.defaultLocale];
    if (!localeData) {
      return key; // Return key if no translations available
    }

    // Navigate through nested object using dot notation
    const keys = key.split('.');
    let translation = localeData;
    
    for (const k of keys) {
      translation = translation[k];
      if (translation === undefined) {
        // Fallback to default locale if translation not found
        if (locale !== this.defaultLocale) {
          return this.t(key, this.defaultLocale, params);
        }
        return key; // Return key if translation not found
      }
    }

    // Perform interpolation
    if (typeof translation === 'string' && Object.keys(params).length > 0) {
      return this.interpolate(translation, params);
    }

    return translation;
  }

  /**
   * Interpolate parameters in translation string
   * @param {string} template - The template string with {{param}} placeholders
   * @param {object} params - The parameters to interpolate
   * @returns {string} The interpolated string
   */
  interpolate(template, params) {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return params[key] !== undefined ? params[key] : match;
    });
  }

  /**
   * Detect locale from Accept-Language header
   * @param {string} acceptLanguage - The Accept-Language header value
   * @returns {string} The detected locale
   */
  detectLocale(acceptLanguage) {
    if (!acceptLanguage) {
      return this.defaultLocale;
    }

    // Parse Accept-Language header (simplified)
    const languages = acceptLanguage
      .split(',')
      .map(lang => {
        const [code, quality = '1'] = lang.trim().split(';q=');
        return {
          code: code.toLowerCase(),
          quality: parseFloat(quality)
        };
      })
      .sort((a, b) => b.quality - a.quality);

    // Find first supported language
    for (const lang of languages) {
      // Check exact match first
      if (this.supportedLocales.includes(lang.code)) {
        return lang.code;
      }
      
      // Check language prefix (e.g., 'zh-CN' -> 'zh')
      const prefix = lang.code.split('-')[0];
      if (this.supportedLocales.includes(prefix)) {
        return prefix;
      }
    }

    return this.defaultLocale;
  }

  /**
   * Get list of supported locales
   * @returns {string[]} Array of supported locale codes
   */
  getSupportedLocales() {
    return [...this.supportedLocales];
  }

  /**
   * Check if a locale is supported
   * @param {string} locale - The locale to check
   * @returns {boolean} Whether the locale is supported
   */
  isSupported(locale) {
    return this.supportedLocales.includes(locale);
  }
}

// Create singleton instance
const i18n = new I18n();

module.exports = i18n; 