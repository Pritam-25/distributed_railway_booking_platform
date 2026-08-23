import crypto from "node:crypto";
import Razorpay from "razorpay";
import { env } from "@config";
import { logger } from "@irctc/logger";

let razorpayInstance: Razorpay | null = null;

/**
 * Returns a singleton instance of the Razorpay SDK client initialized with environment keys.
 *
 * @returns The initialized Razorpay SDK instance.
 */
export function getRazorpayClient(): Razorpay {
  razorpayInstance ??= new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
  });
  return razorpayInstance;
}

/**
 * Options for creating a Razorpay order.
 */
export interface CreateRazorpayOrderOptions {
  /** Order amount in Paise (e.g., 10000 = ₹100.00). */
  amountInPaise: number;
  /** Currency code (defaults to "INR"). */
  currency?: string;
  /** Internal booking ID or receipt identifier. */
  receipt: string;
  /** Key-value metadata notes attached to the order. */
  notes?: Record<string, string>;
}

/**
 * Normalized result of a Razorpay order creation.
 */
export interface RazorpayOrderResult {
  /** Razorpay order ID (e.g., "order_Pxxxxxx"). */
  id: string;
  /** Entity type, typically "order". */
  entity: string;
  /** Order amount in Paise. */
  amount: number;
  /** Currency code. */
  currency: string;
  /** Receipt identifier. */
  receipt: string;
  /** Order status ("created", "attempted", etc.). */
  status: string;
}

/**
 * Creates a Razorpay order. Uses live Razorpay API if credentials are set,
 * or generates a realistic mock order if running in test/dummy mode.
 *
 * @param options - Order creation details.
 * @returns The created Razorpay order details.
 */
export async function createRazorpayOrder(
  options: CreateRazorpayOrderOptions,
): Promise<RazorpayOrderResult> {
  const isDummyKey =
    !env.RAZORPAY_KEY_ID || env.RAZORPAY_KEY_ID.includes("dummy");

  if (isDummyKey) {
    logger.info(
      { module: "razorpay", options },
      "Using mock Razorpay order creation (dummy credentials).",
    );
    const mockOrderId = `order_mock_${crypto.randomBytes(8).toString("hex")}`;
    return {
      id: mockOrderId,
      entity: "order",
      amount: options.amountInPaise,
      currency: options.currency || "INR",
      receipt: options.receipt,
      status: "created",
    };
  }

  const razorpay = getRazorpayClient();
  const requestBody: Record<string, unknown> = {
    amount: options.amountInPaise,
    currency: options.currency || "INR",
    receipt: options.receipt,
  };
  if (options.notes) {
    requestBody["notes"] = options.notes;
  }

  const res = (await razorpay.orders.create(
    requestBody as unknown as Parameters<typeof razorpay.orders.create>[0],
  )) as unknown as Record<string, unknown>;

  return {
    id: String(res["id"]),
    entity: String(res["entity"] || "order"),
    amount: Number(res["amount"]),
    currency: String(res["currency"]),
    receipt: String(res["receipt"] || options.receipt),
    status: String(res["status"]),
  };
}

/**
 * Verifies Razorpay client-side payment signature: HMAC-SHA256(order_id + "|" + payment_id, secret) === signature.
 *
 * @param params - Signature verification parameters.
 * @param params.razorpayOrderId - Razorpay order ID.
 * @param params.razorpayPaymentId - Razorpay payment ID.
 * @param params.razorpaySignature - Razorpay HMAC SHA256 signature.
 * @returns True if signature is valid or if running with dummy keys.
 */
export function verifyPaymentSignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): boolean {
  const isDummyKey =
    !env.RAZORPAY_KEY_SECRET || env.RAZORPAY_KEY_SECRET.includes("dummy");

  if (isDummyKey) {
    return true;
  }

  const text = `${params.razorpayOrderId}|${params.razorpayPaymentId}`;
  const expectedSignature = crypto
    .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
    .update(text)
    .digest("hex");

  return expectedSignature === params.razorpaySignature;
}

/**
 * Verifies Razorpay Webhook signature: HMAC-SHA256(rawBody, webhookSecret) === signatureHeader.
 *
 * @param rawBody - Raw HTTP body payload.
 * @param signatureHeader - Signature from `x-razorpay-signature` header.
 * @returns True if signature is valid or if running with dummy webhook secret.
 */
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string,
): boolean {
  const isDummyKey =
    !env.RAZORPAY_WEBHOOK_SECRET ||
    env.RAZORPAY_WEBHOOK_SECRET.includes("dummy");

  if (isDummyKey) {
    return true;
  }

  const expectedSignature = crypto
    .createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  return expectedSignature === signatureHeader;
}
