const API = 'https://inventory-backend-xf3b.onrender.com/api';
let token = null, user = null;

// ── Helpers ───────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const h = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const r = await fetch(`${API}${path}`, { ...opts, headers: h });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || r.statusText);
  return d;
}
function $(id) { return document.getElementById(id); }
function toast(msg, type = 'info') {
  const t = document.createElement('div'); t.className = `toast ${type}`; t.textContent = msg;
  $('toast-container').appendChild(t); setTimeout(() => t.remove(), 3500);
}
function fmt(n) { return Number(n || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' }); }

// ── Auth ──────────────────────────────────────────────────────────
$('login-form').onsubmit = async e => {
  e.preventDefault();
  const btn = $('login-btn'); btn.disabled = true;
  try {
    const d = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: $('login-email').value, password: $('login-password').value }) });
    token = d.data.accessToken; user = d.data.user;
    localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user));
    showApp();
  } catch (err) { $('login-error').textContent = err.message; $('login-error').classList.remove('hidden'); }
  btn.disabled = false;
};
$('logout-btn').onclick = () => { token = null; user = null; localStorage.clear(); $('app-screen').classList.remove('active'); $('login-screen').classList.add('active'); };

function showApp() {
  $('login-screen').classList.remove('active'); $('app-screen').classList.add('active');
  $('user-info').querySelector('.user-avatar').textContent = (user.name || 'U')[0].toUpperCase();
  $('user-info').querySelector('.user-name').textContent = user.name;
  $('user-info').querySelector('.user-role').textContent = user.role;
  checkServer(); navigate('dashboard');
}

// ── Navigation ────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(b => b.onclick = () => navigate(b.dataset.page));
function navigate(page) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  $('page-title').textContent = page.charAt(0).toUpperCase() + page.slice(1);
  const fn = { dashboard: loadDashboard, products: loadProducts, transactions: loadTransactions, suppliers: loadSuppliers, alerts: loadAlerts, orders: loadOrders, reports: loadReports, dsa: loadDSA };
  $('page-content').innerHTML = '<div class="spinner"></div>'; (fn[page] || loadDashboard)();
}

async function checkServer() {
  try { await fetch('http://localhost:5000/health'); $('server-status').className = 'status-badge status-online'; $('server-status').textContent = 'Online'; }
  catch { $('server-status').className = 'status-badge status-offline'; $('server-status').textContent = 'Offline'; }
}

// ── Dashboard ─────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const [dash, prods] = await Promise.all([api('/reports/dashboard'), api('/products?limit=5')]);
    const s = dash.data || {};
    $('page-content').innerHTML = `
      <div class="stats-grid">
        <div class="stat-card blue"><div class="stat-label">Total Products</div><div class="stat-value">${s.totalProducts || 0}</div><div class="stat-sub">Active items in inventory</div></div>
        <div class="stat-card green"><div class="stat-label">Total Revenue</div><div class="stat-value">${fmt(s.totalRevenue)}</div><div class="stat-sub">${s.totalTransactions || 0} transactions</div></div>
        <div class="stat-card yellow"><div class="stat-label">Low Stock Items</div><div class="stat-value">${s.lowStockCount || 0}</div><div class="stat-sub">Need attention</div></div>
        <div class="stat-card purple"><div class="stat-label">Categories</div><div class="stat-value">${s.totalCategories || 0}</div><div class="stat-sub">Product categories</div></div>
      </div>
      <div class="grid-2">
        <div class="card"><div class="card-header"><h3>Recent Products</h3></div>
          <div class="table-wrap"><table><thead><tr><th>Name</th><th>SKU</th><th>Price</th><th>Stock</th></tr></thead><tbody>
          ${(prods.data?.rows || prods.data || []).slice(0, 5).map(p => `<tr><td>${p.name}</td><td><code>${p.sku}</code></td><td>${fmt(p.selling_price)}</td><td><span class="pill ${p.qty_in_stock <= (p.reorder_level || 10) ? 'pill-danger' : 'pill-success'}">${p.qty_in_stock}</span></td></tr>`).join('') || '<tr><td colspan="4" class="empty-state">No products yet</td></tr>'}
          </tbody></table></div>
        </div>
        <div class="card"><div class="card-header"><h3>System Info</h3></div>
          <div class="dsa-detail" style="line-height:2">
            <center><h1>Welcome to Inventory</h1></center>
          </div>
        </div>
      </div>`;
  } catch (e) { $('page-content').innerHTML = `<div class="empty-state"><p>Failed to load dashboard: ${e.message}</p></div>`; }
}

