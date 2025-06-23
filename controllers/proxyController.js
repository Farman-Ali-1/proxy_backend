const axios = require('axios');
const Order = require('../models/Order');
const Proxy = require('../models/Proxy');
const CartItem = require('../models/CartItem');
const { updateBalance } = require('./userController');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

// ─────────────────────────────────────────────────────────────────────────────
// 📦 Configuration & Constants
// ─────────────────────────────────────────────────────────────────────────────
const PROXY_CONFIG = {
  BASE_URL: 'http://global.rotgbapi.711proxy.com:8089',
  DEFAULT_TTL_DAYS: 30,
  PRICING: {
    BASE_PRICE_PER_PROXY: 2.5,
    ROTATING_MULTIPLIER: 1.2,
    BULK_DISCOUNTS: {
      100: 0.8,  // 20% discount for 100+
      50: 0.9,   // 10% discount for 50+
    },
    // Pricing for different proxy types
    TYPE_MULTIPLIERS: {
      residential: 1.0,    // Base price
      datacenter: 0.6,     // 40% cheaper
      static_isp: 1.5,     // 50% more expensive
      mobile: 2.0          // Most expensive
    }
  },
  SUPPORTED_REGIONS: ['US', 'UK', 'CA', 'AU', 'DE', 'FR', 'JP', 'SG', 'NL', 'IT', 'ES', 'BR', 'IN'],
  SESSION_TYPES: {
    STICKY: 'sticky',
    ROTATING: 'rotating'
  },
  PROXY_TYPES: {
    RESIDENTIAL: 'residential',
    DATACENTER: 'datacenter', 
    STATIC_ISP: 'static_isp',
    MOBILE: 'mobile'
  },
  // Type configurations for 711proxy API
  TYPE_CONFIGS: {
    residential: { ptype: 1, zone: 'custom' },      // Residential rotating
    datacenter: { ptype: 2, zone: 'datacenter' },   // Datacenter
    static_isp: { ptype: 3, zone: 'isp' },         // ISP Static
    mobile: { ptype: 4, zone: 'mobile' }            // Mobile proxies
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 🔧 Enhanced 711Proxy API Service
// ─────────────────────────────────────────────────────────────────────────────
class ProxyApiService {
  static async generateProxies({ 
    region = 'US', 
    count = 1, 
    sessionType = 'rotating',
    protocol = 'http',
    proxyType = 'residential'  // New parameter
  }) {
    try {
      const typeConfig = PROXY_CONFIG.TYPE_CONFIGS[proxyType] || PROXY_CONFIG.TYPE_CONFIGS.residential;
      
      const params = {
        zone: typeConfig.zone,
        ptype: typeConfig.ptype,
        region: region.toUpperCase(),
        count: Math.min(count, 100), // API limit
        proto: protocol.toLowerCase(),
        stype: 'text',
        split: encodeURIComponent('\r\n'),
        sessType: sessionType.toLowerCase()
      };

      const queryString = new URLSearchParams(params).toString();
      const url = `${PROXY_CONFIG.BASE_URL}/gen?${queryString}`;

      console.log(`🔗 Calling 711Proxy API for ${proxyType}: ${url}`);

      const response = await axios.get(url, {
        timeout: 30000,
        headers: {
          'User-Agent': 'ProxyApp/1.0',
        }
      });

      return this.parseProxyResponse(response.data, { region, sessionType, proxyType });
    } catch (error) {
      console.error('❌ 711Proxy API Error:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
        proxyType
      });
      
      throw new AppError(
        `${proxyType} proxy generation failed: ${error.response?.data || error.message}`, 
        error.response?.status || 500
      );
    }
  }

  static parseProxyResponse(responseData, metadata = {}) {
    if (!responseData || typeof responseData !== 'string') {
      throw new AppError('Invalid proxy response format', 500);
    }

    const proxyLines = responseData
      .split(/\r?\n/)
      .filter(line => line.trim())
      .filter(line => line.includes(':'));

    if (proxyLines.length === 0) {
      throw new AppError('No valid proxies received from API', 500);
    }

    return proxyLines.map((line, index) => {
      const [ip, port, username, password] = line.split(':');
      
      if (!ip || !port) {
        console.warn(`⚠️ Invalid proxy format: ${line}`);
        return null;
      }

      return {
        ip: ip.trim(),
        port: parseInt(port.trim()),
        username: username?.trim() || `user_${Date.now()}_${index}`,
        password: password?.trim() || `pass_${Date.now()}_${index}`,
        country: metadata.region || 'US',
        sessionType: metadata.sessionType || 'rotating',
        proxyType: metadata.proxyType || 'residential',
        trafficLeft: 1000000000, // 1GB default
        status: 'active'
      };
    }).filter(Boolean);
  }

  static async validateRegion(region) {
    const normalizedRegion = region.toUpperCase();
    if (!PROXY_CONFIG.SUPPORTED_REGIONS.includes(normalizedRegion)) {
      throw new AppError(
        `Unsupported region: ${region}. Supported: ${PROXY_CONFIG.SUPPORTED_REGIONS.join(', ')}`,
        400
      );
    }
    return normalizedRegion;
  }

  static validateProxyType(proxyType) {
    const normalizedType = proxyType.toLowerCase();
    if (!Object.values(PROXY_CONFIG.PROXY_TYPES).includes(normalizedType)) {
      throw new AppError(
        `Unsupported proxy type: ${proxyType}. Supported: ${Object.values(PROXY_CONFIG.PROXY_TYPES).join(', ')}`,
        400
      );
    }
    return normalizedType;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 💰 Enhanced Pricing Service
// ─────────────────────────────────────────────────────────────────────────────
class PricingService {
  static calculatePrice({ quantity, sessionType = 'sticky', region = 'US', proxyType = 'residential' }) {
    let basePrice = PROXY_CONFIG.PRICING.BASE_PRICE_PER_PROXY;
    
    // Proxy type multiplier
    const typeMultiplier = PROXY_CONFIG.PRICING.TYPE_MULTIPLIERS[proxyType] || 1.0;
    basePrice *= typeMultiplier;
    
    // Session type multiplier
    if (sessionType.toLowerCase() === 'rotating') {
      basePrice *= PROXY_CONFIG.PRICING.ROTATING_MULTIPLIER;
    }

    // Bulk discounts
    const qty = parseInt(quantity);
    if (qty >= 100) {
      basePrice *= PROXY_CONFIG.PRICING.BULK_DISCOUNTS[100];
    } else if (qty >= 50) {
      basePrice *= PROXY_CONFIG.PRICING.BULK_DISCOUNTS[50];
    }

    const totalPrice = basePrice * qty;

    return {
      pricePerProxy: parseFloat(basePrice.toFixed(2)),
      totalPrice: parseFloat(totalPrice.toFixed(2)),
      quantity: qty,
      sessionType,
      region,
      proxyType,
      discountApplied: qty >= 50,
      typeMultiplier
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔧 Helper Functions
// ─────────────────────────────────────────────────────────────────────────────
function formatProxyString(proxy, format = 'full', protocol = 'http') {
  const { ip, port, username, password } = proxy;
  
  switch (format) {
    case 'ip:port':
      return `${ip}:${port}`;
    case 'full':
      return `${protocol}://${username}:${password}@${ip}:${port}`;
    default:
      return `${protocol}://${username}:${password}@${ip}:${port}`;
  }
}

function formatProxyForResponse(proxy) {
  return {
    id: proxy._id,
    ip: proxy.ip,
    port: proxy.port,
    username: proxy.username,
    password: proxy.password,
    country: proxy.country,
    sessionType: proxy.sessionType,
    proxyType: proxy.proxyType,
    status: proxy.status,
    expiresAt: proxy.expiresAt,
    trafficLeft: proxy.trafficLeft,
    formatted: formatProxyString(proxy, 'full', 'http'),
    typeDescription: getProxyTypeDescription(proxy.proxyType)
  };
}

function getRegionName(code) {
  const regionNames = {
    'US': 'United States',
    'UK': 'United Kingdom', 
    'CA': 'Canada',
    'AU': 'Australia',
    'DE': 'Germany',
    'FR': 'France',
    'JP': 'Japan',
    'SG': 'Singapore',
    'NL': 'Netherlands',
    'IT': 'Italy',
    'ES': 'Spain',
    'BR': 'Brazil',
    'IN': 'India'
  };
  return regionNames[code] || code;
}

function getProxyTypeDescription(type) {
  const descriptions = {
    residential: 'Real residential IP addresses with high anonymity',
    datacenter: 'Fast datacenter proxies with good speed',
    static_isp: 'Static ISP proxies with consistent IP addresses',
    mobile: 'Mobile carrier proxies with highest anonymity'
  };
  return descriptions[type] || 'Unknown proxy type';
}

// ─────────────────────────────────────────────────────────────────────────────
// 🌍 GET Available Regions & Types
// ─────────────────────────────────────────────────────────────────────────────
const getLocations = catchAsync(async (req, res, next) => {
  res.json({
    success: true,
    regions: PROXY_CONFIG.SUPPORTED_REGIONS.map(code => ({
      code,
      name: getRegionName(code)
    })),
    sessionTypes: Object.values(PROXY_CONFIG.SESSION_TYPES),
    proxyTypes: Object.keys(PROXY_CONFIG.PROXY_TYPES).map(key => ({
      type: PROXY_CONFIG.PROXY_TYPES[key],
      name: key.charAt(0).toUpperCase() + key.slice(1).replace('_', ' '),
      description: getProxyTypeDescription(PROXY_CONFIG.PROXY_TYPES[key]),
      priceMultiplier: PROXY_CONFIG.PRICING.TYPE_MULTIPLIERS[PROXY_CONFIG.PROXY_TYPES[key]]
    }))
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🆕 GET All Available Proxies (New Comprehensive API)
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_REGIONS = ['US', 'UK', 'DE', 'FR', 'CA', 'AU', 'IN', 'SG', 'NL', 'JP', 'BR', 'RU', 'MX', 'ZA', 'IT'];

const getAvailableProxies = catchAsync(async (req, res, next) => {
  const { 
    region = 'all', 
    proxyType = 'all',  // residential, datacenter, static_isp, mobile, or 'all'
    sessionType = 'rotating',
    limit = 10, // minimum per region/type
    protocol = 'http'
  } = req.query;

  try {
    // Determine regions to process
    const regionsToUse = region === 'all'
      ? DEFAULT_REGIONS
      : [await ProxyApiService.validateRegion(region)];

    let proxyTypes = [];

    if (proxyType === 'all') {
      proxyTypes = Object.values(PROXY_CONFIG.PROXY_TYPES);
    } else {
      const validatedType = ProxyApiService.validateProxyType(proxyType);
      proxyTypes = [validatedType];
    }

    const results = [];

    // Loop through each region and proxy type
    for (const regionCode of regionsToUse) {
      for (const type of proxyTypes) {
        try {
          const proxies = await ProxyApiService.generateProxies({
            region: regionCode,
            count: parseInt(limit),
            sessionType,
            protocol,
            proxyType: type
          });

          if (proxies && proxies.length > 0) {
            results.push({
              proxyType: type,
              typeDescription: getProxyTypeDescription(type),
              region: regionCode,
              regionName: getRegionName(regionCode),
              count: proxies.length,
              pricing: PricingService.calculatePrice({
                quantity: proxies.length,
                sessionType,
                region: regionCode,
                proxyType: type
              }),
              proxies: proxies.map(proxy => ({
                ...proxy,
                formatted: formatProxyString(proxy, 'full', protocol),
                estimatedSpeed: getEstimatedSpeed(type),
                reliability: getReliabilityScore(type)
              }))
            });
          }
        } catch (typeError) {
          console.warn(`⚠️ Could not fetch ${type} proxies for region ${regionCode}:`, typeError.message);
        }
      }
    }

    if (results.length === 0) {
      return next(new AppError('No proxies available for the specified criteria', 404));
    }

    // Summary stats
    const totalProxies = results.reduce((sum, result) => sum + result.count, 0);
    const avgPrice = results.reduce((sum, result) => sum + result.pricing.pricePerProxy, 0) / results.length;

    res.json({
      success: true,
      message: `Found ${totalProxies} available proxies`,
      summary: {
        region: region === 'all' ? 'Multiple' : regionsToUse[0],
        regionName: region === 'all' ? 'Multiple Regions' : getRegionName(regionsToUse[0]),
        sessionType,
        totalProxies,
        typesAvailable: results.length,
        averagePrice: parseFloat(avgPrice.toFixed(2)),
        currency: 'USD'
      },
      results,
      requestInfo: {
        requestedType: proxyType,
        requestedLimit: parseInt(limit),
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Get available proxies failed:', error);
    return next(error);
  }
});

// Helper functions for proxy quality estimation
function getEstimatedSpeed(proxyType) {
  const speedMap = {
    datacenter: 'Very Fast (1-5ms)',
    static_isp: 'Fast (5-20ms)', 
    residential: 'Medium (20-100ms)',
    mobile: 'Variable (50-200ms)'
  };
  return speedMap[proxyType] || 'Unknown';
}

function getReliabilityScore(proxyType) {
  const scoreMap = {
    static_isp: 95,
    datacenter: 90,
    residential: 85,
    mobile: 75
  };
  return scoreMap[proxyType] || 80;
}

// ─────────────────────────────────────────────────────────────────────────────
// 💵 Enhanced GET Proxy Pricing
// ─────────────────────────────────────────────────────────────────────────────
const getPricing = catchAsync(async (req, res, next) => {
  const { 
    region = 'US', 
    quantity = 1, 
    sessionType = 'sticky',
    proxyType = 'residential'
  } = req.query;

  // Validate inputs
  await ProxyApiService.validateRegion(region);
  ProxyApiService.validateProxyType(proxyType);
  
  const qty = parseInt(quantity);
  if (isNaN(qty) || qty < 1 || qty > 1000) {
    return next(new AppError('Quantity must be between 1 and 1000', 400));
  }

  if (!Object.values(PROXY_CONFIG.SESSION_TYPES).includes(sessionType)) {
    return next(new AppError('Invalid session type', 400));
  }

  const pricing = PricingService.calculatePrice({ 
    quantity: qty, 
    sessionType, 
    region,
    proxyType 
  });

  res.json({
    success: true,
    pricing,
    typeInfo: {
      type: proxyType,
      description: getProxyTypeDescription(proxyType),
      estimatedSpeed: getEstimatedSpeed(proxyType),
      reliability: getReliabilityScore(proxyType)
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🛒 Enhanced POST Purchase Proxies
// ─────────────────────────────────────────────────────────────────────────────
const purchaseProxies = catchAsync(async (req, res, next) => {
  const { 
    region, 
    quantity, 
    sessionType = 'sticky', 
    protocol = 'http',
    proxyType = 'residential'  // New parameter
  } = req.body;

  // Validation
  if (!region || !quantity) {
    return next(new AppError('Region and quantity are required', 400));
  }

  const validatedRegion = await ProxyApiService.validateRegion(region);
  const validatedType = ProxyApiService.validateProxyType(proxyType);
  const qty = parseInt(quantity);

  if (isNaN(qty) || qty < 1 || qty > 100) {
    return next(new AppError('Quantity must be between 1 and 100', 400));
  }

  // Calculate pricing with proxy type
  const pricing = PricingService.calculatePrice({ 
    quantity: qty, 
    sessionType, 
    region: validatedRegion,
    proxyType: validatedType
  });

  // Check user balance
  if (req.user.balance < pricing.totalPrice) {
    return next(new AppError('Insufficient balance', 400, {
      required: pricing.totalPrice,
      current: req.user.balance,
      shortfall: pricing.totalPrice - req.user.balance
    }));
  }

  // Create order
  const order = await Order.create({
    user: req.user._id,
    totalAmount: pricing.totalPrice,
    status: 'processing',
    orderDetails: {
      region: validatedRegion,
      quantity: qty,
      sessionType,
      protocol,
      proxyType: validatedType,
      pricing
    }
  });

  try {
    // Generate proxies via API with type
    const generatedProxies = await ProxyApiService.generateProxies({
      region: validatedRegion,
      count: qty,
      sessionType,
      protocol,
      proxyType: validatedType
    });

    if (!generatedProxies || generatedProxies.length === 0) {
      throw new Error('No proxies generated');
    }

    // Save proxies to database
    const savedProxies = [];
    for (const proxyData of generatedProxies) {
      const proxy = await Proxy.create({
        ...proxyData,
        order: order._id,
        user: req.user._id,
        expiresAt: new Date(Date.now() + PROXY_CONFIG.DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000)
      });
      savedProxies.push(proxy);
    }

    // Update user balance
    await updateBalance(
      req.user._id,
      -pricing.totalPrice,
      'purchase',
      `${validatedType} proxy purchase - Order ${order.orderNumber}`,
      { orderId: order._id, proxyType: validatedType }
    );

    // Update order
    order.status = 'completed';
    order.paymentStatus = 'paid';
    order.proxyData = savedProxies.map(formatProxyForResponse);
    await order.save();

    res.json({
      success: true,
      message: `${validatedType} proxies purchased successfully`,
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        totalAmount: pricing.totalPrice,
        proxyCount: savedProxies.length,
        proxyType: validatedType
      },
      proxies: savedProxies.map(formatProxyForResponse)
    });

  } catch (error) {
    // Handle failure
    order.status = 'failed';
    order.failureReason = error.message;
    await order.save();

    console.error('❌ Proxy purchase failed:', error);
    return next(new AppError(`${validatedType} proxy purchase failed: ${error.message}`, 500));
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔄 Enhanced POST Generate Proxies (Direct API Test)
// ─────────────────────────────────────────────────────────────────────────────
const generateProxies = catchAsync(async (req, res, next) => {
  const { 
    region = 'US', 
    count = 1, 
    sessionType = 'rotating', 
    protocol = 'http',
    proxyType = 'residential'
  } = req.body;

  try {
    const validatedRegion = await ProxyApiService.validateRegion(region);
    const validatedType = ProxyApiService.validateProxyType(proxyType);
    const qty = Math.min(parseInt(count) || 1, 10); // Limit test generations

    const proxies = await ProxyApiService.generateProxies({
      region: validatedRegion,
      count: qty,
      sessionType,
      protocol,
      proxyType: validatedType
    });

    res.json({
      success: true,
      message: `Generated ${proxies.length} ${validatedType} proxies`,
      proxyType: validatedType,
      typeDescription: getProxyTypeDescription(validatedType),
      proxies: proxies.map(proxy => ({
        ...proxy,
        formatted: formatProxyString(proxy, 'full', protocol),
        estimatedSpeed: getEstimatedSpeed(validatedType),
        reliability: getReliabilityScore(validatedType)
      }))
    });

  } catch (error) {
    console.error('❌ Proxy generation failed:', error);
    return next(error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 📋 Enhanced GET My Proxies
// ─────────────────────────────────────────────────────────────────────────────
const getMyProxies = catchAsync(async (req, res, next) => {
  const { 
    page = 1, 
    limit = 20, 
    status = 'active', 
    region,
    proxyType  // New filter
  } = req.query;
  const skip = (page - 1) * limit;

  const filter = { user: req.user._id };
  if (status !== 'all') filter.status = status;
  if (region) filter.country = region.toUpperCase();
  if (proxyType && proxyType !== 'all') filter.proxyType = proxyType;

  const proxies = await Proxy.find(filter)
    .populate('order', 'orderNumber createdAt')
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .skip(skip);

  const total = await Proxy.countDocuments(filter);

  // Group by type for summary
  const typesSummary = await Proxy.aggregate([
    { $match: { user: req.user._id } },
    { $group: { 
      _id: '$proxyType', 
      count: { $sum: 1 },
      active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } }
    }}
  ]);

  res.json({
    success: true,
    proxies: proxies.map(formatProxyForResponse),
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    },
    summary: {
      totalProxies: total,
      byType: typesSummary.reduce((acc, item) => {
        acc[item._id || 'unknown'] = {
          total: item.count,
          active: item.active
        };
        return acc;
      }, {})
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⏰ Enhanced POST Extend Proxy
// ─────────────────────────────────────────────────────────────────────────────
const extendProxy = catchAsync(async (req, res, next) => {
  const { proxyId } = req.params;
  const { days = 30 } = req.body;

  if (days < 1 || days > 365) {
    return next(new AppError('Days must be between 1 and 365', 400));
  }

  const proxy = await Proxy.findOne({ _id: proxyId, user: req.user._id });
  if (!proxy) {
    return next(new AppError('Proxy not found', 404));
  }

  // Calculate extension cost based on proxy type
  const typeMultiplier = PROXY_CONFIG.PRICING.TYPE_MULTIPLIERS[proxy.proxyType] || 1.0;
  const extensionCost = days * 1.0 * typeMultiplier;
  
  if (req.user.balance < extensionCost) {
    return next(new AppError('Insufficient balance for extension', 400, {
      required: extensionCost,
      current: req.user.balance
    }));
  }

  // Note: 711proxy may not support individual proxy extension
  // This is a local database extension only
  proxy.expiresAt = new Date(new Date(proxy.expiresAt).getTime() + days * 86400000);
  await proxy.save();

  await updateBalance(
    req.user._id,
    -extensionCost,
    'purchase',
    `${proxy.proxyType} proxy extension - ${days} days for ${proxy.ip}:${proxy.port}`,
    { proxyId: proxy._id }
  );

  res.json({
    success: true,
    message: `${proxy.proxyType} proxy extended for ${days} days (local extension only)`,
    proxy: formatProxyForResponse(proxy),
    cost: extensionCost,
    warning: 'This is a local extension. The actual proxy may expire based on provider settings.'
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 📤 Export All Functions
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  getLocations,         // Enhanced with proxy types
  getAvailableProxies,  // 🆕 NEW: Main comprehensive API
  getPricing,           // Enhanced with proxy types
  purchaseProxies,      // Enhanced with proxy types
  generateProxies,      // Enhanced with proxy types
  getMyProxies,         // Enhanced with proxy type filtering
  extendProxy           // Enhanced with type-based pricing
};