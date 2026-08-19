'use strict';

const https = require('node:https');
const http = require('node:http');
const crypto = require('node:crypto');
const { URLSearchParams, URL } = require('node:url');

// `impit` gives a genuine Chrome TLS/HTTP fingerprint (JA3/JA4 + header order),
// unlike a plain Node https.Agent which only approximates the cipher list.
// Hyundai/Kia started blocking the latter as an "abusing request" in Aug 2026.
// Prebuilt native binaries exist for Windows/macOS/Linux (x64 + arm64); on
// platforms without one (e.g. 32-bit ARM) requiring it throws, so fall back
// to the old Node-only transport there rather than breaking adapter startup.
let Impit = null;
try {
    ({ Impit } = require('impit'));
} catch {
    Impit = null;
}

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

// OneApp/CCI login (bypasses the IDPConnect WAF that started blocking the legacy
// client_id's :8080-redirect authorize as an "abusing request" around 2026-08-11,
// see https://github.com/Hyundai-Kia-Connect/hyundai_kia_connect_api/pull/1277 and
// https://github.com/Hyundai-Kia-Connect/hyundai_kia_connect_api/issues/1273).
// Same idpHost as BRANDS above for steps 1-3 (authorize/certs/signin), just with
// this different, not-blocked client_id/redirect_uri; steps 4-5 talk to the
// separate cci-api-eu host to obtain a CCS token usable on the legacy ccapi:8080
// vehicle endpoints.
const CCI = {
    hyundai: {
        clientId: '4f4953b5-02e1-4dbc-8599-87e983ee1be5',
        redirectUri: 'https://oneapp.hyundai.com/redirect',
        apiHost: 'cci-api-eu.hyundai.com',
        packageId: 'com.hyundai.oneapp.eu',
        clientName: 'hyundai',
        osVersion: '18.7',
        notificationProvider: 'APNS',
    },
    kia: {
        clientId: '01b36c86-79e8-486c-8009-15f2ad88d670',
        redirectUri: 'https://oneapp.kia.com/redirect',
        apiHost: 'cci-api-eu.kia.com',
        packageId: 'com.kia.oneapp.eu',
        clientName: 'kia',
        osVersion: '27',
        notificationProvider: 'IOS_APPSTORE',
    },
};

// Legacy user agent identifying Hyundai/Kia's own "Connected Car Service" app
// (CCS_APP_AOS suffix) — the IDP appears to allowlist this exact string rather
// than checking for "a real modern browser". Confirmed via RustyDust/bluelink_refresh_token,
// which reaches signin successfully with this UA where a generic modern
// Android Chrome UA gets flagged as an abusing request.
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

/** Simple cookie jar — stores name=value pairs, domain-agnostic (all cookies sent to all requests) */
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

let impitInstance = null;

/** Lazily create the shared Impit client (one TLS/connection identity for the whole flow). */
function getImpitInstance() {
    if (!impitInstance) {
        impitInstance = new Impit({ browser: 'chrome131', followRedirects: false, timeout: 15000 });
    }
    return impitInstance;
}

/**
 * Low-level HTTPS/HTTP request via `impit` — real Chrome TLS/HTTP2 fingerprint.
 * We follow redirects manually (the OAuth flow inspects Location/cookies per hop),
 * so redirects are always requested as 'manual' here.
 *
 * @param opts
 * @param {string} [body]
 */
async function requestViaImpit(opts, body) {
    const scheme = opts.port === 80 ? 'http' : 'https';
    const port = opts.port && opts.port !== 80 && opts.port !== 443 ? `:${opts.port}` : '';
    const url = `${scheme}://${opts.hostname}${port}${opts.path}`;

    // impit is fetch-shaped: it wants string header values and computes
    // Content-Length itself, unlike Node's raw http.request() which needs it
    // set explicitly. Strip it and stringify the rest so both transports can
    // share the same headers object built by the OAuth flow above.
    const reqHeaders = {};
    for (const [key, value] of Object.entries(opts.headers || {})) {
        if (key.toLowerCase() !== 'content-length') {
            reqHeaders[key] = String(value);
        }
    }

    const res = await getImpitInstance().fetch(url, {
        method: opts.method || 'GET',
        headers: reqHeaders,
        body,
        redirect: 'manual',
        timeout: 15000,
    });

    const resHeaders = {};
    for (const [key, value] of res.headers.entries()) {
        if (key.toLowerCase() !== 'set-cookie') {
            resHeaders[key.toLowerCase()] = value;
        }
    }
    const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    if (setCookies.length) {
        resHeaders['set-cookie'] = setCookies;
    }

    return { statusCode: res.status, headers: resHeaders, body: await res.text() };
}

