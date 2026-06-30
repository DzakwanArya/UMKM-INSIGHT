# Dokumentasi REST API - UMKM Insight

Dokumen ini berisi spesifikasi lengkap mengenai REST API yang digunakan pada aplikasi **UMKM Insight**. API ini menghubungkan frontend (Next.js) dengan backend (Express.js & MySQL Laragon) untuk mengelola data autentikasi, analisis keuangan, serta transaksi pembayaran premium via Midtrans.

---

## Informasi Umum

* **Base URL Lokal:** `http://localhost:5000/api`
* **Format Data:** JSON (`Content-Type: application/json`)
* **Autentikasi:** Menggunakan JSON Web Token (JWT). Endpoint yang membutuhkan autentikasi harus menyertakan token pada header HTTP:
  ```http
  Authorization: Bearer <your_jwt_token>
  ```

---

## Ringkasan Endpoint

| Kategori | Metode | Endpoint | Proteksi | Keterangan |
| :--- | :--- | :--- | :--- | :--- |
| **Autentikasi** | `POST` | `/auth/register` | Publik | Mendaftarkan pengguna baru (Umum/Dosen/Admin) |
| | `POST` | `/auth/login` | Publik | Masuk ke sistem dan mendapatkan token JWT |
| | `GET` | `/auth/profile` | JWT | Mengambil profil pengguna yang sedang login |
| **Analitis** | `GET` | `/analytics/dashboard` | JWT | Mengambil metrik ringkasan dashboard dan grafik |
| | `GET` | `/analytics/sales` | JWT | Mengambil analisis penjualan (bisa difilter) |
| | `GET` | `/analytics/cashflow` | JWT | Mengambil analisis arus kas masuk & keluar |
| | `GET` | `/analytics/reports` | JWT + Premium | Mengambil data laporan transaksi penuh untuk ekspor |
| **Langganan** | `POST` | `/subscription/create` | JWT | Memulai pembayaran langganan (Snap Token) |
| | `GET` | `/subscription/status` | JWT | Memeriksa status premium pengguna saat ini |
| | `POST` | `/subscription/verify/:orderId` | JWT | Memverifikasi status pembayaran langsung ke Midtrans |
| | `POST` | `/subscription/webhook` | Publik | Menerima notifikasi status transaksi dari Midtrans |
| | `POST` | `/subscription/simulate-payment`| Publik | Mensimulasikan pembayaran sukses/gagal (offline) |

---

## Detail Spesifikasi Endpoint

### 1. Kategori: Autentikasi (`/auth`)

#### 1.1 Mendaftarkan Pengguna Baru
Mendaftarkan akun pengguna dengan peran tertentu.
* **Metode:** `POST`
* **Endpoint:** `/auth/register`
* **Request Body:**
  ```json
  {
    "username": "budi_umkm",
    "password": "secretpassword123",
    "role": "user"
  }
  ```
  *(Catatan: `role` yang diperbolehkan: `'user'`, `'lecturer'`, `'admin'`)*
* **Response Sukses (201 Created):**
  ```json
  {
    "message": "User registered successfully",
    "userId": "usr-8a2b3c4d"
  }
  ```
* **Response Error (400 Bad Request):**
  ```json
  {
    "error": "Username already exists"
  }
  ```

#### 1.2 Masuk ke Sistem
Verifikasi kredensial dan menghasilkan token JWT untuk akses rute terproteksi.
* **Metode:** `POST`
* **Endpoint:** `/auth/login`
* **Request Body:**
  ```json
  {
    "username": "budi_umkm",
    "password": "secretpassword123"
  }
  ```
* **Response Sukses (200 OK):**
  ```json
  {
    "message": "Login successful",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "usr-8a2b3c4d",
      "username": "budi_umkm",
      "role": "user",
      "is_premium": 0
    }
  }
  ```
* **Response Error (401 Unauthorized):**
  ```json
  {
    "error": "Invalid username or password"
  }
  ```

#### 1.3 Ambil Profil Pengguna
Mengembalikan informasi profil lengkap dari pengguna yang sedang aktif berdasarkan token JWT.
* **Metode:** `GET`
* **Endpoint:** `/auth/profile`
* **Headers:** `Authorization: Bearer <token>`
* **Response Sukses (200 OK):**
  ```json
  {
    "id": "usr-8a2b3c4d",
    "username": "budi_umkm",
    "role": "user",
    "is_premium": 1,
    "premium_until": "2026-06-30 14:00:00",
    "created_at": "2026-06-10T15:00:00Z"
  }
  ```

