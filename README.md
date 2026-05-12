# 🏪 RetailOS — Inventory Tracking System

**Full-Stack Web Application · Data Structures & Algorithms Project**
**Mohammed Shaquib Nazeer · B.Tech CSE · NIET Greater Noida · Faculty: Ms. Sonam Jahan**

---

## 🎯 Project Overview

A production-ready, full-stack inventory management system built with React.js, Node.js/Express, and PostgreSQL. Every core feature is powered by a custom Data Structure implementation — not library black-boxes.

### 🧱 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS + Recharts |
| Backend | Node.js 20 + Express 4 + Sequelize ORM |
| Database | PostgreSQL 16 |
| Cache | Redis 7 (optional) |
| Auth | JWT (access + refresh tokens) + bcrypt |
| Deploy | Docker + docker-compose + Nginx |

---

## ⚙️ DSA Implementations

Every data structure is custom-implemented in `/backend/src/dsa/`:

| File | Structure | Used For | Complexity |
|------|-----------|----------|------------|
| `HashMap.js` | Hash Map (separate chaining) | Product O(1) lookup by SKU/ID | O(1) avg |
| `LinkedList.js` | Doubly Linked List | Transaction history (newest first) | O(1) insert |
| `MinHeap.js` | Min-Heap (Priority Queue) | Alert prioritization by urgency | O(log n) |
| `Stack.js` | Stack (LIFO) | Per-user undo operations | O(1) |
| `Queue.js` | FIFO Queue + ExpiryFIFO | Purchase order processing | O(1) |
| `BST.js` | AVL Binary Search Tree | Sorted products, price range | O(log n) |
| `Graph.js` | Adjacency List Graph | Supplier-product mapping | O(V+E) |
| `Graph.js` | Quick Sort | Sales reports, top products | O(n log n) |
| `Graph.js` | Binary Search (lower/upper bound) | Price range filtering | O(log n) |

---

## 🚀 Quick Start

### Option A: Docker (Recommended)

```bash
# 1. Clone the repo
git clone https://github.com/your-repo/inventory-system
cd inventory-system

# 2. Set environment variables
cp backend/.env.example backend/.env
# Edit backend/.env — at minimum set DB_PASSWORD and JWT_SECRET

# 3. Start all services
docker-compose up -d --build

# 4. Seed sample data
docker exec inventory_backend node src/utils/seed.js

# 5. Access the app
open http://localhost:3000
```

### Option B: Manual Setup

#### Prerequisites
- Node.js 20+
- PostgreSQL 16+
- Redis (optional)

#### Backend

```bash
cd backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your PostgreSQL credentials

# Start development server (auto-syncs DB schema)
npm run dev

# Seed sample data
npm run seed
```

#### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start dev server (proxies /api to localhost:5000)
npm run dev
```

---

## 🔐 Default Login Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@inventory.com | Admin@123 |
| Staff | staff@inventory.com | Staff@123 |
| Viewer | viewer@inventory.com | Staff@123 |

---

## 📡 API Reference

### Authentication
```
POST /api/auth/login           — Get access + refresh token
POST /api/auth/register        — Create user (Admin only)
POST /api/auth/refresh         — Refresh access token
POST /api/auth/logout          — Invalidate refresh token
GET  /api/auth/me              — Get current user
```

### Products
```
GET    /api/products                  — List (search, filter, sort, paginate)
GET    /api/products/:id              — Get by ID (HashMap O(1) cache)
GET    /api/products/lookup/sku/:sku  — SKU lookup (HashMap O(1))
POST   /api/products                  — Create
PUT    /api/products/:id              — Update
DELETE /api/products/:id              — Soft delete
POST   /api/products/undo             — Undo last action (Stack)
GET    /api/products/sorted           — BST sorted view + range query
GET    /api/products/stats/dsa        — Live DSA metrics
```

### Transactions
```
GET    /api/transactions       — List (filters, pagination)
GET    /api/transactions/:id   — Get by ID
POST   /api/transactions       — Create sale (validates stock, decrements, alerts)
PATCH  /api/transactions/:id/void — Void & restore stock (Admin)
```

### Alerts
```
GET    /api/alerts                     — List (Min-Heap sorted)
PATCH  /api/alerts/:id/acknowledge     — Mark seen
PATCH  /api/alerts/:id/dismiss         — Dismiss alert
```

### Purchase Orders
```
GET    /api/orders                     — List orders (FIFO Queue state)
POST   /api/orders                     — Create order
PATCH  /api/orders/:id/receive         — Receive → update stock
```

### Suppliers
```
GET    /api/suppliers                  — List (Graph stats)
POST   /api/suppliers                  — Create
PUT    /api/suppliers/:id              — Update
GET    /api/suppliers/:id/risk         — Supply chain risk (BFS/DFS)
POST   /api/suppliers/:id/link         — Link to product (Graph edge)
```

### Reports
```
GET    /api/reports/dashboard          — KPI summary
GET    /api/reports/sales?period=daily — Sales analysis (Quick Sort)
GET    /api/reports/inventory          — Stock report (dead stock, margins)
GET    /api/reports/export/csv?type=products — CSV export
```

---

## 🗄️ Database Schema

```
users              → id, name, email, password_hash, role, is_active, refresh_token
categories         → id, name, description, color
suppliers          → id, name, contact_person, email, phone, rating, lead_time_days
products           → id, name, sku, barcode, category_id, selling_price, cost_price,
                     qty_in_stock, reorder_level, shelf_location, expiry_date, ...
