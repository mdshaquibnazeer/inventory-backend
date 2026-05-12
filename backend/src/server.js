require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

const { connectDB } = require('./config/database');
const routes = require('./routes');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 5000;

// Ensure logs dir exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

// ─── SECURITY MIDDLEWARE ───────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'development'
    ? true  // Allow all origins in development (supports file:// protocol)
    : (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(','),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting: 200 req/15min per IP
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
}));

// Stricter limit on auth endpoints
app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many login attempts.' },
}));

// ─── GENERAL MIDDLEWARE ────────────────────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));

// ─── HEALTH CHECK ──────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    env: process.env.NODE_ENV,
  });
});

// ─── API ROUTES ────────────────────────────────────────────────────────────
app.use('/api', routes);

// ─── ERROR HANDLERS ────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

// ─── BOOT ──────────────────────────────────────────────────────────────────
const start = async () => {
  try {
    await connectDB();

    // Pre-load DSA structures from DB
    await loadDSAState();

    app.listen(PORT, () => {
      logger.info(`🚀 Server running on http://localhost:${PORT}`);
      logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err) {
    logger.error('Server start failed:', err);
    process.exit(1);
  }
};

/**
 * On startup, hydrate in-memory DSA structures from DB
 * This ensures the HashMap, BST, Graph are populated
 * even after a server restart.
 */
const loadDSAState = async () => {
  try {
    const { Product, Supplier, ProductSupplier, Alert } = require('./models');
    const { productHashMap } = require('./dsa/HashMap');
    const { productByPrice, productByName } = require('./dsa/BST');
    const { alertQueue } = require('./dsa/MinHeap');
    const { supplierGraph } = require('./dsa/Graph');
    const { transactionList } = require('./dsa/LinkedList');
    const { Transaction, TransactionItem } = require('./models');

    // Load products → HashMap + BST
    const products = await Product.findAll({ where: { is_active: true }, limit: 100000 });
    for (const p of products) {
      const data = p.toJSON();
      productHashMap.set(p.id, data);
      productHashMap.set(p.sku, data);
      productByPrice.insert(data);
      productByName.insert(data);
      supplierGraph.addNode(p.id, 'product', { name: p.name, sku: p.sku });
    }
    logger.info(`HashMap loaded: ${products.length} products`);

    // Load active alerts → MinHeap
    const alerts = await Alert.findAll({
      where: { status: ['active', 'acknowledged'] },
      include: [{ model: Product, as: 'product' }],
    });
    for (const a of alerts) {
      alertQueue.insert({
        id: a.id,
        product_id: a.product_id,
        product_name: a.product?.name,
        sku: a.product?.sku,
        current_qty: a.current_qty,
        reorder_level: a.reorder_level,
        alert_type: a.alert_type,
        expiry_date: a.product?.expiry_date,
      });
    }
    logger.info(`Alert heap loaded: ${alerts.length} alerts`);

    // Load suppliers + edges → Graph
    const suppliers = await Supplier.findAll({ where: { is_active: true } });
    for (const s of suppliers) {
      supplierGraph.addNode(s.id, 'supplier', { name: s.name, rating: parseFloat(s.rating) });
    }
    const links = await ProductSupplier.findAll();
    for (const link of links) {
      try {
        if (supplierGraph.nodes.has(link.supplier_id) && supplierGraph.nodes.has(link.product_id)) {
          supplierGraph.addEdge(link.supplier_id, link.product_id,
            parseFloat(suppliers.find(s => s.id === link.supplier_id)?.rating || 3),
            { lead_time: link.lead_time_days }
          );
        }
      } catch { /* duplicate edge */ }
    }
    logger.info(`Supplier graph loaded: ${supplierGraph.getStats().totalNodes} nodes`);

    // Load recent transactions → LinkedList (last 500)
    const recentTxns = await Transaction.findAll({
      where: { status: 'completed' },
      include: [{ model: TransactionItem, as: 'items' }],
      order: [['created_at', 'DESC']],
      limit: 500,
    });
    for (const txn of recentTxns.reverse()) {
      transactionList.append(txn.toJSON());
    }
    logger.info(`Linked list loaded: ${recentTxns.length} recent transactions`);

  } catch (err) {
    logger.warn('DSA state preload failed (OK if DB is empty):', err.message);
  }
};

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

start();

module.exports = app;
