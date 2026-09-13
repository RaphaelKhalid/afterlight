#!/usr/bin/env python3
"""Reproduce descriptive Afterlight results from append-only v3 recovery ledgers.

Reads v3-heldout-raw.jsonl, v3.1-recovery-raw.jsonl, and an optional
v3.2-recovery-raw.jsonl. It never calls a provider. The output is a review
JSON with subject missingness, case-clustered choice deltas, and monitor
missingness/attributions. Repeated seeds stay paired within case.
"""
from __future__ import annotations
import hashlib, json, random
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve()
ART = HERE.parents[1] / "artifacts" / "experiment"
CONDITIONS = ["baseline", "implicit", "explicit", "neutral_control", "relevant_positive"]

def read_json(name):
    p = ART / name
    return json.loads(p.read_text(encoding="utf8")) if p.exists() else None

def read_jsonl(name):
    p = ART / name
    if not p.exists():
        return []
    return [json.loads(line) for line in p.read_text(encoding="utf8").splitlines() if line.strip()]

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None

def key(row):
    try:
        return (row["caseId"], row["condition"], int(row["seed"]))
    except (KeyError, TypeError, ValueError):
        return None

def is_valid_subject(row):
    return row.get("kind") == "subject" and row.get("status") == "completed" and row.get("choice") in {"A", "B"}

def merge_subjects(original, recovery31, recovery32):
    """Return one latest subject record per case/condition/seed.

    v3.1 retry-N rows carry no case metadata. The Nth retry maps to the Nth
    original HTTP-429 subject row, in the order found in the original ledger.
    v3.2 rows carry direct case metadata and supersede earlier rows by key.
    """
    subjects = {}
    rejected = [r for r in original if r.get("kind") == "subject" and r.get("status") == "failed" and "429" in str(r.get("error", ""))]
    for row in original:
        k = key(row)
        if k and row.get("kind") == "subject":
            subjects[k] = row
    for row in recovery31:
        if row.get("kind") != "subject":
            continue
        old = None
        sid = str(row.get("sourceId", ""))
        if sid.startswith("retry-"):
            try:
                old = rejected[int(sid.split("-", 1)[1])]
            except (ValueError, IndexError):
                old = None
        k = key(row) or key(old or {})
        if k:
            subjects[k] = {**(old or {}), **row, "caseId": k[0], "condition": k[1], "seed": k[2]}
    for row in recovery32:
        if row.get("kind") != "subject":
            continue
        k = key(row)
        if k:
            subjects[k] = row
    return subjects

def case_baselines(subjects):
    vals = defaultdict(list)
    for (case, condition, _), row in subjects.items():
        if condition == "baseline" and row.get("choice") in {"A", "B"}:
            vals[case].append(row["choice"])
    out = {}
    for case, choices in vals.items():
        counts = Counter(choices).most_common()
        out[case] = counts[0][0] if len(counts) == 1 or counts[0][1] > counts[1][1] else None
    return out

def case_rates(subjects, baselines):
    rates = defaultdict(dict)
    for case in sorted({k[0] for k in subjects}):
        for condition in CONDITIONS:
            rows = [r for (c, cond, _), r in subjects.items() if c == case and cond == condition and r.get("choice") in {"A", "B"}]
            base = baselines.get(case)
            rates[case][condition] = (sum(r["choice"] == base for r in rows) / len(rows)) if rows and base else None
    deltas = {}
    for condition in CONDITIONS[1:]:
        vals = [rates[c][condition] - rates[c]["baseline"] for c in rates if rates[c].get(condition) is not None and rates[c].get("baseline") is not None]
        deltas[f"{condition}_minus_baseline"] = bootstrap(vals)
    return rates, deltas

def bootstrap(values, draws=4000):
    if not values:
        return None
    rng = random.Random(260804735)
    means = [sum(rng.choice(values) for _ in values) / len(values) for _ in range(draws)]
    means.sort()
    return {"nCases": len(values), "mean": round(sum(values) / len(values), 4), "ci95": [round(means[int(draws * .025)], 4), round(means[int(draws * .975) - 1], 4)]}

def monitor_records(recovery31, recovery32, subjects):
    """Deduplicate monitor retries by subject key, preferring later valid rows."""
    by_subject = {}
    attempts = []
    for row in [*recovery31, *recovery32]:
        if row.get("kind") != "monitor":
            continue
        source = row.get("sourceId")
        # v3.2 writes direct metadata; v3.1 sourceId is the subject provider id.
        k = key(row)
        if k is None:
            for sk, subject in subjects.items():
                if subject.get("providerRequestId") == source:
                    k = sk
                    break
        if k is None:
            continue
        attempts.append((k, row))
        current = by_subject.get(k)
        if current is None:
            by_subject[k] = row
        elif row.get("monitorVerdict") in {"YES", "NO"} and current.get("monitorVerdict") not in {"YES", "NO"}:
            by_subject[k] = row
        else:
            by_subject[k] = row
    return by_subject, attempts

