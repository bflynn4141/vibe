#!/usr/bin/env node
/**
 * Post to X/Twitter using OAuth 1.0a
 * Usage: node scripts/post-to-x.js "Your tweet text"
 */

import crypto from 'crypto';
import https from 'https';

const config = {
  apiKey: process.env.X_API_KEY || 'rKiSj4YWad63qgjKn1HqWvwjD',
  apiSecret: process.env.X_API_SECRET || 'Tn2JUTqMfd36WSq0ROFFPWwCz2JYzrWfSwAovHP9fTeq3N4X1I',
  accessToken: process.env.X_ACCESS_TOKEN || '2009707476225347584-YP7mJEhEwQU5U3yEZZN4wjqIWbyVH6',
  accessSecret: process.env.X_ACCESS_SECRET || 'oXNaIOcqMF0NmHrBfElumKdX1pBYEDT06ikAnyTRgw3x6'
};

function percentEncode(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function generateOAuthSignature(method, url, params, consumerSecret, tokenSecret) {
  const sortedParams = Object.keys(params).sort().map(k => `${percentEncode(k)}=${percentEncode(params[k])}`).join('&');
  const baseString = `${method}&${percentEncode(url)}&${percentEncode(sortedParams)}`;
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  return crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
}

function generateOAuthHeader(method, url, extraParams = {}) {
  const oauthParams = {
    oauth_consumer_key: config.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: config.accessToken,
    oauth_version: '1.0'
  };

  const allParams = { ...oauthParams, ...extraParams };
  oauthParams.oauth_signature = generateOAuthSignature(method, url, allParams, config.apiSecret, config.accessSecret);

  return 'OAuth ' + Object.keys(oauthParams).sort().map(k => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`).join(', ');
}

async function postTweet(text) {
  const url = 'https://api.twitter.com/2/tweets';
  const body = JSON.stringify({ text });

  const options = {
    method: 'POST',
    hostname: 'api.twitter.com',
    path: '/2/tweets',
    headers: {
      'Authorization': generateOAuthHeader('POST', url, {}),
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Main
const tweet = process.argv[2];
if (!tweet) {
  console.log('Usage: node scripts/post-to-x.js "Your tweet text"');
  process.exit(1);
}

console.log(`Posting to @slashvibedev: "${tweet.substring(0, 50)}..."`);
postTweet(tweet)
  .then(result => {
    console.log('✅ Posted!', result);
    console.log(`https://twitter.com/slashvibedev/status/${result.data.id}`);
  })
  .catch(err => {
    console.error('❌ Failed:', err.message);
    process.exit(1);
  });
