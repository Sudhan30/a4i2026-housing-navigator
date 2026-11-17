"""Read-only view of the paralegal's saved caseload (Google Firestore, collection "cases").

The Intake Desk writes one document per case; this tool lets Hearth answer
"which cases need attention?" without a separate dashboard. Names and unit
numbers are never stored, only 100-block addresses.
"""
from datetime import datetime, timezone

_client = None


def _cases():
    global _client
    if _client is None:
        from google.cloud import firestore
        _client = firestore.Client()
    return _client.collection("cases")


def list_open_cases(limit: int = 10) -> dict:
    """List the paralegal's open saved cases, most urgent hearing first.

    Use when Dev asks about the caseload, e.g. "which cases need attention today?"
    or "what's due this week?".

    Args:
      limit: Maximum number of cases to return (default 10).

    Returns:
      {"cases": [{block, hearing, hours_to_hearing, status, worst_hazard, next_action,
                  records_on_file, eligible_funds}], "count": int}
    """
    now = datetime.now(timezone.utc).timestamp() * 1000
    out = []
    for doc in _cases().order_by("hearingAt").limit(max(1, min(limit, 25)) * 2).stream():
        c = doc.to_dict() or {}
        if c.get("status") == "closed" or not c.get("hearingAt"):
            continue
        hours = round((c["hearingAt"] - now) / 3_600_000, 1)
        if hours < -24:
            continue
        out.append({
            "block": c.get("block"),
            "hearing": c.get("hearingLabel"),
            "hours_to_hearing": hours,
            "status": c.get("status"),
            "worst_hazard": c.get("worstHazard"),
            "next_action": c.get("nextAction"),
            "records_on_file": c.get("recordCount"),
            "eligible_funds": c.get("eligibleFunds"),
        })
        if len(out) >= limit:
            break
    return {"cases": out, "count": len(out)}