// ── Products ──────────────────────────────────────────────────────
async function loadProducts() {
  try {
    const d = await api('/products?limit=50');
    const rows = d.data?.rows || d.data || [];
    $('page-content').innerHTML = `
      <div class="toolbar">
        <input type="text" id="prod-search" placeholder="Search products..." style="max-width:300px">
        <button class="btn btn-primary" onclick="showAddProduct()">+ Add Product</button>
      </div>
      <div class="card"><div class="table-wrap"><table><thead><tr><th>Name</th><th>SKU</th><th>Category</th><th>Cost</th><th>Price</th><th>Stock</th><th>Reorder</th><th>Actions</th></tr></thead>
      <tbody id="prod-tbody">${renderProdRows(rows)}</tbody></table></div></div>`;
    $('prod-search').oninput = async e => {
      const q = e.target.value;
      const r = await api(`/products?search=${encodeURIComponent(q)}&limit=50`);
      $('prod-tbody').innerHTML = renderProdRows(r.data?.rows || r.data || []);
    };
  } catch (e) { $('page-content').innerHTML = `<div class="empty-state">${e.message}</div>`; }
}
function renderProdRows(rows) {
  if (!rows.length) return '<tr><td colspan="8" class="empty-state">No products found</td></tr>';
  return rows.map(p => `<tr>
    <td><strong>${p.name}</strong></td><td><code>${p.sku}</code></td><td>${p.category?.name || '—'}</td>
    <td>${fmt(p.cost_price)}</td><td>${fmt(p.selling_price)}</td>
    <td><span class="pill ${p.qty_in_stock <= (p.reorder_level || 10) ? 'pill-danger' : p.qty_in_stock <= (p.reorder_level || 10) * 2 ? 'pill-warning' : 'pill-success'}">${p.qty_in_stock}</span></td>
    <td>${p.reorder_level || '—'}</td>
    <td><button class="btn btn-ghost btn-sm" onclick="editProduct('${p.id}')">Edit</button> <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.id}','${p.name}')">Del</button></td>
  </tr>`).join('');
}
function showAddProduct() {
  showModal('Add Product', `
    <div class="form-group"><label>Name</label><input id="p-name" required></div>
    <div class="form-group"><label>SKU</label><input id="p-sku" required></div>
    <div class="form-group"><label>Cost Price</label><input id="p-cost" type="number" step="0.01" required></div>
    <div class="form-group"><label>Selling Price</label><input id="p-price" type="number" step="0.01" required></div>
    <div class="form-group"><label>Stock Quantity</label><input id="p-qty" type="number" required></div>
    <div class="form-group"><label>Reorder Level</label><input id="p-reorder" type="number" value="10"></div>
  `, async () => {
    await api('/products', { method: 'POST', body: JSON.stringify({ name: $('p-name').value, sku: $('p-sku').value, cost_price: +$('p-cost').value, selling_price: +$('p-price').value, qty_in_stock: +$('p-qty').value, reorder_level: +$('p-reorder').value }) });
    toast('Product created!', 'success'); closeModal(); loadProducts();
  });
}
async function editProduct(id) {
  const d = await api(`/products/${id}`); const p = d.data;
  showModal('Edit Product', `
    <div class="form-group"><label>Name</label><input id="p-name" value="${p.name}"></div>
    <div class="form-group"><label>Cost Price</label><input id="p-cost" type="number" step="0.01" value="${p.cost_price}"></div>
    <div class="form-group"><label>Selling Price</label><input id="p-price" type="number" step="0.01" value="${p.selling_price}"></div>
    <div class="form-group"><label>Stock</label><input id="p-qty" type="number" value="${p.qty_in_stock}"></div>
    <div class="form-group"><label>Reorder Level</label><input id="p-reorder" type="number" value="${p.reorder_level || 10}"></div>
  `, async () => {
    await api(`/products/${id}`, { method: 'PUT', body: JSON.stringify({ name: $('p-name').value, cost_price: +$('p-cost').value, selling_price: +$('p-price').value, qty_in_stock: +$('p-qty').value, reorder_level: +$('p-reorder').value }) });
    toast('Product updated!', 'success'); closeModal(); loadProducts();
  });
}
async function deleteProduct(id, name) { if (!confirm(`Delete "${name}"?`)) return; await api(`/products/${id}`, { method: 'DELETE' }); toast('Deleted', 'success'); loadProducts(); }

