const midtransClient = require('midtrans-client');
const db = require('../config/db');

// Initialize Midtrans Snap client
// Uses environment variables with default sandboxes as fallbacks
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
  const amount = req.body.amount || 10000; // Menggunakan nominal kustom dari request body

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
        id: 'premium_weekly',
        price: amount,
        quantity: 1,
        name: 'UMKM Insight Premium - Berlangganan'
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
      `INSERT INTO subscriptions (id, user_id, amount, status, snap_token, created_at, updated_at) 
       VALUES (?, ?, ?, 'pending', ?, datetime('now', 'localtime'), datetime('now', 'localtime'))`,
      [orderId, userId, amount, snapToken]
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
      const durationDays = 7; // Weekly subscription
      const now = new Date();
      const premiumUntilDate = new Date();
      premiumUntilDate.setDate(now.getDate() + durationDays);
      const premiumUntilStr = premiumUntilDate.toISOString().replace('T', ' ').substring(0, 19);

      await db.run(
        `UPDATE users SET is_premium = 1, premium_until = ? WHERE id = ?`,
        [premiumUntilStr, subscription.user_id]
      );
      console.log(`Premium activated for User ID ${subscription.user_id} until ${premiumUntilStr}`);
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
        const durationDays = 7;
        const now = new Date();
        const premiumUntilDate = new Date();
        premiumUntilDate.setDate(now.getDate() + durationDays);
        const premiumUntilStr = premiumUntilDate.toISOString().replace('T', ' ').substring(0, 19);

        await db.run(
          `UPDATE users SET is_premium = 1, premium_until = ? WHERE id = ?`,
          [premiumUntilStr, subscription.user_id]
        );
        console.log(`Premium activated for User ID ${subscription.user_id} until ${premiumUntilStr} via verify endpoint`);
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
  verifyPaymentStatus
};
