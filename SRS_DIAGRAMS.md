# DOKUMENTASI SRS (SOFTWARE REQUIREMENTS SPECIFICATION) - UMKM-INSIGHT

Dokumen ini berisi spesifikasi kebutuhan perangkat lunak (SRS) untuk aplikasi **UMKM-INSIGHT** yang disesuaikan berdasarkan analisis struktur folder, kode sumber backend (API Express.js), dan frontend (Next.js App Router).

---

## 1. PENDAHULUAN & DESKRIPSI SISTEM

**UMKM-INSIGHT** adalah aplikasi *full-stack* yang dirancang untuk membantu pelaku Usaha Mikro, Kecil, dan Menengah (UMKM) dalam mengelola keuangan usaha mereka. Sistem ini mengintegrasikan data transaksi dari sistem POS (Point of Sales) dan Marketplace untuk menghasilkan analisis performa bisnis secara *real-time*.

### Fitur Utama Sistem:
1. **Autentikasi & Keanggotaan Multi-Role**: Sistem mendukung registrasi dan login untuk peran *User (Pelaku UMKM)*, *Lecturer (Dosen)*, dan *Admin*.
2. **Dashboard Analytics**: Visualisasi ringkasan performa finansial seperti total pemasukan (*inflow*), total pengeluaran (*outflow*), biaya platform, pajak, laba bersih, tren penjualan harian, serta kontribusi kategori penjualan.
3. **Analisis Detail**: Halaman khusus untuk menganalisis Penjualan (*Sales*) dan Arus Kas (*Cashflow*) dengan penyaringan data (*filtering*) berbasis tanggal, kategori, dan identitas UMKM.
4. **Manajemen Berlangganan Premium (Subscription)**: Peningkatan akun menjadi Premium melalui integrasi payment gateway **Midtrans** (menggunakan metode Bank Transfer/Virtual Account) dengan masa aktif berkala (mingguan/7 hari).
5. **Ekspor Laporan Keuangan**: Fitur premium yang memungkinkan pengguna mengekspor rincian laporan keuangan (diuji melalui pembatasan akses premium/premium gate). Dosen dan Admin mendapatkan akses gratis ke fitur premium ini tanpa perlu membayar.
6. **Audit Logging (API Logger)**: Pencatatan otomatis setiap request API ke dalam database untuk keperluan monitoring performa dan auditing keamanan.

---

## 2. AKTOR SISTEM (SYSTEM ACTORS)

Sistem mengidentifikasi tiga aktor utama yang berinteraksi dengan aplikasi:

| Aktor | Deskripsi | Hak Akses Fitur |
|---|---|---|
| **Pengguna UMKM (User)** | Pelaku usaha UMKM yang menggunakan aplikasi untuk mencatat dan memantau bisnis. | Registrasi, Login, Dashboard, Analisis Sales & Cashflow, Upgrade Premium (berbayar via Midtrans). |
| **Dosen (Lecturer)** | Pengguna akademis yang melakukan review atau pengajaran. | Login, Dashboard, Analisis Sales & Cashflow, **Akses Laporan Premium gratis** (tidak perlu transaksi pembayaran). |
| **Admin** | Pengelola sistem utama. | Semua akses fitur Dosen/User, ditambah kemampuan memantau log aktivitas sistem melalui database log API. |

---

## 3. DIAGRAM KASUS PENGGUNA (USE CASE DIAGRAM)

Diagram berikut menggambarkan interaksi antara aktor (Pengguna UMKM, Dosen, Admin) dengan fungsi-fungsi utama di dalam sistem.

```mermaid
graph LR
    %% Pengaturan Style
    classDef actorStyle fill:#2a3042,stroke:#556ee6,stroke-width:2px,color:#fff;
    classDef usecaseStyle fill:#1a233a,stroke:#34c38f,stroke-width:1.5px,color:#fff;
    
    subgraph Aktor ["Aktor / Pengguna"]
        U[Pengguna UMKM]:::actorStyle
        L[Dosen / Lecturer]:::actorStyle
        A[Admin]:::actorStyle
    end

    subgraph Sistem ["Batas Sistem UMKM-INSIGHT"]
        UC1((Registrasi Akun)):::usecaseStyle
        UC2((Login & Autentikasi)):::usecaseStyle
        UC3((Melihat Dashboard Analytics)):::usecaseStyle
        UC4((Melihat Analisis Penjualan)):::usecaseStyle
        UC5((Melihat Analisis Cashflow)):::usecaseStyle
        UC6((Upgrade & Bayar Premium)):::usecaseStyle
        UC7((Mengekspor Laporan Keuangan)):::usecaseStyle
        UC8((Memantau Log Aktivitas API)):::usecaseStyle
    end

    %% Hubungan Aktor ke Use Case
    U --> UC1
    U --> UC2
    U --> UC3
    U --> UC4
    U --> UC5
    U --> UC6
    U -.->|Hanya jika Premium| UC7

    L --> UC1
    L --> UC2
    L --> UC3
    L --> UC4
    L --> UC5
    L -->|Bypass Premium Gate| UC7

    A --> UC1
    A --> UC2
    A --> UC3
    A --> UC4
    A --> UC5
    A -->|Bypass Premium Gate| UC7
    A --> UC8
```

