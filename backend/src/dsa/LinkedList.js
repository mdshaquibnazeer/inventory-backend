/**
 * TransactionLinkedList
 * ──────────────────────
 * Doubly Linked List for O(1) transaction insertion and O(n) traversal.
 * Head = most recent transaction (prepend strategy).
 * Supports bidirectional traversal for oldest/newest views.
 *
 * Time Complexity:
 *   - prepend (new sale): O(1)
 *   - append:             O(1) (tail pointer maintained)
 *   - deleteById:         O(n)
 *   - toArray:            O(n)
 * Space Complexity: O(n)
 */

class TransactionNode {
  constructor(data) {
    this.data = data;      // Transaction object
    this.prev = null;      // Pointer to older transaction
    this.next = null;      // Pointer to newer transaction
    this.timestamp = data.created_at || new Date().toISOString();
  }
}

class TransactionLinkedList {
  constructor() {
    this.head = null;      // Most recent transaction
    this.tail = null;      // Oldest transaction
    this.length = 0;
    this.totalRevenue = 0;
  }

  /**
   * Prepend new transaction to head — O(1)
   * Most recent transactions are at the head.
   */
  prepend(transactionData) {
    const node = new TransactionNode(transactionData);

    if (!this.head) {
      this.head = node;
      this.tail = node;
    } else {
      node.next = this.head;
      this.head.prev = node;
      this.head = node;
    }

    this.length++;
    this.totalRevenue += (transactionData.total_amount || 0);
    return node;
  }

  /**
   * Append transaction to tail — O(1)
   * Used when loading historical data.
   */
  append(transactionData) {
    const node = new TransactionNode(transactionData);

    if (!this.tail) {
      this.head = node;
      this.tail = node;
    } else {
      node.prev = this.tail;
      this.tail.next = node;
      this.tail = node;
    }

    this.length++;
    this.totalRevenue += (transactionData.total_amount || 0);
    return node;
  }

  /**
   * Delete by transaction ID — O(n)
   * Used for void/cancel operations.
   */
  deleteById(transactionId) {
    let current = this.head;

    while (current) {
      if (current.data.id === transactionId || current.data.transaction_id === transactionId) {
        if (current.prev) current.prev.next = current.next;
        else this.head = current.next;

        if (current.next) current.next.prev = current.prev;
        else this.tail = current.prev;

        this.length--;
        this.totalRevenue -= (current.data.total_amount || 0);
        return true;
      }
      current = current.next;
    }
    return false;
  }

  /**
   * Find transaction by ID — O(n)
   */
  findById(transactionId) {
    let current = this.head;
    while (current) {
      if (current.data.id === transactionId || current.data.transaction_id === transactionId) {
        return current.data;
      }
      current = current.next;
    }
    return null;
  }

  /**
   * Convert to array (newest first) — O(n)
   */
  toArray(limit = null) {
    const result = [];
    let current = this.head;
    let count = 0;

    while (current) {
      if (limit && count >= limit) break;
      result.push(current.data);
      current = current.next;
      count++;
    }
    return result;
  }

  /**
   * Convert to array (oldest first) — O(n)
   */
  toArrayReverse(limit = null) {
    const result = [];
    let current = this.tail;
    let count = 0;

    while (current) {
      if (limit && count >= limit) break;
      result.push(current.data);
      current = current.prev;
      count++;
    }
    return result;
  }

  /**
   * Get transactions within date range — O(n)
   */
  getByDateRange(startDate, endDate) {
    const result = [];
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    let current = this.head;

    while (current) {
      const txnTime = new Date(current.timestamp).getTime();
      if (txnTime >= start && txnTime <= end) {
        result.push(current.data);
      }
      if (txnTime < start) break; // List is sorted newest-first
      current = current.next;
    }
    return result;
  }

  /**
   * Get sales summary stats
   */
  getStats() {
    return {
      totalTransactions: this.length,
      totalRevenue: this.totalRevenue.toFixed(2),
      averageOrderValue: this.length > 0 ? (this.totalRevenue / this.length).toFixed(2) : '0.00',
    };
  }

  clear() {
    this.head = null;
    this.tail = null;
    this.length = 0;
    this.totalRevenue = 0;
  }
}

// Singleton for session
const transactionList = new TransactionLinkedList();

module.exports = { TransactionLinkedList, transactionList };
