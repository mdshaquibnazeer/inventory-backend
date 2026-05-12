const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// ─── USER MODEL ───────────────────────────────────────────────────────────────
const User = sequelize.define('users', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  email: { type: DataTypes.STRING(200), allowNull: false, unique: true, validate: { isEmail: true } },
  password_hash: { type: DataTypes.STRING(255), allowNull: false },
  role: { type: DataTypes.ENUM('admin', 'staff', 'viewer'), defaultValue: 'staff', allowNull: false },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  last_login: { type: DataTypes.DATE },
  failed_attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
  locked_until: { type: DataTypes.DATE },
  refresh_token: { type: DataTypes.TEXT },
}, {
  indexes: [{ fields: ['email'] }, { fields: ['role'] }],
});

// ─── CATEGORY MODEL ───────────────────────────────────────────────────────────
const Category = sequelize.define('categories', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  description: { type: DataTypes.TEXT },
  color: { type: DataTypes.STRING(7), defaultValue: '#3b82f6' },
}, {});

// ─── SUPPLIER MODEL ───────────────────────────────────────────────────────────
const Supplier = sequelize.define('suppliers', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(200), allowNull: false },
  contact_person: { type: DataTypes.STRING(100) },
  email: { type: DataTypes.STRING(200), validate: { isEmail: true } },
  phone: { type: DataTypes.STRING(20) },
  address: { type: DataTypes.TEXT },
  rating: { type: DataTypes.DECIMAL(3, 2), defaultValue: 3.0, validate: { min: 0, max: 5 } },
  lead_time_days: { type: DataTypes.INTEGER, defaultValue: 7 },
  payment_terms: { type: DataTypes.STRING(100) },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  notes: { type: DataTypes.TEXT },
}, {
  indexes: [{ fields: ['name'] }, { fields: ['is_active'] }],
});

// ─── PRODUCT MODEL ────────────────────────────────────────────────────────────
const Product = sequelize.define('products', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(255), allowNull: false },
  sku: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  barcode: { type: DataTypes.STRING(100), unique: true },
  description: { type: DataTypes.TEXT },
  category_id: { type: DataTypes.UUID, references: { model: 'categories', key: 'id' } },
  selling_price: { type: DataTypes.DECIMAL(12, 2), allowNull: false, validate: { min: 0 } },
  cost_price: { type: DataTypes.DECIMAL(12, 2), validate: { min: 0 } },
  qty_in_stock: { type: DataTypes.INTEGER, defaultValue: 0, validate: { min: 0 } },
  reorder_level: { type: DataTypes.INTEGER, defaultValue: 10 },
  max_stock_level: { type: DataTypes.INTEGER },
  shelf_location: { type: DataTypes.STRING(50) },
  unit: { type: DataTypes.STRING(20), defaultValue: 'pcs' },
  expiry_date: { type: DataTypes.DATEONLY },
  is_perishable: { type: DataTypes.BOOLEAN, defaultValue: false },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  image_url: { type: DataTypes.TEXT },
  average_daily_sales: { type: DataTypes.DECIMAL(8, 2), defaultValue: 0 },
  primary_supplier_id: { type: DataTypes.UUID, references: { model: 'suppliers', key: 'id' } },
  tax_rate: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 },
}, {
  indexes: [
    { fields: ['sku'] }, { fields: ['barcode'] }, { fields: ['category_id'] },
    { fields: ['qty_in_stock'] }, { fields: ['is_active'] }, { fields: ['name'] },
    { fields: ['selling_price'] },
  ],
});

// ─── PRODUCT-SUPPLIER JUNCTION ────────────────────────────────────────────────
const ProductSupplier = sequelize.define('product_suppliers', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  product_id: { type: DataTypes.UUID, allowNull: false },
  supplier_id: { type: DataTypes.UUID, allowNull: false },
  supplier_sku: { type: DataTypes.STRING(100) },
  unit_cost: { type: DataTypes.DECIMAL(12, 2) },
  lead_time_days: { type: DataTypes.INTEGER },
  min_order_qty: { type: DataTypes.INTEGER, defaultValue: 1 },
  is_preferred: { type: DataTypes.BOOLEAN, defaultValue: false },
}, {
  indexes: [{ fields: ['product_id'] }, { fields: ['supplier_id'] }],
});

// ─── TRANSACTION (SALE) MODEL ─────────────────────────────────────────────────
const Transaction = sequelize.define('transactions', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  transaction_ref: { type: DataTypes.STRING(30), unique: true },
  cashier_id: { type: DataTypes.UUID, references: { model: 'users', key: 'id' } },
  subtotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  tax_amount: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
  discount_amount: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
  total_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  payment_method: { type: DataTypes.ENUM('cash', 'card', 'upi', 'credit', 'other'), defaultValue: 'cash' },
  customer_name: { type: DataTypes.STRING(100) },
  customer_phone: { type: DataTypes.STRING(20) },
  status: { type: DataTypes.ENUM('completed', 'voided', 'pending'), defaultValue: 'completed' },
  notes: { type: DataTypes.TEXT },
}, {
  indexes: [
    { fields: ['transaction_ref'] }, { fields: ['cashier_id'] },
    { fields: ['created_at'] }, { fields: ['status'] },
  ],
});

