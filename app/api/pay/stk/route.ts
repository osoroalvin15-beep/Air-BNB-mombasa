import { NextResponse } from "next/server";
import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/app/libs/prismadb";
import { normalizePhone, stkPush } from "@/app/libs/mpesa";
import { hasOverlap, nightsBetween } from "@/app/libs/payments";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Please log in first" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { listingId, startDate, endDate, phone } = body;

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (!listingId || isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
    return NextResponse.json({ error: "Choose valid dates" }, { status: 400 });
  }

  const msisdn = normalizePhone(phone);
  if (!msisdn) {
    return NextResponse.json(
      { error: "Enter a Safaricom number like 0712 345 678" },
      { status: 400 }
    );
  }

  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  if (await hasOverlap(listing.id, start, end)) {
    return NextResponse.json(
      { error: "Those dates are already booked" },
      { status: 409 }
    );
  }

  // The price is always worked out here, never trusted from the browser.
  const amount = nightsBetween(start, end) * listing.price;

  const payment = await prisma.mpesaPayment.create({
    data: {
      userId: currentUser.id,
      listingId: listing.id,
      startDate: start,
      endDate: end,
      amount,
      phone: msisdn,
    },
  });

  try {
    const push = await stkPush({
      phone: msisdn,
      amount,
      reference: `STAY${payment.id.slice(-6).toUpperCase()}`,
      description: "Booking",
    });
    await prisma.mpesaPayment.update({
      where: { id: payment.id },
      data: {
        checkoutRequestId: push.checkoutRequestId,
        merchantRequestId: push.merchantRequestId,
      },
    });
    return NextResponse.json({ paymentId: payment.id, amount });
  } catch (error: any) {
    console.error("STK push failed:", error);
    await prisma.mpesaPayment.update({
      where: { id: payment.id },
      data: { status: "FAILED", resultDesc: String(error?.message || error) },
    });
    return NextResponse.json(
      { error: "Could not send the M-Pesa prompt. Please try again." },
      { status: 502 }
    );
  }
}
