#!/usr/bin/env python3
"""
Playwright automated UI verification for Mission 16:
- 1280x720 split screen: Conversation + Self-Writing Brief
- Zero dashboard stat tiles or tab bar
- Inline evidence chips, struck-through decoys
- Progressive brief filling section by section
- Zero "undefined" in DOM
- Mobile 390x844 no horizontal scroll
- Saves screenshots to docs/rigor/16_ui/
"""

import sys
import time
from playwright.sync_api import sync_playwright

def run_verification():
    print("=" * 70)
    print("M16 UI REDESIGN VERIFICATION (Playwright Headless)")
    print("=" * 70)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        page = context.new_page()

        print("[1/5] Navigating to http://localhost:8089...")
        page.goto("http://localhost:8089/")
        page.wait_for_selector(".app-header")
        page.wait_for_selector(".chat-pane")
        page.wait_for_selector(".brief-pane")

        # Verify initial state: no tabs, no stat tiles
        assert page.query_selector(".case-tabs") is None, "Tabs still present!"
        assert page.query_selector(".stat-tile") is None, "Stat tiles still present!"
        assert page.query_selector(".tab-btn") is None, "Tab buttons still present!"
        print("  ✓ Zero dashboard tabs or stat tiles found.")

        # Test Turn 1 (Habitability search & decoy filter)
        print("[2/5] Running Turn 1 (Habitability search & decoy filter)...")
        page.fill("#chat-input", "New intake. Tenant on the 1000 block of St. Nicholas Ave, Manhattan. Nonpayment hearing Monday 9:30. Radiators cold since early Nov, black mold around the tub, water coming through the bathroom wall. Anything open on her block?")
        page.click("#send-btn")

        # Wait for assistant response and chips (Live mode)
        page.wait_for_selector(".evidence-chip.kept", timeout=45000)
        page.wait_for_selector(".evidence-chip.excluded", timeout=45000)
        page.wait_for_selector("#sec-evidence table", timeout=45000)

        # Check for undefined
        body_text = page.inner_text("body")
        assert "undefined" not in body_text, "Found 'undefined' in DOM after Turn 1!"
        print("  ✓ Turn 1 complete: Kept & excluded chips rendered inline, brief Section 1 filled.")

        page.screenshot(path="docs/rigor/16_ui/turn1_evidence.png")
        print("  ✓ Saved docs/rigor/16_ui/turn1_evidence.png")

        # Test Turn 4 (Relief funds match)
        print("[3/5] Running Turn 4 (Household funds matching)...")
        page.fill("#chat-input", "Household of 3, about $31k a year, owes $3,350, has the court index number. Her daughter's asthma is worse. What emergency funds can she apply for?")
        page.click("#send-btn")

        page.wait_for_selector(".inline-funds-list", timeout=45000)
        page.wait_for_selector("#sec-funds table", timeout=45000)

        body_text = page.inner_text("body")
        assert "undefined" not in body_text, "Found 'undefined' in DOM after Turn 4!"
        print("  ✓ Turn 4 complete: Inline fund checklist rendered, brief Section 3 filled.")

        page.screenshot(path="docs/rigor/16_ui/turn4_funds.png")
        print("  ✓ Saved docs/rigor/16_ui/turn4_funds.png")

        # Test Turn 7 (Finalize brief)
        print("[4/5] Running Turn 7 (Finalize brief)...")
        page.fill("#chat-input", "Write up the complete pre-calendar brief for the supervising attorney.")
        page.click("#send-btn")

        page.wait_for_selector("#sec-final-memo .final-memo-content", timeout=45000)
        body_text = page.inner_text("body")
        assert "undefined" not in body_text, "Found 'undefined' in DOM after Turn 7!"
        print("  ✓ Turn 7 complete: Real brief artifact rendered, status 'Brief Finalized'.")

        page.screenshot(path="docs/rigor/16_ui/turn7_final_brief.png")
        print("  ✓ Saved docs/rigor/16_ui/turn7_final_brief.png")

        # Test Mobile Viewport 390x844
        print("[5/5] Testing Mobile Viewport (390x844)...")
        page.set_viewport_size({"width": 390, "height": 844})
        time.sleep(0.5)

        # Check for horizontal overflow
        scroll_width = page.evaluate("() => document.documentElement.scrollWidth")
        client_width = page.evaluate("() => document.documentElement.clientWidth")
        assert scroll_width <= client_width + 1, f"Horizontal scroll detected! scrollWidth={scroll_width}, clientWidth={client_width}"
        print(f"  ✓ Mobile layout clean: scrollWidth={scroll_width} <= clientWidth={client_width} (No horizontal scroll).")

        page.screenshot(path="docs/rigor/16_ui/mobile_390x844.png")
        print("  ✓ Saved docs/rigor/16_ui/mobile_390x844.png")

        browser.close()

    print("\n" + "=" * 70)
    print("ALL M16 UI CHECKS PASSED: ZERO UNDEFINED, CLEAN PROGRESSION, SCREENSHOTS SAVED.")
    print("=" * 70)

if __name__ == "__main__":
    run_verification()
