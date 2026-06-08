// ═══════════════════════════════════════════════════════════
// Performance Engine - 遊戲效能優化核心模組
// ═══════════════════════════════════════════════════════════

class PerformanceEngine {
  constructor(scene) {
    this.scene = scene;
    this.objectPools = new Map();
    this.particleEmitters = [];
    this.drawCallCount = 0;
    this.fps = 60;
    this.lastFrameTime = 0;
  }

  /**
   * 初始化物件池 (Object Pooling)
   * 減少 GC 壓力與記憶體碎片化
   */
  initObjectPool(poolName, PoolClass, initialSize = 50) {
    const pool = {
      available: [],
      inUse: new Set(),
      PoolClass
    };
    
    for (let i = 0; i < initialSize; i++) {
      pool.available.push(new PoolClass());
    }
    
    this.objectPools.set(poolName, pool);
  }

  /**
   * 從物件池取得物件
   */
  acquireObject(poolName, ...args) {
    const pool = this.objectPools.get(poolName);
    if (!pool) return new pool.PoolClass(...args);
    
    let obj = pool.available.pop();
    if (!obj) {
      obj = new pool.PoolClass(...args);
    } else {
      obj.reset?.(...args);
    }
    
    pool.inUse.add(obj);
    return obj;
  }

  /**
   * 歸還物件到物件池
   */
  releaseObject(poolName, obj) {
    const pool = this.objectPools.get(poolName);
    if (!pool) return;
    
    pool.inUse.delete(obj);
    obj.cleanup?.();
    pool.available.push(obj);
  }

  /**
   * 優化粒子系統 - 使用 Phaser ParticleEmitter
   */
  createOptimizedParticles(config) {
    const emitter = this.scene.add.particles(config.texture || 0xffffff);
    emitter.createEmitter({
      speed: config.speed || { min: -200, max: 200 },
      angle: config.angle || { min: 240, max: 300 },
      scale: config.scale || { start: 1, end: 0 },
      lifespan: config.lifespan || 600,
      gravityY: config.gravityY || 300,
      emitZone: config.emitZone || null
    });
    
    this.particleEmitters.push(emitter);
    return emitter;
  }

  /**
   * 實施 LOD (Level of Detail)
   * 根據距離調整渲染品質
   */
  updateLOD(camera, objects) {
    objects.forEach(obj => {
      const distance = Phaser.Math.Distance.Between(
        camera.centerX, camera.centerY,
        obj.x, obj.y
      );
      
      if (distance > 1000) {
        obj.setActive(false); // 遠距離不渲染
      } else if (distance > 500) {
        obj.setScale(0.75); // 中距離縮小
      } else {
        obj.setScale(1); // 近距離完整渲染
      }
    });
  }

  /**
   * 減少 Draw Call - 使用 Sprite Batch
   */
  optimizeDrawCalls(sprites) {
    // 將相同紋理的精靈分組
    const groups = new Map();
    sprites.forEach(sprite => {
      const texture = sprite.texture.key;
      if (!groups.has(texture)) {
        groups.set(texture, []);
      }
      groups.get(texture).push(sprite);
    });
    
    return groups;
  }

  /**
   * 監控 FPS 與效能指標
   */
  updatePerformanceMetrics() {
    const now = performance.now();
    const deltaTime = now - this.lastFrameTime;
    this.lastFrameTime = now;
    
    // 計算 FPS (每秒幀數)
    this.fps = Math.round(1000 / deltaTime);
    
    // 如果 FPS 低於 50，觸發效能警告
    if (this.fps < 50) {
      console.warn(`⚠️ 低 FPS 警告: ${this.fps} FPS`);
      this._reduceGraphicsQuality();
    }
  }

  /**
   * 動態降低圖形品質
   */
  _reduceGraphicsQuality() {
    // 禁用某些視覺特效
    this.particleEmitters.forEach(emitter => {
      emitter.emitZoneData.quantity *= 0.5; // 減少粒子數量
    });
    
    // 禁用某些動畫
    this.scene.tweens.pauseAll();
  }

  /**
   * 清理與銷毀
   */
  destroy() {
    this.objectPools.clear();
    this.particleEmitters.forEach(emitter => emitter.destroy());
    this.particleEmitters = [];
  }
}

// 特效粒子類別
class EffectParticle {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.life = 0;
    this.maxLife = 0;
  }

  reset(x, y, vx, vy, life) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = life;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
  }

  cleanup() {
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.life = 0;
  }
}
