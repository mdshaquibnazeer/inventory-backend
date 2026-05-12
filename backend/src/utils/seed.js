require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { connectDB } = require('../config/database');
const { User, Category, Supplier, Product, ProductSupplier, Alert } = require('../models');

const seed = async () => {
  await connectDB();
  console.log('🌱 Seeding database...');

  // ─── USERS ─────────────────────────────────────────────────────────────
  const hash = await bcrypt.hash('Admin@123', 12);
  const staffHash = await bcrypt.hash('Staff@123', 12);

  const [admin] = await User.upsert({ id: uuidv4(), name: 'Admin User', email: 'admin@inventory.com', password_hash: hash, role: 'admin' });
  const [staff] = await User.upsert({ id: uuidv4(), name: 'Staff Member', email: 'staff@inventory.com', password_hash: staffHash, role: 'staff' });
  const [viewer] = await User.upsert({ id: uuidv4(), name: 'Store Viewer', email: 'viewer@inventory.com', password_hash: staffHash, role: 'viewer' });
  console.log('✅ Users seeded');

  // ─── CATEGORIES ────────────────────────────────────────────────────────
  const categories = [
    { id: uuidv4(), name: 'Groceries',     color: '#f59e0b', description: 'Everyday food staples' },
    { id: uuidv4(), name: 'Dairy',         color: '#3b82f6', description: 'Milk, butter, cheese' },
    { id: uuidv4(), name: 'Snacks',        color: '#f97316', description: 'Chips, biscuits, chocolates' },
    { id: uuidv4(), name: 'Beverages',     color: '#22c55e', description: 'Drinks and juices' },
    { id: uuidv4(), name: 'Personal Care', color: '#a855f7', description: 'Hygiene and beauty' },
    { id: uuidv4(), name: 'Household',     color: '#06b6d4', description: 'Cleaning and home supplies' },
    { id: uuidv4(), name: 'Electronics',   color: '#ef4444', description: 'Consumer electronics' },
    { id: uuidv4(), name: 'Clothing',      color: '#ec4899', description: 'Apparel and accessories' },
  ];
  for (const cat of categories) await Category.upsert(cat);
  const catMap = Object.fromEntries(categories.map(c => [c.name, c.id]));
  console.log('✅ Categories seeded');

  // ─── SUPPLIERS ─────────────────────────────────────────────────────────
  const suppliers = [
    { id: uuidv4(), name: 'AgriCo India Pvt Ltd',   contact_person: 'Ramesh Kumar',  email: 'ramesh@agrico.in',   phone: '9876543210', rating: 4.5, lead_time_days: 3,  payment_terms: 'Net 30' },
    { id: uuidv4(), name: 'FreshFarm Distributors', contact_person: 'Sita Devi',     email: 'sita@freshfarm.com', phone: '9123456789', rating: 4.2, lead_time_days: 2,  payment_terms: 'Net 15' },
    { id: uuidv4(), name: 'Metro Wholesale Depot',  contact_person: 'Arjun Sharma',  email: 'arjun@metro.in',     phone: '9988776655', rating: 3.8, lead_time_days: 5,  payment_terms: 'Net 45' },
    { id: uuidv4(), name: 'TechVend Electronics',   contact_person: 'Priya Singh',   email: 'priya@techvend.com', phone: '8877665544', rating: 4.7, lead_time_days: 10, payment_terms: 'Net 60' },
    { id: uuidv4(), name: 'CleanLife Suppliers',    contact_person: 'Amit Gupta',    email: 'amit@cleanlife.in',  phone: '7766554433', rating: 4.0, lead_time_days: 7,  payment_terms: 'Net 30' },
  ];
  for (const sup of suppliers) await Supplier.upsert(sup);
  console.log('✅ Suppliers seeded');

  // ─── PRODUCTS ──────────────────────────────────────────────────────────
  const today = new Date();
  const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate()+n); return r.toISOString().split('T')[0]; };

  const products = [
    // Groceries
    { sku:'RICE-BAS-5K', name:'Basmati Rice 5kg',          category:'Groceries',    price:320, cost:210, qty:45,  reorder:20, shelf:'A-01', expiry: addDays(today, 365) },
    { sku:'OIL-SFW-1L',  name:'Sunflower Oil 1L',          category:'Groceries',    price:145, cost:98,  qty:8,   reorder:15, shelf:'A-02', expiry: addDays(today, 240) },
    { sku:'SALT-TTA-1K', name:'Tata Salt 1kg',              category:'Groceries',    price:22,  cost:14,  qty:200, reorder:50, shelf:'A-03', expiry: null },
    { sku:'SUGAR-WH-1K', name:'Sugar 1kg',                  category:'Groceries',    price:48,  cost:35,  qty:150, reorder:60, shelf:'A-04', expiry: null },
    { sku:'ATTA-WH-5K',  name:'Whole Wheat Atta 5kg',       category:'Groceries',    price:280, cost:195, qty:35,  reorder:20, shelf:'A-05', expiry: addDays(today, 180) },
    { sku:'LENTIL-TUR',  name:'Toor Dal 1kg',               category:'Groceries',    price:168, cost:115, qty:60,  reorder:25, shelf:'A-06', expiry: null },
    { sku:'TOMATO-PURE', name:'Tomato Puree 400g',          category:'Groceries',    price:45,  cost:28,  qty:90,  reorder:30, shelf:'A-07', expiry: addDays(today, 720) },
    // Dairy
    { sku:'BUTTER-AML',  name:'Amul Butter 500g',           category:'Dairy',        price:250, cost:190, qty:3,   reorder:10, shelf:'B-01', expiry: addDays(today, 25), perishable: true },
    { sku:'MILK-AML-1L', name:'Amul Milk 1L',               category:'Dairy',        price:62,  cost:50,  qty:6,   reorder:20, shelf:'B-02', expiry: addDays(today, 5),  perishable: true },
    { sku:'CHEESE-AML',  name:'Amul Cheese Slices 200g',    category:'Dairy',        price:110, cost:82,  qty:18,  reorder:10, shelf:'B-03', expiry: addDays(today, 90), perishable: true },
    { sku:'PANEER-500G', name:'Fresh Paneer 500g',           category:'Dairy',        price:180, cost:140, qty:0,   reorder:8,  shelf:'B-04', expiry: addDays(today, 10), perishable: true },
    { sku:'CURD-500G',   name:'Dahi/Curd 500g',              category:'Dairy',        price:55,  cost:42,  qty:12,  reorder:15, shelf:'B-05', expiry: addDays(today, 15), perishable: true },
    // Snacks
    { sku:'BISC-BRT-PK', name:"Britannia Good Day 200g",    category:'Snacks',       price:40,  cost:28,  qty:110, reorder:40, shelf:'D-01', expiry: addDays(today, 270) },
    { sku:'NOODLE-MGI',  name:'Maggi Noodles 70g',           category:'Snacks',       price:14,  cost:9,   qty:250, reorder:80, shelf:'D-02', expiry: addDays(today, 300) },
    { sku:'CHIPS-LAY',   name:"Lay's Cream & Onion 50g",    category:'Snacks',       price:20,  cost:12,  qty:180, reorder:60, shelf:'D-03', expiry: addDays(today, 120) },
    { sku:'CHOC-CDM',    name:'Cadbury Dairy Milk 50g',      category:'Snacks',       price:50,  cost:35,  qty:95,  reorder:40, shelf:'D-04', expiry: addDays(today, 400) },
    { sku:'NAMKEEN-MIX', name:'Mix Namkeen 400g',            category:'Snacks',       price:65,  cost:42,  qty:70,  reorder:25, shelf:'D-05', expiry: addDays(today, 180) },
    // Beverages
    { sku:'TEA-TAJ-250', name:'Taj Mahal Tea 250g',          category:'Beverages',    price:190, cost:135, qty:42,  reorder:20, shelf:'E-01', expiry: null },
    { sku:'COFFEE-BRU',  name:"Bru Instant Coffee 100g",    category:'Beverages',    price:135, cost:90,  qty:28,  reorder:15, shelf:'E-02', expiry: null },
    { sku:'JUICE-REL',   name:'Real Mango Juice 1L',         category:'Beverages',    price:115, cost:80,  qty:4,   reorder:15, shelf:'E-03', expiry: addDays(today, 200) },
    { sku:'COLA-500ML',  name:'Coca Cola 500ml',             category:'Beverages',    price:30,  cost:18,  qty:200, reorder:80, shelf:'E-04', expiry: addDays(today, 365) },
    { sku:'WATER-1L',    name:'Mineral Water 1L',            category:'Beverages',    price:20,  cost:10,  qty:300, reorder:100,shelf:'E-05', expiry: addDays(today, 365) },
    // Personal Care
    { sku:'TPASTE-CLG',  name:'Colgate Strong Teeth 200g',  category:'Personal Care',price:89,  cost:62,  qty:60,  reorder:25, shelf:'C-01', expiry: null },
    { sku:'SOAP-DVE-100',name:'Dove Body Soap 100g',         category:'Personal Care',price:58,  cost:40,  qty:5,   reorder:20, shelf:'C-02', expiry: null },
    { sku:'SHAMP-HH',    name:"Head & Shoulders 180ml",     category:'Personal Care',price:185, cost:130, qty:22,  reorder:12, shelf:'C-03', expiry: null },
    { sku:'DEODRNT-AXE', name:'Axe Deodorant 150ml',        category:'Personal Care',price:180, cost:125, qty:15,  reorder:10, shelf:'C-04', expiry: null },
    { sku:'SKTCR-LOT',   name:'Nivea Body Lotion 200ml',    category:'Personal Care',price:220, cost:155, qty:18,  reorder:10, shelf:'C-05', expiry: null },
    // Household
    { sku:'DETG-SURF-1K',name:'Surf Excel 1kg',              category:'Household',    price:125, cost:88,  qty:78,  reorder:30, shelf:'F-01', expiry: null },
    { sku:'BROOM-STD',   name:'Standard Broom',              category:'Household',    price:85,  cost:55,  qty:12,  reorder:8,  shelf:'F-02', expiry: null },
    { sku:'DISH-VIM',    name:'Vim Dishwash Bar 200g',       category:'Household',    price:30,  cost:18,  qty:90,  reorder:40, shelf:'F-03', expiry: null },
    // Electronics
    { sku:'BULB-LED-9W', name:'Philips LED Bulb 9W',        category:'Electronics',  price:155, cost:95,  qty:25,  reorder:10, shelf:'G-01', expiry: null },
    { sku:'BATT-ENR-AA', name:'Energizer AA Batteries 4pk', category:'Electronics',  price:120, cost:78,  qty:8,   reorder:10, shelf:'G-02', expiry: null },
  ];

  const createdProducts = [];
  for (const p of products) {
    const id = uuidv4();
    const created = await Product.upsert({
      id, sku: p.sku, name: p.name,
      category_id: catMap[p.category],
      selling_price: p.price, cost_price: p.cost,
      qty_in_stock: p.qty, reorder_level: p.reorder,
      shelf_location: p.shelf, expiry_date: p.expiry || null,
      is_perishable: p.perishable || false,
      average_daily_sales: (Math.random() * 5 + 1).toFixed(2),
      primary_supplier_id: suppliers[Math.floor(Math.random() * 3)].id,
    });
    createdProducts.push({ id, ...p });
  }
  console.log(`✅ Products seeded: ${products.length}`);

  // ─── SUPPLIER-PRODUCT LINKS ─────────────────────────────────────────────
  for (let i = 0; i < Math.min(20, createdProducts.length); i++) {
    const sup = suppliers[i % suppliers.length];
    try {
      await ProductSupplier.upsert({
        id: uuidv4(),
        product_id: createdProducts[i].id,
        supplier_id: sup.id,
        unit_cost: createdProducts[i].cost * 0.95,
        lead_time_days: sup.lead_time_days,
        min_order_qty: 10,
        is_preferred: true,
      });
    } catch {}
  }
  console.log('✅ Supplier links seeded');

  console.log('\n🎉 Seed complete!\n');
  console.log('─────────────────────────────────────────');
  console.log('Login credentials:');
  console.log('  Admin:  admin@inventory.com / Admin@123');
  console.log('  Staff:  staff@inventory.com / Staff@123');
  console.log('  Viewer: viewer@inventory.com / Staff@123');
  console.log('─────────────────────────────────────────');

  process.exit(0);
};

seed().catch(err => { console.error('Seed failed:', err); process.exit(1); });
