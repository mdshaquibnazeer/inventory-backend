const { Op, sequelize: db } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const { Transaction, TransactionItem, Product, User } = require('../models');
const { transactionList } = require('../dsa/LinkedList');
const { productHashMap } = require('../dsa/HashMap');
const { checkAndCreateAlert } = require('./productController');
const logger = require('../utils/logger');

const generateRef = () => `TXN-${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;

/**
 * POST /api/transactions
 * Records a sale, decrements stock, validates availability
 */
const createTransaction = async (req, res) => {
  const t = await db.transaction();
  try {
    const { items, payment_method = 'cash', customer_name, customer_phone, discount_amount = 0, notes } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'At least one item required' });
    }

    let subtotal = 0;
    const itemDetails = [];

    // Validate all items and lock rows
    for (const item of items) {
      const product = await Product.findByPk(item.product_id, {
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

      if (!product || !product.is_active) {
        await t.rollback();
        return res.status(404).json({ success: false, message: `Product not found: ${item.product_id}` });
      }

      if (product.qty_in_stock < item.quantity) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for "${product.name}". Available: ${product.qty_in_stock}, Requested: ${item.quantity}`,
        });
      }

      const lineTotal = parseFloat(product.selling_price) * item.quantity - (item.discount || 0);
      subtotal += lineTotal;

      itemDetails.push({
        product,
        transactionItem: {
          id: uuidv4(),
          product_id: product.id,
          product_name: product.name,
          product_sku: product.sku,
          quantity: item.quantity,
          unit_price: product.selling_price,
          cost_price: product.cost_price,
          discount: item.discount || 0,
          line_total: lineTotal,
        },
      });
    }

    const taxAmount = subtotal * 0.0; // Tax can be per-item if needed
    const totalAmount = subtotal - parseFloat(discount_amount) + taxAmount;

    // Create transaction record
    const transaction = await Transaction.create({
      id: uuidv4(),
      transaction_ref: generateRef(),
      cashier_id: req.user.id,
      subtotal,
      tax_amount: taxAmount,
      discount_amount: parseFloat(discount_amount),
      total_amount: totalAmount,
      payment_method,
      customer_name,
      customer_phone,
      status: 'completed',
      notes,
    }, { transaction: t });

    // Create line items and decrement stock
    for (const { product, transactionItem } of itemDetails) {
      await TransactionItem.create(
        { ...transactionItem, transaction_id: transaction.id },
        { transaction: t }
      );

      const newQty = product.qty_in_stock - transactionItem.quantity;
      await product.update({ qty_in_stock: newQty }, { transaction: t });

      // Update HashMap cache
      const cached = productHashMap.get(product.id);
      if (cached) {
        cached.qty_in_stock = newQty;
        productHashMap.set(product.id, cached);
        productHashMap.set(product.sku, cached);
      }
    }

    await t.commit();

    // Fetch full transaction for response + linked list
    const fullTxn = await Transaction.findByPk(transaction.id, {
      include: [
        { model: TransactionItem, as: 'items' },
        { model: User, as: 'cashier', attributes: ['name', 'email'] },
      ],
    });

    const txnData = fullTxn.toJSON();

    // Prepend to Doubly Linked List (O(1))
    transactionList.prepend(txnData);

    // Check alerts after stock decrement
    for (const { product } of itemDetails) {
      const refreshed = await Product.findByPk(product.id);
      await checkAndCreateAlert(refreshed);
    }

    logger.info(`Transaction ${transaction.transaction_ref} completed. Total: ₹${totalAmount}`);

    res.status(201).json({
      success: true,
      message: 'Sale recorded successfully',
      data: txnData,
    });
  } catch (error) {
    await t.rollback();
    logger.error('Create transaction error:', error);
    res.status(500).json({ success: false, message: 'Transaction failed' });
  }
};

/**
 * GET /api/transactions
 */
const getTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 20, start_date, end_date, payment_method, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = {};

    if (start_date || end_date) {
      where.created_at = {};
      if (start_date) where.created_at[Op.gte] = new Date(start_date);
      if (end_date) where.created_at[Op.lte] = new Date(end_date + 'T23:59:59');
    }
    if (payment_method) where.payment_method = payment_method;
    if (status) where.status = status;

    const { count, rows } = await Transaction.findAndCountAll({
      where,
      include: [
        { model: TransactionItem, as: 'items' },
        { model: User, as: 'cashier', attributes: ['name'] },
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset,
    });

    res.json({
      success: true,
      data: rows,
      pagination: { total: count, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(count / parseInt(limit)) },
    });
  } catch (error) {
    logger.error('Get transactions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch transactions' });
  }
};

/**
 * GET /api/transactions/:id
 */
const getTransactionById = async (req, res) => {
  try {
    // Check linked list first (O(n) for now, O(1) with hashmap extension)
    const cached = transactionList.findById(req.params.id);
    if (cached) return res.json({ success: true, data: cached });

    const txn = await Transaction.findByPk(req.params.id, {
      include: [
        { model: TransactionItem, as: 'items' },
        { model: User, as: 'cashier', attributes: ['name', 'email'] },
      ],
    });

    if (!txn) return res.status(404).json({ success: false, message: 'Transaction not found' });
    res.json({ success: true, data: txn });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch transaction' });
  }
};

/**
 * POST /api/transactions/:id/void
 * Void a transaction and restore stock (Admin only)
 */
const voidTransaction = async (req, res) => {
  const t = await db.transaction();
  try {
    const txn = await Transaction.findByPk(req.params.id, {
      include: [{ model: TransactionItem, as: 'items' }],
      transaction: t,
    });

    if (!txn) { await t.rollback(); return res.status(404).json({ success: false, message: 'Transaction not found' }); }
    if (txn.status === 'voided') { await t.rollback(); return res.status(400).json({ success: false, message: 'Already voided' }); }

    await txn.update({ status: 'voided' }, { transaction: t });

    // Restore stock for each item
    for (const item of txn.items) {
      await Product.increment('qty_in_stock', { by: item.quantity, where: { id: item.product_id }, transaction: t });
      const cached = productHashMap.get(item.product_id);
      if (cached) {
        cached.qty_in_stock += item.quantity;
        productHashMap.set(item.product_id, cached);
      }
    }

    await t.commit();
    transactionList.deleteById(req.params.id);

    res.json({ success: true, message: 'Transaction voided and stock restored' });
  } catch (error) {
    await t.rollback();
    res.status(500).json({ success: false, message: 'Void failed' });
  }
};

module.exports = { createTransaction, getTransactions, getTransactionById, voidTransaction };
