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
| `fields.<name>.generate` | Mint the value instead of reading it. Currently only `"digits"`. Mutually exclusive with `pattern`, and cannot be optional. |
| `fields.<name>.length` | Digit count, required when `generate` is set. |
| `fields.<name>.required` | Default `true`. An optional field must declare a `default`. |
| `fields.<name>.transform` | Ordered transform chain (below). |
| `fields.<name>.maxLength` | Truncation cap applied after transforms. |
| `template` | `{placeholder}` per field. Every placeholder must have a field and every field must be used. |
| `validate` | Regex the **rendered filename including extension** must satisfy. |

### Transforms

`trim` · `upper` · `lower` · `digits` (keep digits only) · `alnum` (keep letters and digits only) ·
`collapse` (whitespace runs → single hyphen) · `date:YYYYMMDD` · `date:YYYYMM` · `date:YYYY-MM-DD` ·
`date:MMDDYYYY` · `date:YYMMDD`

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

### The folder decides the document type

Because `OutputBox` is organised by type, the folder is the strongest classification signal
available and is weighted above both content (2×) and filename (1×):

| Signal | Weight |
|---|---|
| Folder segment matches `folderHints` | 4 |
| Each matching `contentPattern` | 2 |
| Filename matches `filenameHints` | 1 |

A file under `CHECK/2026/2026_01` is a check even if OCR salvaged nothing from it and the filename is
misleading. Matching is on whole path segments, so a folder called `CHECKLIST` is not the `CHECK`
folder. When no folder hint matches, classification falls back to content and filename as before.

## SharePoint columns

Add these to the document library. Create them **without spaces** so the internal names match the
display names and no `_x0020_` encoding is involved.

| Column | Type | Notes |
|---|---|---|
| `DocTypeDetected` | Single line of text | CHECK / COSTING / GLJE / WIRE |
| `RenameStatus` | Choice | Values below |
| `RenameDetail` | Multiple lines of text | Missing fields, colliding name, proposed name in dry run |
| `RenameAttempts` | Number | Drives the give-up logic |
| `RenameProcessedAt` | Date and Time | Last evaluation |
| `RenamePreviousName` | Single line of text | Audit trail |
| `RenameContentHash` | Single line of text | SHA1; a change re-arms an exhausted file |

`RenameStatus` choices: `Renamed`, `AlreadyCompliant`, `NoTextLayer`, `Unclassified`,
`MissingFields`, `NameCollision`, `UnsupportedType`, `DryRun`, `Error`, `PermanentlyFailed`.

State lives in these columns rather than Table Storage: the folder listing already expands
`listItem($expand=fields)`, so the state arrives with the listing at no extra cost and is visible to
the accounting team in the library view.

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
| WIRE | `WIRE_{parNumber}_${amount}.pdf` | `WIRE_251103B02FHR_$237,800.00.pdf` | **Extracts end to end today** when OCR is clean. `WIRE` is uppercase, single underscore, no date — the PAR Number encodes it (`251103` = 2025-11-03). Amount keeps `$` and commas. |
| GLJE | `GLJE_{MM}_{DD}_{YYYY}_{6 digits}.pdf` | `GLJE_11_03_2025_129334.pdf` | **Extracts end to end today.** The G/L date comes from the document; the trailing 6 digits are **randomly generated** (confirmed 2026-09-02), so the name is not reproducible between runs. |
| COSTING | `{Vendor} -  {InvoiceNumber}.pdf` (separator is space-hyphen-**space-space**) | `MOLAX TRADING LIMITED -  BIM-26-006.pdf` | **Blocked, ships disabled.** The invoice number extracts reliably; the vendor name does not. See below. |

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

Optional accuracy improvement: the `B` → `8` OCR substitution in wire PAR numbers is systematic and
positional. A targeted correction would convert a chunk of current `MissingFields` exceptions into
successful renames. It is deliberately **not** implemented — silently repairing OCR is how the
existing wrong filenames were produced — but it is a defensible change if the dry run shows the
exception volume is high.

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
