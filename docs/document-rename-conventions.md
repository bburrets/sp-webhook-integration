# Document Classification & Auto-Rename

Folder-scoped sweep that classifies PDFs in one document-library folder as CHECK, COSTING, GLJE, or
WIRE, checks each filename against that type's convention, and renames the file via Graph when it is
wrong. Replaces the rename half of what the `FIN_SCAN_Rename_And_Storage` UiPath robot does.

**Status: CHECK, WIRE and GLJE confirmed by the business 2026-09-02** and no longer marked
`placeholder`, so `RENAME_DRY_RUN` (default `true`) is the only guard left before a live rename.
COSTING remains disabled — see [Why COSTING is blocked](#why-costing-is-blocked).

**Configured target: `Shared Documents`** — the intake side, scanned recursively.

---

## The library, as it actually is

Two libraries matter, and they are different stages of the same process.

**`Shared Documents`** is the intake side — four type trees with dated subfolders,
holding files *before* renaming:

```
Shared Documents/Intake_Checks/{YYYY}/{YYYY_MM}/    Intake_GL-JE/{YYYY_MM}/
                 Intake_Wires/{YYYY_MM}/            Intake_Costing/{YYYY_MM}/
```

**`OutputBox`** is the authoritative post-rename form — four type folders:

```
OutputBox/CHECK/{YYYY}/{YYYY_MM}/   OutputBox/GLJE/{YYYY_MM}/
OutputBox/WIRE/{YYYY_MM}/           OutputBox/COSTING/          <- flat, no dated subfolders
```

Site: `fambrandsllc.sharepoint.com:/sites/Accounting_Research:`
`Shared Documents` drive: `b!MNl2melzSku5UeMBUY9PWOyLv-T4SmhAkW7yOrut5I8c6HMQ6ug8SKyMaAFI2eIV`
`OutputBox` drive: `b!MNl2melzSku5UeMBUY9PWOyLv-T4SmhAkW7yOrut5I8vpiUbqxDrQYNnAgjCGYgK`

**The conventions in this document are the OutputBox ones.** For CHECK and GLJE the two sides agree.
For WIRE they do not: intake holds `Wire__$18,593.28_02_03_2026.pdf` while OutputBox holds
`WIRE_251103B02FHR_$237,800.00.pdf` — a completely different shape keyed on the bank reference
rather than the date.

Two consequences for the sweep:

- **The document type is decided by the folder, not the content.** A file under `CHECK/` is a check.
  The classifier weights this above content and filename — see below.
- **Subfolders are walked by default.** Pointing at the library root covers every type and every
  month, and needs no maintenance as new month folders appear. Ceilings of 20,000 files and 500
  folders stop a misconfigured scan from issuing thousands of requests.

### The documents are OCR'd scans, and the OCR is poor

This is the finding that matters most. The PDFs carry a text layer, so the `NoTextLayer` gate does
**not** catch them — but the text is degraded scan output, not clean digital text.

From a real check: `11512026` is `1/5/2026` with the slashes read as `1`s; `3   8490` is the check
number split by a space; `5,ooy0'` is the amount. But `Check:   0000038490` and the payee
`MICHAEL RADOCHAY` come through clean.

From a real GL journal: `6t30t2026` (slashes read as `t`), `I\4EDICAL` for `MEDICAL` — but
`G/L   Date:   6/30/2026` is clean.

From a real wire: the PAR Number `251103B02FHR` reads as `251'103802FH   R` — a stray apostrophe,
injected spaces, and **`B` misread as `8`**. The amount `$237,800.00` is clean.

The malformed filenames already in the library are the fingerprints of an earlier
regex-over-bad-OCR attempt with no validation: `WIRE_251125801YWH_$825,471.00.pdf` and
`WIRE_2511258020FR_$843,967.08.pdf` (both `B0` → `80`), `Wire__$963,164.00_32_12_2026.pdf` (32 is not
a month), `CHECK_38509_ Dalya Pop_11_07_2026.pdf` sitting beside the correct
`Check_38509_DAL YA POP_1_7_2026.pdf`.

**Every one of those is refused by the rules here.** Patterns anchor on the lines that survive OCR
(`Check:`, `G/L Date:`, `Amount`), and the validate regexes are shaped to reject the known
corruptions — the WIRE regex requires a literal `B` in position 7, so `251103802FHR` fails and lands
on the exception path instead of becoming a wrong bank reference. An impossible date yields an empty
value, a missing field becomes `MissingFields`, and a rendered name that fails its own convention is
refused. So a bad extraction produces an exception, never a wrong rename. The open question is not
safety but **hit rate**, and only a dry run can measure it.

---

## Pipeline

```
document-rename-timer (hourly, 0 30 * * * *)
  └─ list the configured folder (paginated, follows @odata.nextLink)
  └─ skip: non-PDF · already compliant · terminal status · attempts exhausted
  └─ enqueue one message per candidate
         │
      [document-rename] queue  ──> document-rename-worker (one file per invocation)
         │                            └─ re-read driveItem (fresh download URL)
         │                            └─ download → pdf-parse text layer
         │                            └─ classify → validate name → extract fields → render
         │                            └─ PATCH /drives/{driveId}/items/{id}  { name }
         └─ document-rename-poison        └─ on any failure: write status columns, no rename
```

The timer performs no file I/O and no writes. Splitting the work keeps both functions well inside the
5-minute Consumption timeout (`host.json` sets no `functionTimeout`).

The timer's schedule is offset 30 minutes from `webhook-sync-timer`'s `0 0 * * * *` so the two do not
contend for Graph auth and throttle budget on the same tick.

---

## Rule schema

One JSON file per document type in `src/config/document-types/`. Validated at load time — a bad
pattern or an unresolvable template placeholder throws rather than producing a wrong filename.

```json
{
    "type": "GLJE",
    "placeholder": true,
    "enabled": true,
    "extensions": [".pdf"],
    "classify": {
        "filenameHints": ["glje", "gl je"],
        "contentPatterns": ["General\\s+Journal\\s+Entry", "JE\\s*Number"],
        "minMatches": 1
    },
    "fields": {
        "entity":   { "pattern": "Entity:\\s*([A-Za-z0-9]+)", "required": true, "transform": ["upper", "alnum"], "maxLength": 10 },
        "period":   { "pattern": "Period:\\s*(\\d{4}[-/]?\\d{2})", "required": true, "transform": ["digits"] },
        "jeNumber": { "pattern": "JE\\s*#?\\s*(\\d{3,12})", "required": true, "transform": ["digits"] }
    },
    "template": "GLJE_{entity}_{period}_{jeNumber}",
    "validate": "^GLJE_[A-Z0-9]{1,10}_\\d{6}_\\d{3,12}\\.pdf$"
}
```

| Key | Meaning |
|---|---|
| `type` | Uppercase document type. Must be unique across files. |
| `placeholder` | `true` forces dry-run for the whole feature, regardless of `RENAME_DRY_RUN`. Set `false` only once the patterns are real. |
| `enabled` | `false` removes the type from classification entirely. |
| `extensions` | Lowercase, dot-prefixed. A file whose extension no rule set accepts is skipped silently. |
| `classify.filenameHints` | Lowercase substrings matched against the filename stem. Any number of hits counts as **one** signal. |
| `classify.contentPatterns` | Regexes matched against extracted text, case-insensitive. Each hit counts as one signal and is weighted **2×** a filename hit. |
| `classify.minMatches` | Minimum signals for the type to be considered at all. |
| `fields.<name>.pattern` | Case-insensitive regex; **capture group 1** is the value. |
| `fields.<name>.patterns` | Array of regexes tried in order; the first with a capture wins. Use when the same field sits in different places in different document variants. Mutually exclusive with `pattern`. |
| `fields.<name>.generate` | Mint the value instead of reading it. Currently only `"digits"`. Mutually exclusive with `pattern`, and cannot be optional. |
| `fields.<name>.length` | Digit count, required when `generate` is set. |
| `fields.<name>.required` | Default `true`. An optional field must declare a `default`. |
| `fields.<name>.transform` | Ordered transform chain (below). |
| `fields.<name>.maxLength` | Truncation cap applied after transforms. |
| `template` | `{placeholder}` per field. Every placeholder must have a field and every field must be used. |
| `validate` | Regex the **rendered filename including extension** must satisfy. |

### Transforms

`trim` · `upper` · `lower` · `digits` (keep digits only) · `alnum` (keep letters and digits only) ·
`collapse` (whitespace runs → single hyphen) · `numeric` (keep only what can appear in a figure) ·
`thousands` (`18593.28` → `18,593.28`) · `date:YYYYMMDD` · `date:YYYYMM` · `date:YYYY-MM-DD` ·
`date:MMDDYYYY` · `date:YYMMDD` · `date:M_D_YYYY` · `date:MM_DD_YYYY`

`numeric` strips the whitespace and apostrophes OCR injects into figures without altering a digit.
It cannot repair a *substituted* digit -- `$18,s93.28` becomes `18`, which the per-type validate
regex then refuses rather than letting a wrong figure through.

Dates parse `M/D/YYYY`, `M-D-YY`, `MM.DD.YYYY` (US ordering) and `YYYY-MM-DD`. Two-digit years below
70 read as 20xx. An impossible date (`13/45/2026`) yields an empty value, which is reported as a
missing field rather than embedded in a filename.

### Generated fields

A field can be minted at rename time rather than read from the document:

```json
"jeNumber": { "generate": "digits", "length": 6, "required": true }
```

GLJE's trailing 6-digit id works this way — it appears nowhere in the document. Three consequences:

- **A dry run's proposed GLJE name will not equal the name a later live run produces.** Check the
  shape, not the exact value. CHECK and WIRE are fully derived from the document and *are*
  reproducible.
- **A collision on a generated value is bad luck, not information**, so the worker re-mints and
  retries (up to 5 times) rather than raising `NameCollision`. A collision on an extracted value
  still means something and still goes to the exception path.
- **Idempotency still holds**, because a file is checked against its convention *before* any value
  is generated. An already-correct file is skipped without ever minting a number.

Values use `crypto.randomInt`, not `Math.random`.

### Sanitisation

After transforms, every value is stripped to `[A-Za-z0-9-]` unconditionally, regardless of the
declared transform chain. Extracted values come from documents we do not control, so a vendor name
containing `/`, `"`, or the `_` token separator cannot reach a filename. Hyphen runs are collapsed
and trimmed.

Two guards make renames safe to repeat:

- A rendered name must satisfy its own `validate` regex, so a rename can never produce a name the
  next sweep considers non-compliant. That is what prevents an endless rename loop.
- A file whose name already satisfies any convention is skipped without being downloaded.

---

## Configuration

The scan target is a **URL you paste from the browser address bar** — not a site path, drive id or
drive-relative folder path, none of which are visible anywhere in SharePoint. The library name in
the URL is resolved to a Graph drive at scan time.

| App setting | Default | Meaning |
|---|---|---|
| `RENAME_ENABLED` | `false` | Master switch. The sweep does nothing until this is `true`. |
| `RENAME_DRY_RUN` | `true` | When true, everything runs except the `PATCH`; the proposed name is written to `RenameDetail`. |
| `RENAME_LIBRARY_URL` | — | The library or folder to scan. See below. |
| `RENAME_RECURSIVE` | `true` | Walk subfolders. Leave on: this library nests by type and month. |
| `RENAME_CLASSIFY_BY_FOLDER` | `true` | Consult the folder when a document's own content is inconclusive. Content always classifies first regardless. |
| `RENAME_MAX_PER_SWEEP` | `500` | Cap on candidates enqueued per sweep, so a first run against a backlog does not enqueue everything at once. |

Both booleans default to the safe value: a missing or misspelled setting cannot cause a live rename.

### What to put in RENAME_LIBRARY_URL

Open the library or folder in SharePoint and copy the address bar. Every form these produce works:

```
# whole library, all four type folders and every month underneath
https://.../sites/Accounting_Research/OutputBox/Forms/AllItems.aspx

# one type, all months underneath
https://.../sites/Accounting_Research/OutputBox/Forms/AllItems.aspx?id=%2Fsites%2F...%2FOutputBox%2FCHECK

# one month only
https://.../sites/Accounting_Research/OutputBox/CHECK/2026/2026_01
```

The URL sets the **starting point**; `RENAME_RECURSIVE` decides whether everything below it is
included. Pointing at the library root with recursion on is the intended configuration — it needs no
maintenance as new month folders appear.

There is deliberately no list id or site path to configure. Status columns are written through
`/drives/{driveId}/items/{itemId}/listItem/fields`, which needs only what the scan already knows.

### Folder hints cover both libraries

The two libraries name their type folders differently, so every rule set carries both:

| Type | OutputBox | Shared Documents (intake) |
|---|---|---|
| CHECK | `CHECK` | `Intake_Checks` |
| WIRE | `WIRE` | `Intake_Wires` |
| GLJE | `GLJE` | `Intake_GL-JE` |
| COSTING | `COSTING` | `Intake_Costing` |

A folder belonging to a **disabled** type is skipped by the timer without downloading anything, so
with COSTING off the sweep never touches `Intake_Costing`.

### How a document's type is decided

**Content decides.** A document is classified from its own text and filename first. The folder it
sits in is consulted only when that produces no answer -- nothing matched, or two types tied.

Measured against verbatim OCR text from real documents in this site
(`test/fixtures/ocr-samples.js`, guarded by `document-classification-accuracy.test.js`): all four
types are identified from content alone, and an unrelated document is declined. The suite also
tells every sample it lives in `Intake_Wires` and checks content still wins, so a misfiled document
is classified by what it actually is.

Two details make this work on degraded scans:

- Patterns anchor on the labels that survive OCR (`Check:`, `Check Total`, `G/L Date`,
  `SENDERS REFERENCE`, `WIRE AMOUNT`, `INVOICE NO`) rather than on prose.
- The worst-OCR costing invoice carries no clean label at all, so COSTING also matches OCR-tolerant
  import-invoice markers using character classes for this scanner's substitutions (`O`/`0`,
  `I`/`l`/`1`) -- enough to read `COINIRt Of ORICI` as "country of origin" and `MANUTACTURET` as
  "manufacturer".

