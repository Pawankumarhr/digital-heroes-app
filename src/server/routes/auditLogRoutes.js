const express = require('express');
const { listAuditLogs } = require('../controllers/auditLogController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect, authorizeRoles('admin'));

router.get('/', listAuditLogs);

module.exports = router;
