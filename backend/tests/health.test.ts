import { request, setupTestDb, teardownTestDb } from './helpers';

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('GET /api/health', () => {
  it('should return healthy status', async () => {
    const res = await request.get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.timestamp).toBeDefined();
    expect(res.body.version).toBeDefined();
  });
});
