(function() {
    // Only run if the shield is active
    chrome.storage.local.get('shieldActive', (data) => {
        if (!data.shieldActive) return;

        console.log("[DataShadow] Anti-Fingerprinting Shield Active.");

        // We inject the "noise" script directly into the page's execution environment
        const script = document.createElement('script');
        script.textContent = `
            (function() {
                // 1. Spoof Navigator properties
                const originalNavigator = navigator;
                const spoofedNavigator = Object.create(originalNavigator);
                
                Object.defineProperty(spoofedNavigator, 'plugins', { get: () => [] });
                Object.defineProperty(spoofedNavigator, 'languages', { get: () => ['en-US', 'en'] });
                Object.defineProperty(spoofedNavigator, 'webdriver', { get: () => false });

                window.navigator = spoofedNavigator;

                // 2. Add subtle "Noise" to Canvas Fingerprinting
                const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
                CanvasRenderingContext2D.prototype.getImageData = function(x, y, w, h) {
                    const imageData = originalGetImageData.apply(this, arguments);
                    // Add a tiny bit of random noise to the last pixel to break deterministic hashing
                    const lastIndex = imageData.data.length - 4;
                    imageData.data[lastIndex] = (imageData.data[lastIndex] + 1) % 256;
                    return imageData;
                };

                // 3. Spoof Screen properties to generic values
                Object.defineProperty(Screen.prototype, 'colorDepth', { get: () => 24 });
                Object.defineProperty(Screen.prototype, 'pixelDepth', { get: () => 24 });

                console.log("[DataShadow] Execution Environment Hardened against fingerprinting.");
            })();
        `;
        (document.head || document.documentElement).appendChild(script);
        script.remove();
    });
})();