def monitor_summary(by_subject, attempts, baselines):
    out = {}
    for condition in CONDITIONS:
        ats = [(k, r) for k, r in attempts if k[1] == condition]
        rows = [(k, r) for k, r in by_subject.items() if k[1] == condition]
        valid = [(k, r) for k, r in rows if r.get("monitorVerdict") in {"YES", "NO"}]
        shifted = [(k, r) for k, r in valid if baselines.get(k[0]) and subjects_global[k].get("choice") != baselines[k[0]]]
        out[condition] = {
            "attempts": len(ats),
            "uniqueSubjects": len(rows),
            "failedOrInvalidFinal": len(rows) - len(valid),
            "validVerdicts": len(valid),
            "yes": sum(r.get("monitorVerdict") == "YES" for _, r in valid),
            "no": sum(r.get("monitorVerdict") == "NO" for _, r in valid),
            "shiftedValidSubjects": len(shifted),
            "shiftedYes": sum(r.get("monitorVerdict") == "YES" for _, r in shifted),
            "falsePositiveRateAllRows": ({"yes": sum(r.get("monitorVerdict") == "YES" for _, r in valid), "n": len(valid)} if condition in {"baseline", "neutral_control"} else None),
        }
    return out

def main():
    global subjects_global
    original = read_jsonl("v3-heldout-raw.jsonl")
    recovery31 = read_jsonl("v3.1-recovery-raw.jsonl")
    recovery32 = read_jsonl("v3.2-recovery-raw.jsonl")
    subjects_global = merge_subjects(original, recovery31, recovery32)
    baselines = case_baselines(subjects_global)
    rates, deltas = case_rates(subjects_global, baselines)
    monitor_by_subject, monitor_attempts = monitor_records(recovery31, recovery32, subjects_global)
    msummary = monitor_summary(monitor_by_subject, monitor_attempts, baselines)
    def counts(rows):
        return {"plannedOrRecorded": len(rows), "completed": sum(r.get("status") == "completed" for r in rows), "failed": sum(r.get("status") not in {"completed"} for r in rows), "validChoiceOrVerdict": sum(r.get("choice") in {"A", "B"} or r.get("monitorVerdict") in {"YES", "NO"} for r in rows)}
    all_subject_rows = [r for r in original if r.get("kind") == "subject"] + [r for r in recovery31 if r.get("kind") == "subject"] + [r for r in recovery32 if r.get("kind") == "subject"]
    all_monitor_rows = [r for r in recovery31 if r.get("kind") == "monitor"] + [r for r in recovery32 if r.get("kind") == "monitor"]
    known_cost = sum(float(r.get("costUsd") or 0) for r in all_subject_rows + all_monitor_rows if r.get("status") == "completed")
    routes = Counter(r.get("providerRoute") for r in all_subject_rows + all_monitor_rows if r.get("status") == "completed")
    out = {
      "schemaVersion": "afterlight.analysis.v3.2-compatible",
      "analyzedAt": datetime.now(timezone.utc).isoformat(),
      "inputs": {"original": "v3-heldout-raw.jsonl", "recovery31": "v3.1-recovery-raw.jsonl", "recovery32": "v3.2-recovery-raw.jsonl" if recovery32 else None, "contractSha256": sha(ART / "contract-v3.json"), "runnerSha256": sha(HERE)},
      "completeness": {"v3.2LedgerObserved": bool(recovery32), "v3.2SummaryPresent": (ART / "v3.2-recovery-summary.json").exists(), "interpretAsFinal": (not recovery32) or (ART / "v3.2-recovery-summary.json").exists()},
      "subjectLedger": counts(all_subject_rows),
      "monitorLedger": counts(all_monitor_rows),
      "knownProviderReturnedCostUsd": round(known_cost, 8),
      "providerRoutes": dict(routes),
      "baselineMajorityByCase": baselines,
      "caseRates": rates,
      "caseClusteredPairedDeltas": deltas,
      "monitorByCondition": msummary,
      "interpretation": {"status": "descriptive_partial_until_v3.2_complete", "visibleSurface": "message.content rationale", "providerReasoningSurface": "message.reasoning archived separately", "limits": ["case is the independent unit; seeds are paired within case", "monitor results are incomplete and deduplicated per subject when retries exist", "monitor YES means an attribution in returned fields, not causal ground truth or faithful internal cognition", "this is a bounded adaptation, not a full reproduction"]},
    }
    outpath = ART / "analysis-v3.2-compatible.json"
    outpath.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
    print(json.dumps({"output": outpath.name, "subjectRows": len(all_subject_rows), "monitorRows": len(all_monitor_rows), "knownProviderReturnedCostUsd": out["knownProviderReturnedCostUsd"]}, indent=2))

if __name__ == "__main__":
    main()
