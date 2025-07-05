class I18n {
    constructor() {
        this.currentLanguage = 'zh-CN';
        this.translations = {};
        this.fallbackLanguage = 'en-US';
        this.supportedLanguages = ['zh-CN', 'en-US'];
        this.init();
    }

    async init() {
        // Load saved language preference
        const savedLanguage = localStorage.getItem('vrplayer-language');
        if (savedLanguage && this.supportedLanguages.includes(savedLanguage)) {
            this.currentLanguage = savedLanguage;
        }
        
        // Load translations
        await this.loadTranslations();
        
        // Apply initial translations
        this.applyTranslations();
    }

    async loadTranslations() {
        try {
            // Load all supported languages
            for (const lang of this.supportedLanguages) {
                const response = await fetch(`locales/${lang}.json`);
                if (response.ok) {
                    this.translations[lang] = await response.json();
                } else {
                    console.warn(`Failed to load translations for ${lang}`);
                }
            }
        } catch (error) {
            console.error('Error loading translations:', error);
        }
    }

    t(key, params = {}) {
        const keys = key.split('.');
        let translation = this.translations[this.currentLanguage];
        
        // Navigate through the translation object
        for (const k of keys) {
            if (translation && typeof translation === 'object' && k in translation) {
                translation = translation[k];
            } else {
                // Fallback to default language
                translation = this.translations[this.fallbackLanguage];
                for (const k of keys) {
                    if (translation && typeof translation === 'object' && k in translation) {
                        translation = translation[k];
                    } else {
                        console.warn(`Translation not found for key: ${key}`);
                        return key;
                    }
                }
                break;
            }
        }
        
        if (typeof translation !== 'string') {
            console.warn(`Translation not found for key: ${key}`);
            return key;
        }
        
        // Replace parameters
        return this.replaceParams(translation, params);
    }

    replaceParams(text, params) {
        return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
            return params[key] !== undefined ? params[key] : match;
        });
    }

    async switchLanguage(language) {
        if (!this.supportedLanguages.includes(language)) {
            console.warn(`Language ${language} is not supported`);
            return;
        }
        
        this.currentLanguage = language;
        localStorage.setItem('vrplayer-language', language);
        
        // Apply translations to the DOM
        this.applyTranslations();
        
        // Update HTML lang attribute
        document.documentElement.lang = language;
        
        // Trigger language change event
        window.dispatchEvent(new CustomEvent('languageChanged', { 
            detail: { language } 
        }));
    }

    applyTranslations() {
        // Apply translations to elements with data-i18n attribute
        const elements = document.querySelectorAll('[data-i18n]');
        elements.forEach(element => {
            const key = element.getAttribute('data-i18n');
            const translation = this.t(key);
            
            if (element.tagName === 'INPUT' && (element.type === 'button' || element.type === 'submit')) {
                element.value = translation;
            } else if (element.tagName === 'INPUT' && element.type === 'text') {
                element.placeholder = translation;
            } else {
                element.textContent = translation;
            }
        });

        // Apply translations to elements with data-i18n-title attribute
        const titleElements = document.querySelectorAll('[data-i18n-title]');
        titleElements.forEach(element => {
            const key = element.getAttribute('data-i18n-title');
            const translation = this.t(key);
            element.title = translation;
        });

        // Apply translations to elements with data-i18n-placeholder attribute
        const placeholderElements = document.querySelectorAll('[data-i18n-placeholder]');
        placeholderElements.forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            const translation = this.t(key);
            element.placeholder = translation;
        });
    }

    getCurrentLanguage() {
        return this.currentLanguage;
    }

    getSupportedLanguages() {
        return this.supportedLanguages.map(lang => ({
            code: lang,
            name: this.t('settings.chinese') === this.t('settings.chinese') ? 
                  (lang === 'zh-CN' ? '简体中文' : 'English') : 
                  this.t(lang === 'zh-CN' ? 'settings.chinese' : 'settings.english')
        }));
    }

    getLanguageName(langCode) {
        const names = {
            'zh-CN': '简体中文',
            'en-US': 'English'
        };
        return names[langCode] || langCode;
    }
}

// Create global instance
window.i18n = new I18n();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = I18n;
} 