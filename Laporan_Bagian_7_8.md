### 7. Daftar Temuan Masalah Kode (Update dari Codingan Terbaru)

| No | File/Method | Masalah Kode | Prinsip Terkait | Dampak Negatif |
| :---: | :--- | :--- | :--- | :--- |
| 1 | `backend/config/db.js` (fungsi `initDb`) | **Fallback ke SQLite tanpa pemberitahuan yang jelas** saat MySQL tidak tersambung, sehingga aplikasi dapat berjalan dengan basis data berbeda secara diam-diam. | **Reliability**, **Configuration Management** | Data bisa terpisah antara environment pengembangan dan produksi, hasil analitik menjadi tidak konsisten, dan debugging menjadi sulit karena sistem tidak menunjukkan secara eksplisit bahwa fallback aktif. |
| 2 | `backend/config/db.js` (fungsi `normalizeSql`) | **Transformasi SQL manual berbasis regex** untuk menyesuaikan MySQL dan SQLite sangat rapuh terhadap perubahan skema atau query kompleks. | **Maintainability**, **Portability** | Query yang berisi syntax khusus bisa salah dikonversi, sehingga bug muncul hanya pada satu database, terutama saat fitur baru ditambahkan. |
| 3 | `backend/config/db.js` (variabel global `useSqlite`) | **State global yang berubah-ubah** dapat menyebabkan kondisi race condition jika ada request bersamaan. | **Thread Safety**, **Single Responsibility** | Transaksi bisa berjalan pada backend yang salah mode (MySQL vs SQLite) sehingga data tidak konsisten atau query gagal secara acak. |
| 4 | `backend/config/db.js` (fungsi `seedLocalDataIfEmpty`) | **Data awal bersifat acak dan tidak deterministik** pada saat seed lokal. | **Determinism**, **Testability** | Dashboard dan laporan bisa berubah setiap kali database baru dibuat, sehingga hasil presentasi tidak stabil dan pengujian regresi sulit dilakukan. |
| 5 | `backend/config/db.js` (skema `subscriptions`) | **Tidak ada index pada kolom pencarian utama** seperti `user_id`, `status`, dan `plan_type`. | **Performance**, **Database Design** | Query untuk cek status langganan atau update status pembayaran bisa lambat ketika jumlah data meningkat. |
| 6 | `backend/controllers/subscriptionController.js` (method `createSubscription`) | **Fallback mapping nominal ke paket secara hardcode** dengan `req.body.amount === 30000 ? '1_month' : ...`. | **OCP**, **Clean Code** | Jika ada paket baru, logika harus diubah manual di controller; risiko inkonsistensi dan kesalahan mapping meningkat. |
| 7 | `backend/controllers/subscriptionController.js` (method `createSubscription`) | **Pembuatan order dan penyimpanan subscription belum menggunakan transaksi atomik**. | **Atomicity**, **Data Integrity** | Jika payment session dibuat tetapi insert ke `subscriptions` gagal, sistem meninggalkan data tidak konsisten dan order menjadi sia-sia. |
| 8 | `backend/controllers/subscriptionController.js` (method `handleWebhook`) | **Validasi signature Midtrans tidak sepenuhnya dipakai saat mock key aktif** sehingga webhook bisa dipalsukan di mode demo. | **Security** | Risiko penipuan transaksi sangat tinggi pada mode mock, terutama saat aplikasi diuji oleh user yang tidak dipercaya. |
| 9 | `backend/controllers/subscriptionController.js` (method `handleWebhook` & `verifyPaymentStatus`) | **Logika status pembayaran masih tersebar di beberapa fungsi** walaupun ada beberapa perbaikan, sehingga perubahan status baru masih rentan terlupakan di satu titik. | **DRY**, **Maintainability** | Saat Midtrans menambah status baru, satu fungsi bisa berubah dan fungsi lain tetap stale, mengakibatkan status premium salah. |
| 10 | `backend/controllers/subscriptionController.js` (method `verifyPaymentStatus`) | **Pengecekan status Midtrans tanpa timeout eksplisit** pada `axios.get` bisa membuat request menggantung lama. | **Reliability**, **Performance** | Proses verifikasi dapat menunggu terlalu lama dan mengganggu UX saat gateway lambat atau offline. |
| 11 | `backend/controllers/subscriptionController.js` (method `handleWebhook`) | **Pencatatan bank hanya dilakukan ketika status === settlement**, tetapi tidak ada pemeriksaan apakah transaksi sudah pernah dicatat. | **Idempotency** | Jika webhook atau verify dipanggil berulang, data bank bisa duplikat dan revenue summary menjadi tidak akurat. |
| 12 | `backend/controllers/analyticsController.js` (fungsi `fetchLedgerData`) | **Fallback ke mock ledger hanya berdasarkan error gateway**, tanpa mekanisme retry atau status sumber data yang jelas. | **Resilience**, **Monitoring** | Sistem bisa menyembunyikan masalah jaringan dan menghasilkan angka yang tidak mewakili data nyata, sehingga keputusan bisnis salah. |
| 13 | `backend/controllers/analyticsController.js` (method `syncExternalData`) | **Insert transaksi dilakukan satu per satu** tanpa bulk insert atau transaction wrapper. | **Performance**, **Atomicity** | Sync data besar menjadi lambat dan jika gagal di tengah proses, beberapa data tersimpan sementara sebagian lainnya belum masuk. |
| 14 | `backend/controllers/analyticsController.js` (method `syncExternalData`) | **Sinkronisasi tidak melakukan upsert** terhadap data yang sama, hanya memeriksa `id` lalu insert jika belum ada. | **Data Quality**, **Consistency** | Data yang berubah di sumber eksternal tidak akan diperbarui di local database, sehingga dashboard menjadi stale. |
| 15 | `backend/controllers/analyticsController.js` (fungsi `fetchLocalLedgerData`) | **Penggabungan data dari tiga tabel diambil secara manual** dan diubah ke struktur yang sama. | **Separation of Concerns** | Logika transformasi data tersebar di controller; jika ada perubahan sumber data, perubahan membutuhkan modifikasi di banyak titik. |
| 16 | `backend/controllers/analyticsController.js` (method `getDashboardData`) | **Perhitungan agregasi dilakukan di controller dengan loop manual** sehingga area ini rawan error. | **SRP**, **Clean Code** | Kode lebih panjang, sulit diuji, dan mudah salah hitung ketika ada perubahan aturan bisnis. |
| 17 | `backend/controllers/analyticsController.js` (method `getSalesAnalysis`) | **Filter dan grouping dijalankan di memory** untuk dataset besar. | **Scalability** | Ketika data transaksi bertambah banyak, response bisa lambat atau bahkan timeout. |
| 18 | `backend/controllers/analyticsController.js` (method `getCashflowAnalysis`) | **Tambahan total tax dan fee diperlakukan secara manual per transaksi** tanpa definisi aturan yang terpusat. | **Business Rule Centralization** | Jika kebijakan pajak atau fee berubah, developer harus mengubah banyak tempat dan mungkin melewatkan satu kasus. |
| 19 | `backend/controllers/analyticsController.js` (method `getReports`) | **Tidak ada pagination atau batas data** untuk laporan. | **Performance**, **Usability** | Laporan bisa mengembalikan ratusan ribu record sekaligus dan membuat frontend atau browser menjadi berat. |
| 20 | `backend/controllers/authController.js` (method `register`) | **Validasi role dan username masih dicampur dalam business logic**. | **Separation of Concerns** | Ini membuat fungsi register terlalu banyak tanggung jawab dan sulit dipelihara seiring penambahan rule validasi lain. |
| 21 | `backend/middleware/validation.js` (function `validateSubscription`) | **Validasi hanya mengecek `planId` atau `amount`, tetapi tidak memvalidasi konsistensi keduanya**. | **Input Validation** | User bisa mengirim `planId: 1_month` dengan `amount: 10000` yang tidak sesuai, menghasilkan data tidak valid. |
| 22 | `backend/middleware/auth.js` (middleware `authenticateToken`) | **Token claims tidak divalidasi terhadap role/expiry state yang diupdate di DB** pada every request. | **Security**, **Performance** | Memakan resource tambahan dan bisa memicu masalah stale state jika database berubah saat token masih aktif. |
| 23 | `backend/server.js` | **CORS diaktifkan dengan `origin: '*'`** untuk semua origin. | **Security** | Menyebabkan aplikasi rentan terhadap cross-origin abuse dan tidak sesuai prinsip least privilege pada lingkungan produksi. |
| 24 | `backend/middleware/logger.js` | **Logger mungkin menyimpan `errorMessage` atau token sensitif** ke tabel log jika ada error. | **Security**, **Privacy** | Data sensitif dapat terekspos di log audit yang bisa diakses oleh pengguna tertentu. |
| 25 | `backend/create_db.js` | **Pembuatan database masih dilakukan secara manual melalui skrip terpisah** tanpa migrasi versioned. | **Deployment**, **Maintainability** | Saat ada perubahan skema, proses deployment menjadi manual dan rawan missed migration. |

