import crypto from "node:crypto";
import {
  PaymentStatus,
  RefundStatus,
  type PrismaClient,
  type Payment,
  type PaymentRefund,
} from "@generated/prisma/client.js";
import {
  EVENT_TYPES,
  KAFKA_TOPICS,
  RefundStatus as ContractRefundStatus,
  type BookingRefundRequestedV1Type,
  type PaymentRefundedV1Type,
  formatRupees,
  rupeesToPaise,
  paiseToNumber,
} from "@irctc/contracts";
import { type OutboxRepository } from "@irctc/kafka";
import { logger } from "@irctc/logger";
import { ApiError, COMMON_ERROR_CODES } from "@irctc/errors";
import { statusCode } from "@irctc/http";
import { env } from "@config";
import { PaymentRepository, type PrismaTransaction } from "@repository";
import { getRazorpayClient } from "@utils";

type OutboxPrismaParam = Parameters<OutboxRepository["insert"]>[0];

/**
 * Result of gateway refund call.
 */
interface GatewayRefundResult {
  razorpayRefundId: string;
  refundStatus: ContractRefundStatus;
}

/**
 * Service managing payment refund initiation, gateway communication with idempotency,
 * crash resilience, and webhook reconciliation.
 */
export class PaymentRefundService {
  /**
   * Initializes PaymentRefundService.
   *
   * @param prisma - PrismaClient for database transactions.
   * @param paymentRepo - PaymentRepository instance.
   * @param outboxRepo - OutboxRepository for event outbox writes.
   */
  constructor(
    private readonly prisma: PrismaClient,
    private readonly paymentRepo: PaymentRepository,
    private readonly outboxRepo: OutboxRepository,
  ) {}

  /**
   * Initiates a payment refund via Razorpay with distributed safety.
   *
   * 1. Creates a durable PaymentRefund record in PENDING state before the gateway call.
   * 2. Calls Razorpay with `X-Refund-Idempotency` header for retry safety.
   * 3. On success, finalizes refund state and emits PaymentRefundedV1.
   * 4. On definitive rejection (4xx), marks FAILED and emits failure event.
   * 5. On gateway timeout / 5xx / network error, preserves PENDING state and re-throws
   *    so Kafka consumer retries safely with the same idempotencyKey.
   *
   * @param input - Refund request payload from booking-service.
   * @returns Refund outcome summary.
   */
  async refundPayment(input: BookingRefundRequestedV1Type): Promise<{
    id: string | null;
    status: "PENDING" | "PROCESSED" | "FAILED";
    amount: string;
    currency: string;
  }> {
    const payment = await this.paymentRepo.findByPaymentOrderId(
      input.paymentOrderId,
    );

    if (!payment) {
      throw new ApiError(
        statusCode.notFound,
        COMMON_ERROR_CODES.NOT_FOUND,
        `Payment not found for paymentOrderId ${input.paymentOrderId}`,
      );
    }

    if (payment.status !== PaymentStatus.CAPTURED) {
      return this.handleNonCapturedRefund(payment, input);
    }

    // Idempotency check: return existing state if already initiated
    const existing = await this.prisma.paymentRefund.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      logger.info(
        {
          module: "PaymentRefundService",
          idempotencyKey: input.idempotencyKey,
          status: existing.status,
        },
        "Refund with this idempotency key already exists — returning existing state.",
      );
      await this.emitIdempotentEvent(payment, existing, input.sagaId);
      return {
        id: existing.razorpayRefundId,
        status: (existing.status === "REVERSED"
          ? "FAILED"
          : existing.status) as "PENDING" | "PROCESSED" | "FAILED",
        amount: existing.amount.toString(),
        currency: payment.currency,
      };
    }

    const refundId = crypto.randomUUID();

