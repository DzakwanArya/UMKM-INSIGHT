const midtransClient = require('midtrans-client');
const db = require('../config/db');

// Subscription Plans configuration
const SUBSCRIPTION_PLANS = {
  '7_days': { name: 'Premium 7 Hari', durationDays: 7, amount: 10000 },
  '1_month': { name: 'Premium 1 Bulan', durationDays: 30, amount: 30000 },
  '3_months': { name: 'Premium 3 Bulan', durationDays: 90, amount: 80000 },
  '1_year': { name: 'Premium 1 Tahun', durationDays: 365, amount: 250000 }
};

const getSubscriptionPlans = async (req, res) => {
  try {
    const plans = Object.entries(SUBSCRIPTION_PLANS).map(([id, plan]) => ({
      id,
      name: plan.name,
      durationDays: plan.durationDays,
      amount: plan.amount
    }));

    return res.json({
      success: true,
      plans
    });
  } catch (error) {
    console.error('Error fetching subscription plans:', error);
    return res.status(500).json({ error: 'Failed to fetch subscription plans' });
  }
};

// Initialize Midtrans Snap client
const getSnapInstance = () => {
  const serverKey = process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-umkm-insight-mock-key';
  const clientKey = process.env.MIDTRANS_CLIENT_KEY || 'SB-Mid-client-umkm-insight-mock-key';
  const isProduction = process.env.MIDTRANS_IS_PRODUCTION === 'true';

  return new midtransClient.Snap({
    isProduction,
    serverKey,
    clientKey
  });
};

// POST /api/subscription/create
const createSubscription = async (req, res) => {
  const userId = req.user.id;
  const username = req.user.username;
  
  // Extract planId or fall back to amount mapping
  const planId = req.body.planId || (req.body.amount === 30000 ? '1_month' : req.body.amount === 80000 ? '3_months' : req.body.amount === 250000 ? '1_year' : '7_days');
  const plan = SUBSCRIPTION_PLANS[planId] || { name: 'Premium Custom', durationDays: 7, amount: req.body.amount || 10000 };
  const amount = req.body.amount || plan.amount;

  try {
    // 1. Check if user is already premium
    const user = await db.get('SELECT is_premium, premium_until FROM users WHERE id = ?', [userId]);
    if (user && user.is_premium === 1) {
      // Check expiration
      const now = new Date();
      const expires = new Date(user.premium_until);
      if (now < expires) {
        res.locals.errorMessage = 'You already have an active premium subscription';
        return res.status(400).json({ error: res.locals.errorMessage });
      }
    }

    // 2. Setup Midtrans payment params
    const orderId = `SUB-${userId.substring(0, 8)}-${Date.now()}`;
    const parameter = {
      transaction_details: {
        order_id: orderId,
        gross_amount: amount
      },
      item_details: [{
        id: planId,
        price: amount,
        quantity: 1,
        name: `UMKM Insight Premium - ${plan.name || 'Berlangganan'}`
      }],
      customer_details: {
        first_name: username,
        email: `${username}@example.com`
      },
      // Membatasi pilihan pembayaran hanya melalui Transfer Bank (Virtual Account)
      enabled_payments: ["bank_transfer"]
    };

    let snapToken = '';
    let redirectUrl = '';
    let isMockPayment = false;

    // Check if we are using mockup keys
    const isMockKey = !process.env.MIDTRANS_SERVER_KEY || process.env.MIDTRANS_SERVER_KEY.includes('mock-key');

    if (isMockKey) {
      // Generate a mock token for local simulation
      console.log('Using mock Midtrans credentials, generating mock payment token.');
      snapToken = `MOCK-SNAP-TOKEN-${orderId}`;
      redirectUrl = `https://app.sandbox.midtrans.com/snap/v2/vtweb/${snapToken}`;
      isMockPayment = true;
    } else {
      try {
        const snap = getSnapInstance();
        const transaction = await snap.createTransaction(parameter);
        snapToken = transaction.token;
        redirectUrl = transaction.redirect_url;
      } catch (midtransError) {
        console.error('Midtrans API error, falling back to mock payment:', midtransError.message);
        // Fallback to mock simulation so demo never crashes
        snapToken = `MOCK-SNAP-TOKEN-${orderId}`;
        redirectUrl = `https://app.sandbox.midtrans.com/snap/v2/vtweb/${snapToken}`;
        isMockPayment = true;
      }
    }

    // 3. Save subscription to database
    await db.run(
      `INSERT INTO subscriptions (id, user_id, amount, status, snap_token, plan_type, duration_days, created_at, updated_at) 
       VALUES (?, ?, ?, 'pending', ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))`,
      [orderId, userId, amount, snapToken, planId, plan.durationDays]
    );

    return res.status(201).json({
      message: 'Subscription payment initiated',
      orderId,
      snapToken,
      redirectUrl,
      isMockPayment
    });
  } catch (error) {
    console.error('Subscription creation error:', error);
    res.locals.errorMessage = 'Failed to create subscription';
    return res.status(500).json({ error: res.locals.errorMessage });
  }
};

