import { differenceInCalendarDays } from "date-fns";
import prisma from "./prismadb";

/** Nights charged: at least one, same rule the booking form uses. */
export function nightsBetween(start: Date, end: Date): number {
  return Math.max(1, differenceInCalendarDays(end, start));
}

/** True if any existing reservation overlaps the range (inclusive, like the calendar). */
export async function hasOverlap(listingId: string, start: Date, end: Date) {
  const clash = await prisma.reservation.findFirst({
    where: {
      listingId,
      startDate: { lte: end },
      endDate: { gte: start },
    },
    select: { id: true },
  });
  return Boolean(clash);
}

/**
 * Settles a payment exactly once, whether the news comes from Safaricom's
 * callback or from a status check. Safe to call repeatedly.
 */
export async function settlePayment(
  paymentId: string,
  outcome:
    | { success: true; receipt?: string; paidAmount?: number; resultDesc?: string }
    | { success: false; resultDesc?: string }
) {
  // Claim the row: only one caller can move it out of PENDING.
  const claimed = await prisma.mpesaPayment.updateMany({
    where: { id: paymentId, status: "PENDING" },
    data: { status: outcome.success ? "SUCCESS" : "FAILED" },
  });
  if (claimed.count === 0) {
    // Already settled (e.g. by a status check). Keep the receipt if we only learn it now.
    if (outcome.success && outcome.receipt) {
      await prisma.mpesaPayment.updateMany({
        where: { id: paymentId, receipt: null },
        data: { receipt: outcome.receipt },
      });
    }
    return;
  }

  const payment = await prisma.mpesaPayment.findUnique({
    where: { id: paymentId },
  });
  if (!payment) return;

  if (!outcome.success) {
    await prisma.mpesaPayment.update({
      where: { id: paymentId },
      data: { resultDesc: outcome.resultDesc || "Payment was not completed" },
    });
    return;
  }

  // Paid less than the price, or the dates were taken in the meantime:
  // keep the money record but do not book. The owner has to sort it out.
  const underpaid =
    outcome.paidAmount !== undefined && outcome.paidAmount < payment.amount;
  const taken = await hasOverlap(
    payment.listingId,
    payment.startDate,
    payment.endDate
  );
  if (underpaid || taken) {
    await prisma.mpesaPayment.update({
      where: { id: paymentId },
      data: {
        status: "REVIEW",
        receipt: outcome.receipt,
        resultDesc: underpaid
          ? "Amount paid was less than the booking price"
          : "Paid, but these dates were booked by someone else",
      },
    });
    return;
  }

  await prisma.reservation.create({
    data: {
      userId: payment.userId,
      listingId: payment.listingId,
      startDate: payment.startDate,
      endDate: payment.endDate,
      totalPrice: payment.amount,
    },
  });
  await prisma.mpesaPayment.update({
    where: { id: paymentId },
    data: { receipt: outcome.receipt, resultDesc: outcome.resultDesc || "Paid" },
  });
}