Scoring, applied within a single pass:

| Signal | Weight |
|---|---|
| Each matching `contentPattern` | 2 |
| Filename matches `filenameHints` | 1 |
| Folder segment matches `folderHints` (fallback pass only) | 4 |

`RENAME_CLASSIFY_BY_FOLDER=false` disables the fallback for pure content classification.
`classify()` reports `via: 'content' | 'folder'` so a dry run shows how each decision was reached.

**What the fallback costs.** A document with no readable markers is typed from its folder. That
rescues badly scanned real documents, but an unrelated file sitting in a type folder is also typed
rather than declined -- it then fails field extraction and lands on the exception path as
`MissingFields` instead of the more accurate `Unclassified`. It never produces a wrong rename, only
a less precise status. Given the OCR quality, recall on real documents is worth more than precision
on stray files.


## SharePoint columns

Add these seven columns to the target document library before enabling the sweep. The code writes
them through `/drives/{driveId}/items/{itemId}/listItem/fields`, so the **internal** name must match
exactly.

| Column name | Type | Settings |
|---|---|---|
| `DocTypeDetected` | Single line of text | — |
| `RenameStatus` | Choice | The ten values below; tick **Allow custom values** |
| `RenameDetail` | Multiple lines of text | **Plain text** (not enhanced rich text), 6 lines |
| `RenameAttempts` | Number | 0 decimal places |
| `RenameProcessedAt` | Date and Time | Include time |
| `RenamePreviousName` | Single line of text | — |
| `RenameContentHash` | Single line of text | — |