// ── Transactions ──────────────────────────────────────────────────
async function loadTransactions() {
  try {
    const d = await api('/transactions?limit=30');
    const rows = d.data?.rows || d.data || [];
    $('page-content').innerHTML = `
      <div class="toolbar"><button class="btn btn-primary" onclick="showNewSale()">+ New Sale</button></div>
      <div class="card"><div class="table-wrap"><table><thead><tr><th>Ref</th><th>Amount</th><th>Payment</th><th>Status</th><th>Date</th></tr></thead><tbody>
      ${rows.length ? rows.map(t => `<tr><td><code>${t.transaction_ref}</code></td><td>${fmt(t.total_amount)}</td><td><span class="pill pill-info">${t.payment_method}</span></td><td><span class="pill ${t.status === 'completed' ? 'pill-success' : 'pill-warning'}">${t.status}</span></td><td>${new Date(t.createdAt || t.created_at).toLocaleDateString()}</td></tr>`).join('') : '<tr><td colspan="5" class="empty-state">No transactions</td></tr>'}
      </tbody></table></div></div>`;
  } catch (e) { $('page-content').innerHTML = `<div class="empty-state">${e.message}</div>`; }
}
async function showNewSale() {
  const prods = await api('/products?limit=100'); const list = prods.data?.rows || prods.data || [];
  showModal('New Sale', `
    <div class="form-group"><label>Product</label><select id="s-prod">${list.map(p => `<option value="${p.id}" data-price="${p.selling_price}">${p.name} (${p.qty_in_stock} in stock) - ${fmt(p.selling_price)}</option>`).join('')}</select></div>
    <div class="form-group"><label>Quantity</label><input id="s-qty" type="number" value="1" min="1"></div>
    <div class="form-group"><label>Payment Method</label><select id="s-pay"><option>cash</option><option>card</option><option>upi</option></select></div>
    <div class="form-group"><label>Customer Name (optional)</label><input id="s-cust"></div>
  `, async () => {
    const sel = $('s-prod'); const price = +sel.options[sel.selectedIndex].dataset.price;
    await api('/transactions', { method: 'POST', body: JSON.stringify({ items: [{ product_id: sel.value, quantity: +$('s-qty').value, unit_price: price }], payment_method: $('s-pay').value, customer_name: $('s-cust').value || undefined }) });
    toast('Sale completed!', 'success'); closeModal(); loadTransactions();
  });
}

// ── Suppliers ─────────────────────────────────────────────────────
async function loadSuppliers() {
  try {
    const d = await api('/suppliers'); const rows = d.data || [];
    $('page-content').innerHTML = `
      <div class="toolbar"><button class="btn btn-primary" onclick="showAddSupplier()">+ Add Supplier</button></div>
      <div class="card"><div class="table-wrap"><table><thead><tr><th>Name</th><th>Contact</th><th>Email</th><th>Phone</th><th>Rating</th><th>Lead Time</th></tr></thead><tbody>
      ${rows.length ? rows.map(s => `<tr><td><strong>${s.name}</strong></td><td>${s.contact_person || '—'}</td><td>${s.email || '—'}</td><td>${s.phone || '—'}</td><td>⭐ ${s.rating || 'N/A'}</td><td>${s.lead_time_days || '—'} days</td></tr>`).join('') : '<tr><td colspan="6" class="empty-state">No suppliers</td></tr>'}
      </tbody></table></div></div>`;
  } catch (e) { $('page-content').innerHTML = `<div class="empty-state">${e.message}</div>`; }
}
function showAddSupplier() {
  showModal('Add Supplier', `
    <div class="form-group"><label>Name</label><input id="sup-name" required></div>
    <div class="form-group"><label>Contact Person</label><input id="sup-contact"></div>
    <div class="form-group"><label>Email</label><input id="sup-email" type="email"></div>
    <div class="form-group"><label>Phone</label><input id="sup-phone"></div>
    <div class="form-group"><label>Rating (1-5)</label><input id="sup-rating" type="number" min="1" max="5" value="3"></div>
    <div class="form-group"><label>Lead Time (days)</label><input id="sup-lead" type="number" value="7"></div>
  `, async () => {
    await api('/suppliers', { method: 'POST', body: JSON.stringify({ name: $('sup-name').value, contact_person: $('sup-contact').value, email: $('sup-email').value, phone: $('sup-phone').value, rating: +$('sup-rating').value, lead_time_days: +$('sup-lead').value }) });
    toast('Supplier created!', 'success'); closeModal(); loadSuppliers();
  });
}

