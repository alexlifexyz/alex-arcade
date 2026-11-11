/**
 * game.js
 * 2048 核心状态机与向量计算引擎
 * 拥有稳定的方块唯一 ID 追踪（驱动 60fps 平滑位移动画）、撤回栈与持久化
 */
(function(root) {
  "use strict";

  var tileIdCounter = 1;

  function Tile(x, y, value) {
    this.x = x;
    this.y = y;
    this.value = value || 2;
    this.id = tileIdCounter++;
    this.previousPosition = null;
    this.mergedFrom = null; // 记录由哪两个子方块合并而来
  }

  Tile.prototype.savePosition = function() {
    this.previousPosition = { x: this.x, y: this.y };
  };

  Tile.prototype.updatePosition = function(position) {
    this.x = position.x;
    this.y = position.y;
  };

  Tile.prototype.serialize = function() {
    return {
      x: this.x,
      y: this.y,
      value: this.value,
      id: this.id
    };
  };

  function Grid(size) {
    this.size = size || 4;
    this.cells = this.empty();
  }

  Grid.prototype.empty = function() {
    var cells = [];
    for (var x = 0; x < this.size; x++) {
      var row = (cells[x] = []);
      for (var y = 0; y < this.size; y++) {
        row.push(null);
      }
    }
    return cells;
  };

  Grid.prototype.randomAvailableCell = function() {
    var cells = this.availableCells();
    if (cells.length) {
      return cells[Math.floor(Math.random() * cells.length)];
    }
    return null;
  };

  Grid.prototype.availableCells = function() {
    var cells = [];
    this.eachCell(function(x, y, tile) {
      if (!tile) {
        cells.push({ x: x, y: y });
      }
    });
    return cells;
  };

  Grid.prototype.eachCell = function(callback) {
    for (var x = 0; x < this.size; x++) {
      for (var y = 0; y < this.size; y++) {
        callback(x, y, this.cells[x][y]);
      }
    }
  };

  Grid.prototype.cellsAvailable = function() {
    return !!this.availableCells().length;
  };

  Grid.prototype.cellAvailable = function(cell) {
    return !this.cellOccupied(cell);
  };

  Grid.prototype.cellOccupied = function(cell) {
    return !!this.cellContent(cell);
  };

  Grid.prototype.cellContent = function(cell) {
    if (this.withinBounds(cell)) {
      return this.cells[cell.x][cell.y];
    } else {
      return null;
    }
  };

  Grid.prototype.insertTile = function(tile) {
    this.cells[tile.x][tile.y] = tile;
  };

  Grid.prototype.removeTile = function(tile) {
    this.cells[tile.x][tile.y] = null;
  };

  Grid.prototype.withinBounds = function(position) {
    return (
      position.x >= 0 &&
      position.x < this.size &&
      position.y >= 0 &&
      position.y < this.size
    );
  };

  Grid.prototype.serialize = function() {
    var cellState = [];
    for (var x = 0; x < this.size; x++) {
      var row = (cellState[x] = []);
      for (var y = 0; y < this.size; y++) {
        row.push(this.cells[x][y] ? this.cells[x][y].serialize() : null);
      }
    }
    return {
      size: this.size,
      cells: cellState
    };
  };

  function GameManager(size, storageKey) {
    this.size = size || 4;
    this.storageKey = storageKey || "g2048_state";
    this.historyStack = [];
    this.maxHistory = 8;
    this.setup();
  }

  GameManager.prototype.setup = function() {
    var previousState = this.loadState();
    var restoredCount = 0;

    if (previousState && !previousState.over && previousState.grid && Array.isArray(previousState.grid.cells)) {
      this.grid = new Grid(previousState.grid.size || this.size);
      this.score = Number(previousState.score) || 0;
      this.over = false;
      this.won = !!previousState.won;
      this.keepPlaying = !!previousState.keepPlaying;
      var self = this;
      previousState.grid.cells.forEach(function(row) {
        if (Array.isArray(row)) {
          row.forEach(function(cell) {
            if (cell && cell.value) {
              var tile = new Tile(cell.x, cell.y, cell.value);
              tile.id = cell.id || (tileIdCounter++);
              tileIdCounter = Math.max(tileIdCounter, tile.id + 1);
              self.grid.insertTile(tile);
              restoredCount++;
            }
          });
        }
      });
    }

    // 核心安全守卫：如果恢复出的方块数不足 2 个或状态已结束，强制初始化合法新对局，杜绝空棋盘！
    if (restoredCount < 2) {
      this.grid = new Grid(this.size);
      this.score = 0;
      this.over = false;
      this.won = false;
      this.keepPlaying = false;
      this.addStartTiles();
      this.saveState();
    }

    this.bestScore = this.loadBestScore();
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      this.saveBestScore(this.bestScore);
    }
  };

  GameManager.prototype.restart = function() {
    this.clearState();
    this.historyStack = [];
    this.grid = new Grid(this.size);
    this.score = 0;
    this.over = false;
    this.won = false;
    this.keepPlaying = false;
    this.addStartTiles();
    this.saveState();
  };

  GameManager.prototype.addStartTiles = function() {
    for (var i = 0; i < 2; i++) {
      this.addRandomTile();
    }
  };

  GameManager.prototype.addRandomTile = function() {
    if (this.grid.cellsAvailable()) {
      var value = Math.random() < 0.9 ? 2 : 4;
      var cell = this.grid.randomAvailableCell();
      var tile = new Tile(cell.x, cell.y, value);
      this.grid.insertTile(tile);
      return tile;
    }
    return null;
  };

  // 记录撤回历史快照
  GameManager.prototype.pushHistory = function() {
    var snapshot = {
      score: this.score,
      won: this.won,
      keepPlaying: this.keepPlaying,
      cells: []
    };
    this.grid.eachCell(function(x, y, tile) {
      if (tile) {
        snapshot.cells.push({ x: x, y: y, value: tile.value, id: tile.id });
      }
    });
    this.historyStack.push(snapshot);
    if (this.historyStack.length > this.maxHistory) {
      this.historyStack.shift();
    }
  };

  // 撤回一步 (Undo)
  GameManager.prototype.undo = function() {
    if (!this.historyStack.length || this.over) return false;
    var snapshot = this.historyStack.pop();
    this.grid = new Grid(this.size);
    this.score = snapshot.score;
    this.won = snapshot.won;
    this.keepPlaying = snapshot.keepPlaying;
    var self = this;
    snapshot.cells.forEach(function(item) {
      var tile = new Tile(item.x, item.y, item.value);
      tile.id = item.id;
      self.grid.insertTile(tile);
    });
    this.saveState();
    return true;
  };

  GameManager.prototype.prepareTiles = function() {
    this.grid.eachCell(function(x, y, tile) {
      if (tile) {
        tile.mergedFrom = null;
        tile.savePosition();
      }
    });
  };

  GameManager.prototype.moveTile = function(tile, cell) {
    this.grid.cells[tile.x][tile.y] = null;
    this.grid.cells[cell.x][cell.y] = tile;
    tile.updatePosition(cell);
  };

  // 核心移动逻辑: 0: 上, 1: 右, 2: 下, 3: 左
  GameManager.prototype.move = function(direction) {
    if (this.over) return { moved: false };

    var cell, tile;
    var vector = this.getVector(direction);
    var traversals = this.buildTraversals(vector);
    var moved = false;
    var scoreAdded = 0;
    var mergedValues = [];

    this.prepareTiles();

    var self = this;
    traversals.x.forEach(function(x) {
      traversals.y.forEach(function(y) {
        cell = { x: x, y: y };
        tile = self.grid.cellContent(cell);

        if (tile) {
          var positions = self.findFarthestPosition(cell, vector);
          var next = self.grid.cellContent(positions.next);

          if (next && next.value === tile.value && !next.mergedFrom) {
            // 合并
            var merged = new Tile(positions.next.x, positions.next.y, tile.value * 2);
            merged.mergedFrom = [tile, next];

            self.grid.insertTile(merged);
            self.grid.removeTile(tile);

            tile.updatePosition(positions.next);

            self.score += merged.value;
            scoreAdded += merged.value;
            mergedValues.push(merged.value);

            if (merged.value === 2048) {
              self.won = true;
            }
            moved = true;
          } else {
            // 纯移动
            self.moveTile(tile, positions.farthest);
            if (cell.x !== positions.farthest.x || cell.y !== positions.farthest.y) {
              moved = true;
            }
          }
        }
      });
    });

    if (moved) {
      this.pushHistory();
      var newTile = this.addRandomTile();

      if (!this.movesAvailable()) {
        this.over = true;
      }

      if (this.score > this.bestScore) {
        this.bestScore = this.score;
        this.saveBestScore(this.bestScore);
      }

      this.saveState();

      return {
        moved: true,
        scoreAdded: scoreAdded,
        mergedValues: mergedValues,
        newTile: newTile,
        won: this.won && !this.keepPlaying,
        over: this.over
      };
    }

    return { moved: false };
  };

  GameManager.prototype.getVector = function(direction) {
    var map = {
      0: { x: 0, y: -1 }, // 上
      1: { x: 1, y: 0 },  // 右
      2: { x: 0, y: 1 },  // 下
      3: { x: -1, y: 0 }  // 左
    };
    return map[direction];
  };

  GameManager.prototype.buildTraversals = function(vector) {
    var traversals = { x: [], y: [] };
    for (var pos = 0; pos < this.size; pos++) {
      traversals.x.push(pos);
      traversals.y.push(pos);
    }
    if (vector.x === 1) traversals.x = traversals.x.reverse();
    if (vector.y === 1) traversals.y = traversals.y.reverse();
    return traversals;
  };

  GameManager.prototype.findFarthestPosition = function(cell, vector) {
    var previous;
    do {
      previous = cell;
      cell = { x: previous.x + vector.x, y: previous.y + vector.y };
    } while (this.grid.withinBounds(cell) && this.grid.cellAvailable(cell));

    return {
      farthest: previous,
      next: cell
    };
  };

  GameManager.prototype.movesAvailable = function() {
    return this.grid.cellsAvailable() || this.tileMatchesAvailable();
  };

  GameManager.prototype.tileMatchesAvailable = function() {
    var self = this;
    var tile;
    for (var x = 0; x < this.size; x++) {
      for (var y = 0; y < this.size; y++) {
        tile = this.grid.cellContent({ x: x, y: y });
        if (tile) {
          for (var direction = 0; direction < 4; direction++) {
            var vector = self.getVector(direction);
            var cell = { x: x + vector.x, y: y + vector.y };
            var other = self.grid.cellContent(cell);
            if (other && other.value === tile.value) {
              return true;
            }
          }
        }
      }
    }
    return false;
  };

  GameManager.prototype.getMaxTileValue = function() {
    var maxVal = 2;
    this.grid.eachCell(function(x, y, tile) {
      if (tile && tile.value > maxVal) {
        maxVal = tile.value;
      }
    });
    return maxVal;
  };

  GameManager.prototype.saveState = function() {
    try {
      var state = {
        grid: this.grid.serialize(),
        score: this.score,
        over: this.over,
        won: this.won,
        keepPlaying: this.keepPlaying
      };
      localStorage.setItem(this.storageKey, JSON.stringify(state));
    } catch(e) {}
  };

  GameManager.prototype.loadState = function() {
    try {
      var raw = localStorage.getItem(this.storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch(e) {
      return null;
    }
  };

  GameManager.prototype.clearState = function() {
    try {
      localStorage.removeItem(this.storageKey);
    } catch(e) {}
  };

  GameManager.prototype.saveBestScore = function(score) {
    try {
      localStorage.setItem("g2048_best_score", String(score));
    } catch(e) {}
  };

  GameManager.prototype.loadBestScore = function() {
    try {
      return Number(localStorage.getItem("g2048_best_score")) || 0;
    } catch(e) {
      return 0;
    }
  };

  root.Tile = Tile;
  root.Grid = Grid;
  root.GameManager = GameManager;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { Tile: Tile, Grid: Grid, GameManager: GameManager };
  }
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
