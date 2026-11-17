export interface AppRule {
  id: string;
  name: string;
  category: 'Currency' | 'Translation' | 'Page Builder' | 'Drawer Cart' | 'Sticky ATC' | 'Options & Bundle' | 'Speed & Delay';
  srcPattern?: string;
  globals?: string[];
  domSelectors?: string[];
  warning?: string;
}

export interface HealthRules {
  teeinblue: {
    srcPattern: string;
    globals: string[];
    domSelectors: string[];
  };
  themeFormSelectors: string[];
  nativeAtcSelectors: string[];
  dynamicCheckoutSelectors: string[];
  conflicts: AppRule[];
}

export const HEALTH_RULES: HealthRules = {
  teeinblue: {
    srcPattern: '(teeinblue|[/_.-]tib[/_.-]|/tee-[\\w.-]+\\.js)',
    globals: ['teeinblue', 'teeinblueShop', 'teeinblueShopConfig', 'teeinblueCampaign'],
    domSelectors: [
      '#teeinblue-wrapper',
      '[class*="teeinblue" i]',
      '[id*="teeinblue" i]',
      '[class*="tib-"]',
      '[data-teeinblue]'
    ]
  },
  themeFormSelectors: [
    'form[action*="/cart/add"]',
    'form.product-form',
    'form[action="/cart/add"]',
    'product-form form',
    'form[data-type="add-to-cart-form"]'
  ],
  nativeAtcSelectors: [
    'form[action*="/cart/add"] button[name="add"]',
    'form[action*="/cart/add"] input[type="submit"]',
    'form[action*="/cart/add"] button[type="submit"]',
    '.product-form__submit',
    'button.product-form__submit',
    '#AddToCart',
    '#AddToCart-product-template'
  ],
  dynamicCheckoutSelectors: [
    '.shopify-payment-button',
    '.shopify-payment-button__button',
    '[data-shopify="payment-button"]',
    '.shopify-payment-button__button--unbranded'
  ],
  conflicts: [
    // Currency
    {
      id: 'currency-generic',
      name: 'Currency Converter (generic)',
      category: 'Currency',
      srcPattern: '(currencyconverter|currency-converter|currency_converter|bold-currency|ultimate-currency|currency-?switcher)',
      warning: 'App chuyển đổi tiền tệ có thể tự ý thay đổi format tiền tệ hoặc nhân sai tỷ giá hiển thị của các Add-on/Option trong Teeinblue.'
    },

    // Translation
    {
      id: 'weglot',
      name: 'Weglot',
      category: 'Translation',
      srcPattern: 'weglot',
      globals: ['Weglot'],
      warning: 'Weglot có thể tự ý quét và dịch đè nội dung người dùng nhập vào ô text cá nhân hóa, hoặc làm gián đoạn DOM của Teeinblue.'
    },
    {
      id: 'langify',
      name: 'Langify',
      category: 'Translation',
      srcPattern: 'langify',
      globals: ['langify'],
      warning: 'Langify có thể dịch nhầm các key thuộc tính hoặc can thiệp vào quá trình nạp font/text của Teeinblue.'
    },
    {
      id: 'langshop',
      name: 'LangShop',
      category: 'Translation',
      srcPattern: 'langshop',
      warning: 'LangShop có thể xung đột với bộ từ điển Teeinblue Translations được thiết lập trong Theme Metafield.'
    },
    {
      id: 'gtranslate',
      name: 'GTranslate / Google Translate',
      category: 'Translation',
      srcPattern: '(gtranslate|translate\\.google\\.com|translate_a)',
      globals: ['gtranslateSettings'],
      warning: 'Google Translate tự động can thiệp DOM làm vỡ thẻ input hoặc dịch nhầm các giá trị personalized text.'
    },
    {
      id: 'transcy',
      name: 'Transcy',
      category: 'Translation',
      srcPattern: 'transcy',
      warning: 'Transcy kết hợp dịch thuật và đổi tiền tệ, có thể can thiệp cả giá Add-on lẫn form cá nhân hoá.'
    },

    // Page Builder
    {
      id: 'pagefly',
      name: 'PageFly',
      category: 'Page Builder',
      srcPattern: 'pagefly',
      domSelectors: ['[data-pf-type]'],
      warning: 'PageFly tạo cấu trúc layout tùy biến độc lập. Cần cấu hình hook chuẩn để Teeinblue định vị được form và ẩn nút Add to Cart mặc định của PageFly.'
    },
    {
      id: 'gempages',
      name: 'GemPages',
      category: 'Page Builder',
      srcPattern: '(gempages|gem-pages)',
      domSelectors: ['[data-gp-component]'],
      warning: 'GemPages thường bọc form sản phẩm trong custom element riêng, có thể gây lỗi lộ 2 nút Add to Cart nếu chưa chèn snippet hỗ trợ.'
    },
    {
      id: 'shogun',
      name: 'Shogun',
      category: 'Page Builder',
      srcPattern: 'shogun',
      domSelectors: ['.shogun-root'],
      warning: 'Shogun có thể ghi đè logic submit sản phẩm khiến Teeinblue không chặn được nút Add to Cart.'
    },
    {
      id: 'replo',
      name: 'Replo',
      category: 'Page Builder',
      srcPattern: 'replo',
      warning: 'Replo sử dụng cấu trúc Canvas riêng, cần snippet neo vị trí mount cho Teeinblue Personalizer.'
    },

    // Drawer Cart / Slide Cart
    {
      id: 'slide-cart-upmo',
      name: 'Slide Cart (Upmo/Appstle)',
      category: 'Drawer Cart',
      srcPattern: '(slide-cart|upmo-cart)',
      domSelectors: ['#slide-cart', '.slide-cart-container'],
      warning: 'Drawer Cart có thể lọc bỏ thuộc tính ẩn (_customization_id) hoặc không render ảnh personalize thumbnail.'
    },
    {
      id: 'icart',
      name: 'iCart Cart Drawer',
      category: 'Drawer Cart',
      srcPattern: 'icart',
      globals: ['iCart'],
      warning: 'iCart có thể xung đột khi Add to Cart hoặc không hiển thị link customization của sản phẩm trong giỏ hàng.'
    },
    {
      id: 'rebuy',
      name: 'Rebuy Smart Cart',
      category: 'Drawer Cart',
      srcPattern: 'rebuy',
      globals: ['Rebuy'],
      warning: 'Rebuy Smart Cart có thể can thiệp luồng submit cart hoặc ghi đè line item properties của Teeinblue.'
    },
    {
      id: 'monster-cart',
      name: 'Monster Upsell / Cart',
      category: 'Drawer Cart',
      srcPattern: 'monster-upsell|monstercart',
      domSelectors: ['.monster-cart'],
      warning: 'Monster Cart có thể chặn event sau khi thêm giỏ hàng hoặc làm mất liên kết line item properties.'
    },

    // Sticky ATC
    {
      id: 'sticky-atc-generic',
      name: 'Sticky Add To Cart App',
      category: 'Sticky ATC',
      srcPattern: '(sticky-atc|sticky-add-to-cart|sticky-cart)',
      domSelectors: ['[class*="sticky-atc" i]', '[id*="sticky-atc" i]', '.sticky-cart-bar'],
      warning: 'Nút Sticky Add To Cart của bên thứ 3 thường gọi thẳng form theme, bỏ qua các bước cá nhân hóa của Teeinblue.'
    },

    // Options & Bundle
    {
      id: 'globo-options',
      name: 'Globo Product Options',
      category: 'Options & Bundle',
      srcPattern: 'globo\\.options',
      domSelectors: ['.globo-formbuilder'],
      warning: 'Globo Options hiển thị trùng lặp các tùy chọn biến thể với Teeinblue, gây nhầm lẫn khi đặt hàng.'
    },
    {
      id: 'infinite-options',
      name: 'ShopPad Infinite Options',
      category: 'Options & Bundle',
      srcPattern: 'infinite-options',
      domSelectors: ['#infiniteoptions-container'],
      warning: 'App tùy biến option này có thể can thiệp vào form data khi submit vào giỏ hàng.'
    },
    {
      id: 'kaching-bundle',
      name: 'Kaching Bundle',
      category: 'Options & Bundle',
      srcPattern: 'kaching-bundle',
      domSelectors: ['.kaching-bundles__bar'],
      warning: 'Kaching Bundle thay đổi cơ chế thêm sản phẩm theo nhóm, có thể bỏ qua quá trình tạo Customization của Teeinblue.'
    },

    // Speed & Delayer
    {
      id: 'hyperspeed',
      name: 'Hyperspeed / Speed Delayer',
      category: 'Speed & Delay',
      srcPattern: '(hyperspeed|core-speed-booster)',
      warning: 'App tăng tốc hoãn load Javascript có thể làm chậm hoặc chặn khởi tạo SDK Teeinblue.'
    }
  ]
};
