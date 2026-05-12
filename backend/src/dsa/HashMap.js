/**
 * InventoryHashMap
 * ─────────────────
 * Custom Hash Map implementation for O(1) average-case product lookup.
 * Uses separate chaining for collision resolution.
 * Supports dynamic resizing (load factor threshold: 0.75)
 *
 * Time Complexity:
 *   - insert:  O(1) average, O(n) worst (resize)
 *   - search:  O(1) average, O(n) worst (collision chain)
 *   - delete:  O(1) average
 * Space Complexity: O(n)
 */

class HashMapEntry {
  constructor(key, value) {
    this.key = key;
    this.value = value;
    this.next = null; // for chaining
  }
}

class InventoryHashMap {
  constructor(initialCapacity = 1024) {
    this.capacity = initialCapacity;
    this.size = 0;
    this.loadFactor = 0.75;
    this.buckets = new Array(this.capacity).fill(null);
    this.collisions = 0;
  }

  /**
   * Polynomial rolling hash function
   * Converts string key to array index
   */
  _hash(key) {
    const str = String(key);
    let hash = 0;
    const prime = 31;
    const mod = this.capacity;
    let power = 1;

    for (let i = 0; i < str.length; i++) {
      hash = (hash + str.charCodeAt(i) * power) % mod;
      power = (power * prime) % mod;
    }
    return Math.abs(hash);
  }

  /**
   * Insert or update a key-value pair
   * @param {string} key - Product SKU or ID
   * @param {Object} value - Product data
   */
  set(key, value) {
    if (this.size / this.capacity >= this.loadFactor) {
      this._resize();
    }

    const index = this._hash(key);
    let entry = this.buckets[index];

    if (!entry) {
      this.buckets[index] = new HashMapEntry(key, value);
      this.size++;
      return;
    }

    // Walk the chain — update if key exists
    let prev = null;
    while (entry) {
      if (entry.key === key) {
        entry.value = value;
        return;
      }
      prev = entry;
      entry = entry.next;
    }

    // New key — append to chain
    prev.next = new HashMapEntry(key, value);
    this.collisions++;
    this.size++;
  }

  /**
   * O(1) product lookup by SKU or ID
   * @param {string} key
   * @returns {Object|null}
   */
  get(key) {
    const index = this._hash(key);
    let entry = this.buckets[index];

    while (entry) {
      if (entry.key === key) return entry.value;
      entry = entry.next;
    }
    return null;
  }

  /**
   * Delete a key from the map
   * @param {string} key
   * @returns {boolean}
   */
  delete(key) {
    const index = this._hash(key);
    let entry = this.buckets[index];
    let prev = null;

    while (entry) {
      if (entry.key === key) {
        if (prev) {
          prev.next = entry.next;
        } else {
          this.buckets[index] = entry.next;
        }
        this.size--;
        return true;
      }
      prev = entry;
      entry = entry.next;
    }
    return false;
  }

  /**
   * Check if key exists
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * Get all values as array
   */
  values() {
    const result = [];
    for (let i = 0; i < this.capacity; i++) {
      let entry = this.buckets[i];
      while (entry) {
        result.push(entry.value);
        entry = entry.next;
      }
    }
    return result;
  }

  /**
   * Get all keys
   */
  keys() {
    const result = [];
    for (let i = 0; i < this.capacity; i++) {
      let entry = this.buckets[i];
      while (entry) {
        result.push(entry.key);
        entry = entry.next;
      }
    }
    return result;
  }

  /**
   * Double capacity and rehash all entries
   * Triggered when load factor exceeds threshold
   */
  _resize() {
    const oldBuckets = this.buckets;
    this.capacity *= 2;
    this.buckets = new Array(this.capacity).fill(null);
    this.size = 0;
    this.collisions = 0;

    for (let i = 0; i < oldBuckets.length; i++) {
      let entry = oldBuckets[i];
      while (entry) {
        this.set(entry.key, entry.value);
        entry = entry.next;
      }
    }
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    return {
      size: this.size,
      capacity: this.capacity,
      loadFactor: (this.size / this.capacity).toFixed(3),
      collisions: this.collisions,
      averageChainLength: this.collisions > 0 ? (this.size / (this.capacity - this.collisions)).toFixed(2) : '1.00',
    };
  }

  clear() {
    this.buckets = new Array(this.capacity).fill(null);
    this.size = 0;
    this.collisions = 0;
  }
}

// Singleton instance for the application
const productHashMap = new InventoryHashMap(4096);

module.exports = { InventoryHashMap, productHashMap };
