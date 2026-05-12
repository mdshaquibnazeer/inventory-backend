const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');

// Controllers
const authCtrl = require('../controllers/authController');
const productCtrl = require('../controllers/productController');
const txnCtrl = require('../controllers/transactionController');
const reportCtrl = require('../controllers/reportController');
const misc = require('../controllers/miscControllers');

// ─── AUTH ──────────────────────────────────────────────────────────────────
router.post('/auth/login',   authCtrl.login);
router.post('/auth/refresh', authCtrl.refreshToken);
router.post('/auth/register', authenticate, authorize('admin'), authCtrl.register);
router.post('/auth/logout',   authenticate, authCtrl.logout);
router.get('/auth/me',        authenticate, authCtrl.getMe);

// ─── PRODUCTS ──────────────────────────────────────────────────────────────
router.get('/products',               authenticate, productCtrl.getProducts);
router.get('/products/sorted',        authenticate, productCtrl.getSortedProducts);
router.get('/products/stats/dsa',     authenticate, productCtrl.getDSAMetrics);
router.get('/products/lookup/sku/:sku', authenticate, productCtrl.getProductBySKU);
router.get('/products/:id',           authenticate, productCtrl.getProductById);
router.post('/products',              authenticate, authorize('admin','staff'), productCtrl.createProduct);
router.put('/products/:id',           authenticate, authorize('admin','staff'), productCtrl.updateProduct);
router.delete('/products/:id',        authenticate, authorize('admin'), productCtrl.deleteProduct);
router.post('/products/undo',         authenticate, authorize('admin','staff'), productCtrl.undoLastAction);

// ─── TRANSACTIONS ──────────────────────────────────────────────────────────
router.get('/transactions',           authenticate, txnCtrl.getTransactions);
router.get('/transactions/:id',       authenticate, txnCtrl.getTransactionById);
router.post('/transactions',          authenticate, authorize('admin','staff'), txnCtrl.createTransaction);
router.patch('/transactions/:id/void', authenticate, authorize('admin'), txnCtrl.voidTransaction);

// ─── ALERTS ────────────────────────────────────────────────────────────────
router.get('/alerts',                 authenticate, misc.getAlerts);
router.patch('/alerts/:id/acknowledge', authenticate, authorize('admin','staff'), misc.acknowledgeAlert);
router.patch('/alerts/:id/dismiss',   authenticate, authorize('admin'), misc.dismissAlert);

// ─── PURCHASE ORDERS ───────────────────────────────────────────────────────
router.get('/orders',                 authenticate, misc.getOrders);
router.post('/orders',                authenticate, authorize('admin','staff'), misc.createOrder);
router.patch('/orders/:id/receive',   authenticate, authorize('admin','staff'), misc.receiveOrder);

// ─── SUPPLIERS ─────────────────────────────────────────────────────────────
router.get('/suppliers',              authenticate, misc.getSuppliers);
router.post('/suppliers',             authenticate, authorize('admin'), misc.createSupplier);
router.put('/suppliers/:id',          authenticate, authorize('admin'), misc.updateSupplier);
router.get('/suppliers/:id/risk',     authenticate, misc.getSupplyRisk);
router.post('/suppliers/:id/link',    authenticate, authorize('admin'), misc.linkProductToSupplier);

// ─── REPORTS ───────────────────────────────────────────────────────────────
router.get('/reports/dashboard',      authenticate, reportCtrl.getDashboardStats);
router.get('/reports/sales',          authenticate, reportCtrl.getSalesReport);
router.get('/reports/inventory',      authenticate, reportCtrl.getInventoryReport);
router.get('/reports/export/csv',     authenticate, reportCtrl.exportCSV);

// ─── USERS ─────────────────────────────────────────────────────────────────
router.get('/users',                  authenticate, authorize('admin'), misc.getUsers);
router.put('/users/:id',              authenticate, authorize('admin'), misc.updateUser);

module.exports = router;
