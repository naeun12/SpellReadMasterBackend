// config/firebase.js
const admin = require('firebase-admin');

// Load the service account JSON from environment variable
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'spellread-master', // Optional, but good to include
});

const db = admin.firestore();

module.exports = { admin, db };
