### 7. Daftar Temuan Masalah Kode

| No | File/Method | Masalah Kode | Prinsip Terkait | Dampak Negatif |
| :---: | :--- | :--- | :--- | :--- |
| 1 | `subscriptionController.js` (Method: `createSubscription` & `handleWebhook`) | **Query Database Bercampur di Controller:** Menulis query SQL langsung seperti `await db.run('INSERT INTO subscriptions...')` di dalam *controller*. | **SRP** (*Single Responsibility Principle*) & **MVC** | *Controller* menjadi bertugas ganda (mengurus HTTP sekaligus *Database Repository*). Sulit dilakukan *Unit Testing* dan jika skema tabel berubah, modifikasi harus dicari satu per satu di banyak *controller*. |
| 2 | `analyticsController.js` (Method: `getDashboardData` & `getSalesAnalysis`) | **Controller Terlalu Gemuk (Fat Controller):** Melakukan agregasi data kompleks (menghitung total profit, pajak, biaya admin) secara manual menggunakan *looping* `forEach`. | **SRP** & **Clean Code** | Kode menjadi sangat panjang dan sulit dibaca. Kinerja lambat jika data ribuan. Seharusnya perhitungan ini diserahkan kepada fungsi bawaan database (seperti `SUM`, `GROUP BY`) atau dipindah ke *Service Layer* terpisah. |
| 3 | `subscriptionController.js` (Method: `handleWebhook` & `verifyPaymentStatus`) | **Kode Duplikat (Duplicated Code):** Logika penentuan status Midtrans (`if (transactionStatus === 'capture') ...`) ditulis berulang-ulang dengan blok kode yang identik di dua fungsi berbeda. | **DRY** (*Don't Repeat Yourself*) | Peluang *bug* tinggi. Jika ke depannya ada perubahan logika status pembayaran dari Midtrans, *developer* harus memperbarui kode tersebut di banyak tempat. |
| 4 | `authController.js` (Method: `register`) | **Validasi Tidak Terpusat:** Mengecek validitas peran *(role)* pengguna secara manual `!['user', 'admin', 'lecturer'].includes(userRole)` langsung di tengah fungsi registrasi. | **Separation of Concerns** & **SRP** | Logika validasi *request* bercampur dengan logika bisnis inti (*hash password* & simpan pengguna). Jika aplikasi makin kompleks, validasi bertebaran di mana-mana. Sebaiknya menggunakan *Middleware Validator* khusus. |
| 5 | `subscriptionController.js` (Method: `handleWebhook`) | **Hardcode / Magic Numbers:** Menggunakan angka statis `const durationDays = 7;` untuk durasi premium. | **OCP** (*Open/Closed Principle*) | Aplikasi menjadi tidak fleksibel (*closed for extension*). Jika perusahaan ingin merilis paket langganan 30 hari atau 1 tahun, *developer* terpaksa merombak/mengubah fungsi inti ini lagi. |

---

### 8. Analisis Perubahan (Before-After)

**Nama Temuan:** Kode Duplikat (Duplicated Code) pada Logika Penentuan Status Pembayaran

**Lokasi Kode:** `backend/controllers/subscriptionController.js` (Method: `handleWebhook` dan `verifyPaymentStatus`)

**Kode Sebelum:**
```javascript
// Ditemukan berulang secara identik di fungsi handleWebhook dan verifyPaymentStatus
let finalStatus = 'pending';

if (transactionStatus === 'capture') {
  if (fraudStatus === 'challenge') {
    finalStatus = 'pending';
  } else if (fraudStatus === 'accept') {
    finalStatus = 'settlement';
  }
} else if (transactionStatus === 'settlement') {
  finalStatus = 'settlement';
} else if (transactionStatus === 'cancel' || transactionStatus === 'deny') {
  finalStatus = 'cancel';
} else if (transactionStatus === 'expire') {
  finalStatus = 'expire';
}
```

**Masalah:** 
Kode di atas merupakan blok percabangan kompleks (*nested if-else*) untuk menerjemahkan status transaksi Midtrans ke status lokal database. Masalah utamanya adalah blok kode ini di-salin-tempel (*copy-paste*) secara persis di dua metode *controller* yang berbeda (`handleWebhook` dan `verifyPaymentStatus`). Secara teknis, ini menghasilkan redundansi yang sangat tinggi.

**Prinsip yang Dilanggar:** 
*   **DRY (*Don't Repeat Yourself*):** Setiap bagian kecil dari pengetahuan perangkat lunak harus memiliki representasi tunggal dan otoritatif di dalam sistem.
*   **High Cohesion:** Kode tidak menyatu secara padu; *controller* HTTP justru berisi logika *mapping* data eksternal.

**Strategi Refactoring:** 
Melakukan ekstraksi (*Extract Method*) terhadap blok kode percabangan tersebut menjadi sebuah fungsi utilitas (*helper function*) yang berdiri sendiri. Fungsi tunggal ini kemudian dipanggil oleh kedua *controller*, sehingga hanya ada satu tempat terpusat untuk memodifikasi logika status.

**Kode Sesudah:**
```javascript
// 1. Dibuat Helper Function di luar Controller (atau di file /utils/midtransHelper.js)
const mapMidtransStatus = (transactionStatus, fraudStatus, currentStatus = 'pending') => {
  if (transactionStatus === 'capture') {
    return fraudStatus === 'challenge' ? 'pending' : 'settlement';
  }
  if (transactionStatus === 'settlement') return 'settlement';
  if (['cancel', 'deny'].includes(transactionStatus)) return 'cancel';
  if (transactionStatus === 'expire') return 'expire';
  
  return currentStatus; // Default fallback
};

// 2. Pemanggilan di dalam handleWebhook & verifyPaymentStatus
const finalStatus = mapMidtransStatus(transactionStatus, fraudStatus, subscription.status);
```

**Dampak Perbaikan:** 
1. **Keterbacaan (Readability):** Ukuran *controller* menjadi jauh lebih ringkas (*thin controller*). Ekstraksi logika ke fungsi terpisah dengan penamaan yang deskriptif membuat tujuan kode dapat dipahami dalam sekali lihat.
2. **Kemudahan Pemeliharaan (Maintainability):** Jika dokumentasi Midtrans kelak menambahkan status baru (misalnya status `refund`), pengembang (*developer*) hanya perlu menambahkannya di satu fungsi `mapMidtransStatus`, menghindari potensi *bug* akibat kelupaan memodifikasi *controller* lainnya.
3. **Pengujian (Testability):** Fungsi terisolasi `mapMidtransStatus` kini bisa diuji menggunakan *Unit Testing* secara mandiri dengan berbagai parameter tanpa perlu membuat tiruan (*mocking*) HTTP *Request/Response*.