// ── Alerts ─────────────────────────────────────────────────────────
async function loadAlerts() {
  try {
    const d = await api('/alerts'); const rows = d.data || [];
    $('alert-badge').textContent = rows.filter(a => a.status === 'active').length;
    $('alert-badge').classList.toggle('hidden', !rows.filter(a => a.status === 'active').length);
    $('page-content').innerHTML = `<div class="card"><div class="card-header"><h3>Stock Alerts (Min-Heap Priority)</h3></div>
      <div class="table-wrap"><table><thead><tr><th>Priority</th><th>Product</th><th>Type</th><th>Current Qty</th><th>Reorder Level</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      ${rows.length ? rows.map(a => `<tr>
        <td><strong>${a.priority ?? '—'}</strong></td><td>${a.product?.name || a.product_name || '—'}</td>
        <td><span class="pill ${a.alert_type === 'out_of_stock' ? 'pill-danger' : a.alert_type === 'critical_stock' ? 'pill-warning' : 'pill-info'}">${a.alert_type}</span></td>
        <td>${a.current_qty}</td><td>${a.reorder_level || '—'}</td>
        <td><span class="pill ${a.status === 'active' ? 'pill-danger' : 'pill-neutral'}">${a.status}</span></td>
        <td>${a.status === 'active' ? `<button class="btn btn-ghost btn-sm" onclick="ackAlert('${a.id}')">Acknowledge</button>` : ''}</td>
      </tr>`).join('') : '<tr><td colspan="7" class="empty-state">No alerts — all good! ✅</td></tr>'}
      </tbody></table></div></div>`;
  } catch (e) { $('page-content').innerHTML = `<div class="empty-state">${e.message}</div>`; }
}
async function ackAlert(id) { await api(`/alerts/${id}/acknowledge`, { method: 'PATCH' }); toast('Acknowledged', 'success'); loadAlerts(); }

// ── Orders ────────────────────────────────────────────────────────
async function loadOrders() {
  try {
    const d = await api('/orders'); const rows = d.data?.rows || d.data || [];
    $('page-content').innerHTML = `<div class="card"><div class="card-header"><h3>Purchase Orders (FIFO Queue)</h3></div>
      <div class="table-wrap"><table><thead><tr><th>Order Ref</th><th>Supplier</th><th>Status</th><th>Total</th><th>Expected</th></tr></thead><tbody>
      ${rows.length ? rows.map(o => `<tr><td><code>${o.order_ref}</code></td><td>${o.supplier?.name || '—'}</td><td><span class="pill pill-info">${o.status}</span></td><td>${fmt(o.total_amount)}</td><td>${o.expected_delivery ? new Date(o.expected_delivery).toLocaleDateString() : '—'}</td></tr>`).join('') : '<tr><td colspan="5" class="empty-state">No purchase orders</td></tr>'}
      </tbody></table></div></div>`;
  } catch (e) { $('page-content').innerHTML = `<div class="empty-state">${e.message}</div>`; }
}

