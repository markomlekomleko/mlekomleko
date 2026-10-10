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
export function assertCardPaymentAvailable() {
  const runtime = env as Record<string, string | undefined>;
  assertDomain(runtime.APP_ENV === "local" && runtime.PAYMENT_MODE === "mock", "PAYMENT_METHOD_UNAVAILABLE", "Plaćanje karticom preko Raiffeisen RaiAccept servisa još nije dostupno. Izaberite gotovinsko plaćanje.", 503);
}

export const localPaymentGateway: PaymentGateway = {
  async authorize(request) {
    if (request.method === "cash") return { providerReference: `cash_${request.orderId}`, status: "pending" };
    assertCardPaymentAvailable();
    if (!request.paymentToken || request.paymentToken === "mock-decline") return {providerReference: `mock_declined_${request.orderId}`,status:"failed"};
    return { providerReference: `mock_pay_${request.orderId}`, status: "paid" };
  },
};
import { env } from "@/server/runtime";
import { assertDomain } from "./domain";
