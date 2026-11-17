#!/usr/bin/env python3
import json
import time
import requests

LIVE_URL = "https://sq7-stabilization-navigator-530357188502.us-central1.run.app"
USER_ID = f"m14_test_{int(time.time())}"
SESSION_ID = f"sess_m14_{int(time.time())}"

def run_turn(text):
    resp = requests.post(f"{LIVE_URL}/run", json={
        "appName": "navigator",
        "userId": USER_ID,
        "sessionId": SESSION_ID,
        "newMessage": {
            "role": "user",
            "parts": [{"text": text}]
        }
    }, timeout=120)
    assert resp.status_code == 200, f"HTTP {resp.status_code}: {resp.text}"
    events = resp.json()
    tool_responses = {}
    reply = ""
    for e in events:
        if e.get("content") and e["content"].get("parts"):
            for p in e["content"]["parts"]:
                if p.get("text"):
                    reply += p["text"] + "\n"
                elif p.get("functionResponse"):
                    name = p["functionResponse"]["name"]
                    resp_data = p["functionResponse"]["response"]
                    tool_responses[name] = resp_data
    return reply, tool_responses

def main():
    print(f"=== M14 Honesty Verification ===")
    print(f"User: {USER_ID}, Session: {SESSION_ID}")

    # Create session once
    s_resp = requests.post(f"{LIVE_URL}/apps/navigator/users/{USER_ID}/sessions/{SESSION_ID}", json={})
    print(f"Session creation status: {s_resp.status_code}")

    # Turn 1
    print("\n--- Running Turn 1 (Evidence Search) ---")
    reply1, tools1 = run_turn("New intake. Tenant on the 1000 block of St. Nicholas Ave, Manhattan. Nonpayment hearing Monday 9:30. Radiators cold since early Nov, black mold around the tub, water coming through the bathroom wall. Anything open on her block?")
    assert "search_habitability_evidence" in tools1, "search_habitability_evidence was not called"
    ev = tools1["search_habitability_evidence"]
    kept = ev.get("kept", [])
    excluded = ev.get("excluded", [])
    print(f"Turn 1 Kept: {len(kept)}, Excluded: {len(excluded)}")

    turn1_excluded_ids = []
    for item in excluded:
        req_id = item.get("request_id")
        turn1_excluded_ids.append(req_id)
        reason = item.get("excluded_because")
        assert reason, f"Missing excluded_because for {req_id}"
        print(f"  [EXCLUDED] {req_id}: {reason}")

    # Turn 4
    print("\n--- Running Turn 4 (Funds Eligibility) ---")
    reply4, tools4 = run_turn("Household of 3, about $31k a year, she has the court index number. Her daughter has asthma that's gotten worse.")
    assert "match_relief_funds" in tools4, "match_relief_funds was not called"
    funds_data = tools4["match_relief_funds"]
    funds = funds_data.get("funds", [])
    print(f"Turn 4 Funds evaluated: {len(funds)}")
    for f in funds:
        checks = f.get("checks", [])
        assert len(checks) > 0, f"Fund {f['bulletin_id']} missing checks array"
        print(f"  Fund {f['bulletin_id']} ({f['program_name']}): {f['status']}")
        for c in checks:
            assert "rule" in c and "pass" in c and "detail" in c, f"Malformed check in {f['bulletin_id']}: {c}"
            status_icon = "PASS" if c["pass"] else "FAIL"
            print(f"    [{status_icon}] {c['rule']}: {c['detail']}")

    # Check BUL-NY-01 has FPL income check
    b1 = next((f for f in funds if f["bulletin_id"] == "BUL-NY-01"), None)
    assert b1 is not None, "BUL-NY-01 missing from funds"
    fpl_check = next((c for c in b1["checks"] if "FPL" in c["rule"]), None)
    assert fpl_check is not None, "BUL-NY-01 missing FPL income check"
    print(f"\nBUL-NY-01 FPL check verified: {fpl_check['rule']} -> {fpl_check['detail']}")

    # Turn 7
    print("\n--- Running Turn 7 (Finalize Brief) ---")
    reply7, tools7 = run_turn("Draft the brief for the attorney.")
    assert "finalize_brief" in tools7, "finalize_brief was not called"

    # Fetch brief artifact from agent URL
    art_url = f"{LIVE_URL}/apps/navigator/users/{USER_ID}/sessions/{SESSION_ID}/artifacts/tenant_stabilization_brief.md"
    art_resp = requests.get(art_url)
    assert art_resp.status_code == 200, f"Artifact fetch failed HTTP {art_resp.status_code}: {art_resp.text}"
    art_json = art_resp.json()
    brief_text = art_json.get("text", "")
    assert brief_text, "Artifact has empty text field"
    print(f"\nBrief Artifact Fetched ({len(brief_text)} bytes)")

    # Verify excluded IDs match Turn 1 excluded IDs
    print("\nVerifying Brief Excluded IDs match Turn 1 Excluded IDs:")
    for ex_id in turn1_excluded_ids:
        assert ex_id in brief_text, f"Brief is missing Turn 1 excluded ID: {ex_id}"
        print(f"  ✓ {ex_id} present in Section 1 of brief")

    print("\n=== M14 Honesty Verification Passed 100%! ===")

if __name__ == "__main__":
    main()
