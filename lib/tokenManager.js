'use strict';

const https = require('node:https');
const crypto = require('node:crypto');
const { URLSearchParams, URL } = require('node:url');

const BRANDS = {
    hyundai: {
        idpHost: 'idpconnect-eu.hyundai.com',
        clientId: '6d477c38-3ca4-4cf3-9557-2a1929a94654',
        clientSecret: 'KUy49XxPzLpLuoK0xhBC77W6VXhmtQR9iQhmIFjjoY4IpxsV',
        redirectUri: 'https://prd.eu-ccapi.hyundai.com:8080/api/v1/user/oauth2/token',
    },
    kia: {
        idpHost: 'idpconnect-eu.kia.com',
        clientId: 'fdc85c00-0a2f-4c64-bcb4-2cfb1500730a',
        clientSecret: 'secret',
        redirectUri: 'https://prd.eu-ccapi.kia.com:8080/api/v1/user/oauth2/redirect',
    },
};

const USER_AGENT = 'Mozilla/5.0 (Linux; Android 4.1.1; Galaxy Nexus Build/JRO03C) AppleWebKit/535.19 (KHTML, like Gecko) Chrome/18.0.1025.166 Mobile Safari/535.19_CCS_APP_AOS';

// Approximate Chrome 131 Android TLS fingerprint
const CHROME_CIPHERS = [
    'TLS_AES_128_GCM_SHA256',
    'TLS_AES_256_GCM_SHA384',
    'TLS_CHACHA20_POLY1305_SHA256',
    'ECDHE-ECDSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-ECDSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES256-GCM-SHA384',
    'ECDHE-ECDSA-CHACHA20-POLY1305',
    'ECDHE-RSA-CHACHA20-POLY1305',
    'ECDHE-RSA-AES128-SHA',
    'ECDHE-RSA-AES256-SHA',
    'AES128-GCM-SHA256',
    'AES256-GCM-SHA384',
    'AES128-SHA',
    'AES256-SHA',
].join(':');

/** Simple cookie jar: parses Set-Cookie headers, returns Cookie header string */
class CookieJar {
    constructor() {
        this._cookies = {};
    }

    ingest(headers) {
        const setCookie = headers['set-cookie'];
        if (!setCookie) {
return;
}
        const list = Array.isArray(setCookie) ? setCookie : [setCookie];
        for (const entry of list) {
            const [pair] = entry.split(';');
            const eq = pair.indexOf('=');
            if (eq === -1) {
continue;
}
            const name = pair.slice(0, eq).trim();
            const value = pair.slice(eq + 1).trim();
            this._cookies[name] = value;
        }
    }

    header() {
        return Object.entries(this._cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    }
}

/**
 * Low-level HTTPS request returning { statusCode, headers, body }
 *
 * @param opts
 * @param body
 */
function request(opts, body) {
    return new Promise((resolve, reject) => {
        const agent = new https.Agent({
            ciphers: CHROME_CIPHERS,
            honorCipherOrder: false,
            minVersion: 'TLSv1.2',
        });
        const req = https.request({ ...opts, agent }, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve({
                statusCode: res.statusCode,
                headers: res.headers,
                body: Buffer.concat(chunks).toString('utf-8'),
            }));
        });
        req.on('error', reject);
        req.setTimeout(15000, () => req.destroy(new Error('Request timed out')));
        if (body) {
req.write(body);
}
        req.end();
    });
}

/**
 * Encrypt password with RSA PKCS1v1.5 using JWK public key
 *
 * @param jwk
 * @param password
 */
function encryptPassword(jwk, password) {
    const key = crypto.createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' });
    return crypto.publicEncrypt(
        { key, padding: crypto.constants.RSA_PKCS1_PADDING },
        Buffer.from(password, 'utf-8'),
    ).toString('hex');
}

/**
 * Fetch a new refresh token using the full OAuth flow.
 *
 * @param {string} brand     'hyundai' | 'kia'
 * @param {string} username
 * @param {string} password  actual account password (not the token)
 * @param {Function} [log]   optional logger function (msg) => void
 * @returns {{ refreshToken: string, accessToken: string, expiresAt: string }}
 */
