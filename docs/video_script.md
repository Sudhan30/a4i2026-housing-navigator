# Hearth: 3-Minute Video Script

> **Rendered videos (no audio, no subtitles):** [`docs/demo/hearth_demo.mp4`](demo/hearth_demo.mp4) — 2:40 walkthrough that follows this script, ready for your own voiceover · [`docs/demo/hearth_features_demo.mp4`](demo/hearth_features_demo.mp4) — 1:41 feature tour (case queue, reopening a case, map layers and record details, panel expand/hide/resize, a new Brooklyn intake, audio-file attachment, the caseload question, deleting a case). Both recorded on the live site; Marisol is a fictional composite, the records are real NYC data.

**Run time:** 2:55 (hard limit 3:00) · **Recorded on:** the live Intake Desk, https://sq7-intake-desk-530357188502.us-central1.run.app, Chrome, 1440×900 or 1280×720
**Squad 7 · New York · Track: Today at intake + relief funds · Required differentiator: BigQuery Vector Search**

Every line below was run end to end on the live site (see "What we verified" at the bottom). Numbers come from the repo; nothing is invented.

---

## Before you press record (5 minutes)

1. Open the app in a fresh Chrome window, allow the **microphone**, and turn on system audio capture if you want "Read aloud" in the video.
2. Click **Cases**: you should see the saved demo cases (the Bronx University Ave case is red, under 72 h). Leave them; they make the queue look real.
3. Have two files on the desktop: a **photo of the court notice** (the fictional sample in `docs/demo/notice.png` works; tenant and landlord names on it are made up) and a **real phone photo** of mold or a leak (any bathroom wall photo; Gemini's read varies by photo).
4. Close the Cases drawer and click **+ New intake** so you start on the welcome screen.
5. Do one silent rehearsal: Cloud Run is warm after the first request.

---

## [0:00–0:20] Hook: Marisol's Monday
**Screen:** Welcome screen ("New intake"), then the empty composer.
**Voiceover:**
> "Thursday afternoon. Marisol has a nonpayment hearing Monday at 9:30. Her radiators have been cold since early November, there's black mold around the tub, and water is coming through the bathroom wall. The city has already cited these conditions. Her court file doesn't know. Dev, the paralegal, has twenty minutes."

## [0:20–0:45] She speaks Spanish: voice intake (Cloud Speech-to-Text)
**Screen:** Click **ES**, press the **mic**, play or speak: *"Vivo en la cuadra mil de Saint Nicholas Avenue… tengo corte el lunes a las nueve y media… los radiadores están fríos, hay moho negro en la bañera y entra agua por la pared del baño."* Stop. The Spanish transcript appears in the box. Press Enter.
**Voiceover:**
> "Seventy percent of households in her census tract are Hispanic, a number from our own equity audit, so intake works in Spanish. Google Cloud Speech-to-Text transcribes; Hearth answers Dev in English."

## [0:45–1:20] Vector search catches what keywords miss, and the decoy it rejects
**Screen:** Hearth's short reply plus the **On the record** card: Google Map (tenant's block ring, 800 m radius, red/amber/grey pins), three rows: *Mold · Non-hazardous · 90 days*, *Water leak · Hazardous · 30 days*, *Heating system · Immediately hazardous · 24 h to fix*. Point at the grey callout: *"Search ranked DECOY-NEWY-05 #1 (or #2) by meaning, but the rules set it aside: already fixed and re-inspected."* (The exact rank depends on how the intake is phrased.) Expand "look-alikes set aside" for one second.
**Voiceover:**
> "Tenants say 'radiators are cold'; inspectors write 'provide ready access to heating system.' BigQuery vector search with Gemini embeddings matches meaning, not keywords. Three open violations on her block, including an immediately hazardous heat violation the landlord had 24 hours to fix.
> But one of the top matches was a mold case that was already repaired. Vector search proposes; our rules decide. Closed, commercial and no-violation look-alikes are set aside, and Hearth says why."

## [1:20–1:35] Ask why
**Screen:** Click the **Next** suggestion: *"Why did you set aside DECOY-NEWY-05? It looked like a strong match."*
**Voiceover:**
> "Dev can challenge any decision. Citing a repaired condition would hurt her in court, and Hearth explains exactly that."

