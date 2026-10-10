
/* ===== 山西扣点点 game logic (pure, shared by UI and node tests) ===== */
(function (root) {
'use strict';
const SUITS = ['万', '筒', '条'];
const HONORS = ['东', '南', '西', '北', '中', '发', '白'];
const NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const SEAT_NAMES = ['Kevin', '下家', '对家', '上家'];

function pts(t) { return t < 27 ? (t % 9) + 1 : 10; }
function tname(t) { return t < 27 ? ((t % 9) + 1) + SUITS[(t / 9) | 0] : HONORS[t - 27]; }
function counts(a) { const c = new Array(34).fill(0); for (const t of a) c[t]++; return c; }
function sum(c) { let s = 0; for (const x of c) s += x; return s; }

/* ---------- shanten (向听数) ---------- */
function shantenNormal(c, nm) {
  const need = 4 - nm;
  let best = 2 * need;
  function dfs(i, m, t, p) {
    while (i < 34 && c[i] === 0) i++;
    if (i >= 34) {
      const tt = Math.min(t, need - m);
      const s = 2 * (need - m) - tt - p;
      if (s < best) best = s;
      return;
    }
    if (best <= -1) return;
    const suited = i < 27, r = i % 9;
    if (c[i] >= 3 && m < need) { c[i] -= 3; dfs(i, m + 1, t, p); c[i] += 3; }
    if (suited && r <= 6 && m < need && c[i + 1] && c[i + 2]) {
      c[i]--; c[i + 1]--; c[i + 2]--; dfs(i, m + 1, t, p); c[i]++; c[i + 1]++; c[i + 2]++;
    }
    if (c[i] >= 2) {
      c[i] -= 2;
      if (!p) dfs(i, m, t, 1);
      if (m + t < need) dfs(i, m, t + 1, p);
      c[i] += 2;
    }
    if (m + t < need) {
      if (suited && r <= 7 && c[i + 1]) { c[i]--; c[i + 1]--; dfs(i, m, t + 1, p); c[i]++; c[i + 1]++; }
      if (suited && r <= 6 && c[i + 2]) { c[i]--; c[i + 2]--; dfs(i, m, t + 1, p); c[i]++; c[i + 2]++; }
    }
    const k = c[i]; c[i] = 0; dfs(i + 1, m, t, p); c[i] = k; // rest of this tile kind isolated
  }
  dfs(0, 0, 0, 0);
  return best;
}
function shantenChiitoi(c, nm) {
  if (nm > 0) return 99;
  let pairs = 0; for (const x of c) pairs += x >> 1; // a quad counts as two pairs
  return 6 - Math.min(7, pairs);
}
function shanten(c, nm) { return Math.min(shantenNormal(c, nm), shantenChiitoi(c, nm)); }

/* ---------- exact win check ---------- */
function allMelds(c) {
  let i = 0; while (i < 34 && c[i] === 0) i++;
  if (i === 34) return true;
  if (c[i] >= 3) { c[i] -= 3; const ok = allMelds(c); c[i] += 3; if (ok) return true; }
  if (i < 27 && i % 9 <= 6 && c[i + 1] && c[i + 2]) {
    c[i]--; c[i + 1]--; c[i + 2]--; const ok = allMelds(c); c[i]++; c[i + 1]++; c[i + 2]++; if (ok) return true;
  }
  return false;
}
function isWinNormal(c) {
  if (sum(c) % 3 !== 2) return false;
  for (let i = 0; i < 34; i++) if (c[i] >= 2) {
    c[i] -= 2; const ok = allMelds(c); c[i] += 2; if (ok) return true;
  }
  return false;
}
function isSevenPairs(c, nm) {
  if (nm > 0 || sum(c) !== 14) return false;
  return c.every(x => x % 2 === 0);
}
function isWin(c, nm) { return isWinNormal(c) || isSevenPairs(c, nm); }
function winShape(c, nm) { return isWinNormal(c) ? 'normal' : (isSevenPairs(c, nm) ? 'qidui' : null); }

/* waits for a 13-type hand (counts c, nm exposed melds) */
function waitsOf(c, nm) {
  const res = [];
  for (let t = 0; t < 34; t++) {
    if (c[t] >= 4) continue;
    c[t]++; if (isWin(c, nm)) res.push(t); c[t]--;
  }
  return res;
}
function canWinTile(t, zimo) { const p = pts(t); return p >= 3 && (zimo || p >= 6); }
function canTingWith(waits) { return waits.some(w => pts(w) >= 6); }

/* ---------- RNG ---------- */
function mulberry32(a) {
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/* ---------- state ---------- */
function newRound(opts) {
  opts = opts || {};
  const dealer = opts.dealer || 0, rng = opts.rng || Math.random;
  const wall = [];
  for (let t = 0; t < 34; t++) for (let k = 0; k < 4; k++) wall.push(t);
  for (let i = wall.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const x = wall[i]; wall[i] = wall[j]; wall[j] = x; }
  const players = [0, 1, 2, 3].map(i => ({ name: SEAT_NAMES[i], hand: [], melds: [], discards: [], ting: false, waits: [], drawn: null }));
  let k = 0;
  for (let r = 0; r < 13; r++) for (let i = 0; i < 4; i++) players[(dealer + i) % 4].hand.push(wall[k++]);
  return { wall, front: k, back: 136, players, dealer, turn: dealer, scores: opts.scores || [0, 0, 0, 0],
    roundNo: opts.roundNo || 1, lastDiscard: null, result: null, kongs: 0 };
}
function remaining(st) { return st.back - st.front; }
function removeTiles(hand, t, n) {
  for (let k = 0; k < n; k++) { const i = hand.indexOf(t); if (i < 0) throw new Error('tile not in hand: ' + tname(t)); hand.splice(i, 1); }
}
function drawTile(st, p, fromBack) {
  if (remaining(st) <= 0) throw new Error('wall empty');
  const t = fromBack ? st.wall[--st.back] : st.wall[st.front++];
  const pl = st.players[p]; pl.hand.push(t); pl.drawn = t; st.turn = p;
  return t;
}
function visibleCounts(st, viewer) {
  const v = new Array(34).fill(0);
  st.players.forEach((pl, i) => {
    for (const d of pl.discards) if (!d.claimed) v[d.t]++;
    for (const m of pl.melds) v[m.tile] += (m.type === 'peng' ? 3 : 4);
    if (i === viewer) for (const t of pl.hand) v[t]++;
  });
  return v;
}
function remainingOf(st, viewer) { return visibleCounts(st, viewer).map(x => Math.max(0, 4 - x)); }

function selfOptions(st, p) {
  const pl = st.players[p], c = counts(pl.hand), nm = pl.melds.length, canKong = remaining(st) > 0;
  if (pl.ting) {
    return { ting: true, hu: pl.drawn != null && pl.waits.includes(pl.drawn) && canWinTile(pl.drawn, true), angang: [], bugang: [], tingOptions: [] };
  }
  const angang = [], bugang = [];
  if (canKong) {
    for (let t = 0; t < 34; t++) if (c[t] === 4) angang.push(t);
    for (const m of pl.melds) if (m.type === 'peng' && c[m.tile] > 0) bugang.push(m.tile);
  }
  const tingOptions = [];
  for (let t = 0; t < 34; t++) if (c[t] > 0) {
    c[t]--; const w = waitsOf(c, nm); c[t]++;
    if (canTingWith(w)) tingOptions.push({ tile: t, waits: w });
  }
  return { ting: false, hu: false, angang, bugang, tingOptions };
}
function claimOptions(st, q, t) {
  const pl = st.players[q], c = counts(pl.hand);
  const o = { hu: false, peng: false, gang: false };
  if (pl.ting) o.hu = pl.waits.includes(t) && canWinTile(t, false);
  else { o.peng = c[t] >= 2; o.gang = c[t] >= 3 && remaining(st) > 0; }
  return (o.hu || o.peng || o.gang) ? o : null;
}
function applyDiscard(st, p, t, ting) {
  const pl = st.players[p];
  removeTiles(pl.hand, t, 1);
  pl.discards.push({ t, afterTing: pl.ting, tingMark: !!ting, claimed: false });
  if (ting) { pl.ting = true; pl.waits = waitsOf(counts(pl.hand), pl.melds.length); }
  pl.drawn = null;
  st.lastDiscard = { p, t, idx: pl.discards.length - 1 };
}
function markClaimed(st) { const d = st.lastDiscard; st.players[d.p].discards[d.idx].claimed = true; }
function applyPeng(st, q, t) {
  const pl = st.players[q]; removeTiles(pl.hand, t, 2); markClaimed(st);
  pl.melds.push({ type: 'peng', tile: t, from: st.lastDiscard.p }); pl.drawn = null; st.turn = q;
}
function applyMingang(st, q, t) {
  const pl = st.players[q]; removeTiles(pl.hand, t, 3); markClaimed(st);
  pl.melds.push({ type: 'mingang', tile: t, from: st.lastDiscard.p }); st.kongs++; st.turn = q;
}
function applyAngang(st, p, t) {
  const pl = st.players[p]; removeTiles(pl.hand, t, 4);
  pl.melds.push({ type: 'angang', tile: t, from: p }); pl.drawn = null; st.kongs++;
}
function applyBugang(st, p, t) {
  const pl = st.players[p]; removeTiles(pl.hand, t, 1);
  const m = pl.melds.find(x => x.type === 'peng' && x.tile === t); m.type = 'bugang'; pl.drawn = null; st.kongs++;
}
function nextDealer(st, winner) { return winner === st.dealer ? st.dealer : (st.dealer + 1) % 4; }

/* scoring: score = tile points ×2 if 自摸, ×2 per 暗杠 of the winner.
   自摸: each of the 3 others pays score.
   点炮 by a player who had NOT 报听: discarder 包胡 — pays for all three (3×score).
   点炮 by a player who HAD 报听: 三家分摊 — each of the 3 others pays score. */
function computeScore(st, w, t, zimo, from) {
  const pl = st.players[w];
  const base = pts(t), ag = pl.melds.filter(m => m.type === 'angang').length;
  const mult = (zimo ? 2 : 1) * Math.pow(2, ag), score = base * mult;
  const pay = [0, 0, 0, 0]; let mode;
  if (zimo) { mode = 'zimo'; for (let i = 0; i < 4; i++) if (i !== w) pay[i] -= score; }
  else if (!st.players[from].ting) { mode = 'baohu'; pay[from] -= 3 * score; }
  else { mode = 'fentan'; for (let i = 0; i < 4; i++) if (i !== w) pay[i] -= score; }
  pay[w] = -(pay[0] + pay[1] + pay[2] + pay[3]) + pay[w];
  return { base, angang: ag, mult, score, pay, mode };
}
function settleWin(st, w, t, zimo, from) {
  const pl = st.players[w];
  if (!pl.ting) throw new Error('win without 报听');
  if (!canWinTile(t, zimo)) throw new Error('illegal win tile');
  if (!zimo) { pl.hand.push(t); markClaimed(st); }
  const c = counts(pl.hand);
  const shape = winShape(c, pl.melds.length);
  if (!shape) throw new Error('not a winning hand');
  const sc = computeScore(st, w, t, zimo, from);
  for (let i = 0; i < 4; i++) st.scores[i] += sc.pay[i];
  st.result = Object.assign({ type: 'win', winner: w, tile: t, zimo, from: zimo ? null : from, shape,
    fromTing: zimo ? null : st.players[from].ting, hand: pl.hand.slice().sort((a, b) => a - b),
    melds: pl.melds.map(m => Object.assign({}, m)), nextDealer: nextDealer(st, w) }, sc);
  return st.result;
}
function settleDraw(st) {
  st.result = { type: 'draw', pay: [0, 0, 0, 0], nextDealer: (st.dealer + 1) % 4 };
  return st.result;
}

/* ---------- round driver (async so UI can await human input) ---------- */
async function playRound(st, agents, hooks) {
  hooks = hooks || {};
  const ev = async e => { if (hooks.event) await hooks.event(e, st); };
  let p = st.dealer, mode = 'draw';
  for (;;) {
    st.turn = p;
    const pl = st.players[p];
    if (mode !== 'nodraw') {
      if (remaining(st) <= 0) { settleDraw(st); await ev({ type: 'end' }); return st.result; }
      const t = drawTile(st, p, mode === 'drawBack');
      await ev({ type: 'draw', p, t, fromBack: mode === 'drawBack' });
    } else pl.drawn = null;
    let discarded = null;
    for (;;) {
      const o = selfOptions(st, p);
      const a = await agents[p].selfTurn(st, p, o);
      if (a.type === 'hu') {
        if (!o.hu) throw new Error('illegal 自摸');
        settleWin(st, p, pl.drawn, true, null); await ev({ type: 'hu', p, zimo: true }); return st.result;
      }
      if (a.type === 'angang' || a.type === 'bugang') {
        if (!o[a.type].includes(a.tile)) throw new Error('illegal ' + a.type);
        if (a.type === 'angang') applyAngang(st, p, a.tile); else applyBugang(st, p, a.tile);
        await ev({ type: a.type, p, t: a.tile });
        if (remaining(st) <= 0) { settleDraw(st); await ev({ type: 'end' }); return st.result; }
        const t = drawTile(st, p, true);
        await ev({ type: 'draw', p, t, fromBack: true });
        continue;
      }
      if (a.type === 'discard') {
        if (!pl.hand.includes(a.tile)) throw new Error('discard not in hand');
        if (pl.ting && a.tile !== pl.drawn) throw new Error('报听后只能打摸到的牌');
        if (a.ting && !o.tingOptions.some(x => x.tile === a.tile)) throw new Error('illegal 报听');
        applyDiscard(st, p, a.tile, !!a.ting);
        await ev({ type: 'discard', p, t: a.tile, ting: !!a.ting });
        discarded = a.tile; break;
      }
      throw new Error('unknown action');
    }
    const t = discarded, claims = [];
    for (let k = 1; k <= 3; k++) { const q = (p + k) % 4; const o = claimOptions(st, q, t); if (o) claims.push({ q, o }); }
    let winner = null, pg = null;
    for (const { q, o } of claims.filter(x => x.o.hu)) {
      const r = await agents[q].claim(st, q, t, o);
      if (r === 'hu') { winner = q; break; }
      if ((r === 'peng' && o.peng) || (r === 'gang' && o.gang)) pg = pg || { q, type: r };
    }
    if (winner != null) { settleWin(st, winner, t, false, p); await ev({ type: 'hu', p: winner, zimo: false, from: p }); return st.result; }
    if (!pg) for (const { q, o } of claims.filter(x => !x.o.hu)) {
      const r = await agents[q].claim(st, q, t, o);
      if ((r === 'peng' && o.peng) || (r === 'gang' && o.gang)) { pg = { q, type: r }; break; }
    }
    if (pg) {
      if (pg.type === 'peng') applyPeng(st, pg.q, t); else applyMingang(st, pg.q, t);
      await ev({ type: pg.type, p: pg.q, t, from: p });
      p = pg.q; mode = pg.type === 'gang' ? 'drawBack' : 'nodraw';
      continue;
    }
    p = (p + 1) % 4; mode = 'draw';
  }
}

/* ---------- AI / hint evaluation ---------- */
function threatsFor(st, p) { return st.players.map((pl, i) => i).filter(i => i !== p && st.players[i].ting); }
function danger(st, p, t, vis, threats) {
  if (pts(t) < 6 || !threats.length) return 0; // 1–5点牌不能被点炮
  let d = 0;
  for (const q of threats) {
    const ds = st.players[q].discards;
    let dq;
    if (ds.some(x => x.t === t && x.afterTing)) dq = 0;      // 报听后打过的：绝对安全
    else if (ds.some(x => x.t === t)) dq = 2;                // 现物
    else if (t >= 27) dq = vis[t] >= 3 ? 1 : vis[t] === 2 ? 3 : 6;
    else dq = 6 + ((t % 9) >= 6 && (t % 9) <= 7 ? 1 : 0) - (vis[t] >= 3 ? 4 : 0);
    d = Math.max(d, dq);
  }
  return d;
}
function isIsolated(c, t) {
  if (c[t] !== 1) return false;
  if (t >= 27) return true;
  const r = t % 9;
  for (let d = -2; d <= 2; d++) { if (!d) continue; const rr = r + d; if (rr >= 0 && rr <= 8 && c[t + d]) return false; }
  return true;
}
// V6优化: 提升6-10点权重(可接炮),提升3-5点权重(自摸有价值)
function waitWeight(w) { 
  const p = pts(w); 
  return p >= 6 ? 1.5 + p / 10 : p >= 3 ? 0.8 : 0.15; 
}
function evalDiscards(st, p) {
  const pl = st.players[p], c = counts(pl.hand), nm = pl.melds.length;
  const vis = visibleCounts(st, p), rem = vis.map(x => Math.max(0, 4 - x));
  const threats = threatsFor(st, p);
  const cands = [];
  for (let t = 0; t < 34; t++) if (c[t] > 0) { c[t]--; cands.push({ tile: t, s: shanten(c, nm) }); c[t]++; }
  const minS = Math.min(...cands.map(x => x.s));
  const near = new Array(34).fill(false);
  for (let t = 0; t < 34; t++) if (c[t]) {
    near[t] = true;
    if (t < 27) { const r = t % 9; for (let d = -2; d <= 2; d++) { const rr = r + d; if (rr >= 0 && rr <= 8) near[t + d] = true; } }
  }
  for (const x of cands) {
    x.danger = danger(st, p, x.tile, vis, threats);
    x.isolated = isIsolated(c, x.tile);
    c[x.tile]--;
    if (x.s > minS + 1) { x.val = 0; x.ukeire = 0; x.kinds = 0; }
    else if (x.s === 0) {
      x.waits = waitsOf(c, nm); x.legal = canTingWith(x.waits);
      x.ukeire = x.waits.reduce((a, w) => a + rem[w], 0); x.kinds = x.waits.length;
      // V6优化: 多面听额外奖励
      const multiBonus = x.kinds >= 3 ? 20 : x.kinds === 2 ? 10 : 0;
      // V6优化: 早期报听激励(剩余牌多时更激进)
      const remainingTiles = remaining(st);
      const earlyTingBonus = x.legal ? (remainingTiles > 40 ? 15 : remainingTiles > 30 ? 10 : 5) : 0;
      x.val = x.legal ? 60 + x.waits.reduce((a, w) => a + rem[w] * waitWeight(w) * 4, 0) + multiBonus + earlyTingBonus : 10 + x.ukeire;
    } else {
      let u = 0, k = 0, u6 = 0;
      for (let y = 0; y < 34; y++) if (near[y] && c[y] < 4 && rem[y] > 0) {
        c[y]++; if (shanten(c, nm) < x.s) { u += rem[y]; k++; if (pts(y) >= 6) u6 += rem[y]; } c[y]--;
      }
      x.ukeire = u; x.kinds = k; x.val = u + u6 * 0.25;
    }
    c[x.tile]++;
    const tp = pts(x.tile);
    let bias = 0;
    if (x.isolated && x.tile >= 27) bias += 3;
    else if (x.isolated && (tp === 1 || tp === 9)) bias += 2;
    else if (x.isolated) bias += 1;
    if (tp <= 2) bias += 1.5; else if (tp >= 6 && x.tile < 27) bias -= 1;
    x.bias = bias;
    const defW = threats.length ? (minS >= 2 ? 120 : minS === 1 ? 40 : 10) : 0;
    x.total = -x.s * 100 + x.val + bias - x.danger * defW;
  }
  cands.sort((a, b) => b.total - a.total);
  return cands;
}
function bestAfterRemoval(st, p, c, nm) {
  // best shanten after discarding one tile from counts c
  let b = 99;
  for (let t = 0; t < 34; t++) if (c[t]) { c[t]--; b = Math.min(b, shanten(c, nm)); c[t]++; }
  return b;
}
const AI = {
  selfTurn(st, p, o) {
    const pl = st.players[p];
    if (pl.ting) return o.hu ? { type: 'hu' } : { type: 'discard', tile: pl.drawn };
    const c = counts(pl.hand), nm = pl.melds.length;
    if (o.angang.length || o.bugang.length) {
      const cur = bestAfterRemoval(st, p, c, nm);
      for (const t of o.angang) { c[t] -= 4; const s = shanten(c, nm + 1); c[t] += 4; if (s <= cur) return { type: 'angang', tile: t }; }
      for (const t of o.bugang) { c[t] -= 1; const s = shanten(c, nm); c[t] += 1; if (s <= cur) return { type: 'bugang', tile: t }; }
    }
    const ev = evalDiscards(st, p), best = ev[0];
    const ting = o.tingOptions.some(x => x.tile === best.tile);
    return { type: 'discard', tile: best.tile, ting };
  },
  claim(st, q, t, o) {
    if (o.hu) return 'hu';
    const pl = st.players[q], c = counts(pl.hand), nm = pl.melds.length;
    const s0 = shanten(c, nm);
    if (o.gang) { c[t] -= 3; const s = shanten(c, nm + 1); c[t] += 3; if (s <= s0) return 'gang'; }
    if (o.peng) {
      // V6优化: 改为1向听才放弃碰牌(原来是2向听)
      if (threatsFor(st, q).length && s0 >= 1) return 'pass';
      c[t] -= 2; const s = bestAfterRemoval(st, q, c, nm + 1); c[t] += 2;
      if (s < s0) return 'peng';
    }
    return 'pass';
  }
};

const api = { SUITS, HONORS, NUMS, SEAT_NAMES, pts, tname, counts, shanten, shantenNormal, shantenChiitoi, isWin, isWinNormal,
  isSevenPairs, winShape, waitsOf, canWinTile, canTingWith, mulberry32, newRound, remaining, drawTile, visibleCounts, remainingOf,
  selfOptions, claimOptions, applyDiscard, applyPeng, applyMingang, applyAngang, applyBugang, computeScore, settleWin, settleDraw,
  playRound, evalDiscards, threatsFor, isIsolated, AI };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.KDD = api;
})(globalThis);
