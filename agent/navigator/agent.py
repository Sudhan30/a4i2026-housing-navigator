import os
from google.adk.agents import Agent
from .config import MODEL
from .prompts import SYSTEM_INSTRUCTION
from .tools.case_file import open_case, update_case
from .tools.evidence import search_habitability_evidence
from .tools.statutes import match_statutes
from .tools.funds import match_relief_funds
from .tools.brief import finalize_brief
from .tools.caseload import list_open_cases
from google.cloud import bigquery
from .bq import run_query

def get_tract_context(census_tract_geoid: str) -> dict:
    """Neighborhood context for one census tract: severe rent burden, MODELED annual eviction
    filings (pre-aggregated across 4 quarters, no fan-out), open residential 311 count,
    poverty and vehicle access. GEOID is an 11-character string."""
    sql = """
    SELECT t.*, b.metro_severe_rent_burden_pct, b.median_tract_nonpayment_filings_modeled
    FROM `a4i_housing.v_tract_context` t CROSS JOIN `a4i_housing.v_metro_baseline` b
    WHERE t.census_tract_geoid = @census_tract_geoid
    """
    rows = run_query(sql, [bigquery.ScalarQueryParameter("census_tract_geoid", "STRING", str(census_tract_geoid))])
    return rows[0] if rows else {}

def find_tract_for_block(block_fragment: str) -> list[dict]:
    """Resolve a 100-block address fragment to its census tract GEOID(s)."""
    sql = """
    SELECT DISTINCT block_address, census_tract_geoid
    FROM `a4i_housing.municipal_311_housing_complaints`
    WHERE LOWER(block_address) LIKE CONCAT('%', LOWER(@block_fragment), '%')
      AND request_id NOT LIKE 'DECOY-%'
    LIMIT 5
    """
    return run_query(sql, [bigquery.ScalarQueryParameter("block_fragment", "STRING", block_fragment)])

def list_relief_programs() -> list[dict]:
    """List this metro's emergency rental relief programs and their structured flags."""
    sql = """
    SELECT bulletin_id, program_name, administering_agency, requires_open_habitability_case,
           residential_tenants_only, intake_url, effective_date
    FROM `a4i_housing.rental_relief_program_bulletins`
    """
    return run_query(sql)

tools = [
    open_case, update_case, search_habitability_evidence, match_statutes,
    match_relief_funds, finalize_brief,
    list_open_cases,
]

toolbox_url = os.environ.get("TOOLBOX_URL")
if toolbox_url:
    try:
        from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset, StreamableHTTPConnectionParams
        toolbox = MCPToolset(
            connection_params=StreamableHTTPConnectionParams(
                url=toolbox_url.rstrip("/") + "/mcp",
                headers={"Authorization": f"Bearer {os.environ.get('TOOLBOX_ID_TOKEN', '')}"},
            ),
            tool_filter=["get_tract_context", "find_tract_for_block", "list_relief_programs"],
        )
        tools.append(toolbox)
    except Exception:
        tools.extend([get_tract_context, find_tract_for_block, list_relief_programs])
else:
    tools.extend([get_tract_context, find_tract_for_block, list_relief_programs])

root_agent = Agent(
    name="stabilization_navigator",
    model=MODEL,
    description="Eviction-prevention intake navigator for NYC legal-aid paralegals.",
    instruction=SYSTEM_INSTRUCTION,
    tools=tools,
)
