const express = require('express');
const { listUsers, updateUser } = require('../controllers/adminController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const { validateObjectIdParam } = require('../middleware/validationMiddleware');

const router = express.Router();

router.use(protect, authorizeRoles('admin'));
router.get('/users', listUsers);
router.patch('/users/:id', validateObjectIdParam('id'), updateUser);

module.exports = router;
