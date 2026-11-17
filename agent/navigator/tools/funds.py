import re
from google.cloud import bigquery
from google.adk.tools import ToolContext
from ..bq import run_query
from ..config import fpl

FUNDS_SQL = """
SELECT b.bulletin_id, b.program_name, b.administering_agency, b.funding_stream,
       b.requires_open_habitability_case, b.residential_tenants_only,
       b.raw_bulletin_text, b.intake_url, b.effective_date,
       ROUND(1 - vs.distance, 4) AS hazard_fit
FROM `a4i_housing.rental_relief_program_bulletins` b
LEFT JOIN (
  SELECT base.bulletin_id, distance
  FROM VECTOR_SEARCH(TABLE `a4i_housing.bulletins_embedded`, 'embedding',
    (SELECT AI.EMBED(@q, connection_id => 'us.a4i-vertex', endpoint => 'gemini-embedding-2').result AS v),
    query_column_to_search => 'v', top_k => 4, distance_type => 'COSINE', options => '{"use_brute_force":true}')
) vs USING (bulletin_id)
"""

_CAP = re.compile(r"up to \$([\d,]+)", re.I)
_INCOME = re.compile(r"<=\s*(\d+)%\s*(?:of\s+the\s+)?(?:area\s+median\s+income\s*\(|federal\s+poverty\s+level\s*\()?\s*(AMI|FPL)", re.I)

def _evaluate(b: dict, case: dict) -> dict:
    h = case.get("household", {})
    checks = []
    def chk(name, ok, detail):
        checks.append({"rule": name, "pass": ok, "detail": detail})

    if b.get("residential_tenants_only"):
        chk("Residential tenant", True, "Tenant rents a residential unit (intake confirmed).")

    if b.get("requires_open_habitability_case"):
        has_open = len(case.get("evidence", [])) > 0
        chk("Open habitability case", has_open,
            f"{len(case.get('evidence', []))} open residential HPD/311 record(s) on/near block"
            + (" — attorney must confirm at least one is in the tenant's building." if has_open else ""))

    m = _INCOME.search(b["raw_bulletin_text"])
    if m:
        pct, basis = int(m.group(1)), m.group(2).upper()
        if basis == "FPL" and h.get("household_size") and h.get("annual_income_usd") is not None:
            limit = pct / 100 * fpl(h["household_size"])
            chk(f"Income ≤{pct}% FPL", h["annual_income_usd"] <= limit,
                f"${h['annual_income_usd']:,.0f} vs limit ${limit:,.0f} (household of {h['household_size']})")
        elif basis == "AMI":
            chk(f"Income ≤{pct}% AMI", None, "AMI table not loaded — verify manually (BYOD: HUD Income Limits, public domain).")
        else:
            chk(f"Income ≤{pct}% {basis}", None, "Need household size and income.")

    cap = _CAP.search(b["raw_bulletin_text"])
    cap_usd = int(cap.group(1).replace(",", "")) if cap else None
    if cap_usd and h.get("arrears_usd"):
        chk("Award covers arrears", cap_usd >= h["arrears_usd"],
            f"Cap ${cap_usd:,} vs arrears ${h['arrears_usd']:,.0f}")

    text = b["raw_bulletin_text"].lower()
    if "index number" in text or "rent demand" in text:
        ok = bool(h.get("has_court_index_number") or h.get("received_written_rent_demand"))
        chk("Court index number or rent demand", ok, "Tenant holds Housing Court index number." if ok else "Not confirmed.")
    if "heat" in text and "mold" in text:
        hz = " ".join(case.get("hazards", [])).lower()
        chk("Hazard type covered (heat/hot water/lead/mold)", any(w in hz for w in ["heat", "hot water", "mold", "lead"]),
            "Case hazards include heat and mold.")

    verdicts = [c["pass"] for c in checks]
    status = "ELIGIBLE" if all(v is True for v in verdicts) else ("INELIGIBLE" if False in verdicts else "NEEDS INFO")
    return {**{k: b[k] for k in ["bulletin_id", "program_name", "administering_agency",
                                 "requires_open_habitability_case", "intake_url"]},
            "max_award_usd": cap_usd, "hazard_fit": b.get("hazard_fit"),
            "status": status, "checks": checks}

def match_relief_funds(tool_context: ToolContext) -> dict:
    """Evaluate every emergency stabilization fund for this household with explicit rule checks.
    Ranks ELIGIBLE first, then habitability-linked programs when the hearing is imminent."""
    case = tool_context.state["case"]
    q = f"Relief for tenant facing nonpayment eviction with {', '.join(case['hazards'])}"
    rows = run_query(FUNDS_SQL, [bigquery.ScalarQueryParameter("q", "STRING", q)])
    results = [_evaluate(b, case) for b in rows]
    from ..config import EMERGENCY_HOURS
    urgent = case["hours_to_hearing"] < EMERGENCY_HOURS
    order = {"ELIGIBLE": 0, "NEEDS INFO": 1, "INELIGIBLE": 2}
    results.sort(key=lambda r: (order[r["status"]],
                                -(1 if urgent and r["requires_open_habitability_case"] else 0),
                                -(r["hazard_fit"] or 0)))
    case["funds"] = results
    tool_context.state["case"] = case
    return {"funds": results, "deadline_weighting": f"hearing < {EMERGENCY_HOURS}h: defense-linked programs ranked first" if urgent else "standard"}
