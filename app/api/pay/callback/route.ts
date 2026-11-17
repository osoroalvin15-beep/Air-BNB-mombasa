import { NextResponse } from "next/server";
import prisma from "@/app/libs/prismadb";
import { settlePayment } from "@/app/libs/payments";

export const dynamic = "force-dynamic";

// Safaricom calls this when the customer pays, cancels or the prompt times out.
// Safaricom does not sign callbacks, so the URL carries a secret token.
export async function POST(request: Request) {
  const ok = NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });

  const token = new URL(request.url).searchParams.get("token");
  if (!process.env.MPESA_CALLBACK_SECRET || token !== process.env.MPESA_CALLBACK_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const cb = body?.Body?.stkCallback;
    if (!cb?.CheckoutRequestID) return ok;

    const payment = await prisma.mpesaPayment.findFirst({
      where: { checkoutRequestId: cb.CheckoutRequestID },
    });
    if (!payment) return ok;

    if (Number(cb.ResultCode) === 0) {
      const items: { Name: string; Value?: string | number }[] =
        cb.CallbackMetadata?.Item || [];
      const pick = (name: string) => items.find((i) => i.Name === name)?.Value;
      await settlePayment(payment.id, {
        success: true,
        receipt: pick("MpesaReceiptNumber")?.toString(),
        paidAmount: Number(pick("Amount")),
        resultDesc: cb.ResultDesc,
      });
    } else {
      await settlePayment(payment.id, {
        success: false,
        resultDesc: cb.ResultDesc,
      });
    }
  } catch (error) {
    // Still answer 200 so Safaricom does not keep retrying; the status
    // check below can recover the result.
    console.error("M-Pesa callback error:", error);
  }

  return ok;
}
