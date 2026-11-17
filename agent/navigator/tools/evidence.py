import os
from google.cloud import bigquery
from google.adk.tools import ToolContext
from ..bq import run_query
from ..config import DATASET, PROXIMITY_METERS, MIN_SIMILARITY, EXCLUSION_REASONS

_SQL_PATH = os.path.join(os.path.dirname(__file__), "search.sql")
with open(_SQL_PATH) as f:
    SEARCH_SQL = f.read()

# Plain-language → inspector-language query expansion (helps recall; vector search does the matching)
HAZARD_EXPANSIONS = {
    "heat": "no heat in apartment, radiators cold, boiler not working, heating system inaccessible",
    "hot water": "no hot water at fixtures, hot water outage",
    "mold": "visible mold condition on walls and ceiling, black mold around bathtub",
    "leak": "water leak through ceiling or wall, abate evidence of water leak",
    "electric": "defective electrical outlet, exposed wiring, electrical hazard near water",
    "sewage": "sewage backup, clogged waste line, toilet overflowing",
    "pests": "roaches, mice, rodent infestation",
}

def _expand(hazards: list[str]) -> list[str]:
    out = []
    for h in hazards:
        key = next((k for k in HAZARD_EXPANSIONS if k in h.lower()), None)
        out.append(f"{h}. {HAZARD_EXPANSIONS[key]}" if key else h)
    return out[:6]

def _classify(row: dict) -> str | None:
    """Return an exclusion key, or None if the record is admissible corroboration."""
    # DECOY-* rows are classified by the same real rules as everything else, so the
    # explanation is substantive ("Closed – Abated"), not just "it's a decoy".
    if row["property_type"] != "Residential":
        return "commercial"
    if row["closed_date"] is not None:
        status = (row["inspection_status"] or "").lower()
        if "abated" in status:
            return "closed_abated"
        if "no violation" in status:
            return "closed_no_violation"
        return "closed_other"
    if row["meters_from_anchor"] is not None and row["meters_from_anchor"] > PROXIMITY_METERS:
        return "too_far"
    if row["similarity"] < MIN_SIMILARITY:
        return "low_similarity"
    return None

def search_habitability_evidence(tool_context: ToolContext, hazards: list[str] | None = None) -> dict:
    """Semantic search (BigQuery AI.EMBED + VECTOR_SEARCH) over 311 housing complaints for
    the open case, then apply hard eligibility rules: Residential, still open, near the block.
    Returns kept evidence AND every excluded near-match with its reason."""
    case = tool_context.state.get("case")
    if not case:
        return {"error": "No open case. Call open_case first."}
    queries = _expand(hazards or case["hazards"])
    rows = run_query(SEARCH_SQL, [
        bigquery.ArrayQueryParameter("queries", "STRING", queries),
        bigquery.ScalarQueryParameter("block_hint", "STRING", _block_core(case["block_address"])),
        bigquery.ScalarQueryParameter("tract_hint", "STRING", case.get("census_tract_geoid", "")),
    ])
    raw_top = [{"rank": i + 1, "request_id": r["request_id"], "similarity": r["similarity"],
                "status": r["inspection_status"], "property_type": r["property_type"]}
               for i, r in enumerate(rows[:5])]
    kept, excluded = [], []
    for r in rows:
        why = _classify(r)
        item = {k: (str(v) if v is not None and k.endswith("_date") else v)
                for k, v in r.items() if k not in ("anchor_lat", "anchor_lng")}
        if why:
            item["excluded_because"] = EXCLUSION_REASONS[why].format(m=PROXIMITY_METERS)
            if r["request_id"].startswith("DECOY-"):
                item["excluded_because"] += " " + EXCLUSION_REASONS["planted"]
            # surface semantically relevant exclusions (the interesting near-misses) and all decoys
            if r["similarity"] >= MIN_SIMILARITY or r["request_id"].startswith("DECOY-"):
                excluded.append(item)
        else:
            kept.append(item)
    case["evidence"], case["exclusions"] = kept[:8], excluded[:8]
    if not kept:
        case["open_questions"].append(
            "No open residential 311/HPD record corroborates these conditions near this block. "
            "Possible under-reporting: route to an inspection request and to funds that do not "
            "require an open habitability case.")
    tool_context.state["case"] = case
    first = rows[0] if rows else {}
    # The tract the tenant's block sits in: the nearest candidate to the anchor point.
    near = [r for r in rows if r.get("meters_from_anchor") is not None]
    tract = min(near, key=lambda r: r["meters_from_anchor"])["census_tract_geoid"] if near else None
    if tract and not case.get("census_tract_geoid"):
        case["census_tract_geoid"] = tract
        tool_context.state["case"] = case
    map_view = {
        "anchor": ({"lat": first["anchor_lat"], "lng": first["anchor_lng"]}
                   if first.get("anchor_lat") is not None else None),
        "radius_m": PROXIMITY_METERS,
    }
    return {"queries_used": queries, "raw_top5_before_rules": raw_top, "map": map_view,
            "census_tract_geoid": case.get("census_tract_geoid") or tract,
            "kept": case["evidence"], "excluded": case["exclusions"],
            "evidence_scope": "100-block public record — corroborates block conditions, not the tenant's unit."}

_DIRECTIONS = {"east": "e", "west": "w", "north": "n", "south": "s", "e": "e", "w": "w", "n": "n", "s": "s"}


def _block_core(block: str) -> str:
    """Tolerant match key for a 100-block address.

    Speech-to-text and people spell streets differently ("Saint Nicolas Ave",
    "St. Nicholas Avenue"). Keep the block number, normalize "Saint" -> "st" and
    compass words, then keep only the first three letters of the street name:
    "1000 Block Saint Nicolas Avenue" -> "1000 block st nic".
    """
    words = block.lower().replace(",", " ").replace(".", " ").split()
    words = ["st" if w == "saint" else w for w in words]
    if "block" not in words:
        return " ".join(words[:3])
    i = words.index("block")
    num = words[i - 1] if i > 0 else ""
    out = []
    for w in words[i + 1:]:
        if w in ("of", "the"):
            continue
        if not out and (w == "st" or w in _DIRECTIONS):
            out.append(_DIRECTIONS.get(w, w))
            continue
        out.append(w[:3])
        break
    return f"{num} block {' '.join(out)}".strip()
