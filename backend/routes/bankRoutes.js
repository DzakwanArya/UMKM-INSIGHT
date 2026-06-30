const express = require('express');
const router = express.Router();
const bankController = require('../controllers/bankController');
const { authenticateToken } = require('../middleware/auth');

// Get all bank subscription payment records
router.get('/transactions', authenticateToken, bankController.getTransactions);

module.exports = router;