---

### 8. Analisis Perubahan (Before-After) dan Dampak Perbaikannya

#### 8.1 Perbaikan Koneksi Database dan Env Configuration
**Masalah Sebelum:**
- Nilai konfigurasi database di `.env` tidak selalu sinkron dengan service yang aktif, sehingga backend sempat fallback ke SQLite ketika `umkm_insight` tidak ditemukan.
- Akibatnya, data transaksi mengalir ke database yang berbeda dan analitik menjadi tidak konsisten.

**Perubahan yang Dilakukan:**
- Mengonfirmasi dan menyesuaikan `.env` dengan `DB_HOST`, `DB_USER`, `DB_PASSWORD`, dan `DB_NAME` yang benar.
- Menjalankan skrip `create_db.js` agar database `umkm_insight` dibuat terlebih dahulu.
- Memperbaiki skema `AUTO_INCREMENT` pada `api_logs` agar MySQL tidak error saat startup.

**Dampak Perbaikan:**
1. **Stabilitas Startup Meningkat**: Backend tidak lagi otomatis pindah ke SQLite saat database yang benar ada.
2. **Konsistensi Data**: Semua data subscription, user, bank, dan analitik tersimpan di basis data yang sama.
3. **Debugging Lebih Mudah**: Error database yang tadinya tersembunyi menjadi lebih jelas dan dapat ditelusuri dengan cepat.

