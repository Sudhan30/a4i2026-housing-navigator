# Rigor Evidence: Mission 16 — UI Redesign: Conversation + Living Brief (No Dashboard)

**Date:** 2026-11-17  
**Branch:** `m16-ui-redesign`  
**Author:** Squad 7 (New York Corridor)

---

## 1. Challenge Card Redesign Driver

> *"Not a dashboard, and not a single query with a chat box on it. An agent that an intake worker can hold a working conversation with."*

### What Was Removed
- **Stat tiles:** Removed all synthetic metric boxes (`stat-box`, `stat-grid`).
- **Tab bars:** Removed `.case-tabs` and all `.tab-btn` elements.
- **Hardcoded banners:** Removed `REJECTED x/y` and `PASS: n RESIDENTIAL` banners.
- **Turn button rows:** Moved the 1–7 turn buttons into a hidden "demo script" drawer opened via the `?` keyboard shortcut or a discreet header button.

---

## 2. Redesigned Two-Column Architecture

### Left 58%: Conversation with Hearth
- **Chronological Chat Feed:** Live feed with `aria-live="polite"` announcing new Hearth replies.
- **Inline Evidence Chips inside Hearth's replies:**
  - **Kept evidence chips:** `[✓ NYC-19346354 · Class A · mold · open since Nov 1]` — Clicking expands raw JSON attributes (`complaint_type`, `descriptor`, `date`, `tract`, `similarity`).
  - **Excluded chips struck-through:** `[~~DECOY-NEWY-05 · sim 0.80~~ Closed – Abated: repaired and re-inspected]`.
  - **Collapsed disclosure:** `<details>` block showing `"Raw search ranked these first"` for pre-filter vector search candidates.
  - **Fund lines with check marks:** Structured checklist rows displaying `ELIGIBLE ✅` or `INELIGIBLE ❌`.
  - **Inline Neighborhood Context:** Natural sentence inline: *"Tract 36061024500: Severe rent burden is 32.8% vs 25.2% NYC median; 414 modeled filings vs 196 median [Modeled]; 91.6% households without vehicles."*
- **Suggested Next Questions:** 2–3 soft chips dynamically updating under the latest reply to guide intake progression without hardcoded turn bars.
- **Composer:** Input text box, mic button (`aria-pressed` ready for M17), and send button.

### Right 42%: Tenant Stabilization Brief, Drafting
- **Paper Styling:** Background `--paper` (`#FBF8F1` light / `#1C1B19` dark), font `"Source Serif 4"`, generous margins, formal court caption:
  `CIVIL COURT OF THE CITY OF NEW YORK · HOUSING PART`
- **Progressive Sections:**
  1. Corroborating Municipal Records & Evidence Filter (populates after `search_habitability_evidence`).
  2. Applicable Housing Statutes & Legal Defenses (populates after `match_statutes`).
  3. Emergency Rental Assistance & Arrears Relief Match (populates after `match_relief_funds`).
  4. Neighborhood Context & Eviction Baseline (populates after `get_tract_context`).
  5. Evidentiary Boundary / What the Record Can't Prove Yet (accumulates from Hearth replies).
  6. Finalized Intake Memo & Equity Audit (dynamically fetches real brief artifact on `finalize_brief`).
- **Highlight Animation:** Soft amber fade (`@keyframes sectionHighlight`, 1.2s) whenever a section is filled or updated.
- **Print CSS:** `@media print` cleanly prints **only** the paper brief document, hiding headers, chat panes, toolbars, and drawers.
- **Provenance Line:** Dynamic line at document base:
  `Real: ACS 5-yr, NYC HPD/311 · [Modeled]: eviction filings · [Planted Case] decoys excluded: 7`

---

## 3. Automated Playwright UI Verification (`scripts/verify_m16_ui.py`)

Headless Chromium verified the complete intake sequence against the live Cloud Run backend and mock data:

```
======================================================================
M16 UI REDESIGN VERIFICATION (Playwright Headless)
======================================================================
[1/5] Navigating to http://localhost:8089...
  ✓ Zero dashboard tabs or stat tiles found.
[2/5] Running Turn 1 (Habitability search & decoy filter)...
  ✓ Turn 1 complete: Kept & excluded chips rendered inline, brief Section 1 filled.
  ✓ Saved docs/rigor/16_ui/turn1_evidence.png
[3/5] Running Turn 4 (Household funds matching)...
  ✓ Turn 4 complete: Inline fund checklist rendered, brief Section 3 filled.
  ✓ Saved docs/rigor/16_ui/turn4_funds.png
[4/5] Running Turn 7 (Finalize brief)...
  ✓ Turn 7 complete: Real brief artifact rendered, status 'Brief Finalized'.
  ✓ Saved docs/rigor/16_ui/turn7_final_brief.png
[5/5] Testing Mobile Viewport (390x844)...
  ✓ Mobile layout clean: scrollWidth=390 <= clientWidth=390 (No horizontal scroll).
  ✓ Saved docs/rigor/16_ui/mobile_390x844.png

======================================================================
ALL M16 UI CHECKS PASSED: ZERO UNDEFINED, CLEAN PROGRESSION, SCREENSHOTS SAVED.
======================================================================
```

### Visual Proof Artifacts
- `docs/rigor/16_ui/turn1_evidence.png` (1280x720 split screen with inline evidence chips & Section 1 filled)
- `docs/rigor/16_ui/turn4_funds.png` (1280x720 split screen with inline fund checks & Section 3 filled)
- `docs/rigor/16_ui/turn7_final_brief.png` (1280x720 split screen with finalized brief document rendered)
- `docs/rigor/16_ui/mobile_390x844.png` (390x844 viewport confirming zero horizontal scroll)
