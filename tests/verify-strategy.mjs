import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { STRATEGY } from "../strategy-data.js";
import {
  buildCodes, feedbackCode, scoreCodes, isGloballyValidFeedback,
  FrozenStrategyGame, FeedbackError, InconsistentFeedbackError, StrategyDataError,
} from "../engine.js";

const codes = buildCodes();
assert.equal(codes.length, 30240);
assert.equal(new Set(codes).size, 30240);
assert.equal(codes[0], "01234");
assert.equal(codes.at(-1), "98765");
assert.equal(STRATEGY.nodes.length, 8600);
assert.equal(STRATEGY.databaseSha256, "4d6def8c83e4583348f0168237f8dbc651303906cf64ba9878050c35c1c56c35");
assert.deepEqual(scoreCodes("01234", "01567"), { r: 2, s: 2 });

// Compute feedback independently of the function exposed by the browser engine.
function answer(secret, guess) {
  return { r: [...secret].filter((digit, i) => digit === guess[i]).length,
    s: [...secret].filter((digit) => guess.includes(digit)).length };
}
const distribution = {}, identifiedDistribution = {};
const hash = createHash("sha256");
const nodeVisits = new Map();
let total = 0, maximum = 0, identificationMaximum = 0, pendingFinalGuesses = 0;
for (const secret of codes) {
  const game = new FrozenStrategyGame(STRATEGY);
  for (let guard = 0; guard < 7 && !game.done; guard += 1) {
    const before = game.snapshot();
    if (game.nodeIndex >= 0) nodeVisits.set(game.nodeIndex, (nodeVisits.get(game.nodeIndex) ?? 0) + 1);
    if (before.candidateCount === 1) {
      assert.equal(game.done, false);
      assert.equal(before.guess, secret);
      pendingFinalGuesses += 1;
    }
    const { r, s } = answer(secret, before.guess);
    const result = game.submitFeedback(r, s);
    assert.equal(result.done, r === 5 && s === 5);
  }
  assert.equal(game.done, true, `Not solved within seven guesses: ${secret}`);
  assert.equal(game.secret, secret);
  assert.equal(game.history.length, game.guesses);
  assert.equal(game.history.at(-1).r, 5);
  assert.equal(game.history.at(-1).s, 5);
  assert.ok(game.identifiedAfter === game.guesses || game.identifiedAfter === game.guesses - 1);
  hash.update(`${secret} ${game.guesses}\n`, "ascii");
  distribution[game.guesses] = (distribution[game.guesses] ?? 0) + 1;
  identifiedDistribution[game.identifiedAfter] = (identifiedDistribution[game.identifiedAfter] ?? 0) + 1;
  total += game.guesses;
  maximum = Math.max(maximum, game.guesses);
  identificationMaximum = Math.max(identificationMaximum, game.identifiedAfter);
}
const actualHash = hash.digest("hex");
assert.equal(actualHash, "1ca801bbc9e2e1005e9b78dbb09d90422accfdd4b9b4ded70ff65ec6ff7f3102");
assert.equal(actualHash, STRATEGY.resultSha256);
assert.deepEqual(distribution, { 1: 1, 2: 5, 3: 110, 4: 1753, 5: 9508, 6: 15245, 7: 3618 });
assert.deepEqual(distribution, STRATEGY.stepDistribution);
assert.deepEqual(identifiedDistribution, { 1: 1, 2: 14, 3: 573, 4: 6541, 5: 17151, 6: 5960 });
assert.equal(total, 171689);
assert.equal(maximum, 7);
assert.equal(identificationMaximum, 6);
assert.equal(pendingFinalGuesses, 22262);
assert.equal(nodeVisits.size, STRATEGY.nodes.length);
for (const [id, count] of nodeVisits) assert.equal(count, STRATEGY.nodes[id][1]);

