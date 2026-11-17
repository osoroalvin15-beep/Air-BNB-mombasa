"use client";

import axios from "axios";
import { useRouter } from "next/navigation";
import React, { FC, useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import Modal from "./Modal";

interface MpesaModalProps {
  isOpen: boolean;
  close: () => void;
  listingId: string;
  startDate?: Date;
  endDate?: Date;
  totalPrice: number;
}

type Step = "form" | "waiting";

const POLL_EVERY_MS = 3000;
const GIVE_UP_AFTER_MS = 120000;

const MpesaModal: FC<MpesaModalProps> = ({
  isOpen,
  close,
  listingId,
  startDate,
  endDate,
  totalPrice,
}) => {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  useEffect(() => stopPolling, []);

  useEffect(() => {
    if (!isOpen) {
      stopPolling();
      setStep("form");
      setLoading(false);
      setError("");
    }
  }, [isOpen]);

  const poll = (paymentId: string) => {
    const startedAt = Date.now();
    stopPolling();
    timer.current = setInterval(async () => {
      try {
        const { data } = await axios.get("/api/pay/status", {
          params: { id: paymentId },
        });
        if (data.status === "SUCCESS") {
          stopPolling();
          toast.success("Payment received. Your stay is booked!");
          const receipt = data.receipt
            ? `?receipt=${encodeURIComponent(data.receipt)}`
            : "";
          router.push(`/reservation-success${receipt}`);
        } else if (data.status === "FAILED") {
          stopPolling();
          setStep("form");
          setLoading(false);
          setError(data.message || "The payment was not completed.");
        } else if (data.status === "REVIEW") {
          stopPolling();
          router.push("/reservation-cancelled");
        } else if (Date.now() - startedAt > GIVE_UP_AFTER_MS) {
          stopPolling();
          setStep("form");
          setLoading(false);
          setError(
            "We did not get a reply from M-Pesa. If money left your phone, check My Reservations in a minute."
          );
        }
      } catch {
        // Network blip: keep trying until the time limit.
      }
    }, POLL_EVERY_MS);
  };

  const onPay = async () => {
    setError("");
    setLoading(true);
    try {
      const { data } = await axios.post("/api/pay/stk", {
        listingId,
        startDate,
        endDate,
        phone,
      });
      setStep("waiting");
      poll(data.paymentId);
    } catch (e: any) {
      setLoading(false);
      setError(e?.response?.data?.error || "Could not start the payment.");
    }
  };

  const body =
    step === "form" ? (
      <div className="p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between font-medium">
          <span>Total to pay</span>
          <span className="text-xl">KSh {totalPrice.toLocaleString("en-KE")}</span>
        </div>
        <label className="flex flex-col gap-2 text-sm font-medium">
          M-Pesa phone number
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0712 345 678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="border border-border-gray rounded-md p-3 text-base"
          />
        </label>
        <p className="text-sm text-dark-gray">
          You will get a prompt on this phone. Enter your M-Pesa PIN to pay.
        </p>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    ) : (
      <div className="p-5 flex flex-col items-center gap-3 text-center">
        <span className="animate-spin">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </span>
        <p className="font-semibold">Check your phone</p>
        <p className="text-sm text-dark-gray">
          Enter your M-Pesa PIN to pay KSh {totalPrice.toLocaleString("en-KE")}.
          This page updates by itself when the payment goes through.
        </p>
      </div>
    );

  return (
    <Modal
      isOpen={isOpen}
      close={step === "waiting" ? undefined : close}
      label="Pay with M-Pesa"
      body={body}
      buttonLabel={step === "form" ? "Pay with M-Pesa" : "Waiting for payment..."}
      buttonLoading={loading}
      onSubmit={step === "form" ? onPay : undefined}
    />
  );
};

export default MpesaModal;
