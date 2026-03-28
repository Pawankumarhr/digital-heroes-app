const express = require('express');
const { listContactMessages, submitContact } = require('../controllers/contactController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const { validateContactPayload } = require('../middleware/validationMiddleware');

const router = express.Router();

router.get('/', protect, authorizeRoles('admin'), listContactMessages);
router.post('/', validateContactPayload(), submitContact);

module.exports = router;