---

### 2. Kategori: Analitis Keuangan (`/analytics`)

#### 2.1 Ringkasan Dashboard
Menyajikan data agregasi keuangan utama (total pemasukan, pengeluaran, laba bersih, potongan, pajak) serta data grafik tren penjualan 7 hari terakhir.
* **Metode:** `GET`
* **Endpoint:** `/analytics/dashboard`
* **Headers:** `Authorization: Bearer <token>`
* **Response Sukses (200 OK):**
  ```json
  {
    "summary": {
      "totalInflow": 4500000,
      "totalOutflow": 1200000,
      "totalFees": 45000,
      "totalTaxes": 450000,
      "netProfit": 2805000,
      "totalTransactions": 142,
      "isPremium": true
    },
    "charts": {
      "salesTrend": [
        { "date": "2026-06-20", "sales": 450000, "expense": 120000, "transactions": 12 },
        { "date": "2026-06-21", "sales": 600000, "expense": 150000, "transactions": 15 }
      ],
      "categorySplit": [
        { "name": "Makanan & Minuman", "value": 2500000 },
        { "name": "Pakaian", "value": 2000000 }
      ]
    }
  }
  ```

#### 2.2 Analisis Penjualan
Mengembalikan daftar transaksi penjualan yang telah difilter beserta ringkasan statistik kontribusi UMKM dan kategori produk.
* **Metode:** `GET`
* **Endpoint:** `/analytics/sales`
* **Headers:** `Authorization: Bearer <token>`
* **Query Parameters (Opsional):**
  * `umkmId` (string) - Menyaring berdasarkan ID UMKM tertentu.
  * `category` (string) - Menyaring kategori produk (misal: `Pakaian`).
  * `startDate` (string, YYYY-MM-DD) - Batas awal tanggal transaksi.
  * `endDate` (string, YYYY-MM-DD) - Batas akhir tanggal transaksi.
* **Response Sukses (200 OK):**
  ```json
  {
    "summary": {
      "totalSales": 2500000,
      "salesCount": 45,
      "averageBasket": 55555
    },
    "byUmkm": [
      { "name": "Warung Berkah", "total": 1500000, "count": 25 }
    ],
    "byCategory": [
      { "name": "Makanan & Minuman", "total": 2500000, "count": 45 }
    ],
    "transactions": [
      { "tx_id": "TX-20260624-001", "timestamp": "2026-06-24 10:30:00", "amount": 50000, "fee": 1000, "tax": 5000 }
    ]
  }
  ```

#### 2.3 Analisis Arus Kas (Cashflow)
Mengambil data tren arus masuk dan keluar secara bulanan beserta ringkasan laba kotor dan laba bersih.
* **Metode:** `GET`
* **Endpoint:** `/analytics/cashflow`
* **Headers:** `Authorization: Bearer <token>`
* **Query Parameters (Opsional):** `startDate`, `endDate`
* **Response Sukses (200 OK):**
  ```json
  {
    "summary": {
      "totalInflow": 4500000,
      "totalOutflow": 1200000,
      "totalPlatformFee": 45000,
      "totalTaxDeductions": 450000,
      "netCashflow": 2805000
    },
    "monthlyTrend": [
      { "month": "2026-06", "inflow": 4500000, "outflow": 1200000, "net": 3300000 }
    ]
  }
  ```

#### 2.4 Laporan Transaksi Penuh (Premium Only)
Mengambil data seluruh riwayat transaksi secara detail yang dapat difilter untuk kebutuhan unduh/ekspor (misalnya CSV).
* **Metode:** `GET`
* **Endpoint:** `/analytics/reports`
* **Headers:** `Authorization: Bearer <token>`
* **Query Parameters (Opsional):** `category`, `sourceApp`, `startDate`, `endDate`
* **Response Sukses (200 OK - Hanya jika User Premium, Dosen, atau Admin):**
  ```json
  {
    "reportTitle": "Laporan Analitis Transaksi UMKM",
    "generatedAt": "2026-06-24T13:21:00Z",
    "filtersUsed": { "category": null, "sourceApp": null },
    "totalRecordCount": 142,
    "data": [
      {
        "tx_id": "TX-20260624-001",
        "timestamp": "2026-06-24 10:30:00",
        "from_app": "POS",
        "from_user": "user_cust_12",
        "to_user": "umkm_01",
        "amount": 50000,
        "fee": 1000,
        "tax": 5000,
        "status": "success",
        "metadata": { "umkm_name": "Warung Berkah", "category": "Makanan & Minuman" }
      }
    ]
  }
  ```
