"""The system prompt must describe behavior, not the demo's answers.

Hardcoded figures or record IDs make the agent repeat them for other tenants
(hallucination) and make the demo look scripted to anyone reading the prompt.
"""
import pathlib
import re

PROMPT = (pathlib.Path(__file__).resolve().parents[1] / "navigator" / "prompts.py").read_text()

FORBIDDEN = [
    r"\b\d{1,2}\.\d%",            # percentages such as 32.8%
    r"NYC-\d{6,}",                # real request IDs
    r"DECOY-[A-Z]{4}-\d+",        # planted decoy IDs
    r"\b20\d\d-\d\d-\d\d\b",      # data dates
    r"\$\d{1,3}(,\d{3})+",        # dollar amounts such as $3,350
    r"\b\d{2,3} (hours|horas)\b", # hardcoded hearing countdowns
]

def test_prompt_contains_no_case_specific_data():
    hits = [(p, m.group(0)) for p in FORBIDDEN for m in re.finditer(p, PROMPT)]
    assert not hits, f"Case-specific data found in prompts.py: {hits}"
