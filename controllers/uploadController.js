
// Adjust the path to where your Firebase Admin config file is located
const { auth, db } = require('../config/firebase'); 

/**
 * Creates student accounts and saves their data to Firestore using the Admin SDK.
 * This does NOT sign the user in on the client side, keeping the teacher's session active.
 */
async function createBatchStudents(req, res) {
    // teacherId is sent from the client-side form to link the students
    const { students, teacherId } = req.body; 

    if (!students || !Array.isArray(students) || students.length === 0) {
        return res.status(400).json({ error: 'No student data provided.' });
    }

    if (!teacherId) {
        return res.status(401).json({ error: 'Teacher ID missing in request body.' });
    }

    try {
        const createPromises = students.map(async (student) => {
            const { studentId, name, parentEmail, role, section } = student;
            
            // Basic validation check
            if (!studentId || !parentEmail || !name) {
                console.warn(`Skipping student due to missing required fields: ${JSON.stringify(student)}`);
                // Return a specific value to indicate skip, or throw an error for this student
                throw new Error(`Missing required fields for student: ${name || studentId}`);
            }

            const cleanParentEmail = parentEmail.trim().toLowerCase();
            const password = `SRM-${studentId}`;
            
            // 1. Create User using Admin SDK (Uses 'auth' imported from config)
            const userRecord = await auth.createUser({
                email: cleanParentEmail,
                password: password,
                emailVerified: false,
                displayName: name.trim(),
            });
            
            // 2. Save User Metadata to Firestore
            await db.collection('students').doc(userRecord.uid).set({
                studentId,
                name: name.trim(),
                parentEmail: cleanParentEmail,
                role: role || 'student', // Use 'student' as default role if missing
                teacherId: teacherId, // Link student to the teacher who uploaded the CSV
                createdAt: new Date(),
                section: section || 'Unassigned' // Use 'Unassigned' as default section
            });
            return userRecord.uid; // Return the UID for success counting
        });

        // Execute all creations concurrently
        // Note: Promise.allSettled is used to ensure all promises finish, regardless of individual failure
        const results = await Promise.allSettled(createPromises);
        const successfulCreations = results.filter(r => r.status === 'fulfilled');
        const failedCreations = results.filter(r => r.status === 'rejected');

        if (failedCreations.length > 0) {
             console.error('Some student creations failed. Reasons:', failedCreations.map(f => f.reason));
        }

        return res.status(200).json({ 
            message: `${successfulCreations.length} out of ${students.length} students created successfully.`,
            successCount: successfulCreations.length,
            totalAttempted: students.length,
            failedCount: failedCreations.length
        });

    } catch (error) {
        console.error('Batch student creation failed:', error);
        // Return a generic 500 error if the process fails outside the individual student loop
        return res.status(500).json({ 
            error: 'Failed to create student accounts due to a server error.', 
            details: error.message 
        });
    }
}

module.exports = { createBatchStudents };