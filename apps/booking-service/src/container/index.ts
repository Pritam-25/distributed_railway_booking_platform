import { BookingContainer } from "./booking.container.js";

const bookingContainer = BookingContainer.getInstance();

export const {
  bookingController,
  bookingRepository,
  bookingService,
  outboxRepository,
} = bookingContainer;

export { bookingContainer, BookingContainer };
