import toast from 'react-hot-toast';
import { getErrorMessage } from '@/shared/utils/typeGuards';
import { log } from '@/shared/utils/logger';

/**
 * Consolidated error handling — handles errors consistently
 * across the entire application with user-friendly toast notifications.
 */
export function handleError(error: unknown, context: string): void {
  const message = getErrorMessage(error);
  log.error(context, message, error);
  toast.error(`${context}: ${message}`);
}

/**
 * Standard success toast.
 */
export function showSuccess(message: string): void {
  toast.success(message);
}

/**
 * Standard info toast.
 */
export function showInfo(message: string): void {
  toast(message, { icon: 'ℹ️' });
}

export { toast };