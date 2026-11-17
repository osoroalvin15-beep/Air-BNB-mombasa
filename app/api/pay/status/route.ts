import { NextResponse } from "next/server";
import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/app/libs/prismadb";
import { stkQuery } from "@/app/libs/mpesa";
import { settlePayment } from "@/app/libs/payments";

export const dynamic = "force-dynamic";

// The booking page polls this while the customer enters their PIN.
export async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Please log in first" }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^[0-9a-f]{24}$/i.test(id)) {
    return NextResponse.json({ error: "Missing payment id" }, { status: 400 });
  }

  let payment = await prisma.mpesaPayment.findUnique({ where: { id } });
  if (!payment || payment.userId !== currentUser.id) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  // If the callback has not arrived after a few seconds, ask Safaricom directly.
  const ageMs = Date.now() - payment.createdAt.getTime();
  if (payment.status === "PENDING" && payment.checkoutRequestId && ageMs > 15000) {
    try {
      const result = await stkQuery(payment.checkoutRequestId);
      if (result.state === "success") {
        await settlePayment(payment.id, { success: true, resultDesc: result.resultDesc });
      } else if (result.state === "failed") {
        await settlePayment(payment.id, { success: false, resultDesc: result.resultDesc });
      }
      payment = (await prisma.mpesaPayment.findUnique({ where: { id } })) || payment;
    } catch (error) {
      console.error("STK query failed:", error);
    }
  }

  return NextResponse.json({
    status: payment.status,
    receipt: payment.receipt,
    message: payment.resultDesc,
  });
}