---

## 4. ARSITEKTUR & KOMPONEN SISTEM (SYSTEM ARCHITECTURE)

Aplikasi dibangun menggunakan arsitektur **3-Tier/Client-Server** dengan pembagian modul sebagai berikut:

```mermaid
graph TD
    subgraph Client_Layer ["Client Layer (Frontend - Next.js)"]
        UI["React UI (App Router)"]
        Context["AuthContext (JWT State & Session)"]
        API_Helper["api.js (HTTP Client - Fetch)"]
        UI --> Context
        UI --> API_Helper
    end

    subgraph Application_Layer ["Application Layer (Backend - Express.js)"]
        Server["server.js (Express Engine)"]
        
        subgraph Middleware ["Middlewares"]
            AuthMW["auth.js (JWT Verifier & Premium Checker)"]
            LogMW["logger.js (API Audit Logger)"]
        end

        subgraph Routes ["API Routes"]
            AuthRoutes["authRoutes.js"]
            AnalyticsRoutes["analyticsRoutes.js"]
            SubRoutes["subscriptionRoutes.js"]
        end

        subgraph Controllers ["Controllers (Logika Bisnis)"]
            AuthCtrl["authController.js"]
            AnalyticsCtrl["analyticsController.js"]
            SubCtrl["subscriptionController.js"]
        end

        Server --> LogMW
        Server --> AuthMW
        Server --> AuthRoutes & AnalyticsRoutes & SubRoutes
        
        AuthRoutes --> AuthCtrl
        AnalyticsRoutes --> AnalyticsCtrl
        SubRoutes --> SubCtrl
    end

    subgraph Database_Layer ["Database Layer (MySQL)"]
        MySQL_DB[("MySQL Database (umkm_insight)")]
    end

    subgraph External_Services ["External Services"]
        Midtrans["Midtrans Snap / Payment Gateway"]
        SmartBank["SmartBank / Ledger API Gateway"]
    end

    %% Hubungan antar layer
    API_Helper == "HTTP / JSON" ==> Server
    
    AuthCtrl --> MySQL_DB
    SubCtrl --> MySQL_DB
    LogMW --> MySQL_DB
    
    SubCtrl <== "Integrasi Pembayaran (Snap & Webhook)" ==> Midtrans
    AnalyticsCtrl <== "Mengambil Ledger Keuangan (Fallback ke Mock)" ==> SmartBank
    AnalyticsCtrl --> MySQL_DB
```

---

## 5. DIAGRAM ALIRAN DATA (DATA FLOW DIAGRAM - DFD)

### DFD Level 0 (Diagram Konteks)
Diagram Konteks ini menunjukkan batasan sistem UMKM-INSIGHT dan entitas luar yang berinteraksi langsung dengannya.

```mermaid
graph LR
    U[Pengguna UMKM]
    Midtrans[Midtrans Payment Gateway]
    SmartBank[SmartBank / Ledger API]
    System[["SISTEM UMKM-INSIGHT"]]

    U ==>|1. Kredensial & Filter Analisis| System
    U ==>|2. Nominal Pembayaran| System
    System ==>|1. Grafik Tren & Data Analisis| U
    System ==>|2. Token Midtrans Snap & Link Pembayaran| U

    System ==>|Request Transaksi Pembayaran| Midtrans
    Midtrans ==>|Notifikasi Webhook Status Bayar| System

    SmartBank ==>|Data Ledger Transaksi Keuangan| System
    System ==>|Request Data Ledger Keuangan| SmartBank
```

### DFD Level 1 (Proses Internal)
DFD Level 1 merincikan proses bisnis utama di dalam sistem, aliran data ke database, dan keterhubungannya dengan pengguna.

