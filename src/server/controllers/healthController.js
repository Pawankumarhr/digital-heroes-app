const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');

const getHealth = asyncHandler(async (req, res) => {
  return sendSuccess(res, 200, 'API is healthy', {
    timestamp: new Date().toISOString(),
  });
});

module.exports = {
  getHealth,
};