* **Response Error (403 Forbidden - Jika User Biasa Non-Premium):**
  ```json
  {
    "error": "Premium subscription required to generate report tables"
  }
  ```

---

### 3. Kategori: Layanan Langganan (`/subscription`)

#### 3.1 Inisialisasi Transaksi Pembayaran
Membuat sesi pembayaran baru di Midtrans Sandbox dengan nominal kustom. Mengembalikan token transaksi (Snap Token) dan URL pembayaran.
* **Metode:** `POST`
* **Endpoint:** `/subscription/create`
* **Headers:** `Authorization: Bearer <token>`
* **Request Body:**
  ```json
  {
    "amount": 15000
  }
  ```
  *(Catatan: Nominal minimal adalah Rp 1.000, dibatasi hanya metode Transfer Bank/Virtual Account)*
* **Response Sukses (201 Created):**
  ```json
  {
    "message": "Subscription payment initiated",
    "orderId": "SUB-usr-8a2b-1781104902274",
    "snapToken": "c8695d73-2e06-4b2a-89a1-77884d3b6f2c",
    "redirectUrl": "https://app.sandbox.midtrans.com/snap/v2/vtweb/c8695d73-2e06-4b2a-89a1-77884d3b6f2c",
    "isMockPayment": false
  }
  ```

#### 3.2 Cek Status Premium Aktif
Memeriksa apakah akun pengguna saat ini memiliki hak akses premium dan masa berlakunya.
* **Metode:** `GET`
* **Endpoint:** `/subscription/status`
* **Headers:** `Authorization: Bearer <token>`
* **Response Sukses (200 OK):**
  ```json
  {
    "isPremium": true,
    "premiumUntil": "2026-07-01 13:30:00"
  }
  ```

#### 3.3 Verifikasi Status Transaksi Langsung (Localhost Bypass)
Menanyakan langsung status transaksi ke API Midtrans Sandbox (menggunakan Server Key Anda) untuk memperbarui database secara instan (berguna karena localhost tidak bisa menerima webhook langsung).
* **Metode:** `POST`
* **Endpoint:** `/subscription/verify/:orderId`
* **Headers:** `Authorization: Bearer <token>`
* **Response Sukses (200 OK):**
  ```json
  {
    "message": "Verification successful",
    "orderId": "SUB-usr-8a2b-1781104902274",
    "status": "settlement",
    "isPremium": true
  }
  ```

#### 3.4 Webhook Notifikasi Midtrans
Menerima pemberitahuan perubahan status pembayaran secara asinkron langsung dari server Midtrans (hanya berfungsi jika backend dihosting online atau menggunakan Ngrok).
* **Metode:** `POST`
* **Endpoint:** `/subscription/webhook`
* **Request Body:** *Payload standar notifikasi dari Midtrans (berisi `order_id`, `transaction_status`, `fraud_status`, dll.)*
* **Response Sukses (200 OK):**
  ```json
  {
    "message": "Notification processed successfully",
    "orderId": "SUB-usr-8a2b-1781104902274",
    "status": "settlement"
  }
  ```

#### 3.5 Simulasi Pembayaran Offline (Mock Mode)
Mensimulasikan status sukses/gagal secara instan untuk kebutuhan demo tanpa koneksi internet (hanya aktif jika tidak ada kunci Midtrans asli di `.env`).
* **Metode:** `POST`
* **Endpoint:** `/subscription/simulate-payment`
* **Request Body:**
  ```json
  {
    "orderId": "SUB-usr-8a2b-1781104902274",
    "approve": true
  }
  ```
* **Response Sukses (200 OK):**
  ```json
  {
    "message": "Notification processed successfully",
    "orderId": "SUB-usr-8a2b-1781104902274",
    "status": "settlement"
  }
  ```
