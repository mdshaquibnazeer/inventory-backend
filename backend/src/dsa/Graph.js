/**
 * SupplierGraph
 * ──────────────
 * Undirected weighted graph for supplier-product relationships.
 * Nodes = Suppliers + Products
 * Edges = Supply relationships (weight = reliability score / lead time)
 *
 * Supports:
 *   - BFS: Find all suppliers for a product
 *   - DFS: Trace full supply chain dependencies
 *   - Supply risk analysis: detect single points of failure
 *
 * Time Complexity:
 *   - addNode:     O(1)
 *   - addEdge:     O(1)
 *   - BFS:         O(V + E)
 *   - DFS:         O(V + E)
 * Space Complexity: O(V + E)
 */

class GraphNode {
  constructor(id, type, data) {
    this.id = id;
    this.type = type; // 'supplier' | 'product'
    this.data = data;
  }
}

class GraphEdge {
  constructor(from, to, weight = 1, metadata = {}) {
    this.from = from;
    this.to = to;
    this.weight = weight;      // Reliability / inverse lead time
    this.metadata = metadata;  // lead_time, last_order_date, etc.
  }
}

class SupplierGraph {
  constructor() {
    this.nodes = new Map();      // id -> GraphNode
    this.adjacency = new Map();  // id -> [{ nodeId, edge }]
    this.edgeCount = 0;
  }

  /**
   * Add a node (supplier or product) — O(1)
   */
  addNode(id, type, data = {}) {
    if (!this.nodes.has(id)) {
      this.nodes.set(id, new GraphNode(id, type, data));
      this.adjacency.set(id, []);
    }
    return this.nodes.get(id);
  }

  /**
   * Add bidirectional edge (supplier ↔ product) — O(1)
   */
  addEdge(fromId, toId, weight = 1, metadata = {}) {
    if (!this.nodes.has(fromId) || !this.nodes.has(toId)) {
      throw new Error(`Node not found: ${!this.nodes.has(fromId) ? fromId : toId}`);
    }

    const edge = new GraphEdge(fromId, toId, weight, metadata);
    this.adjacency.get(fromId).push({ nodeId: toId, edge });
    this.adjacency.get(toId).push({ nodeId: fromId, edge });
    this.edgeCount++;
    return edge;
  }

  /**
   * Remove edge between two nodes — O(degree)
   */
  removeEdge(fromId, toId) {
    const fromAdj = this.adjacency.get(fromId);
    const toAdj = this.adjacency.get(toId);

    if (fromAdj) {
      const idx = fromAdj.findIndex(a => a.nodeId === toId);
      if (idx !== -1) { fromAdj.splice(idx, 1); this.edgeCount--; }
    }
    if (toAdj) {
      const idx = toAdj.findIndex(a => a.nodeId === fromId);
      if (idx !== -1) toAdj.splice(idx, 1);
    }
  }

  /**
   * BFS from a node — O(V + E)
   * Used to find all suppliers for a product
   */
  bfs(startId, targetType = null) {
    if (!this.nodes.has(startId)) return [];

    const visited = new Set();
    const queue = [startId];
    const result = [];
    const distances = new Map();

    visited.add(startId);
    distances.set(startId, 0);

    while (queue.length > 0) {
      const current = queue.shift();
      const node = this.nodes.get(current);

      if (current !== startId) {
        if (!targetType || node.type === targetType) {
          result.push({
            node,
            distance: distances.get(current),
            path: this._getPath(startId, current, distances),
          });
        }
      }

      const neighbors = this.adjacency.get(current) || [];
      for (const { nodeId } of neighbors) {
        if (!visited.has(nodeId)) {
          visited.add(nodeId);
          distances.set(nodeId, (distances.get(current) || 0) + 1);
          queue.push(nodeId);
        }
      }
    }

    return result;
  }

  /**
   * DFS from a node — O(V + E)
   * Used to trace full supply chain dependencies
   */
  dfs(startId, targetType = null) {
    if (!this.nodes.has(startId)) return [];

    const visited = new Set();
    const result = [];

    const dfsHelper = (nodeId, depth = 0) => {
      visited.add(nodeId);
      const node = this.nodes.get(nodeId);

      if (nodeId !== startId && (!targetType || node.type === targetType)) {
        result.push({ node, depth });
      }

      const neighbors = this.adjacency.get(nodeId) || [];
      for (const { nodeId: neighborId, edge } of neighbors) {
        if (!visited.has(neighborId)) {
          dfsHelper(neighborId, depth + 1);
        }
      }
    };

    dfsHelper(startId);
    return result;
  }

