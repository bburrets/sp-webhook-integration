# Document Classification & Auto-Rename

Folder-scoped sweep that classifies PDFs in one document-library folder as CHECK, COSTING, GLJE, or
WIRE, checks each filename against that type's convention, and renames the file via Graph when it is
wrong. Replaces the rename half of what the `FIN_SCAN_Rename_And_Storage` UiPath robot does.

**Status: not yet live.** Conventions below were derived by reading the real files in the library on
2026-09-02, not supplied by the business, so every rule set is still marked `"placeholder": true` and
the worker refuses to rename. See [Confirming the rules](#confirming-the-rules).

---

## The library, as it actually is

Two libraries matter, and they are different stages of the same process.

**`Shared Documents`** is the intake side — four type trees with dated subfolders,
holding files *before* renaming:

```
Shared Documents/Intake_Checks/{YYYY}/{YYYY_MM}/    Intake_GL-JE/{YYYY_MM}/
                 Intake_Wires/{YYYY_MM}/            Intake_Costing/{YYYY_MM}/
```

**`OutputBox`** is the authoritative post-rename form — three type folders, no COSTING:

```
OutputBox/CHECK/{YYYY}/{YYYY_MM}/   OutputBox/GLJE/{YYYY_MM}/   OutputBox/WIRE/{YYYY_MM}/
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
  That is a far stronger signal than any content pattern, and it is not yet used — the classifier
  works from filename and content only. Adding a `folderHints` signal is the highest-value
  improvement available.
- **The scanner does not recurse.** Pointing it at `OutputBox/WIRE` finds nothing, because the files
  live in `OutputBox/WIRE/2025_11`. Either configure one leaf folder at a time, or add recursion.

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

| App setting | Default | Meaning |
|---|---|---|
| `RENAME_ENABLED` | `false` | Master switch. The sweep does nothing until this is `true`. |
| `RENAME_DRY_RUN` | `true` | When true, everything runs except the `PATCH`; the proposed name is written to `RenameDetail`. |
| `RENAME_SITE_PATH` | — | e.g. `fambrandsllc.sharepoint.com:/sites/Accounting_Research:` |
| `RENAME_LIST_ID` | — | The document library's list id, for status-column writes. |
| `RENAME_FOLDER_PATH` | — | Folder path under the drive root, e.g. `Shared Documents/FIN SCAN Inbox`. |
| `RENAME_DRIVE_ID` | — | Optional; addresses a specific drive instead of the site's default. |
| `RENAME_MAX_PER_SWEEP` | `500` | Cap on candidates enqueued per sweep. Guards against a misconfigured path pointing at a whole library. |

Both booleans default to the safe value: a missing or misspelled setting cannot cause a live rename.

---

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
| COSTING | none | `Costing_01.pdf`, `costing_Image_001.pdf` | **No convention exists**, and OutputBox has no COSTING folder. Ships `"enabled": false`. |

To go live:

1. Confirm CHECK, WIRE and GLJE above.
2. Define a COSTING convention, or leave that type disabled.
3. Set `"placeholder": false` on each confirmed type.
4. Update the "are all still placeholders" assertion in
   `src/shared/__tests__/document-type-rules.test.js`.
5. Run a full dry-run sweep and review every proposed name before setting `RENAME_DRY_RUN=false`.
   For GLJE, review the shape — the id will differ when the live run mints a new one.

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
