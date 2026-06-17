# TTB LabelVerify

**A prototype alcohol label compliance tool for TTB / ATF agents.**

TTB LabelVerify allows agents to verify that a physical bottle label matches its approved COLA (Certificate of Label Approval) application — using real browser-based OCR to read the actual label image, not synthetic data.

---

## 👋 Reviewers & Evaluators — Start Here

> **No software installation is required.**
>
> Open the link below in any web browser (Chrome, Edge, Firefox, or Safari) and the app runs immediately.
>
> **Live App:** [https://shatech4orward.github.io/ttb-labelverify](https://shatech4orward.github.io/ttb-labelverify)
>
> **Reviewer Testing Guide (PDF):** [Download TTB_LabelVerify_Reviewer_Guide.pdf](https://github.com/shatech4orward/ttb-labelverify/raw/main/docs/TTB_LabelVerify_Reviewer_Guide.pdf)
>
> **Test Label Images:** [Download TTB_Test_Labels.zip](https://github.com/shatech4orward/ttb-labelverify/raw/main/releases/TTB_Test_Labels.zip)
>
> **Sample COLA Applications:** [Download TTB_Sample_COLA_Applications.zip](https://github.com/shatech4orward/ttb-labelverify/raw/main/releases/TTB_Sample_COLA_Applications.zip)
>
> The Reviewer Testing Guide walks you through testing step-by-step. Download it first.

---

## Live Demo

**[https://shatech4orward.github.io/ttb-labelverify](https://shatech4orward.github.io/ttb-labelverify)**

No installation required to test the live prototype.

---

## What It Does

| Feature | Detail |
|---|---|
| **Single Label Verify** | Upload one label image + one COLA application (PDF or manual entry) → instant field-by-field compliance report |
| **Batch Upload** | Upload a CSV of COLA applications + multiple label images → automatically matched and verified in sequence |
| **Real OCR** | Tesseract.js runs entirely in the browser — no server, no internet required for OCR |
| **PDF Parsing** | COLA application PDFs are parsed client-side using pdfjs-dist |
| **TTB Compliance Fields** | Brand Name, Class/Type Designation, ABV, Net Contents, Name & Address, Country of Origin, Government Warning |
| **Review Queue** | Labels flagged for agent review are surfaced in a dedicated queue |

---

## TTB Regulatory References

| Field | Regulation |
|---|---|
| Brand Name | 27 CFR 5.34 |
| Class/Type Designation | 27 CFR 5.35 |
| Alcohol Content (ABV) | 27 CFR 5.37 (spirits ±0.15%), 4.36 (wine ±0.14%), 7.71 (beer ±0.30%) |
| Net Contents | NIST Handbook 133 (±3%) |
| Name & Address | 27 CFR 5.35 / 4.32 / 7.22 |
| Country of Origin | 27 CFR 5.36 / 4.36 / 7.29 |
| Government Warning | 27 CFR Part 16 (ABLA 1988) |

---

## Architecture

This is a **pure frontend application** — no backend server, no database, no API calls to external services.

```
Browser
├── Tesseract.js (WASM)     — OCR runs offline in a WebWorker
├── pdfjs-dist              — PDF parsing runs offline in the browser
├── labelVerifier.ts        — TTB compliance engine (rule-based)
├── colaParser.ts           — Extracts fields from COLA application PDFs
├── store.ts                — In-memory session state (no localStorage)
└── React + Vite + Tailwind — UI framework
```

**Why no backend?** The original stakeholder requirement specified that the tool must work in a firewalled environment with no external internet access. All OCR data (WASM, language model, worker) is bundled locally and served from the same origin.

---

## Tools & Technologies

| Tool | Version | Purpose |
|---|---|---|
| React | 18 | UI framework |
| TypeScript | 5 | Type-safe application logic |
| Vite | 7 | Build tool |
| Tailwind CSS | 3 | Styling |
| shadcn/ui | — | UI component library |
| Tesseract.js | 7.0.0 | Browser-based OCR (WASM) |
| pdfjs-dist | 5.6.205 | Client-side PDF text extraction |
| Wouter | — | Hash-based client-side routing |
| Node.js | 18+ | Build-time only |

---

## Key Design Decisions & Assumptions

### OCR Approach
Tesseract.js was chosen over a cloud OCR API specifically to satisfy the **offline/firewall requirement** identified during stakeholder interviews. The `tessdata_fast` language model (5MB) is bundled locally. The WASM worker is patched at build time to disable IndexedDB caching (which is blocked in sandboxed environments).

### Compliance Logic
All TTB compliance checks are implemented in `client/src/lib/labelVerifier.ts`. The comparison strategy varies by field:

- **Brand Name** — Strict: requires ≥97% character similarity AND identical character count (±0 chars). Tolerates only known OCR noise (e.g. `0` vs `O`). Any missing letter is a Warning or Fail.
- **Class/Type** — Requires identical character count for Pass. Any length difference (missing letter) is a Fail regardless of similarity score, because TTB class designations are legally defined terms.
- **ABV / Net Contents** — Numeric comparison only, using TTB-specified tolerances per beverage type.
- **Name & Address** — Three-part check: full string similarity, company name segment separately, and state abbreviation separately. A missing or wrong state is always a Fail.
- **Government Warning** — Fuzzy match against the exact ABLA 1988 statutory text, with an ALL CAPS prefix check.

### What This Prototype Does Not Cover
- It does not connect to the real TTB COLA database (no public API available)
- It does not persist data between browser sessions (in-memory only)
- It does not handle wine or beer label formats as thoroughly as distilled spirits (primary focus)
- It does not verify label artwork dimensions, font sizes, or placement requirements
- Production deployment would require security hardening, authentication, and audit logging

---

## Local Setup & Run Instructions *(For Developers Only)*

> **Reviewers:** You do not need this section. Just open the [live app](https://shatech4orward.github.io/ttb-labelverify) in your browser.

The following instructions are for developers who want to run or modify the source code locally.

### Prerequisites
- [Node.js 18 or higher](https://nodejs.org/) — download and install if you don't have it
- A terminal / command prompt

### Step 1 — Download the code
Clone this repository or download it as a ZIP and unzip it.

```bash
git clone https://github.com/shatech4orward/ttb-labelverify.git
cd ttb-labelverify
```

### Step 2 — Install dependencies
```bash
npm install
```
This downloads all required libraries (~2–3 minutes on first run).

### Step 3 — Start the development server
```bash
npm run dev
```
Open your browser to **http://localhost:5000**

### Step 4 — Build for production
```bash
npm run build
```
The production-ready files are output to `dist/public/`.

---

## Test Labels & Sample Data

Download the test files below before testing:

| File | Download | Purpose |
|---|---|---|
| 8 PNG test label images | [TTB_Test_Labels.zip](https://github.com/shatech4orward/ttb-labelverify/raw/main/releases/TTB_Test_Labels.zip) | Pre-built label images with known compliance results |
| 8 COLA application PDFs | [TTB_Sample_COLA_Applications.zip](https://github.com/shatech4orward/ttb-labelverify/raw/main/releases/TTB_Sample_COLA_Applications.zip) | Matching COLA PDFs for the test labels |
| Reviewer Testing Guide | [TTB_LabelVerify_Reviewer_Guide.pdf](https://github.com/shatech4orward/ttb-labelverify/raw/main/docs/TTB_LabelVerify_Reviewer_Guide.pdf) | Step-by-step testing guide for reviewers |

### Test Scenarios
| Label File | Expected Result | What It Tests |
|---|---|---|
| `01_OLD_TOM_DISTILLERY_bourbon_PASS.png` | Pass | Clean match — all fields correct |
| `02_SILVER_RIVER_VODKA_PASS.png` | Pass | American Vodka — domestic product |
| `03_GLENCRAIG_SCOTCH_import_PASS.png` | Pass | Import with Country of Origin |
| `04_IRON_GATE_BOURBON_wrong_ABV_FAIL.png` | Fail | ABV on label does not match application |
| `05_BLUE_MESA_GIN_warning_titlecase_FAIL.png` | Warning | Government warning not in proper ALL CAPS |
| `06_STONE_RIVER_RUM_brand_mismatch_FAIL.png` | Fail | Brand name on label differs from application |
| `07_STONES_THROW_WHISKEY_capitalization_WARNING.png` | Warning | Brand name casing issue |
| `08_COPPER_PEAK_TEQUILA_no_warning_FAIL.png` | Fail | Government warning statement missing |

---

## Project Structure

```
ttb-label-app/
├── client/
│   ├── public/
│   │   ├── eng.traineddata          # Tesseract language model (5MB)
│   │   ├── eng.traineddata.gz       # Gzipped version served to worker
│   │   ├── tesseract-worker.min.js  # Patched Tesseract WebWorker
│   │   └── pdf.worker.min.mjs       # pdfjs worker
│   └── src/
│       ├── lib/
│       │   ├── labelVerifier.ts     # TTB compliance engine
│       │   ├── colaParser.ts        # COLA PDF field extractor
│       │   ├── store.ts             # OCR orchestration + session state
│       │   ├── ocr.ts               # Tesseract.js wrapper
│       │   └── csvParser.ts         # Batch CSV parser + label matcher
│       └── pages/
│           ├── Verify.tsx           # Single label verification UI
│           ├── BatchVerify.tsx      # 4-step batch upload wizard
│           ├── Queue.tsx            # Review queue
│           └── Dashboard.tsx        # Overview dashboard
├── script/
│   └── build.ts                     # Build script (auto-patches Tesseract worker)
├── sample_cola_applications/        # Sample COLA PDFs for testing
├── test_labels/                     # 8 test label PNG images
└── README.md
```

---

## Security Considerations (Production Notes)

This is a **prototype** built for evaluation purposes. Before any production deployment:

- Add authentication — agents must log in before accessing the tool
- Add audit logging — every verification must be timestamped and attributed to an agent
- Serve over HTTPS only
- Consider data classification — label images and COLA data may be sensitive
- The OCR WASM binary should be integrity-checked on load
- Firewall rules should restrict access to authorized TTB network ranges only

---

*Prototype built for TTB / ATF evaluation. For evaluation purposes only.*
