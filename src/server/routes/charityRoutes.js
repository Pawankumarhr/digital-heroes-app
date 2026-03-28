const express = require('express');
const {
  listPublicCharities,
  listCharities,
  listCharityContributions,
  getMyCharityImpact,
  createCharity,
  getCharityById,
  updateCharity,
  deleteCharity,
} = require('../controllers/charityController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const {
  validateObjectIdParam,
  validateCharityPayload,
} = require('../middleware/validationMiddleware');

const router = express.Router();

router.get('/public', listPublicCharities);

router.use(protect, authorizeRoles('user', 'admin'));

router.get('/contributions', listCharityContributions);
router.get('/my-impact', getMyCharityImpact);

router.use(authorizeRoles('admin'));

router.route('/').get(listCharities).post(validateCharityPayload(), createCharity);
router
  .route('/:id')
  .get(validateObjectIdParam('id'), getCharityById)
  .patch(validateObjectIdParam('id'), validateCharityPayload(true), updateCharity)
  .delete(validateObjectIdParam('id'), deleteCharity);

module.exports = router;
