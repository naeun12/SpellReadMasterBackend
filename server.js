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
const PORT = process.env.PORT || 5000; // Use environment variable for production

// Configure CORS properly for production
const corsOptions = {
  origin: [
    'https://spellreadmasterfrontend-production.up.railway.app', // Replace with your actual frontend URL
    'http://localhost:3000',
    'http://localhost:5173'
  ],
  credentials: true
};
app.use(cors(corsOptions));

app.use(express.json());

// Existing Routes
app.use('/quiz', quizRoutes);
app.use('/word', wordRoutes);

// 3. Fix the route name to match what your frontend expects
app.post('/api/admin/create-students', createBatchStudents); // Changed from create-batch-students

app.get('/', (req, res) => res.send('✅ AI Backend is running!'));

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));