    // Step 1: Pre-create PaymentRefund record in PENDING state BEFORE gateway call
    await this.prisma.paymentRefund.create({
      data: {
        id: refundId,
        paymentId: payment.id,
        razorpayRefundId: null,
        amount: input.amount,
        status: RefundStatus.PENDING,
        idempotencyKey: input.idempotencyKey,
        reason: input.reason,
      },
    });

    try {
      // Step 2: Call gateway with idempotency key
      const gatewayResult = await this.callGatewayRefund(
        payment,
        input,
        refundId,
      );

      // Step 3: Finalize success state
      await this.commitRefundSuccess(payment, refundId, input, gatewayResult);

      logger.info(
        {
          module: "PaymentRefundService",
          refundId,
          razorpayRefundId: gatewayResult.razorpayRefundId,
          status: gatewayResult.refundStatus,
        },
        "Refund initiated successfully.",
      );

      return {
        id: gatewayResult.razorpayRefundId,
        status:
          gatewayResult.refundStatus === ContractRefundStatus.PROCESSED
            ? "PROCESSED"
            : "PENDING",
        amount: input.amount,
        currency: input.currency,
      };
    } catch (err) {
      if (this.isDefinitiveRejection(err)) {
        // Deterministic 4xx rejection — mark FAILED
        await this.commitRefundFailure(payment, refundId, input, err);
        logger.error(
          { module: "PaymentRefundService", refundId, err },
          "Refund API definitively rejected — marked as FAILED.",
        );
        return {
          id: null,
          status: "FAILED",
          amount: input.amount,
          currency: input.currency,
        };
      } else {
        // Network timeout / 5xx / connection error: leave in PENDING state and re-throw
        logger.warn(
          { module: "PaymentRefundService", refundId, err },
          "Refund API call timed out or failed with uncertain status. Kept as PENDING for retry/webhook.",
        );
        throw err;
      }
    }
  }

  /**
   * Initiates a refund directly via HTTP request from API client.
   *
   * @param paymentOrderId - Internal payment order UUID.
   * @param amount - Optional custom refund amount.
   * @param reason - Optional refund reason.
   * @returns Refund status payload.
   */
  async initiateHttpRefund(
    paymentOrderId: string,
    amount?: string,
    reason?: string,
  ): Promise<{
    paymentId: string;
    refund: {
      id: string | null;
      status: "PENDING" | "PROCESSED" | "FAILED";
      amount: string;
      currency: string;
    };
  }> {
    const payment = await this.paymentRepo.findByPaymentOrderId(paymentOrderId);
    if (!payment) {
      throw new ApiError(
        statusCode.notFound,
        COMMON_ERROR_CODES.NOT_FOUND,
        `Payment not found for paymentOrderId ${paymentOrderId}`,
      );
    }

    const refundAmount = formatRupees(amount || payment.amount);
    const idempotencyKey = crypto.randomUUID();

    const refundResult = await this.refundPayment({
      eventId: crypto.randomUUID(),
      bookingId: payment.bookingId,
      paymentId: payment.paymentOrderId,
      paymentOrderId: payment.paymentOrderId,
      amount: refundAmount,
      currency: "INR",
      idempotencyKey,
      reason: reason || "Manual API refund",
      sagaId: crypto.randomUUID(),
      createdAt: new Date(),
    });

    return {
      paymentId: payment.paymentOrderId,
      refund: refundResult,
    };
  }

  /**
   * Handles refund.created webhook — confirms or populates razorpayRefundId on PENDING record.
   */
  async handleRefundCreatedWebhook(
    refundEntity: Record<string, unknown>,
  ): Promise<void> {
    const razorpayRefundId = String(refundEntity["id"]);
    const refund = await this.findRefundCandidate(refundEntity);
    if (refund?.status !== RefundStatus.PENDING) return;

    await this.prisma.paymentRefund.update({
      where: { id: refund.id },
      data: { razorpayRefundId, status: RefundStatus.PENDING },
    });

    logger.info(
      { module: "PaymentWebhook", razorpayRefundId },
      "refund.created: PaymentRefund confirmed PENDING.",
    );
  }

  /**
   * Handles refund.processed or refund.failed webhooks.
   * Settles PaymentRefund status and emits PaymentRefundedV1 Kafka event.
   */
  async handleRefundWebhook(
    refundEntity: Record<string, unknown>,
    outcome: "PROCESSED" | "FAILED",
  ): Promise<void> {
    const razorpayRefundId = String(refundEntity["id"]);
    const refund = await this.findRefundCandidate(refundEntity);

    if (!refund) {
      logger.warn(
        { module: "PaymentWebhook", razorpayRefundId, outcome },
        "Received refund webhook but no matching or uniquely identifiable PaymentRefund record found.",
      );
      return;
    }

    if (
      refund.status === RefundStatus.PROCESSED ||
      refund.status === RefundStatus.FAILED ||
      refund.status === RefundStatus.REVERSED
    ) {
      logger.info(
        { module: "PaymentWebhook", razorpayRefundId, existing: refund.status },
        "Refund webhook already processed — skipping.",
      );
      return;
    }

    const finalStatus =
      outcome === "PROCESSED" ? RefundStatus.PROCESSED : RefundStatus.FAILED;

    await this.prisma.$transaction(async (tx: PrismaTransaction) => {
      await tx.paymentRefund.update({
        where: { id: refund.id },
        data: { razorpayRefundId, status: finalStatus },
      });

      if (finalStatus === RefundStatus.PROCESSED) {
        await tx.payment.update({
          where: { id: refund.payment.id },
          data: { status: PaymentStatus.REFUNDED },
        });
      }

      await this.emitRefundEventTx(
        tx,
        {
          bookingId: refund.payment.bookingId,
          paymentId: refund.payment.id,
          paymentOrderId: refund.payment.paymentOrderId,
          refundId: refund.id,
          razorpayRefundId,
          amount: formatRupees(refund.amount),
          currency: "INR",
          status:
            outcome === "PROCESSED"
              ? ContractRefundStatus.PROCESSED
              : ContractRefundStatus.FAILED,
          sagaId: null,
          reason: undefined,
        },
        refund.payment.id,
      );
    });

    logger.info(
      { module: "PaymentWebhook", razorpayRefundId, outcome },
      `refund.${outcome.toLowerCase()}: PaymentRefund updated and PaymentRefundedV1 emitted.`,
    );
  }

  /**
   * Dispatches the refund call to Razorpay SDK or mock in dummy mode.
   */
  private async callGatewayRefund(
    payment: Payment,
    input: BookingRefundRequestedV1Type,
    refundId: string,
  ): Promise<GatewayRefundResult> {
    const isDummyKey =
      !env.RAZORPAY_KEY_ID || env.RAZORPAY_KEY_ID.includes("dummy");

    if (isDummyKey) {
      const mockRefundId = `rfnd_mock_${crypto.randomBytes(8).toString("hex")}`;
      logger.info(
        {
          module: "PaymentRefundService",
          refundId,
          razorpayRefundId: mockRefundId,
        },
        "Using mock Razorpay refund (dummy credentials).",
      );
      return {
        razorpayRefundId: mockRefundId,
        refundStatus: ContractRefundStatus.PROCESSED,
      };
    }

    if (!payment.razorpayPaymentId) {
      throw new ApiError(
        statusCode.badRequest,
        COMMON_ERROR_CODES.INVALID_INPUT,
        "Cannot refund payment without a valid razorpayPaymentId.",
      );
    }

    const amountInPaise = paiseToNumber(rupeesToPaise(input.amount));
    const razorpay = getRazorpayClient();

    const razorpayRes = await razorpay.payments.refund(
      payment.razorpayPaymentId,
      {
        amount: amountInPaise,
        notes: { bookingId: input.bookingId, reason: input.reason },
        receipt: input.idempotencyKey,
      },
    );

    const razorpayRefundId = String(razorpayRes.id);
    const rzpStatus = String(razorpayRes.status);
    const refundStatus =
      rzpStatus === "processed"
        ? ContractRefundStatus.PROCESSED
        : ContractRefundStatus.PENDING;

    return { razorpayRefundId, refundStatus };
  }

  /**
   * Commits successful refund initiation to the database and emits outbox event.
   */
  private async commitRefundSuccess(
    payment: Payment,
    refundId: string,
    input: BookingRefundRequestedV1Type,
    result: GatewayRefundResult,
  ): Promise<void> {
    const finalStatus =
      result.refundStatus === ContractRefundStatus.PROCESSED
        ? RefundStatus.PROCESSED
        : RefundStatus.PENDING;

    await this.prisma.$transaction(async (tx: PrismaTransaction) => {
      await tx.paymentRefund.update({
        where: { id: refundId },
        data: {
          razorpayRefundId: result.razorpayRefundId,
          status: finalStatus,
        },
      });

      if (finalStatus === RefundStatus.PROCESSED) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.REFUNDED },
        });
      }

      await this.emitRefundEventTx(
        tx,
        {
          bookingId: input.bookingId,
          paymentId: payment.id,
          paymentOrderId: payment.paymentOrderId,
          refundId,
          razorpayRefundId: result.razorpayRefundId,
          amount: formatRupees(input.amount),
          currency: input.currency,
          status: result.refundStatus,
          sagaId: input.sagaId,
          reason: input.reason,
        },
        payment.id,
      );
    });
  }

  /**
   * Commits definitive refund failure to the database and emits outbox event.
   */
  private async commitRefundFailure(
    payment: Payment,
    refundId: string,
    input: BookingRefundRequestedV1Type,
    err: unknown,
  ): Promise<void> {
    const reason =
      err instanceof Error ? err.message : "Razorpay refund API error";

    await this.prisma.$transaction(async (tx: PrismaTransaction) => {
      await tx.paymentRefund.update({
        where: { id: refundId },
        data: { status: RefundStatus.FAILED, reason },
      });

      await this.emitRefundEventTx(
        tx,
        {
          bookingId: input.bookingId,
          paymentId: payment.id,
          paymentOrderId: payment.paymentOrderId,
          refundId,
          razorpayRefundId: "",
          amount: formatRupees(input.amount),
          currency: input.currency,
          status: ContractRefundStatus.FAILED,
          sagaId: input.sagaId,
          reason,
        },
        payment.id,
      );
    });
  }

  /**
   * Reconciles a webhook entity to a local PaymentRefund candidate.
   * Uses primary razorpayRefundId lookup, with strict, unambiguous fallback on razorpayPaymentId + amount.
   */
  private async findRefundCandidate(
    refundEntity: Record<string, unknown>,
  ): Promise<(PaymentRefund & { payment: Payment }) | null> {
    const razorpayRefundId = String(refundEntity["id"] || "");

    // 1. Primary lookup by razorpayRefundId
    if (razorpayRefundId) {
      const primary = await this.prisma.paymentRefund.findFirst({
        where: { razorpayRefundId },
        include: { payment: true },
      });
      if (primary) return primary;
    }

    // 2. Unambiguous fallback lookup by payment_id
    const razorpayPaymentId = refundEntity["payment_id"] as string | undefined;
    if (!razorpayPaymentId) return null;

    const payment =
      await this.paymentRepo.findByRazorpayPaymentId(razorpayPaymentId);
    if (!payment) return null;

    const entityAmountPaise = Number(refundEntity["amount"] || 0);
    const decimalAmountStr = (entityAmountPaise / 100).toFixed(2);

    const pendingMatches = await this.prisma.paymentRefund.findMany({
      where: {
        paymentId: payment.id,
        status: RefundStatus.PENDING,
        amount: decimalAmountStr,
      },
      include: { payment: true },
    });

    // Only reconcile if exactly one candidate matches; otherwise leave pending to prevent mis-attachment
    if (pendingMatches.length === 1 && pendingMatches[0]) {
      return pendingMatches[0];
    }

    return null;
  }

  /**
   * Emits an idempotent PaymentRefundedV1 event when replaying a refund request.
   */
  private async emitIdempotentEvent(
    payment: Payment,
    existing: PaymentRefund,
    sagaId: string,
  ): Promise<void> {
    await this.emitRefundEvent(
      {
        bookingId: payment.bookingId,
        paymentId: payment.id,
        paymentOrderId: payment.paymentOrderId,
        refundId: existing.id,
        razorpayRefundId: existing.razorpayRefundId ?? "",
        amount: formatRupees(existing.amount),
        currency: "INR",
        status: existing.status as unknown as ContractRefundStatus,
        sagaId,
        reason: existing.reason ?? undefined,
      },
      payment.id,
    );
  }

  /**
   * Handles non-captured payment state during refund request.
   */
  private async handleNonCapturedRefund(
    payment: Payment,
    input: BookingRefundRequestedV1Type,
  ): Promise<{
    id: string | null;
    status: "PENDING" | "PROCESSED" | "FAILED";
    amount: string;
    currency: string;
  }> {
    if (payment.status === PaymentStatus.REFUNDED) {
      const existingRefund = await this.prisma.paymentRefund.findFirst({
        where: { paymentId: payment.id },
        orderBy: { createdAt: "desc" },
      });
      if (existingRefund) {
        await this.emitIdempotentEvent(payment, existingRefund, input.sagaId);
        return {
          id: existingRefund.razorpayRefundId,
          status: "PROCESSED",
          amount: existingRefund.amount.toString(),
          currency: payment.currency,
        };
      }
    }
    logger.warn(
      {
        module: "PaymentRefundService",
        paymentOrderId: input.paymentOrderId,
        status: payment.status,
      },
      "Refund requested for non-CAPTURED payment. Skipping.",
    );
    return {
      id: null,
      status: "FAILED",
      amount: input.amount,
      currency: input.currency,
    };
  }

  /**
   * Determines if a gateway error is a definitive non-retryable 4xx rejection.
   */
  private isDefinitiveRejection(err: unknown): boolean {
    if (err && typeof err === "object") {
      const code = (err as Record<string, unknown>)["statusCode"];
      if (
        typeof code === "number" &&
        code >= 400 &&
        code < 500 &&
        code !== 429
      ) {
        return true;
      }
      const errorObj = (err as Record<string, unknown>)["error"];
      if (errorObj && typeof errorObj === "object") {
        const subCode = (errorObj as Record<string, unknown>)["code"];
        if (subCode === "BAD_REQUEST_ERROR") return true;
      }
    }
    return false;
  }

  /**
   * Emits a PaymentRefundedV1 outbox event inside a transaction.
   */
  private async emitRefundEventTx(
    tx: PrismaTransaction,
    data: Omit<PaymentRefundedV1Type, "eventId" | "createdAt">,
    aggregateId: string,
  ): Promise<void> {
    const event: PaymentRefundedV1Type = {
      eventId: crypto.randomUUID(),
      ...data,
      createdAt: new Date(),
    };
    await this.outboxRepo.insert(tx as unknown as OutboxPrismaParam, {
      aggregateType: "Payment",
      aggregateId,
      eventType: EVENT_TYPES.PAYMENT_REFUNDED,
      topic: KAFKA_TOPICS.PAYMENT_REFUNDED,
      payload: event,
    });
  }

  /**
   * Emits a PaymentRefundedV1 outbox event outside a transaction.
   */
  private async emitRefundEvent(
    data: Omit<PaymentRefundedV1Type, "eventId" | "createdAt">,
    aggregateId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx: PrismaTransaction) => {
      await this.emitRefundEventTx(tx, data, aggregateId);
    });
  }
}
