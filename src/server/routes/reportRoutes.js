const express = require('express');
const { getReportSummary, exportReportCsv } = require('../controllers/reportController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect, authorizeRoles('admin'));

router.get('/summary', getReportSummary);
router.get('/export.csv', exportReportCsv);

module.exports = router;
