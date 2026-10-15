'use strict';

const axios = require('axios').default;

/*
Pleos Vehicle Data API (Hyundai Motor Group, EU Data Act) - read-only access to
Hyundai/Kia/Genesis vehicle data for private users. No captcha-guarded login: the
user issues a Client ID + Client Secret once at https://pleos.ai/playground
("My Vehicle Data API"), every access token is then created from those two values.
No remote commands (lock, climate, charging) - the API only reads data.

https://document.pleos.ai/en/api-reference/vehicle-data-api/intro
*/

const BASE_URL = 'https://api.pleos.ai/v1';
const DEFAULT_TOKEN_LIFETIME = 3600; // docs: access tokens are valid for one hour

// endpoint -> key in the combined result of readAll()
const ENDPOINTS = {
    batteries: 'batteries',
    powertrains: 'powertrains',
    driving: 'driving',
    locations: 'locations',
    status: 'status',
};

/**
 *
 */
class PleosClient {
    /**
     * @param {string} brand hyundai | kia | genesis
     * @param {string} clientId Client ID of the My Vehicle API key
     * @param {string} clientSecret Client Secret of the My Vehicle API key
     * @param {(msg: string) => void} [debug] debug logger
     */
    constructor(brand, clientId, clientSecret, debug) {
        this.brand = String(brand || '').toLowerCase();
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.debug = debug || (() => {});
        this.accessToken = null;
        this.tokenExpiresAt = 0;
    }

    /**
     *
     */
    async getToken() {
        if (this.accessToken && Date.now() < this.tokenExpiresAt) {
            return this.accessToken;
        }
        this.debug('[pleos] requesting new access token');
        let res;
        try {
            res = await axios.post(`${BASE_URL}/auth/personal-token`, {
                clientId: this.clientId,
                clientSecret: this.clientSecret,
            }, {
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', Brand: this.brand },
                timeout: 20000,
            });
        } catch (err) {
            throw new Error(`Pleos token request failed: ${describeError(err)}`);
        }
        const data = res.data && res.data.data;
        if (!data || !data.accessToken) {
            throw new Error(`Pleos token response without accessToken: ${JSON.stringify(res.data).slice(0, 300)}`);
        }
        const lifetime = Number(data.expiresIn) || DEFAULT_TOKEN_LIFETIME;
        this.accessToken = data.accessToken;
        // renew a minute early so a request never starts with an about-to-expire token
        this.tokenExpiresAt = Date.now() + (lifetime - 60) * 1000;
        return this.accessToken;
    }

    /**
     *
     * @param path
     * @param retried
     */
    async get(path, retried = false) {
        const token = await this.getToken();
        try {
            const res = await axios.get(`${BASE_URL}/vehicles/${path}`, {
                headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', Brand: this.brand },
                timeout: 20000,
            });
            return res.data && res.data.data;
        } catch (err) {
            // 40003 token expired / 40004 invalid token -> fetch a new one once
            const code = err.response && err.response.data && err.response.data.error && String(err.response.data.error.code);
            if (!retried && (code === '40003' || code === '40004' || (err.response && err.response.status === 401))) {
                this.accessToken = null;
                return this.get(path, true);
            }
            throw new Error(`GET ${path}: ${describeError(err)}`);
        }
    }

    /** @returns {Promise<Array<{vin: string, nickname?: string, name?: string, type?: string, sellname?: string}>>} */
    async getVehicles() {
        const data = await this.get('consent');
        return (data && data.vehicles) || [];
    }

    /**
     * Reads all status endpoints of one vehicle. A failing endpoint (model doesn't
     * support it, no data yet) doesn't fail the others; its error is reported instead.
     *
     * @param {string} vin vehicle identification number
     */
    async readAll(vin) {
        const keys = Object.keys(ENDPOINTS);
        const results = await Promise.allSettled(keys.map(k => this.get(`${vin}/${ENDPOINTS[k]}`)));
        const data = {};
        const errors = {};
        results.forEach((r, i) => {
            if (r.status === 'fulfilled') {
                data[keys[i]] = r.value;
            } else {
                errors[keys[i]] = r.reason && r.reason.message ? r.reason.message : String(r.reason);
            }
        });
        return { data, errors };
    }
}

function describeError(err) {
    if (err && err.response) {
        const body = err.response.data;
        const apiErr = body && body.error;
        if (apiErr) {
            return `HTTP ${err.response.status} ${apiErr.code} ${apiErr.message || ''}`.trim();
        }
        return `HTTP ${err.response.status} ${JSON.stringify(body).slice(0, 300)}`;
    }
    return err && err.message ? err.message : String(err);
}

/**
 * Converts a distance into km. Returns null for "invalid"/unknown values.
 *
 * @param {number|string} value distance value
 * @param {string} unit km | mile(s) | meter | feet
 */
function toKm(value, unit) {
    const v = Number(value);
    if (value === null || value === undefined || value === '' || isNaN(v)) {
        return null;
    }
    switch (unit) {
        case 'km':
        case undefined:
        case '':
            return v;
        case 'mile':
        case 'miles':
            return Math.round(v * 1.609344 * 10) / 10;
        case 'meter':
            return Math.round(v / 100) / 10;
        case 'feet':
            return Math.round(v * 0.0003048 * 10) / 10;
        default:
            return null;
    }
}

/**
 * Converts a speed into km/h. Returns 0 for "invalid"/unknown values.
 *
 * @param {{value?: number, unit?: string}} speed speed object
 */
function toKmh(speed) {
    const v = Number(speed && speed.value);
    if (!speed || isNaN(v)) {
        return 0;
    }
    switch (speed.unit) {
        case 'mph':
            return Math.round(v * 1.609344);
        case 'mps':
            return Math.round(v * 3.6);
        case 'kph':
            return v;
        default:
            return 0;
    }
}

/**
 * Converts a temperature object into °C. Returns null for missing values.
 *
 * @param {{value?: number, unit?: string}} temp temperature object
 */
function toCelsius(temp) {
    const v = Number(temp && temp.value);
    if (!temp || temp.value === null || isNaN(v)) {
        return null;
    }
    return temp.unit === 'F' ? Math.round((v - 32) / 1.8 * 10) / 10 : v;
}

module.exports = { PleosClient, toKm, toKmh, toCelsius };
