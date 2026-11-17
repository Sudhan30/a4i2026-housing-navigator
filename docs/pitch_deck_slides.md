# SVL Squad 7 — Pitch Deck Content (Official 6-Slide Template)

Use this copy-paste ready, high-impact guide to populate the official Google Slides deck:  
👉 **[Google Slides Link](https://docs.google.com/presentation/d/19aH2OHVmDrKMQQ1cnWIomaW00oIFjy7weunEbPW4u0I/edit?pli=1#slide=id.h52fa8b8a4798773f_0_156)**

---

## Slide 1: Instructions (Keep as is in template)

---

## Slide 2: Title Slide

### **Header / Title:**
# STABILIZATION NAVIGATOR
### **Subtitle:**
### Autonomous Civic AI for Eviction Defense & Emergency Relief Matching

**Team:** SVL Squad 7 · Agents for Impact 2026  
**Metro Corridor:** New York City (`a4i_housing`)  
**Track:** Intake Triage & Emergency Relief Matching  

**Live Web App:** `https://sq7-intake-desk-530357188502.us-central1.run.app`  
**GitHub Repo:** `https://github.com/Sudhan30/a4i2026-housing-navigator`  

*Design tip for slide:* Put the title in bold Google Sans / Montserrat. Include badges: `Google ADK` · `Gemini 2.5 Flash` · `BigQuery Vector Search` · `Model Context Protocol (MCP)`.

---

## Slide 3: Our Team

| Role | Details |
|---|---|
| **TEAM NAME** | **SVL Squad 7 — Stabilization Navigator** |
| **NAME** | *[Insert Team Lead Name]* |
| **EMAIL** | *[Insert Team Email]* |
| **PHONE** | *[Insert Phone Number]* |
| **FILMING AVAILABILITY** | **Yes** *(Available Thursday 11/19 between 11:00 AM – 2:00 PM at MP7)* |
| **PROJECT SHARING** | **Yes** *(OK to share across Google)* |
| **SHARE WITH** | *[Optional: Colleague/Manager Emails]* |

---

## Slide 4: Real-World Challenge

### **Slide Title:**
### The Eviction Corroboration Crisis Under a Running Clock

### **The Problem:**
- **Thursday 3:40 PM &rarr; Monday 9:30 AM Hearing:** Low-income tenants facing nonpayment eviction routinely live in hazardous housing (no heat, raw sewage, toxic mold) that the city *already knows about*. Yet their court files contain zero evidence.
- **The 5-Minute Default Trap:** Tenants forfeit non-waivable statutory habitability defenses and $15,000+ relief grants in hallway settlements because municipal building-code databases, court dockets, and emergency funding rules sit in disconnected operational silos.
- **Triage Under Scarcity:** Right-to-counsel clinics have waiting rooms full of families and only 10 minutes per intake to separate active residential hazards from closed repairs, commercial records, and noisy text.

### **Broader Societal Scale (Who Benefits):**
- **437,111 Renter Households:** Across the NYC corridor, **25.2%** are severely rent-burdened (>50% income to rent).
- **Cost of Inaction:** A single eviction costs municipal shelter systems **$81,000/year**, whereas connecting a family to an emergency stabilization grant costs **$3,350**.
- **Equitable Due Process:** Elevates citizen crisis narratives into defensible legal memos before the judge calls the calendar.

---

## Slide 5: Our Agent

### **Slide Title:**
### Autonomous Intake Desk: From Plain Speech to Legal Brief in 90s

### **How Target Users Interact:**
- **Citizen-Language Intake:** Clinic paralegal or pro se tenant inputs everyday speech: *"Radiators stone cold since November, black mold around the tub, hearing Monday."*
- **Live 4-Tab Case File Interface:**
  1. **Corroborating Evidence:** Generates semantic candidates with Gemini embeddings; filters out commercial/abated traps (caught 9/9 planted decoys!).
  2. **Relief Funds Match:** Evaluates household income, family size, and court index against NYC relief grants with instant pass/fail checkmarks.
  3. **Statutory Law Defense:** Cites NY RPL § 235-b, NYC Admin Code § 27-2115 (Class C 24h repair period), and Spiegel Law rent-suspension.
  4. **Tenant Stabilization Brief:** Auto-drafts a court-ready attorney memo with copy and print actions.

### **Concrete Positive Outcomes:**
- **Zero Hallucination Eligibility:** Python deterministic rules engine (`funds.py`) computes eligibility; Gemini explains the verdicts. Matches **$42,500** in relief capacity (One Shot Deal, CityFHEPS, Legal Aid, ERP Clinic).
- **Evidentiary Boundary Discipline:** Refuses to accept oral landlord claims as proof; advises official municipal re-inspection and photo logs.
- **Self-Audited Equity Engine:** Flagged **37 "Silent Distress" tracts** (33,980 rent-burdened families) who under-report 311s due to fear, routing them to emergency inspection intake.

---

## Slide 6: Data Ecosystem

### **Slide Title:**
### Enterprise Civic Data Pipeline on BigQuery

### **Curated BigQuery Tables & Models:**
1. **`municipal_311_housing_complaints`:** 165 real NYC residential habitability complaints + 9 planted decoy cases (`DECOY-*`). Embedded into 768-dim vectors using `gemini-embedding-2` via BigQuery Vertex Connection (`us.a4i-vertex`).
2. **`v_tract_context` & `court_eviction_filings`:** Modeled county-baseline filings pre-aggregated across 4 quarters to eliminate the **4× join inflation trap** (protecting tract metrics from artificial quadrupling).
3. **`acs_5yr_housing_tenure`:** 168 NYC census tracts, 437,111 renter households, severe rent burden rates, poverty ratios, and vehicle access.
4. **`v_metro_baseline`:** Corridor-wide benchmark medians for relative hardship comparison (32.8% neighborhood burden vs. 25.2% citywide).

### **Data Governance & Integrity Invariants:**
- **Strict Isolation of `audit_*` Columns:** Demographic fields are quarantined to post-output equity evaluation (`agent/navigator/equity.py`); zero leakage into embeddings, prompts, or scoring.
- **Zero PII & 100-Block Resolution:** Addresses generalized to 100-blocks (e.g. `1000 Block St Nicholas Ave`).
- **Honest Labeling:** Court filings explicitly marked `[Modeled]`; decoys marked `[Planted Case]`.
- **Brute-Force Vector Distance:** Scaled for high accuracy without index approximation (`use_brute_force: true`, `top_k >= 15`).

---

## Slide 7: Technical Blueprint / Architecture

### **Slide Title:**
### Multi-Tier Agent Architecture: ADK, MCP & BigQuery

```
┌────────────────────────────────────────────────────────────────────────┐
│                   CLIENT TIER · INTAKE DESK WEB APP                   │
│   Deployed on Cloud Run: https://sq7-intake-desk-...run.app            │
│   • 40% Chat Console (Turns 1–7 Fast Triage)                           │
│   • 60% Case File: [Evidence] | [Relief Funds] | [Statutes] | [Brief]  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTPS (Same-Origin Reverse Proxy)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│             AGENT RUNTIME TIER · GOOGLE ADK + GEMINI 2.5 FLASH         │
│   Deployed on Cloud Run: https://sq7-stabilization-navigator-...run.app│
│   • Multi-Turn State: 100-Block, Hazards, Hearing Clock, Household     │
│   • Candidate Generator + Relational Decoy Rejection Engine            │
│   • Deterministic Python Eligibility Engine (tools/funds.py)           │
│   • Evidentiary Boundary Verifier (Distinguishes Proof vs Claim)       │
└───────────────────┬───────────────────────────────┬────────────────────┘
                    │ Tool Calls                    │ Vertex AI Embeddings
                    ▼                               ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────┐
│       DATABASE TOOLBOX (MCP)         │  │   BIGQUERY DATA PLATFORM     │
│  Deployed on Cloud Run:              │  │   Dataset: a4i_housing (US)  │
│  https://sq7-mcp-toolbox-...run.app  │  │   Connection: us.a4i-vertex  │
│  • get_tract_context (Fan-Out Safe)  │  │   • 168 Census Tracts        │
│  • metro_baseline                    │  │   • 174 Embedded 311 Records │
│  • list_relief_programs              │  │   • gemini-embedding-2       │
└──────────────────────────────────────┘  └──────────────────────────────┘
```

### **Key Technical Innovations:**
- **Decoy Rejection Invariant:** Vector similarity ranked closed boiler repair #1 (`DECOY-NEWY-04`, sim 0.80). Hard relational rule (`property_type = 'Residential' AND closed_date IS NULL`) caught 9/9 decoys with human-readable rationale.
- **Zero Cold Starts:** MCP Toolbox and Agent deployed with `--min-instances=1`. Rehearsal latency averaged **<6s per turn**.
- **Post-Output Batch Audit:** Automated BigQuery audit revealed **37 silent distress tracts** with **74.9%** no-vehicle rates, automatically triggering emergency inspection routing.