`RenameStatus` values:

```
Renamed            AlreadyCompliant   NoTextLayer      Unclassified    MissingFields
NameCollision      UnsupportedType    DryRun           Error           PermanentlyFailed
```

### Three settings that matter

**Create the names with no spaces.** SharePoint derives the internal name from the display name at
creation time, so `Rename Status` becomes `Rename_x0020_Status` and every write fails. Type the names
exactly as above. Renaming the display name afterwards is safe — the internal name is fixed at
creation.

**Leave every column's default value EMPTY.** This is a correctness requirement, not tidiness. The
timer reads `RenameStatus` and `RenameAttempts` to decide what to skip: a default of `Renamed` would
make every file look finished and the sweep would process nothing, and a default `RenameAttempts` of
3 would make every file look exhausted. Do not mark any column required either — files start with
these blank by design.

**`RenameDetail` must be plain text.** The enhanced-rich-text option wraps content in HTML, and this
field is written as a plain string capped at 900 characters.

**Allow custom values on `RenameStatus`.** The ten values above are everything the code writes today,
but a Choice column rejects anything unlisted, which would fail the status write and lose the record
of what happened. Allowing custom values makes a future status addition a non-event.

### Give-up behaviour

Outcomes that cannot change while the content stays the same — `NoTextLayer`, `Unclassified`,
`MissingFields`, `UnsupportedType` — set `RenameAttempts` straight to 3, so the hourly sweep stops
re-downloading the file while the status still names the real reason. `NameCollision` can resolve on
its own once the other file moves, so it increments normally and retries. A changed
`RenameContentHash` re-arms the file for a fresh set of attempts.

