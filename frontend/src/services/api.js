import axios from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── REQUEST INTERCEPTOR: attach token ─────────────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── RESPONSE INTERCEPTOR: handle 401/refresh ──────────────────────────────
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(p => error ? p.reject(error) : p.resolve(token));
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry) {
      if (error.response?.data?.code === 'TOKEN_EXPIRED') {
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          }).then(token => {
            original.headers.Authorization = `Bearer ${token}`;
            return api(original);
          });
        }

        original._retry = true;
        isRefreshing = true;

        try {
          const refreshToken = localStorage.getItem('refreshToken');
          if (!refreshToken) throw new Error('No refresh token');

          const { data } = await axios.post('/api/auth/refresh', { refreshToken });
          const newToken = data.data.accessToken;
          localStorage.setItem('accessToken', newToken);
          localStorage.setItem('refreshToken', data.data.refreshToken);
          api.defaults.headers.Authorization = `Bearer ${newToken}`;
          processQueue(null, newToken);
          original.headers.Authorization = `Bearer ${newToken}`;
          return api(original);
        } catch (refreshError) {
          processQueue(refreshError);
          localStorage.clear();
          window.location.href = '/login';
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }

      localStorage.clear();
      window.location.href = '/login';
    }

    // Show error toast for non-auth errors
    const message = error.response?.data?.message || error.message || 'Request failed';
    if (error.response?.status !== 401) {
      toast.error(message, { id: 'api-error' });
    }

    return Promise.reject(error);
  }
);

// ─── TYPED API METHODS ─────────────────────────────────────────────────────
export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get('/auth/me'),
  register: (data) => api.post('/auth/register', data),
};

export const productAPI = {
  list: (params) => api.get('/products', { params }),
  getById: (id) => api.get(`/products/${id}`),
  getBySKU: (sku) => api.get(`/products/lookup/sku/${sku}`),
  create: (data) => api.post('/products', data),
  update: (id, data) => api.put(`/products/${id}`, data),
  delete: (id) => api.delete(`/products/${id}`),
  undo: () => api.post('/products/undo'),
  sorted: (params) => api.get('/products/sorted', { params }),
  dsaMetrics: () => api.get('/products/stats/dsa'),
};

export const transactionAPI = {
  list: (params) => api.get('/transactions', { params }),
  getById: (id) => api.get(`/transactions/${id}`),
  create: (data) => api.post('/transactions', data),
  void: (id) => api.patch(`/transactions/${id}/void`),
};

export const alertAPI = {
  list: (params) => api.get('/alerts', { params }),
  acknowledge: (id) => api.patch(`/alerts/${id}/acknowledge`),
  dismiss: (id) => api.patch(`/alerts/${id}/dismiss`),
};

export const orderAPI = {
  list: (params) => api.get('/orders', { params }),
  create: (data) => api.post('/orders', data),
  receive: (id, quantities) => api.patch(`/orders/${id}/receive`, { quantities }),
};

export const supplierAPI = {
  list: () => api.get('/suppliers'),
  create: (data) => api.post('/suppliers', data),
  update: (id, data) => api.put(`/suppliers/${id}`, data),
  risk: (id, productId) => api.get(`/suppliers/${id}/risk`, { params: { product_id: productId } }),
  linkProduct: (id, data) => api.post(`/suppliers/${id}/link`, data),
};

export const reportAPI = {
  dashboard: () => api.get('/reports/dashboard'),
  sales: (params) => api.get('/reports/sales', { params }),
  inventory: () => api.get('/reports/inventory'),
  exportCSV: (type) => api.get('/reports/export/csv', { params: { type }, responseType: 'blob' }),
};

export const userAPI = {
  list: () => api.get('/users'),
  update: (id, data) => api.put(`/users/${id}`, data),
};

export default api;