```mermaid
graph TD
    %% Entitas Luar
    User[Pengguna / Aktor]
    Midtrans[Midtrans Payment Gateway]
    SmartBank[SmartBank Ledger API]

    %% Data Store
    DS_Users[(Store: users)]
    DS_Subs[(Store: subscriptions)]
    DS_Logs[(Store: api_logs)]

    %% Proses-Proses
    P1["1.0 Autentikasi & Registrasi (authController)"]
    P2["2.0 Pengolahan Analytics (analyticsController)"]
    P3["3.0 Pengelolaan Langganan (subscriptionController)"]
    P4["4.0 Log Aktivitas API (loggerMiddleware)"]

    %% Aliran Data
    User -->|Kredensial login/daftar| P1
    P1 -->|Cek/Simpan User| DS_Users
    P1 -->|Kirim Token JWT & Profil| User

    User -->|Akses Dashboard/Filter| P2
    P2 -->|Verifikasi Token & Premium| DS_Users
    P2 -->|Ambil Data Ledger| SmartBank
    SmartBank -->|Detail Transaksi (Inflow/Outflow)| P2
    P2 -->|Data Analytics & Laporan| User

    User -->|Bayar Premium (Nominal)| P3
    P3 -->|Request Token Pembayaran| Midtrans
    Midtrans -->|Token Snap & URL| P3
    P3 -->|Simpan status pending| DS_Subs
    P3 -->|Token & URL Pembayaran| User

    Midtrans -->|Notifikasi Webhook Status (settlement)| P3
    P3 -->|Update status transaksi| DS_Subs
    P3 -->|Update is_premium & premium_until| DS_Users

    %% Logging
    P1 & P2 & P3 -->|Data Request & Response| P4
    P4 -->|Simpan Audit Log| DS_Logs
```

---

## 6. ENTITY-RELATIONSHIP DIAGRAM (ERD)

Database menggunakan struktur relasional dengan tiga tabel utama: `users` (pengguna), `subscriptions` (langganan pembayaran), dan `api_logs` (log audit API).

```mermaid
erDiagram
    users ||--o{ subscriptions : "memiliki"
    users ||--o{ api_logs : "mencatat request"

    users {
        varchar_64 id PK "UUIDv4 pengidentifikasi unik user"
        varchar_255 username UK "Username unik pengguna"
        varchar_255 password "Hash password menggunakan bcrypt"
        enum_role role "Peran user: 'user', 'admin', 'lecturer'"
        tinyint_1 is_premium "Status premium (0: Biasa, 1: Premium)"
        datetime premium_until "Batas waktu masa aktif premium"
        datetime created_at "Waktu pembuatan akun"
    }

    subscriptions {
        varchar_128 id PK "Order ID dari sistem (Format: SUB-xxxx-timestamp)"
        varchar_64 user_id FK "Menghubungkan ke tabel users(id) ON DELETE CASCADE"
        int amount "Jumlah nominal langganan (Default: 10.000)"
        enum_status status "Status transaksi: 'pending', 'settlement', 'expire', 'cancel'"
        text snap_token "Token pembayaran dari Midtrans Snap"
        datetime created_at "Waktu pembuatan transaksi"
        datetime updated_at "Waktu update terakhir transaksi"
    }

    api_logs {
        int id PK "Auto Increment ID log"
        datetime timestamp "Waktu pemanggilan API"
        varchar_512 endpoint "Endpoint API yang diakses"
        varchar_16 method "HTTP method (GET, POST, dll)"
        varchar_64 user_id FK "Menghubungkan ke tabel users(id) NULLable"
        varchar_128 app_name "Nama aplikasi (Default: 'umkm-insight')"
        int status_code "HTTP status code respons (200, 401, 500, dll)"
        text error_message "Detail pesan error jika terjadi kegagalan"
    }
```

---

## 7. DIAGRAM SEKUENSIAL (SEQUENCE DIAGRAMS)

### A. Alur Registrasi & Login Akun
Menunjukkan interaksi frontend dan backend dalam mengelola pembuatan akun dan otorisasi sesi menggunakan token JWT.

