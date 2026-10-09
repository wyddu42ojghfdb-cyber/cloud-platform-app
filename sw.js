const CACHE_NAME = 'cloud-app-v2'; // قمنا بتغيير الإصدار هنا لإجبار المتصفح على مسح القديم
const ASSETS = [
  '/panel',
  '/index.html',
  '/admin.html'
];

// 1️⃣ تثبيت وتخزين الصفحات الأساسية فقط
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// 2️⃣ تفعيل السيرفيس وركر وحذف أي كاش قديم مجمّد فوراً
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('🗑️ Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3️⃣ التحكم الذكي بالطلبات (السماح للأزرار والـ API بالمرور حياً لقاعدة البيانات)
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // ⚠️ استثناء حاسم: إذا كان الطلب يتجه إلى السيرفر أو الـ API (مثل أزرار السحب والإيداع وحفظ الاسم)
  // لا تقم بأخذه من الكاش أبداً! دعه يمر حياً مباشرة لقاعدة البيانات لكي يتصل المشرف بالمستخدم
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // بالنسبة للصفحات العادية (HTML/CSS)، يتم جلبها من الإنترنت أولاً، وإذا انقطع الاتصال يتم تشغيل الكاش
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // تحديث الكاش بالنسخة الجديدة المستلمة من Render حياً
        if (e.request.method === 'GET' && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // في حال انقطاع الإنترنت التام، قم بتشغيل النسخة المخزنة
        return caches.match(e.request);
      })
  );
});
