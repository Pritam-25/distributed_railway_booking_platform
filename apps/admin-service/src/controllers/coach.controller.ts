import type { Request, Response } from "express";
import { statusCode, successResponse } from "@irctc/http";
import type { CoachService } from "@services";
import type { CreateCoachRequestDto, UpdateCoachRequestDto } from "@dto";

/**
 * Controller class orchestrating coach HTTP request mappings.
 */
export class CoachController {
  constructor(private readonly service: CoachService) {}

  /**
   * Handler for creating a new coach.
   *
   * @param req Express request object containing the coach data in the body.
   * @param res Express response object.
   */
  async createCoach(req: Request, res: Response): Promise<void> {
    const { trainId } = req.params;
    const dto: CreateCoachRequestDto = req.body;
    const coach = await this.service.addCoach(trainId!, dto);
    res
      .status(statusCode.created)
      .json(successResponse("Coach created successfully", coach));
  }

  /**
   * Handler for getting a specific coach.
   *
   * @param req Express request object containing the coach ID.
   * @param res Express response object.
   */
  async getCoach(req: Request, res: Response): Promise<void> {
    const { coachId } = req.params;
    const coach = await this.service.getCoachById(coachId!);
    res
      .status(statusCode.success)
      .json(successResponse("Coach retrieved successfully", coach));
  }

  /**
   * Handler for listing all coaches.
   *
   * @param req Express request object.
   * @param res Express response object.
   */
  async getAllCoaches(req: Request, res: Response): Promise<void> {
    const { trainId } = req.params;
    const coaches = await this.service.listCoaches(trainId!);
    res
      .status(statusCode.success)
      .json(successResponse("Coaches retrieved successfully", coaches));
  }

  /**
   * Handler for updating a coach.
   *
   * @param req Express request object containing the coach ID and update data.
   * @param res Express response object.
   */
  async updateCoach(req: Request, res: Response): Promise<void> {
    const { coachId } = req.params;
    const dto: UpdateCoachRequestDto = req.body;
    const coach = await this.service.updateCoach(coachId!, dto);
    res
      .status(statusCode.success)
      .json(successResponse("Coach updated successfully", coach));
  }

  /**
   * Handler for deleting a coach.
   *
   * @param req Express request object containing the coach ID.
   * @param res Express response object.
   */
  async deleteCoach(req: Request, res: Response): Promise<void> {
    const { coachId } = req.params;
    const deletedCoach = await this.service.deleteCoach(coachId!);
    res
      .status(statusCode.success)
      .json(successResponse("Coach deleted successfully", deletedCoach));
  }
}
