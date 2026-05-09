const express = require('express');
const cors = require('cors');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

/**
 * Simple Rule-Based Risk Engine
 * @param {string} domain - The extracted domain from the URL
 * @returns {object} - Risk analysis results
 */
function analyzeRisk(domain) {
    const categories = {
        social: ['facebook.com', 'instagram.com', 'twitter.com', 'linkedin.com', 'tiktok.com', 'snapchat.com', 'reddit.com', 'x.com'],
        finance: ['paypal.com', 'chase.com', 'wellsfargo.com', 'bankofamerica.com', 'stripe.com', 'coinbase.com', 'fidelity.com'],
        search: ['google.com', 'bing.com', 'duckduckgo.com', 'yahoo.com', 'baidu.com'],
        entertainment: ['netflix.com', 'youtube.com', 'spotify.com', 'twitch.tv', 'disneyplus.com', 'hulu.com', 'hbo.com']
    };

    let riskScore = 55; // Default middle ground
    let riskLevel = 'Medium';
    let category = 'Unknown';
    let explanation = 'Default privacy profile applied to this domain.';

    // Check categories
    if (categories.social.some(s => domain.includes(s))) {
        category = 'Social Media';
        riskScore = 70 + (domain.length % 21); // Range 70-90
        riskLevel = 'High';
        explanation = 'High risk due to aggressive data harvesting, cross-site tracking, and shadow profiling practices common in social platforms.';
    } else if (categories.finance.some(f => domain.includes(f))) {
        category = 'Finance / Banking';
        riskScore = 60 + (domain.length % 21); // Range 60-80
        riskLevel = 'Medium-High';
        explanation = 'Medium-High risk: Handles sensitive PII and financial data. While security is high, the impact of a data breach is severe.';
    } else if (categories.search.some(s => domain.includes(s))) {
        category = 'Search Engine';
        riskScore = 40 + (domain.length % 21); // Range 40-60
        riskLevel = 'Medium';
        explanation = 'Medium risk: Collects search intent data but often provides tools to manage privacy history.';
    } else if (categories.entertainment.some(e => domain.includes(e))) {
        category = 'Entertainment';
        riskScore = 30 + (domain.length % 21); // Range 30-50
        riskLevel = 'Low-Medium';
        explanation = 'Low-Medium risk: Primarily collects usage patterns and preferences with limited sensitive personal information.';
    } else {
        // Unknown sites: 50-60
        riskScore = 50 + (domain.length % 11);
        riskLevel = 'Medium';
        explanation = 'Standard privacy risk assessment. Data collection practices are not publicly categorized for this specific domain.';
    }

    return { riskScore, riskLevel, explanation };
}

// Routes
app.post('/api/analyze', (req, res) => {
    try {
        const { website } = req.body;

        if (!website) {
            return res.status(400).json({ error: 'Website URL is required' });
        }

        // Extract domain
        let domain;
        try {
            const parsedUrl = new URL(website.startsWith('http') ? website : `https://${website}`);
            domain = parsedUrl.hostname.replace('www.', '');
        } catch (err) {
            // Fallback if URL parsing fails
            domain = website.replace(/https?:\/\//, '').split('/')[0].replace('www.', '');
        }

        // Analyze
        const analysis = analyzeRisk(domain);

        // Return response
        res.json({
            website,
            domain,
            ...analysis
        });

    } catch (error) {
        console.error('Server Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(PORT, () => {
    console.log(`DataShadow Backend running on http://localhost:${PORT}`);
});
