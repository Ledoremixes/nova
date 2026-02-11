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

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.get('/api/health', (req, res) => {
  res.status(200).json({ ok: true, ts: new Date().toISOString() });
});


app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Backend gestionale ASD' });
});

// API protette / pubbliche
app.use('/api/auth', authRoutes);         // register / login
app.use('/api/entries', entriesRoutes);   // prima nota
app.use('/api/accounts', accountsRoutes); // conti
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/admin', adminUsersRouter);
app.use('/api/tesserati', require('./routes/tesserati'));
app.use("/api/teachers", teachersRouter);
app.use("/api/storage", storageRouter);

// ✅ case-sensitive fix
app.use('/api/report', require('./routes/reportIva'));

app.listen(PORT, () => {
  console.log(`Backend in ascolto su http://localhost:${PORT}`);
});
