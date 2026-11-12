<script setup lang="ts">
import { ref } from 'vue';
import UntitledIcon from './UntitledIcon.vue';

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const activeSection = ref<'overview' | 'storefront' | 'admin' | 'code'>('overview');
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
          <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-brand-600 ring-1 ring-blue-500/20">
            <UntitledIcon name="code-02" :size="15" />
          </div>
          <div>
            <h3 class="text-sm font-semibold text-slate-800">Cơ chế hoạt động Snippet Injector</h3>
            <p class="text-[11px] text-slate-500">Cách phát hiện store, bắt session và can thiệp file theme</p>
          </div>
        </div>
        <button
          class="rounded-lg p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 transition-colors"
          @click="emit('close')"
        >
          <UntitledIcon name="minus-circle" :size="16" class="rotate-45" />
        </button>
      </div>

      <!-- Navigation Tabs (cuộn ngang mượt mà, không bị ép chữ) -->
      <div class="flex border-b border-slate-200 bg-slate-100/70 p-1 text-xs overflow-x-auto no-scrollbar gap-1">
        <button
          class="shrink-0 rounded-md px-3 py-1.5 font-medium transition-all whitespace-nowrap"
          :class="activeSection === 'overview' ? 'bg-white text-blue-700 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'"
          @click="activeSection = 'overview'"
        >
          1. Tổng quan
        </button>
        <button
          class="shrink-0 rounded-md px-3 py-1.5 font-medium transition-all whitespace-nowrap"
          :class="activeSection === 'storefront' ? 'bg-white text-blue-700 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'"
          @click="activeSection = 'storefront'"
        >
          2. Storefront
        </button>
        <button
          class="shrink-0 rounded-md px-3 py-1.5 font-medium transition-all whitespace-nowrap"
          :class="activeSection === 'admin' ? 'bg-white text-blue-700 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'"
          @click="activeSection = 'admin'"
        >
          3. Shopify Admin
        </button>
        <button
          class="shrink-0 rounded-md px-3 py-1.5 font-medium transition-all whitespace-nowrap"
          :class="activeSection === 'code' ? 'bg-white text-blue-700 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'"
          @click="activeSection = 'code'"
        >
          4. Cơ chế Code
        </button>
      </div>

      <!-- Content Body -->
      <div class="flex-1 space-y-3.5 overflow-y-auto p-4 text-xs leading-relaxed text-slate-700">
        <!-- 1. TỔNG QUAN FLOW -->
        <div v-show="activeSection === 'overview'" class="space-y-3">
          <div class="rounded-lg border border-blue-100 bg-blue-50/50 p-2.5">
            <span class="font-semibold text-blue-900">Mục đích chính:</span>
            Giúp supporter/developer tiêm (inject) các file snippet Liquid/CSS/JS sửa lỗi vào theme Shopify của khách hàng trực tiếp từ Sidepanel mà không cần thao tác code thủ công trong theme editor.
          </div>

          <div class="space-y-2">
            <h4 class="font-semibold text-slate-900 flex items-center gap-1.5">
              <UntitledIcon name="git-branch" :size="14" class="text-blue-600" />
              Sơ đồ luồng hoạt động (Architecture Flow)
            </h4>
            <div class="rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-[11px] text-slate-600 space-y-1">
              <div>[Browser Tab: Storefront/Admin]</div>
              <div class="text-blue-600">   ↓ (Content Script sniff window.Shopify / fetch request)</div>
              <div>[Background Service Worker] ↔ [Tab Registry & Active Tracker]</div>
              <div class="text-emerald-600">   ↓ (Giao tiếp message 2 chiều)</div>
              <div>[Sidepanel UI] → Target Theme Match & Gửi lệnh GraphQL Inject</div>
            </div>
          </div>

          <div class="space-y-1.5">
            <h4 class="font-semibold text-slate-900">Các điều kiện cần:</h4>
            <ul class="list-disc pl-4 space-y-1 text-slate-600">
              <li><b>Quyền hạn Shopify:</b> Cần có ít nhất 1 tab đăng nhập Shopify Admin (qua tài khoản nhân viên hoặc Shopify Partner Collaborator).</li>
              <li><b>Nguồn Snippet:</b> Đường dẫn file Raw JSON từ Github (hoặc Google Sheet) chứa định nghĩa snippet.</li>
              <li><b>Bắt Session:</b> Tab Admin cần truy cập vào mục <code>Online Store → Themes</code> để cấp quyền session ghi file.</li>
            </ul>
          </div>
        </div>

        <!-- 2. PHÍA STOREFRONT -->
        <div v-show="activeSection === 'storefront'" class="space-y-3">
          <div class="rounded-lg border border-purple-100 bg-purple-50/50 p-2.5 text-purple-900">
            <span class="font-semibold">Bên ngoài cửa hàng (Storefront):</span>
            Extension chỉ đóng vai trò <b>Read-only Inspector</b> (đọc dữ liệu ngữ cảnh mà không làm ảnh hưởng tốc độ tải của khách).
          </div>

          <div class="space-y-2">
            <h4 class="font-semibold text-slate-900">Dữ liệu bóc tách từ Storefront:</h4>
            <div class="overflow-hidden rounded-lg border border-slate-200">
              <table class="w-full text-left text-[11px]">
                <thead class="bg-slate-100 text-slate-700">
                  <tr>
                    <th class="p-2">Dữ liệu</th>
                    <th class="p-2">Nguồn trích xuất</th>
                    <th class="p-2">Mục đích</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 bg-white">
                  <tr>
                    <td class="p-2 font-mono text-blue-600">Store Handle</td>
                    <td class="p-2 font-mono text-slate-500">window.Shopify.shop</td>
                    <td class="p-2">Khớp nối với tab Admin tương ứng</td>
                  </tr>
                  <tr>
                    <td class="p-2 font-mono text-blue-600">Theme ID</td>
                    <td class="p-2 font-mono text-slate-500">window.Shopify.theme.id</td>
                    <td class="p-2">Khóa & auto-select đúng theme đang xem thử</td>
                  </tr>
                  <tr>
                    <td class="p-2 font-mono text-blue-600">Schema Name</td>
                    <td class="p-2 font-mono text-slate-500">Shopify.theme.schema_name</td>
                    <td class="p-2">Lọc snippet phù hợp (Dawn, Debut, Turbo...)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 text-amber-900">
            <div class="font-semibold flex items-center gap-1 mb-1">
              <UntitledIcon name="alert-triangle" :size="13" class="text-amber-600" />
              Cơ chế an toàn Storefront (Theme Safety Guard)
            </div>
            Khi bạn đang đứng ở tab Storefront có truyền tham số <code>?preview_theme_id=...</code>, dropdown Target Theme sẽ <b>tự động bị khóa</b> vào theme đó nhằm ngăn chặn rủi ro ghi nhầm mã vào Live Theme của khách. Muốn chọn theme khác, bạn phải tích chọn mở khóa.
          </div>
        </div>

        <!-- 3. PHÍA SHOPIFY ADMIN -->
        <div v-show="activeSection === 'admin'" class="space-y-3">
          <div class="rounded-lg border border-emerald-100 bg-emerald-50/50 p-2.5 text-emerald-900">
            <span class="font-semibold">Bên trong Shopify Admin:</span>
            Extension can thiệp vào trang Themes thông qua <code>MAIN world script bridge</code> để ủy quyền gọi GraphQL API hợp lệ của Shopify.
          </div>

          <div class="space-y-2">
            <h4 class="font-semibold text-slate-900">Bắt Session & CSRF Token:</h4>
            <p class="text-slate-600">
              Shopify Admin chạy ứng dụng Online Store qua iframe/proxy (<code>online-store-web.shopifyapps.com</code>). Bridge hook vào <code>window.fetch</code> của trang:
            </p>
            <ul class="list-disc pl-4 space-y-1 text-slate-600">
              <li>Đọc header <code>x-csrf-token</code> được Shopify sinh ra tự nhiên khi load trang.</li>
              <li>Chủ động chạy GraphQL query <code>ThemeQuery</code> để lấy danh sách toàn bộ theme (Live & Drafts) mà không cần đợi Shopify tải xong UI.</li>
              <li>Gửi dữ liệu qua <code>window.postMessage</code> $\rightarrow$ <code>admin-relay.js</code> (isolated world) $\rightarrow$ <code>background.js</code>.</li>
            </ul>
          </div>

          <div class="space-y-1.5">
            <h4 class="font-semibold text-slate-900">Ưu tiên tab đa cửa hàng:</h4>
            <p class="text-slate-600">
              Nếu bạn mở nhiều tab Shopify Admin của các cửa hàng khác nhau, Background Service Worker ghi nhận <code>lastActiveTs</code> (timestamp kích hoạt tab). Khi bạn chuyển sang Storefront hay tab bất kỳ, Extension sẽ ưu tiên tab Admin của store tương ứng hoặc tab Admin bạn vừa thao tác gần nhất.
            </p>
          </div>
        </div>

        <!-- 4. CƠ CHẾ CODE & INJECT -->
        <div v-show="activeSection === 'code'" class="space-y-3">
          <div class="space-y-2">
            <h4 class="font-semibold text-slate-900">Quy trình ghi file vào Theme (GQL Mutations):</h4>
            <div class="space-y-2">
              <div class="rounded-md border border-slate-200 bg-slate-50 p-2 font-mono text-[11px]">
                <div class="text-blue-600 font-semibold">// 1. Đọc danh sách file hiện có</div>
                <div>query ListFiles($themeId: ID!) { ... }</div>
                <div class="text-emerald-600 font-semibold mt-1.5">// 2. Upsert file mã (Create / Insert / Append)</div>
                <div>mutation WriteFiles($themeId: ID!, $files: [...]) { ... }</div>
              </div>
            </div>
          </div>

          <div class="space-y-1.5">
            <h4 class="font-semibold text-slate-900">Marker & Rollback an toàn:</h4>
            <ul class="list-disc pl-4 space-y-1 text-slate-600">
              <li>
                <b>Marker Comment:</b> Mỗi đoạn mã chèn vào (ví dụ <code>theme.liquid</code>) đều được kẹp giữa 2 comment đánh dấu:
                <div class="my-1 rounded bg-slate-100 p-1.5 font-mono text-[10px] text-slate-700">
                  &lt;!-- tib-snippet:ID start - &lt;giá trị inject&gt; - &lt;ghi chú&gt; --&gt;<br />
                  ... nội dung mã ...<br />
                  &lt;!-- tib-snippet:ID end --&gt;
                </div>
              </li>
              <li>
                <b>Lịch sử Undo:</b> Trước khi ghi đè, Extension lưu lại snapshot nội dung cũ vào <code>chrome.storage.local</code>. Supporter có thể bấm nút <b>Undo</b> bất cứ lúc nào để trả lại nguyên vẹn file cũ.
              </li>
              <li>
                <b>Live Theme Warning:</b> Khi theme mục tiêu có role là <code>main</code> (đang chạy thực tế), modal xác nhận chuyển sang cảnh báo màu đỏ nhằm tránh bất cẩn.
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-[11px] text-slate-500">
        <div class="flex items-center gap-1">
          <UntitledIcon name="check-circle" :size="13" class="text-emerald-500" />
          <span>Teeinblue Technical Support Extension v1.0.0</span>
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
