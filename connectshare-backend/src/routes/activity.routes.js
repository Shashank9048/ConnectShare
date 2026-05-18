const express = require('express');
const router = express.Router();
const { listActivity } = require('../controllers/activity.controller');
const authMiddleware = require('../middleware/auth.middleware');

router.use(authMiddleware);

router.get('/', listActivity);

module.exports = router;
