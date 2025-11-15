const express = require('express');
const cors = require('cors');
const quizRoutes = require('./routes/quizRoutes');
const wordRoutes = require('./routes/wordRoutes');

// 1. Initialize Firebase Admin SDK (This ensures 'auth' and 'db' are ready)
require('./config/firebase'); 

// 2. Import Middleware and Controller directly
//const authenticate = require('./middleware/auth'); 
const { createBatchStudents } = require('./controllers/uploadController'); 

const app = express();
const PORT = 5000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Existing Routes
app.use('/quiz', quizRoutes);
app.use('/word', wordRoutes);

// 3. Register the new Admin Route directly in server.js
// This replaces the need for the adminRoutes file.
app.post('/api/admin/create-batch-students', createBatchStudents);

app.get('/', (req, res) => res.send('✅ AI Backend is running!'));

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on http://localhost:${PORT}`));