import crypto from "crypto";

const ENV = {
  MERCHANT_ID: process.env.PAYFAST_MERCHANT_ID!,
  MERCHANT_KEY: process.env.PAYFAST_MERCHANT_KEY!,
  PASSPHRASE: process.env.PAYFAST_PASSPHRASE || "",
  RETURN_URL: process.env.PAYFAST_RETURN_URL!,
  CANCEL_URL: process.env.PAYFAST_CANCEL_URL!,
  NOTIFY_URL: process.env.PAYFAST_NOTIFY_URL!,
  IS_SANDBOX: process.env.PAYFAST_IS_SANDBOX === "true",
};

export type PayFastPost = {
  merchant_id: string;
  merchant_key: string;
  return_url: string;
  cancel_url: string;
  notify_url: string;
  name_first?: string;
  name_last?: string;
  email_address?: string;
  cell_number?: string;
  m_payment_id: string;
  amount: string;
  item_name: string;
  item_description?: string;
  custom_str1?: string;
  custom_str2?: string;
  custom_str3?: string;
  custom_str4?: string;
  custom_str5?: string;
  custom_int1?: string;
  custom_int2?: string;
  custom_int3?: string;
  custom_int4?: string;
  custom_int5?: string;
  email_confirmation?: string;
  confirmation_address?: string;
  payment_method?: string;
  signature?: string;
};

export function buildPost(input: {
  amountRands: number;
  paymentId: string;
  itemName: string;
  itemDescription?: string;
  customerEmail?: string;
  customerFirstName?: string;
  customerLastName?: string;
  customerCell?: string;
  custom?: {
    str1?: string;
    str2?: string;
    str3?: string;
    str4?: string;
    str5?: string;
  };
}): PayFastPost {
  // Validate required environment variables
  if (!ENV.MERCHANT_ID) throw new Error("PAYFAST_MERCHANT_ID is not configured");
  if (!ENV.MERCHANT_KEY) throw new Error("PAYFAST_MERCHANT_KEY is not configured");
  if (!ENV.RETURN_URL) throw new Error("PAYFAST_RETURN_URL is not configured");
  if (!ENV.CANCEL_URL) throw new Error("PAYFAST_CANCEL_URL is not configured");
  if (!ENV.NOTIFY_URL) throw new Error("PAYFAST_NOTIFY_URL is not configured");

  const post: PayFastPost = {
    merchant_id: ENV.MERCHANT_ID,
    merchant_key: ENV.MERCHANT_KEY,
    return_url: ENV.RETURN_URL,
    cancel_url: ENV.CANCEL_URL,
    notify_url: ENV.NOTIFY_URL,
    m_payment_id: input.paymentId,
    amount: input.amountRands.toFixed(2),
    item_name: input.itemName,
  };

  if (input.itemDescription) post.item_description = input.itemDescription;
  if (input.customerEmail) {
    post.email_address = input.customerEmail;
    post.email_confirmation = "1";
    post.confirmation_address = input.customerEmail;
  }
  if (input.customerFirstName) post.name_first = input.customerFirstName;
  if (input.customerLastName) post.name_last = input.customerLastName;
  if (input.customerCell) post.cell_number = input.customerCell;
  
  if (input.custom) {
    if (input.custom.str1) post.custom_str1 = input.custom.str1;
    if (input.custom.str2) post.custom_str2 = input.custom.str2;
    if (input.custom.str3) post.custom_str3 = input.custom.str3;
    if (input.custom.str4) post.custom_str4 = input.custom.str4;
    if (input.custom.str5) post.custom_str5 = input.custom.str5;
  }

  // Generate signature
  post.signature = computeSignature(post);
  
  return post;
}

export function computeSignature(data: Partial<PayFastPost>): string {
  // Create parameter string
  const params: Record<string, string> = {};
  
  // Add all fields except signature in alphabetical order
  Object.keys(data).forEach(key => {
    if (key !== 'signature' && data[key as keyof PayFastPost] !== undefined) {
      params[key] = String(data[key as keyof PayFastPost]);
    }
  });
  
  // Sort keys alphabetically and build query string
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys
    .map(key => `${key}=${encodeURIComponent(params[key]).replace(/%20/g, '+')}`)
    .join('&');
  
  // Add passphrase if set
  const stringToHash = ENV.PASSPHRASE 
    ? paramString + `&passphrase=${encodeURIComponent(ENV.PASSPHRASE)}`
    : paramString;

  console.log("[PAYFAST SIGNATURE DEBUG]", {
    paramString: paramString.slice(0, 100) + "...",
    hasPassphrase: !!ENV.PASSPHRASE,
    stringToHashLength: stringToHash.length,
  });

  // Generate MD5 hash
  return crypto.createHash("md5").update(stringToHash).digest("hex");
}

export function validateSignature(data: Record<string, any>, receivedSignature: string): boolean {
  const calculatedSignature = computeSignature(data);
  
  console.log("[PAYFAST ITN SIGNATURE DEBUG]", {
    receivedSignature: receivedSignature.slice(0, 16) + "...",
    calculatedSignature: calculatedSignature.slice(0, 16) + "...",
    matches: calculatedSignature === receivedSignature,
  });

  return calculatedSignature === receivedSignature;
}

export function getPaymentUrl(): string {
  return ENV.IS_SANDBOX 
    ? "https://sandbox.payfast.co.za/eng/process"
    : "https://www.payfast.co.za/eng/process";
}
