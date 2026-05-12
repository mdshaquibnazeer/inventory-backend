const { Op, fn, col, literal } = require('sequelize');
const { Transaction, TransactionItem, Product, Category } = require('../models');
const { quickSort } = require('../dsa/Graph');
const { productHashMap } = require('../dsa/HashMap');
const logger = require('../utils/logger');

/**
 * GET /api/reports/dashboard
 * KPI summary for dashboard
 */
const getDashboardStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());

    const [
      totalProducts, lowStockCount, todayRevenue, weekRevenue,
      monthRevenue, todayTransactions, totalAlerts
    ] = await Promise.all([
      Product.count({ where: { is_active: true } }),
      Product.count({ where: { is_active: true, qty_in_stock: { [Op.lte]: col('reorder_level') } } }),
      Transaction.sum('total_amount', { where: { created_at: { [Op.between]: [today, todayEnd] }, status: 'completed' } }),
      Transaction.sum('total_amount', { where: { created_at: { [Op.gte]: startOfWeek }, status: 'completed' } }),
      Transaction.sum('total_amount', { where: { created_at: { [Op.gte]: startOfMonth }, status: 'completed' } }),
      Transaction.count({ where: { created_at: { [Op.between]: [today, todayEnd] }, status: 'completed' } }),
      require('../models').Alert.count({ where: { status: 'active' } }),
    ]);

    // Expiring soon
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);
    const expiringSoon = await Product.count({
      where: {
        is_active: true,
        expiry_date: { [Op.between]: [new Date(), expiryDate] },
      },
    });

    res.json({
      success: true,
      data: {
        totalProducts,
        lowStockCount,
        todayRevenue: todayRevenue || 0,
        weekRevenue: weekRevenue || 0,
        monthRevenue: monthRevenue || 0,
        todayTransactions,
        totalAlerts,
        expiringSoon,
        hashMapMetrics: productHashMap.getMetrics(),
      },
    });
  } catch (error) {
    logger.error('Dashboard error:', error);
    res.status(500).json({ success: false, message: 'Failed to load dashboard' });
  }
};

/**
 * GET /api/reports/sales
 * Daily/Weekly/Monthly sales with Quick Sort on products
 */
const getSalesReport = async (req, res) => {
  try {
    const { period = 'daily', start_date, end_date, limit = 20 } = req.query;

    let startDate, groupFormat;
    const now = new Date();

    if (start_date) {
      startDate = new Date(start_date);
    } else {
      switch (period) {
        case 'weekly': startDate = new Date(now.setDate(now.getDate() - 7)); groupFormat = 'YYYY-WW'; break;
        case 'monthly': startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1); groupFormat = 'YYYY-MM'; break;
        default: startDate = new Date(); startDate.setDate(startDate.getDate() - 30); groupFormat = 'YYYY-MM-DD';
      }
    }

    // Sales over time
    const salesByDay = await Transaction.findAll({
      attributes: [
        [fn('DATE', col('created_at')), 'date'],
        [fn('COUNT', col('id')), 'transactions'],
        [fn('SUM', col('total_amount')), 'revenue'],
        [fn('SUM', col('discount_amount')), 'discounts'],
      ],
      where: { created_at: { [Op.gte]: startDate }, status: 'completed' },
      group: [fn('DATE', col('created_at'))],
      order: [[fn('DATE', col('created_at')), 'ASC']],
      raw: true,
    });

    // Top products by quantity — uses Quick Sort
    const topProductsRaw = await TransactionItem.findAll({
      attributes: [
        'product_id', 'product_name', 'product_sku',
        [fn('SUM', col('quantity')), 'total_qty'],
        [fn('SUM', col('line_total')), 'total_revenue'],
        [fn('COUNT', col('transaction_id')), 'txn_count'],
      ],
      include: [{
        model: require('../models').Transaction,
        attributes: [],
        where: { created_at: { [Op.gte]: startDate }, status: 'completed' },
      }],
      group: ['transaction_item.product_id', 'transaction_item.product_name', 'transaction_item.product_sku'],
      raw: true,
      limit: 100,
    });

    // Apply Quick Sort by total revenue (descending)
    const topProducts = quickSort(topProductsRaw, (a, b) =>
      parseFloat(b.total_revenue) - parseFloat(a.total_revenue)
    ).slice(0, parseInt(limit));

    // Payment method breakdown
    const paymentBreakdown = await Transaction.findAll({
      attributes: [
        'payment_method',
        [fn('COUNT', col('id')), 'count'],
        [fn('SUM', col('total_amount')), 'revenue'],
      ],
      where: { created_at: { [Op.gte]: startDate }, status: 'completed' },
      group: ['payment_method'],
      raw: true,
    });

    // Category breakdown
    const categoryBreakdown = await TransactionItem.findAll({
      attributes: [
        [fn('SUM', col('line_total')), 'revenue'],
        [fn('SUM', col('transaction_item.quantity')), 'qty'],
      ],
      include: [
        {
          model: Product,
          as: 'product',
          attributes: [],
          include: [{ model: Category, as: 'category', attributes: ['name', 'color'] }],
        },
        {
          model: require('../models').Transaction,
          attributes: [],
          where: { created_at: { [Op.gte]: startDate }, status: 'completed' },
        },
      ],
      group: ['product->category.id', 'product->category.name', 'product->category.color'],
      raw: true,
      nest: true,
    });

    res.json({
      success: true,
      data: {
        salesByDay,
        topProducts,
        paymentBreakdown,
        categoryBreakdown,
        period,
        startDate,
      },
    });
  } catch (error) {
    logger.error('Sales report error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate sales report' });
  }
};

