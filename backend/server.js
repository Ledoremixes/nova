require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const entriesRoutes = require('./routes/entries');
const accountsRoutes = require('./routes/accounts');
const dashboardRoutes = require('./routes/dashboard');
const reportRoutes = require('./routes/report');
const statsRoutes = require('./routes/stats');
const adminUsersRouter = require('./routes/adminUsers');
const teachersRouter = require("./routes/teachers");
const storageRouter = require("./routes/storage");
const tesseratiRouter = require('./routes/tesserati');
const reportIvaRouter = require('./routes/reportIva');

const app = express();

const ALLOWED_ORIGINS = [
  "https://nova-gest.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

// se vuoi permettere anche preview Vercel:
// const isAllowed = (origin) =>
//   !origin ||
//   origin === "http://localhost:5173" ||
//   origin === "http://localhost:3000" ||
//   origin === "https://nova-gest.vercel.app" ||
//   /^https:\/\/nova-gest-.*\.vercel\.app$/.test(origin);

const corsOptions = {
  origin: function (origin, cb) {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS: " + origin));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // ✅ preflight

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

const PORT = process.env.PORT || 4000;

app.get('/api/health', (req, res) => {
  res.status(200).json({ ok: true, ts: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Backend gestionale ASD' });
});

app.use('/api/auth', authRoutes);
app.use('/api/entries', entriesRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/report', reportIvaRouter);
app.use('/api/stats', statsRoutes);
app.use('/api/admin', adminUsersRouter);
app.use('/api/tesserati', tesseratiRouter);
app.use('/api/teachers', teachersRouter);
app.use('/api/storage', storageRouter);

// ✅ error handler (utile per vedere errori CORS)
app.use((err, req, res, next) => {
  console.error('SERVER ERROR:', err);
  res.status(500).json({ error: err.message || 'Server error' });
});

app.listen(PORT, () => {
  console.log(`Backend in ascolto su http://localhost:${PORT}`);
});
