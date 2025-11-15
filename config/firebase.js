// config/firebase.js
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // Make sure this is in config/

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'spellread-master', // Optional, but good to include
});

const db = admin.firestore();

module.exports = { admin, db };
