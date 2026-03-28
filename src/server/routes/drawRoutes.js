const express = require('express');
const {
  listDraws,
  createDraw,
  getDrawById,
  updateDraw,
  deleteDraw,
  simulateDraw,
  runDraw,
  publishDraw,
  closeDraw,
} = require('../controllers/drawController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const { validateObjectIdParam, validateDrawPayload } = require('../middleware/validationMiddleware');

const router = express.Router();

router.use(protect, authorizeRoles('admin'));

router.route('/').get(listDraws).post(validateDrawPayload(), createDraw);
router
  .route('/:id')
  .get(validateObjectIdParam('id'), getDrawById)
  .patch(validateObjectIdParam('id'), validateDrawPayload(true), updateDraw)
  .delete(validateObjectIdParam('id'), deleteDraw);

router.post('/:id/simulate', validateObjectIdParam('id'), simulateDraw);
router.post('/:id/run', validateObjectIdParam('id'), runDraw);
router.post('/:id/publish', validateObjectIdParam('id'), publishDraw);
router.post('/:id/close', validateObjectIdParam('id'), closeDraw);

module.exports = router;