## [1:35–1:55] Photograph the paperwork (Gemini vision)
**Screen:** 📎 → **Court notice or rent demand** → pick the notice photo. The card shows *Notice of Petition · L&T 312455/26 · hearing Nov 23 9:30 · arrears $3,350 · petitioner*. Click **Use in case**: the worksheet's Index No. and Petitioner fill in, and Hearth re-checks the funds. Optional: 📎 → **Photo of a condition** with the mold photo; the card says *visual estimate, not an HPD finding* and lists what the photo can't prove.
**Voiceover:**
> "Snap the court notice. Gemini reads the index number, hearing and arrears, never the tenant's name, and one click puts it in the case. Photos of conditions are described too, labeled as visual estimates, with what a photo can't prove."

## [1:55–2:15] Money, decided by rules, not by the model
**Screen:** The **Relief funds** card: *4 of 4 eligible · checked by rules*. Expand one fund to show the ✓ rule checks and the apply link. Point at the countdown badge in the top bar.
**Voiceover:**
> "Four NYC programs, each checked by deterministic rules: income against 200% of poverty, arrears against the cap, an open violation where required. Her daughter's asthma is noted for the attorney and never used to decide eligibility. And the clock in the corner never lets Dev forget the hearing."

## [2:15–2:40] The worksheet, edited by a human, saved, and filed with the attorney
**Screen:** Type *"Draft the brief for the attorney."* The right panel's court-style worksheet stamps **READY FOR REVIEW**. Click **Edit**, fix one line, **Done editing**. Click **Download fillable PDF** and open it: fields are editable. Then click **Cases**: the queue sorted by deadline, each with its next action.
**Voiceover:**
> "As they talk, the worksheet fills itself in: the records, the defenses, the referrals, and what still needs proof. The paralegal stays in control: edit anything, and it downloads as a fillable PDF the attorney can keep correcting. Every case saves to Firestore, so tomorrow Dev asks Hearth 'which cases need attention today?' and starts with the most urgent hearing."

## [2:40–2:55] Honesty and architecture
**Screen:** Architecture slide: ADK agent on Cloud Run · Gemini 2.5 Flash · BigQuery Vector Search (AI.EMBED + VECTOR_SEARCH) · MCP Toolbox · Firestore · Cloud Speech-to-Text and Text-to-Speech · Google Maps.
**Voiceover:**
> "Real Census and city records; eviction filings modeled and labeled. We audited our own rule: requiring a 311 ticket would skip 37 high-pressure tracts holding 33,980 severely rent-burdened households, so those families are routed to inspections and funds that don't need an open case. Built on Google Cloud so Marisol walks into court Monday with a defense."

---

## What we verified on the live site (24 steps)

Run by `fulltest.js` against the deployed Intake Desk (agent revision 00011, Intake Desk revision 00011):

| Step | Result |
|---|---|
| Spanish dictation (Cloud STT) | Transcribed word for word |
| Turn 1 | 3 open records incl. the Class C heat violation; decoy set aside; case auto-saved |
| Plain-language hazards, Google Map, layer toggles, countdown | All present |
| "Why did you set aside DECOY-NEWY-05?" | Explains "closed – abated" |
| Law | RPL § 235-b, Admin Code § 27-2115, SSL § 143-b |
| Court notice (Gemini) | Index, hearing, arrears, petitioner extracted; tenant name and unit not extracted; filled the worksheet |
| Photo of a condition (Gemini) | Card rendered with a visual estimate and limits (result depends on the photo) |
| Audio file (Gemini) | Transcribed into the message box |
| Funds | 4 of 4 eligible with rule checks |
| Neighborhood | 32.8% vs 25.2% severe rent burden, filings labeled [Modeled] |
| Landlord says it's fixed | "Remains open… public records do not confirm" the repair |
| Brief | Worksheet stamped READY FOR REVIEW |
| Edit + fillable PDF | Edit kept; PDF downloads with editable fields |
| Read aloud / Read summary (Cloud TTS) | Audio returned |
| "Which cases need attention today?" | Hearth lists cases, most urgent first |
| Reload | 20 messages and the edited worksheet restored from Firestore |
| Delete case | Confirm step, case removed |
| Phone width, JavaScript errors | No overflow, no errors |

## Lines to avoid saying
- Don't add up fund caps ("$42,500 in relief"): programs don't stack that way.
- Don't call the photo analysis an HPD determination; it's a visual estimate.
- Don't say the worksheet is filed with the court; it's an internal worksheet for the attorney.
