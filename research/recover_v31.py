#!/usr/bin/env python3
"""Operational v3.1 recovery. Never reruns completed or unparsable v3 subjects."""
from __future__ import annotations
import json, time
from datetime import datetime, timezone
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
import runner_v3 as base

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "artifacts" / "experiment"
SOURCE = ART / "v3-heldout-raw.jsonl"
OUT = ART / "v3.1-recovery-raw.jsonl"
SUMMARY = ART / "v3.1-recovery-summary.json"

def now():
    return datetime.now(timezone.utc).isoformat()

def load_rows():
    return [json.loads(line) for line in SOURCE.read_text(encoding="utf-8").splitlines() if line.strip()]

def write_row(handle, row):
    handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
    handle.flush()

def provider_result(response, kind, source_id, request, started):
    msg = ((response.get("choices") or [{}])[0].get("message") or {})
    content = msg.get("content") or ""
    row = {
        "kind": kind, "recovery": "v3.1", "sourceId": source_id,
        "status": "completed", "startedAt": started, "completedAt": now(),
        "providerRequestId": response.get("id"), "providerModel": response.get("model", base.MODEL),
        "providerRoute": response.get("provider"), "rawContent": content,
        "providerReasoning": msg.get("reasoning"), "reasoningFieldAccessible": bool(msg.get("reasoning")),
        "finishReason": ((response.get("choices") or [{}])[0].get("finish_reason")),
        "usage": response.get("usage"), "costUsd": base.cost_of(response), "request": request,
    }
    if kind == "subject":
        row["choice"], row["rationale"] = base.parse_subject(content)
    else:
        row["monitorVerdict"], row["monitorExplanation"] = base.parse_monitor(content)
    return row

def failed(kind, source_id, request, started, exc):
    return {"kind": kind, "recovery": "v3.1", "sourceId": source_id, "status": "failed", "startedAt": started, "completedAt": now(), "error": str(exc), "request": request}

def main():
    base.load_env()
    rows = load_rows()
    failed429 = [r for r in rows if r.get("kind") == "subject" and r.get("status") == "failed" and "429" in str(r.get("error", ""))]
    completed = [r for r in rows if r.get("kind") == "subject" and r.get("status") == "completed" and r.get("choice") in {"A", "B"}]
    recovered = []
    monitor_subjects = list(completed)
    monitor_rows = []
    recovery_failures = 0
    with OUT.open("w", encoding="utf-8") as handle:
        for index, old in enumerate(failed429):
            time.sleep(1.0)
            started = now()
            try:
                response = base.request_json(old["request"])
                row = provider_result(response, "subject", old.get("providerRequestId") or f"retry-{index}", old["request"], started)
                recovered.append(row)
                if row.get("choice") in {"A", "B"}:
                    monitor_subjects.append(row)
            except Exception as exc:
                row = failed("subject", old.get("providerRequestId") or f"retry-{index}", old["request"], started, exc)
                recovery_failures += 1
            write_row(handle, row)
            if recovery_failures >= 2:
                break
        consecutive_monitor_failures = 0
        for index, subject in enumerate(monitor_subjects):
            time.sleep(1.0)
            case = next((c for c in base.CASES if c.id == subject["caseId"]), None)
            if case is None:
                continue
            prompt = base.monitor_prompt(case, subject["condition"], subject.get("choice") or "?", subject.get("rationale") or "", subject.get("providerReasoning") or "")
            request = {"model": base.MODEL, "messages": [{"role": "user", "content": prompt}], "temperature": 0, "seed": int(subject["seed"]), "max_tokens": base.MONITOR_MAX_TOKENS, "include_reasoning": True, "reasoning": {"effort": base.REASONING_EFFORT}, "provider": {"allow_fallbacks": False}}
            started = now()
            try:
                response = base.request_json(request)
                row = provider_result(response, "monitor", subject.get("providerRequestId") or f"monitor-{index}", request, started)
                monitor_rows.append(row)
                consecutive_monitor_failures = 0
            except Exception as exc:
                row = failed("monitor", subject.get("providerRequestId") or f"monitor-{index}", request, started, exc)
                monitor_rows.append(row)
                consecutive_monitor_failures += 1
            write_row(handle, row)
            if consecutive_monitor_failures >= 2:
                break
    total_cost = sum(float(r.get("costUsd") or 0) for r in recovered + monitor_rows)
    summary = {"schemaVersion": "afterlight.experiment.recovery.v3.1", "completedAt": now(), "parentRun": "v3-heldout-raw.jsonl", "eligible429": len(failed429), "retriesAttempted": len(recovered) + recovery_failures, "recoveredSubjects": len(recovered), "recoveryFailures": recovery_failures, "monitorEligibleSubjects": len(monitor_subjects), "monitorRows": len(monitor_rows), "monitorCompleted": sum(r.get("status") == "completed" for r in monitor_rows), "monitorFailures": sum(r.get("status") != "completed" for r in monitor_rows), "monitorValidVerdicts": sum(r.get("monitorVerdict") in {"YES", "NO"} for r in monitor_rows), "spendUsd": round(total_cost, 8), "stopRule": "at most one retry per HTTP429 subject, then stop after two consecutive recovery failures; monitor stops after two consecutive failures", "rawEvidence": OUT.name}
    SUMMARY.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))

if __name__ == "__main__":
    main()