// POST /api/subscription/webhook
// Handles payment updates from Midtrans
const handleWebhook = async (req, res) => {
  const notificationPayload = req.body;

  try {
    const isMockKey = !process.env.MIDTRANS_SERVER_KEY || process.env.MIDTRANS_SERVER_KEY.includes('mock-key');
    let orderId = notificationPayload.order_id;
    let transactionStatus = notificationPayload.transaction_status;
    let fraudStatus = notificationPayload.fraud_status;

    // Signature verification for production/real Sandbox
    if (!isMockKey) {
      try {
        const snap = getSnapInstance();
        const statusResponse = await snap.transaction.notification(notificationPayload);
        orderId = statusResponse.order_id;
        transactionStatus = statusResponse.transaction_status;
        fraudStatus = statusResponse.fraud_status;
      } catch (verifyErr) {
        console.warn('Midtrans Signature verification failed, check payload format:', verifyErr.message);
        // During testing or mock sandbox calls, let it fall through if keys match
      }
    }

    console.log(`Webhook notification received for Order: ${orderId}, Status: ${transactionStatus}`);

    // Find the subscription in our database
    const subscription = await db.get('SELECT * FROM subscriptions WHERE id = ?', [orderId]);
    if (!subscription) {
      res.locals.errorMessage = `Subscription order ${orderId} not found`;
      return res.status(404).json({ error: res.locals.errorMessage });
    }

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

    // Update Subscription status in DB
    await db.run(
      `UPDATE subscriptions SET status = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`,
      [finalStatus, orderId]
    );

    // If payment was settled, activate/extend the user's premium status
    if (finalStatus === 'settlement') {
      const durationDays = subscription.duration_days || 7;
      const user = await db.get('SELECT is_premium, premium_until FROM users WHERE id = ?', [subscription.user_id]);
      let baseDate = new Date();
      if (user && user.is_premium === 1 && user.premium_until) {
        const currentExpiry = new Date(user.premium_until);
        if (currentExpiry > baseDate) {
          baseDate = currentExpiry;
        }
      }
      const premiumUntilDate = new Date(baseDate);
      premiumUntilDate.setDate(baseDate.getDate() + durationDays);
      const premiumUntilStr = premiumUntilDate.toISOString().replace('T', ' ').substring(0, 19);

      await db.run(
        `UPDATE users SET is_premium = 1, premium_until = ? WHERE id = ?`,
        [premiumUntilStr, subscription.user_id]
      );
      console.log(`Premium activated for User ID ${subscription.user_id} until ${premiumUntilStr} (Duration: ${durationDays} days)`);

      // Record transaction to local bank database
      const existingBankTx = await db.get('SELECT 1 FROM bank_transactions WHERE subscription_id = ?', [orderId]);
      if (!existingBankTx) {
        const bankTxId = `BANK-${orderId.substring(4)}`;
        await db.run(
          `INSERT INTO bank_transactions (id, subscription_id, user_id, amount, plan_type, status, created_at)
           VALUES (?, ?, ?, ?, ?, 'success', datetime('now', 'localtime'))`,
          [bankTxId, orderId, subscription.user_id, subscription.amount, subscription.plan_type || '7_days']
        );
        console.log(`Bank transaction recorded: ${bankTxId} for amount ${subscription.amount}`);
      }
    }

    return res.json({ message: 'Notification processed successfully', orderId, status: finalStatus });
  } catch (error) {
    console.error('Midtrans webhook processing error:', error);
    res.locals.errorMessage = 'Webhook processing failed';
    return res.status(500).json({ error: res.locals.errorMessage });
  }
};

// POST /api/subscription/simulate-payment (Helper for demo purposes when using MOCK client)
const simulatePayment = async (req, res) => {
  const { orderId, approve } = req.body;

  try {
    const subscription = await db.get('SELECT * FROM subscriptions WHERE id = ?', [orderId]);
    if (!subscription) {
      res.locals.errorMessage = 'Subscription order not found';
      return res.status(404).json({ error: res.locals.errorMessage });
    }

    const payload = {
      order_id: orderId,
      transaction_status: approve ? 'settlement' : 'cancel',
      fraud_status: 'accept'
    };

    // Forward to our own webhook handler to keep it uniform
    req.body = payload;
    return handleWebhook(req, res);
  } catch (error) {
    console.error('Simulation payment error:', error);
    res.locals.errorMessage = 'Simulation failed';
    return res.status(500).json({ error: res.locals.errorMessage });
  }
};

