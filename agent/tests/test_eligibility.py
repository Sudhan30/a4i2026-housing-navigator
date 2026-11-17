import pytest
from agent.navigator.tools.case_file import open_case, update_case
from agent.navigator.tools.funds import match_relief_funds

class MockToolContext:
    def __init__(self):
        self.state = {}

def test_marisol_relief_eligibility_with_evidence():
    """Marisol fixture from §8.6:
    household 3, $31,000, arrears $3,350, index number = yes, 3 open records.
    Expected: all 4 programs ELIGIBLE (BUL-NY-01, BUL-NY-02, BUL-NY-03, BUL-NY-04).
    """
    tc = MockToolContext()
    open_case(
        block_address="1000 Block St Nicholas Avenue, Manhattan",
        hearing_datetime="2026-11-23T09:30",
        hazards=["no heat", "black mold around bathtub", "water leak at bathroom wall"],
        tenant_narrative="Tenant with young child and elderly mother, radiators cold, ceiling mold, arrears $3,350.",
        tool_context=tc,
        census_tract_geoid="36061024500",
    )
    update_case(
        tool_context=tc,
        household_size=3,
        annual_income_usd=31000.0,
        arrears_usd=3350.0,
        has_court_index_number=True,
        received_written_rent_demand=True,
    )
    # Simulate 3 open corroborating habitability records
    tc.state["case"]["evidence"] = [
        {"request_id": "NYC-19346259", "inspection_status": "Open", "property_type": "Residential"},
        {"request_id": "NYC-19346354", "inspection_status": "Open", "property_type": "Residential"},
        {"request_id": "NYC-19346353", "inspection_status": "Open", "property_type": "Residential"},
    ]

    res = match_relief_funds(tool_context=tc)
    funds = res["funds"]
    assert len(funds) == 4, f"Expected 4 relief funds, got {len(funds)}"

    fund_map = {f["bulletin_id"]: f["status"] for f in funds}
    assert fund_map.get("BUL-NY-01") == "ELIGIBLE", f"BUL-NY-01 should be ELIGIBLE, got {fund_map.get('BUL-NY-01')}"
    assert fund_map.get("BUL-NY-02") == "ELIGIBLE", f"BUL-NY-02 should be ELIGIBLE, got {fund_map.get('BUL-NY-02')}"
    assert fund_map.get("BUL-NY-03") == "ELIGIBLE", f"BUL-NY-03 should be ELIGIBLE, got {fund_map.get('BUL-NY-03')}"
    assert fund_map.get("BUL-NY-04") == "ELIGIBLE", f"BUL-NY-04 should be ELIGIBLE, got {fund_map.get('BUL-NY-04')}"

def test_marisol_relief_underreporting_fallback_no_evidence():
    """Under-reporting fallback (§8.6 twist):
    With evidence = [] (no open record corroboration),
    BUL-NY-02 and BUL-NY-04 flip to INELIGIBLE,
    while BUL-NY-01 and BUL-NY-03 remain ELIGIBLE.
    """
    tc = MockToolContext()
    open_case(
        block_address="1000 Block St Nicholas Avenue, Manhattan",
        hearing_datetime="2026-11-23T09:30",
        hazards=["no heat", "black mold around bathtub"],
        tenant_narrative="Tenant reports cold radiators, no 311 complaints filed yet.",
        tool_context=tc,
        census_tract_geoid="36061024500",
    )
    update_case(
        tool_context=tc,
        household_size=3,
        annual_income_usd=31000.0,
        arrears_usd=3350.0,
        has_court_index_number=True,
        received_written_rent_demand=True,
    )
    tc.state["case"]["evidence"] = []  # No corroborating open 311 records

    res = match_relief_funds(tool_context=tc)
    funds = res["funds"]
    fund_map = {f["bulletin_id"]: f["status"] for f in funds}

    assert fund_map.get("BUL-NY-01") == "ELIGIBLE", "BUL-NY-01 should remain ELIGIBLE"
    assert fund_map.get("BUL-NY-03") == "ELIGIBLE", "BUL-NY-03 should remain ELIGIBLE"
    assert fund_map.get("BUL-NY-02") == "INELIGIBLE", "BUL-NY-02 requires open habitability case"
    assert fund_map.get("BUL-NY-04") == "INELIGIBLE", "BUL-NY-04 requires open habitability case"

def test_bul_ny_01_fpl_income_matching():
    """Verify BUL-NY-01 specifically matches '<=200% of the Federal Poverty Level (FPL)'
    and produces an Income <=200% FPL check with correct pass/fail evaluation."""
    tc = MockToolContext()
    open_case(
        block_address="1000 Block St Nicholas Avenue, Manhattan",
        hearing_datetime="2026-11-23T09:30",
        hazards=["no heat"],
        tenant_narrative="Tenant with arrears.",
        tool_context=tc,
        census_tract_geoid="36061024500",
    )
    # Test passing income ($31,000 <= $49,720 for household of 3)
    update_case(
        tool_context=tc,
        household_size=3,
        annual_income_usd=31000.0,
        arrears_usd=3350.0,
    )
    res = match_relief_funds(tool_context=tc)
    b1 = next(f for f in res["funds"] if f["bulletin_id"] == "BUL-NY-01")
    income_check = next((c for c in b1["checks"] if "FPL" in c["rule"]), None)
    assert income_check is not None, "BUL-NY-01 must have an FPL income check"
    assert income_check["pass"] is True, "Household of 3 with $31k should pass <=200% FPL"
    assert b1["status"] == "ELIGIBLE"

    # Test failing income ($60,000 > $53,300 for household of 3)
    update_case(
        tool_context=tc,
        household_size=3,
        annual_income_usd=60000.0,
        arrears_usd=3350.0,
    )
    res_high = match_relief_funds(tool_context=tc)
    b1_high = next(f for f in res_high["funds"] if f["bulletin_id"] == "BUL-NY-01")
    income_check_high = next((c for c in b1_high["checks"] if "FPL" in c["rule"]), None)
    assert income_check_high is not None
    assert income_check_high["pass"] is False, "Household of 3 with $60k should fail <=200% FPL"
    
    fund_statuses = {f["bulletin_id"]: f["status"] for f in res_high["funds"]}
    assert fund_statuses["BUL-NY-01"] == "INELIGIBLE", "BUL-NY-01 should be INELIGIBLE at $60k"
    assert fund_statuses["BUL-NY-02"] == "INELIGIBLE", "BUL-NY-02 should be INELIGIBLE at $60k"
    assert fund_statuses["BUL-NY-03"] == "INELIGIBLE", "BUL-NY-03 should be INELIGIBLE at $60k"

