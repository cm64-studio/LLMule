// src/routes/auth.js
const express = require('express');
const router = express.Router();
const { validateRegistration, register, verifyEmail } = require('../controllers/authController');
const { authenticateApiKey } = require('../middleware/auth');

router.post('/register', validateRegistration, register);
router.get('/verify-email', verifyEmail);

router.get('/me', authenticateApiKey, async (req, res) => {
    try {
        if (!req.user) {
            console.error('No user in request after authentication');
            return res.status(401).json({
                error: 'Authentication failed',
                message: 'No user found'
            });
        }

        console.log('Sending user info:', {
            userId: req.user._id.toString(),
            email: req.user.email,
            status: req.user.status
        });

        res.json({
            userId: req.user._id.toString(), // Ensure it's a string
            email: req.user.email,
            status: req.user.status,
            provider: req.user.provider
        });
    } catch (error) {
        console.error('Error getting user info:', error);
        res.status(500).json({
            error: 'Failed to get user info',
            message: error.message
        });
    }
});

module.exports = router;