import { isRecord } from './isRecord';

/** Whether a thrown value is a system error with this code, such as `ENOENT`. */
export const hasErrorCode = (error: unknown, code: string): boolean => isRecord(error) && error.code === code;
