#!/usr/bin/env python3
"""Read BaC5_pub without changes; export and verify the five-digit browser tree."""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import zlib
from collections import Counter, deque
from itertools import permutations
from pathlib import Path


POLICY = "guess5_optimized_20260925_052028"
SNAPSHOT = "optimized_20260925_052028"
LENGTH = 5
N_CODES = 30_240
BITSET_BYTES = (N_CODES + 7) // 8
DATABASE_SHA256 = "4d6def8c83e4583348f0168237f8dbc651303906cf64ba9878050c35c1c56c35"
RESULT_SHA256 = "1ca801bbc9e2e1005e9b78dbb09d90422accfdd4b9b4ded70ff65ec6ff7f3102"


def parse_args() -> argparse.Namespace:
    web_root = Path(__file__).resolve().parents[1]
    project_root = web_root.parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--database",
        type=Path,
        default=project_root / "BaC5_pub" / SNAPSHOT / "guess5_optimized.sqlite3",
    )
    parser.add_argument(
        "--reference",
        type=Path,
        default=project_root / "BaC5_pub" / SNAPSHOT / "guess5_optimized_steps.txt",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=web_root / "strategy-data.js",
    )
    parser.add_argument("--check", action="store_true", help="verify that the existing export matches; write nothing")
    return parser.parse_args()


def build_codes() -> list[str]:
    return ["".join(code) for code in permutations("0123456789", LENGTH)]


def feedback_code(secret: str, guess: str) -> int:
    r = sum(a == b for a, b in zip(secret, guess))
    s = len(set(secret) & set(guess))
    return r * 6 + s


def encode_candidates(candidate_ids: list[int]) -> bytes:
    value = 0
    for candidate_id in candidate_ids:
        value |= 1 << candidate_id
    return value.to_bytes(BITSET_BYTES, "little")


def decode_candidates(raw: bytes) -> list[int]:
    value = int.from_bytes(raw, "little")
    result: list[int] = []
    while value:
        lowest = value & -value
        result.append(lowest.bit_length() - 1)
        value ^= lowest
    return result


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_database(path: Path) -> tuple[dict[bytes, tuple[int, int]], dict[str, str]]:
    if not path.is_file():
        raise FileNotFoundError(f"Strategy database not found: {path}")
    connection = sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True)
    try:
        if connection.execute("PRAGMA quick_check").fetchone()[0] != "ok":
            raise RuntimeError("SQLite quick_check failed")
        metadata = dict(connection.execute("SELECT key, value FROM metadata"))
        records: dict[bytes, tuple[int, int]] = {}
        rows = connection.execute(
            "SELECT state_hash, candidate_bits_z, candidate_count, guess_id "
            "FROM strategy"
        )
        for state_hash, compressed, count, guess_id in rows:
            raw = zlib.decompress(compressed)
            if len(raw) != BITSET_BYTES:
                raise RuntimeError("A cached candidate bitset has the wrong length")
            if hashlib.sha256(raw).digest() != state_hash:
                raise RuntimeError("A cached candidate bitset failed SHA-256 verification")
            if sum(byte.bit_count() for byte in raw) != count:
                raise RuntimeError("A cached candidate count is incorrect")
            if not 1 <= count <= N_CODES or not 0 <= guess_id < N_CODES or raw in records:
                raise RuntimeError("Invalid or duplicate strategy record")
            if count == 1 and decode_candidates(raw) != [guess_id]:
                raise RuntimeError("A singleton does not guess its only candidate")
            records[raw] = (count, guess_id)
        if int(metadata["record_count"]) != len(records):
            raise RuntimeError("Database record count mismatch")
        return records, metadata
    finally:
        connection.close()


def build_tree(
    records: dict[bytes, tuple[int, int]], codes: list[str]
) -> tuple[list[list[object]], set[int]]:
    root = encode_candidates(list(range(N_CODES)))
    if root not in records:
        raise RuntimeError("The full 30,240-code root is missing from the database")

    decision_records = {raw: row for raw, row in records.items() if row[0] > 1}
    indices = {root: 0}
    queue: deque[bytes] = deque([root])
    nodes: list[list[object] | None] = [None]
    leaf_ids: set[int] = set()

    while queue:
        raw = queue.popleft()
        node_index = indices[raw]
        count, guess_id = decision_records[raw]
        candidate_ids = decode_candidates(raw)
        if len(candidate_ids) != count:
            raise RuntimeError("Decoded candidate count mismatch")

        buckets: dict[int, list[int]] = {}
        guess = codes[guess_id]
        for secret_id in candidate_ids:
            label = feedback_code(codes[secret_id], guess)
            buckets.setdefault(label, []).append(secret_id)

        transitions: list[int] = []
        for label, child_ids in sorted(buckets.items()):
            if len(child_ids) >= count:
                raise RuntimeError("The decision makes no progress")
            if len(child_ids) == 1:
                secret_id = child_ids[0]
                target = -(secret_id + 1)
                leaf_ids.add(secret_id)
            else:
                child_raw = encode_candidates(child_ids)
                if child_raw not in decision_records:
                    raise RuntimeError(
                        f"Missing non-singleton child for node {node_index}, feedback {label}"
                    )
                if child_raw not in indices:
                    indices[child_raw] = len(nodes)
                    nodes.append(None)
                    queue.append(child_raw)
                target = indices[child_raw]
            transitions.extend((label, target))

        nodes[node_index] = [guess_id, count, transitions]

    if len(indices) != len(decision_records):
        raise RuntimeError(
            f"Only {len(indices)} of {len(decision_records)} decision states are reachable"
        )
    if any(node is None for node in nodes):
        raise RuntimeError("The exported tree contains an unfilled node")
    return [node for node in nodes if node is not None], leaf_ids


