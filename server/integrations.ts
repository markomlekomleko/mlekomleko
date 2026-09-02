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

export interface EmailGateway {
  send(template: string, recipient: string, data: Record<string, unknown>): Promise<{ messageId: string }>;
}

export interface FiscalGateway {
  issue(orderId: string): Promise<{ status: "queued"; reference: string }>;
}

// Local-only deterministic adapters. Production adapters must replace these interfaces.
export const localPaymentGateway: PaymentGateway = {
  async authorize(request) {
    return { providerReference: `mock_pay_${request.orderId}`, status: request.method === "card" ? "paid" : "pending" };
  },
};

export const localEmailGateway: EmailGateway = {
  async send(template, recipient) { return { messageId: `mock_email_${template}_${recipient}` }; },
};

export const localFiscalGateway: FiscalGateway = {
  async issue(orderId) { return { status: "queued", reference: `mock_fiscal_${orderId}` }; },
};
