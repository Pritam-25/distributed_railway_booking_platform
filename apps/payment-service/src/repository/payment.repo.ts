import type { PrismaClient } from "@generated/prisma/client.js";
import { PaymentStatus, type Payment } from "@generated/prisma/client.js";

export type PrismaTransaction = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/**
 * Parameters for creating a Payment record.
 */
export interface CreatePaymentParams {
  paymentOrderId: string;
  razorpayOrderId: string;
  bookingId: string;
  userId: string;
  amount: number | string;
  currency?: string;
}

/**
 * Parameters for updating payment status to CAPTURED.
 */
export interface CapturePaymentParams {
  paymentOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature?: string;
}

/**
 * Repository layer for managing database persistence of Payments.
 */
export class PaymentRepository {
  /**
   * Initializes PaymentRepository.
   *
   * @param prisma - PrismaClient instance.
   */
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Creates a new Payment record in PENDING status.
   *
   * @param data - Payment creation parameters.
   * @param tx - Optional active Prisma transaction.
   * @returns Created Payment database model instance.
   */
  async create(
    data: CreatePaymentParams,
    tx?: PrismaTransaction,
  ): Promise<Payment> {
    const client = tx || this.prisma;
    return client.payment.create({
      data: {
        paymentOrderId: data.paymentOrderId,
        razorpayOrderId: data.razorpayOrderId,
        bookingId: data.bookingId,
        userId: data.userId,
        amount: data.amount,
        currency: data.currency || "INR",
        status: PaymentStatus.PENDING,
      },
    });
  }

  /**
   * Finds a payment record by internal paymentOrderId.
   *
   * @param paymentOrderId - Internal payment order UUID.
   * @param tx - Optional active Prisma transaction.
   * @returns Payment record or null.
   */
  async findByPaymentOrderId(
    paymentOrderId: string,
    tx?: PrismaTransaction,
  ): Promise<Payment | null> {
    const client = tx || this.prisma;
    return client.payment.findUnique({
      where: { paymentOrderId },
    });
  }

  /**
   * Finds a payment record by bookingId.
   *
   * @param bookingId - Booking UUID.
   * @param tx - Optional active Prisma transaction.
   * @returns Payment record or null.
   */
  async findByBookingId(
    bookingId: string,
    tx?: PrismaTransaction,
  ): Promise<Payment | null> {
    const client = tx || this.prisma;
    return client.payment.findFirst({
      where: { bookingId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Finds a payment record by Razorpay orderId.
   *
   * @param razorpayOrderId - Razorpay order ID.
   * @param tx - Optional active Prisma transaction.
   * @returns Payment record or null.
   */
  async findByRazorpayOrderId(
    razorpayOrderId: string,
    tx?: PrismaTransaction,
  ): Promise<Payment | null> {
    const client = tx || this.prisma;
    return client.payment.findFirst({
      where: { razorpayOrderId },
    });
  }

  /**
   * Idempotent status transition PENDING -> CAPTURED (CAS update).
   *
   * @param params - Capture parameters including paymentOrderId and razorpayPaymentId.
   * @param tx - Optional active Prisma transaction.
   * @returns Updated Payment record or null.
   */
  async updateStatusToCaptured(
    params: CapturePaymentParams,
    tx?: PrismaTransaction,
  ): Promise<Payment | null> {
    const client = tx || this.prisma;

    const updateData: {
      status: PaymentStatus;
      razorpayPaymentId: string;
      razorpaySignature?: string;
    } = {
      status: PaymentStatus.CAPTURED,
      razorpayPaymentId: params.razorpayPaymentId,
    };
    if (params.razorpaySignature !== undefined) {
      updateData.razorpaySignature = params.razorpaySignature;
    }

    const result = await client.payment.updateMany({
      where: {
        paymentOrderId: params.paymentOrderId,
        status: { in: [PaymentStatus.CREATED, PaymentStatus.PENDING] },
      },
      data: updateData,
    });

    if (result.count === 0) {
      return this.findByPaymentOrderId(params.paymentOrderId, client);
    }

    return this.findByPaymentOrderId(params.paymentOrderId, client);
  }

  /**
   * Updates payment status to FAILED.
   *
   * @param paymentOrderId - Internal payment order UUID.
   * @param reason - Reason for failure.
   * @param tx - Optional active Prisma transaction.
   * @returns Updated Payment record or null.
   */
  async updateStatusToFailed(
    paymentOrderId: string,
    reason: string,
    tx?: PrismaTransaction,
  ): Promise<Payment | null> {
    const client = tx || this.prisma;
    await client.payment.updateMany({
      where: {
        paymentOrderId,
        status: { in: [PaymentStatus.CREATED, PaymentStatus.PENDING] },
      },
      data: {
        status: PaymentStatus.FAILED,
        failureReason: reason,
      },
    });
    return this.findByPaymentOrderId(paymentOrderId, client);
  }
}
