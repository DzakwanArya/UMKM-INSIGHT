const axios = require('axios');
const db = require('../config/db');

// Mock data generator for the UMKM ecosystem when SmartBank/Gateway is not available or USE_MOCK_LEDGER is true
const generateMockLedger = () => {
  const ledger = [];
  const categories = ['Makanan & Minuman', 'Pakaian', 'Kerajinan', 'Kecantikan'];
  const umkms = [
    { id: 'umkm_01', name: 'Warung Berkah F&B', category: 'Makanan & Minuman' },
    { id: 'umkm_02', name: 'Zahra Boutique', category: 'Pakaian' },
    { id: 'umkm_03', name: 'Sentosa Rattan', category: 'Kerajinan' },
    { id: 'umkm_04', name: 'Glow Up Cosmetics', category: 'Kecantikan' }
  ];
  const suppliers = [
    { id: 'sup_01', name: 'Sembako Jaya' },
    { id: 'sup_02', name: 'Textile Grosir' },
    { id: 'sup_03', name: 'Rotan Lestari' }
  ];

  const now = new Date();
  
  for (let i = 29; i >= 0; i--) {
    const currentDate = new Date(now);
    currentDate.setDate(now.getDate() - i);
    const dateStr = currentDate.toISOString().split('T')[0];

    const dailyTxCount = Math.floor(Math.random() * 6) + 3;

    for (let j = 0; j < dailyTxCount; j++) {
      const umkm = umkms[Math.floor(Math.random() * umkms.length)];
      const txType = Math.random() > 0.3 ? 'inflow' : 'outflow';
      
      const txId = `TX-${dateStr.replace(/-/g, '')}-${i}${j}`;
      const hour = Math.floor(Math.random() * 12) + 8;
      const timestamp = `${dateStr} ${hour.toString().padStart(2, '0')}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}:00`;

      if (txType === 'inflow') {
        const isMarketplace = Math.random() > 0.4;
        const sourceApp = isMarketplace ? 'Marketplace' : 'POS';
        const amount = Math.floor(Math.random() * 150000) + 20000;
        const fee = isMarketplace ? 2000 : 1000;
        const tax = Math.floor(amount * 0.1);

        ledger.push({
          tx_id: txId,
          timestamp,
          from_app: sourceApp,
          from_user: `user_cust_${Math.floor(Math.random() * 100)}`,
          to_user: umkm.id,
          amount,
          fee,
          tax,
          status: 'success',
          metadata: {
            umkm_id: umkm.id,
            umkm_name: umkm.name,
            category: umkm.category,
            type: isMarketplace ? 'marketplace' : 'pos',
            items_count: Math.floor(Math.random() * 4) + 1
          }
        });
      } else {
        const supplier = suppliers[Math.floor(Math.random() * suppliers.length)];
        const amount = Math.floor(Math.random() * 300000) + 50000;
        const tax = Math.floor(amount * 0.1);

        ledger.push({
          tx_id: txId,
          timestamp,
          from_app: 'SupplierHub',
          from_user: umkm.id,
          to_user: supplier.id,
          amount,
          fee: 0,
          tax,
          status: 'success',
          metadata: {
            umkm_id: umkm.id,
            umkm_name: umkm.name,
            category: umkm.category,
            type: 'supplier',
            supplier_name: supplier.name
          }
        });
      }
    }
  }

  return ledger.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
};

// Fetch transactions helper from external source
const fetchLedgerData = async () => {
  if (process.env.USE_MOCK_LEDGER === 'true') {
    return generateMockLedger();
  }

  try {
    const response = await axios.get(`${process.env.GATEWAY_URL || 'http://localhost:3000'}/smartbank/ledger`, {
      timeout: 3000
    });
    return response.data;
  } catch (error) {
    console.warn('Gateway/SmartBank unreachable, falling back to mock ledger data:', error.message);
    return generateMockLedger();
  }
};

