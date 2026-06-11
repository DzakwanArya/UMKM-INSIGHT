const API_BASE = 'http://localhost:5000/api';

// Helper to set authorization token
export const getHeaders = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

export const api = {
  // Auth
  register: async (username, password, role) => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to register');
    return data;
  },

  login: async (username, password) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to login');
    return data;
  },

  getProfile: async () => {
    const res = await fetch(`${API_BASE}/auth/profile`, {
      headers: getHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load profile');
    return data;
  },

  // Analytics
  getDashboard: async () => {
    const res = await fetch(`${API_BASE}/analytics/dashboard`, {
      headers: getHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load dashboard metrics');
    return data;
  },

  getSales: async (filters = {}) => {
    const query = new URLSearchParams(filters).toString();
    const res = await fetch(`${API_BASE}/analytics/sales?${query}`, {
      headers: getHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load sales analysis');
    return data;
  },

  getCashflow: async (filters = {}) => {
    const query = new URLSearchParams(filters).toString();
    const res = await fetch(`${API_BASE}/analytics/cashflow?${query}`, {
      headers: getHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load cashflow analysis');
    return data;
  },

  getReports: async (filters = {}) => {
    const query = new URLSearchParams(filters).toString();
    const res = await fetch(`${API_BASE}/analytics/reports?${query}`, {
      headers: getHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to generate report');
    return data;
  },

  // Subscriptions
  createSubscription: async (amount = 10000) => {
    const res = await fetch(`${API_BASE}/subscription/create`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ amount: Number(amount) })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create subscription checkout');
    return data;
  },

  getSubscriptionStatus: async () => {
    const res = await fetch(`${API_BASE}/subscription/status`, {
      headers: getHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to check subscription status');
    return data;
  },

  simulatePayment: async (orderId, approve) => {
    const res = await fetch(`${API_BASE}/subscription/simulate-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, approve })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Simulation failed');
    return data;
  },

  verifySubscription: async (orderId) => {
    const res = await fetch(`${API_BASE}/subscription/verify/${orderId}`, {
      method: 'POST',
      headers: getHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to verify subscription status');
    return data;
  }
};