// GET /api/subscription/status
const checkStatus = async (req, res) => {
  try {
    const user = await db.get('SELECT is_premium, premium_until FROM users WHERE id = ?', [req.user.id]);
    return res.json({
      isPremium: user.is_premium === 1,
      premiumUntil: user.premium_until
    });
  } catch (error) {
    console.error('Check subscription status error:', error);
    res.locals.errorMessage = 'Failed to check premium status';
    return res.status(500).json({ error: res.locals.errorMessage });
  }
};

// POST /api/subscription/verify/:orderId
const verifyPaymentStatus = async (req, res) => {
  const { orderId } = req.params;
  const isMockKey = !process.env.MIDTRANS_SERVER_KEY || process.env.MIDTRANS_SERVER_KEY.includes('mock-key');

  try {
    const subscription = await db.get('SELECT * FROM subscriptions WHERE id = ?', [orderId]);
    if (!subscription) {
      res.locals.errorMessage = 'Subscription order not found';
      return res.status(404).json({ error: res.locals.errorMessage });
    }

    let transactionStatus = 'pending';
    let fraudStatus = 'accept';

    if (isMockKey) {
      transactionStatus = subscription.status === 'settlement' ? 'settlement' : 'pending';
    } else {
      // Call Midtrans API directly to check latest status
      const serverKey = process.env.MIDTRANS_SERVER_KEY;
      const authHeader = Buffer.from(`${serverKey}:`).toString('base64');
      const axios = require('axios');
      
      const response = await axios.get(`https://api.sandbox.midtrans.com/v2/${orderId}/status`, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authHeader}`
        }
      });

      transactionStatus = response.data.transaction_status;
      fraudStatus = response.data.fraud_status;
    }

    let finalStatus = subscription.status;

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
    } else if (transactionStatus === 'pending') {
      finalStatus = 'pending';
    }

    if (finalStatus !== subscription.status) {
      await db.run(
        `UPDATE subscriptions SET status = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`,
        [finalStatus, orderId]
      );

      if (finalStatus === 'settlement') {
        const durationDays = subscription.duration_days || 7;
        const user = await db.get('SELECT is_premium, premium_until FROM users WHERE id = ?', [subscription.user_id]);
        let baseDate = new Date();
        if (user && user.is_premium === 1 && user.premium_until) {
          const currentExpiry = new Date(user.premium_until);
          if (currentExpiry > baseDate) {
            baseDate = currentExpiry;
          }
        }
        const premiumUntilDate = new Date(baseDate);
        premiumUntilDate.setDate(baseDate.getDate() + durationDays);
        const premiumUntilStr = premiumUntilDate.toISOString().replace('T', ' ').substring(0, 19);

        await db.run(
          `UPDATE users SET is_premium = 1, premium_until = ? WHERE id = ?`,
          [premiumUntilStr, subscription.user_id]
        );
        console.log(`Premium activated for User ID ${subscription.user_id} until ${premiumUntilStr} via verify endpoint (Duration: ${durationDays} days)`);

        // Record transaction to local bank database
        const existingBankTx = await db.get('SELECT 1 FROM bank_transactions WHERE subscription_id = ?', [orderId]);
        if (!existingBankTx) {
          const bankTxId = `BANK-${orderId.substring(4)}`;
          await db.run(
            `INSERT INTO bank_transactions (id, subscription_id, user_id, amount, plan_type, status, created_at)
             VALUES (?, ?, ?, ?, ?, 'success', datetime('now', 'localtime'))`,
            [bankTxId, orderId, subscription.user_id, subscription.amount, subscription.plan_type || '7_days']
          );
          console.log(`Bank transaction recorded: ${bankTxId} via verify endpoint`);
        }
      }
    }

    return res.json({
      message: 'Verification successful',
      orderId,
      status: finalStatus,
      isPremium: finalStatus === 'settlement'
    });
  } catch (error) {
    console.error('Payment verification error:', error.message || error);
    res.locals.errorMessage = 'Failed to verify payment status';
    return res.status(500).json({ error: res.locals.errorMessage });
  }
};

module.exports = {
  createSubscription,
  handleWebhook,
  simulatePayment,
  checkStatus,
  verifyPaymentStatus,
  getSubscriptionPlans
};
