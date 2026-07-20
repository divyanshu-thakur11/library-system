const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const config = require('./config');
const { errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const memberRoutes = require('./routes/members');
const cabinRoutes = require('./routes/cabins');
const assignmentRoutes = require('./routes/assignments');
const billingRoutes = require('./routes/billing');
const receiptRoutes = require('./routes/receipts');
const reportRoutes = require('./routes/reports');
const auditRoutes = require('./routes/audit');
const feeStructureRoutes = require('./routes/feeStructures');
const settingsRoutes = require('./routes/settings');
const backupRoutes = require('./routes/backup');
const followupRoutes = require('./routes/followups');
const enquiryRoutes = require('./routes/enquiries');
const demoRoutes = require('./routes/demos');

const app = express();

// Stateless: no server-side sessions, no local file storage for app data.
// All state lives in the DB and short-lived JWTs, so this process can be
// scaled horizontally behind a load balancer with zero sticky-session needs.
app.set('trust proxy', 1);
app.use(helmet());
app.use(
  cors({
    origin: config.clientOrigin,
    credentials: true,
  })
);
// Default body-parser limit (100kb) is too small once member photos (base64
// data URLs) are in the mix - 6mb comfortably covers our ~2MB photo cap
// plus JSON overhead and multi-field payloads.
app.use(express.json({ limit: '6mb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true, env: config.env }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/cabins', cabinRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/receipts', receiptRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/fee-structures', feeStructureRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/followups', followupRoutes);
app.use('/api/enquiries', enquiryRoutes);
app.use('/api/demos', demoRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

module.exports = app;