---

## Scanned PDFs are not handled

Extraction reads a PDF's embedded text layer via `pdf-parse`. A scanned document has none, so it is
recorded as `NoTextLayer` and never renamed. This was a deliberate decision to ship without an OCR
dependency; the dry-run pass reports the real share of scans in the folder, which is the number that
decides whether OCR needs revisiting.

---

## Confirming the rules

Derived from real OutputBox filenames on 2026-09-02. Each is still `"placeholder": true` pending
confirmation.

| Type | Convention | Example (real file) | Confidence |
|---|---|---|---|
| CHECK | `Check_{number}_{PAYEE}_{M}_{D}_{YYYY}.pdf` | `Check_38490_MICHAEL RADOCHAY_1_5_2026.pdf` | **Extracts end to end today.** Note `Check` is title case and the date is **not** zero-padded. |
| WIRE | `WIRE_{parNumber}_${amount}.pdf` | `WIRE_251103B02FHR_$237,800.00.pdf` | **Extracts end to end, Fed and international alike.** The reference comes from the transaction-detail page, which is not page 1 and can be the last page. `WIRE` is uppercase, single underscore, no date — the reference encodes it (`251103` = 2025-11-03). |
| GLJE | `GLJE_{MM}_{DD}_{YYYY}_{6 digits}.pdf` | `GLJE_11_03_2025_129334.pdf` | **Extracts end to end today.** The G/L date comes from the document; the trailing 6 digits are **randomly generated** (confirmed 2026-09-02), so the name is not reproducible between runs. |
| COSTING | `{Vendor} -  {InvoiceNumber}.pdf` (separator is space-hyphen-**space-space**) | `MOLAX TRADING LIMITED -  BIM-26-006.pdf` | **Blocked, ships disabled.** The invoice number extracts reliably; the vendor name does not. See below. |

