import type { Request, Response } from "express";
import { statusCode, successResponse } from "@irctc/http";
import type { SeatService } from "@services";

/**
 * Controller class orchestrating seat HTTP request mappings.
 */
export class SeatController {
  constructor(private readonly service: SeatService) {}

  /**
   * Handler for creating seats in bulk for a specific coach.
   *
   * @param req Express request object containing the coach ID parameter.
   * @param res Express response object.
   */
  async bulkCreateSeats(req: Request, res: Response): Promise<void> {
    const { coachId } = req.params;
    const result = await this.service.bulkCreateSeats(coachId!);
    res
      .status(statusCode.created)
      .json(successResponse("Seats generated successfully", result));
  }

  /**
   * Handler for retrieving all seats for a specific coach.
   *
   * @param req Express request object containing the coach ID parameter.
   * @param res Express response object.
   */
  async getSeats(req: Request, res: Response): Promise<void> {
    const { coachId } = req.params;
    const seats = await this.service.listSeats(coachId!);
    res
      .status(statusCode.success)
      .json(successResponse("Seats retrieved successfully", seats));
  }

  /**
   * Handler for retrieving a specific seat.
   *
   * @param req Express request object containing the coach ID and seat ID parameters.
   * @param res Express response object.
   */
  async getSeat(req: Request, res: Response): Promise<void> {
    const { coachId, seatId } = req.params;
    const seat = await this.service.getSeatById(coachId!, seatId!);
    res
      .status(statusCode.success)
      .json(successResponse("Seat retrieved successfully", seat));
  }

  /**
   * Handler for resetting all seats in a coach.
   *
   * @param req Express request object containing the coach ID parameter.
   * @param res Express response object.
   */
  async resetSeats(req: Request, res: Response): Promise<void> {
    const { coachId } = req.params;
    const result = await this.service.resetSeats(coachId!);
    res
      .status(statusCode.success)
      .json(successResponse("Seats reset successfully", result));
  }
}
