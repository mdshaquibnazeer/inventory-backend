/**
 * AlertMinHeap
 * ─────────────
 * Min-Heap (Priority Queue) for inventory alerts.
 * The alert with the LOWEST stock ratio (most critical) is always at root.
 *
 * Priority = currentQty / reorderLevel  (lower = more urgent)
 *
 * Time Complexity:
 *   - insert:      O(log n)
 *   - extractMin:  O(log n)
 *   - peekMin:     O(1)
 *   - decreaseKey: O(log n)
 * Space Complexity: O(n)
 */

class AlertNode {
  constructor(alert) {
    this.id = alert.id || alert.product_id;
    this.productId = alert.product_id;
    this.productName = alert.product_name;
    this.sku = alert.sku;
    this.currentQty = alert.current_qty;
    this.reorderLevel = alert.reorder_level;
    this.alertType = alert.alert_type; // 'low_stock' | 'critical' | 'out_of_stock' | 'expiry'
    this.priority = this._calcPriority(alert);
    this.createdAt = new Date().toISOString();
    this.acknowledged = false;
    this.expiryDate = alert.expiry_date || null;
  }

  _calcPriority(alert) {
    if (alert.alert_type === 'out_of_stock') return 0;
    if (alert.alert_type === 'expiry') {
      // Priority based on days until expiry
      if (alert.expiry_date) {
        const daysLeft = Math.ceil((new Date(alert.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
        return daysLeft < 0 ? -1 : daysLeft * 0.1;
      }
      return 0.05;
    }
    return alert.reorder_level > 0 ? alert.current_qty / alert.reorder_level : 0;
  }
}

class AlertMinHeap {
  constructor() {
    this.heap = [];
    this.alertIndex = new Map(); // id -> heap index (for O(log n) decrease-key)
  }

  get size() { return this.heap.length; }
  get isEmpty() { return this.heap.length === 0; }

  _parent(i) { return Math.floor((i - 1) / 2); }
  _left(i)   { return 2 * i + 1; }
  _right(i)  { return 2 * i + 2; }

  _swap(i, j) {
    // Update index map
    this.alertIndex.set(this.heap[i].id, j);
    this.alertIndex.set(this.heap[j].id, i);
    [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
  }

  /**
   * Bubble up to restore heap property — O(log n)
   */
  _heapifyUp(index) {
    while (index > 0) {
      const parent = this._parent(index);
      if (this.heap[parent].priority > this.heap[index].priority) {
        this._swap(parent, index);
        index = parent;
      } else break;
    }
  }

  /**
   * Bubble down to restore heap property — O(log n)
   */
  _heapifyDown(index) {
    const n = this.heap.length;

    while (true) {
      let smallest = index;
      const left = this._left(index);
      const right = this._right(index);

      if (left < n && this.heap[left].priority < this.heap[smallest].priority) {
        smallest = left;
      }
      if (right < n && this.heap[right].priority < this.heap[smallest].priority) {
        smallest = right;
      }

      if (smallest !== index) {
        this._swap(index, smallest);
        index = smallest;
      } else break;
    }
  }

  /**
   * Insert new alert — O(log n)
   */
  insert(alertData) {
    // If alert for this product already exists, update it
    if (this.alertIndex.has(alertData.id || alertData.product_id)) {
      this.updateAlert(alertData.id || alertData.product_id, alertData);
      return;
    }

    const node = new AlertNode(alertData);
    this.heap.push(node);
    const index = this.heap.length - 1;
    this.alertIndex.set(node.id, index);
    this._heapifyUp(index);
    return node;
  }

  /**
   * Remove and return most critical alert — O(log n)
   */
  extractMin() {
    if (this.isEmpty) return null;
    if (this.heap.length === 1) {
      const min = this.heap.pop();
      this.alertIndex.delete(min.id);
      return min;
    }

    const min = this.heap[0];
    const last = this.heap.pop();
    this.heap[0] = last;
    this.alertIndex.delete(min.id);
    this.alertIndex.set(last.id, 0);
    this._heapifyDown(0);
    return min;
  }

  /**
   * Peek at most critical alert without removing — O(1)
   */
  peekMin() {
    return this.isEmpty ? null : this.heap[0];
  }

  /**
   * Update alert priority (stock level changed) — O(log n)
   */
  updateAlert(id, newAlertData) {
    const index = this.alertIndex.get(id);
    if (index === undefined) return false;

    const oldPriority = this.heap[index].priority;
    Object.assign(this.heap[index], newAlertData);
    this.heap[index].priority = this.heap[index]._calcPriority
      ? this.heap[index]._calcPriority(newAlertData)
      : (newAlertData.reorder_level > 0 ? newAlertData.current_qty / newAlertData.reorder_level : 0);

    if (this.heap[index].priority < oldPriority) {
      this._heapifyUp(index);
    } else {
      this._heapifyDown(index);
    }
    return true;
  }

  /**
   * Acknowledge an alert (mark as seen, keeps in heap at reduced priority)
   */
  acknowledge(id) {
    const index = this.alertIndex.get(id);
    if (index === undefined) return false;
    this.heap[index].acknowledged = true;
    return true;
  }

  /**
   * Remove specific alert by ID — O(log n)
   */
  remove(id) {
    const index = this.alertIndex.get(id);
    if (index === undefined) return false;

    // Set to minimum possible priority and extract
    this.heap[index].priority = -Infinity;
    this._heapifyUp(index);
    this.extractMin();
    return true;
  }

  /**
   * Get all alerts as sorted array (without consuming heap)
   */
  toSortedArray() {
    // Clone heap and extract all
    const backup = [...this.heap];
    const indexBackup = new Map(this.alertIndex);
    const result = [];

    while (!this.isEmpty) {
      result.push(this.extractMin());
    }

    // Restore
    this.heap = backup;
    this.alertIndex = indexBackup;
    return result;
  }

  /**
   * Get top N critical alerts
   */
  getTopN(n) {
    return this.toSortedArray().slice(0, n);
  }

  getStats() {
    return {
      totalAlerts: this.size,
      criticalAlerts: this.heap.filter(a => a.priority <= 0.3).length,
      lowStockAlerts: this.heap.filter(a => a.alertType === 'low_stock').length,
      expiryAlerts: this.heap.filter(a => a.alertType === 'expiry').length,
      mostCritical: this.peekMin(),
    };
  }
}

const alertQueue = new AlertMinHeap();

module.exports = { AlertMinHeap, alertQueue };
