<script setup lang="ts">
import { ref } from 'vue';
import UntitledIcon from './UntitledIcon.vue';
import { copyText } from '../clipboard';

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const copied = ref(false);
const activeTab = ref<'keys' | 'example' | 'large_code'>('keys');

const exampleData = {
  version: 1,
  snippets: [
    {
      id: 'custom-css-file',
      title: 'Tạo teeinblue-custom.css và link vào theme',
      category: 'Fix CSS',
      description: 'Tạo file CSS riêng cho các fix giao diện Teeinblue, tự link vào layout/theme.liquid.',
      type: 'mixed',
      themes: ['*'],
      tags: ['css', 'custom'],
      targets: [
        {
          filename: 'assets/teeinblue-custom.css',
          mode: 'create',
          code: '/* Teeinblue custom fixes */\n.teeinblue-wrapper { margin-top: 12px; }\n.tib-option-label { font-weight: 600; }'
        },
        {
          filename: 'layout/theme.liquid',
          mode: 'before-head',
          code: "{{ 'teeinblue-custom.css' | asset_url | stylesheet_tag }}"
        }
      ]
    },
    {
      id: 'cart-count-refresh',
      title: 'Cập nhật số lượng giỏ hàng sau add-to-cart',
      category: 'Update Cart Count',
      description: 'Gọi /cart.js và cập nhật badge số lượng giỏ hàng.',
      type: 'js',
      themes: ['dawn', 'debut'],
      tags: ['cart', 'count'],
      targets: [
        {
          filename: 'layout/theme.liquid',
          mode: 'before-body',
          code: '<script>\nwindow.tibRefreshCartCount = async function () {\n  const cart = await (await fetch(\'/cart.js\')).json();\n  document.querySelectorAll(\'.cart-count-bubble span\').forEach(function(el) { el.textContent = cart.item_count; });\n};\n' + '</' + 'script>'
        }
      ]
    }
  ]
};

const exampleJson: string = JSON.stringify(exampleData, null, 2);

