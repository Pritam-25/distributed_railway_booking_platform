import type {
  CreateTrainRequestDto,
  UpdateTrainRequestDto,
  ListTrainsQueryDto,
  UpdateOperatingDaysDto,
} from "@dto";
import type { TrainService } from "@services";
import type { Request, Response } from "express";
import { statusCode, successResponse, paginatedResponse } from "@irctc/http";

/**
 * Controller class that handles incoming HTTP requests for train management.
 * Acts as the entrypoint for Express routes and delegates business logic processing to the TrainService.
 */
export class TrainController {
  /**
   * Creates an instance of TrainController.
   * @param service The TrainService instance used to handle train business operations.
   */
  constructor(private readonly service: TrainService) {}

  /**
   * Handler for creating a new train.
   *
   * @param req Express request object containing the creation request body.
   * @param res Express response object.
   */
  async createTrain(req: Request, res: Response): Promise<void> {
    const trainData: CreateTrainRequestDto = req.body;
    const newTrain = await this.service.createTrain(trainData);
    res
      .status(statusCode.created)
      .json(successResponse("Train created successfully", newTrain));
  }

  /**
   * Handler for retrieving a train by its ID.
   *
   * @param req Express request object containing the train ID parameter.
   * @param res Express response object.
   */
  async getTrain(req: Request, res: Response): Promise<void> {
    const { trainId } = req.params;
    const train = await this.service.getTrainById(trainId!);
    res
      .status(statusCode.success)
      .json(successResponse("Train retrieved successfully", train));
  }

  /**
   * Handler for retrieving all trains.
   *
   * @param req Express request object containing query filter parameters.
   * @param res Express response object.
   */
  async getAllTrains(req: Request, res: Response): Promise<void> {
    const trains = await this.service.listTrains(
      req.query as unknown as ListTrainsQueryDto,
    );
    res
      .status(statusCode.success)
      .json(paginatedResponse("Trains retrieved successfully", trains));
  }

  /**
   * Handler for updating an existing train by its ID.
   *
   * @param req Express request object containing the train ID parameter and the update request body.
   * @param res Express response object.
   */
  async updateTrain(req: Request, res: Response): Promise<void> {
    const { trainId } = req.params;
    const trainData: UpdateTrainRequestDto = req.body;
    const updatedTrain = await this.service.updateTrain(trainId!, trainData);
    res
      .status(statusCode.success)
      .json(successResponse("Train updated successfully", updatedTrain));
  }

  /**
   * Handler for deactivating a train by its ID.
   *
   * @param req Express request object containing the train ID parameter.
   * @param res Express response object.
   */
  async deactivateTrain(req: Request, res: Response): Promise<void> {
    const { trainId } = req.params;

    const deactivatedTrain = await this.service.deactivateTrain(trainId!);
    res
      .status(statusCode.success)
      .json(
        successResponse("Train deactivated successfully", deactivatedTrain),
      );
  }

  /**
   * Handler for setting/updating operating days of a train by its ID.
   *
   * @param req Express request object containing the train ID parameter and operatingDays list in the body.
   * @param res Express response object.
   */
  async updateTrainOperatingDays(req: Request, res: Response): Promise<void> {
    const { trainId } = req.params;
    const body: UpdateOperatingDaysDto = req.body;

    const updatedDays = await this.service.updateTrainOperatingDays(
      trainId!,
      body,
    );
    res.status(statusCode.success).json(
      successResponse("Train operating days updated successfully", {
        trainId,
        operatingDays: updatedDays,
      }),
    );
  }
}