#### 8.2 Perbaikan Alur Subscription dan Paket Langganan
**Masalah Sebelum:**
- Checkout hanya mengandalkan nominal, sehingga backend tidak mengetahui paket yang dipilih secara eksplisit.
- Paket yang tersedia tidak bisa dipilih dengan jelas dari UI karena flow tidak memiliki `planId` yang konsisten.

**Perubahan yang Dilakukan:**
- Menambahkan endpoint `GET /subscription/plans` agar frontend mendapatkan daftar paket lengkap.
- Mengubah proses checkout agar frontend mengirim `planId` saat memilih paket, bukan sekadar nominal.
- Menambah paket `7_days`, `1_month`, `3_months`, dan `1_year` ke konfigurasi subscription.

**Dampak Perbaikan:**
1. **Alur Pembayaran Lebih Jelas**: Sistem tahu durasi premium yang dipilih, bukan sekadar nominal acak.
2. **Pengelolaan Paket Lebih Mudah**: Penambahan paket baru dapat dilakukan tanpa mengubah logika mapping nominal di controller.
3. **Keakuratan Audit**: Data bank dan premium expiry lebih konsisten karena durasi disimpan dan digunakan secara eksplisit.

#### 8.3 Perbaikan Sinkronisasi Data Analytics dan Bank Ledger
**Masalah Sebelum:**
- Data eksternal tidak selalu tersimpan ke database lokal karena endpoint sync belum benar-benar terhubung.
- Bank transaction hanya tercatat jika ada settlement, tetapi belum jelas apakah data sudah masuk ke laporan.

**Perubahan yang Dilakukan:**
- Menambahkan `POST /analytics/sync` yang memanggil sumber data eksternal atau fallback mock lalu menyimpan transaksi ke tabel lokal.
- Mengaitkan settlement subscription dengan pencatatan bank ledger ke `bank_transactions`.
- Menyediakan `GET /bank/transactions` untuk menampilkan summary pendapatan dan daftar transaksi yang masuk.

**Dampak Perbaikan:**
1. **Dashboard Lebih Akurat**: Data dari marketplace, POS, dan supplier siap dipakai untuk analitik lokal.
2. **Pendapatan Langganan Terpantau**: Revenue dari subscription langsung tercatat di bank ledger sehingga audit keuangan lebih rapi.
3. **Integrasi Frontend Lebih Kuat**: UI bisa menampilkan grafik dan ringkasan dari data lokal yang sudah disinkronisasi tanpa bergantung pada sumber eksternal langsung.

#### 8.4 Perbaikan Umum yang Masih Dibutuhkan Setelah Update
**Masalah yang masih tersisa setelah perbaikan awal:**
- beberapa validasi masih perlu diperkuat (misalnya konsistensi `amount` dengan `planId`),
- transaksi besar masih perlu menggunakan mekanisme batch/transaction untuk menghindari inkonsistensi,
- skema database masih perlu di-upgrade ke migration system agar deploy lebih aman,
- CORS dan security policy masih perlu dibatasi untuk lingkungan produksi.

**Kesimpulan Umum:**
Perbaikan yang sudah dilakukan berhasil mengurangi banyak masalah operasional yang muncul selama pengembangan, terutama terkait database, paket subscription, dan sinkronisasi analytics. Namun, untuk sistem yang benar-benar siap produksi, masih diperlukan penguatan pada aspek security, performance, dan schema management agar risiko bug dan inkonsistensi data semakin kecil.