// ── Reports ───────────────────────────────────────────────────────
async function loadReports() {
  try {
    const [sales, inv] = await Promise.allSettled([api('/reports/sales?period=daily'), api('/reports/inventory')]);
    const sd = sales.status === 'fulfilled' ? sales.value.data : null;
    const id = inv.status === 'fulfilled' ? inv.value.data : null;
    $('page-content').innerHTML = `
      <div class="grid-2">
        <div class="card"><div class="card-header"><h3>Sales Report (Quick Sort)</h3></div>
          ${sd ? `<div class="dsa-detail"><p>📈 Total Sales: <strong>${fmt(sd.totalRevenue || sd.total_revenue || 0)}</strong></p><p>📦 Items Sold: <strong>${sd.totalItemsSold || sd.total_items || 0}</strong></p><p>💰 Avg Order: <strong>${fmt(sd.averageOrderValue || sd.avg_order || 0)}</strong></p></div>` : '<p class="empty-state">No sales data</p>'}
        </div>
        <div class="card"><div class="card-header"><h3>Inventory Report</h3></div>
          ${id ? `<div class="dsa-detail"><p>📦 Total Products: <strong>${id.totalProducts || 0}</strong></p><p>💲 Inventory Value: <strong>${fmt(id.totalValue || id.inventory_value || 0)}</strong></p><p>⚠️ Low Stock: <strong>${id.lowStockCount || 0}</strong></p></div>` : '<p class="empty-state">No inventory data</p>'}
        </div>
      </div>
      <div class="card" style="margin-top:20px"><div class="card-header"><h3>Export</h3></div>
        <button class="btn btn-primary" onclick="exportCSV('products')">📥 Export Products CSV</button>
        <button class="btn btn-ghost" onclick="exportCSV('transactions')" style="margin-left:10px">📥 Export Transactions CSV</button>
      </div>`;
  } catch (e) { $('page-content').innerHTML = `<div class="empty-state">${e.message}</div>`; }
}
async function exportCSV(type) {
  try {
    const r = await fetch(`${API}/reports/export/csv?type=${type}`, { headers: { Authorization: `Bearer ${token}` } });
    const b = await r.blob(); const u = URL.createObjectURL(b);
    const a = document.createElement('a'); a.href = u; a.download = `${type}.csv`; a.click(); URL.revokeObjectURL(u);
    toast('Downloaded!', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

// ── DSA Metrics ───────────────────────────────────────────────────
async function loadDSA() {
  try {
    const d = await api('/products/stats/dsa'); const m = d.data || {};
    $('page-content').innerHTML = `<div class="dsa-grid">
      <div class="card dsa-card"><div class="dsa-title">🗺️ HashMap</div><div class="dsa-detail"><p>Size: <strong>${m.hashMap?.size || 0}</strong></p><p>Buckets: <strong>${m.hashMap?.bucketCount || '—'}</strong></p><p>Load Factor: <strong>${m.hashMap?.loadFactor?.toFixed(2) || '—'}</strong></p><p>Collisions: <strong>${m.hashMap?.collisions || 0}</strong></p><p><em>O(1) average lookup by ID/SKU</em></p></div></div>
      <div class="card dsa-card"><div class="dsa-title">🌳 AVL BST (Price Index)</div><div class="dsa-detail"><p>Nodes: <strong>${m.bst?.priceIndex?.size || m.bst?.size || 0}</strong></p><p>Height: <strong>${m.bst?.priceIndex?.height || m.bst?.height || '—'}</strong></p><p><em>O(log n) sorted view + range queries</em></p></div></div>
      <div class="card dsa-card"><div class="dsa-title">⏫ Min-Heap (Alerts)</div><div class="dsa-detail"><p>Active Alerts: <strong>${m.minHeap?.size || 0}</strong></p><p><em>O(log n) insert/extract — always surfaces most critical alert</em></p></div></div>
      <div class="card dsa-card"><div class="dsa-title">🔗 Graph (Suppliers)</div><div class="dsa-detail"><p>Nodes: <strong>${m.graph?.totalNodes || 0}</strong></p><p>Edges: <strong>${m.graph?.totalEdges || 0}</strong></p><p><em>BFS/DFS for supply chain risk analysis</em></p></div></div>
      <div class="card dsa-card"><div class="dsa-title">📋 Linked List (Transactions)</div><div class="dsa-detail"><p>Size: <strong>${m.linkedList?.size || 0}</strong></p><p><em>O(1) prepend — newest transactions first</em></p></div></div>
      <div class="card dsa-card"><div class="dsa-title">📚 Stack (Undo)</div><div class="dsa-detail"><p>Size: <strong>${m.stack?.size || 0}</strong></p><p><em>O(1) push/pop — per-user undo operations</em></p></div></div>
    </div>`;
  } catch (e) { $('page-content').innerHTML = `<div class="empty-state">${e.message}</div>`; }
}

// ── Modal ─────────────────────────────────────────────────────────
function showModal(title, body, onSave) {
  const el = document.createElement('div'); el.className = 'modal-overlay'; el.id = 'modal-overlay';
  el.innerHTML = `<div class="modal"><h3>${title}</h3>${body}<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="modal-save">Save</button></div></div>`;
  document.body.appendChild(el);
  el.querySelector('#modal-save').onclick = async () => { try { await onSave(); } catch (e) { toast(e.message, 'error'); } };
  el.onclick = e => { if (e.target === el) closeModal(); };
}
function closeModal() { const m = $('modal-overlay'); if (m) m.remove(); }

// ── Init ──────────────────────────────────────────────────────────
(function init() {
  token = localStorage.getItem('token');
  try { user = JSON.parse(localStorage.getItem('user')); } catch { }
  if (token && user) showApp(); else { $('login-screen').classList.add('active'); }
})();
