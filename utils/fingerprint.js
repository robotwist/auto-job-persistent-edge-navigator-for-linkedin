const logger = require('./logger');

// Browser fingerprint configurations
const FINGERPRINTS = {
  chrome: {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    languages: ['en-US', 'en'],
    colorScheme: 'light',
    timezone: 'America/New_York',
    platform: 'Win32',
    webgl: {
      vendor: 'Google Inc. (NVIDIA)',
      renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Ti Direct3D11 vs_5_0 ps_5_0)'
    }
  }
};

// Apply fingerprint to browser context
async function applyFingerprint(context, browser = 'chrome') {
  try {
    const fingerprint = FINGERPRINTS[browser];
    if (!fingerprint) {
      throw new Error(`No fingerprint defined for browser: ${browser}`);
    }

    // Set user agent
    await context.setExtraHTTPHeaders({
      'User-Agent': fingerprint.userAgent,
      'Accept-Language': fingerprint.languages.join(',')
    });

    // Set viewport
    await context.setViewportSize(fingerprint.viewport);

    // Add scripts to modify browser properties
    await context.addInitScript(() => {
      // Override navigator properties
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => 8
      });

      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 8
      });

      Object.defineProperty(navigator, 'connection', {
        get: () => ({
          effectiveType: '4g',
          rtt: 50,
          downlink: 10,
          saveData: false
        })
      });

      // Override screen properties
      Object.defineProperty(window.screen, 'colorDepth', {
        get: () => 24
      });

      Object.defineProperty(window.screen, 'pixelDepth', {
        get: () => 24
      });

      // Override WebGL properties
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, attributes) {
        const context = getContext.call(this, type, attributes);
        if (context && type === 'webgl') {
          const getParameter = context.getParameter.bind(context);
          context.getParameter = function(parameter) {
            // Spoof WebGL parameters
            const gl = this;
            switch (parameter) {
              case gl.VENDOR:
                return fingerprint.webgl.vendor;
              case gl.RENDERER:
                return fingerprint.webgl.renderer;
              default:
                return getParameter(parameter);
            }
          };
        }
        return context;
      };
    });

    logger.info('Applied browser fingerprint successfully');
  } catch (error) {
    logger.error(`Failed to apply browser fingerprint: ${error.message}`);
    throw error;
  }
}

module.exports = {
  applyFingerprint
}; 