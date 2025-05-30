const express = require('express');
const router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.json({ 
    message: 'Questions Party Backend API',
    version: '1.0.0',
    status: 'running'
  });
});

module.exports = router;
