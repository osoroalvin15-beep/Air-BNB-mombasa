// Safaricom Daraja (M-Pesa Express / STK Push) client.
// Docs: https://developer.safaricom.co.ke/APIs/MpesaExpressSimulate

const BASE_URL =
  process.env.MPESA_ENV === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

/** Turns 0712345678, +254712345678, 712345678 or 254112345678 into 2547XXXXXXXX / 2541XXXXXXXX. */
export function normalizePhone(input: string): string | null {
  const digits = String(input || "").replace(/\D/g, "");
  let phone = digits;
  if (/^0[17]\d{8}$/.test(digits)) phone = `254${digits.slice(1)}`;
  else if (/^[17]\d{8}$/.test(digits)) phone = `254${digits}`;
  return /^254[17]\d{8}$/.test(phone) ? phone : null;
}

// Daraja expects YYYYMMDDHHmmss. Use Nairobi time (UTC+3).
function timestamp(): string {
  const nairobi = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return nairobi
    .toISOString()
    .replace(/[-:T]/g, "")
    .slice(0, 14);
}

async function getAccessToken(): Promise<string> {
  const auth = Buffer.from(
    `${required("MPESA_CONSUMER_KEY")}:${required("MPESA_CONSUMER_SECRET")}`
  ).toString("base64");

  const res = await fetch(
    `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${auth}` }, cache: "no-store" }
  );
  if (!res.ok) throw new Error(`M-Pesa auth failed (${res.status})`);
  const data = await res.json();
  if (!data.access_token) throw new Error("M-Pesa auth returned no token");
  return data.access_token as string;
}

function password(ts: string): string {
  return Buffer.from(
    `${required("MPESA_SHORTCODE")}${required("MPESA_PASSKEY")}${ts}`
  ).toString("base64");
}

export function callbackUrl(): string {
  const base = (
    process.env.MPESA_CALLBACK_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    ""
  ).replace(/\/$/, "");
  // NB: Safaricom rejects callback URLs that contain the word "mpesa",
  // which is why the route lives under /api/pay.
  return `${base}/api/pay/callback?token=${encodeURIComponent(
    required("MPESA_CALLBACK_SECRET")
  )}`;
}

export interface StkPushResult {
  merchantRequestId: string;
  checkoutRequestId: string;
}

export async function stkPush(args: {
  phone: string;
  amount: number;
  reference: string;
  description: string;
}): Promise<StkPushResult> {
  const token = await getAccessToken();
  const ts = timestamp();
  const shortcode = required("MPESA_SHORTCODE");

  const res = await fetch(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password(ts),
      Timestamp: ts,
      // Paybill: CustomerPayBillOnline. Till number: CustomerBuyGoodsOnline.
      TransactionType:
        process.env.MPESA_TRANSACTION_TYPE || "CustomerPayBillOnline",
      Amount: args.amount,
      PartyA: args.phone,
      // For a Till, set MPESA_PARTY_B to the till number.
      PartyB: process.env.MPESA_PARTY_B || shortcode,
      PhoneNumber: args.phone,
      CallBackURL: callbackUrl(),
      AccountReference: args.reference.slice(0, 12),
      TransactionDesc: args.description.slice(0, 13),
    }),
    cache: "no-store",
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || String(data.ResponseCode) !== "0") {
    throw new Error(
      data.errorMessage || data.ResponseDescription || "STK push was rejected"
    );
  }
  return {
    merchantRequestId: data.MerchantRequestID,
    checkoutRequestId: data.CheckoutRequestID,
  };
}

export type StkQueryResult =
  | { state: "pending" }
  | { state: "success" | "failed"; resultDesc: string };

/** Asks Safaricom what happened to a push, in case the callback never reached us. */
export async function stkQuery(checkoutRequestId: string): Promise<StkQueryResult> {
  const token = await getAccessToken();
  const ts = timestamp();
  const res = await fetch(`${BASE_URL}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: required("MPESA_SHORTCODE"),
      Password: password(ts),
      Timestamp: ts,
      CheckoutRequestID: checkoutRequestId,
    }),
    cache: "no-store",
  });

  const data = await res.json().catch(() => ({}));
  // While the customer is still deciding Daraja answers with an errorCode.
  if (data.ResultCode === undefined) return { state: "pending" };
  if (String(data.ResultCode) === "0") {
    return { state: "success", resultDesc: data.ResultDesc || "Paid" };
  }
  return { state: "failed", resultDesc: data.ResultDesc || "Payment failed" };
}
