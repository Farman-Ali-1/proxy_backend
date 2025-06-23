const express = require('express');
const proxyController = require('../controllers/proxyController.js');
const { protect } = require('../middleware/auth.js');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// 🌍 Public Routes (No Authentication Required)
// ─────────────────────────────────────────────────────────────────────────────

// GET Available regions, session types, and proxy types
router.get('/locations', proxyController.getLocations); // Enhanced with proxy types

// 🆕 GET All Available Proxies (Comprehensive API)
// Supports: residential, datacenter, static_isp, mobile, or 'all'
router.get('/available', proxyController.getAvailableProxies);

// GET Pricing for different proxy types
router.get('/pricing', proxyController.getPricing); // Enhanced with proxy type support

// POST Generate proxies (Direct API test) - Enhanced with proxy types
router.post('/generate', proxyController.generateProxies);

// ─────────────────────────────────────────────────────────────────────────────
// 🔒 Protected Routes (Authentication Required)
// ─────────────────────────────────────────────────────────────────────────────

// Apply authentication middleware to all routes below
router.use(protect);

// POST Purchase proxies - Enhanced with proxy type selection
router.post('/purchase', proxyController.purchaseProxies);

// POST Extend specific proxy - Enhanced with type-based pricing
router.post('/extend/:proxyId', proxyController.extendProxy);

// GET User's proxies - Enhanced with proxy type filtering
router.get('/my-proxies', proxyController.getMyProxies);

// ─────────────────────────────────────────────────────────────────────────────
// 📊 Additional Proxy Management Routes (Optional)
// ─────────────────────────────────────────────────────────────────────────────

// GET Proxy statistics and analytics
router.get('/stats', async (req, res) => {
  try {
    const Proxy = require('../models/Proxy');
    
    const stats = await Proxy.aggregate([
      { $match: { user: req.user._id } },
      {
        $group: {
          _id: null,
          totalProxies: { $sum: 1 },
          activeProxies: { 
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } 
          },
          expiredProxies: { 
            $sum: { $cond: [{ $lt: ['$expiresAt', new Date()] }, 1, 0] } 
          },
          byType: {
            $push: {
              type: '$proxyType',
              status: '$status',
              country: '$country'
            }
          }
        }
      }
    ]);

    const typeStats = await Proxy.aggregate([
      { $match: { user: req.user._id } },
      {
        $group: {
          _id: '$proxyType',
          count: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
          countries: { $addToSet: '$country' }
        }
      }
    ]);

    const countryStats = await Proxy.aggregate([
      { $match: { user: req.user._id } },
      {
        $group: {
          _id: '$country',
          count: { $sum: 1 },
          types: { $addToSet: '$proxyType' }
        }
      }
    ]);

    res.json({
      success: true,
      stats: stats[0] || {
        totalProxies: 0,
        activeProxies: 0,
        expiredProxies: 0
      },
      byType: typeStats.reduce((acc, item) => {
        acc[item._id || 'unknown'] = {
          count: item.count,
          active: item.active,
          countries: item.countries
        };
        return acc;
      }, {}),
      byCountry: countryStats.reduce((acc, item) => {
        acc[item._id] = {
          count: item.count,
          types: item.types
        };
        return acc;
      }, {})
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch proxy statistics',
      error: error.message
    });
  }
});

// GET Proxy health check (test proxy connectivity)
router.post('/test/:proxyId', async (req, res) => {
  try {
    const Proxy = require('../models/Proxy');
    const axios = require('axios');
    
    const proxy = await Proxy.findOne({ 
      _id: req.params.proxyId, 
      user: req.user._id 
    });
    
    if (!proxy) {
      return res.status(404).json({
        success: false,
        message: 'Proxy not found'
      });
    }

    const proxyConfig = {
      host: proxy.ip,
      port: proxy.port,
      auth: {
        username: proxy.username,
        password: proxy.password
      }
    };

    const testUrl = 'https://httpbin.org/ip';
    const startTime = Date.now();

    try {
      const response = await axios.get(testUrl, {
        proxy: proxyConfig,
        timeout: 10000
      });
      
      const responseTime = Date.now() - startTime;
      
      res.json({
        success: true,
        proxyId: proxy._id,
        status: 'working',
        responseTime: `${responseTime}ms`,
        externalIP: response.data.origin,
        proxyType: proxy.proxyType,
        country: proxy.country,
        testedAt: new Date().toISOString()
      });
    } catch (testError) {
      res.json({
        success: false,
        proxyId: proxy._id,
        status: 'failed',
        error: testError.message,
        proxyType: proxy.proxyType,
        country: proxy.country,
        testedAt: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to test proxy',
      error: error.message
    });
  }
});

// POST Bulk operations on proxies
router.post('/bulk-action', async (req, res) => {
  try {
    const { action, proxyIds } = req.body;
    const Proxy = require('../models/Proxy');

    if (!action || !proxyIds || !Array.isArray(proxyIds)) {
      return res.status(400).json({
        success: false,
        message: 'Action and proxyIds array are required'
      });
    }

    let result;
    
    switch (action) {
      case 'delete':
        result = await Proxy.deleteMany({
          _id: { $in: proxyIds },
          user: req.user._id
        });
        break;
        
      case 'deactivate':
        result = await Proxy.updateMany(
          { _id: { $in: proxyIds }, user: req.user._id },
          { status: 'inactive' }
        );
        break;
        
      case 'activate':
        result = await Proxy.updateMany(
          { _id: { $in: proxyIds }, user: req.user._id },
          { status: 'active' }
        );
        break;
        
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid action. Supported: delete, deactivate, activate'
        });
    }

    res.json({
      success: true,
      message: `Bulk ${action} completed`,
      affected: result.modifiedCount || result.deletedCount,
      action
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Bulk operation failed',
      error: error.message
    });
  }
});

module.exports = router;