// Fetch unified transactions helper from local database tables
const fetchLocalLedgerData = async () => {
  try {
    const marketplace = await db.all('SELECT * FROM marketplace_transactions');
    const pos = await db.all('SELECT * FROM pos_transactions');
    const supplier = await db.all('SELECT * FROM supplier_transactions');

    const ledger = [];

    marketplace.forEach(tx => {
      ledger.push({
        tx_id: tx.id,
        timestamp: tx.timestamp,
        from_app: 'Marketplace',
        from_user: tx.from_user,
        to_user: tx.to_user,
        amount: tx.amount,
        fee: tx.fee,
        tax: tx.tax,
        status: tx.status,
        metadata: {
          umkm_id: tx.umkm_id,
          umkm_name: tx.umkm_name,
          category: tx.category,
          type: 'marketplace'
        }
      });
    });

    pos.forEach(tx => {
      ledger.push({
        tx_id: tx.id,
        timestamp: tx.timestamp,
        from_app: 'POS',
        from_user: tx.from_user,
        to_user: tx.to_user,
        amount: tx.amount,
        fee: tx.fee,
        tax: tx.tax,
        status: tx.status,
        metadata: {
          umkm_id: tx.umkm_id,
          umkm_name: tx.umkm_name,
          category: tx.category,
          type: 'pos'
        }
      });
    });

    supplier.forEach(tx => {
      ledger.push({
        tx_id: tx.id,
        timestamp: tx.timestamp,
        from_app: 'SupplierHub',
        from_user: tx.from_user,
        to_user: tx.to_user,
        amount: tx.amount,
        fee: 0,
        tax: tx.tax,
        status: tx.status,
        metadata: {
          umkm_id: tx.umkm_id,
          umkm_name: tx.umkm_name,
          category: tx.category,
          type: 'supplier',
          supplier_name: tx.supplier_name
        }
      });
    });

    return ledger.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (err) {
    console.error('Error fetching local ledger data, falling back to mock generator:', err);
    return generateMockLedger();
  }
};

// POST /api/analytics/sync
// Pulls latest data from external source and upserts it into the local database tables
const syncExternalData = async (req, res) => {
  try {
    console.log('Syncing data from external UMKM ecosystem...');
    const rawData = await fetchLedgerData();
    
    let newMarketplace = 0;
    let newPos = 0;
    let newSupplier = 0;

    for (const tx of rawData) {
      const txId = tx.tx_id;
      const timestamp = tx.timestamp;
      const fromUser = tx.from_user;
      const toUser = tx.to_user;
      const amount = Number(tx.amount) || 0;
      const fee = Number(tx.fee) || 0;
      const tax = Number(tx.tax) || 0;
      const status = tx.status || 'success';
      
      const metadata = tx.metadata || {};
      const umkmId = metadata.umkm_id || toUser;
      const umkmName = metadata.umkm_name || '';
      const category = metadata.category || 'Lainnya';
      
      if (tx.from_app === 'Marketplace') {
        const exists = await db.get('SELECT 1 FROM marketplace_transactions WHERE id = ?', [txId]);
        if (!exists) {
          await db.run(
            `INSERT INTO marketplace_transactions (id, timestamp, from_user, to_user, amount, fee, tax, status, umkm_id, umkm_name, category)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [txId, timestamp, fromUser, toUser, amount, fee, tax, status, umkmId, umkmName, category]
          );
          newMarketplace++;
        }
      } else if (tx.from_app === 'POS') {
        const exists = await db.get('SELECT 1 FROM pos_transactions WHERE id = ?', [txId]);
        if (!exists) {
          await db.run(
            `INSERT INTO pos_transactions (id, timestamp, from_user, to_user, amount, fee, tax, status, umkm_id, umkm_name, category)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [txId, timestamp, fromUser, toUser, amount, fee, tax, status, umkmId, umkmName, category]
          );
          newPos++;
        }
      } else if (tx.from_app === 'SupplierHub') {
        const supplierName = metadata.supplier_name || toUser;
        const buyerUmkmId = fromUser;
        const exists = await db.get('SELECT 1 FROM supplier_transactions WHERE id = ?', [txId]);
        if (!exists) {
          await db.run(
            `INSERT INTO supplier_transactions (id, timestamp, from_user, to_user, amount, tax, status, umkm_id, umkm_name, category, supplier_name)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [txId, timestamp, fromUser, toUser, amount, tax, status, buyerUmkmId, umkmName, category, supplierName]
          );
          newSupplier++;
        }
      }
    }

    console.log(`Sync completed: ${newMarketplace} Marketplace, ${newPos} POS, ${newSupplier} Supplier.`);
    return res.json({
      success: true,
      message: 'Sync completed successfully',
      summary: {
        syncedMarketplace: newMarketplace,
        syncedPos: newPos,
        syncedSupplier: newSupplier,
        totalSynced: newMarketplace + newPos + newSupplier
      }
    });
  } catch (error) {
    console.error('Error syncing external data:', error);
    res.locals.errorMessage = 'Sync failed';
    return res.status(500).json({ error: res.locals.errorMessage });
  }
};

// GET /api/analytics/dashboard
const getDashboardData = async (req, res) => {
  try {
    const rawData = await fetchLocalLedgerData();
    const isPremiumUser = req.user.is_premium === 1 || req.user.role === 'lecturer' || req.user.role === 'admin';

    let totalInflow = 0;
    let totalOutflow = 0;
    let totalFees = 0;
    let totalTaxes = 0;
    let totalInflowCount = 0;
    let totalOutflowCount = 0;

    rawData.forEach(tx => {
      if (tx.status !== 'success') return;

      const amt = Number(tx.amount) || 0;
      const f = Number(tx.fee) || 0;
      const t = Number(tx.tax) || 0;

      const isOutflow = tx.from_app === 'SupplierHub';
      
      if (!isOutflow) {
        totalInflow += amt;
        totalFees += f;
        totalTaxes += t;
        totalInflowCount++;
      } else {
        totalOutflow += amt;
        totalTaxes += t;
        totalOutflowCount++;
      }
    });

    const netProfit = totalInflow - totalOutflow - totalFees - totalTaxes;

    const salesTrendMap = {};
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(now.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      salesTrendMap[dateStr] = { date: dateStr, sales: 0, expense: 0, transactions: 0 };
    }

    rawData.forEach(tx => {
      const dateStr = tx.timestamp.split(' ')[0];
      if (salesTrendMap[dateStr]) {
        const amt = Number(tx.amount) || 0;
        const isOutflow = tx.from_app === 'SupplierHub';
        if (!isOutflow) {
          salesTrendMap[dateStr].sales += amt;
          salesTrendMap[dateStr].transactions += 1;
        } else {
          salesTrendMap[dateStr].expense += amt;
        }
      }
    });

    const salesTrend = Object.values(salesTrendMap);

    const categoryMap = {};
    rawData.forEach(tx => {
      const isOutflow = tx.from_app === 'SupplierHub';
      if (isOutflow) return;

      const category = (tx.metadata && tx.metadata.category) || 'Lainnya';
      const amt = Number(tx.amount) || 0;
      if (!categoryMap[category]) {
        categoryMap[category] = 0;
      }
      categoryMap[category] += amt;
    });

    const categorySplit = Object.keys(categoryMap).map(key => ({
      name: key,
      value: categoryMap[key]
    }));

    return res.json({
      summary: {
        totalInflow,
        totalOutflow,
        totalFees,
        totalTaxes,
        netProfit,
        totalTransactions: totalInflowCount + totalOutflowCount,
        isPremium: isPremiumUser
      },
      charts: {
        salesTrend,
        categorySplit
      }
    });
  } catch (error) {
    console.error('Dashboard analytical error:', error);
    res.locals.errorMessage = 'Failed to compile dashboard metrics';
    return res.status(500).json({ error: res.locals.errorMessage });
  }
};

// GET /api/analytics/sales
const getSalesAnalysis = async (req, res) => {
  const { umkmId, category, startDate, endDate } = req.query;

  try {
    const rawData = await fetchLocalLedgerData();

    const filteredTx = rawData.filter(tx => {
      if (tx.status !== 'success') return false;
      if (tx.from_app === 'SupplierHub') return false;

      const txUmkmId = tx.to_user;
      const txCategory = (tx.metadata && tx.metadata.category) || 'Lainnya';
      const txDate = tx.timestamp.split(' ')[0];

      if (umkmId && txUmkmId !== umkmId) return false;
      if (category && txCategory.toLowerCase() !== category.toLowerCase()) return false;
      if (startDate && txDate < startDate) return false;
      if (endDate && txDate > endDate) return false;

      return true;
    });

    const umkmAggregate = {};
    const categoryAggregate = {};
    
    let totalSales = 0;
    let salesCount = 0;

    filteredTx.forEach(tx => {
      const amt = Number(tx.amount) || 0;
      const uName = (tx.metadata && tx.metadata.umkm_name) || tx.to_user;
      const cat = (tx.metadata && tx.metadata.category) || 'Lainnya';

      totalSales += amt;
      salesCount++;

      if (!umkmAggregate[uName]) {
        umkmAggregate[uName] = { name: uName, total: 0, count: 0 };
      }
      umkmAggregate[uName].total += amt;
      umkmAggregate[uName].count++;

      if (!categoryAggregate[cat]) {
        categoryAggregate[cat] = { name: cat, total: 0, count: 0 };
      }
      categoryAggregate[cat].total += amt;
      categoryAggregate[cat].count++;
    });

    return res.json({
      summary: {
        totalSales,
        salesCount,
        averageBasket: salesCount > 0 ? Math.round(totalSales / salesCount) : 0
      },
      byUmkm: Object.values(umkmAggregate),
      byCategory: Object.values(categoryAggregate),
      transactions: filteredTx.slice(0, 100)
    });
  } catch (error) {
    console.error('Sales analytical error:', error);
    res.locals.errorMessage = 'Failed to retrieve sales analysis';
    return res.status(500).json({ error: res.locals.errorMessage });
  }
};

// GET /api/analytics/cashflow
const getCashflowAnalysis = async (req, res) => {
  const { startDate, endDate } = req.query;

  try {
    const rawData = await fetchLocalLedgerData();

    const filteredTx = rawData.filter(tx => {
      if (tx.status !== 'success') return false;
      const txDate = tx.timestamp.split(' ')[0];
      if (startDate && txDate < startDate) return false;
      if (endDate && txDate > endDate) return false;
      return true;
    });

    let totalInflow = 0;
    let totalOutflow = 0;
    let totalFee = 0;
    let totalTax = 0;

    const monthlyTrend = {};

    filteredTx.forEach(tx => {
      const amt = Number(tx.amount) || 0;
      const f = Number(tx.fee) || 0;
      const t = Number(tx.tax) || 0;
      const dateParts = tx.timestamp.split(' ')[0].split('-');
      const monthStr = `${dateParts[0]}-${dateParts[1]}`;

      const isOutflow = tx.from_app === 'SupplierHub';

      if (!monthlyTrend[monthStr]) {
        monthlyTrend[monthStr] = { month: monthStr, inflow: 0, outflow: 0, net: 0 };
      }

      if (!isOutflow) {
        totalInflow += amt;
        totalFee += f;
        totalTax += t;
        monthlyTrend[monthStr].inflow += amt;
      } else {
        totalOutflow += amt;
        totalTax += t;
        monthlyTrend[monthStr].outflow += amt;
      }
    });

    Object.keys(monthlyTrend).forEach(m => {
      monthlyTrend[m].net = monthlyTrend[m].inflow - monthlyTrend[m].outflow;
    });

    return res.json({
      summary: {
        totalInflow,
        totalOutflow,
        totalPlatformFee: totalFee,
        totalTaxDeductions: totalTax,
        netCashflow: totalInflow - totalOutflow - totalFee - totalTax
      },
      monthlyTrend: Object.values(monthlyTrend).sort((a, b) => a.month.localeCompare(b.month)),
      transactions: filteredTx.slice(0, 100)
    });
  } catch (error) {
    console.error('Cashflow analysis error:', error);
    res.locals.errorMessage = 'Failed to analyze cashflow details';
    return res.status(500).json({ error: res.locals.errorMessage });
  }
};

// GET /api/reports
const getReports = async (req, res) => {
  const { category, sourceApp, startDate, endDate } = req.query;
  const isPremiumUser = req.user.is_premium === 1 || req.user.role === 'lecturer' || req.user.role === 'admin';

  if (!isPremiumUser) {
    res.locals.errorMessage = 'Premium subscription required to generate report tables';
    return res.status(403).json({ error: res.locals.errorMessage });
  }

  try {
    const rawData = await fetchLocalLedgerData();

    const filteredReports = rawData.filter(tx => {
      if (tx.status !== 'success') return false;
      
      const txCategory = (tx.metadata && tx.metadata.category) || 'Lainnya';
      const txDate = tx.timestamp.split(' ')[0];
      const txApp = tx.from_app;

      if (category && txCategory.toLowerCase() !== category.toLowerCase()) return false;
      if (sourceApp && txApp.toLowerCase() !== sourceApp.toLowerCase()) return false;
      if (startDate && txDate < startDate) return false;
      if (endDate && txDate > endDate) return false;

      return true;
    });

    return res.json({
      reportTitle: 'Laporan Analitis Transaksi UMKM',
      generatedAt: new Date().toISOString(),
      filtersUsed: { category, sourceApp, startDate, endDate },
      totalRecordCount: filteredReports.length,
      data: filteredReports
    });
  } catch (error) {
    console.error('Report compilation error:', error);
    res.locals.errorMessage = 'Failed to generate report';
    return res.status(500).json({ error: res.locals.errorMessage });
  }
};

module.exports = {
  syncExternalData,
  getDashboardData,
  getSalesAnalysis,
  getCashflowAnalysis,
  getReports
};
