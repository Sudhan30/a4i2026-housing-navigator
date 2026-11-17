"""Address matching must tolerate speech-to-text and human spelling variants."""
import importlib.util
import pathlib
import sys
import types

for name in ("google", "google.adk", "google.cloud"):
    sys.modules.setdefault(name, types.ModuleType(name))
_adk_tools = types.ModuleType("google.adk.tools"); _adk_tools.ToolContext = object
sys.modules.setdefault("google.adk.tools", _adk_tools)
_bq = types.ModuleType("google.cloud.bigquery"); sys.modules.setdefault("google.cloud.bigquery", _bq)

src = (pathlib.Path(__file__).resolve().parents[1] / "navigator" / "tools" / "evidence.py").read_text()
start = src.index("_DIRECTIONS = ")
ns: dict = {}
exec(src[start:], ns)  # only the pure helpers at the end of the module
block_core = ns["_block_core"]


def test_spelling_variants_share_one_key():
    keys = {block_core(b) for b in [
        "1000 Block St Nicholas Avenue",
        "1000 Block Saint Nicolas Avenue",
        "1000 block of St. Nicholas Ave, Manhattan",
    ]}
    assert keys == {"1000 block st nic"}


def test_plain_street():
    assert block_core("1900 Block University Avenue, Bronx") == "1900 block uni"
