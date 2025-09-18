import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Import routes
import userRoutes from './routes/userRoutes.js';
import referralRoutes from './routes/referralRoutes.js';
import levelRoutes from './routes/levelRoutes.js';
import incomeRoutes from './routes/incomeRoutes.js';
import contractRoutes from './routes/contractRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import investmentRoutes from './routes/investmentRoutes.js';

// Import services
import { startEventListener } from './services/eventListener.js';
import { startSyncService } from './services/syncService.js';
import logger from './utils/logger.js';
import { initializeErrorSuppression } from './utils/errorSuppressor.js';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

// Initialize error suppression to reduce noise in logs
initializeErrorSuppression();

const app = express();
const PORT = process.env.PORT || 5001; // Changed to 5001 since 5000 is in use

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
});

app.use(limiter);

// CORS configuration - Production and development origins
const allowedOrigins = [
  'https://bdcstack.com',
  'https://www.bdcstack.com',
  'https://app.bdcstack.com',
  'http://localhost:7050',
  'http://localhost:7051',
  'http://localhost:3000',
  'http://127.0.0.1:7050',
  'http://127.0.0.1:7051',
  'http://127.0.0.1:3000'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      console.log('❌ CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  optionsSuccessStatus: 200 // For legacy browser support
}));

// Additional CORS headers for all requests
app.use((req, res, next) => {
  // Set CORS headers for production domains
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
    res.header('Access-Control-Allow-Origin', origin || '*');
  }

  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Middleware
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  });
});

// Simple test endpoint for frontend
app.get('/api/test', (req, res) => {
  res.status(200).json({
    message: 'API is working!',
    timestamp: new Date().toISOString(),
    port: process.env.PORT || 5001
  });
});

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// API Routes
app.use('/api/users', userRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/levels', levelRoutes);
app.use('/api/income', incomeRoutes);
app.use('/api/contract', contractRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/investments', investmentRoutes);

// Log all registered routes
console.log('\n📋 Registered API Routes:');
console.log('├── /api/users');
console.log('├── /api/referrals');
console.log('├── /api/levels');
console.log('├── /api/income');
console.log('├── /api/contract');
console.log('├── /api/analytics');
console.log('└── /api/investments\n');

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'BDC MLM Backend API',
    version: '1.0.0',
    documentation: '/api/docs',
    health: '/health'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  
  res.status(err.status || 500).json({
    error: {
      message: process.env.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : err.message,
      status: err.status || 500,
      timestamp: new Date().toISOString()
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: {
      message: 'Route not found',
      status: 404,
      path: req.originalUrl
    }
  });
});

// Database connection
async function connectDatabase() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/bdc_mlm';
    
    await mongoose.connect(mongoUri);
    
    logger.info('✅ Connected to MongoDB successfully');
    
    // Create indexes for better performance
    await createIndexes();
    
  } catch (error) {
    logger.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

// Create database indexes
async function createIndexes() {
  try {
    const db = mongoose.connection.db;
    
    // User indexes
    await db.collection('users').createIndex({ walletAddress: 1 }, { unique: true });
    await db.collection('users').createIndex({ referralCode: 1 }, { unique: true });
    await db.collection('users').createIndex({ referrer: 1 });
    await db.collection('users').createIndex({ createdAt: -1 });
    
    // Referral indexes
    await db.collection('referrals').createIndex({ user: 1, level: 1 });
    await db.collection('referrals').createIndex({ referrer: 1, level: 1 });
    await db.collection('referrals').createIndex({ createdAt: -1 });
    
    // Income indexes
    await db.collection('incomes').createIndex({ user: 1, type: 1 });
    await db.collection('incomes').createIndex({ createdAt: -1 });
    
    // Investment indexes
    await db.collection('investments').createIndex({ user: 1 });
    await db.collection('investments').createIndex({ createdAt: -1 });
    
    logger.info('✅ Database indexes created successfully');
  } catch (error) {
    logger.error('❌ Error creating indexes:', error);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await mongoose.connection.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await mongoose.connection.close();
  process.exit(0);
});

// Start server
async function startServer() {
  try {
    // Connect to database
    await connectDatabase();
    
    // Start the server
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log('\n🚀 ================================');
      console.log('🎯 BDC MLM Backend Server Started');
      console.log('🚀 ================================');
      console.log(`📍 Port: ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Local URL: http://localhost:${PORT}`);
      console.log(`📊 Health Check: http://localhost:${PORT}/health`);
      console.log(`📋 API Base: http://localhost:${PORT}/api`);
      console.log('🚀 ================================\n');

      logger.info(`🚀 Server running on port ${PORT}`, { service: 'bdc-mlm-backend' });
      logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`, { service: 'bdc-mlm-backend' });
      logger.info(`📊 Health check: http://localhost:${PORT}/health`, { service: 'bdc-mlm-backend' });
    });

    // Handle server errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use!`);
        console.log('💡 Try killing the process or use a different port');
        process.exit(1);
      } else {
        console.error('❌ Server error:', error);
        logger.error('Server error:', error);
      }
    });
    
    // Start blockchain event listener (only if enabled)
    if (process.env.NODE_ENV !== 'test') {
      // Only start event listener if explicitly enabled to prevent rate limiting
      if (process.env.ENABLE_EVENT_LISTENER === 'true') {
        logger.info('🎧 Event listener enabled, starting...');
        await startEventListener();
      } else {
        logger.info('🎧 Event listener disabled (to prevent RPC rate limiting)');
        logger.info('ℹ️ Set ENABLE_EVENT_LISTENER=true in .env to enable');
      }

      await startSyncService();
    }
    
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the application
startServer();

export default app;
