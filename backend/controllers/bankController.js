const db = require('../config/db');

// GET /api/bank/transactions
// Fetch all logged subscription payment inflows in the bank system
const getTransactions = async (req, res) => {
  try {
    // Optional: restrict to admin/lecturer or allow any logged-in user depending on requirement
    // In our case, we can allow any logged-in user to see bank transactions for audit demo
    const query = `
      SELECT bt.*, u.username 
      FROM bank_transactions bt
      JOIN users u ON bt.user_id = u.id
      ORDER BY bt.created_at DESC
    `;
    const transactions = await db.all(query);

    // Calculate total bank revenue
    const totalRevenue = transactions.reduce((sum, tx) => sum + (tx.amount || 0), 0);

    return res.json({
      success: true,
      summary: {
        totalTransactions: transactions.length,
        totalRevenue
      },
      transactions
    });
  } catch (error) {
    console.error('Error fetching bank transactions:', error);
    res.locals.errorMessage = 'Failed to fetch bank ledger';
    return res.status(500).json({ error: res.locals.errorMessage });
  }
};

module.exports = {
  getTransactions
};
