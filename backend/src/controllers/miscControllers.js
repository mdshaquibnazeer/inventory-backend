// ─── ALERT CONTROLLER ────────────────────────────────────────────────────────
const { Alert, Product, Supplier, PurchaseOrder, PurchaseOrderItem, ProductSupplier } = require('../models');
const { alertQueue } = require('../dsa/MinHeap');
const { orderQueue } = require('../dsa/Queue');
const { supplierGraph } = require('../dsa/Graph');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

/**
 * GET /api/alerts
 * Returns alerts sorted by Min-Heap priority
 */
const getAlerts = async (req, res) => {
  try {
    const { status = 'active', limit = 50 } = req.query;
    const alerts = await Alert.findAll({
      where: { status },
      include: [{ model: Product, as: 'product', attributes: ['id', 'name', 'sku', 'qty_in_stock', 'reorder_level', 'expiry_date', 'image_url'] }],
      order: [['priority', 'ASC'], ['created_at', 'ASC']],
      limit: parseInt(limit),
    });

    // Also include in-memory heap data
    const heapAlerts = alertQueue.toSortedArray();

    res.json({
      success: true,
      data: alerts,
      heapData: heapAlerts.slice(0, 10),
      stats: alertQueue.getStats(),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch alerts' });
  }
};

/**
 * PATCH /api/alerts/:id/acknowledge
 */
const acknowledgeAlert = async (req, res) => {
  try {
    await Alert.update({ status: 'acknowledged' }, { where: { id: req.params.id } });
    alertQueue.acknowledge(req.params.id);
    res.json({ success: true, message: 'Alert acknowledged' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to acknowledge' });
  }
};

/**
 * PATCH /api/alerts/:id/dismiss
 */
const dismissAlert = async (req, res) => {
  try {
    await Alert.update({ status: 'dismissed', resolved_at: new Date(), resolved_by: req.user.id }, { where: { id: req.params.id } });
    alertQueue.remove(req.params.id);
    res.json({ success: true, message: 'Alert dismissed' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to dismiss' });
  }
};

// ─── PURCHASE ORDER CONTROLLER ────────────────────────────────────────────────

/**
 * POST /api/orders
 * Create purchase order from alert, enqueue in FIFO Queue
 */
const createOrder = async (req, res) => {
  try {
    const { supplier_id, items, alert_id, expected_delivery, notes } = req.body;

    if (!supplier_id || !items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Supplier and items required' });
    }

    const orderRef = `PO-${Date.now()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
    let totalAmount = 0;

    const order = await PurchaseOrder.create({
      id: uuidv4(), order_ref: orderRef, supplier_id,
      created_by: req.user.id, status: 'pending_approval',
      expected_delivery, notes, alert_id,
    });

    for (const item of items) {
      const product = await Product.findByPk(item.product_id);
      const unitCost = item.unit_cost || parseFloat(product?.cost_price || 0);
      const lineTotal = unitCost * item.quantity_ordered;
      totalAmount += lineTotal;

      await PurchaseOrderItem.create({
        id: uuidv4(), order_id: order.id,
        product_id: item.product_id,
        quantity_ordered: item.quantity_ordered,
        quantity_received: 0,
        unit_cost: unitCost,
        line_total: lineTotal,
      });
    }

    await order.update({ total_amount: totalAmount });

    // Enqueue in FIFO Order Queue
    orderQueue.enqueue({ order_id: orderRef, db_id: order.id, supplier_id, totalAmount, createdBy: req.user.id });

    // Dismiss alert if provided
    if (alert_id) {
      await Alert.update({ status: 'acknowledged' }, { where: { id: alert_id } });
    }

    const fullOrder = await PurchaseOrder.findByPk(order.id, {
      include: [
        { model: Supplier, as: 'supplier', attributes: ['id', 'name', 'email', 'phone'] },
        { model: PurchaseOrderItem, as: 'items', include: [{ model: Product, as: 'product', attributes: ['name', 'sku'] }] },
      ],
    });

    logger.info(`Purchase order created: ${orderRef}`);
    res.status(201).json({ success: true, message: 'Purchase order created', data: fullOrder });
  } catch (error) {
    logger.error('Create order error:', error);
    res.status(500).json({ success: false, message: 'Failed to create order' });
  }
};

/**
 * PATCH /api/orders/:id/receive
 * Mark order received, update stock levels
 */
const receiveOrder = async (req, res) => {
  const t = await require('../config/database').sequelize.transaction();
  try {
    const order = await PurchaseOrder.findByPk(req.params.id, {
      include: [{ model: PurchaseOrderItem, as: 'items' }],
      transaction: t,
    });

    if (!order) { await t.rollback(); return res.status(404).json({ success: false, message: 'Order not found' }); }

    for (const item of order.items) {
      const qtyReceived = req.body.quantities?.[item.product_id] || item.quantity_ordered;
      await Product.increment('qty_in_stock', { by: qtyReceived, where: { id: item.product_id }, transaction: t });
      await item.update({ quantity_received: qtyReceived }, { transaction: t });

      // Clear alert if stock restored
      await Alert.update({ status: 'resolved', resolved_at: new Date() }, {
        where: { product_id: item.product_id, status: { $in: ['active', 'acknowledged'] } },
        transaction: t,
      });
      require('../dsa/MinHeap').alertQueue.remove(item.product_id);
    }

    await order.update({ status: 'received', actual_delivery: new Date() }, { transaction: t });
    await t.commit();

    // Dequeue from order queue
    orderQueue.updateStatus(order.order_ref, 'received');

    res.json({ success: true, message: 'Order received and stock updated' });
  } catch (error) {
    await t.rollback();
    logger.error('Receive order error:', error);
    res.status(500).json({ success: false, message: 'Failed to receive order' });
  }
};

/**
 * GET /api/orders
 */
const getOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const where = status ? { status } : {};

    const { count, rows } = await PurchaseOrder.findAndCountAll({
      where,
      include: [
        { model: Supplier, as: 'supplier', attributes: ['id', 'name', 'email', 'phone', 'rating'] },
        { model: PurchaseOrderItem, as: 'items', include: [{ model: Product, as: 'product', attributes: ['name', 'sku', 'qty_in_stock'] }] },
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    res.json({
      success: true, data: rows,
      queueStatus: orderQueue.getStats(),
      pagination: { total: count, page: parseInt(page), totalPages: Math.ceil(count / parseInt(limit)) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
};

// ─── SUPPLIER CONTROLLER ─────────────────────────────────────────────────────

const getSuppliers = async (req, res) => {
  try {
    const suppliers = await Supplier.findAll({
      where: { is_active: true },
      include: [{ model: Product, as: 'products', attributes: ['id', 'name', 'sku'], through: { attributes: [] } }],
      order: [['rating', 'DESC']],
    });
    res.json({ success: true, data: suppliers, graphStats: supplierGraph.getStats() });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch suppliers' });
  }
};

const createSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.create({ id: uuidv4(), ...req.body });
    supplierGraph.addNode(supplier.id, 'supplier', { name: supplier.name, rating: supplier.rating });
    res.status(201).json({ success: true, data: supplier });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create supplier' });
  }
};

const updateSupplier = async (req, res) => {
  try {
    await Supplier.update(req.body, { where: { id: req.params.id } });
    const updated = await Supplier.findByPk(req.params.id);
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update supplier' });
  }
};

/**
 * GET /api/suppliers/:id/risk
 * Uses Graph BFS/DFS for supply chain risk analysis
 */
const getSupplyRisk = async (req, res) => {
  try {
    const risks = supplierGraph.analyzeSupplyRisk();
    const supplierProducts = supplierGraph.dfs(req.params.id, 'product');
    const bestForProduct = req.query.product_id
      ? supplierGraph.getBestSupplier(req.query.product_id)
      : null;

    res.json({
      success: true,
      data: {
        risks,
        supplierProducts,
        bestSupplier: bestForProduct,
        graphStats: supplierGraph.getStats(),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Risk analysis failed' });
  }
};

/**
 * POST /api/suppliers/:id/link-product
 * Links a supplier to a product in both DB and Graph
 */
const linkProductToSupplier = async (req, res) => {
  try {
    const { product_id, unit_cost, lead_time_days, min_order_qty, is_preferred } = req.body;

    await ProductSupplier.upsert({
      id: uuidv4(),
      product_id, supplier_id: req.params.id,
      unit_cost, lead_time_days, min_order_qty, is_preferred,
    });

    // Add edge in graph (weight = reliability)
    const supplier = await Supplier.findByPk(req.params.id);
    if (supplier) {
      if (!supplierGraph.nodes.has(req.params.id))
        supplierGraph.addNode(req.params.id, 'supplier', { name: supplier.name });
      if (!supplierGraph.nodes.has(product_id))
        supplierGraph.addNode(product_id, 'product', { id: product_id });

      try {
        supplierGraph.addEdge(req.params.id, product_id, parseFloat(supplier.rating), { lead_time: lead_time_days });
      } catch { /* Edge might already exist */ }
    }

    res.json({ success: true, message: 'Supplier linked to product' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to link supplier' });
  }
};

const getUsers = async (req, res) => {
  try {
    const { User } = require('../models');
    const users = await User.findAll({ attributes: ['id', 'name', 'email', 'role', 'is_active', 'last_login', 'created_at'] });
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
};

const updateUser = async (req, res) => {
  try {
    const { User } = require('../models');
    const { role, is_active, name } = req.body;
    await User.update({ role, is_active, name }, { where: { id: req.params.id } });
    const user = await User.findByPk(req.params.id, { attributes: ['id', 'name', 'email', 'role', 'is_active'] });
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update user' });
  }
};

module.exports = {
  getAlerts, acknowledgeAlert, dismissAlert,
  createOrder, receiveOrder, getOrders,
  getSuppliers, createSupplier, updateSupplier, getSupplyRisk, linkProductToSupplier,
  getUsers, updateUser,
};
