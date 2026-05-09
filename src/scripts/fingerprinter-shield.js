(function() {
    // Only run if the shield is active
    chrome.storage.local.get('shieldActive', (data) => {
        if (!data.shieldActive) return;

        console.log("[DataShadow] Anti-Fingerprinting Shield Active.");

        // We inject the "noise" script directly into the page's execution environment
        const script = document.createElement('script');
        script.textContent = `
            (function() {
                const reportDetection = (type, details) => {
                    window.dispatchEvent(new CustomEvent('ds-telemetry-event', {
                        detail: { type: 'FINGERPRINT_ATTEMPT', detectionType: type, details: details }
                    }));
                };

                // 1. Spoof Navigator properties
                const originalNavigator = navigator;
                const spoofedNavigator = Object.create(originalNavigator);
                
                Object.defineProperty(spoofedNavigator, 'plugins', { 
                    get: () => { 
                        reportDetection('navigator.plugins', 'Access to browser plugins');
                        return []; 
                    } 
                });
                Object.defineProperty(spoofedNavigator, 'languages', { get: () => ['en-US', 'en'] });
                Object.defineProperty(spoofedNavigator, 'webdriver', { get: () => false });

                window.navigator = spoofedNavigator;

                // 2. Detect Canvas Fingerprinting
                const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
                HTMLCanvasElement.prototype.toDataURL = function() {
                    reportDetection('canvas.fingerprint', 'Attempted to extract canvas image data');
                    return originalToDataURL.apply(this, arguments);
                };

                const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
                CanvasRenderingContext2D.prototype.getImageData = function(x, y, w, h) {
                    reportDetection('canvas.getImageData', 'Attempted to read canvas pixels');
                    const imageData = originalGetImageData.apply(this, arguments);
                    const lastIndex = imageData.data.length - 4;
                    imageData.data[lastIndex] = (imageData.data[lastIndex] + 1) % 256;
                    return imageData;
                };

                // 3. Hardware Fingerprinting Detection
                if (navigator.deviceMemory) {
                    const originalMemory = navigator.deviceMemory;
                    Object.defineProperty(navigator, 'deviceMemory', {
                        get: () => {
                            reportDetection('navigator.deviceMemory', 'Attempted to read RAM size');
                            return originalMemory;
                        }
                    });
                }

                console.log("[DataShadow] Execution Environment Hardened & Monitoring Active.");
            })();
        `;
        (document.head || document.documentElement).appendChild(script);
        script.remove();

        // Listen for detections from the injected script and forward to background
        window.addEventListener('ds-telemetry-event', (e) => {
            chrome.runtime.sendMessage(e.detail);
        });
    });
})();