### Dry-run result, 2026-09-02

Real documents, real pipeline code, no writes.

| File | Outcome |
|---|---|
| `Intake_Checks/2026/2026_01/Check_38490_MICHAEL RADOCHAY_1_5_2026.pdf` | skipped, already compliant |
| `Intake_GL-JE/2026_06/GLJE_06_30_2026_418627.pdf` | skipped, already compliant |
| `Intake_Costing/2026_08/costing_Image_001.pdf` | skipped, type disabled |
| `Intake_Wires/2026_02/*` | see the correction below |

Classification was correct in every case and `via: content` throughout -- the folder fallback was
never needed.

#### Correction: the WIRE fields are on a later page

A first pass concluded 2026 wires carry no PAR Number. That was wrong, and the cause was
methodology: only page 1 of each document had been read. The PAR Number lives on the SinglePoint
**"Current Day Account Detail"** page, which appears *after* page 1. `pdf-parse` reads every page in
production, so the sweep sees it.

That page also carries better renderings of both fields:

```
PAR NUMBER: 260226801WYD          <- B read as an 8, corrupted
SENDERS REFERENCE: 260226B01WYD   <- the same reference, intact
WIRE CURRENCY: USD WIRE AMOUNT:322436.88
CONTROL NUMBER: 164098522
```

