import type { Request, Response } from "express";
import { statusCode, successResponse } from "@irctc/http";
import type { ScheduleService } from "@services";
import type {
  CreateScheduleRequestDto,
  UpdateScheduleStatusRequestDto,
  ListSchedulesQueryDto,
} from "@dto";

/**
 * Controller class orchestrating Train Schedule HTTP request mappings.
 */
export class ScheduleController {
  constructor(private readonly service: ScheduleService) {}

  /**
   * Handler for creating a new journey schedule for a train.
   * @param req Request object containing schedule creation details.
   * @param res Response object.
   */
  async createSchedule(req: Request, res: Response): Promise<void> {
    const dto = req.body as CreateScheduleRequestDto;
    const schedule = await this.service.createSchedule(dto);
    res
      .status(statusCode.created)
      .json(successResponse("Schedule created successfully", schedule));
  }

  /**
   * Handler for retrieving a schedule by its ID.
   * @param req Request object containing schedule ID parameter.
   * @param res Response object.
   */
  async getSchedule(req: Request, res: Response): Promise<void> {
    const { scheduleId } = req.params;
    const schedule = await this.service.getScheduleById(scheduleId!);
    res
      .status(statusCode.success)
      .json(successResponse("Schedule retrieved successfully", schedule));
  }

  /**
   * Handler for updating a schedule's status.
   * @param req Request object containing schedule ID parameter and status update details.
   * @param res Response object.
   */
  async updateScheduleStatus(req: Request, res: Response): Promise<void> {
    const { scheduleId } = req.params;
    const dto = req.body as UpdateScheduleStatusRequestDto;
    const schedule = await this.service.updateScheduleStatus(scheduleId!, dto);
    res
      .status(statusCode.success)
      .json(successResponse("Schedule status updated successfully", schedule));
  }

  /**
   * Handler for retrieving a paginated list of all schedules.
   * @param req Request object containing query filter parameters.
   * @param res Response object.
   */
  async getAllSchedules(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as ListSchedulesQueryDto;
    const result = await this.service.listSchedules(query);
    res
      .status(statusCode.success)
      .json(
        successResponse(
          "Schedules retrieved successfully",
          result.data,
          result.metadata,
        ),
      );
  }
}
