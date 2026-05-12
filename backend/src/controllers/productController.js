const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const { Product, Category, Supplier, Alert } = require('../models');
const { productHashMap } = require('../dsa/HashMap');
const { productByPrice, productByName, productByQty } = require('../dsa/BST');
const { alertQueue } = require('../dsa/MinHeap');
const { getUndoStack } = require('../dsa/Stack');
const { supplierGraph } = require('../dsa/Graph');
const { quickSort } = require('../dsa/Graph');
const logger = require('../utils/logger');

/**
 * Compute reorder point for a product
 * Reorder Point = (Avg Daily Sales × Lead Time) + Safety Stock
 */
const computeReorderPoint = (product) => {
  const avgDailySales = parseFloat(product.average_daily_sales) || 1;
  const leadTime = 7; // days (from supplier, default)
  const safetyStock = Math.ceil(avgDailySales * (parseInt(process.env.DEFAULT_REORDER_SAFETY_STOCK_DAYS) || 7));
  return Math.ceil(avgDailySales * leadTime) + safetyStock;
};

/**
 * Check product stock level and trigger alert if needed
 */
const checkAndCreateAlert = async (product) => {
  const qty = product.qty_in_stock;
  const reorder = product.reorder_level || computeReorderPoint(product);
  let alertType = null;

  if (qty === 0) alertType = 'out_of_stock';
  else if (qty <= reorder * 0.5) alertType = 'critical_stock';
  else if (qty <= reorder) alertType = 'low_stock';

  if (alertType) {
    // Insert or update in heap
    alertQueue.insert({
      id: product.id,
      product_id: product.id,
      product_name: product.name,
      sku: product.sku,
      current_qty: qty,
      reorder_level: reorder,
      alert_type: alertType,
      expiry_date: product.expiry_date,
    });

    // Persist to DB (upsert)
    await Alert.upsert({
      id: uuidv4(),
      product_id: product.id,
      alert_type: alertType,
      message: `${product.name} stock at ${qty} (reorder at ${reorder})`,
      current_qty: qty,
      reorder_level: reorder,
      priority: qty / reorder,
      status: 'active',
    }, { conflictFields: ['product_id'] });
  }

  // Check expiry
  if (product.expiry_date) {
    const daysToExpiry = Math.ceil((new Date(product.expiry_date) - new Date()) / 86400000);
    if (daysToExpiry <= 30) {
      alertQueue.insert({
        id: `expiry_${product.id}`,
        product_id: product.id,
        product_name: product.name,
        sku: product.sku,
        current_qty: qty,
        reorder_level: reorder,
        alert_type: 'expiry',
        expiry_date: product.expiry_date,
      });
    }
  }
};

// ─── CONTROLLER METHODS ───────────────────────────────────────────────────────

/**
 * GET /api/products
 * Supports: search, category, sort, price range, pagination
 */
const getProducts = async (req, res) => {
  try {
    const {
      page = 1, limit = 50, search = '', category_id,
      sort = 'name', order = 'ASC',
      min_price, max_price,
      status, // 'ok' | 'low' | 'critical' | 'out'
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build WHERE clause
    const where = { is_active: true };
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { sku: { [Op.iLike]: `%${search}%` } },
        { barcode: { [Op.iLike]: `%${search}%` } },
      ];
    }
    if (category_id) where.category_id = category_id;

    // Price range — uses Binary Search on sorted array in memory
    if (min_price || max_price) {
      const priceWhere = {};
      if (min_price) priceWhere[Op.gte] = parseFloat(min_price);
      if (max_price) priceWhere[Op.lte] = parseFloat(max_price);
      where.selling_price = priceWhere;
    }

    // Stock status filter
    if (status === 'out') where.qty_in_stock = 0;
    else if (status === 'critical') where.qty_in_stock = { [Op.gt]: 0, [Op.lte]: sequelize.literal('reorder_level * 0.5') };
    else if (status === 'low') where.qty_in_stock = { [Op.lte]: sequelize.col('reorder_level') };
    else if (status === 'ok') where.qty_in_stock = { [Op.gt]: sequelize.col('reorder_level') };

    const validSortFields = ['name', 'selling_price', 'qty_in_stock', 'created_at', 'sku'];
    const safeSort = validSortFields.includes(sort) ? sort : 'name';
    const safeOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const { count, rows } = await Product.findAndCountAll({
      where,
      include: [{ model: Category, as: 'category', attributes: ['id', 'name', 'color'] }],
      order: [[safeSort, safeOrder]],
      limit: parseInt(limit),
      offset,
    });

    // Calculate stock status for each product
    const products = rows.map(p => {
      const qty = p.qty_in_stock;
      const reorder = p.reorder_level;
      let stockStatus = 'ok';
      if (qty === 0) stockStatus = 'out';
      else if (qty <= reorder * 0.5) stockStatus = 'critical';
      else if (qty <= reorder) stockStatus = 'low';

      return {
        ...p.toJSON(),
        stock_status: stockStatus,
        profit_margin: p.cost_price > 0
          ? (((p.selling_price - p.cost_price) / p.selling_price) * 100).toFixed(1)
          : null,
        reorder_point: computeReorderPoint(p),
      };
    });

    res.json({
      success: true,
      data: products,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error('Get products error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
};

/**
 * GET /api/products/:id
 * Uses in-memory HashMap for O(1) lookup if cached
 */
const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    // Try HashMap first (O(1))
    let product = productHashMap.get(id) || productHashMap.get(id.toString());

    if (!product) {
      // Fall back to DB
      const dbProduct = await Product.findByPk(id, {
        include: [
          { model: Category, as: 'category' },
          { model: Supplier, as: 'suppliers' },
        ],
      });
      if (!dbProduct) {
        return res.status(404).json({ success: false, message: 'Product not found' });
      }
      product = dbProduct.toJSON();
      productHashMap.set(id, product); // Cache for future lookups
    }

    res.json({ success: true, data: product });
  } catch (error) {
    logger.error('Get product error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch product' });
  }
};

