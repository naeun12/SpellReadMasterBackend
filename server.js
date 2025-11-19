const express = require('express');
const cors = require('cors');
const quizRoutes = require('./routes/quizRoutes');
const wordRoutes = require('./routes/wordRoutes');

require('./config/firebase'); 
const { createBatchStudents } = require('./controllers/uploadController'); 

const app = express();
const PORT = process.env.PORT || 5000;

const corsOptions = {
  origin: [
    'https://spellreadmasterfrontend-production.up.railway.app',
    'http://localhost:3000',
    'http://localhost:5173'
  ],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
};

// Enable CORS
app.use(cors(corsOptions));

// Very important: allow OPTIONS before hitting routes
app.options('*', cors(corsOptions));

app.use(express.json());

app.use('/quiz', quizRoutes);
app.use('/word', wordRoutes);

app.post('/api/admin/create-students', createBatchStudents);

app.get('/', (req, res) => res.send('Backend running!'));

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
