/**
 * ProductBST
 * ───────────
 * Self-balancing BST (AVL Tree) for sorted product operations.
 * Supports O(log n) search, range queries, and sorted traversal.
 * Used for: price range filtering, sorted product listings.
 *
 * Time Complexity:
 *   - insert:       O(log n) amortized
 *   - search:       O(log n)
 *   - rangeQuery:   O(log n + k) where k = results
 *   - inOrder:      O(n)
 * Space Complexity: O(n)
 */

class BSTNode {
  constructor(key, product) {
    this.key = key;       // Sort key (price, name, etc.)
    this.product = product;
    this.left = null;
    this.right = null;
    this.height = 1;      // For AVL balancing
  }
}

class ProductBST {
  constructor(sortKey = 'price') {
    this.root = null;
    this.sortKey = sortKey;
    this.nodeCount = 0;
  }

  _height(node) {
    return node ? node.height : 0;
  }

  _updateHeight(node) {
    node.height = 1 + Math.max(this._height(node.left), this._height(node.right));
  }

  _balanceFactor(node) {
    return this._height(node.left) - this._height(node.right);
  }

  // Right rotation
  _rotateRight(y) {
    const x = y.left;
    const T2 = x.right;
    x.right = y;
    y.left = T2;
    this._updateHeight(y);
    this._updateHeight(x);
    return x;
  }

  // Left rotation
  _rotateLeft(x) {
    const y = x.right;
    const T2 = y.left;
    y.left = x;
    x.right = T2;
    this._updateHeight(x);
    this._updateHeight(y);
    return y;
  }

  // AVL balance
  _balance(node) {
    this._updateHeight(node);
    const bf = this._balanceFactor(node);

    // Left heavy
    if (bf > 1) {
      if (this._balanceFactor(node.left) < 0) {
        node.left = this._rotateLeft(node.left); // Left-Right case
      }
      return this._rotateRight(node);
    }

    // Right heavy
    if (bf < -1) {
      if (this._balanceFactor(node.right) > 0) {
        node.right = this._rotateRight(node.right); // Right-Left case
      }
      return this._rotateLeft(node);
    }

    return node;
  }

  /**
   * Insert product into BST — O(log n)
   */
  _insert(node, key, product) {
    if (!node) {
      this.nodeCount++;
      return new BSTNode(key, product);
    }

    if (key < node.key) {
      node.left = this._insert(node.left, key, product);
    } else if (key > node.key) {
      node.right = this._insert(node.right, key, product);
    } else {
      // Duplicate key — update product
      node.product = product;
    }

    return this._balance(node);
  }

  insert(product) {
    const key = this._getKey(product);
    this.root = this._insert(this.root, key, product);
  }

  _getKey(product) {
    switch (this.sortKey) {
      case 'price': return parseFloat(product.selling_price || product.price || 0);
      case 'name': return product.name ? product.name.toLowerCase() : '';
      case 'qty': return parseInt(product.qty_in_stock || product.qty || 0);
      case 'sku': return product.sku ? product.sku.toLowerCase() : '';
      default: return product[this.sortKey] || 0;
    }
  }

  /**
   * Find minimum node in subtree
   */
  _findMin(node) {
    while (node.left) node = node.left;
    return node;
  }

  /**
   * Delete node — O(log n)
   */
  _delete(node, key) {
    if (!node) return null;

    if (key < node.key) {
      node.left = this._delete(node.left, key);
    } else if (key > node.key) {
      node.right = this._delete(node.right, key);
    } else {
      if (!node.left || !node.right) {
        this.nodeCount--;
        return node.left || node.right;
      }
      // Two children — replace with inorder successor
      const successor = this._findMin(node.right);
      node.key = successor.key;
      node.product = successor.product;
      node.right = this._delete(node.right, successor.key);
    }

    return this._balance(node);
  }

  delete(product) {
    const key = this._getKey(product);
    this.root = this._delete(this.root, key);
  }

  /**
   * Search by exact key — O(log n)
   */
  search(key) {
    let node = this.root;
    while (node) {
      if (key === node.key) return node.product;
      if (key < node.key) node = node.left;
      else node = node.right;
    }
    return null;
  }

  /**
   * Range query — get all products where minKey <= key <= maxKey — O(log n + k)
   */
  rangeQuery(minKey, maxKey) {
    const result = [];
    this._rangeHelper(this.root, minKey, maxKey, result);
    return result;
  }

  _rangeHelper(node, min, max, result) {
    if (!node) return;
    if (node.key > min) this._rangeHelper(node.left, min, max, result);
    if (node.key >= min && node.key <= max) result.push(node.product);
    if (node.key < max) this._rangeHelper(node.right, min, max, result);
  }

  /**
   * In-order traversal (sorted ascending) — O(n)
   */
  inOrder(limit = null) {
    const result = [];
    this._inOrder(this.root, result, limit);
    return result;
  }

  _inOrder(node, result, limit) {
    if (!node || (limit && result.length >= limit)) return;
    this._inOrder(node.left, result, limit);
    if (!limit || result.length < limit) result.push(node.product);
    this._inOrder(node.right, result, limit);
  }

  /**
   * In-order descending (sorted descending) — O(n)
   */
  inOrderDesc(limit = null) {
    const result = [];
    this._inOrderDesc(this.root, result, limit);
    return result;
  }

  _inOrderDesc(node, result, limit) {
    if (!node || (limit && result.length >= limit)) return;
    this._inOrderDesc(node.right, result, limit);
    if (!limit || result.length < limit) result.push(node.product);
    this._inOrderDesc(node.left, result, limit);
  }

  getStats() {
    return {
      nodeCount: this.nodeCount,
      treeHeight: this._height(this.root),
      sortKey: this.sortKey,
    };
  }

  clear() {
    this.root = null;
    this.nodeCount = 0;
  }
}

// Multiple BST indexes for different sort criteria
const productByPrice = new ProductBST('price');
const productByName = new ProductBST('name');
const productByQty = new ProductBST('qty');

module.exports = { ProductBST, productByPrice, productByName, productByQty };