let globalPairCount = 0;
for (let r = 0; r <= 5; r += 1) for (let s = 0; s <= 5; s += 1) {
  if (isGloballyValidFeedback(r, s)) globalPairCount += 1;
}
assert.equal(globalPairCount, 20);
const invalid = new FrozenStrategyGame(STRATEGY);
const initial = invalid.snapshot();
for (const [r, s] of [[4, 5], [3, 2], [-1, 0], [0, 6], [1.5, 2], ["0", 0], [NaN, 1]]) {
  assert.throws(() => invalid.submitFeedback(r, s), FeedbackError);
  assert.deepEqual(invalid.snapshot(), initial);
}
invalid.submitFeedback(0, 0);
const stateBeforeError = invalid.snapshot();
const edges = STRATEGY.nodes[invalid.nodeIndex][2];
const available = new Set(edges.filter((_, i) => i % 2 === 0));
let inconsistentChecked = false;
for (let r = 0; r <= 5 && !inconsistentChecked; r += 1) for (let s = 0; s <= 5; s += 1) {
  if (isGloballyValidFeedback(r, s) && !available.has(feedbackCode(r, s))) {
    assert.throws(() => invalid.submitFeedback(r, s), InconsistentFeedbackError);
    assert.deepEqual(invalid.snapshot(), stateBeforeError);
    assert.equal(invalid.history.length, 1);
    inconsistentChecked = true;
    break;
  }
}
assert.equal(inconsistentChecked, true);

const undoGame = new FrozenStrategyGame(STRATEGY);
const undoStates = [];
while (!undoGame.done) {
  undoStates.push(undoGame.snapshot());
  const { r, s } = answer("98765", undoGame.snapshot().guess);
  undoGame.submitFeedback(r, s);
}
while (undoStates.length) {
  assert.equal(undoGame.undo(), true);
  assert.deepEqual(undoGame.snapshot(), undoStates.pop());
}
assert.equal(undoGame.undo(), false);
undoGame.submitFeedback(5, 5);
assert.equal(undoGame.secret, "01234");
assert.equal(undoGame.guesses, 1);
assert.throws(() => undoGame.submitFeedback(5, 5), FeedbackError);
undoGame.undo();
assert.deepEqual(undoGame.snapshot(), initial);
undoGame.submitFeedback(0, 0);
assert.deepEqual(undoGame.reset(), initial);

const singleton = new FrozenStrategyGame(STRATEGY);
while (singleton.snapshot().candidateCount > 1 && !singleton.done) {
  const { r, s } = answer("01235", singleton.snapshot().guess);
  singleton.submitFeedback(r, s);
}
assert.equal(singleton.done, false);
const pending = singleton.snapshot();
assert.equal(pending.guess, "01235");
assert.throws(() => singleton.submitFeedback(0, 0), InconsistentFeedbackError);
assert.deepEqual(singleton.snapshot(), pending);
singleton.submitFeedback(5, 5);
assert.equal(singleton.done, true);
assert.equal(singleton.guesses, pending.guesses + 1);
assert.equal(singleton.identifiedAfter, pending.guesses);
assert.throws(() => new FrozenStrategyGame({ ...STRATEGY, codeLength: 4 }), StrategyDataError);
const damaged = { ...STRATEGY, nodes: [[0, 30240, [35, -2]]] };
const damagedGame = new FrozenStrategyGame(damaged);
assert.throws(() => damagedGame.submitFeedback(5, 5), StrategyDataError);
assert.equal(damagedGame.guesses, 0);

console.log(JSON.stringify({ status: "PASS", secrets: codes.length, decisionNodes: nodeVisits.size,
  maximumSuccessCount: maximum, maximumIdentificationCount: identificationMaximum,
  totalSuccessCount: total, meanSuccessCount: total / codes.length,
  resultSha256: actualHash, explicitFinalSingletonGuesses: pendingFinalGuesses,
  checks: ["all secrets", "invalid feedback", "inconsistent feedback", "undo", "reset", "strict success", "damaged data"] }, null, 2));
