import {
  assertUniqueResourceIds,
  isTransientDatabaseError,
  sortResourceIds,
  withTransaction,
} from '../../src/shared/database/transaction';

describe('transaction primitives', () => {
  it('sorts resource identifiers without mutating the input', () => {
    const input = ['category-b', 'category-a', 'category-c'];

    expect(sortResourceIds(input)).toEqual(['category-a', 'category-b', 'category-c']);
    expect(input).toEqual(['category-b', 'category-a', 'category-c']);
  });

  it('rejects duplicate resources before a transaction starts', () => {
    expect(() => assertUniqueResourceIds(['vip', 'vip'])).toThrow(
      'Duplicate resource identifiers are not allowed',
    );
    expect(() => assertUniqueResourceIds(['vip', 'standard'])).not.toThrow();
  });

  it('classifies PostgreSQL deadlocks and serialization failures as transient', () => {
    expect(isTransientDatabaseError({ code: '40P01' })).toBe(true);
    expect(isTransientDatabaseError({ code: '40001' })).toBe(true);
    expect(isTransientDatabaseError({ code: '23505' })).toBe(false);
  });

  it('uses one bounded READ COMMITTED transaction', async () => {
    type Runner = (
      work: (transaction: unknown) => Promise<unknown>,
      options: { maxWait: number; timeout: number; isolationLevel: string },
    ) => Promise<unknown>;
    const transaction: Runner = (work, options) => {
      expect(options).toMatchObject({ maxWait: 5000, timeout: 10000 });
      expect(options.isolationLevel).toBe('ReadCommitted');
      return work({});
    };

    const result = await withTransaction({ $transaction: transaction } as never, () =>
      Promise.resolve('committed'),
    );

    expect(result).toBe('committed');
  });

  it('retries only a classified transient error when configured', async () => {
    let attempts = 0;
    const transaction = jest.fn().mockImplementation(() => {
      attempts += 1;
      if (attempts === 1) {
        return Promise.reject(Object.assign(new Error('deadlock'), { code: '40P01' }));
      }
      return Promise.resolve('committed');
    });

    await expect(
      withTransaction({ $transaction: transaction } as never, () => Promise.resolve('unused'), {
        maxAttempts: 2,
      }),
    ).resolves.toBe('committed');
    expect(transaction).toHaveBeenCalledTimes(2);
  });
});
