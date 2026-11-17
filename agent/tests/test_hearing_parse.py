"""open_case resolves hearing dates in code so the model never guesses the year."""
import importlib.util
import pathlib
import sys
import types
from datetime import datetime

_stub = types.ModuleType("google.adk.tools")
_stub.ToolContext = object
for name in ("google", "google.adk"):
    sys.modules.setdefault(name, types.ModuleType(name))
sys.modules.setdefault("google.adk.tools", _stub)

_path = pathlib.Path(__file__).resolve().parents[1] / "navigator" / "tools" / "case_file.py"
_spec = importlib.util.spec_from_file_location("case_file_under_test", _path)
cf = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cf)

THURSDAY = datetime(2026, 11, 19, 15, 40, tzinfo=cf.NY_TZ)


def test_weekday_means_next_occurrence():
    dt, problem = cf.parse_hearing("Monday 9:30", THURSDAY)
    assert problem is None and (dt.year, dt.month, dt.day, dt.hour, dt.minute) == (2026, 11, 23, 9, 30)


def test_pm_and_same_weekday_roll_forward():
    assert cf.parse_hearing("monday 2 pm", THURSDAY)[0].hour == 14
    assert cf.parse_hearing("Thursday 9:00", THURSDAY)[0].day == 26


def test_past_or_unreadable_dates_are_rejected_not_guessed():
    assert cf.parse_hearing("2024-05-20T09:30", THURSDAY)[0] is None
    assert cf.parse_hearing("next week sometime", THURSDAY)[0] is None
