/**
 * OrderQueue
 * ───────────
 * FIFO Queue for purchase order processing.
 * Orders are processed in the sequence they are approved.
 * Also used for FIFO-based expiry tracking (oldest stock sold first).
 *
 * Time Complexity: O(1) enqueue/dequeue
 * Space Complexity: O(n)
 */

class QueueNode {
  constructor(data) {
    this.data = data;
    this.next = null;
    this.enqueuedAt = new Date().toISOString();
  }
}

class OrderQueue {
  constructor() {
    this.front = null;  // Next to be processed
    this.rear = null;   // Last item added
    this.length = 0;
    this.processedCount = 0;
  }

  get size() { return this.length; }
  get isEmpty() { return this.length === 0; }

  /**
   * Enqueue a new purchase order — O(1)
   */
  enqueue(orderData) {
    const node = new QueueNode({
      ...orderData,
      status: 'pending',
      order_id: orderData.order_id || `PO-${Date.now()}`,
    });

    if (!this.rear) {
      this.front = node;
      this.rear = node;
    } else {
      this.rear.next = node;
      this.rear = node;
    }

    this.length++;
    return node.data;
  }

  /**
   * Dequeue next order for processing — O(1)
   */
  dequeue() {
    if (this.isEmpty) return null;

    const data = this.front.data;
    this.front = this.front.next;

    if (!this.front) this.rear = null;
    this.length--;
    this.processedCount++;
    return data;
  }

  /**
   * Peek at front order without removing — O(1)
   */
  peek() {
    return this.isEmpty ? null : this.front.data;
  }

  /**
   * Get all pending orders as array — O(n)
   */
  toArray() {
    const result = [];
    let current = this.front;
    while (current) {
      result.push(current.data);
      current = current.next;
    }
    return result;
  }

  /**
   * Find order by ID — O(n)
   */
  findById(orderId) {
    let current = this.front;
    while (current) {
      if (current.data.order_id === orderId) return current.data;
      current = current.next;
    }
    return null;
  }

  /**
   * Update order status (in-place) — O(n)
   */
  updateStatus(orderId, status) {
    let current = this.front;
    while (current) {
      if (current.data.order_id === orderId) {
        current.data.status = status;
        current.data.updatedAt = new Date().toISOString();
        return true;
      }
      current = current.next;
    }
    return false;
  }

  getStats() {
    return {
      pending: this.length,
      processedTotal: this.processedCount,
      nextOrderId: this.peek()?.order_id || null,
    };
  }

  clear() {
    this.front = null;
    this.rear = null;
    this.length = 0;
  }
}

/**
 * ExpiryFIFOQueue
 * ────────────────
 * Specialized FIFO queue for managing perishable stock batches.
 * Ensures oldest batch is sold first (FIFO expiry management).
 */
class ExpiryFIFOQueue {
  constructor(productId) {
    this.productId = productId;
    this.batches = []; // Array-based for simplicity (ordered by date)
  }

  addBatch(quantity, expiryDate, batchId) {
    const batch = { batchId, quantity, expiryDate: new Date(expiryDate), addedAt: new Date() };
    // Insert in sorted order by expiry date (earliest expiry first)
    let i = 0;
    while (i < this.batches.length && this.batches[i].expiryDate <= batch.expiryDate) i++;
    this.batches.splice(i, 0, batch);
    return batch;
  }

  consume(quantity) {
    let remaining = quantity;
    const consumed = [];

    while (remaining > 0 && this.batches.length > 0) {
      const oldest = this.batches[0];
      if (oldest.quantity <= remaining) {
        consumed.push({ ...oldest, consumed: oldest.quantity });
        remaining -= oldest.quantity;
        this.batches.shift();
      } else {
        consumed.push({ ...oldest, consumed: remaining });
        oldest.quantity -= remaining;
        remaining = 0;
      }
    }

    return { consumed, shortfall: remaining };
  }

  getExpiringBatches(daysThreshold = 7) {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + daysThreshold);
    return this.batches.filter(b => b.expiryDate <= threshold);
  }

  getTotalQuantity() {
    return this.batches.reduce((sum, b) => sum + b.quantity, 0);
  }
}

const orderQueue = new OrderQueue();

module.exports = { OrderQueue, ExpiryFIFOQueue, orderQueue };
