process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://dogfood:dogfood_dev_password@localhost:5432/dogfood_test';
process.env.SESSION_SECRET = 'test-secret-minimum-16-characters';
process.env.SESSION_TTL_HOURS = '1';
process.env.LOG_LEVEL = 'silent';
process.env.PORT = '0';
