const validateAuth = (req, res, next) => {
  const { username, password } = req.body;

  if (!username || typeof username !== 'string' || username.trim() === '') {
    res.locals.errorMessage = 'Username is required and must be a non-empty string';
    return res.status(400).json({ error: res.locals.errorMessage });
  }

  if (username.length < 3) {
    res.locals.errorMessage = 'Username must be at least 3 characters long';
    return res.status(400).json({ error: res.locals.errorMessage });
  }

  if (!password || typeof password !== 'string' || password.trim() === '') {
    res.locals.errorMessage = 'Password is required and must be a non-empty string';
    return res.status(400).json({ error: res.locals.errorMessage });
  }

  if (password.length < 6) {
    res.locals.errorMessage = 'Password must be at least 6 characters long';
    return res.status(400).json({ error: res.locals.errorMessage });
  }

  next();
};

const validateSubscription = (req, res, next) => {
  const { amount } = req.body;

  // Validasi agar nominal yang dimasukkan berupa angka positif valid (minimal Rp 1.000)
  if (amount === undefined || typeof amount !== 'number' || amount < 1000) {
    res.locals.errorMessage = 'Subscription amount must be a number and at least 1,000 IDR';
    return res.status(400).json({ error: res.locals.errorMessage });
  }

  next();
};

module.exports = {
  validateAuth,
  validateSubscription
};
