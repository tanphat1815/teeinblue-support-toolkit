export interface AppRule {
  id: string; name: string; category: 'Currency' | 'Translation' | 'Page Builder';
  srcPattern?: string; globals?: string[]; domSelectors?: string[];
}
export interface HealthRules {
  teeinblue: { srcPattern: string; globals: string[]; domSelectors: string[] };
  conflicts: AppRule[];
}

export const HEALTH_RULES: HealthRules = {
  teeinblue: {
    srcPattern: '(teeinblue|[/_.-]tib[/_.-]|/tee-[\\w.-]+\\.js)',
    globals: ['teeinblue'],
    domSelectors: ['[class*="teeinblue" i]', '[id*="teeinblue" i]', '[class*="tib-"]', '[data-teeinblue]']
  },
  conflicts: [
    { id: 'currency-generic', name: 'Currency Converter (generic)', category: 'Currency',
      srcPattern: '(currencyconverter|currency-converter|currency_converter|bold-currency|ultimate-currency|currency-?switcher)' },
    { id: 'weglot', name: 'Weglot', category: 'Translation', srcPattern: 'weglot', globals: ['Weglot'] },
    { id: 'langify', name: 'Langify', category: 'Translation', srcPattern: 'langify', globals: ['langify'] },
    { id: 'langshop', name: 'LangShop', category: 'Translation', srcPattern: 'langshop' },
    { id: 'gtranslate', name: 'GTranslate / Google Translate', category: 'Translation',
      srcPattern: '(gtranslate|translate\\.google\\.com|translate_a)', globals: ['gtranslateSettings'] },
    { id: 'transcy', name: 'Transcy', category: 'Translation', srcPattern: 'transcy' },
    { id: 'pagefly', name: 'PageFly', category: 'Page Builder', srcPattern: 'pagefly', domSelectors: ['[data-pf-type]'] },
    { id: 'gempages', name: 'GemPages', category: 'Page Builder', srcPattern: '(gempages|gem-pages)', domSelectors: ['[data-gp-component]'] },
    { id: 'shogun', name: 'Shogun', category: 'Page Builder', srcPattern: 'shogun', domSelectors: ['.shogun-root'] },
    { id: 'replo', name: 'Replo', category: 'Page Builder', srcPattern: 'replo' }
  ]
};