So:

- **The reference is read from `SENDERS REFERENCE`, not the `PAR NUMBER` line.** Both hold the same
  value, but OCR reliably corrupts the `PAR NUMBER` rendering and leaves `SENDERS REFERENCE` clean.
  Matching the corrupted one would flag files that are perfectly readable.
- **The amount is read from `WIRE AMOUNT`**, which is clean and unformatted, rather than the page-1
  figure OCR mangles. A `thousands` transform adds the grouping the convention needs. This recovers
  amounts page 1 destroys outright: `$322,436   88`, where the decimal point was read as
  whitespace, becomes `322,436.88`.

Verified end to end on the two wires whose detail page was read:

| Current filename | Renames to |
|---|---|
| `Wire__$18,593.28_02_03_2026.pdf` | `WIRE_260203B01PR1_$18,593.28.pdf` |
| `Wire__322,43b.88_.pdf` | `WIRE_260226B01WYD_$322,436.88.pdf` |

**Fed wires rename too.** An earlier note here said they had no transaction-detail page. That was
the same page-1 mistake made twice: on the Fed wire examined the detail page is the **last** page,
page 7 of 7, with pages 2-6 being the vendor's own invoices. It carries the reference normally:

```
PAR NUMBER:   260226801   WPY
SENDERS   REFERENCE:   260226B01   WPY
IMAD:   2026022611   Q73AGC00431   1
CONTROL NUMBER;   164100504
```

Fed and international wires differ only in two details, both handled:

- **The reference is split by whitespace** on Fed pages (`260226B01   WPY`). The pattern matches
  twelve alphanumerics with optional gaps and the `alnum` transform closes them.
- **Fed detail pages have no `WIRE AMOUNT` line**, so the amount falls back to the page-1 figure.
  The `amount` field declares two `patterns`, tried in order, and the clean detail-page value wins
  when both are present.

| Current filename | Wire type | Renames to |
|---|---|---|
| `Wire__$18,593.28_02_03_2026.pdf` | INTL-USD | `WIRE_260203B01PR1_$18,593.28.pdf` |
| `Wire__322,43b.88_.pdf` | INTL-USD | `WIRE_260226B01WYD_$322,436.88.pdf` |
| `Wire__$1,000,000.00_02_26_2026.pdf` | FED | `WIRE_260226B01WPY_$1,000,000.00.pdf` |

**There is no remaining open question for WIRE.**

A real hit rate needs the deployed sweep, since measuring properly means parsing every page of every
file. Fixtures in `test/fixtures/ocr-samples.js` are tagged with their page coverage, and four are
page-1-only: a failure on those is a fixture limitation, not a real one.


### Why COSTING is blocked

The convention itself is clear, and the validate regex accepts all 29 real filenames. The problem is
extraction:

- **Invoice number: fine.** It comes off the `INVOICE NO.` label, which survives OCR
  (`INVOICE NO.: BIM-26-006`, `INVOICE NO.r 100456` — the label degrades, the value does not).
