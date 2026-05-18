const express = require('express');
const router = express.Router();
const { getStats } = require('../controllers/stats.controller');
const authMiddleware = require('../middleware/auth.middleware');

router.use(authMiddleware);

router.get('/', getStats);

module.exports = router;
