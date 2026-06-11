'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { api } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';
import { 
  Sparkles, 
  CheckCircle, 
  CreditCard, 
  Info,
  Calendar,
  AlertCircle,
  HelpCircle
} from 'lucide-react';

export default function SubscriptionPage() {
  const { user, refreshPremiumStatus } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Checkout tracking states for simulation and input nominal
  const [inputAmount, setInputAmount] = useState(10000);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [simulating, setSimulating] = useState(false);

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);
  };

  const handleCheckout = async () => {
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      // 1. Contact backend to create payment session
      const res = await api.createSubscription(inputAmount);
      const orderData = {
        ...res,
        amount: inputAmount
      };
      setCurrentOrder(orderData);

      // 2. Check if this is a real Midtrans payment or a mock payment
      if (res.isMockPayment) {
        setSuccess('Pembayaran MOCK diaktifkan. Gunakan widget simulator di bawah untuk menyetujui transaksi.');
        setLoading(false);
      } else {
        // Render official Midtrans Snap popup
        if (window.snap) {
          window.snap.pay(res.snapToken, {
            onSuccess: async (result) => {
              console.log('Midtrans payment success:', result);
              setSuccess('Pembayaran berhasil! Memverifikasi status...');
              try {
                await api.verifySubscription(res.orderId);
                setSuccess('Pembayaran berhasil diproses! Status Premium Aktif.');
                await refreshPremiumStatus();
                setCurrentOrder(null);
              } catch (err) {
                setError('Gagal memverifikasi status pembayaran secara otomatis. Silakan klik tombol "Cek Status Pembayaran" di bawah.');
              }
              setLoading(false);
            },
            onPending: (result) => {
              console.log('Midtrans payment pending:', result);
              setSuccess('Pembayaran Anda tertunda. Silakan selesaikan pembayaran.');
              setLoading(false);
            },
            onError: (result) => {
              console.error('Midtrans payment error:', result);
              setError('Terjadi kesalahan selama pembayaran. Silakan coba lagi.');
              setLoading(false);
            },
            onClose: () => {
              console.log('Customer closed the snap popup without finishing the payment');
              setError('Pembayaran dibatalkan oleh pengguna.');
              setLoading(false);
            }
          });
        } else {
          setError('Gagal memuat pustaka pembayaran Midtrans Snap. Mengaktifkan simulator...');
          // Auto-fallback to simulator panel
          setCurrentOrder({
            ...orderData,
            isMockPayment: true
          });
          setLoading(false);
        }
      }
    } catch (err) {
      setError(err.message || 'Gagal melakukan checkout.');
      setLoading(false);
    }
  };

  const handleSimulatePayment = async (approve) => {
    if (!currentOrder) return;
    setSimulating(true);
    setError('');
    setSuccess('');

    try {
      // Call backend to trigger fake webhook notification
      const result = await api.simulatePayment(currentOrder.orderId, approve);
      
      if (approve) {
        setSuccess('SIMULASI SUKSES: Pembayaran disetujui (settlement)! Status Premium Anda aktif.');
        await refreshPremiumStatus();
      } else {
        setError('SIMULASI PEMBATALAN: Transaksi dibatalkan (cancel/deny).');
      }
      
      setCurrentOrder(null);
    } catch (err) {
      setError(err.message || 'Simulasi pembayaran gagal.');
    } finally {
      setSimulating(false);
    }
  };

  const getRemainingDays = () => {
    if (!user?.premium_until) return 0;
    const diff = new Date(user.premium_until) - new Date();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Langganan Premium</h1>
          <p className="text-gray-400 mt-1">Dapatkan visualisasi penuh dan filter audit keuangan UMKM terintegrasi.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {/* Left panel: Info status & Simulator */}
          <div className="md:col-span-2 space-y-6">
            {/* Status Panel */}
            <div className="glass-card p-6 space-y-4">
              <h3 className="font-bold text-white text-lg">Status Langganan Anda</h3>
              
              {user?.role === 'lecturer' || user?.role === 'admin' ? (
                <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/25 p-5 text-sm text-indigo-300">
                  <div className="flex items-center gap-2 font-bold mb-1">
                    <Sparkles className="h-4.5 w-4.5 text-indigo-400" />
                    <span>Lisensi Dosen/Admin Aktif</span>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Akun evaluasi dengan peran <strong>{user?.role}</strong> dibebaskan dari penagihan dan otomatis memiliki seluruh akses analitis tanpa perlu berlangganan.
                  </p>
                </div>
              ) : user?.is_premium ? (
                <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/25 p-5 text-sm text-emerald-300 space-y-2">
                  <div className="flex items-center gap-2 font-bold">
                    <CheckCircle className="h-4.5 w-4.5 text-emerald-400" />
                    <span>Paket Premium Aktif</span>
                  </div>
                  <p className="text-xs text-gray-400">
                    Masa berlaku premium Anda menyisakan kurang lebih <strong>{getRemainingDays()} hari lagi</strong> (aktif sampai {user.premium_until}).
                  </p>
                </div>
              ) : (
                <div className="rounded-xl bg-slate-800/40 border border-slate-700/35 p-5 text-sm text-gray-300">
                  <div className="flex items-center gap-2 font-bold text-white mb-1">
                    <AlertCircle className="h-4.5 w-4.5 text-indigo-400" />
                    <span>Paket Dasar (Free)</span>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Anda saat ini menggunakan akses gratis. Halaman Laporan Lanjutan tersembunyi sampai Anda mengaktifkan premium.
                  </p>
                </div>
              )}
            </div>

            {/* Visual webhook simulator or manual status verification panel */}
            {currentOrder && (
              <div className={`glass-card p-6 border-indigo-500/30 ${currentOrder.isMockPayment ? 'border-amber-500/30 bg-amber-500/5' : 'bg-indigo-500/5'} space-y-4 animate-fade-in`}>
                <div className="flex items-start gap-3">
                  {currentOrder.isMockPayment ? (
                    <HelpCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                  ) : (
                    <Info className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <h4 className="font-bold text-white text-sm">
                      {currentOrder.isMockPayment ? 'Simulator Pembayaran Midtrans Sandbox' : 'Menunggu Pembayaran Midtrans'}
                    </h4>
                    <p className="text-xs text-gray-300 mt-1 leading-relaxed">
                      {currentOrder.isMockPayment 
                        ? 'Karena server menggunakan kunci mockup, sistem mendeteksi simulasi transaksi offline. Anda dapat menyelesaikan proses pembayaran secara instan di sini untuk melihat aliran webhook.'
                        : 'Pembayaran Anda telah dibuat di Midtrans Sandbox. Silakan selesaikan pembayaran Anda menggunakan metode Transfer Bank yang Anda pilih.'}
                    </p>
                  </div>
                </div>

                <div className="bg-[#090d16] p-4 rounded-xl border border-slate-800 space-y-2.5">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>ID Transaksi (Order ID):</span>
                    <span className="font-mono text-indigo-400 font-semibold">{currentOrder.orderId}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Nominal:</span>
                    <span className="font-bold text-white">{formatCurrency(currentOrder.amount || inputAmount)}</span>
                  </div>
                  {!currentOrder.isMockPayment && (
                    <div className="rounded-lg bg-slate-800/40 p-3 text-[11px] text-gray-400 space-y-2 border border-slate-700/30">
                      <p className="font-semibold text-white">Langkah Simulasi Pembayaran:</p>
                      <ol className="list-decimal list-inside space-y-1">
                        <li>Buka popup Midtrans Snap dan pilih salah satu bank untuk Transfer.</li>
                        <li>Salin Nomor Virtual Account yang diberikan.</li>
                        <li>Buka <a href="https://simulator.sandbox.midtrans.com" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline font-semibold">Simulator Sandbox Midtrans</a>.</li>
                        <li>Pilih **Virtual Account**, masukkan nomor VA Anda, lalu bayar.</li>
                        <li>Setelah sukses di simulator, kembali ke halaman ini lalu tekan tombol **"Cek Status Pembayaran"** di bawah.</li>
                      </ol>
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  {currentOrder.isMockPayment ? (
                    <>
                      <button
                        onClick={() => handleSimulatePayment(true)}
                        disabled={simulating}
                        className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-black font-extrabold text-xs rounded-xl transition-all shadow-md cursor-pointer disabled:opacity-50"
                      >
                        {simulating ? 'Memproses...' : 'Setujui Pembayaran (Settlement)'}
                      </button>
                      <button
                        onClick={() => handleSimulatePayment(false)}
                        disabled={simulating}
                        className="py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-gray-300 font-bold text-xs rounded-xl transition-all border border-zinc-700 cursor-pointer disabled:opacity-50"
                      >
                        Gagalkan
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={async () => {
                          setSimulating(true);
                          setError('');
                          setSuccess('');
                          try {
                            const verifyRes = await api.verifySubscription(currentOrder.orderId);
                            if (verifyRes.isPremium) {
                              setSuccess('Verifikasi Berhasil! Paket Premium Anda telah diaktifkan.');
                              await refreshPremiumStatus();
                              setCurrentOrder(null);
                            } else {
                              setError('Pembayaran belum terdeteksi. Silakan selesaikan pembayaran Anda di simulator Sandbox Midtrans terlebih dahulu.');
                            }
                          } catch (err) {
                            setError(err.message || 'Gagal memverifikasi status pembayaran.');
                          } finally {
                            setSimulating(false);
                          }
                        }}
                        disabled={simulating}
                        className="flex-1 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white font-extrabold text-xs rounded-xl transition-all shadow-md cursor-pointer disabled:opacity-50"
                      >
                        {simulating ? 'Memverifikasi...' : 'Cek Status Pembayaran'}
                      </button>
                      <button
                        onClick={() => {
                          if (window.snap && currentOrder.snapToken) {
                            window.snap.pay(currentOrder.snapToken);
                          } else {
                            setError('Gagal membuka popup. Pustaka Midtrans Snap tidak tersedia.');
                          }
                        }}
                        className="py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-gray-300 font-bold text-xs rounded-xl transition-all border border-zinc-700 cursor-pointer"
                      >
                        Buka Ulang Popup
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-400">
                {error}
              </div>
            )}

            {success && (
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-xs text-emerald-400">
                {success}
              </div>
            )}
          </div>

          {/* Right panel: Pricing card */}
          <div className="glass-card p-6 border-indigo-500/30 relative overflow-hidden bg-gradient-to-b from-indigo-950/20 to-transparent">
            {/* Ribbon */}
            <div className="absolute top-0 right-0 bg-indigo-500 text-white text-[9px] font-bold px-3 py-1 rounded-bl uppercase tracking-widest">
              Populer
            </div>

            <div className="space-y-4">
              <div>
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Paket Akses</span>
                <h3 className="text-2xl font-black text-white mt-1">Premium Analytics</h3>
              </div>

              <div className="flex items-baseline gap-1 py-2">
                <span className="text-3xl font-extrabold text-white">Rp 10.000</span>
                <span className="text-xs text-gray-400 font-semibold">/ minggu</span>
              </div>

              <p className="text-xs text-gray-400 leading-relaxed">
                Tingkatkan visualisasi keuangan Anda untuk mendapatkan wawasan bisnis yang lebih mendalam dan ekspor file audit.
              </p>

              {/* Feature checkmarks */}
              <ul className="space-y-2.5 pt-4 border-t border-slate-800/80 text-xs text-gray-300">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-indigo-400 shrink-0" />
                  <span>Grafik Tren Cashflow Lanjutan</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-indigo-400 shrink-0" />
                  <span>Peringkat Kontribusi UMKM Lengkap</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-indigo-400 shrink-0" />
                  <span>Filter Multi-Aplikasi (POS & Marketplace)</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-indigo-400 shrink-0" />
                  <span>Ekspor Buku Ledger Laporan ke CSV</span>
                </li>
              </ul>

              {/* Input Nominal Kustom */}
              <div className="space-y-2 pt-4 border-t border-slate-800/80">
                <label className="text-xs text-gray-400 font-semibold block">Nominal Pembayaran (IDR)</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">Rp</span>
                  <input
                    type="number"
                    value={inputAmount}
                    onChange={(e) => setInputAmount(Math.max(0, parseInt(e.target.value) || 0))}
                    disabled={loading || user?.role === 'lecturer' || user?.role === 'admin'}
                    className="w-full bg-slate-900 border border-slate-700/60 rounded-xl py-2.5 pl-10 pr-4 text-white font-bold text-xs focus:outline-none focus:border-indigo-500/80 transition-all"
                    placeholder="10000"
                    min="1000"
                  />
                </div>
                <p className="text-[10px] text-gray-500">Minimal pembayaran Rp 1.000 (Transfer Bank / Virtual Account)</p>
              </div>

              {/* Checkout CTA */}
              <button
                onClick={handleCheckout}
                disabled={loading || user?.role === 'lecturer' || user?.role === 'admin'}
                className="w-full mt-2 py-3 rounded-xl text-xs font-bold text-white gradient-btn flex items-center justify-center gap-2 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <CreditCard className="h-4 w-4" /> 
                {loading ? 'Menghubungkan...' : 'Langganan Premium'}
              </button>
              
              <div className="text-[10px] text-gray-500 text-center leading-relaxed">
                Pembayaran tetap dicatat dan divalidasi oleh gerbang terintegrasi SmartBank.
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