- **Vendor name: not extractable.** Letterheads are the most OCR-corrupted part of these pages
  because large stylised fonts scan worst. `IDEAL GROUP HOLDINGS LIMITED` reads as
  `IDf,AL GROUP HOLDINGS LIMITED`; `MOLAX TRADING LIMITED` as `i,lOLAX TRADING LIIMITED`. Only some
  invoices carry a `VENDOR` label at all, and where one exists the value is split by OCR spacing
  (`VENDOR  LAYLO   LLC` yields `LAYLO`, not `LAYLO LLC`).

The live data is inconsistent for the same reason: `BEG4KLOTHING, INC` and `Beg4Kloathing, Inc` are
the same vendor, spelled and cased two ways.

**The viable fix is a vendor lookup keyed on the invoice-number prefix**, which is vendor-specific
and extracts cleanly: `AIT-FAM-` → Ai Trading Inc, `B4K` → BEG4KLOTHING INC, `IDL` → IDEAL GROUP
HOLDINGS LIMITED, `BIM-` → MOLAX TRADING LIMITED, `GRTX-` → GARTEX OVERSEAS LIMITED, and so on.
That would also canonicalise the existing spelling drift. It needs two things from the business:
the authoritative vendor list, and confirmation of the prefix mapping — two observed cases do not
fit a clean prefix rule (`LAYLO LLC` invoices are bare numbers like `100456`, and `RAINBOW LINK
(BANGLADESH) LTD` uses two unrelated prefixes, `RSLGAPZ` and `TISLFAM-`).

Remaining to go live:

1. For COSTING: supply the canonical vendor list and prefix mapping, or leave the type disabled.
2. Run a full dry-run sweep and review every proposed name before setting `RENAME_DRY_RUN=false`.
   For GLJE, review the shape — the id will differ when the live run mints a new one.
3. Resolve the webhook interaction below.

### Scanning Shared Documents overlaps the live webhook

`Shared Documents` is the library the live Accounting_Research webhook watches. Every rename bumps
`lastModifiedDateTime`, which fires a notification and produces a `FIN_SCAN_Rename_And_Storage`
queue item — feeding the same robot whose rename step this feature replaces. Both would then act on
the same file.

This is not a code problem and no code change fixes it; it is a cutover decision. Either the robot's
rename step is retired, or the webhook is filtered/removed, or the sweep is pointed at `OutputBox`
instead so it only corrects files the robot has already filed. Settle it before
`RENAME_DRY_RUN=false`. A dry run is unaffected — it writes status columns only, and those also
touch the item, so even the dry run will generate webhook traffic.

## Deployment checklist

1. **Verify Graph write permission.** Renaming a driveItem needs write on the drive. Auth uses
   `.default` only, so the effective set is whatever is consented on app
   `b3fee77f-b8d4-4d4c-a6b2-0ebcb7e9410f`:
   ```bash
   az ad app permission list --id b3fee77f-b8d4-4d4c-a6b2-0ebcb7e9410f -o table
   az ad sp show --id b3fee77f-b8d4-4d4c-a6b2-0ebcb7e9410f --query appRoles -o json
   ```
   A 403 on rename produces an explicit permissions message naming this as the likely cause.
2. **Decide the webhook interaction.** If the target folder is in the same library as the live
   Accounting_Research webhook, every rename bumps `lastModifiedDateTime`, fires a notification, and
   creates a `FIN_SCAN_Rename_And_Storage` queue item — feeding the robot this feature replaces.
   Either use a different library, or retire/filter that webhook as part of cutover.
3. Add the SharePoint columns above.
4. Create the `document-rename` queue on `webhookstorageacct002`.
5. Deploy. Set `RENAME_SITE_PATH`, `RENAME_LIST_ID`, `RENAME_FOLDER_PATH`, then `RENAME_ENABLED=true`,
   leaving `RENAME_DRY_RUN=true`.
6. Review a full dry-run pass, then set `RENAME_DRY_RUN=false`.

Rollback: `RENAME_DRY_RUN=true` stops all writes in seconds without a deploy; `RENAME_ENABLED=false`
stops the sweep entirely. Drain the `document-rename` queue before any package rollback or in-flight
messages strand.
