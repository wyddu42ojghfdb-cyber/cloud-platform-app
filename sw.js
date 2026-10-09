const CACHE_NAME = 'cloud-platform-v3'; // إصدار جديد ومحدث لإجبار المتصفح على مسح الكاش الميت القديم
const ASSETS = [
  '/panel',
  '/index.html',
  '/admin.html'
];

// 1️⃣ تثبيت السيرفيس وركر وتخزين الصفحات الرسومية الأساسية
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// 2️⃣ تفعيل الخدمة وحذف كاش النسخة القديمة التي كانت تسبب تجميد الأزرار
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('🗑️ Removing expired cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3️⃣ التحكم الذكي بالاتصال السحابي وتمرير طلبات الإيداع والسحب حياً لقاعدة البيانات
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // ⚠️ استثناء حاسم: إذا كان الطلب يتجه إلى خادم الـ API والعمليات (مثل حفظ الاسم أو السحب والإيداع)
  // يتم تمريره حياً ومباشرة للخادم السحابي دون حجز أو تجميد في ذاكرة الكاش
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // بالنسبة لملفات التصميم، يتم جلبها من الإنترنت وتحديث الكاش، وفي حال انقطاع الشبكة يتم تشغيل الكاش
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        if (e.request.method === 'GET' && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(e.request);
      })
  );
});
