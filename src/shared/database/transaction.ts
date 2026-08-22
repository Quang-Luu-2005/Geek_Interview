import { Prisma } from '@prisma/client';

import type { PrismaService } from './prisma.service';

export type TransactionClient = Prisma.TransactionClient;

export interface TransactionOptions {
  maxAttempts?: number;
  maxWaitMs?: number;
  timeoutMs?: number;
}

const TRANSIENT_POSTGRES_CODES = new Set(['40001', '40P01']);

export function isTransientDatabaseError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: string; meta?: { code?: string } };
  return (
    candidate.code === 'P2034' ||
    TRANSIENT_POSTGRES_CODES.has(candidate.code ?? '') ||
    TRANSIENT_POSTGRES_CODES.has(candidate.meta?.code ?? '')
  );
}

/**
 * Runs one application workflow in one Prisma transaction. Retry is opt-in and
 * limited to classified serialization/deadlock errors; business errors are
 * never retried.
 */
export async function withTransaction<T>(
  database: PrismaService,
  work: (transaction: TransactionClient) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 1);
  const maxWait = options.maxWaitMs ?? 5_000;
  const timeout = options.timeoutMs ?? 10_000;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await database.$transaction(work, {
        maxWait,
        timeout,
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      });
    } catch (error) {
      if (!isTransientDatabaseError(error) || attempt === maxAttempts) throw error;
    }
  }

  throw new Error('Transaction retry policy exhausted unexpectedly');
}

/**
 * Resource identifiers must be acquired in one stable order by every caller.
 * Returning a copy prevents a repository from mutating the request DTO.
 */
export function sortResourceIds(resourceIds: readonly string[]): string[] {
  return [...resourceIds].sort((left, right) => left.localeCompare(right, 'en'));
}

export function assertUniqueResourceIds(resourceIds: readonly string[]): void {
  if (new Set(resourceIds).size !== resourceIds.length) {
    throw new Error('Duplicate resource identifiers are not allowed');
  }
}