/**
 * GET /api/products/lookup/sku/:sku
 * O(1) SKU lookup via HashMap (for POS barcode scan)
 */
const getProductBySKU = async (req, res) => {
  try {
    const { sku } = req.params;

    // HashMap O(1) lookup
    let product = productHashMap.get(sku.toUpperCase());

    if (!product) {
      const dbProduct = await Product.findOne({
        where: { sku: sku.toUpperCase(), is_active: true },
        include: [{ model: Category, as: 'category' }],
      });
      if (!dbProduct) {
        return res.status(404).json({ success: false, message: 'Product not found for this SKU' });
      }
      product = dbProduct.toJSON();
      productHashMap.set(sku.toUpperCase(), product);
    }

    res.json({ success: true, data: product });
  } catch (error) {
    logger.error('SKU lookup error:', error);
    res.status(500).json({ success: false, message: 'SKU lookup failed' });
  }
};

/**
 * POST /api/products
 */
const createProduct = async (req, res) => {
  try {
    const { name, sku, barcode, category_id, selling_price, cost_price,
            qty_in_stock, reorder_level, shelf_location, unit, expiry_date,
            is_perishable, description, primary_supplier_id, tax_rate, max_stock_level } = req.body;

    if (!name || !sku || !selling_price) {
      return res.status(400).json({ success: false, message: 'Name, SKU, and selling price are required' });
    }

    const existing = await Product.findOne({ where: { sku: sku.toUpperCase() } });
    if (existing) {
      return res.status(409).json({ success: false, message: `SKU "${sku}" already exists` });
    }

    const product = await Product.create({
      id: uuidv4(), name, sku: sku.toUpperCase(), barcode, category_id,
      selling_price: parseFloat(selling_price),
      cost_price: cost_price ? parseFloat(cost_price) : null,
      qty_in_stock: parseInt(qty_in_stock) || 0,
      reorder_level: parseInt(reorder_level) || 10,
      max_stock_level: max_stock_level ? parseInt(max_stock_level) : null,
      shelf_location, unit: unit || 'pcs',
      expiry_date: expiry_date || null,
      is_perishable: !!is_perishable,
      description, primary_supplier_id,
      tax_rate: parseFloat(tax_rate) || 0,
    });

    const fullProduct = await Product.findByPk(product.id, {
      include: [{ model: Category, as: 'category' }],
    });
    const productData = fullProduct.toJSON();

    // Store in HashMap
    productHashMap.set(product.id, productData);
    productHashMap.set(product.sku, productData);

    // Insert into BST indexes
    productByPrice.insert(productData);
    productByName.insert(productData);

    // Add to supplier graph
    supplierGraph.addNode(product.id, 'product', { name: product.name, sku: product.sku });

    // Undo support
    const undoStack = getUndoStack(req.user.id);
    undoStack.push('CREATE_PRODUCT', { ...productData, userId: req.user.id }, null);

    // Check if initial stock needs alert
    await checkAndCreateAlert(product);

    logger.info(`Product created: ${name} (${sku}) by ${req.user.email}`);
    res.status(201).json({ success: true, message: 'Product created', data: productData });
  } catch (error) {
    logger.error('Create product error:', error);
    res.status(500).json({ success: false, message: 'Failed to create product' });
  }
};

