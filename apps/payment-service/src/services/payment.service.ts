import crypto from "node:crypto";
import type { PrismaClient } from "@generated/prisma/client.js";
import { PaymentStatus } from "@generated/prisma/client.js";
import {
  EVENT_TYPES,
  KAFKA_TOPICS,
  type PaymentOrderCreatedV1,
  type PaymentSuccessV1,
  type PaymentFailedV1,
} from "@irctc/contracts";
import { RAZORPAY_WEBHOOK_EVENTS } from "@constants";
import { type OutboxRepository } from "@irctc/kafka";
import { logger } from "@irctc/logger";
import { ApiError, COMMON_ERROR_CODES } from "@irctc/errors";
import { statusCode } from "@irctc/http";
import { env } from "@config";
import { PaymentRepository, type PrismaTransaction } from "@repository";
import {
  createRazorpayOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from "@utils";

type OutboxPrismaParam = Parameters<OutboxRepository["insert"]>[0];

/**
 * Input payload for order creation.
 */
export interface CreateOrderInput {
  bookingId: string;
  userId: string;
  amount: number;
  currency?: string;
}

/**
 * Result output of order creation.
 */
export interface CreateOrderOutput {
  paymentOrderId: string;
  razorpayOrderId: string;
  keyId: string;
  status: string;
}

/**
 * Input payload for payment verification.
 */
export interface VerifyPaymentInput {
  paymentOrderId?: string | undefined;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  source?: "CLIENT" | "WEBHOOK" | undefined;
}

/**
 * Result output of payment verification.
 */
export interface VerifyPaymentOutput {
  paymentOrderId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  status: string;
}

/**
 * Core business service managing payment order creation, verification, and webhooks.
 */
export class PaymentService {
  /**
   * Initializes PaymentService.
   *
   * @param prisma - PrismaClient instance for database transactions.
   * @param paymentRepo - PaymentRepository instance.
   * @param outboxRepo - OutboxRepository for event outbox writes.
   */
  constructor(
    private readonly prisma: PrismaClient,
    private readonly paymentRepo: PaymentRepository,
    private readonly outboxRepo: OutboxRepository,
  ) {}

  /**
   * Synchronous order creation called via gRPC from booking-service saga.
   * Creates Razorpay order & persists payment state with Outbox event.
   *
   * @param input - Order creation parameter object.
   * @returns Created order response payload.
   */
  async createOrder(input: CreateOrderInput): Promise<CreateOrderOutput> {
    // Check if an active order already exists for this booking
    const existing = await this.paymentRepo.findByBookingId(input.bookingId);
    if (existing?.status === PaymentStatus.PENDING) {
      return {
        paymentOrderId: existing.paymentOrderId,
        razorpayOrderId: existing.razorpayOrderId,
        keyId: env.RAZORPAY_KEY_ID,
        status: existing.status,
      };
    }

    const paymentOrderId = crypto.randomUUID();
    const amountInPaise = input.amount;
    const decimalAmountStr = (input.amount / 100).toFixed(2);

    // Create order with Razorpay SDK (or mock if using dummy keys)
    const razorpayOrder = await createRazorpayOrder({
      amountInPaise,
      currency: input.currency || "INR",
      receipt: paymentOrderId,
      notes: {
        bookingId: input.bookingId,
        userId: input.userId,
      },
    });

    // Save in DB and insert outbox event inside a transaction
    await this.prisma.$transaction(async (tx: PrismaTransaction) => {
      const payment = await this.paymentRepo.create(
        {
          paymentOrderId,
          razorpayOrderId: razorpayOrder.id,
          bookingId: input.bookingId,
          userId: input.userId,
          amount: decimalAmountStr,
          currency: input.currency || "INR",
        },
        tx,
      );

      const eventPayload: PaymentOrderCreatedV1 = {
        eventId: crypto.randomUUID(),
        bookingId: input.bookingId,
        paymentOrderId: payment.paymentOrderId,
        razorpayOrderId: razorpayOrder.id,
        amount: decimalAmountStr,
        currency: input.currency || "INR",
        createdAt: new Date(),
      };

      await this.outboxRepo.insert(tx as unknown as OutboxPrismaParam, {
        aggregateType: "Payment",
        aggregateId: payment.id,
        eventType: EVENT_TYPES.PAYMENT_ORDER_CREATED,
        topic: KAFKA_TOPICS.PAYMENT_ORDER_CREATED,
        payload: eventPayload,
      });
    });

    logger.info(
      {
        module: "PaymentService",
        paymentOrderId,
        razorpayOrderId: razorpayOrder.id,
        bookingId: input.bookingId,
      },
      "Payment order created and outbox event published.",
    );

    return {
      paymentOrderId,
      razorpayOrderId: razorpayOrder.id,
      keyId: env.RAZORPAY_KEY_ID,
      status: PaymentStatus.PENDING,
    };
  }

  /**
   * Verifies Razorpay HMAC signature and updates payment status to CAPTURED via CAS.
   * Emits PaymentSuccessV1 event to outbox.
   *
   * @param input - Signature verification input.
   * @returns Captured payment details.
   */
  async verifyAndCapture(
    input: VerifyPaymentInput,
  ): Promise<VerifyPaymentOutput> {
    const isValidSignature = verifyPaymentSignature({
      razorpayOrderId: input.razorpayOrderId,
      razorpayPaymentId: input.razorpayPaymentId,
      razorpaySignature: input.razorpaySignature,
    });

    if (!isValidSignature) {
      throw new ApiError(
        statusCode.badRequest,
        COMMON_ERROR_CODES.INVALID_INPUT,
        "Invalid Razorpay payment signature.",
      );
    }

    const payment = await this.paymentRepo.findByRazorpayOrderId(
      input.razorpayOrderId,
    );

    if (!payment) {
      throw new ApiError(
        statusCode.notFound,
        COMMON_ERROR_CODES.NOT_FOUND,
        `Payment order not found for razorpayOrderId ${input.razorpayOrderId}`,
      );
    }

    if (payment.status === PaymentStatus.CAPTURED) {
      return {
        paymentOrderId: payment.paymentOrderId,
        razorpayOrderId: payment.razorpayOrderId,
        razorpayPaymentId: payment.razorpayPaymentId || input.razorpayPaymentId,
        status: payment.status,
      };
    }

    // Execute atomic CAS update to CAPTURED
    await this.prisma.$transaction(async (tx: PrismaTransaction) => {
      const updated = await this.paymentRepo.updateStatusToCaptured(
        {
          paymentOrderId: payment.paymentOrderId,
          razorpayPaymentId: input.razorpayPaymentId,
          razorpaySignature: input.razorpaySignature,
        },
        tx,
      );

      if (!updated) {
        throw new ApiError(
          statusCode.internalError,
          COMMON_ERROR_CODES.INTERNAL_ERROR,
          "Failed to update payment status.",
        );
      }

      const successEvent: PaymentSuccessV1 = {
        eventId: crypto.randomUUID(),
        bookingId: payment.bookingId,
        paymentId: payment.id,
        paymentOrderId: payment.paymentOrderId,
        razorpayPaymentId: input.razorpayPaymentId,
        amount: payment.amount.toString(),
        source: input.source || "CLIENT",
        createdAt: new Date(),
      };

      await this.outboxRepo.insert(tx as unknown as OutboxPrismaParam, {
        aggregateType: "Payment",
        aggregateId: payment.id,
        eventType: EVENT_TYPES.PAYMENT_SUCCESS,
        topic: KAFKA_TOPICS.PAYMENT_SUCCESS,
        payload: successEvent,
      });
    });

    logger.info(
      {
        module: "PaymentService",
        paymentOrderId: payment.paymentOrderId,
        razorpayPaymentId: input.razorpayPaymentId,
      },
      "Payment captured successfully and outbox event published.",
    );

    return {
      paymentOrderId: payment.paymentOrderId,
      razorpayOrderId: payment.razorpayOrderId,
      razorpayPaymentId: input.razorpayPaymentId,
      status: PaymentStatus.CAPTURED,
    };
  }

  /**
   * Marks payment as FAILED in database and emits PaymentFailedV1 event via outbox.
   *
   * @param razorpayOrderId - Razorpay order ID.
   * @param reason - Optional failure description or error code.
   */
  async markAsFailed(razorpayOrderId: string, reason?: string): Promise<void> {
    const payment =
      await this.paymentRepo.findByRazorpayOrderId(razorpayOrderId);
    if (!payment) return;
    if (
      payment.status === PaymentStatus.FAILED ||
      payment.status === PaymentStatus.CAPTURED
    ) {
      return;
    }

    await this.prisma.$transaction(async (tx: PrismaTransaction) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          failureReason: reason || "Payment failed at gateway",
        },
      });

      const failedEvent: PaymentFailedV1 = {
        eventId: crypto.randomUUID(),
        bookingId: payment.bookingId,
        paymentOrderId: payment.paymentOrderId,
        reason: reason || "Payment failed at gateway",
        createdAt: new Date(),
      };

      await this.outboxRepo.insert(tx as unknown as OutboxPrismaParam, {
        aggregateType: "Payment",
        aggregateId: payment.id,
        eventType: EVENT_TYPES.PAYMENT_FAILED,
        topic: KAFKA_TOPICS.PAYMENT_FAILED,
        payload: failedEvent,
      });
    });

    logger.warn(
      {
        module: "PaymentService",
        paymentOrderId: payment.paymentOrderId,
        reason,
      },
      "Payment marked as FAILED and PaymentFailedV1 outbox event published.",
    );
  }

  /**
   * Processes raw Razorpay webhook payload and signature.
   *
   * @param rawBody - Raw HTTP body payload string or Buffer.
   * @param signature - Signature from `x-razorpay-signature` header.
   * @returns Status summary object.
   */
  async handleWebhook(
    rawBody: string | Buffer,
    signature: string,
  ): Promise<{ status: string; event?: string }> {
    const isValid = verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      throw new ApiError(
        statusCode.badRequest,
        COMMON_ERROR_CODES.INVALID_INPUT,
        "Invalid webhook signature.",
      );
    }

    const webhookBody =
      typeof rawBody === "string"
        ? JSON.parse(rawBody)
        : JSON.parse(rawBody.toString("utf8"));

    const event = webhookBody.event as string;
    const eventPayload = webhookBody.payload;

    logger.info(
      { module: "PaymentWebhook", event },
      "Razorpay webhook received.",
    );

    if (
      event === RAZORPAY_WEBHOOK_EVENTS.PAYMENT_CAPTURED ||
      event === RAZORPAY_WEBHOOK_EVENTS.ORDER_PAID
    ) {
      const entity =
        eventPayload?.payment?.entity || eventPayload?.order?.entity;
      if (entity?.order_id && entity.id) {
        await this.verifyAndCapture({
          razorpayOrderId: entity.order_id,
          razorpayPaymentId: entity.id,
          razorpaySignature: signature,
          source: "WEBHOOK",
        });
      }
    } else if (event === RAZORPAY_WEBHOOK_EVENTS.PAYMENT_FAILED) {
      const entity =
        eventPayload?.payment?.entity || eventPayload?.order?.entity;
      if (entity?.order_id) {
        const errorReason =
          entity.error_description ||
          entity.error_code ||
          "Payment failed at gateway";
        await this.markAsFailed(entity.order_id, errorReason);
      }
    }

    return { status: "PROCESSED", event };
  }

  /**
   * Gets current payment status by internal payment order ID.
   *
   * @param paymentOrderId - Internal payment order UUID.
   * @returns Payment status detail object.
   */
  async getStatus(paymentOrderId: string) {
    const payment = await this.paymentRepo.findByPaymentOrderId(paymentOrderId);
    if (!payment) {
      throw new ApiError(
        statusCode.notFound,
        COMMON_ERROR_CODES.NOT_FOUND,
        "Payment order not found.",
      );
    }

    return {
      paymentOrderId: payment.paymentOrderId,
      razorpayOrderId: payment.razorpayOrderId,
      razorpayPaymentId: payment.razorpayPaymentId || "",
      status: payment.status,
      amount: Math.round(Number(payment.amount) * 100),
      currency: payment.currency,
    };
  }
}
