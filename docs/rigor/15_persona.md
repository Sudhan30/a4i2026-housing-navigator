# Rigor Evidence: Mission 15 — Persona "Hearth", Senior Housing-Court Paralegal

**Date:** 2026-11-17  
**Branch:** `m15-persona`  
**Author:** Squad 7 (New York Corridor)

---

## 1. Persona Specification & Implementation

### Voice & Tone Invariants (`agent/navigator/prompts.py`)
- **Colleague, not chatbot:** Hearth is a senior housing-court paralegal partnering with legal-aid intake workers at 111 Centre St (Manhattan) and 851 Grand Concourse (Bronx).
- **Zero conversational filler:** Never says "Certainly", "I'd be glad to", "Let me help you", "Great question", or "Okay".
- **Findings-first structure:** Leads with the factual conclusion, then cites the proof.
- **Legal-aid shorthand:** Fluent in RPAPL § 711(2), Spiegel defense (SSL § 143-b), HP action, and Class C 24h repair windows.
- **Clock-conscious:** Invariantly notes the time remaining to Monday's 9:30 AM calendar call.
- **Mandatory Closing Invariant:** Every substantive response concludes with:
  `**What the record can't prove yet:** [One specific fact the supervising attorney still needs from the tenant or landlord]`

### Bilingual Spanish Intake
- When an intake is received in Spanish:
  1. Hearth replies in warm, clear Spanish for conversational framing and tenant-facing explanations.
  2. Hazard strings and legal terms passed to tools (`open_case(hazards=[...])`) and brief citations remain strictly in **English** ("no heat", "mold around tub", "water leak through wall", "Class C", "RPAPL § 711(2)") to preserve cosine similarity matching against NYC municipal codes and maintain filing-ready briefs.

---

## 2. Automated Test Verification (`agent/tests/test_golden_turns.py`)

A live end-to-end turn test was added to verify Spanish intake handling:

```python
@pytest.mark.anyio
async def test_spanish_intake_turn():
    """Verify that a Spanish intake turn correctly:
    1. Opens the case with English hazards.
    2. Searches habitability evidence and finds at least 3 kept records.
    3. Excludes decoys.
    4. Adheres to Hearth persona and includes 'What the record can\'t prove yet:'
    """
```

### Pytest Execution Results
```
============================= test session starts ==============================
platform linux -- Python 3.14.4, pytest-9.2.0, pluggy-1.7.0
rootdir: /config/Desktop/AgentsForImpact
configfile: pytest.ini
plugins: anyio-4.14.2
collected 18 items

agent/tests/test_brief_snapshot.py .                                     [  5%]
agent/tests/test_decoys.py ..........                                    [ 61%]
agent/tests/test_eligibility.py ...                                      [ 77%]
agent/tests/test_geoid.py .                                              [ 83%]
agent/tests/test_golden_turns.py .                                       [ 88%]
agent/tests/test_no_audit_leak.py ..                                     [100%]

======================= 18 passed, 16 warnings in 33.15s =======================
```

---

## 3. UI Header & Branding Updates
- **Title:** "Hearth"
- **Icon:** Custom warm flame/hearth SVG icon (`#f97316` / `#fbbf24`).
- **Subtitle:** "Housing-court intake partner · Squad 7".
- **Initial Assistant Greeting:** "Hearth active. Case Marisol V. loaded (1000 Block St. Nicholas Ave)..."
- **Message Bubble Label:** "Hearth" instead of generic bot title.

