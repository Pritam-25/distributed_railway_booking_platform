import { ApiError } from "@irctc/errors";

export class PricingService {
  static readonly BASE_RATE_PER_KM = 0.8;

  static readonly TRAIN_CATEGORY_MULTIPLIER: Record<string, number> = {
    PASSENGER: 1.0,
    EXPRESS: 1.2,
    SUPERFAST: 1.4,
    DURONTO: 1.8,
    RAJDHANI: 2.2,
    SHATABDI: 2.0,
    VANDE_BHARAT: 2.5,
    DEMU: 1.0,
    MEMU: 1.0,
  };

  static readonly COACH_MULTIPLIER: Record<string, number> = {
    GEN: 1.0,
    SL: 1.5,
    AC_3E: 2.0,
    AC_3A: 2.5,
    AC_2A: 3.5,
    AC_1A: 5.0,
    CC: 2.0,
    EC: 4.0,
  };

  /**
   * Calculates the base rate per kilometer for a given coach type and train category.
   */
  static calculatePricePerKm(trainCategory: string, coachType: string): number {
    const normalizedCategory = trainCategory.toUpperCase();
    const normalizedCoach = coachType.toUpperCase();

    const categoryMult =
      PricingService.TRAIN_CATEGORY_MULTIPLIER[normalizedCategory];
    if (categoryMult === undefined) {
      throw new ApiError(
        400,
        "INVALID_INPUT",
        `Unknown train category: ${trainCategory}`,
      );
    }

    const coachMult = PricingService.COACH_MULTIPLIER[normalizedCoach];
    if (coachMult === undefined) {
      throw new ApiError(
        400,
        "INVALID_INPUT",
        `Unknown coach type: ${coachType}`,
      );
    }

    return PricingService.BASE_RATE_PER_KM * categoryMult * coachMult;
  }
}
