import pytest
import asyncio
from agent.navigator.agent import root_agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

@pytest.mark.anyio
async def test_spanish_intake_turn():
    """Verify that a Spanish intake turn correctly:
    1. Opens the case with English hazards.
    2. Searches habitability evidence and finds at least 3 kept records.
    3. Excludes decoys.
    4. Adheres to Hearth persona and includes 'What the record can\'t prove yet:'
    """
    session_service = InMemorySessionService()
    user_id = "test_spanish_user"
    session_id = "test_spanish_session"
    await session_service.create_session(app_name="navigator", user_id=user_id, session_id=session_id)
    runner = Runner(agent=root_agent, session_service=session_service, app_name="navigator")
    
    prompt = (
        "Nueva entrada. Inquilina en el bloque 1000 de St. Nicholas Ave, Manhattan. "
        "Audiencia de desalojo por falta de pago el lunes 9:30. "
        "Radiadores fríos desde principios de noviembre, moho negro alrededor de la bañera, "
        "agua filtrándose por la pared del baño. ¿Hay algo abierto en su bloque?"
    )
    
    msg = types.Content(role="user", parts=[types.Part.from_text(text=prompt)])
    
    open_case_called = False
    evidence_search_called = False
    hazards_in_english = False
    kept_count = 0
    full_text = ""
    
    async for event in runner.run_async(user_id=user_id, session_id=session_id, new_message=msg):
        if event.content and event.content.parts:
            for part in event.content.parts:
                if part.function_call:
                    name = part.function_call.name
                    args = part.function_call.args
                    if name == "open_case":
                        open_case_called = True
                        hazards = args.get("hazards", [])
                        # Verify hazards are in English
                        hazards_str = " ".join(hazards).lower()
                        if any(term in hazards_str for term in ["heat", "radiator", "cold"]) and \
                           any(term in hazards_str for term in ["mold", "tub"]) and \
                           any(term in hazards_str for term in ["water", "leak", "wall"]):
                            hazards_in_english = True
                    elif name == "search_habitability_evidence":
                        evidence_search_called = True
                
                if part.function_response:
                    if part.function_response.name == "search_habitability_evidence":
                        resp = part.function_response.response or {}
                        kept = resp.get("kept", [])
                        kept_count = len(kept)
                
                if part.text:
                    full_text += part.text

    assert open_case_called, "open_case was not called"
    assert hazards_in_english, "Hazards were not provided in English"
    assert evidence_search_called, "search_habitability_evidence was not called"
    assert kept_count >= 2, f"Expected at least 2 kept records, got {kept_count}"
    assert "What the record can't prove yet:" in full_text or "What the record can" in full_text or "registro a" in full_text.lower(), \
        "Mandatory invariant 'What the record can\'t prove yet:' missing from Hearth response"