/**
 * PUT /api/products/:id
 */
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findByPk(id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const prevState = product.toJSON();

    // Capture undo state
    const undoStack = getUndoStack(req.user.id);
    undoStack.push('UPDATE_PRODUCT', { ...req.body, id, userId: req.user.id }, prevState);

    const allowedFields = [
      'name', 'description', 'category_id', 'selling_price', 'cost_price',
      'qty_in_stock', 'reorder_level', 'shelf_location', 'unit', 'expiry_date',
      'is_perishable', 'primary_supplier_id', 'barcode', 'tax_rate', 'max_stock_level',
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    await product.update(updates);

    // Invalidate & refresh HashMap
    productHashMap.delete(id);
    productHashMap.delete(prevState.sku);
    const updated = await Product.findByPk(id, { include: [{ model: Category, as: 'category' }] });
    const updatedData = updated.toJSON();
    productHashMap.set(id, updatedData);
    productHashMap.set(updatedData.sku, updatedData);

    // Refresh BST
    productByPrice.delete(prevState);
    productByPrice.insert(updatedData);
    productByName.delete(prevState);
    productByName.insert(updatedData);

    await checkAndCreateAlert(updated);

    logger.info(`Product updated: ${id} by ${req.user.email}`);
    res.json({ success: true, message: 'Product updated', data: updatedData });
  } catch (error) {
    logger.error('Update product error:', error);
    res.status(500).json({ success: false, message: 'Failed to update product' });
  }
};

/**
 * DELETE /api/products/:id (soft delete)
 */
const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findByPk(id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const prevState = product.toJSON();
    const undoStack = getUndoStack(req.user.id);
    undoStack.push('DELETE_PRODUCT', { id, userId: req.user.id }, prevState);

    await product.update({ is_active: false });
    productHashMap.delete(id);
    productHashMap.delete(product.sku);
    productByPrice.delete(prevState);
    productByName.delete(prevState);
    alertQueue.remove(id);

    logger.info(`Product soft-deleted: ${id} by ${req.user.email}`);
    res.json({ success: true, message: 'Product deleted' });
  } catch (error) {
    logger.error('Delete product error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete product' });
  }
};

/**
 * POST /api/products/undo
 * Uses LIFO Stack to reverse last action
 */
const undoLastAction = async (req, res) => {
  try {
    const undoStack = getUndoStack(req.user.id);
    const frame = undoStack.pop();

    if (!frame) {
      return res.status(400).json({ success: false, message: 'Nothing to undo' });
    }

    switch (frame.action) {
      case 'DELETE_PRODUCT':
        await Product.update({ is_active: true }, { where: { id: frame.reversalData.id } });
        productHashMap.set(frame.reversalData.id, frame.reversalData);
        productHashMap.set(frame.reversalData.sku, frame.reversalData);
        break;
      case 'UPDATE_PRODUCT':
        await Product.update(frame.reversalData, { where: { id: frame.reversalData.id } });
        productHashMap.set(frame.reversalData.id, frame.reversalData);
        break;
      case 'CREATE_PRODUCT':
        await Product.update({ is_active: false }, { where: { id: frame.data.id } });
        productHashMap.delete(frame.data.id);
        break;
    }

    res.json({ success: true, message: `Undone: ${frame.action}`, data: frame.reversalData });
  } catch (error) {
    logger.error('Undo error:', error);
    res.status(500).json({ success: false, message: 'Undo failed' });
  }
};

/**
 * GET /api/products/sorted
 * BST-based sorted views
 */
const getSortedProducts = async (req, res) => {
  try {
    const { by = 'price', order = 'asc', min, max } = req.query;

    let results;
    if (by === 'price' && (min || max)) {
      results = productByPrice.rangeQuery(
        parseFloat(min) || 0,
        parseFloat(max) || Infinity
      );
    } else if (by === 'price') {
      results = order === 'desc' ? productByPrice.inOrderDesc() : productByPrice.inOrder();
    } else if (by === 'name') {
      results = order === 'desc' ? productByName.inOrderDesc() : productByName.inOrder();
    } else {
      results = order === 'desc' ? productByQty.inOrderDesc() : productByQty.inOrder();
    }

    res.json({ success: true, data: results, meta: { sortBy: by, order, count: results.length } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get sorted products' });
  }
};

/**
 * GET /api/products/stats/dsametrics
 */
const getDSAMetrics = async (req, res) => {
  const { alertQueue: aq } = require('../dsa/MinHeap');
  const { orderQueue: oq } = require('../dsa/Queue');
  const { transactionList: tl } = require('../dsa/LinkedList');

  res.json({
    success: true,
    data: {
      hashMap: productHashMap.getMetrics(),
      bstPrice: productByPrice.getStats(),
      bstName: productByName.getStats(),
      alertHeap: aq.getStats(),
      orderQueue: oq.getStats(),
      transactionList: tl.getStats(),
      supplierGraph: supplierGraph.getStats(),
    },
  });
};

module.exports = {
  getProducts, getProductById, getProductBySKU,
  createProduct, updateProduct, deleteProduct,
  undoLastAction, getSortedProducts, getDSAMetrics,
  checkAndCreateAlert,
};