/**
 * GET /api/reports/inventory
 * Stock analysis, dead stock, profit margins
 */
const getInventoryReport = async (req, res) => {
  try {
    const products = await Product.findAll({
      where: { is_active: true },
      include: [{ model: Category, as: 'category', attributes: ['name', 'color'] }],
      raw: true,
      nest: true,
    });

    // Dead stock: no sales in past 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const activeSKUs = await TransactionItem.findAll({
      attributes: ['product_id'],
      include: [{
        model: require('../models').Transaction,
        attributes: [],
        where: { created_at: { [Op.gte]: thirtyDaysAgo }, status: 'completed' },
      }],
      group: ['product_id'],
      raw: true,
    });
    const activeIds = new Set(activeSKUs.map(r => r.product_id));

    const deadStock = products.filter(p => !activeIds.has(p.id) && p.qty_in_stock > 0);

    // Quick Sort: by stock value descending
    const stockByValue = quickSort(products, (a, b) => {
      const valA = parseFloat(a.selling_price || 0) * parseInt(a.qty_in_stock || 0);
      const valB = parseFloat(b.selling_price || 0) * parseInt(b.qty_in_stock || 0);
      return valB - valA;
    }).slice(0, 20);

    // Quick Sort: by profit margin
    const byMargin = quickSort(
      products.filter(p => p.cost_price > 0),
      (a, b) => {
        const mA = (a.selling_price - a.cost_price) / a.selling_price;
        const mB = (b.selling_price - b.cost_price) / b.selling_price;
        return mB - mA;
      }
    ).slice(0, 10);

    // Total inventory value
    const totalInventoryValue = products.reduce((sum, p) =>
      sum + parseFloat(p.selling_price || 0) * parseInt(p.qty_in_stock || 0), 0
    );
    const totalCostValue = products.reduce((sum, p) =>
      sum + parseFloat(p.cost_price || 0) * parseInt(p.qty_in_stock || 0), 0
    );

    // Expiry report
    const today = new Date();
    const expiry7 = new Date(); expiry7.setDate(today.getDate() + 7);
    const expiry30 = new Date(); expiry30.setDate(today.getDate() + 30);
    const expiry90 = new Date(); expiry90.setDate(today.getDate() + 90);

    const expiringProducts = await Product.findAll({
      where: {
        is_active: true,
        expiry_date: { [Op.lte]: expiry90 },
      },
      include: [{ model: Category, as: 'category', attributes: ['name'] }],
      order: [['expiry_date', 'ASC']],
    });

    res.json({
      success: true,
      data: {
        summary: {
          totalProducts: products.length,
          totalInventoryValue: totalInventoryValue.toFixed(2),
          totalCostValue: totalCostValue.toFixed(2),
          unrealizedProfit: (totalInventoryValue - totalCostValue).toFixed(2),
          deadStockCount: deadStock.length,
          deadStockValue: deadStock.reduce((s, p) => s + p.selling_price * p.qty_in_stock, 0).toFixed(2),
        },
        topValueProducts: stockByValue,
        highMarginProducts: byMargin,
        deadStock: deadStock.slice(0, 20),
        expiringProducts,
      },
    });
  } catch (error) {
    logger.error('Inventory report error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate inventory report' });
  }
};

/**
 * GET /api/reports/export/csv
 */
const exportCSV = async (req, res) => {
  try {
    const { type = 'products' } = req.query;
    const { Parser } = require('json2csv');

    let data, fields;

    if (type === 'products') {
      const products = await Product.findAll({
        where: { is_active: true },
        include: [{ model: Category, as: 'category', attributes: ['name'] }],
        raw: true, nest: true,
      });
      data = products.map(p => ({
        sku: p.sku, name: p.name, category: p.category?.name,
        selling_price: p.selling_price, cost_price: p.cost_price,
        qty_in_stock: p.qty_in_stock, reorder_level: p.reorder_level,
        shelf: p.shelf_location, expiry: p.expiry_date,
      }));
      fields = ['sku', 'name', 'category', 'selling_price', 'cost_price', 'qty_in_stock', 'reorder_level', 'shelf', 'expiry'];
    } else {
      const txns = await Transaction.findAll({
        where: { status: 'completed' },
        include: [{ model: TransactionItem, as: 'items' }],
        order: [['created_at', 'DESC']],
        limit: 5000,
        raw: true, nest: true,
      });
      data = txns;
      fields = ['transaction_ref', 'total_amount', 'payment_method', 'created_at'];
    }

    const parser = new Parser({ fields });
    const csv = parser.parse(data);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${type}_export_${Date.now()}.csv"`);
    res.send(csv);
  } catch (error) {
    logger.error('Export CSV error:', error);
    res.status(500).json({ success: false, message: 'Export failed' });
  }
};

module.exports = { getDashboardStats, getSalesReport, getInventoryReport, exportCSV };