def verify_tree(
    nodes: list[list[object]], codes: list[str], reference_path: Path
) -> tuple[dict[int, int], str]:
    expected: dict[str, int] = {}
    for line in reference_path.read_text(encoding="ascii").splitlines():
        code, step = line.split()
        if code in expected:
            raise RuntimeError("Duplicate reference secret")
        expected[code] = int(step)
    if set(expected) != set(codes):
        raise RuntimeError(f"Expected {N_CODES} reference rows, got {len(expected)}")

    actual: dict[str, int] = {}
    for secret_id, secret in enumerate(codes):
        node_index = 0
        guesses = 0
        while True:
            if guesses >= 7:
                raise RuntimeError(f"Strategy did not succeed within seven guesses for {secret}")
            guess_id, _count, transitions = nodes[node_index]
            guesses += 1
            label = feedback_code(secret, codes[guess_id])
            targets = dict(zip(transitions[::2], transitions[1::2]))
            if label not in targets:
                raise RuntimeError(f"No transition for secret {secret} at node {node_index}")
            target = targets[label]
            if label == 35:
                if guess_id != secret_id or target != -(secret_id + 1):
                    raise RuntimeError("Invalid exact-match transition")
                actual[secret] = guesses
                break
            if target < 0:
                if -target - 1 != secret_id:
                    raise RuntimeError("A singleton transition identifies the wrong secret")
                actual[secret] = guesses + 1
                break
            node_index = target

    if actual != expected:
        mismatches = [
            code for code in codes if actual.get(code) != expected.get(code)
        ]
        raise RuntimeError(f"Export disagrees with {len(mismatches)} reference rows")
    distribution = dict(sorted(Counter(actual.values()).items()))
    return distribution, sha256(reference_path)


def main() -> None:
    args = parse_args()
    if sha256(args.database) != DATABASE_SHA256 or sha256(args.reference) != RESULT_SHA256:
        raise RuntimeError("Source files differ from the frozen BaC5_pub snapshot")
    if args.output.resolve() in (args.database.resolve(), args.reference.resolve()):
        raise RuntimeError("Output must not replace a source file")
    codes = build_codes()
    records, metadata = load_database(args.database)
    codebook_hash = hashlib.sha256("".join(code + "\n" for code in codes).encode("ascii")).hexdigest()
    if metadata.get("codebook_sha256") != codebook_hash:
        raise RuntimeError("Codebook hash mismatch")
    nodes, leaf_ids = build_tree(records, codes)
    distribution, result_hash = verify_tree(nodes, codes, args.reference)
    if metadata.get("results_sha256") != result_hash:
        raise RuntimeError("Database and reference result hashes disagree")
    if leaf_ids != set(range(N_CODES)):
        raise RuntimeError(f"Only {len(leaf_ids)} of {N_CODES} secrets appear as leaves")

    payload = {
        "schema": 1,
        "policy": POLICY,
        "codeLength": LENGTH,
        "codeCount": N_CODES,
        "root": 0,
        "resultSha256": result_hash,
        "databaseSha256": sha256(args.database),
        "codebookSha256": codebook_hash,
        "totalSuccessCount": sum(step * count for step, count in distribution.items()),
        "maxSuccessCount": max(distribution),
        "stepDistribution": distribution,
        "nodes": nodes,
    }
    encoded = "export const STRATEGY=" + json.dumps(
        payload, separators=(",", ":"), ensure_ascii=True
    ) + ";\n"
    if payload["totalSuccessCount"] != 171689 or payload["maxSuccessCount"] != 7:
        raise RuntimeError("Unexpected strategy performance")
    if args.check:
        if args.output.read_bytes() != encoded.encode("ascii"):
            raise RuntimeError("Browser export differs from the verified source")
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        temporary = args.output.with_name(args.output.name + ".tmp")
        temporary.write_bytes(encoded.encode("ascii"))
        temporary.replace(args.output)

    print(f"output={args.output.resolve()}")
    print(f"nodes={len(nodes)}")
    print(f"leaves={len(leaf_ids)}")
    print(f"distribution={distribution}")
    print(f"result_sha256={result_hash}")
    print(f"output_bytes={args.output.stat().st_size}")
    print(f"output_sha256={sha256(args.output)}")


if __name__ == "__main__":
    main()
