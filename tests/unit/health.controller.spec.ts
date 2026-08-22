import { HealthController } from '../../src/app/health.controller';

describe('HealthController', () => {
  it('returns an OK response when the database query succeeds', async () => {
    const database = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const controller = new HealthController(database as never);

    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(result.database).toBe('up');
    expect(database.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('returns service unavailable when the database query fails', async () => {
    const database = { $queryRaw: jest.fn().mockRejectedValue(new Error('database down')) };
    const controller = new HealthController(database as never);

    await expect(controller.check()).rejects.toMatchObject({ status: 503 });
  });
});
