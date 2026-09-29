import express from 'express';
import path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { logger } from './logger';
import { errorHandler } from './middleware/error-handler';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import policiesRouter from './routes/policies';
import hackathonsRouter from './routes/hackathons';
import judgingRouter from './routes/judging';
import auditRouter from './routes/audit';
import { publicRouter } from './routes/public';

const app = express();

app.use(helmet());

// CORS: restrict origins using FRONTEND_URL from environment.
// Supports comma-separated origins for multiple frontends.
const allowedOrigins = config.FRONTEND_URL.split(',').map(o => o.trim());
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Allow large migration payloads specifically on the import route
app.use('/api/hackathons/import', express.json({ limit: '50mb' }));

// Limit JSON body size to prevent parsing-based DoS for all other routes
app.use(express.json({ limit: '100kb' }));

// Auth-specific rate limiter: protects login and registration from brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 auth attempts per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many authentication attempts, please try again later.' } },
});

app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => (req as express.Request).path === '/api/health',
    },
  })
);

app.get('/api/openapi.yaml', (_req, res) => {
  res.setHeader('Content-Type', 'application/yaml');
  res.sendFile(path.join(__dirname, '..', '..', 'openapi.yaml'));
});

app.use('/api/health', healthRouter);
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/policies', policiesRouter);
app.use('/api/hackathons', hackathonsRouter);
app.use('/api/judging', judgingRouter);
app.use('/api/audit', auditRouter);
app.use('/api/public', publicRouter);

// Serve frontend static assets
const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(publicPath));

// Dedicated embed route for gallery (T4 requirement)
app.get('/embed/gallery', (req, res) => {
  res.removeHeader('X-Frame-Options');
  const existingCsp = res.getHeader('Content-Security-Policy');
  if (existingCsp && typeof existingCsp === 'string') {
    const newCsp = existingCsp.replace(/frame-ancestors 'self'/g, "frame-ancestors *");
    res.setHeader('Content-Security-Policy', newCsp);
  }
  res.sendFile(path.join(publicPath, 'index.html'));
});

// SPA fallback for all other non-API routes
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.use(errorHandler);

export default app;
