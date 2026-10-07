# Strategy Provenance and Browser Format

The five-digit strategy is the frozen `optimized_20260925_052028` result copied
into `BaC5_pub`. Its development history is in
[Weijie608/Bulls-and-Cows](https://github.com/Weijie608/Bulls-and-Cows/tree/main/guess5).
The interface and exporter structure are adapted from
[Weijie608/guess4-web](https://github.com/Weijie608/guess4-web). The four-digit
policy is not used by this page.

## Frozen source hashes

| Source file | SHA-256 |
| --- | --- |
| `guess5_optimized.sqlite3` | `4d6def8c83e4583348f0168237f8dbc651303906cf64ba9878050c35c1c56c35` |
| `guess5_optimized_steps.txt` | `1ca801bbc9e2e1005e9b78dbb09d90422accfdd4b9b4ded70ff65ec6ff7f3102` |

The source database has 8,600 non-singleton decisions and all 30,240 singleton
decisions. The exporter verifies the hashes above before generating an output.
Regeneration is deterministic and does not run the historical optimization
search. The browser export has 8,600 decision nodes and is 451,863 bytes.

## Browser representation

`strategy-data.js` exports a `STRATEGY` object using an ES module. Its header
contains the schema, policy label, code length and count, root index, source
hashes, codebook hash, success total, maximum and distribution.

`nodes` is an array; the root is index 0. A node is:

```text
[guessId, candidateCount, [feedbackCode, target, feedbackCode, target, ...]]
```

The canonical codebook contains the lexicographically ordered permutations of
five distinct characters from `0123456789`. Code IDs range from 0 to 30,239.
Leading zeroes are preserved. `feedbackCode = 6 * r + s`, and the winning code
is 35. Only non-empty feedback branches are stored.

A nonnegative target is another non-singleton node index. A negative target
encodes the sole remaining candidate: `secretId = -target - 1`. If the answer
was `5r 5s`, the game has succeeded. Otherwise, the engine immediately ends the
round and reveals the singleton. The result counts the actual identification
guesses separately from the strict-success total, which includes one additional
exact guess that the interface does not ask the player to confirm.

The strategy can choose a guess outside the current candidate set. It only
defines states reachable from the full universe, not every arbitrary subset.

## Independent checks

The Python exporter recomputes feedback from digit positions and set
intersections, reconstructs branches from the database, and compares all
30,240 per-secret results with the original results file. The JavaScript test
separately drives every secret through the browser engine until identification
and computes its strict-success count, adding a final exact guess only when the
last feedback was not `5r 5s`. It hashes the canonical lines
`<secret> <success_count>\n` in codebook order. The hash must equal the original
result hash above. The interface stopping rule does not change the frozen policy.

For this policy, the maximum success count is 7, the maximum identification
count is 6, and the mean success count for a uniform secret is 171689/30240.
These are measurements of this policy, not proofs of global optimality.
