export const ERROR_CODES = {} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
