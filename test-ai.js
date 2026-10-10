#!/usr/bin/env node
/**
 * 山西扣点点麻将 - AI性能测试
 * 运行大量对局收集数据：胜率、报听率、放炮率、决策质量
 */

const fs = require('fs');

// 加载V6优化版游戏逻辑
const G = require('./game-logic-v6.js');

console.log('✅ 游戏引擎加载成功');
console.log(`测试环境：Node.js ${process.version}\n`);

// 测试配置
const NUM_GAMES = 1000;  // 测试局数
const PROGRESS_INTERVAL = 100;  // 进度报告间隔

// 统计数据
const stats = {
  games: 0,
  wins: [0, 0, 0, 0],
  zimoWins: [0, 0, 0, 0],
  paoWins: [0, 0, 0, 0],
  fangpao: [0, 0, 0, 0],
  tingRate: [0, 0, 0, 0],
  avgTingTurn: [[], [], [], []],
  totalScores: [0, 0, 0, 0],
  draws: 0,
  totalTurns: 0,
  decisions: {
    discard: 0,
    ting: 0,
    hu: 0,
    peng: 0,
    gang: 0,
    angang: 0,
    bugang: 0
  }
};

// 简单的hooks来收集统计
function makeStatsHooks(gameStats) {
  let tingTurns = [-1, -1, -1, -1];
  let currentTurn = 0;
  
  return {
    event: async (e, st) => {
      if (e.type === 'draw' && !e.fromBack) {
        currentTurn++;
      }
      if (e.type === 'discard') {
        if (e.ting && tingTurns[e.p] === -1) {
          tingTurns[e.p] = currentTurn;
        }
      }
      if (e.type === 'end') {
        for (let i = 0; i < 4; i++) {
          if (tingTurns[i] !== -1) {
            gameStats.tingRate[i]++;
            gameStats.avgTingTurn[i].push(tingTurns[i]);
          }
        }
        gameStats.totalTurns += currentTurn;
      }
    }
  };
}

// 运行单局游戏
async function runGame(seed) {
  const rng = G.mulberry32(seed);
  const st = G.newRound({ dealer: Math.floor(rng() * 4), rng });
  
  const gameStats = {
    games: 0,
    wins: [0, 0, 0, 0],
    zimoWins: [0, 0, 0, 0],
    paoWins: [0, 0, 0, 0],
    fangpao: [0, 0, 0, 0],
    tingRate: [0, 0, 0, 0],
    avgTingTurn: [[], [], [], []],
    totalScores: [0, 0, 0, 0],
    draws: 0,
    totalTurns: 0
  };
  
  const hooks = makeStatsHooks(gameStats);
  
  try {
    await G.playRound(st, [G.AI, G.AI, G.AI, G.AI], hooks);
  } catch (e) {
    console.error(`游戏 ${seed} 出错:`, e.message);
    return null;
  }
  
  const result = st.result;
  
  if (result.type === 'win') {
    const winner = result.winner;
    gameStats.wins[winner]++;
    
    if (result.zimo) {
      gameStats.zimoWins[winner]++;
    } else {
      gameStats.paoWins[winner]++;
      gameStats.fangpao[result.from]++;
    }
    
    // 记录得分
    for (let i = 0; i < 4; i++) {
      gameStats.totalScores[i] += st.scores[i];
    }
  } else if (result.type === 'draw') {
    gameStats.draws++;
  }
  
  return gameStats;
}

// 合并统计数据
function mergeStats(target, source) {
  if (!source) return;
  
  target.games++;
  for (let i = 0; i < 4; i++) {
    target.wins[i] += source.wins[i];
    target.zimoWins[i] += source.zimoWins[i];
    target.paoWins[i] += source.paoWins[i];
    target.fangpao[i] += source.fangpao[i];
    target.tingRate[i] += source.tingRate[i];
    // 直接合并数组而不是push
    if (source.avgTingTurn[i].length > 0) {
      target.avgTingTurn[i] = target.avgTingTurn[i].concat(source.avgTingTurn[i]);
    }
    target.totalScores[i] += source.totalScores[i];
  }
  target.draws += source.draws;
  target.totalTurns += source.totalTurns;
}

// 计算平均值
function avg(arr) {
  return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
}

// 打印统计报告
function printReport(stats) {
  console.log('\n' + '='.repeat(60));
  console.log('测试完成！统计报告：');
  console.log('='.repeat(60));
  console.log(`总局数: ${stats.games}`);
  console.log(`平均回合数: ${(stats.totalTurns / stats.games).toFixed(1)}`);
  console.log(`荒庄率: ${(stats.draws / stats.games * 100).toFixed(1)}%`);
  console.log('');
  
  const positions = ['庄家位', '下家位', '对家位', '上家位'];
  
  console.log('各座位统计：');
  console.log('-'.repeat(60));
  
  for (let i = 0; i < 4; i++) {
    const winRate = (stats.wins[i] / stats.games * 100).toFixed(1);
    const zimoRate = stats.wins[i] > 0 ? (stats.zimoWins[i] / stats.wins[i] * 100).toFixed(1) : '0.0';
    const tingPct = (stats.tingRate[i] / stats.games * 100).toFixed(1);
    const avgTing = avg(stats.avgTingTurn[i]).toFixed(1);
    const avgScore = (stats.totalScores[i] / stats.games).toFixed(1);
    const fangpaoPct = (stats.fangpao[i] / stats.games * 100).toFixed(1);
    
    console.log(`\n${positions[i]}:`);
    console.log(`  胜率: ${winRate}% (${stats.wins[i]}/${stats.games})`);
    console.log(`  自摸率: ${zimoRate}% (${stats.zimoWins[i]}/${stats.wins[i]})`);
    console.log(`  报听率: ${tingPct}%`);
    console.log(`  平均报听回合: ${avgTing}`);
    console.log(`  平均得分: ${avgScore}`);
    console.log(`  放炮率: ${fangpaoPct}%`);
  }
  
  console.log('\n' + '='.repeat(60));
  
  // 计算方差看是否平衡
  const winRates = stats.wins.map(w => w / stats.games * 100);
  const avgWinRate = avg(winRates);
  const variance = winRates.reduce((sum, r) => sum + Math.pow(r - avgWinRate, 2), 0) / 4;
  console.log(`胜率方差: ${variance.toFixed(2)} (越小越平衡)`);
  console.log('='.repeat(60) + '\n');
}

// 主函数
async function main() {
  console.log(`开始运行 ${NUM_GAMES} 局测试...\n`);
  const startTime = Date.now();
  
  for (let i = 0; i < NUM_GAMES; i++) {
    const gameResult = await runGame(1000 + i);
    mergeStats(stats, gameResult);
    
    if ((i + 1) % PROGRESS_INTERVAL === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const gamesPerSec = ((i + 1) / (Date.now() - startTime) * 1000).toFixed(1);
      console.log(`进度: ${i + 1}/${NUM_GAMES} (${elapsed}s, ${gamesPerSec} 局/秒)`);
    }
  }
  
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n所有测试完成！总耗时: ${totalTime}秒`);
  
  printReport(stats);
  
  // 保存详细数据到JSON
  fs.writeFileSync('test-results.json', JSON.stringify(stats, null, 2));
  console.log('详细数据已保存到 test-results.json');
}

main().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