```mermaid
sequenceDiagram
    autonumber
    actor Pengguna as Pengguna UMKM
    participant FE as Frontend (Next.js)
    participant BE as Backend (Express.js)
    participant DB as Database (MySQL)

    Note over Pengguna, FE: Tahap 1: Registrasi Akun
    Pengguna->>FE: Isi Form Registrasi (Username, Password, Role)
    FE->>BE: POST /api/auth/register (payload JSON)
    BE->>DB: Cek ketersediaan username (SELECT id FROM users WHERE username = ?)
    DB-->>BE: Username tersedia (Null)
    BE->>BE: Enkripsi password menggunakan bcrypt.genSalt & hash
    BE->>BE: Generate UUIDv4 untuk User ID
    BE->>DB: INSERT INTO users (id, username, password, role, is_premium, created_at)
    DB-->>BE: Sukses menyimpan data pengguna baru
    BE-->>FE: Response HTTP 201 (Message: 'User registered successfully')
    FE-->>Pengguna: Tampilkan pesan sukses & arahkan ke halaman Login

    Note over Pengguna, FE: Tahap 2: Login Akun
    Pengguna->>FE: Isi Form Login (Username, Password)
    FE->>BE: POST /api/auth/login (payload JSON)
    BE->>DB: Ambil data user (SELECT * FROM users WHERE username = ?)
    DB-->>BE: Mengembalikan baris data User (Password hash, Role, dll)
    BE->>BE: Verifikasi kecocokan password (bcrypt.compare)
    BE->>BE: Generate JWT Token (payload: id, username, role. Berakhir dalam 24 jam)
    BE-->>FE: Response HTTP 200 (Token JWT & data profil dasar)
    FE->>FE: Simpan Token di LocalStorage & Set state di AuthContext
    FE-->>Pengguna: Arahkan pengguna ke halaman Dashboard
```

### B. Alur Pembayaran Langganan Premium (Integrasi Midtrans)
Menunjukkan siklus transaksi mulai dari pembuatan pesanan, interaksi dengan Snap API Midtrans, hingga sinkronisasi status premium melalui Webhook.

```mermaid
sequenceDiagram
    autonumber
    actor Pengguna as Pengguna UMKM
    participant FE as Frontend (Next.js)
    participant BE as Backend (Express.js)
    participant DB as Database (MySQL)
    participant Midtrans as Midtrans Snap / API

    Pengguna->>FE: Klik tombol "Berlangganan Premium"
    FE->>BE: POST /api/subscription/create (Header: JWT, Body: amount)
    BE->>BE: Verifikasi token JWT & ambil info User
    BE->>DB: Cek status premium saat ini (SELECT is_premium FROM users WHERE id = ?)
    DB-->>BE: Pengguna berstatus biasa (is_premium = 0)
    BE->>BE: Generate Order ID unik (SUB-xxxx-timestamp)
    
    alt Skenario 1: Menggunakan Kunci Mock/Sandbox Lokal
        BE->>BE: Buat Mock Snap Token lokal (MOCK-SNAP-TOKEN-xxxx)
    else Skenario 2: Menggunakan Kunci Real Midtrans Sandbox/Production
        BE->>Midtrans: Request transaksi baru (gross_amount, order_id, customer_details, enabled_payments: ['bank_transfer'])
        Midtrans-->>BE: Return Snap Token & URL Redirect Pembayaran
    end

    BE->>DB: INSERT INTO subscriptions (id, user_id, amount, status='pending', snap_token)
    DB-->>BE: Sukses menyimpan transaksi
    BE-->>FE: Response HTTP 201 (snapToken, redirectUrl)
    FE->>FE: Buka Midtrans Snap Popup UI
    FE-->>Pengguna: Tampilkan instruksi pembayaran Bank Transfer (Virtual Account)

    Pengguna->>Midtrans: Selesaikan pembayaran di ATM / Mobile Banking
    
    Note over Midtrans, BE: Pengiriman Notifikasi Hasil Bayar (Webhook)
    Midtrans->>BE: POST /api/subscription/webhook (Payload status transaksi)
    BE->>BE: Verifikasi keaslian signature key webhook (jika mode produksi/real)
    BE->>DB: Cek data transaksi (SELECT * FROM subscriptions WHERE id = order_id)
    DB-->>BE: Detail transaksi ditemukan
    
    alt Status Transaksi = 'settlement' atau 'capture' (accept)
        BE->>DB: UPDATE subscriptions SET status = 'settlement' WHERE id = order_id
        DB-->>BE: Sukses
        BE->>BE: Kalkulasi masa berlaku premium (+7 Hari dari sekarang)
        BE->>DB: UPDATE users SET is_premium = 1, premium_until = premiumUntilStr WHERE id = userId
        DB-->>BE: Sukses memperbarui status premium user
    else Status Transaksi = 'cancel', 'deny', atau 'expire'
        BE->>DB: UPDATE subscriptions SET status = 'cancel' / 'expire' WHERE id = order_id
        DB-->>BE: Sukses
    end
    BE-->>Midtrans: Response HTTP 200 (Notification processed successfully)
```

