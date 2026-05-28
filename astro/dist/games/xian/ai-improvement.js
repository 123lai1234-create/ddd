// ═══════════════════════════════════════════════════════════
// AI Improvement Module - 敵人 AI 與難度系統
// ═══════════════════════════════════════════════════════════

class AISystem {
  constructor(difficulty = 'normal') {
    this.difficulty = difficulty; // 'easy', 'normal', 'hard', 'nightmare'
    this.difficultyMultipliers = {
      easy: { damage: 0.7, defense: 0.8, accuracy: 0.75 },
      normal: { damage: 1.0, defense: 1.0, accuracy: 1.0 },
      hard: { damage: 1.3, defense: 1.2, accuracy: 1.1 },
      nightmare: { damage: 1.6, defense: 1.5, accuracy: 1.25 }
    };
    
    this.enemyStrategies = new Map();
    this.battleMemory = [];
  }

  /**
   * 根據敵人類型與難度選擇最優行動
   */
  chooseOptimalAction(enemy, partyState, battleState) {
    const strategy = this.getEnemyStrategy(enemy);
    
    // 根據難度調整決策
    const multiplier = this.difficultyMultipliers[this.difficulty];
    
    // 評估所有可能的行動
    const actions = this._evaluateActions(enemy, partyState, battleState, strategy);
    
    // 選擇評分最高的行動
    return actions.reduce((best, current) => 
      current.score > best.score ? current : best
    );
  }

  /**
   * 評估所有可能的行動
   */
  _evaluateActions(enemy, partyState, battleState, strategy) {
    const actions = [];
    
    // 評估攻擊行動
    partyState.forEach((member, idx) => {
      const damage = this._calculateDamage(enemy, member);
      const score = damage * strategy.offensiveWeight;
      actions.push({ type: 'attack', target: idx, score, damage });
    });
    
    // 評估防禦行動
    if (enemy.hp < enemy.maxHp * 0.3) {
      actions.push({ type: 'defend', score: 50 * strategy.defensiveWeight });
    }
    
    // 評估特殊技能
    if (enemy.skills) {
      enemy.skills.forEach(skill => {
        const skillScore = this._evaluateSkill(skill, partyState, enemy);
        actions.push({ type: 'skill', skill, score: skillScore });
      });
    }
    
    // 評估恢復行動
    if (enemy.hp < enemy.maxHp * 0.5 && enemy.canHeal) {
      actions.push({ type: 'heal', score: 60 * strategy.defensiveWeight });
    }
    
    return actions;
  }

  /**
   * 計算傷害預期值
   */
  _calculateDamage(attacker, defender) {
    const baseDamage = attacker.atk * 1.2;
    const defense = defender.def * 0.8;
    const actualDamage = Math.max(1, baseDamage - defense);
    const variance = actualDamage * (0.8 + Math.random() * 0.4);
    return variance;
  }

  /**
   * 評估特殊技能的有效性
   */
  _evaluateSkill(skill, partyState, enemy) {
    let score = 0;
    
    // 群體傷害技能
    if (skill.targetType === 'all') {
      score = partyState.length * skill.power * 15;
    }
    
    // 單體傷害技能
    if (skill.targetType === 'single') {
      const maxHpTarget = partyState.reduce((max, m) => 
        m.hp > max.hp ? m : max
      );
      score = skill.power * 20 * (maxHpTarget.hp / maxHpTarget.maxHp);
    }
    
    // 狀態異常技能
    if (skill.debuff) {
      score += 25;
    }
    
    // 恢復技能
    if (skill.type === 'heal') {
      const avgHpPercent = partyState.reduce((sum, m) => 
        sum + (m.hp / m.maxHp), 0
      ) / partyState.length;
      score = skill.power * 10 * (1 - avgHpPercent);
    }
    
    return score;
  }

  /**
   * 獲取敵人的戰略配置
   */
  getEnemyStrategy(enemy) {
    if (this.enemyStrategies.has(enemy.id)) {
      return this.enemyStrategies.get(enemy.id);
    }
    
    // 根據敵人類型設定預設策略
    const strategy = {
      offensiveWeight: enemy.atk > enemy.def ? 1.2 : 0.8,
      defensiveWeight: enemy.hp < enemy.maxHp * 0.5 ? 1.5 : 1.0,
      useSkills: enemy.skills ? true : false,
      preferGroupAttacks: enemy.type === 'boss' ? true : false
    };
    
    this.enemyStrategies.set(enemy.id, strategy);
    return strategy;
  }

  /**
   * 實施動態難度調整
   */
  adjustDifficultyDynamically(playerWinRate) {
    // 如果玩家勝率過高，提升難度
    if (playerWinRate > 0.8) {
      this.difficulty = 'hard';
    }
    // 如果玩家勝率過低，降低難度
    else if (playerWinRate < 0.3) {
      this.difficulty = 'easy';
    }
    // 正常範圍內保持當前難度
    else {
      this.difficulty = 'normal';
    }
  }

  /**
   * 記錄戰鬥數據用於學習
   */
  recordBattleData(battleResult) {
    this.battleMemory.push({
      timestamp: Date.now(),
      result: battleResult,
      difficulty: this.difficulty
    });
    
    // 只保留最近 100 場戰鬥的記錄
    if (this.battleMemory.length > 100) {
      this.battleMemory.shift();
    }
  }

  /**
   * 計算玩家勝率
   */
  getPlayerWinRate() {
    if (this.battleMemory.length === 0) return 0.5;
    
    const wins = this.battleMemory.filter(b => b.result === 'win').length;
    return wins / this.battleMemory.length;
  }
}

// 導出 AI 系統
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AISystem;
}
