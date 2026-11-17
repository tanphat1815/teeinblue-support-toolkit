<script setup lang="ts">
import { ref } from 'vue';
import UntitledIcon from './UntitledIcon.vue';

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const activeTab = ref<'chot-chan' | 'e2e' | 'properties' | 'faq'>('chot-chan');
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm transition-all overscroll-contain"
    @click.self="emit('close')"
  >
    <div
      class="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150 overscroll-contain"
    >
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/90 px-4 py-3">
        <div class="flex items-center gap-2">
          <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-emerald-500/20">
            <UntitledIcon name="book-open" :size="15" />
          </div>
          <div>
            <h3 class="text-sm font-semibold text-slate-800">Cơ Chế Store Health & 4 Chốt Chặn</h3>
            <p class="text-[11px] text-slate-500">Tại sao app bên thứ 3 lại xung đột và quy trình bảo toàn đơn hàng</p>
          </div>
        </div>
        <button
          class="rounded-lg p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 transition-colors"
          @click="emit('close')"
        >
          <UntitledIcon name="minus-circle" :size="16" class="rotate-45" />
        </button>
      </div>

      <!-- Navigation Tabs (Dropdown selector gọn gàng, hiển thị hoàn hảo trên Sidepanel hẹp) -->
      <div class="border-b border-slate-200 bg-slate-100/80 p-2">
        <select
          v-model="activeTab"
          class="tib-input text-xs font-semibold text-slate-800 bg-white shadow-2xs py-1.5"
        >
          <option value="chot-chan">1. 4 Chốt chặn xung đột app</option>
          <option value="e2e">2. Toàn cảnh luồng E2E Teeinblue</option>
          <option value="properties">3. Thuộc tính _customization_id</option>
          <option value="faq">4. Cách xử lý khi phát hiện xung đột</option>
        </select>
      </div>

      <!-- Content Body -->
      <div class="flex-1 space-y-3.5 overflow-y-auto p-4 text-xs leading-relaxed text-slate-700">
        <!-- 1. 4 CHỐT CHẶN XUNG ĐỘT -->
        <div v-show="activeTab === 'chot-chan'" class="space-y-3">
          <div class="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-amber-900">
            <div class="font-bold flex items-center gap-1.5 text-xs text-amber-950 mb-1">
              <UntitledIcon name="alert-triangle" :size="14" class="text-amber-600" />
              <span>Tại sao một app lại bị xếp vào danh sách xung đột?</span>
            </div>
            Một app bên thứ 3 chỉ xung đột với Teeinblue khi nó can thiệp trực tiếp vào 1 trong 4 chốt chặn cốt lõi của quy trình mua hàng dưới đây:
          </div>

          <div class="space-y-2.5">
            <!-- Chốt 1 -->
            <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1">
              <div class="font-bold text-slate-900 flex items-center gap-2">
                <span class="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-700 text-[10px]">1</span>
                <span>Chốt chặn 1: Form & Nút Add to Cart (ATC Hijacking)</span>
              </div>
              <p class="text-slate-600">
                <b>Cơ chế TIB:</b> Khi bấm ATC, TIB phải chặn submit mặc định, validate dữ liệu, gọi API <code class="bg-white px-1 py-0.5 rounded border font-mono">POST /merchant/shopify/customization</code> để tạo bản ghi thiết kế rồi mới cho sản phẩm vào giỏ.
              </p>
              <p class="text-slate-600">
                <b>App xung đột:</b> <i>Sticky ATC, Buy It Now (Shop Pay, PayPal), Bundle Apps</i> tự ý gọi submit thẳng vào giỏ hàng hoặc nhảy sang Checkout mà không chờ TIB tạo Customization ➔ Đơn tạo ra trắng trơn, không có ảnh cá nhân hoá.
              </p>
            </div>

            <!-- Chốt 2 -->
            <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1">
              <div class="font-bold text-slate-900 flex items-center gap-2">
                <span class="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-700 text-[10px]">2</span>
                <span>Chốt chặn 2: Thuộc tính đơn hàng (Properties Stripping)</span>
              </div>
              <p class="text-slate-600">
                <b>Cơ chế TIB:</b> TIB gắn các key ẩn bắt đầu bằng dấu gạch dưới (<code class="bg-white px-1 py-0.5 rounded border font-mono">_customization_id</code>, <code class="bg-white px-1 py-0.5 rounded border font-mono">_tib_design_link_1</code>) vào line item properties.
              </p>
              <p class="text-slate-600">
                <b>App xung đột:</b> Nhiều <i>Drawer Cart / Slide Cart (Upmo, Rebuy, iCart)</i> tự ý lọc bỏ các thuộc tính có dấu gạch dưới <code class="bg-white px-1 py-0.5 rounded border font-mono">_</code> làm đơn hàng mất toàn bộ dữ liệu thiết kế khi đồng bộ về xưởng in.
              </p>
            </div>

            <!-- Chốt 3 -->
            <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1">
              <div class="font-bold text-slate-900 flex items-center gap-2">
                <span class="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-700 text-[10px]">3</span>
                <span>Chốt chặn 3: Cây DOM & Dịch thuật (Page Builders & Translation)</span>
              </div>
              <p class="text-slate-600">
                <b>App xung đột:</b> <i>PageFly, GemPages</i> thay đổi cấu trúc cây DOM làm TIB không tìm thấy chỗ neo nút ATC (dẫn đến lộ 2 nút). <i>Weglot, Google Translate</i> tự động can thiệp DOM dịch đè cả chữ khách vừa gõ vào form cá nhân hoá.
              </p>
            </div>

            <!-- Chốt 4 -->
            <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1">
              <div class="font-bold text-slate-900 flex items-center gap-2">
                <span class="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-700 text-[10px]">4</span>
                <span>Chốt chặn 4: Tiền tệ & Giá Addon (Currency Switchers)</span>
              </div>
              <p class="text-slate-600">
                <b>App xung đột:</b> <i>Currency Converter</i> tự ý đổi format tiền tệ hoặc nhân tỷ giá trên giao diện HTML nhưng không update variant gốc của Shopify, khiến giá hiển thị một đằng nhưng vào giỏ một nẻo.
              </p>
            </div>
          </div>
        </div>

        <!-- 2. LUỒNG E2E TEEINBLUE -->
        <div v-show="activeTab === 'e2e'" class="space-y-3">
          <div class="font-semibold text-slate-900">Luồng hoạt động chuẩn từ Xem đến Checkout:</div>
          <ol class="space-y-2 border-l-2 border-emerald-300 pl-3 ml-2">
            <li>
              <div class="font-bold text-slate-800">1. Load Trang & Theme App Embed</div>
              <div class="text-slate-600 text-[11px]">Shopify load block <code class="font-mono text-[10px] bg-slate-100 px-1 py-0.5 rounded">product-personalizer.liquid</code>, in ra các biến cấu hình toàn cục <code class="font-mono text-[10px] bg-slate-100 px-1 py-0.5 rounded">teeinblueShop</code>, <code class="font-mono text-[10px] bg-slate-100 px-1 py-0.5 rounded">teeinblueCampaign</code>.</div>
            </li>
            <li>
              <div class="font-bold text-slate-800">2. Fetch Campaign API & Mount Canvas</div>
              <div class="text-slate-600 text-[11px]">SDK fetch dữ liệu chiến dịch JSON từ API Teeinblue, render canvas và form personalize vào <code class="font-mono text-[10px] bg-slate-100 px-1 py-0.5 rounded">#teeinblue-wrapper</code>.</div>
            </li>
            <li>
              <div class="font-bold text-slate-800">3. Ẩn Nút Add to Cart gốc của Theme</div>
              <div class="text-slate-600 text-[11px]">Thêm class <code class="font-mono text-[10px] bg-slate-100 px-1 py-0.5 rounded">.teeinblue-product-loading</code> để ẩn nút Add to Cart mặc định của theme, chỉ giữ lại nút của Teeinblue.</div>
            </li>
            <li>
              <div class="font-bold text-slate-800">4. Tạo Customization Record</div>
              <div class="text-slate-600 text-[11px]">Khách ấn ATC ➔ SDK gửi payload lên TIB Server ➔ nhận về ID tùy biến <code class="font-mono text-[10px] bg-slate-100 px-1 py-0.5 rounded">_customization_id</code>.</div>
            </li>
            <li>
              <div class="font-bold text-slate-800">5. Gửi vào Giỏ Hàng Shopify (/cart/add.js)</div>
              <div class="text-slate-600 text-[11px]">Line item properties kèm đầy đủ mã thiết kế và link in ấn chất lượng cao được lưu vào session giỏ hàng.</div>
            </li>
          </ol>
        </div>

        <!-- 3. THUỘC TÍNH BẮT BUỘC -->
        <div v-show="activeTab === 'properties'" class="space-y-3">
          <div class="font-semibold text-slate-900">Các Line Item Properties cốt lõi cần bảo toàn:</div>
          <div class="space-y-2">
            <div class="rounded border p-2 bg-slate-50 font-mono text-[11px]">
              <div class="font-bold text-blue-700">_customization_id</div>
              <div class="text-slate-600 font-sans text-[11px]">Mã định danh duy nhất của thiết kế trên máy chủ Teeinblue. Nếu mất mã này, đơn hàng sync về portal sẽ bị lỗi Missing Customization.</div>
            </div>
            <div class="rounded border p-2 bg-slate-50 font-mono text-[11px]">
              <div class="font-bold text-blue-700">_customization_image</div>
              <div class="text-slate-600 font-sans text-[11px]">URL ảnh thumbnail preview đã ghép ảnh và chữ của khách để hiển thị trên trang giỏ hàng.</div>
            </div>
            <div class="rounded border p-2 bg-slate-50 font-mono text-[11px]">
              <div class="font-bold text-blue-700">_tib_design_link_1, _tib_design_link_2...</div>
              <div class="text-slate-600 font-sans text-[11px]">Đường dẫn tải trực tiếp file in ấn độ phân giải cao gửi thẳng đến nhà in (Fulfillment Print Provider).</div>
            </div>
          </div>
        </div>

        <!-- 4. FAQ / CÁCH XỬ LÝ -->
        <div v-show="activeTab === 'faq'" class="space-y-3">
          <div class="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
            <div class="font-bold text-slate-900">Khi tab Health cảnh báo app xung đột, cần làm gì?</div>
            <ul class="list-disc pl-4 space-y-1 text-slate-600 text-[11px]">
              <li><b>Với Page Builder (PageFly, GemPages):</b> Mở tab <b>Snippet Injector</b>, tìm snippet tương ứng của Page Builder đó và inject vào theme để căn chỉnh hook neo.</li>
              <li><b>Với Dynamic Checkout (Buy It Now):</b> Khuyên merchant vào <i>Shopify Admin > Online Store > Themes > Customize > Product Page</i> và bỏ chọn mục <i>"Show dynamic checkout buttons"</i>.</li>
              <li><b>Với Drawer Cart (Rebuy, Upmo):</b> Test thử bằng cách Add to Cart và kiểm tra trang <code class="font-mono bg-slate-100 px-1 py-0.5 rounded">/cart</code> xem có giữ nguyên ảnh preview và <code class="font-mono bg-slate-100 px-1 py-0.5 rounded">_customization_id</code> không.</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-between border-t border-slate-200/80 bg-slate-50 px-4 py-2.5">
        <span class="text-[11px] text-slate-500">Teeinblue Support Toolkit Knowledge Base</span>
        <button
          class="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 transition-colors"
          @click="emit('close')"
        >
          Đã hiểu
        </button>
      </div>
    </div>
  </div>
</template>