### C. Alur Analytics & Proteksi Premium Gate (Ekspor Laporan)
Menunjukkan bagaimana backend mengambil data keuangan dari SmartBank API, menghitung indikator keuangan, serta membatasi pembuatan laporan berdasarkan status premium.

```mermaid
sequenceDiagram
    autonumber
    actor Pengguna as Pengguna UMKM
    participant FE as Frontend (Next.js)
    participant BE as Backend (Express.js)
    participant DB as Database (MySQL)
    participant SmartBank as SmartBank Ledger / Mock Generator

    Note over Pengguna, FE: 1. Proses Dashboard Analytics (Terbuka untuk semua user terautentikasi)
    Pengguna->>FE: Buka halaman Dashboard
    FE->>BE: GET /api/analytics/dashboard (Header: JWT)
    BE->>BE: Jalankan middleware authenticateToken (validasi JWT & cek masa aktif premium)
    alt Status premium kedaluwarsa (premium_until < waktu sekarang)
        BE->>DB: UPDATE users SET is_premium = 0 WHERE id = userId
        DB-->>BE: Berhasil mencabut status premium
    end
    
    alt Variabel USE_MOCK_LEDGER = true
        BE->>BE: Jalankan generateMockLedger() (Simulasi data transaksi 30 hari terakhir)
    else Koneksi ke SmartBank API
        BE->>SmartBank: Request GET /smartbank/ledger
        SmartBank-->>BE: Return data ledger transaksi (JSON)
    end
    
    BE->>BE: Hitung agregasi keuangan (totalInflow, totalOutflow, netProfit, salesTrend, categorySplit)
    BE-->>FE: Response HTTP 200 (Summary metrics, trend data harian, status premium pengguna)
    FE->>FE: Tampilkan rangkapan uang & gambar grafik interaktif
    FE-->>Pengguna: Tampilkan antarmuka visual dashboard

    Note over Pengguna, FE: 2. Proses Ekspor Laporan (Dibatasi Premium Gate)
    Pengguna->>FE: Buka menu Laporan & klik "Ekspor Laporan Transaksi"
    FE->>BE: GET /api/analytics/reports (Header: JWT, Query filter data)
    BE->>BE: Jalankan middleware authenticateToken (validasi JWT & cek premium)
    
    alt Cek Akses: user biasa & non-premium (is_premium == 0)
        BE-->>FE: Response HTTP 403 (Error: 'Premium subscription required to generate report tables')
        FE-->>Pengguna: Tampilkan dialog/pesan "Upgrade ke Premium untuk mengekspor laporan"
    else Cek Akses: user Premium (is_premium == 1) ATAU Dosen/Admin
        BE->>SmartBank: Tarik data transaksi ledger
        SmartBank-->>BE: Kembalikan data ledger
        BE->>BE: Lakukan penyaringan data sesuai parameter query filter (category, sourceApp, dates)
        BE-->>FE: Response HTTP 200 (reportTitle, totalRecords, terfilter data)
        FE->>FE: Render data ke dalam tabel laporan & aktifkan tombol Unduh file (CSV/Excel)
        FE-->>Pengguna: Tampilkan rincian tabel laporan siap unduh
    end
```

---

## 8. DIAGRAM STATUS TRANSAKSI & MASA AKTIF PREMIUM (STATE DIAGRAM)

Diagram status di bawah ini menggambarkan perubahan status pembayaran langganan di tabel `subscriptions` dan hubungannya dengan status premium akun pengguna (`users.is_premium`).

```mermaid
stateDiagram-v2
    [*] --> Pending : Pengguna menekan tombol berlangganan premium & Order ID terbuat
    
    state Pembayaran_Di_Midtrans {
        Pending --> Settlement : Pembayaran sukses diselesaikan (settlement / capture)
        Pending --> Cancel : Pembayaran dibatalkan oleh pengguna (cancel / deny)
        Pending --> Expire : Batas waktu pembayaran habis (expire)
    }

    state Dampak_Ke_Pengguna {
        Settlement --> Premium_Aktif : Memicu is_premium = 1 & premium_until = NOW + 7 Hari
        Cancel --> Non_Premium : is_premium tetap 0
        Expire --> Non_Premium : is_premium tetap 0
    end

    Premium_Aktif --> Non_Premium : Masa aktif habis (waktu saat ini > premium_until) / Auto Revoke di Middleware
    Non_Premium --> [*]
```

---
*Dokumen Spesifikasi Kebutuhan Perangkat Lunak (SRS) ini dibuat dan disinkronkan secara presisi berdasarkan basis kode aktif dari proyek UMKM-INSIGHT.*