  /**
   * Find all suppliers for a given product — BFS based
   */
  getSuppliersForProduct(productId) {
    const results = this.bfs(productId, 'supplier');
    return results
      .sort((a, b) => {
        const edgeA = this._getEdge(productId, a.node.id);
        const edgeB = this._getEdge(productId, b.node.id);
        return (edgeB?.weight || 0) - (edgeA?.weight || 0); // Sort by reliability
      })
      .map(r => ({
        ...r.node.data,
        supplierId: r.node.id,
        reliability: this._getEdge(productId, r.node.id)?.weight,
        leadTime: this._getEdge(productId, r.node.id)?.metadata?.lead_time,
      }));
  }

  /**
   * Find all products supplied by a supplier — BFS based
   */
  getProductsForSupplier(supplierId) {
    const results = this.bfs(supplierId, 'product');
    return results.map(r => ({
      ...r.node.data,
      productId: r.node.id,
      leadTime: this._getEdge(supplierId, r.node.id)?.metadata?.lead_time,
    }));
  }

  /**
   * Supply risk analysis:
   * Find products with only ONE supplier (single point of failure)
   */
  analyzeSupplyRisk() {
    const risks = [];

    for (const [nodeId, node] of this.nodes) {
      if (node.type === 'product') {
        const suppliers = this.getSuppliersForProduct(nodeId);
        if (suppliers.length === 1) {
          risks.push({
            product: node.data,
            productId: nodeId,
            riskLevel: 'HIGH',
            reason: 'Single supplier dependency',
            supplier: suppliers[0],
          });
        } else if (suppliers.length === 0) {
          risks.push({
            product: node.data,
            productId: nodeId,
            riskLevel: 'CRITICAL',
            reason: 'No supplier mapped',
            supplier: null,
          });
        }
      }
    }

    return risks;
  }

  /**
   * Get best supplier for a product (highest reliability, lowest lead time)
   */
  getBestSupplier(productId) {
    const suppliers = this.getSuppliersForProduct(productId);
    if (!suppliers.length) return null;

    return suppliers.reduce((best, curr) => {
      const score = (curr.reliability || 0) * 10 - (curr.leadTime || 14);
      const bestScore = (best.reliability || 0) * 10 - (best.leadTime || 14);
      return score > bestScore ? curr : best;
    });
  }

  _getEdge(fromId, toId) {
    const adj = this.adjacency.get(fromId) || [];
    const entry = adj.find(a => a.nodeId === toId);
    return entry ? entry.edge : null;
  }

  _getPath(startId, endId, distances) {
    // Simplified path for display
    return [startId, endId];
  }

  getStats() {
    const supplierCount = [...this.nodes.values()].filter(n => n.type === 'supplier').length;
    const productCount = [...this.nodes.values()].filter(n => n.type === 'product').length;
    return {
      totalNodes: this.nodes.size,
      supplierCount,
      productCount,
      edgeCount: this.edgeCount,
      avgSuppliersPerProduct: productCount > 0
        ? (this.edgeCount / productCount).toFixed(2)
        : '0',
    };
  }

  clear() {
    this.nodes.clear();
    this.adjacency.clear();
    this.edgeCount = 0;
  }
}

/**
 * Quick Sort implementation for reports
 * @param {Array} arr - Array of products/transactions
 * @param {Function} compareFn - Comparison function
 */
function quickSort(arr, compareFn) {
  if (arr.length <= 1) return arr;

  // Median-of-three pivot (avoids O(n²) on sorted input)
  const mid = Math.floor(arr.length / 2);
  const candidates = [arr[0], arr[mid], arr[arr.length - 1]];
  candidates.sort(compareFn);
  const pivot = candidates[1];

  const left = [];
  const center = [];
  const right = [];

  for (const item of arr) {
    const cmp = compareFn(item, pivot);
    if (cmp < 0) left.push(item);
    else if (cmp > 0) right.push(item);
    else center.push(item);
  }

  return [...quickSort(left, compareFn), ...center, ...quickSort(right, compareFn)];
}

/**
 * Binary Search for price range filtering
 * @param {Array} sortedArr - Sorted array
 * @param {number} target - Target value
 * @param {Function} keyFn - Key extraction function
 * @returns {number} index of target or insertion point
 */
function binarySearch(sortedArr, target, keyFn = x => x) {
  let lo = 0, hi = sortedArr.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const val = keyFn(sortedArr[mid]);
    if (val === target) return mid;
    if (val < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

/**
 * Binary search for left bound (first element >= target)
 */
function lowerBound(sortedArr, target, keyFn = x => x) {
  let lo = 0, hi = sortedArr.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (keyFn(sortedArr[mid]) < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Binary search for right bound (first element > target)
 */
function upperBound(sortedArr, target, keyFn = x => x) {
  let lo = 0, hi = sortedArr.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (keyFn(sortedArr[mid]) <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const supplierGraph = new SupplierGraph();

module.exports = {
  SupplierGraph, supplierGraph,
  quickSort, binarySearch, lowerBound, upperBound,
};