product_suppliers  → product_id, supplier_id, unit_cost, lead_time_days (many-to-many)
transactions       → id, transaction_ref, cashier_id, total_amount, payment_method
transaction_items  → transaction_id, product_id, quantity, unit_price, line_total
alerts             → product_id, alert_type, current_qty, priority, status
purchase_orders    → supplier_id, order_ref, status, total_amount
purchase_order_items → order_id, product_id, quantity_ordered, quantity_received
```

---

## 📊 Reorder Point Formula

```
Reorder Point = (Average Daily Sales × Lead Time in Days) + Safety Stock
Safety Stock  = Average Daily Sales × Safety Stock Days (default: 7)
```

Alert types (Min-Heap priority order):
1. `out_of_stock` — priority 0 (most critical)
2. `critical_stock` — qty ≤ 50% of reorder level
3. `low_stock` — qty ≤ reorder level
4. `expiry` — priority based on days until expiry

---

## 🔄 On-Startup DSA Hydration

When the server starts, it loads all data from PostgreSQL into in-memory structures:

```
PostgreSQL → HashMap (products by ID + SKU)
PostgreSQL → BST indexes (by price, name, qty)
PostgreSQL → Min-Heap (active alerts)
PostgreSQL → Graph (supplier-product edges)
PostgreSQL → Linked List (last 500 transactions)
```

This ensures O(1) lookup performance even after server restarts.

---

## 🏗️ Project Structure

```
inventory-system/
├── backend/
│   └── src/
│       ├── dsa/            ← All DSA implementations
│       │   ├── HashMap.js
│       │   ├── LinkedList.js
│       │   ├── MinHeap.js
│       │   ├── Stack.js
│       │   ├── Queue.js
│       │   ├── BST.js
│       │   └── Graph.js    ← + QuickSort + BinarySearch
│       ├── models/         ← Sequelize ORM models
│       ├── controllers/    ← Business logic
│       ├── routes/         ← Express routes
│       ├── middleware/     ← Auth, rate limit
│       ├── config/         ← DB connection
│       ├── utils/          ← Logger, seed data
│       └── server.js       ← Entry point
├── frontend/
│   └── src/
│       ├── components/     ← React pages + UI
│       ├── services/       ← Axios API client
│       ├── store/          ← Zustand state
│       └── App.jsx
├── docker/
│   ├── nginx.conf
│   └── init.sql
├── docker-compose.yml
└── README.md
```

---

## ⚡ Performance Targets

| Metric | Target | Achieved Via |
|--------|--------|-------------|
| Product lookup | O(1) | HashMap |
| Alert processing | O(log n) | Min-Heap |
| Sorted product view | O(log n) | AVL BST |
| Transaction insert | O(1) | Linked List prepend |
| Reports sort | O(n log n) | Quick Sort |
| Price filter | O(log n) | Binary Search |
| Supplier mapping | O(V+E) | BFS on Graph |
| Stock at 100,000 products | O(1) lookup | HashMap with auto-resize |
| Concurrent users | 200+ | Rate limiting + connection pool |
