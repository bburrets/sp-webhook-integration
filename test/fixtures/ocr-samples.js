/**
 * Verbatim OCR text captured from real documents in the Accounting_Research
 * site on 2026-09-02, via Graph's PDF text extraction.
 *
 * These are the actual bytes the classifier will see in production, corruption
 * and all. They exist so classification accuracy can be MEASURED rather than
 * asserted -- particularly the question of whether content alone can identify a
 * document type without help from the folder it sits in.
 *
 * Truncated to the first portion of page 1 in each case, which is what carries
 * the identifying markers.
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

    UNRELATED: {
        expected: null,
        text: 'Meeting notes from the quarterly planning session. Attendees: several people. '
            + 'Action items were assigned and the next review was scheduled for the spring.'
    }
};