/**
 * Fallback low-level HTTPS/HTTP request via Node's own http(s) module.
 * Only used when `impit` has no native binding for this platform — its TLS
 * fingerprint is much easier for Hyundai/Kia to flag, but it keeps the
 * adapter functional instead of failing to start.
 *
 * @param opts
 * @param {string} [body]
 */
function requestViaNodeHttp(opts, body = undefined) {
    return new Promise((resolve, reject) => {
        const isHttps = !opts.port || opts.port !== 80;
        const agent = isHttps ? new https.Agent({
            ciphers: CHROME_CIPHERS,
            honorCipherOrder: false,
            minVersion: 'TLSv1.2',
        }) : undefined;

        const mod = isHttps ? https : http;
        const req = mod.request({ ...opts, agent }, (res) => {
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
 * Low-level HTTPS/HTTP request returning { statusCode, headers, body }
 *
 * @param opts
 * @param {string} [body]
 */
function request(opts, body = undefined) {
    return Impit ? requestViaImpit(opts, body) : requestViaNodeHttp(opts, body);
}

/**
 * Encrypt password with RSA PKCS1v1.5 using JWK public key
 *
 * @param jwk
 * @param {string} password
 * @param {string} [encoding] 'base64' (default) or 'hex'
 */
function encryptPassword(jwk, password, encoding = 'base64') {
    const key = crypto.createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' });
    const encrypted = crypto.publicEncrypt(
        { key, padding: crypto.constants.RSA_PKCS1_PADDING },
        Buffer.from(password, 'utf-8'),
    );
    return encoding === 'hex' ? encrypted.toString('hex') : encrypted.toString('base64');
}

/**
 * Fetch a new refresh token using the Hyundai/Kia EU OAuth flow.
 *
 * Flow (based on RustyDust/bluelink_refresh_token headless mode):
 *  (1) GET /authorize — follow all redirects to collect session cookies.
 *      Key cookies: account (IDP session), _hazkpw (CSRF seed).
 *
 *  (2) GET /certs → RSA JWK for password encryption.
 *
 *  (3) POST /signin with empty connector_session_key and _csrf.
 *      IDP authenticates user and responds 302 with code= directly in the location.
 *
 *  (4) POST /token → access_token + refresh_token.
 *
 * @param {string} brand     'hyundai' | 'kia'
 * @param {string} username
 * @param {string} password  actual account password
 * @param {Function} [log]   optional logger (msg) => void
 */
async function fetchTokenLegacy(brand, username, password, log) {
    const info = log || (() => {});
    const cfg = BRANDS[brand];
    if (!cfg) {
throw new Error(`Unknown brand: ${brand}`);
}

    info(`[tokenManager] Transport: ${Impit ? 'impit (Chrome TLS/HTTP fingerprint)' : 'Node https fallback — impit unavailable on this platform'}`);

    const host = cfg.idpHost;
    const jar = new CookieJar();

    // The IDP appears to allowlist the CCS app's exact User-Agent rather than
    // validating "is this a real browser", so it's sent unconditionally on both
    // transports. The other browser-identity headers (Accept, Sec-Ch-Ua…) are
    // left to impit — it fills in a set matching its TLS/HTTP2 fingerprint,
    // and hand-picking a mismatched set here would just add another signal to
    // flag. Only the Node.js fallback path (no fingerprint to stay consistent
    // with) sets its own.
    const baseHeaders = (extra = {}) => ({
        'User-Agent': USER_AGENT,
        ...(Impit ? {} : {
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Sec-Ch-Ua': '"Chromium";v="131", "Google Chrome";v="131", "Not_A Brand";v="24"',
            'Sec-Ch-Ua-Mobile': '?1',
            'Sec-Ch-Ua-Platform': '"Android"',
        }),
        Cookie: jar.header(),
        ...extra,
    });

    // ── Step 1: GET /authorize — follow redirects to collect cookies ────────────
    info(`[tokenManager] Step 1: GET https://${host}/auth/api/v2/user/oauth2/authorize`);
    const authorizeUrl = (
        `/auth/api/v2/user/oauth2/authorize?response_type=code` +
        `&client_id=${cfg.clientId}` +
        `&redirect_uri=${encodeURIComponent(cfg.redirectUri)}` +
        `&lang=de&state=ccsp&country=de`
    );

    let currentLocation = `https://${host}${authorizeUrl}`;
    for (let hop = 0; hop < 5; hop++) {
        const locUrl = new URL(currentLocation);
        const resp = await request({
            hostname: locUrl.hostname,
            port: locUrl.port ? parseInt(locUrl.port, 10) : (locUrl.protocol === 'https:' ? 443 : 80),
            path: locUrl.pathname + locUrl.search,
            method: 'GET',
            headers: baseHeaders(),
        });
        jar.ingest(resp.headers);
        if (resp.statusCode === 302 && resp.headers['location']) {
            const next = resp.headers['location'];
            currentLocation = next.startsWith('http') ? next : `https://${locUrl.hostname}${next}`;
            info(`[tokenManager] Step 1 hop ${hop + 1}: HTTP 302 → ${currentLocation.slice(0, 80)}…`);
        } else {
            info(`[tokenManager] Step 1: HTTP ${resp.statusCode}, cookies: ${Object.keys(jar._cookies).join(', ') || 'none'}`);
            break;
        }
    }

    // ── Step 2: GET /certs → RSA JWK ────────────────────────────────────────────
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
    info(`[tokenManager] Step 2: Password RSA-encrypted, base64 len=${encryptedPw.length}`);

    // ── Step 3: POST /signin → expect 302 with code= directly ───────────────────
    // Sending connector_session_key="" bypasses the connector flow entirely;
    // the IDP responds with code= in the redirect location directly.
    info(`[tokenManager] Step 3: POST https://${host}/auth/account/signin`);
    const signinBody = new URLSearchParams({
        client_id: cfg.clientId,
        encryptedPassword: 'true',
        password: encryptedPw,
        redirect_uri: cfg.redirectUri,
        scope: '', nonce: '', state: 'ccsp',
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
            Origin: `https://${host}`,
            Referer: `https://${host}/auth/ui/login`,
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
        }),
    }, signinBody);
    jar.ingest(step3.headers);
    const signinLocation = step3.headers['location'] || '';
    info(`[tokenManager] Step 3: HTTP ${step3.statusCode}, location=${signinLocation.slice(0, 120)}`);

    if (step3.statusCode !== 302) {
        throw new Error(`Signin returned HTTP ${step3.statusCode}: ${step3.body.slice(0, 300)}`);
    }

    // Follow up to 3 redirects after /signin until code= appears.
    // With empty connector_session_key the IDP redirects once more to /authorize
    // (with the authenticated session) which then returns the code.
    let codeParam = null;
    let nextLoc = signinLocation;

    for (let hop = 0; hop < 6; hop++) {
        if (!nextLoc) {
break;
}
        const locUrl = new URL(nextLoc.startsWith('http') ? nextLoc : `https://${host}${nextLoc}`);
        if (locUrl.searchParams.has('error')) {
            throw new Error(`OAuth error: ${locUrl.searchParams.get('error')} — ${locUrl.searchParams.get('error_description')}`);
        }
        if (locUrl.searchParams.has('code')) {
            codeParam = locUrl.searchParams.get('code');
            break;
        }
        info(`[tokenManager] Step 3 hop ${hop + 1}: follow ${nextLoc.slice(0, 100)}`);
        const hopResp = await request({
            hostname: locUrl.hostname,
            port: locUrl.port ? parseInt(locUrl.port, 10) : 443,
            path: locUrl.pathname + locUrl.search,
            method: 'GET',
            headers: baseHeaders({
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'same-site',
                'Upgrade-Insecure-Requests': '1',
            }),
        });
        jar.ingest(hopResp.headers);
        info(`[tokenManager] Step 3 hop ${hop + 1}: HTTP ${hopResp.statusCode}, next=${(hopResp.headers['location'] || '').slice(0, 100)}`);

        if (hopResp.statusCode === 302) {
            nextLoc = hopResp.headers['location'] || '';
        } else if (hopResp.statusCode === 200 && locUrl.pathname.startsWith('/web/')) {
            // CCAPI SPA page — extract next_uri and call the IDP callback directly.
            // The SPA JS would call /session then redirect to next_uri; we skip /session
            // and call next_uri directly with the authenticated account cookie.
            const rawNextUri = locUrl.searchParams.get('next_uri') || '';
            if (!rawNextUri) {
                info(`[tokenManager] Step 3 hop ${hop + 1}: CCAPI SPA has no next_uri — stopping`);
                break;
            }
            let nextUri = decodeURIComponent(rawNextUri);
            const country = locUrl.searchParams.get('country') || '';
            if (country) {
nextUri += `${nextUri.includes('?') ? '&' : '?'}country=${country}`;
}
            info(`[tokenManager] Step 3 hop ${hop + 1}: CCAPI SPA — calling next_uri: ${nextUri.slice(0, 100)}`);
            nextLoc = nextUri;
        } else {
            info(`[tokenManager] Step 3 hop ${hop + 1}: unexpected HTTP ${hopResp.statusCode} — stopping`);
            break;
        }
    }

    if (!codeParam) {
        throw new Error(`No authorization code in redirect chain. Last location: ${nextLoc.slice(0, 300)}`);
    }
    info(`[tokenManager] Step 3: Authorization code obtained (${codeParam.length} chars)`);

    // ── Step 4: Exchange code for tokens ─────────────────────────────────────────
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

    const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
    return { refreshToken: tokens.refresh_token, accessToken: tokens.access_token, expiresAt };
}

/**
 * Headers for the CCI API (cci-api-eu.{hyundai,kia}.com), mirroring
 * hyundai_kia_connect_api's `_get_cci_headers` (see PR #1277).
 *
 * @param {object} cciCfg               CCI[brand] config
 * @param {string} deviceId
 * @param {object} [opts]
 * @param {string} [opts.cciAccessToken]
 * @param {string} [opts.nonCcsToken]
 * @param {string} [opts.exchangeableToken]
 * @param {string} [opts.jsonBody] when set, sends Content-Type: application/json and a real Content-Length instead of the default 0
 */
function getCciHeaders(cciCfg, deviceId, opts = {}) {
    const headers = {
        'client-id': cciCfg.packageId,
        'client-name': cciCfg.clientName,
        'client-version': '1.3.3',
        'client-os-code': 'ios',
        'client-os-version': cciCfg.osVersion,
        'client-device-id': deviceId || '',
        'client-device-model': 'iPhone',
        'client-notification-provider-type': cciCfg.notificationProvider,
        locale: 'DE',
        timezone: '+02:00',
        Accept: 'application/json',
        'Accept-Language': 'de',
        'User-Agent': USER_AGENT,
        'Content-Length': opts.jsonBody !== undefined ? String(Buffer.byteLength(opts.jsonBody)) : '0',
    };
    if (opts.jsonBody !== undefined) {
        headers['Content-Type'] = 'application/json';
    }
    if (opts.nonCcsToken !== undefined) {
        headers['Authentication'] = opts.nonCcsToken;
    }
    if (opts.cciAccessToken !== undefined) {
        headers['authorization'] = `Bearer ${opts.cciAccessToken.replace(/^Bearer /, '')}`;
    }
    if (opts.exchangeableToken !== undefined) {
        headers['exchangeable-token'] = opts.exchangeableToken;
        headers['non-ccs-token'] = opts.nonCcsToken || '';
    }
    return headers;
}

/**
 * Fetch a new refresh token using the OneApp/CCI login flow (EU Hyundai + Kia).
 *
 * The legacy authorize (client_id 6d477c38 / fdc85c00, :8080 redirect) has been
 * blocked by the IDPConnect WAF as an "abusing request" since 2026-08-11. The
 * OneApp client_id's authorize is not on that block list. Ported from
 * https://github.com/Hyundai-Kia-Connect/hyundai_kia_connect_api/pull/1277
 * (Python reference, live-verified there for both brands).
 *
 * Flow:
 *  (1) GET  authorize (OneApp client_id) — collect session cookies.
 *  (2) GET  certs → RSA JWK for password encryption.
 *  (3) POST signin (RSA-encrypted password, state=ccsp) → 302 with code=.
 *  (4) POST cci-api-eu/domain/api/v1/auth/token?code= → CCI token set.
 *  (5) POST cci-api-eu/domain/api/v1/auth/token-exchange?serviceType=CCS → CCS token.
 *
 * The CCS token (returned as accessToken) is accepted by the legacy
 * ccapi:8080 vehicle endpoints as a Bearer token, same as before.
 *
 * CONFIRMED (live-tested 2026-08-18): bluelinky's own refreshAccessToken()
 * cannot use this refresh_token - it POSTs grant_type=refresh_token to the
 * LEGACY client_id's token endpoint, which rejects a CCI-issued refresh_token
 * ("Could not manage to get token"), and since bluelinky calls that on every
 * vehicle API request, using bluelinky's normal login()/autoLogin path with
 * this token causes an immediate crash-loop. Callers MUST bypass bluelinky's
 * own login/refresh for this token: construct BlueLinky with autoLogin:false,
 * prime `controller.session.accessToken` with the returned CCS accessToken
 * directly, and replace `controller.refreshAccessToken` with a function that
 * calls refreshCciToken() below (see main.js's prepareCciSession()).
 *
 * @param {string} brand     'hyundai' | 'kia'
 * @param {string} username
 * @param {string} password  actual account password
 * @param {Function} [log]   optional logger (msg) => void
 */
async function fetchTokenCci(brand, username, password, log) {
    const info = log || (() => {});
    const cfg = BRANDS[brand];
    const cciCfg = CCI[brand];
    if (!cfg || !cciCfg) {
throw new Error(`Unknown brand: ${brand}`);
}

    info(`[tokenManager] OneApp/CCI login (bypasses IDPConnect WAF, see PR #1277). Transport: ${Impit ? 'impit' : 'Node https fallback'}`);

    const host = cfg.idpHost;
    const jar = new CookieJar();
    const deviceId = crypto.randomUUID();

    const baseHeaders = (extra = {}) => ({
        'User-Agent': USER_AGENT,
        ...(Impit ? {} : {
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Sec-Ch-Ua': '"Chromium";v="131", "Google Chrome";v="131", "Not_A Brand";v="24"',
            'Sec-Ch-Ua-Mobile': '?1',
            'Sec-Ch-Ua-Platform': '"Android"',
        }),
        Cookie: jar.header(),
        ...extra,
    });

    // ── Step 1: GET authorize (OneApp client_id) — collect session cookies ──────
    info(`[tokenManager] CCI Step 1: GET https://${host}/auth/api/v2/user/oauth2/authorize (OneApp client_id)`);
    const authorizePath = (
        `/auth/api/v2/user/oauth2/authorize?response_type=code` +
        `&client_id=${cciCfg.clientId}` +
        `&redirect_uri=${encodeURIComponent(cciCfg.redirectUri)}` +
        `&lang=de&state=ccsp&country=de`
    );
    let currentLocation = `https://${host}${authorizePath}`;
    for (let hop = 0; hop < 6; hop++) {
        const locUrl = new URL(currentLocation);

        // The CCAPI "/web/" SPA gateway page (prd.eu-ccapi.*:8080/web/...) is slow/
        // hangs for a plain automated GET (observed: 15s timeout with no response).
        // Its own URL already carries a next_uri param pointing at the real next
        // hop (same shortcut our legacy Step 3 uses) — take it directly instead of
        // trying to load the SPA page itself.
        // Diagnosis result: prd.eu-ccapi.*:8080 has a TLS stack impit's Chrome
        // fingerprint can't negotiate with (PeerMisbehaved/SelectedUnusableCipher-
        // SuiteForVersion) - connecting to it directly fails outright, confirming
        // the shortcut below is necessary, not just an optimization.
        if (locUrl.pathname.startsWith('/web/') && locUrl.searchParams.has('next_uri')) {
            const rawNextUri = locUrl.searchParams.get('next_uri') || '';
            let nextUri = decodeURIComponent(rawNextUri);
            const country = locUrl.searchParams.get('country') || '';
            if (country) {
nextUri += `${nextUri.includes('?') ? '&' : '?'}country=${country}`;
}
            info(`[tokenManager] CCI Step 1 hop ${hop + 1}: CCAPI SPA gateway — skipping to next_uri: ${nextUri.slice(0, 100)}`);
            currentLocation = nextUri.startsWith('http') ? nextUri : `https://${locUrl.hostname}${nextUri}`;
            continue;
        }

        const resp = await request({
            hostname: locUrl.hostname,
            port: locUrl.port ? parseInt(locUrl.port, 10) : 443,
            path: locUrl.pathname + locUrl.search,
            method: 'GET',
            headers: baseHeaders(),
        });
        jar.ingest(resp.headers);
        if (/abusing/i.test(resp.body || '') || (resp.headers['location'] || '').includes('/error?status=400')) {
            throw new Error('OneApp authorize was blocked by the WAF ("abusing request"). This is a server-side block, not a credentials problem.');
        }
        if (resp.statusCode === 302 && resp.headers['location']) {
            const next = resp.headers['location'];
            currentLocation = next.startsWith('http') ? next : `https://${locUrl.hostname}${next}`;
            info(`[tokenManager] CCI Step 1 hop ${hop + 1}: HTTP 302 → ${currentLocation.slice(0, 80)}…`);
        } else {
            info(`[tokenManager] CCI Step 1: HTTP ${resp.statusCode}, cookies: ${Object.keys(jar._cookies).join(', ') || 'none'}`);
            break;
        }
    }

    // ── Steps 2+3: GET certs → RSA JWK, POST signin → expect 302 with code= ─────
    // Tries the password RSA-ciphertext as base64 first (matches our legacy flow),
    // then hex (matches the Python hyundai_kia_connect_api reference) if that
    // bounces back to the login page instead of returning a code - fresh certs
    // per attempt in case the kid is single-use.
    let code = null;
    let lastErr = null;
    const pwEncodings = ['base64', 'hex'];
    for (const pwEncoding of pwEncodings) {
        const certsResp = await request({ hostname: host, path: '/auth/api/v1/accounts/certs', method: 'GET', headers: baseHeaders() });
        jar.ingest(certsResp.headers);
        if (certsResp.statusCode !== 200) {
            lastErr = new Error(`Certs endpoint returned ${certsResp.statusCode}: ${certsResp.body.slice(0, 200)}`);
            continue;
        }
        const jwkAttempt = JSON.parse(certsResp.body).retValue;
        if (!jwkAttempt || !jwkAttempt.kid) {
            lastErr = new Error(`No JWK in certs response: ${certsResp.body.slice(0, 200)}`);
            continue;
        }
        const encPw = encryptPassword(jwkAttempt, password, pwEncoding);
        info(`[tokenManager] CCI Step 3: POST https://${host}/auth/account/signin (password encoding=${pwEncoding}, kid=${jwkAttempt.kid})`);
        const signinBody = new URLSearchParams({
            client_id: cciCfg.clientId,
            encryptedPassword: 'true',
            password: encPw,
            redirect_uri: cciCfg.redirectUri,
            scope: '', nonce: '', state: 'ccsp',
            username,
            connector_session_key: '',
            kid: jwkAttempt.kid,
            _csrf: '',
        }).toString();

        const step3 = await request({
            hostname: host,
            path: '/auth/account/signin',
            method: 'POST',
            headers: baseHeaders({
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(signinBody),
                Origin: `https://${host}`,
                Referer: `https://${host}/auth/ui/login`,
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'same-origin',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
            }),
        }, signinBody);
        jar.ingest(step3.headers);
        const signinLocation = step3.headers['location'] || '';
        info(`[tokenManager] CCI Step 3 (${pwEncoding}): HTTP ${step3.statusCode}, location(full)=${signinLocation}`);
        if (step3.body) {
            info(`[tokenManager] CCI Step 3 (${pwEncoding}): body(first 500)=${step3.body.slice(0, 500)}`);
        }
        if (step3.statusCode !== 302) {
            lastErr = new Error(`Signin failed: HTTP ${step3.statusCode} — ${step3.body.slice(0, 300)}. Check username and password.`);
            continue;
        }

        const locUrl = new URL(signinLocation.startsWith('http') ? signinLocation : `https://${host}${signinLocation}`);
        info(`[tokenManager] CCI Step 3 (${pwEncoding}): redirect query params: ${JSON.stringify(Object.fromEntries(locUrl.searchParams))}`);
        const gotCode = locUrl.searchParams.get('code');
        if (gotCode) {
            code = gotCode;
            info(`[tokenManager] CCI Step 3: Authorization code obtained via ${pwEncoding} encoding (${code.length} chars)`);
            break;
        }
        if (locUrl.searchParams.has('error')) {
            throw new Error(`Authentication rejected: ${locUrl.searchParams.get('error_description') || locUrl.searchParams.get('error')}. Check username and password.`);
        }
        if (signinLocation.includes('/web/v1/user/authorization')) {
            throw new Error('Account consent is required. Please log in via a browser once to accept the terms, then retry.');
        }
        lastErr = new Error(`Signin (${pwEncoding} encoding) returned to login page or unexpected redirect: ${signinLocation}`);
    }
    if (!code) {
        throw lastErr || new Error('Signin failed with both password encodings');
    }

    // ── Step 4: exchange auth code for CCI tokens (new host, no cookies needed) ──
    info(`[tokenManager] CCI Step 4: POST https://${cciCfg.apiHost}/domain/api/v1/auth/token`);
    const step4 = await request({
        hostname: cciCfg.apiHost,
        path: `/domain/api/v1/auth/token?code=${encodeURIComponent(code)}`,
        method: 'POST',
        headers: getCciHeaders(cciCfg, deviceId),
    });
    if (step4.statusCode !== 200) {
        throw new Error(`CCI token exchange failed: HTTP ${step4.statusCode} — ${step4.body.slice(0, 200)}`);
    }
    const cci = JSON.parse(step4.body);
    const cciAccessToken = cci.accessToken || '';
    const cciRefreshToken = cci.refreshToken || '';
    const nonCcsToken = cci.nonCcsToken || '';
    const exchangeableToken = cci.exchangeableAccessToken || '';
    const exchangeableRefreshToken = cci.exchangeableRefreshToken || '';
    const nonCcsRefreshToken = cci.nonCcsRefreshToken || '';
    const idToken = cci.idToken || '';
    const cciExpiresIn = parseInt(cci.expiresIn, 10) || 3599;
    info(`[tokenManager] CCI Step 4: CCI token set received`);

    // ── Step 5: exchange CCI token for a CCS token (usable on legacy ccapi:8080) ─
    info(`[tokenManager] CCI Step 5: POST https://${cciCfg.apiHost}/domain/api/v1/auth/token-exchange?serviceType=CCS`);
    const step5 = await request({
        hostname: cciCfg.apiHost,
        path: '/domain/api/v1/auth/token-exchange?serviceType=CCS',
        method: 'POST',
        headers: getCciHeaders(cciCfg, deviceId, { cciAccessToken, nonCcsToken, exchangeableToken }),
    });
    if (step5.statusCode !== 200) {
        throw new Error(`CCS token exchange failed: HTTP ${step5.statusCode} — ${step5.body.slice(0, 200)}`);
    }
    const ccsData = JSON.parse(step5.body);
    const ccsToken = ccsData.accessToken || ccsData.ccsAccessToken || '';
    if (!ccsToken) {
        throw new Error(`CCS token exchange returned no accessToken: ${step5.body.slice(0, 200)}`);
    }
    info(`[tokenManager] CCI Step 5: CCS token received`);

    if (!cciRefreshToken) {
        throw new Error(`No refresh token in CCI token response: ${step4.body.slice(0, 200)}`);
    }

    // CCI refresh-token lifetime isn't documented; reuse the same 180-day
    // renewal heuristic as the legacy flow until real-world behaviour is known.
    const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
    return {
        refreshToken: cciRefreshToken,
        accessToken: `Bearer ${ccsToken}`,
        expiresAt,
        // Bluelinky's own refreshAccessToken() can't use this token (it POSTs
        // grant_type=refresh_token to the LEGACY client_id, which rejects a
        // CCI-issued refresh_token) - the caller has to bypass bluelinky's
        // refresh entirely and use refreshCciToken() below instead, keeping
        // this whole object around for that.
        cci: {
            accessToken: cciAccessToken,
            refreshToken: cciRefreshToken,
            nonCcsToken,
            exchangeableToken,
            exchangeableRefreshToken,
            nonCcsRefreshToken,
            idToken,
            expiresIn: cciExpiresIn,
            deviceId,
        },
    };
}

/**
 * Refresh a CCI/CCS session without repeating the password login: POST the
 * full CCI token set to cci-api-eu/domain/api/v2/auth/token-refresh, then
 * re-exchange the resulting CCI access token for a fresh CCS token (same
 * token-exchange step as fetchTokenCci's Step 5). Ported from the same PR
 * #1277 reference (`_refresh_cci_token`/`_exchange_ccs_token`).
 *
 * @param {string} brand  'hyundai' | 'kia'
 * @param {object} cci    the `.cci` object returned by fetchTokenCci (or a
 *                        previous refreshCciToken call)
 * @param {Function} [log]
 */
async function refreshCciToken(brand, cci, log) {
    const info = log || (() => {});
    const cciCfg = CCI[brand];
    if (!cciCfg) {
throw new Error(`Unknown brand: ${brand}`);
}
    if (!cci || !cci.refreshToken) {
        throw new Error('refreshCciToken: no CCI refresh token available');
    }
    const deviceId = cci.deviceId || crypto.randomUUID();

    const refreshBody = JSON.stringify({
        accessToken: (cci.accessToken || '').replace(/^Bearer /, ''),
        refreshToken: cci.refreshToken || '',
        exchangeableAccessToken: cci.exchangeableToken || '',
        exchangeableRefreshToken: cci.exchangeableRefreshToken || '',
        nonCcsToken: cci.nonCcsToken || '',
        nonCcsRefreshToken: cci.nonCcsRefreshToken || '',
        idToken: cci.idToken || '',
    });

    info(`[tokenManager] CCI refresh: POST https://${cciCfg.apiHost}/domain/api/v2/auth/token-refresh`);
    const refreshResp = await request({
        hostname: cciCfg.apiHost,
        path: '/domain/api/v2/auth/token-refresh',
        method: 'POST',
        headers: getCciHeaders(cciCfg, deviceId, {
            cciAccessToken: cci.accessToken,
            nonCcsToken: cci.nonCcsToken,
            exchangeableToken: cci.exchangeableToken,
            jsonBody: refreshBody,
        }),
    }, refreshBody);
    if (refreshResp.statusCode !== 200) {
        throw new Error(`CCI token refresh failed: HTTP ${refreshResp.statusCode} — ${refreshResp.body.slice(0, 200)}`);
    }
    const data = JSON.parse(refreshResp.body);
    const newCci = {
        accessToken: data.accessToken || cci.accessToken || '',
        refreshToken: data.refreshToken || cci.refreshToken || '',
        exchangeableToken: data.exchangeableAccessToken || cci.exchangeableToken || '',
        exchangeableRefreshToken: data.exchangeableRefreshToken || cci.exchangeableRefreshToken || '',
        nonCcsToken: data.nonCcsToken || cci.nonCcsToken || '',
        nonCcsRefreshToken: data.nonCcsRefreshToken || cci.nonCcsRefreshToken || '',
        idToken: data.idToken || cci.idToken || '',
        expiresIn: parseInt(data.expiresIn, 10) || cci.expiresIn || 3599,
        deviceId,
    };
    info(`[tokenManager] CCI refresh: CCI token set refreshed`);

    info(`[tokenManager] CCI refresh: POST https://${cciCfg.apiHost}/domain/api/v1/auth/token-exchange?serviceType=CCS`);
    const step5 = await request({
        hostname: cciCfg.apiHost,
        path: '/domain/api/v1/auth/token-exchange?serviceType=CCS',
        method: 'POST',
        headers: getCciHeaders(cciCfg, deviceId, {
            cciAccessToken: newCci.accessToken,
            nonCcsToken: newCci.nonCcsToken,
            exchangeableToken: newCci.exchangeableToken,
        }),
    });
    if (step5.statusCode !== 200) {
        throw new Error(`CCS token exchange (refresh) failed: HTTP ${step5.statusCode} — ${step5.body.slice(0, 200)}`);
    }
    const ccsData = JSON.parse(step5.body);
    const ccsToken = ccsData.accessToken || ccsData.ccsAccessToken || '';
    if (!ccsToken) {
        throw new Error(`CCS token exchange (refresh) returned no accessToken: ${step5.body.slice(0, 200)}`);
    }
    info(`[tokenManager] CCI refresh: CCS token received`);

    return { accessToken: `Bearer ${ccsToken}`, cci: newCci };
}

/**
 * Register a device ID with the legacy ccapi vehicle API. bluelinky's own
 * EuropeanController.login() does this as its last step (POST .../notifications/register,
 * then uses the server-returned resMsg.deviceId for every later vehicle call) - but that
 * whole login() is exactly what CCI sessions bypass (see fetchTokenCci's doc comment), so
 * this has to be replicated separately or vehicle calls fail with resCode 4002 "Invalid
 * request body - Invalid deviceId" even though the CCS access token itself is valid.
 *
 * Deliberately uses plain Node https, not impit: prd.eu-ccapi.*:8080 (the vehicle API host)
 * has a TLS stack impit's Chrome fingerprint can't negotiate with (see CCI Step 1 comments
 * above), but bluelinky's own `got`-based calls to this same host work fine, so plain Node
 * TLS is known-good here - this must NOT go through request()'s impit-preferring dispatch.
 *
 * @param {string} deviceIdUrl        e.g. https://prd.eu-ccapi.hyundai.com:8080/api/v1/spa/notifications/register
 * @param {string} ccspServiceId      bluelinky controller.environment.ccspServiceID
 * @param {string} ccspApplicationId  bluelinky controller.environment.ccspApplicationID
 * @param {string} stamp              bluelinky controller.environment.stamp.result
 * @param {string} pushType           bluelinky controller.environment.pushType
 * @param {Function} [log]
 */
async function registerDeviceId(deviceIdUrl, ccspServiceId, ccspApplicationId, stamp, pushType, log) {
    const info = log || (() => {});
    const url = new URL(deviceIdUrl);
    const genRanHex = size => [...Array(size)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
    const body = JSON.stringify({
        pushRegId: genRanHex(64),
        pushType,
        uuid: crypto.randomUUID(),
    });

    info(`[tokenManager] Registering device ID: POST ${deviceIdUrl}`);
    const resp = await requestViaNodeHttp({
        hostname: url.hostname,
        port: url.port ? parseInt(url.port, 10) : 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
            'ccsp-service-id': ccspServiceId,
            'ccsp-application-id': ccspApplicationId,
            'Content-Type': 'application/json;charset=UTF-8',
            'Content-Length': String(Buffer.byteLength(body)),
            'User-Agent': 'okhttp/3.10.0',
            Stamp: stamp || '',
        },
    }, body);

    if (resp.statusCode !== 200) {
        throw new Error(`Device registration failed: HTTP ${resp.statusCode} — ${resp.body.slice(0, 200)}`);
    }
    const data = JSON.parse(resp.body);
    const deviceId = data && data.resMsg && data.resMsg.deviceId;
    if (!deviceId) {
        throw new Error(`Device registration returned no deviceId: ${resp.body.slice(0, 200)}`);
    }
    info(`[tokenManager] Device ID registered: ${deviceId}`);
    return deviceId;
}

/**
 * Fetch a new refresh token for EU Hyundai/Kia. Tries the OneApp/CCI flow first
 * (see fetchTokenCci) since the legacy flow is WAF-blocked as of 2026-08;
 * falls back to the legacy flow if the CCI attempt itself fails, in case the
 * WAF situation changes or CCI has its own issue on a given day.
 *
 * @param {string} brand     'hyundai' | 'kia'
 * @param {string} username
 * @param {string} password  actual account password
 * @param {Function} [log]   optional logger (msg) => void
 */
async function fetchToken(brand, username, password, log) {
    const info = log || (() => {});
    try {
        return await fetchTokenCci(brand, username, password, info);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        info(`[tokenManager] OneApp/CCI login failed (${msg}); falling back to legacy flow`);
        return fetchTokenLegacy(brand, username, password, info);
    }
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

module.exports = { fetchToken, isExpiringSoon, refreshCciToken, registerDeviceId };
