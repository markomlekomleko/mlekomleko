export interface PaymentRequest {
  idempotencyKey: string;
  orderId: string;
  amountMinor: number;
  currency: "RSD";
  method: "card" | "cash";
  paymentToken?: string;
}

export interface PaymentGateway {
  authorize(request: PaymentRequest): Promise<{ providerReference: string; status: "paid" | "pending" | "failed" }>;
}

// Local deterministic payment adapter. Provider-specific recurring payment wiring
// can replace this implementation without exposing PAN/CVC to the application.
export const localPaymentGateway: PaymentGateway = {
  async authorize(request) {
    if (request.method === "cash") return { providerReference: `cash_${request.orderId}`, status: "pending" };
    const runtime = env as Record<string, string | undefined>;
    assertDomain(runtime.APP_ENV === "local" && runtime.PAYMENT_MODE === "mock", "PAYMENT_METHOD_UNAVAILABLE", "Online plaćanje karticom trenutno nije dostupno. Izaberite gotovinu pri dostavi.", 503);
    return { providerReference: `mock_pay_${request.orderId}`, status: "paid" };
  },
};
import { env } from "@/server/runtime";
import { assertDomain } from "./domain";
