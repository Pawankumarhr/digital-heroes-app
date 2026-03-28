const express = require('express');
const {
  listWinners,
  createWinner,
  getWinnerById,
  updateWinner,
  deleteWinner,
  submitWinnerProof,
  verifyWinner,
  markWinnerPaid,
} = require('../controllers/winnerController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const {
  validateObjectIdParam,
  validateWinnerPayload,
} = require('../middleware/validationMiddleware');

const router = express.Router();

router.use(protect, authorizeRoles('user', 'admin'));

router.route('/').get(listWinners).post(authorizeRoles('admin'), validateWinnerPayload(), createWinner);
router
  .route('/:id')
  .get(validateObjectIdParam('id'), getWinnerById)
  .patch(validateObjectIdParam('id'), authorizeRoles('admin'), validateWinnerPayload(true), updateWinner)
  .delete(validateObjectIdParam('id'), authorizeRoles('admin'), deleteWinner);

router.post('/:id/proof', validateObjectIdParam('id'), authorizeRoles('user', 'admin'), submitWinnerProof);
router.post('/:id/verify', validateObjectIdParam('id'), authorizeRoles('admin'), verifyWinner);
router.post('/:id/mark-paid', validateObjectIdParam('id'), authorizeRoles('admin'), markWinnerPaid);

module.exports = router;
