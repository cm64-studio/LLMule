// src/routes/auth.js
const express = require('express');
const router = express.Router();
const { validateRegistration, register, verifyEmail } = require('../controllers/authController');

router.post('/register', validateRegistration, register);
router.get('/verify-email', verifyEmail);

module.exports = router;