async function handleCopy() {
  await copyText(exampleJson);
  copied.value = true;
  setTimeout(() => { copied.value = false; }, 2000);
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm transition-all"
    @click.self="emit('close')"
  >
    <div
      class="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150"
    >
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/90 px-4 py-3">
        <div class="flex items-center gap-2">
          <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-emerald-500/20">
            <UntitledIcon name="file" :size="15" />
          </div>
          <div>
            <h3 class="text-sm font-semibold text-slate-800">Cấu trúc chuẩn File Snippets JSON</h3>
            <p class="text-[11px] text-slate-500">Quy định các trường (keys), giá trị hợp lệ & xử lý code dài</p>
          </div>
        </div>
        <button
          class="rounded-lg p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 transition-colors"
          @click="emit('close')"
        >
          <UntitledIcon name="minus-circle" :size="16" class="rotate-45" />
        </button>
      </div>

      <!-- Navigation Tabs (cuộn ngang mượt mà, không bị ép vỡ chữ trên Sidepanel hẹp) -->
      <div class="flex border-b border-slate-200 bg-slate-100/70 p-1 text-xs overflow-x-auto no-scrollbar gap-1">
        <button
          class="shrink-0 rounded-md px-3 py-1.5 font-medium transition-all whitespace-nowrap"
          :class="activeTab === 'keys' ? 'bg-white text-emerald-700 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'"
          @click="activeTab = 'keys'"
        >
          1. Chi tiết Keys
        </button>
        <button
          class="shrink-0 rounded-md px-3 py-1.5 font-medium transition-all whitespace-nowrap"
          :class="activeTab === 'example' ? 'bg-white text-emerald-700 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'"
          @click="activeTab = 'example'"
        >
          2. Ví dụ mẫu JSON
        </button>
        <button
          class="shrink-0 rounded-md px-3 py-1.5 font-medium transition-all whitespace-nowrap"
          :class="activeTab === 'large_code' ? 'bg-white text-emerald-700 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'"
          @click="activeTab = 'large_code'"
        >
          3. Code dài (1000+ dòng)
        </button>
      </div>

      <!-- Content Body -->
      <div class="flex-1 space-y-3.5 overflow-y-auto p-4 text-xs leading-relaxed text-slate-700">
        <!-- TAB 1: CHI TIẾT CÁC KEYS -->
        <div v-show="activeTab === 'keys'" class="space-y-3">
          <div class="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
            Định dạng gốc: một Object chứa <code>{ "version": 1, "snippets": [ ... ] }</code> hoặc trực tiếp một mảng <code>[ ... ]</code>.
          </div>

          <div class="space-y-2">
            <h4 class="font-semibold text-slate-900">1. Thông tin từng Snippet:</h4>
            <div class="overflow-hidden rounded-lg border border-slate-200">
              <table class="w-full text-left text-[11px]">
                <thead class="bg-slate-100 text-slate-700 font-semibold">
                  <tr>
                    <th class="p-2">Key</th>
                    <th class="p-2">Kiểu</th>
                    <th class="p-2">Bắt buộc</th>
                    <th class="p-2">Ý nghĩa & Quy ước</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 bg-white">
                  <tr>
                    <td class="p-2 font-mono text-emerald-600 font-semibold">id</td>
                    <td class="p-2 text-slate-500 font-mono">string</td>
                    <td class="p-2 font-semibold text-red-600">Có</td>
                    <td class="p-2">Định danh duy nhất (slug, vd: <code>fix-cart-drawer</code>). Dùng để tạo marker comment chống inject trùng.</td>
                  </tr>
                  <tr>
                    <td class="p-2 font-mono text-emerald-600 font-semibold">title</td>
                    <td class="p-2 text-slate-500 font-mono">string</td>
                    <td class="p-2 font-semibold text-red-600">Có</td>
                    <td class="p-2">Tiêu đề hiển thị ngắn gọn trong danh sách chọn.</td>
                  </tr>
                  <tr>
                    <td class="p-2 font-mono text-emerald-600 font-semibold">category</td>
                    <td class="p-2 text-slate-500 font-mono">string</td>
                    <td class="p-2 font-semibold text-red-600">Có</td>
                    <td class="p-2">Nhóm phân loại (vd: <code>Fix CSS</code>, <code>Customization ID</code>, <code>Update Cart Count</code>).</td>
                  </tr>
                  <tr>
                    <td class="p-2 font-mono text-emerald-600">description</td>
                    <td class="p-2 text-slate-500 font-mono">string</td>
                    <td class="p-2 text-slate-400">Không</td>
                    <td class="p-2">Mô tả tác dụng của snippet khi mở rộng xem chi tiết.</td>
                  </tr>
                  <tr>
                    <td class="p-2 font-mono text-emerald-600">type</td>
                    <td class="p-2 text-slate-500 font-mono">string</td>
                    <td class="p-2 text-slate-400">Không</td>
                    <td class="p-2">Một trong các giá trị: <code>css</code>, <code>js</code>, <code>liquid</code>, <code>json</code>, hoặc <code>mixed</code>.</td>
                  </tr>
                  <tr>
                    <td class="p-2 font-mono text-emerald-600">themes</td>
                    <td class="p-2 text-slate-500 font-mono">string[]</td>
                    <td class="p-2 text-slate-400">Không</td>
                    <td class="p-2">Danh sách slug theme tương thích (vd: <code>["dawn", "debut"]</code>). Mặc định là <code>["*"]</code> (mọi theme).</td>
                  </tr>
                  <tr>
                    <td class="p-2 font-mono text-emerald-600">tags</td>
                    <td class="p-2 text-slate-500 font-mono">string[]</td>
                    <td class="p-2 text-slate-400">Không</td>
                    <td class="p-2">Mảng từ khóa phục vụ cho ô tìm kiếm (vd: <code>["cart", "ajax"]</code>).</td>
                  </tr>
                  <tr>
                    <td class="p-2 font-mono text-emerald-600 font-semibold">targets</td>
                    <td class="p-2 text-slate-500 font-mono">Target[]</td>
                    <td class="p-2 font-semibold text-red-600">Có</td>
                    <td class="p-2">Mảng các file và vị trí cần ghi vào theme (ít nhất 1 file).</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="space-y-2">
            <h4 class="font-semibold text-slate-900">2. Quy định từng phần tử trong <code>targets</code>:</h4>
            <div class="overflow-hidden rounded-lg border border-slate-200">
              <table class="w-full text-left text-[11px]">
                <thead class="bg-slate-100 text-slate-700 font-semibold">
                  <tr>
                    <th class="p-2">Key</th>
                    <th class="p-2">Kiểu</th>
                    <th class="p-2">Bắt buộc</th>
                    <th class="p-2">Giá trị hợp lệ</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 bg-white">
                  <tr>
                    <td class="p-2 font-mono text-blue-600 font-semibold">filename</td>
                    <td class="p-2 text-slate-500 font-mono">string</td>
                    <td class="p-2 font-semibold text-red-600">Có</td>
                    <td class="p-2 leading-relaxed">
                      Đường dẫn file trong theme Shopify. Phải bắt đầu bằng 1 trong các thư mục: <code>assets/</code>, <code>snippets/</code>, <code>layout/</code>, <code>sections/</code>, <code>templates/</code>, <code>locales/</code>, <code>blocks/</code>.<br />
                      <span class="text-red-500 font-medium">Lưu ý: Bị cấm prefix <code>config/</code> để bảo vệ settings theme.</span>
                    </td>
                  </tr>
                  <tr>
                    <td class="p-2 font-mono text-blue-600 font-semibold">mode</td>
                    <td class="p-2 text-slate-500 font-mono">string</td>
                    <td class="p-2 font-semibold text-red-600">Có</td>
                    <td class="p-2 space-y-1">
                      <div>• <code>create</code>: Tạo file mới hoàn toàn (nếu file đã có sẵn sẽ bỏ qua để không mất code khách).</div>
                      <div>• <code>replace</code>: Ghi đè toàn bộ nội dung file.</div>
                      <div>• <code>append</code>: Thêm vào cuối file.</div>
                      <div>• <code>before-head</code>: Chèn ngay trước thẻ đóng <code>&lt;/head&gt;</code>. Thường dùng chèn CSS.</div>
                      <div>• <code>before-body</code>: Chèn ngay trước thẻ đóng <code>&lt;/body&gt;</code>. Thường dùng chèn script JS hoặc render helper.</div>
                    </td>
                  </tr>
                  <tr>
                    <td class="p-2 font-mono text-blue-600 font-semibold">code</td>
                    <td class="p-2 text-slate-500 font-mono">string</td>
                    <td class="p-2 font-semibold text-red-600">Có</td>
                    <td class="p-2">Nội dung mã cần inject. Ký tự xuống dòng viết là <code>\n</code>, dấu ngoặc kép cần escape <code>\"</code>.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- TAB 2: VÍ DỤ MẪU JSON -->
        <div v-show="activeTab === 'example'" class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="font-medium text-slate-700">Mẫu snippets.json hợp lệ:</span>
            <button
              class="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 active:scale-95 transition-all"
              @click="handleCopy"
            >
              <UntitledIcon :name="copied ? 'check-circle' : 'copy'" :size="12" :class="copied ? 'text-emerald-600' : ''" />
              <span>{{ copied ? 'Đã copy!' : 'Copy mẫu JSON' }}</span>
            </button>
          </div>
          <div class="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-900 text-slate-200">
            <pre class="max-h-[360px] overflow-auto p-3 font-mono text-[11px] leading-relaxed">{{ exampleJson }}</pre>
          </div>
        </div>

        <!-- TAB 3: XỬ LÝ CODE DÀI (1000+ DÒNG) -->
        <div v-show="activeTab === 'large_code'" class="space-y-3">
          <div class="rounded-lg border border-blue-200 bg-blue-50/70 p-3 text-blue-900 space-y-1.5">
            <div class="font-semibold flex items-center gap-1.5 text-blue-950">
              <UntitledIcon name="code-02" :size="15" class="text-blue-600" />
              Khi đoạn mã của bạn rất dài (vài trăm đến 1000+ dòng code)?
            </div>
            <p class="text-[11.5px] text-blue-800 leading-snug">
              Nếu bạn cố nhét 1000 dòng code trực tiếp vào chuỗi string <code>"code": "..."</code> bên trong file JSON, file JSON sẽ rất nặng, khó đọc và rất dễ dính lỗi cú pháp escape (như dấu ngoặc kép <code>\"</code>, backslash <code>\\</code>).
            </p>
          </div>

          <div class="space-y-2">
            <h4 class="font-semibold text-slate-900">Cách làm chuẩn mực & chuyên nghiệp (Pattern 2 bước):</h4>
            
            <div class="rounded-lg border border-slate-200 bg-white p-3 space-y-3 shadow-sm">
              <div class="space-y-1">
                <div class="font-semibold text-emerald-700 flex flex-wrap items-center gap-1.5 text-xs">
                  <span class="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">Bước 1</span>
                  <span>Tách code dài thành file độc lập</span>
                </div>
                <div class="text-[11px] text-slate-600 pl-1 space-y-0.5">
                  <div>• Vị trí: trong thư mục <code class="font-semibold text-slate-800">assets/</code> hoặc <code class="font-semibold text-slate-800">snippets/</code></div>
                  <div>• Chế độ: <code class="rounded bg-emerald-50 px-1 py-0.5 font-mono text-[10.5px] text-emerald-700 border border-emerald-200">mode: "create"</code></div>
                  <div>• Ví dụ: <code>assets/teeinblue-custom.css</code> hoặc <code>assets/teeinblue-fix.js</code></div>
                </div>
              </div>

              <div class="space-y-1 border-t border-slate-100 pt-2">
                <div class="font-semibold text-blue-700 flex flex-wrap items-center gap-1.5 text-xs">
                  <span class="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-800">Bước 2</span>
                  <span>Link vào layout/theme.liquid (1 dòng duy nhất)</span>
                </div>
                <div class="text-[11px] text-slate-600 pl-1 space-y-0.5">
                  <div>• Vị trí: <code class="font-semibold text-slate-800">layout/theme.liquid</code></div>
                  <div>• Chế độ: <code class="rounded bg-blue-50 px-1 py-0.5 font-mono text-[10.5px] text-blue-700 border border-blue-200">mode: "before-head"</code> hoặc <code class="rounded bg-blue-50 px-1 py-0.5 font-mono text-[10.5px] text-blue-700 border border-blue-200">mode: "before-body"</code></div>
                  <div>• Chỉ cần gọi thẻ link CSS hoặc script JS 1 dòng duy nhất.</div>
                </div>
              </div>

              <!-- Minh họa cấu trúc target -->
              <div class="rounded bg-slate-900 p-2.5 font-mono text-[11px] text-slate-200 leading-relaxed space-y-1 overflow-x-auto">
                <div class="text-emerald-400">// Khai báo trong targets của Snippet:</div>
                <div class="text-slate-400">"targets": [</div>
                <div class="pl-3 text-amber-300">{</div>
                <div class="pl-6"><span class="text-blue-300">"filename"</span>: <span class="text-emerald-300">"assets/teeinblue-app.js"</span>,</div>
                <div class="pl-6"><span class="text-blue-300">"mode"</span>: <span class="text-emerald-300">"create"</span>,</div>
                <div class="pl-6"><span class="text-blue-300">"code"</span>: <span class="text-slate-400">"/* 1000 dòng code JS để ở đây */"</span></div>
                <div class="pl-3 text-amber-300">},</div>
                <div class="pl-3 text-amber-300">{</div>
                <div class="pl-6"><span class="text-blue-300">"filename"</span>: <span class="text-emerald-300">"layout/theme.liquid"</span>,</div>
                <div class="pl-6"><span class="text-blue-300">"mode"</span>: <span class="text-emerald-300">"before-body"</span>,</div>
                <div class="pl-6"><span class="text-blue-300">"code"</span>: <span class="text-emerald-300">"&#123;&#123; 'teeinblue-app.js' | asset_url | script_tag &#125;&#125;"</span></div>
                <div class="pl-3 text-amber-300">}</div>
                <div class="text-slate-400">]</div>
              </div>
            </div>
          </div>

          <div class="rounded-lg border border-slate-200 bg-slate-50 p-2.5 space-y-1 text-slate-600 text-[11px]">
            <div class="font-semibold text-slate-800">Lợi ích của mô hình này:</div>
            <ul class="list-disc pl-4 space-y-0.5">
              <li>File <code>theme.liquid</code> của merchant luôn gọn gàng và sạch sẽ, không bị phình to mã nguồn.</li>
              <li>Khi cần gỡ bỏ hoặc debug, chỉ cần xóa thẻ gọi ở <code>theme.liquid</code> là xong.</li>
              <li>Tận dụng được cơ chế nén CDN (Shopify Asset CDN) cho file JS/CSS giúp tối ưu tốc độ tải trang.</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-[11px] text-slate-500">
        <div class="flex items-center gap-1">
          <UntitledIcon name="info-circle" :size="13" class="text-blue-500" />
          <span>Hỗ trợ cả định dạng bảng Google Sheet (với các cột tương tự)</span>
        </div>
        <button
          class="rounded-md bg-white border border-slate-200 px-3 py-1 font-medium text-slate-700 shadow-sm hover:bg-slate-100"
          @click="emit('close')"
        >
          Đóng
        </button>
      </div>
    </div>
  </div>
</template>
