require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { initDb } = require('./config/db');
const requestLogger = require('./middleware/logger');

// Route Imports
const authRoutes = require('./routes/authRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const bankRoutes = require('./routes/bankRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for frontend requests (Next.js app running on localhost:3000/3001)
app.use(cors({
  origin: '*', // Allows requests from any origin for assignment development
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Express built-in parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Developer logging in terminal
app.use(morgan('dev'));

// Custom database-auditing logger middleware
app.use(requestLogger);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/bank', bankRoutes);

// Base Route
app.get('/', (req, res) => {
  res.json({
    name: 'UMKM Insight REST API Server',
    status: 'Running',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.locals.errorMessage = err.message || 'Internal Server Error';
  res.status(err.status || 500).json({ error: res.locals.errorMessage });
});

// Boot Database and Listen
const boot = async () => {
  await initDb();
  app.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(` UMKM Insight backend server is running!`);
    console.log(` Port: ${PORT}`);
    console.log(` Base URL: http://localhost:${PORT}`);
    console.log(`=================================================`);
  });
};

boot();
