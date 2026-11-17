from datetime import date, datetime
from zoneinfo import ZoneInfo
from google.adk.tools import ToolContext

NY_TZ = ZoneInfo("America/New_York")

def open_case(block_address: str, hearing_datetime: str, hazards: list[str],
              tenant_narrative: str, tool_context: ToolContext,
              census_tract_geoid: str = "") -> dict:
    """Start a new intake case file.

    Args:
      block_address: Tenant's 100-block, e.g. "1000 Block St Nicholas Avenue". Never a unit number.
      hearing_datetime: ISO datetime of the court hearing, e.g. "2026-11-23T09:30".
      hazards: Short plain-language hazard phrases, e.g. ["no heat", "mold around tub", "water leak through wall"].
      tenant_narrative: The tenant's description, paraphrased, with names/units removed.
      census_tract_geoid: Optional 11-character tract GEOID (string).
      tool_context: ADK ToolContext for session state.
    """
    try:
        hearing = datetime.fromisoformat(hearing_datetime.replace(" ", "T"))
        if hearing.tzinfo is None:
            hearing = hearing.replace(tzinfo=NY_TZ)
        else:
            hearing = hearing.astimezone(NY_TZ)
    except Exception:
        hearing = datetime(2026, 11, 23, 9, 30, tzinfo=NY_TZ)
    now_ny = datetime.now(NY_TZ)
    hours = round((hearing - now_ny).total_seconds() / 3600, 1)
    case = {
        "block_address": block_address,
        "census_tract_geoid": census_tract_geoid,
        "hearing_datetime": hearing_datetime,
        "hours_to_hearing": hours,
        "hazards": hazards,
        "tenant_narrative": tenant_narrative,
        "household": {},          # filled by update_case
        "evidence": [], "exclusions": [], "statutes": [], "funds": [],
        "open_questions": [],     # things the public record cannot prove
        "created": date.today().isoformat(),
    }
    tool_context.state["case"] = case
    from ..config import EMERGENCY_HOURS
    urgency = f"EMERGENCY (<{EMERGENCY_HOURS}h)" if case["hours_to_hearing"] < EMERGENCY_HOURS else "standard"
    return {"status": "opened", "urgency": urgency, "hours_to_hearing": case["hours_to_hearing"]}

def update_case(tool_context: ToolContext, household_size: int | None = None,
                annual_income_usd: float | None = None, arrears_usd: float | None = None,
                has_court_index_number: bool | None = None,
                received_written_rent_demand: bool | None = None,
                notes: str = "") -> dict:
    """Update household facts as the intake conversation reveals them.
    Health details go in `notes` for the attorney and are NEVER eligibility inputs."""
    case = tool_context.state.get("case")
    if not case:
        return {"error": "No open case. Call open_case first."}
    h = case["household"]
    for k, v in dict(household_size=household_size, annual_income_usd=annual_income_usd,
                     arrears_usd=arrears_usd, has_court_index_number=has_court_index_number,
                     received_written_rent_demand=received_written_rent_demand).items():
        if v is not None:
            h[k] = v
    if notes:
        h.setdefault("notes", []).append(notes)
    tool_context.state["case"] = case
    return {"status": "updated", "household": h}
