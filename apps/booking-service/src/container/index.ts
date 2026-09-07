import { BookingContainer } from "./booking.container.js";

const bookingContainer = BookingContainer.getInstance();

export const {
  bookingController,
  bookingEventsController,
  seatEventsController,
} = bookingContainer;

export { bookingContainer, BookingContainer };
