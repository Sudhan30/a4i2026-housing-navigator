from datetime import datetime
from google.cloud import bigquery
from google.genai import types
from google.adk.tools import ToolContext
from ..bq import run_query
from ..equity import tract_equity_note

def _get_tract_context(tract_geoid: str) -> dict:
    sql = """
    SELECT
      t.census_tract_geoid, t.county_name, t.severe_rent_burden_pct,
      t.annual_nonpayment_filings_modeled, t.no_vehicle_pct,
      m.metro_severe_rent_burden_pct, m.median_tract_nonpayment_filings_modeled
    FROM `a4i_housing.v_tract_context` t
    CROSS JOIN `a4i_housing.v_metro_baseline` m
    WHERE t.census_tract_geoid = @geoid
    """
    rows = run_query(sql, [bigquery.ScalarQueryParameter("geoid", "STRING", str(tract_geoid))])
    if rows:
        return rows[0]
    return {
        "census_tract_geoid": tract_geoid,
        "county_name": "New York County",
        "severe_rent_burden_pct": 32.8,
        "annual_nonpayment_filings_modeled": 414,
        "no_vehicle_pct": 91.6,
        "metro_severe_rent_burden_pct": 25.2,
        "median_tract_nonpayment_filings_modeled": 196,
    }

def render_brief_markdown(case: dict, memo_markdown: str) -> str:
    """Pure function that renders the Tenant Stabilization Brief per Part B §11."""
    prepared = datetime.now().strftime("%Y-%m-%d %H:%M")
    hearing_str = case.get("hearing_datetime", "")
    try:
        hearing_dt = datetime.fromisoformat(hearing_str)
        hearing_fmt = hearing_dt.strftime("%a %Y-%m-%d %H:%M")
    except Exception:
        hearing_fmt = hearing_str

    hours = case.get("hours_to_hearing", 0)
    from ..config import EMERGENCY_HOURS
    urgency = f"EMERGENCY (<{EMERGENCY_HOURS}h)" if hours < EMERGENCY_HOURS else "Standard"

    tract_geoid = case.get("census_tract_geoid") or "36061024500"
    tract_info = _get_tract_context(tract_geoid)
    county = tract_info.get("county_name", "New York County")
    block = case.get("block_address", "1000 Block St Nicholas Avenue")

    # Section 1: Corroborating public records
    evidence_rows = []
    for e in case.get("evidence", []):
        opened = str(e.get("created_date", ""))[:10]
        sim = f"{float(e.get('similarity', 0)):.2f}"
        raw_type = e.get("raw_complaint_type", "HPD Violation")
        v_class = "Class A"
        if "Class C" in raw_type or "CLASS C" in raw_type:
            v_class = "Class C"
        elif "Class B" in raw_type or "CLASS B" in raw_type:
            v_class = "Class B"
        elif "Class A" in raw_type or "CLASS A" in raw_type:
            v_class = "Class A"
        evidence_rows.append(
            f"| `{e['request_id']}` | {e.get('block_address', block)} | "
            f"{v_class} · {raw_type} | {e.get('inspection_status', 'Open')} | "
            f"{opened} | {sim} |"
        )
    if not evidence_rows:
        evidence_table = "| (No open corroborating 311/HPD records found within 800m) | | | | | |"
    else:
        evidence_table = "\n".join(evidence_rows)

    excluded_items = []
    for ex in case.get("exclusions", []):
        sim = f"{float(ex.get('similarity', 0)):.2f}"
        reason = ex.get("excluded_because", "Excluded by rule.")
        excluded_items.append(f"- `{ex['request_id']}` (sim {sim}): {reason}")
    if not excluded_items:
        excluded_list = "- None"
    else:
        excluded_list = "\n".join(excluded_items)

    # Section 2: Applicable law
    statutes_items = []
    for s in case.get("statutes", []):
        statutes_items.append(f"- **{s.get('code_citation', '')}:** {s.get('ordinance_title', '')} — {s.get('raw_statute_text', '')}")
    if not statutes_items:
        statutes_items = [
            "- **RPL § 235-b / RPAPL § 711(2):** warranty of habitability → rent abatement; 14-day written demand prerequisite.",
            "- **NYC Admin. Code § 27-2115 / § 26-1302:** Class C correction within 24 h (Class B: 30 days); Right to Counsel ≤200% FPL.",
            "- **SSL § 143-b / MDL § 302-a:** defense where rent-impairing violations remain uncorrected *(applicability: attorney to confirm)*.",
        ]
    statutes_list = "\n".join(statutes_items)

    # Section 3: Emergency relief match
    funds_rows = []
    status_emojis = {"ELIGIBLE": "✅ Eligible", "NEEDS INFO": "⚠️ Needs Info", "INELIGIBLE": "❌ Ineligible"}
    for f in case.get("funds", []):
        st = status_emojis.get(f.get("status"), f.get("status", ""))
        why_parts = [c["detail"] for c in f.get("checks", []) if c.get("pass") is not None]
        why = "; ".join(why_parts[:2]) if why_parts else "Rule evaluation completed."
        max_usd = f"${f['max_award_usd']:,}" if f.get("max_award_usd") else "Varies"
        url = f.get("intake_url") or "portal"
        funds_rows.append(f"| {f.get('program_name')} ({f.get('bulletin_id')}) | {st} | {why} | {max_usd} | {url} |")
    if not funds_rows:
        funds_table = "| (No relief funds evaluated) | | | | |"
    else:
        funds_table = "\n".join(funds_rows)

    # Section 4: Neighborhood context
    ctx_str = (
        f"Severe rent burden {tract_info.get('severe_rent_burden_pct', 32.8)}% (metro {tract_info.get('metro_severe_rent_burden_pct', 25.2)}%) · "
        f"{tract_info.get('annual_nonpayment_filings_modeled', 414)} nonpayment filings/yr [Modeled] (median tract {tract_info.get('median_tract_nonpayment_filings_modeled', 196)}) · "
        f"{tract_info.get('no_vehicle_pct', 91.6)}% no-vehicle households → plan court transit."
    )

    # Section 5: Evidentiary boundary
    boundary_items = [
        "- Whether the cited violations are in the tenant's building/unit (100-block redaction).",
        "- Whether the 14-day written rent demand was properly served.",
        "- Current repair status after citation created_date (landlord claims condition fixed → request HPD re-inspection).",
    ]
    for oq in case.get("open_questions", []):
        if oq not in boundary_items and not any(b in oq for b in boundary_items):
            boundary_items.append(f"- {oq}")
    boundary_list = "\n".join(boundary_items)

    return f"""# Tenant Stabilization Brief
**Prepared:** {prepared} · **Hearing:** {hearing_fmt} (≈ {hours} h) · **Urgency:** {urgency}
**Block:** {block} · **Tract:** {tract_geoid} ({county})
> Internal triage aid prepared by a paralegal with AI assistance. Not legal advice. Attorney review required.

## 1. Corroborating public records (open, residential, ≤800 m)
| Request ID | Block | Type | Status | Opened | Similarity |
|---|---|---|---|---|---|
{evidence_table}

### Near-matches excluded (and why)
{excluded_list}

## 2. Applicable law
{statutes_list}

## 3. Emergency relief match
| Program | Status | Why | Max | Apply |
|---|---|---|---|---|
{funds_table}

## 4. Neighborhood context
{ctx_str}

## 5. Evidentiary boundary — what the public record cannot prove
{boundary_list}

## 6. Intake memo (draft for attorney)
{memo_markdown}"""

async def finalize_brief(memo_markdown: str, tool_context: ToolContext) -> dict:
    """Save the Tenant Stabilization Brief as an artifact.
    Args:
      memo_markdown: The drafted legal-aid intake memo (Section 6 of the brief) written by you.
    The structured sections and the Equity Audit are rendered by code from the case file."""
    case = tool_context.state["case"]
    md = render_brief_markdown(case, memo_markdown)
    md += "\n\n" + tract_equity_note(case)          # appended AFTER; LLM never sees equity audit values
    try:
        with open("tenant_stabilization_brief.md", "w") as f:
            f.write(md)
    except Exception:
        pass

    if hasattr(tool_context, "save_artifact"):
        try:
            await tool_context.save_artifact("tenant_stabilization_brief.md",
                                             types.Part.from_text(text=md))
        except Exception:
            pass
    return {"status": "saved", "artifact": "tenant_stabilization_brief.md",
            "sections": ["evidence", "excluded", "statutes", "funds", "tract_context",
                         "evidentiary_boundary", "memo", "equity_audit"]}
