const express = require('express');
const {
	signup,
	register,
	userRegister,
	login,
	forgotPassword,
	me,
	updatePreferences,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/signup', signup);
router.post('/register', register);
router.post('/user-register', userRegister);
router.post('/user-signup', userRegister);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.get('/me', protect, me);
router.patch('/preferences', protect, updatePreferences);

module.exports = router;