async function fetchToken(brand, username, password, log) {
    const info = log || (() => {});
    const cfg = BRANDS[brand];
    if (!cfg) {
throw new Error(`Unknown brand: ${brand}`);
}

    const host = cfg.idpHost;
    const jar = new CookieJar();

    const baseHeaders = (extra = {}) => ({
        'User-Agent': USER_AGENT,
        Cookie: jar.header(),
        ...extra,
    });

    // Step 1: GET authorize page – establish session cookies
    info(`[tokenManager] Step 1: GET https://${host}/auth/api/v2/user/oauth2/authorize`);
    const authorizeUrl = `/auth/api/v2/user/oauth2/authorize?response_type=code&client_id=${cfg.clientId}&redirect_uri=${encodeURIComponent(cfg.redirectUri)}&lang=de&state=ccsp&country=de`;
    const step1 = await request({ hostname: host, path: authorizeUrl, method: 'GET', headers: baseHeaders() });
    jar.ingest(step1.headers);
    info(`[tokenManager] Step 1: HTTP ${step1.statusCode}, cookies: ${Object.keys(jar._cookies).join(', ') || 'none'}`);

    // Step 2: GET RSA public key
    info(`[tokenManager] Step 2: GET https://${host}/auth/api/v1/accounts/certs`);
    const step2 = await request({ hostname: host, path: '/auth/api/v1/accounts/certs', method: 'GET', headers: baseHeaders() });
    jar.ingest(step2.headers);
    info(`[tokenManager] Step 2: HTTP ${step2.statusCode}`);
    if (step2.statusCode !== 200) {
throw new Error(`Certs endpoint returned ${step2.statusCode}: ${step2.body.slice(0, 200)}`);
}
    const jwk = JSON.parse(step2.body).retValue;
    if (!jwk || !jwk.kid) {
throw new Error(`No JWK in certs response: ${step2.body.slice(0, 200)}`);
}
    info(`[tokenManager] Step 2: JWK kid=${jwk.kid}`);

    const encryptedPw = encryptPassword(jwk, password);
    info(`[tokenManager] Step 2: Password RSA-encrypted (${encryptedPw.length / 2} bytes)`);

    // Step 3: POST signin
    info(`[tokenManager] Step 3: POST https://${host}/auth/account/signin`);
    const signinBody = new URLSearchParams({
        client_id: cfg.clientId,
        encryptedPassword: 'true',
        password: encryptedPw,
        redirect_uri: cfg.redirectUri,
        scope: '',
        nonce: '',
        state: 'ccsp',
        username,
        connector_session_key: '',
        kid: jwk.kid,
        _csrf: '',
    }).toString();

    const step3 = await request({
        hostname: host,
        path: '/auth/account/signin',
        method: 'POST',
        headers: baseHeaders({
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(signinBody),
        }),
    }, signinBody);
    jar.ingest(step3.headers);
    info(`[tokenManager] Step 3: HTTP ${step3.statusCode}`);

    if (step3.statusCode !== 302) {
        throw new Error(`Signin returned HTTP ${step3.statusCode}: ${step3.body.slice(0, 300)}`);
    }

    const location = step3.headers['location'] || '';
    info(`[tokenManager] Step 3: Redirect location=${location.slice(0, 120)}`);
    const codeParam = new URL(location, `https://${host}`).searchParams.get('code');
    if (!codeParam) {
throw new Error(`No code in redirect location: ${location.slice(0, 200)}`);
}
    info(`[tokenManager] Step 3: Authorization code obtained (${codeParam.length} chars)`);

    // Step 4: Token exchange
    info(`[tokenManager] Step 4: POST https://${host}/auth/api/v2/user/oauth2/token`);
    const tokenBody = new URLSearchParams({
        grant_type: 'authorization_code',
        code: codeParam,
        redirect_uri: cfg.redirectUri,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
    }).toString();

    const step4 = await request({
        hostname: host,
        path: '/auth/api/v2/user/oauth2/token',
        method: 'POST',
        headers: baseHeaders({
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(tokenBody),
        }),
    }, tokenBody);
    info(`[tokenManager] Step 4: HTTP ${step4.statusCode}`);

    if (step4.statusCode !== 200) {
        throw new Error(`Token exchange failed HTTP ${step4.statusCode}: ${step4.body.slice(0, 300)}`);
    }

    const tokens = JSON.parse(step4.body);
    if (!tokens.refresh_token) {
throw new Error(`No refresh_token in token response: ${step4.body.slice(0, 200)}`);
}
    info(`[tokenManager] Step 4: refresh_token and access_token received`);

    // Refresh tokens from Hyundai/Kia EU are valid for 180 days
    const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();

    return {
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token,
        expiresAt,
    };
}

/**
 * Returns true if the stored token expires within 14 days (or is missing).
 *
 * @param {string} expiresAt  ISO date string
 */
function isExpiringSoon(expiresAt) {
    if (!expiresAt) {
return true;
}
    const msLeft = new Date(expiresAt).getTime() - Date.now();
    return msLeft < 14 * 24 * 60 * 60 * 1000;
}

module.exports = { fetchToken, isExpiringSoon };
