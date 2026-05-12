/**
 * UndoStack
 * ──────────
 * LIFO Stack for reversible inventory operations.
 * Supports undo for: product updates, stock changes, deletions.
 * Maximum configurable depth to limit memory usage.
 *
 * Time Complexity: O(1) push/pop/peek
 * Space Complexity: O(k) where k = max stack depth
 */

class StackFrame {
  constructor(action, data, reversalData) {
    this.action = action;           // 'UPDATE_PRODUCT' | 'UPDATE_STOCK' | 'DELETE_PRODUCT' | 'CREATE_PRODUCT'
    this.data = data;               // What was changed TO
    this.reversalData = reversalData; // What to revert TO
    this.timestamp = new Date().toISOString();
    this.userId = data.userId || null;
  }
}

class UndoStack {
  constructor(maxDepth = 50) {
    this.stack = [];
    this.maxDepth = maxDepth;
    this.redoStack = []; // For redo support
  }

  get size() { return this.stack.length; }
  get isEmpty() { return this.stack.length === 0; }
  get canRedo() { return this.redoStack.length > 0; }

  /**
   * Push a reversible action onto the stack — O(1)
   * @param {string} action - Action type
   * @param {Object} data - New state
   * @param {Object} reversalData - Previous state (to revert to)
   */
  push(action, data, reversalData) {
    const frame = new StackFrame(action, data, reversalData);
    this.stack.push(frame);

    // Clear redo stack when new action is taken
    this.redoStack = [];

    // Enforce max depth — remove oldest entry
    if (this.stack.length > this.maxDepth) {
      this.stack.shift();
    }

    return frame;
  }

  /**
   * Pop most recent action for undo — O(1)
   */
  pop() {
    if (this.isEmpty) return null;
    const frame = this.stack.pop();
    this.redoStack.push(frame); // Save for potential redo
    return frame;
  }

  /**
   * Redo last undone action — O(1)
   */
  redo() {
    if (!this.canRedo) return null;
    const frame = this.redoStack.pop();
    this.stack.push(frame);
    return frame;
  }

  /**
   * Peek without removing — O(1)
   */
  peek() {
    if (this.isEmpty) return null;
    return this.stack[this.stack.length - 1];
  }

  /**
   * Get last N undo entries for display
   */
  getHistory(limit = 10) {
    return this.stack.slice(-limit).reverse().map(frame => ({
      action: frame.action,
      description: this._describe(frame),
      timestamp: frame.timestamp,
      canUndo: true,
    }));
  }

  _describe(frame) {
    const d = frame.data;
    switch (frame.action) {
      case 'UPDATE_PRODUCT':
        return `Updated product "${d.name || d.product_name}"`;
      case 'UPDATE_STOCK':
        return `Stock changed: ${frame.reversalData.qty} → ${d.qty} for "${d.name}"`;
      case 'DELETE_PRODUCT':
        return `Deleted product "${d.name}"`;
      case 'CREATE_PRODUCT':
        return `Created product "${d.name}"`;
      case 'PRICE_CHANGE':
        return `Price changed: ₹${frame.reversalData.price} → ₹${d.price}`;
      default:
        return `Action: ${frame.action}`;
    }
  }

  /**
   * Clear all undo history
   */
  clear() {
    this.stack = [];
    this.redoStack = [];
  }

  getStats() {
    return {
      undoDepth: this.stack.length,
      redoDepth: this.redoStack.length,
      maxDepth: this.maxDepth,
    };
  }
}

// Per-user undo stacks (userId -> UndoStack)
const userUndoStacks = new Map();

const getUndoStack = (userId) => {
  if (!userUndoStacks.has(userId)) {
    userUndoStacks.set(userId, new UndoStack(50));
  }
  return userUndoStacks.get(userId);
};

module.exports = { UndoStack, getUndoStack };
