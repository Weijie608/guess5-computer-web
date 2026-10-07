export const LENGTH = 5;
export const CODE_COUNT = 30240;
export const WIN_FEEDBACK = 35;
export class FeedbackError extends Error {}
export class InconsistentFeedbackError extends FeedbackError {}
export class StrategyDataError extends Error {}

let codebook;
export function buildCodes() {
  if (!codebook) {
    const codes = [];
    function append(prefix, used) {
      if (prefix.length === LENGTH) { codes.push(prefix); return; }
      for (let digit = 0; digit < 10; digit += 1) {
        if (!(used & (1 << digit))) append(prefix + digit, used | (1 << digit));
      }
    }
    append("", 0);
    codebook = Object.freeze(codes);
  }
  return codebook;
}

export function feedbackCode(r, s) { return r * 6 + s; }
export function isGloballyValidFeedback(r, s) {
  return Number.isInteger(r) && Number.isInteger(s) &&
    r >= 0 && r <= s && s <= LENGTH && !(r === 4 && s === 5);
}
export function scoreCodes(secret, guess) {
  let r = 0, s = 0;
  for (let i = 0; i < LENGTH; i += 1) {
    if (secret[i] === guess[i]) r += 1;
    if (secret.includes(guess[i])) s += 1;
  }
  return { r, s };
}

export class FrozenStrategyGame {
  constructor(strategy) {
    if (strategy?.schema !== 1 || strategy?.codeLength !== LENGTH ||
        strategy?.codeCount !== CODE_COUNT || !Array.isArray(strategy.nodes) ||
        strategy.root !== 0 || strategy.nodes[0]?.[1] !== CODE_COUNT) {
      throw new StrategyDataError("The five-digit strategy data is incompatible.");
    }
    this.strategy = strategy;
    this.codes = buildCodes();
    this.reset();
  }

  reset() {
    this.nodeIndex = this.strategy.root;
    this.guesses = 0;
    this.done = false;
    this.secret = null;
    this.identifiedAfter = null;
    this.history = [];
    return this.snapshot();
  }

  currentNode() {
    // A negative target is a known singleton, still requiring a winning guess.
    if (this.nodeIndex < 0) {
      const id = -this.nodeIndex - 1;
      if (!this.codes[id]) throw new StrategyDataError("Invalid singleton code.");
      return [id, 1, [WIN_FEEDBACK, this.nodeIndex]];
    }
    const node = this.strategy.nodes[this.nodeIndex];
    if (!node || !this.codes[node[0]]) throw new StrategyDataError("Missing strategy decision.");
    return node;
  }

  snapshot() {
    const node = this.currentNode();
    return { done: this.done, guesses: this.guesses,
      nextGuessNumber: this.done ? this.guesses : this.guesses + 1,
      guessId: node[0], guess: this.codes[node[0]], candidateCount: node[1],
      identifiedAfter: this.identifiedAfter, secret: this.secret };
  }

  submitFeedback(r, s) {
    if (this.done) throw new FeedbackError("This round is complete. Start over to play again.");
    if (!isGloballyValidFeedback(r, s)) {
      throw new FeedbackError("That answer is impossible: use 0 ≤ r ≤ s ≤ 5, excluding 4r 5s.");
    }
    const before = this.snapshot();
    const label = feedbackCode(r, s);
    const edges = this.currentNode()[2];
    let target = null;
    for (let i = 0; i < edges.length; i += 2) {
      if (edges[i] === label) { target = edges[i + 1]; break; }
    }
    if (target === null) {
      throw new InconsistentFeedbackError(
        "That answer leaves no possible code. Check this score, or undo an earlier answer.");
    }
    if (!Number.isInteger(target) || (target < 0 ? !this.codes[-target - 1] : !this.strategy.nodes[target])) {
      throw new StrategyDataError("The strategy has a damaged transition.");
    }
    if (label === WIN_FEEDBACK && target !== -(before.guessId + 1)) {
      throw new StrategyDataError("The winning transition is damaged.");
    }
    const event = { guessNumber: this.guesses + 1, guess: before.guess, r, s,
      candidateCountBefore: before.candidateCount,
      candidateCountAfter: target < 0 ? 1 : this.strategy.nodes[target][1],
      nodeBefore: this.nodeIndex, identifiedBefore: this.identifiedAfter,
      done: label === WIN_FEEDBACK };
    // Commit only after validating the entire transition.
    this.guesses += 1;
    this.nodeIndex = target;
    if (target < 0 && this.identifiedAfter === null) this.identifiedAfter = this.guesses;
    this.done = event.done;
    this.secret = this.done ? before.guess : null;
    event.identifiedAfter = this.identifiedAfter;
    event.secret = this.secret;
    this.history.push(event);
    return event;
  }

  undo() {
    const event = this.history.pop();
    if (!event) return false;
    this.nodeIndex = event.nodeBefore;
    this.identifiedAfter = event.identifiedBefore;
    this.guesses -= 1;
    this.done = false;
    this.secret = null;
    return true;
  }
}
