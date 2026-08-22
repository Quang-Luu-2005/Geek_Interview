import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { TransactionClient } from '../../../shared/database/transaction';

export type IdempotencyStatus = 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface IdempotencyRecord {
  id: string;
  request_hash: string;
  status: IdempotencyStatus;
  response_status: number | null;
  response_body: unknown;
}

export type IdempotencyClaim =
  { kind: 'claimed'; record: IdempotencyRecord } | { kind: 'existing'; record: IdempotencyRecord };

@Injectable()
export class IdempotencyRepository {
  async claim(
    transaction: TransactionClient,
    userId: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<IdempotencyClaim> {
    // The unique constraint makes this an atomic claim. When another request
    // owns the same key, PostgreSQL waits for that transaction to commit or
    // roll back before returning, so a concurrent retry never sees a false
    // PROCESSING result from an in-flight transaction.
    const inserted = await transaction.$queryRaw<IdempotencyRecord[]>(Prisma.sql`
      INSERT INTO idempotency_records
        (user_id, idempotency_key, request_hash, status)
      VALUES
        (${userId}::uuid, ${idempotencyKey}, ${requestHash}, 'PROCESSING')
      ON CONFLICT (user_id, idempotency_key) DO NOTHING
      RETURNING id::text AS id, request_hash, status,
        response_status, response_body
    `);

    if (inserted[0]) return { kind: 'claimed', record: inserted[0] };

    const existing = await transaction.$queryRaw<IdempotencyRecord[]>(Prisma.sql`
      SELECT id::text AS id, request_hash, status,
        response_status, response_body
      FROM idempotency_records
      WHERE user_id = ${userId}::uuid AND idempotency_key = ${idempotencyKey}
      FOR UPDATE
    `);

    if (!existing[0]) {
      // This should be unreachable unless the conflicting row was removed by
      // an external cleanup process between the statements.
      throw new Error('Idempotency claim disappeared');
    }

    return { kind: 'existing', record: existing[0] };
  }

  async complete(
    transaction: TransactionClient,
    id: string,
    responseStatus: number,
    responseBody: unknown,
  ): Promise<void> {
    const updated = await transaction.$executeRaw(Prisma.sql`
      UPDATE idempotency_records
      SET status = 'COMPLETED',
          response_status = ${responseStatus},
          response_body = ${JSON.stringify(responseBody)}::jsonb,
          updated_at = NOW()
      WHERE id = ${id}::uuid AND status = 'PROCESSING'
    `);

    if (updated !== 1) {
      throw new Error('Idempotency record could not be completed');
    }
  }
}
