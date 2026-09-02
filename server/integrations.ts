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
    return { providerReference: `mock_pay_${request.orderId}`, status: request.method === "card" ? "paid" : "pending" };
  },
};
