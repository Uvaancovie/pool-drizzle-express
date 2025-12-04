import crypto from "crypto";

const ENV = {
  SITE: process.env.OZOW_SITE_CODE!,
  COUNTRY: "ZA",
  CURRENCY: "ZAR",
  // Ozow documentation says to use "Private Key" for hash, which is OZOW_PRIVATE_KEY
  // But some integrations use API_KEY - we'll try PRIVATE_KEY first, can swap if needed
  PRIVATE_KEY: process.env.OZOW_PRIVATE_KEY!,
  API_KEY: process.env.OZOW_API_KEY!,
  SUCCESS: process.env.OZOW_SUCCESS_URL!,
  CANCEL: process.env.OZOW_CANCEL_URL!,
  ERROR: process.env.OZOW_ERROR_URL!,
  NOTIFY: process.env.OZOW_NOTIFY_URL!,
  IS_TEST: String(process.env.OZOW_IS_TEST || "true"),
};

export type OzowPost = {
  SiteCode: string;
  CountryCode: string;
  CurrencyCode: string;
  Amount: string;                 // "123.45"
  TransactionReference: string;
  BankReference: string;          // <=20, A-Z a-z 0-9 space hyphen
  CancelUrl?: string;
  ErrorUrl?: string;
  SuccessUrl?: string;
  NotifyUrl?: string;
  Customer?: string;
  Optional1?: string; Optional2?: string; Optional3?: string; Optional4?: string; Optional5?: string;
  IsTest: string;
  HashCheck?: string;
};

export function buildPost(input: {
  amountRands: number;
  transactionRef: string;
  bankRef: string;
  customerEmail?: string;
  optional?: Partial<Pick<OzowPost,"Optional1"|"Optional2"|"Optional3"|"Optional4"|"Optional5">>;
}): OzowPost {
  // Validate required environment variables
  if (!ENV.SITE) throw new Error("OZOW_SITE_CODE is not configured");
  if (!ENV.PRIVATE_KEY) throw new Error("OZOW_PRIVATE_KEY is not configured (used for hash generation)");
  if (!ENV.SUCCESS) throw new Error("OZOW_SUCCESS_URL is not configured");
  if (!ENV.CANCEL) throw new Error("OZOW_CANCEL_URL is not configured");
  if (!ENV.ERROR) throw new Error("OZOW_ERROR_URL is not configured");
  if (!ENV.NOTIFY) throw new Error("OZOW_NOTIFY_URL is not configured");

  const p: OzowPost = {
    SiteCode: ENV.SITE,
    CountryCode: ENV.COUNTRY,
    CurrencyCode: ENV.CURRENCY,
    Amount: input.amountRands.toFixed(2),
    TransactionReference: input.transactionRef,
    BankReference: input.bankRef.replace(/[^A-Za-z0-9 \-]/g, "").slice(0,20),
    CancelUrl: ENV.CANCEL,
    ErrorUrl: ENV.ERROR,
    SuccessUrl: ENV.SUCCESS,
    NotifyUrl: ENV.NOTIFY,
    // Don't send Customer field - it complicates hash calculation
    // Customer: input.customerEmail,
    // Don't send Optional fields either
    IsTest: ENV.IS_TEST,
  };
  p.HashCheck = computePostHash(p);
  return p;
}

// Post hash: CORRECT ORDER per Ozow spec
// HashCheck = SHA512(SiteCode + CountryCode + CurrencyCode + Amount + TransactionReference + BankReference 
//                    + CancelUrl + ErrorUrl + SuccessUrl + NotifyUrl + IsTest + PrivateKey)
// NOTE: Trying minimal hash without Optional and Customer fields
export function computePostHash(p: OzowPost): string {
  const safe = (v?: string) => (v ?? "").trim();
  
  // Build hash string - MINIMAL approach (only core fields)
  let hashString = "";
  hashString += safe(p.SiteCode);
  hashString += safe(p.CountryCode);
  hashString += safe(p.CurrencyCode);
  hashString += safe(p.Amount);
  hashString += safe(p.TransactionReference);
  hashString += safe(p.BankReference);
  
  // Skip Optional1-5 and Customer - they may not be part of hash
  // hashString += safe(p.Optional1);
  // hashString += safe(p.Customer);
  
  // URLs and IsTest
  hashString += safe(p.CancelUrl);
  hashString += safe(p.ErrorUrl);
  hashString += safe(p.SuccessUrl);
  hashString += safe(p.NotifyUrl);
  hashString += safe(p.IsTest);
  
  // Use PRIVATE_KEY for hash generation
  const hashKey = ENV.PRIVATE_KEY;
  const preHash = (hashString + hashKey).toLowerCase();

  // DEBUG: Log for troubleshooting
  console.log("[OZOW USING KEY] PRIVATE_KEY");
  console.log("[OZOW HASH FIELDS]", {
    siteCode: safe(p.SiteCode),
    amount: safe(p.Amount),
    transRef: safe(p.TransactionReference),
    bankRef: safe(p.BankReference),
    isTest: safe(p.IsTest),
  });
  console.log("[OZOW HASH PREIMAGE LENGTH]", preHash.length);
  const masked = preHash.replace(hashKey.toLowerCase(), "***PRIVATE_KEY***");
  console.log("[OZOW HASH PREIMAGE]", masked);

  return crypto.createHash("sha512").update(preHash).digest("hex");
}

// Response hash validator: concat response vars (document order) + API_KEY, lowercase, sha512, trim leading zeros
export function validateResponseHash(r: {
  SiteCode: string; TransactionId: string; TransactionReference: string; Amount: string;
  Status: string; Optional1?: string; Optional2?: string; Optional3?: string; Optional4?: string; Optional5?: string;
  CurrencyCode: string; IsTest: string; StatusMessage?: string; Hash: string;
}): boolean {
  const seq = (r.SiteCode||"")+(r.TransactionId||"")+(r.TransactionReference||"")+(r.Amount||"")+
              (r.Status||"")+(r.Optional1||"")+(r.Optional2||"")+(r.Optional3||"")+(r.Optional4||"")+(r.Optional5||"")+
              (r.CurrencyCode||"")+(r.IsTest||"")+(r.StatusMessage||"") + process.env.OZOW_API_KEY!;
  const calc = crypto.createHash("sha512").update(seq.toLowerCase()).digest("hex").replace(/^0+/, "");
  const got  = (r.Hash||"").toLowerCase().replace(/^0+/, "");
  return calc === got;
}
