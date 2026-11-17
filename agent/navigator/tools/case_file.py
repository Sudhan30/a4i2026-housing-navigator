from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from google.adk.tools import ToolContext

NY_TZ = ZoneInfo("America/New_York")
_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def parse_hearing(text: str, now: datetime | None = None) -> tuple[datetime | None, str | None]:
    """Resolve the hearing time in New York time. Returns (datetime, None) or (None, problem)."""
    import re

    now = now or datetime.now(NY_TZ)
    t = (text or "").strip()
    try:
        dt = datetime.fromisoformat(t.replace(" ", "T"))
        dt = dt.replace(tzinfo=NY_TZ) if dt.tzinfo is None else dt.astimezone(NY_TZ)
        if dt < now - timedelta(days=1):
            return None, (f"The hearing date {dt:%Y-%m-%d} is in the past. Use the next upcoming date, "
                          "or pass the weekday and time (e.g. 'Monday 09:30').")
        return dt, None
    except ValueError:
        pass
    m = re.search(r"(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?[^0-9]*(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?", t, re.I)
    if not m:
        return None, "Could not read the hearing date. Pass an ISO datetime or a weekday and time, e.g. 'Monday 09:30'."
    day = next(i for i, d in enumerate(_DAYS) if d.startswith(m.group(1).lower()))
    hour, minute = int(m.group(2)), int(m.group(3) or 0)
    ampm = (m.group(4) or "").lower().replace(".", "")
    if ampm == "pm" and hour < 12:
        hour += 12
    if ampm == "am" and hour == 12:
        hour = 0
    ahead = (day - now.weekday()) % 7
    dt = (now + timedelta(days=ahead)).replace(hour=hour, minute=minute, second=0, microsecond=0)
    if dt <= now:
        dt += timedelta(days=7)
    return dt, None


def open_case(block_address: str, hearing_datetime: str, hazards: list[str],
              tenant_narrative: str, tool_context: ToolContext,
              census_tract_geoid: str = "") -> dict:
    """Start a new intake case file.

    Args:
      block_address: Tenant's 100-block, e.g. "1000 Block St Nicholas Avenue". Never a unit number.
      hearing_datetime: The hearing as the user said it. Either an ISO datetime ("YYYY-MM-DDTHH:MM")
        or a weekday and time ("Monday 09:30"); a weekday means its next occurrence in New York.
      hazards: Short plain-language hazard phrases, e.g. ["no heat", "mold around tub", "water leak through wall"].
      tenant_narrative: The tenant's description, paraphrased, with names/units removed.
      census_tract_geoid: Optional 11-character tract GEOID (string).
      tool_context: ADK ToolContext for session state.
    """
    hearing, problem = parse_hearing(hearing_datetime)
    if problem:
        return {"status": "needs_date", "message": problem,
                "today": datetime.now(NY_TZ).strftime("%A %Y-%m-%d")}
    now_ny = datetime.now(NY_TZ)
    hours = round((hearing - now_ny).total_seconds() / 3600, 1)
    case = {
        "block_address": block_address,
        "census_tract_geoid": census_tract_geoid,
        "hearing_datetime": hearing.strftime("%Y-%m-%dT%H:%M"),
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
    return {"status": "opened", "urgency": urgency, "hours_to_hearing": case["hours_to_hearing"],
            "hearing": hearing.strftime("%A %b %d, %Y %I:%M %p"),
            "hearing_iso": hearing.strftime("%Y-%m-%dT%H:%M"),
            "hearing_ts": int(hearing.timestamp())}

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
