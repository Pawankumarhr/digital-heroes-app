const express = require('express');
const {
  listScores,
  createScore,
  getScoreById,
  updateScore,
  deleteScore,
} = require('../controllers/scoreController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const {
  validateObjectIdParam,
  validateScorePayload,
} = require('../middleware/validationMiddleware');

const router = express.Router();

router.use(protect, authorizeRoles('admin'));

router.route('/').get(listScores).post(validateScorePayload(), createScore);
router
  .route('/:id')
  .get(validateObjectIdParam('id'), getScoreById)
  .patch(validateObjectIdParam('id'), validateScorePayload(true), updateScore)
  .delete(validateObjectIdParam('id'), deleteScore);

module.exports = router;