// ─── TRANSACTION ITEMS ────────────────────────────────────────────────────────
const TransactionItem = sequelize.define('transaction_items', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  transaction_id: { type: DataTypes.UUID, allowNull: false },
  product_id: { type: DataTypes.UUID, allowNull: false },
  product_name: { type: DataTypes.STRING(255) }, // snapshot
  product_sku: { type: DataTypes.STRING(100) },  // snapshot
  quantity: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
  unit_price: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  cost_price: { type: DataTypes.DECIMAL(12, 2) },
  discount: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
  line_total: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
}, {
  indexes: [{ fields: ['transaction_id'] }, { fields: ['product_id'] }],
});

// ─── ALERT MODEL ─────────────────────────────────────────────────────────────
const Alert = sequelize.define('alerts', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  product_id: { type: DataTypes.UUID, allowNull: false },
  alert_type: { type: DataTypes.ENUM('low_stock', 'critical_stock', 'out_of_stock', 'expiry', 'overstock'), allowNull: false },
  message: { type: DataTypes.TEXT },
  current_qty: { type: DataTypes.INTEGER },
  reorder_level: { type: DataTypes.INTEGER },
  priority: { type: DataTypes.DECIMAL(8, 4) },
  status: { type: DataTypes.ENUM('active', 'acknowledged', 'resolved', 'dismissed'), defaultValue: 'active' },
  resolved_at: { type: DataTypes.DATE },
  resolved_by: { type: DataTypes.UUID },
}, {
  indexes: [{ fields: ['product_id'] }, { fields: ['status'] }, { fields: ['alert_type'] }],
});

// ─── PURCHASE ORDER MODEL ─────────────────────────────────────────────────────
const PurchaseOrder = sequelize.define('purchase_orders', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  order_ref: { type: DataTypes.STRING(30), unique: true },
  supplier_id: { type: DataTypes.UUID, allowNull: false },
  created_by: { type: DataTypes.UUID },
  approved_by: { type: DataTypes.UUID },
  status: {
    type: DataTypes.ENUM('draft', 'pending_approval', 'approved', 'sent', 'partial', 'received', 'cancelled'),
    defaultValue: 'pending_approval',
  },
  total_amount: { type: DataTypes.DECIMAL(12, 2) },
  expected_delivery: { type: DataTypes.DATEONLY },
  actual_delivery: { type: DataTypes.DATEONLY },
  notes: { type: DataTypes.TEXT },
  alert_id: { type: DataTypes.UUID },
}, {
  indexes: [{ fields: ['supplier_id'] }, { fields: ['status'] }, { fields: ['order_ref'] }],
});

// ─── PURCHASE ORDER ITEMS ─────────────────────────────────────────────────────
const PurchaseOrderItem = sequelize.define('purchase_order_items', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  order_id: { type: DataTypes.UUID, allowNull: false },
  product_id: { type: DataTypes.UUID, allowNull: false },
  quantity_ordered: { type: DataTypes.INTEGER, allowNull: false },
  quantity_received: { type: DataTypes.INTEGER, defaultValue: 0 },
  unit_cost: { type: DataTypes.DECIMAL(12, 2) },
  line_total: { type: DataTypes.DECIMAL(12, 2) },
}, {
  indexes: [{ fields: ['order_id'] }, { fields: ['product_id'] }],
});

// ─── ASSOCIATIONS ─────────────────────────────────────────────────────────────
Product.belongsTo(Category, { foreignKey: 'category_id', as: 'category' });
Category.hasMany(Product, { foreignKey: 'category_id' });

Product.belongsTo(Supplier, { foreignKey: 'primary_supplier_id', as: 'primarySupplier' });
Product.belongsToMany(Supplier, { through: ProductSupplier, foreignKey: 'product_id', as: 'suppliers' });
Supplier.belongsToMany(Product, { through: ProductSupplier, foreignKey: 'supplier_id', as: 'products' });

Transaction.belongsTo(User, { foreignKey: 'cashier_id', as: 'cashier' });
Transaction.hasMany(TransactionItem, { foreignKey: 'transaction_id', as: 'items' });
TransactionItem.belongsTo(Transaction, { foreignKey: 'transaction_id' });
TransactionItem.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

Alert.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

PurchaseOrder.belongsTo(Supplier, { foreignKey: 'supplier_id', as: 'supplier' });
PurchaseOrder.hasMany(PurchaseOrderItem, { foreignKey: 'order_id', as: 'items' });
PurchaseOrderItem.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

module.exports = {
  User, Category, Supplier, Product, ProductSupplier,
  Transaction, TransactionItem,
  Alert, PurchaseOrder, PurchaseOrderItem,
};
