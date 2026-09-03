/**
 * Verbatim OCR text captured from real documents in the Accounting_Research
 * site on 2026-09-02, via Graph's PDF text extraction.
 *
 * These are the actual bytes the classifier will see in production, corruption
 * and all. They exist so classification accuracy can be MEASURED rather than
 * asserted -- particularly the question of whether content alone can identify a
 * document type without help from the folder it sits in.
 *
 * COVERAGE WARNING. Samples marked `pagesRead: 1` contain page 1 only. For
 * wires that is NOT enough: the PAR Number and the clean WIRE AMOUNT live on the
 * SinglePoint "Current Day Account Detail" page, which appears LATER in the
 * document. pdf-parse reads every page in production, so a page-1-only fixture
 * will under-report what the sweep can actually extract. Do not treat a failure
 * on one of those as evidence the real file cannot be renamed.
 */

module.exports = {
    CHECK: {
        // OutputBox/CHECK/2026/2026_01/Check_38490_MICHAEL RADOCHAY_1_5_2026.pdf
        expected: 'CHECK',
        text: "tor,   i.c  'Date   lnvoice   No   Comment   Amount   Discount  3   8490  "
            + 'Net   Amount  t  11112026   MR   010126   FAM MR 0\'10126   5,000.00   o.oo   '
            + "5,ooy0'  Check:   0000038490   11512026   MICHAEL RADOCHAY   Check Total   5,000.00"
    },

    GLJE: {
        // OutputBox/GLJE/2026_06/GLJE_06_30_2026_418627.pdf
        expected: 'GLJE',
        text: 'General   Journal  FAM,   LLC   (FAM)  Source  Journal ting Pos  Date   Journal   '
            + 'Comment Revsr3ing  Oatg   User Updated  JE-000001   6t30t2026  Account   Number  '
            + 'I\\4EDICAL   SELF INSURANCE  Description/Comment  CESAR  Debit   Credit  '
            + '690-004-000 696-004-000 60\'1-003-000  FINANCE -   INSURANCE.   HEALTH AND LIFE  '
            + 'Journal   JE-00000\'l Totals: Source JE Totals: Report Totals:  214,815.93  '
            + "Page:'l Run   Date:   7/1/2026   2t01t27PM G/L   Date:   6/30/2026"
    },

    WIRE: {
        // OutputBox/WIRE/2025_11/WIRE_251103B02FHR_$237,800.00.pdf
        // Note this one contains the phrase "Commercial lnternet Banking",
        // which is a live false-positive risk for a COSTING pattern keyed on
        // the word "Commercial".
        expected: 'WIRE',
        text: '11ret25,12:27   PM   View Wire Transfer Detail   -   U.S. Bank   Commercial '
            + "lnternet   Banking  hank.I   lmportant!  PAR Number 251'103802FH   R  Repeat Code "
            + 'Nickname Send Date   (t\\ilfulDDI/YY/)  11t0312025  ACH Origination Account '
            + 'Validation lnformation   Reporting  Wire Transfers  lnitiate Wire Transfer  '
            + 'View   Wire Transfer   Detail  lnternational Wire Transfer   (INTL-USD)  '
            + 'Control   Number  16115437 4  Template   lD  ASIA   SOCKS   I  '
            + 'Deblt   Account   Number   -   Debit   Account   Name  USD   Amount  $237,800.00  '
            + 'Creditor Agent lnformation  SWIFT   / BIC   ID  HSBCCNSH  Creditor lnformation  '
            + 'Name  ASIASOCKS   INC.'
    },

    COSTING_MOLAX: {
        // OutputBox/COSTING/MOLAX TRADING LIMITED -  BIM-26-006.pdf
        expected: 'COSTING',
        text: 'FAM,   LLC,  5553 EANDINI   BLVD,   SUITE   B  ctrY oF   BEL|-   cA   90201. UsA '
            + 'TEL: 323-888"7755  DATE:   19-Feb-2026 INVOICE   NO.:   BIM-26-006  '
            + 'SHIPPED   TROM JAKARTA,   INDONESIA IPPED TO  LOS ANGELE   YS  '
            + 'OATE OF   SHIPPING  22-Feb-2025  CARRIER  HMM   CEBU  '
            + 'MARKS   &   NOS   DESCRIPTION   QUANTITY   FOB   PRICI   AMOUNT  PCS   uso   USD  '
            + 'WEAR   APPARET  Country Of   Origin   i   INDONESIA  PO:   Fl8572   (PACK   A)  '
            + 'MOLAX   TRADING   LIMITED  8   FLOOR. YOUONE   ELDG.  COMMERCIAT INVOICE'
    },

    COSTING_LAYLO: {
        // OutputBox/COSTING/LAYLO LLC -  100456.pdf
        expected: 'COSTING',
        text: 'INVOICE NO.r   100456  DATEr   13-06-2025  BY   TT   30   DAYS FROM   GOODS   '
            + 'RECEIVED   DATE  PAYMENT   TERMS  INVOICE   TO  FAM,   LLC,  '
            + 'CHITTAGONG   BANGLADESH  PORT   OF   LOADING  LOS ANGELES   USA  '
            + 'PORT   OF DISCHARGE  LOS ANGELES   USA  FINAL DESTINATIONI  MODE OF   SHIPMENT  '
            + 'BY   SEA  VENDOR  LAYLO   LLC  1035   SOUTH GRAND   AVE  INCOTERMS  DDP P.O.   NO   '
            + "STYLE /   ITEM NO.   DESCRIPTION   OF GOODS   QTY   Unit   Price  Commercial lnvoice"
    },

    COSTING_IDEAL: {
        // OutputBox/COSTING/IDEAL GROUP HOLDINGS LIMITED -  IDL260064.pdf
        // The worst OCR of the set: no INVOICE NO, no "Commercial Invoice",
        // and the letterhead itself is corrupted.
        expected: 'COSTING',
        text: "IDf,AL   GROUP HOLDINGS   LIMITED  I3'TH FLOO&   ON HONGCOMMERCL{L   BUILDNG.   "
            + "I4I   IiENNESSY ROAD, WANCHAI.   IIONCXONC  t\\'otcu  CHINA CHINA FOX  "
            + '^CCOUm   OF:  FAM, LLC,  PAYMEMTERTIS:   IIDAI"STT sT\'l,E   No,   Q!^NTTTY  UNIT  '
            + 'DEEP   TEAL,4!i l00e/.Ni6   wOMtNS   WOVEN SHORT DAZZLING   BLI]EE{!   '
            + "l'CS  SALSA'I€   ll:.1  Pm-{TE   ALAC(   tc   PCS  "
            + 'SAY TOTAL   US   DOLLARS TWENTY.ONE   THOUSAND   FOIJR  '
            + "'II-N  DRED   AND T\\AENTY   ONLY  COINIRt   Of   ORICI   ti:CHl:\\,{  "
            + 'DISCRIPTION   OF  MANIIF   CTUaING   ND   /   Oi   IIOCESSING   OPEnATIONSI  '
            + 'FABRIC   FROM  cvrflNc   FROM  sEwlNG   FRoM  MANUTACTURET   N   ME   A]ID ADORISS'
    },


    // --- Intake_Wires/2026_02, the folder the sweep would actually target ---
    // None of these carry a PAR Number. They have a Control Number instead,
    // which is why the OutputBox WIRE convention cannot be derived from them.

    WIRE_INTAKE_TTG: {
        coverage: 'detail page included',
        expected: 'WIRE',
        // Shared Documents/Intake_Wires/2026_02/Wire__$18,593.28_02_03_2026.pdf
        text: 'SingtoPointo  ztstz\\,   y:lg   et\'t  ACH Origination Account Validation  '
            + 'Wire Transfers  lnitiate Wire Transfer  View Wire Transfer Detail   -   U.S. Bank '
            + 'Commercial   Internet Banking  Repeat Code Nickname Send Date   (MM/DD^/YY/)  '
            + '0210312026  lnternational Wire Transfer   (INTL-USD)  Control Number  1   63495473 '
            + 'Template lD TTG GROUP Debit   Account   Number   -   Debit Account Name '
            + '153495863778   -   FAM LLC General Account USD Amount $18,s93.28  '
            + 'Creditor Agent lnformation  SWIFT/   BIC   ID  HSBCHKHHHKH  '
            + 'Creditor lnformation  Name TTG GROUP LIMITED  '
            + 'Remittance   lnformation |NVO|CE   NO.250169-3'
            // --- page 2: the SinglePoint transaction-detail page ---
            + '  Current   Day   Account   Detail FAM LLC SinglePoint  '
            + 'Transaction   Detail   For   0210312026  PAR NUMBER: 260203801 PRL  '
            + 'DATE/TIME   COMPLETED :   0210312026   01   :44:08   PM  '
            + 'SEND   DATE:   FEBRUARY   03,2026  VALUE   DATE: FEBRUARY   03,2026  '
            + 'WIRE CURRENCY:   USD WIRE   AMOUNT:   18593.28 '
            + 'SENDERS   REFERENCE:   260203B01PR1 '
            + 'INSTRUCTED   AGENT:   IVIRMDUS33XXXX HSBC   BANK   USA, N.A. '
            + 'SOURCE:   EMMSPT   CONTROL NUMBER: 163495473'
    },

    WIRE_INTAKE_CROWN: {
        coverage: 'page 1 only',
        expected: 'WIRE',
        // Shared Documents/Intake_Wires/2026_02/Wire__$1,375,110.00_.pdf
        text: '$inglePol   nto  2119126,   10:29   AM  ACH Origination Account Validation  '
            + 'Wire Transfers  lnitiate Wire Transfer  View Wire Transfer Detail   -   U.S. Bank  '
            + 'Commercial   lnternet   Banking  Debit   Account   Number   -   Debit   Account   '
            + 'Name 153495863778   -   FAM LLC General Account USD   Amount  $1 ,375,\'1   1   0.00  '
            + 'Creditor Agent lnformation  SWIFT   / BIC   ID  SCBKHKHH  '
            + 'Creditor lnformation  Name CROWN   WISE   INTERNATIONAL   INDUSTRIAL  '
            + 'Repeat Code Nickname  send   Date (MM/DD/YYYY) 02119t2026  '
            + 'tnternational   Wire   Transfer   (INTL-USD)  Control Number  1   6390   1   832'
    },

    WIRE_INTAKE_COMPASS: {
        coverage: 'page 1 only',
        expected: 'WIRE',
        // Shared Documents/Intake_Wires/2026_02/Wire__$963,164.00_32_12_2026.pdf
        // A Fed wire rather than international, and note the filename's "32"
        // month -- an OCR artefact from the earlier attempt.
        text: '2112126,10:50   AM  ACH Additional   Services  Wire   Transfers  '
            + 'lnitiate Wire Transfer  View Wire Transfer Detail   -   U.S. Bank   '
            + 'Commercial lnternet   Banking  View Wire   Transfer   Detail  '
            + 'Fed   Wire   Transfer   (FED)  Control Number 163751217 Template lD  '
            + 'COIV,IPASS   APPA Debit   Account   Number   -   Debit   Account   Name  '
            + '1   53495863778   -   FAM LLC General Account Amount  $963,1   64.00  '
            + 'Creditor Agent lnformation  Agent ABA (Routing   /   Transit Number) 322271627  '
            + 'Creditor lnformation  Name COI,lPASS APPAREL INC  '
            + 'Remittance   lnformation |NVO|CE   NO. 8891-878,   876, 901,  '
            + 'Repeat Code Nickname Send Date (MM/DDIYYYY) 02t1212026'
    },

    WIRE_INTAKE_BELLDINI: {
        coverage: 'detail page included',
        expected: 'WIRE',
        // Wire__$1,000,000.00_02_26_2026.pdf -- a FED wire, 7 pages. Pages 2-6
        // are the vendor's own invoices and the SinglePoint transaction-detail
        // page is the LAST one, page 7. It does carry the reference; a Fed
        // detail page simply has no WIRE AMOUNT line, so the amount comes from
        // page 1, and it splits the reference with whitespace.
        text: '$ingtePo   in#  2126126, 10:57   AM  ACH Additional Services  '
            + 'View Wire   Transfer   Detail  Fed   Wire   Transfer   (FED)  '
            + "Control Number 164't00504 Template   lD  BELLDINI Debit   Account   Number   -   "
            + 'Debit Account Name  1   53495863778   -   FAM LLC General Account '
            + 'Amount $1,000,000.00  Creditor Agent lnformation  '
            + 'Agent ABA (Routing   /   Transit Number) 122203950  '
            + 'View Wire Transfer Detail   -   U.S. Bank   Commercial lnternet   Banking  '
            + 'Repeat Code Nickname Send Date   (MM/DDryYYY)  0212612026'
            // --- page 7: the SinglePoint transaction-detail page ---
            + '  Current   Day   Account   Detail FAM LLC SinglePoint  '
            + 'Transaction   Detail   For   0212612026  '
            + 'PAR NUMBER:   260226801   WPY  FED REF:   00431   1  '
            + 'DATEiTIME   COMPLETED :   0212612026   01   :40:09   PM  '
            + 'SENDERS   REFERENCE:   260226B01   WPY  '
            + 'INSTRUCTED   AGENT:   122203950   CATHAY   BANK OF EL MONTE, CA '
            + 'CREDITOR:   34-107-207 BELLDINI,   lNC.  '
            + 'IMAD:   2026022611   Q73AGC00431   1  '
            + 'SOURCE:   EMMSPT   CONTROL NUMBER;   164100504'
    },

    WIRE_INTAKE_NINGBO: {
        coverage: 'page 1 only',
        expected: 'WIRE',
        // Wire___.pdf -- the filename carries nothing at all, yet the document
        // has a clean control number and a clean amount.
        text: '2111i26, 10:50   AIM  ACH Additional Services  '
            + 'View Wire Transfer Detail   -   U.S. Bank Commercial   lnternet   Banking  '
            + 'Creditor   lnformation  Name  NtNcBO   SEDUNO   l[,4pORT   AND   EXpORT  '
            + 'View Wire   Transfer   Detail  lnternational   Wire   Transfer   (INTL-USD)  '
            + 'Control Number  1637   12156 Template lD NINGBO SEDUN  '
            + 'Debit   Account   Number   -   Debit   Account   Name 153495863778   -   '
            + 'FAM LLC General Account USD   Amount  $284,811.03  '
            + 'Greditor   Agent lnformation  SWIFT/   BIC   ID  BKCHCNBJ92A  '
            + 'Repeat Code Nickname Send Date   (MM/DDI/YYY)  02111/2026'
    },

    WIRE_INTAKE_SINGAPORE: {
        coverage: 'detail page included',
        expected: 'WIRE',
        // Wire__322,43b.88_.pdf -- the amount's decimal point was read as
        // whitespace ("$322,436  88"), so stripping noise yields 322,43688.
        text: '2126126,10:39   AM  ACH Additional Services  '
            + 'View Wire Transfer Detail   -   U.S. Bank   Commercial lnternet   Banking  '
            + 'View Wire   Transfer   Detail  lnternational   Wire   Transfer   (INTL-USD)  '
            + 'Control Number 164098522 Template lD SINGAPORE   KE  '
            + 'Deblt   Account   Number   -   Debit   Account   Name 153495863778   -   '
            + 'FAM LLC General Account USD Amount $322,436   88  '
            + 'C   reditor Agent lnformation  SWIFT   / BIC   ID UU   5U5b5U  '
            + 'Repeat Code Nickname Send Date   (MM/DD^/YYY)  02t26t2026'
            // --- page 2: the SinglePoint transaction-detail page ---
            + '  Current   Day   Account   Detail FAM LLC  SinglePoint  '
            + 'Transaction   Detail   For   0212612026  PAR NUMBER:   260226801WYD '
            + 'DATEff   I   ME COMPLETED :   Q212612026   01   :42:30 PM '
            + 'SEND DATE:   FEBRUARY 26,2026 VALUE   DATE: FEBRUARY   26,2026  '
            + 'WIRE CURRENCY:   USD WIRE   AMOUNT:322436.88 '
            + 'SENDERS   REFERENCE:   260226B01WYD  '
            + 'INSTRUCTED   AGENT:   PNBPUS3NXNYC   WELLS FARGO BANK,   NATIONAL '
            + 'SOURCE:   EMMSPT CONTROL   NUMBER: 164098522'
    },

    WIRE_INTAKE_JUNGKWANG: {
        coverage: 'page 1 only',
        expected: 'WIRE',
        // Wire____001.pdf -- clean control number and amount despite the
        // useless filename.
        text: 'SingloPointo  2111126,11:11   Alr/  ACH Additional   Services  '
            + 'View Wire Transfer Detail   -   U.S. Bank Commercial   lnternet   Banking  '
            + 'Control Number  1   63713348 Real-Time Payments Wire   Transfers  '
            + 'View Wire   Transfer   Detail  lnternational   Wire   Transfer   (INTL-USD)  '
            + 'Template   lD  JUNG KWANG Debit   Account   Number   -   Debit   Account   Name '
            + '153495863778   -   FAM LLC General Account USD   Amount  $321,930.00  '
            + 'C   reditor Agent lnformation  SWIFT   /   BIC   ID  SHBKKRSEXXX  '
            + 'Repeat Code Nickname Send Date   (MM/DD^/rrY)  02111t2026'
    },

    UNRELATED: {
        expected: null,
        text: 'Meeting notes from the quarterly planning session. Attendees: several people. '
            + 'Action items were assigned and the next review was scheduled for the spring.'
    }
};
