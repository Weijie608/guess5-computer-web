import { FeedbackError, FrozenStrategyGame, isGloballyValidFeedback } from "./engine.js";

const $ = (id) => document.getElementById(id);
let game = null;
let selectedR = null;
let selectedS = null;

function digits(code, className = "digit-tile") {
  const fragment = document.createDocumentFragment();
  for (const digit of code) {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = digit;
    fragment.append(span);
  }
  return fragment;
}

function renderChoices() {
  for (const [id, selected, other, isR] of [
    ["r-choices", selectedR, selectedS, true], ["s-choices", selectedS, selectedR, false],
  ]) {
    for (const button of $(id).querySelectorAll("button")) {
      const value = Number(button.dataset.value);
      button.disabled = !game || game.done || (other !== null &&
        !isGloballyValidFeedback(isR ? value : other, isR ? other : value));
      button.setAttribute("aria-pressed", String(value === selected));
    }
  }
  $("submit-feedback").disabled = !game || game.done || selectedR === null || selectedS === null;
  $("clear-feedback").disabled = !game || game.done;
}

function clearSelection() {
  selectedR = selectedS = null;
  $("feedback-error").textContent = "";
  renderChoices();
}

function renderHistory() {
  const items = document.createDocumentFragment();
  for (const event of [...game.history].reverse()) {
    const li = document.createElement("li");
    li.className = "history-item";
    const number = document.createElement("span");
    number.className = "history-number";
    number.textContent = String(event.guessNumber).padStart(2, "0");
    const summary = document.createElement("div");
    summary.className = "history-summary";
    const code = document.createElement("div");
    code.className = "history-code";
    code.setAttribute("aria-label", `Guess ${event.guess}`);
    code.append(digits(event.guess, "history-digit"));
    const count = document.createElement("small");
    count.textContent = event.done ?
      (event.completionKind === "exact" ? "Exact match" : "Code determined") :
      `${event.candidateCountAfter.toLocaleString("en-US")} remaining`;
    summary.append(code, count);
    const feedback = document.createElement("span");
    feedback.className = "history-feedback";
    feedback.setAttribute("aria-label", `${event.r} r, ${event.s} s`);
    for (const key of ["r", "s"]) {
      const value = document.createElement("strong");
      value.className = `feedback-${key}`;
      value.textContent = `${event[key]}${key}`;
      feedback.append(value);
    }
    li.append(number, summary, feedback);
    items.append(li);
  }
  $("history-list").replaceChildren(items);
  $("history-list").start = game.guesses || 1;
  $("history-caption").textContent = game.guesses ?
    `${game.guesses} ${game.guesses === 1 ? "answer" : "answers"}` : "No feedback yet";
}

function render() {
  const state = game.snapshot();
  $("step-count").textContent = state.nextGuessNumber;
  $("candidate-count").textContent = state.candidateCount.toLocaleString("en-US");
  $("computer-guess").replaceChildren(digits(state.guess));
  $("computer-guess").setAttribute("aria-label", `${state.done ? "Your code" : "Computer guess"} ${state.guess.split("").join(" ")}`);
  $("feedback-form").hidden = state.done;
  $("result-panel").hidden = !state.done;
  $("new-game").disabled = false;
  $("stage-label").textContent = state.done ? "Your code" : "My guess";
  if (state.done) {
    const exact = state.completionKind === "exact";
    $("result-panel").dataset.state = exact ? "exact" : "identified";
    $("status").textContent = exact ? "Exact match — 5r 5s." : "Only one possible code remains.";
    $("result-kicker").textContent = exact ? "Your code, correctly guessed" : "Your code must be";
    $("result-copy").textContent = exact ?
      `Guessed correctly in ${state.guesses} ${state.guesses === 1 ? "guess" : "guesses"}. Your answer confirmed all five digits and positions.` :
      `Determined after ${state.identifiedAfter} ${state.identifiedAfter === 1 ? "guess" : "guesses"}. ` +
      `An extra exact guess would make the success count ${state.successfulGuessCount}.`;
  } else {
    $("status").textContent = state.guesses === 0 ?
      "Hold your secret in mind. Score my first guess." :
      `I narrowed it to ${state.candidateCount.toLocaleString("en-US")} possible codes.`;
  }
  renderChoices();
  renderHistory();
}

for (const [id, isR] of [["r-choices", true], ["s-choices", false]]) {
  $(id).addEventListener("click", (event) => {
    const button = event.target.closest("button[data-value]");
    if (!button || button.disabled || !game) return;
    const value = Number(button.dataset.value);
    if (isR) selectedR = selectedR === value ? null : value;
    else selectedS = selectedS === value ? null : value;
    $("feedback-error").textContent = "";
    renderChoices();
  });
}
$("clear-feedback").addEventListener("click", clearSelection);
$("new-game").addEventListener("click", () => {
  if (!game) return;
  game.reset(); clearSelection(); render();
});
$("feedback-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!game || selectedR === null || selectedS === null) return;
  try {
    game.submitFeedback(selectedR, selectedS);
    clearSelection(); render();
    if (!game.done) $("r-choices").querySelector("button:not(:disabled)").focus({ preventScroll: true });
    else $("new-game").focus({ preventScroll: true });
  } catch (error) {
    $("feedback-error").textContent = error instanceof FeedbackError ? error.message :
      "The strategy could not continue. Reload the page and try again.";
  }
});
$("retry-load").addEventListener("click", () => location.reload());

try {
  const { STRATEGY } = await import("./strategy-data.js");
  game = new FrozenStrategyGame(STRATEGY);
  render();
} catch {
  $("status").textContent = "The strategy could not be loaded.";
  $("feedback-error").textContent = "Reload the page. For local play, use the HTTP server command in the README.";
  $("retry-load").hidden = false;
}
