"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CanadianController = void 0;
const got_1 = __importDefault(require("got"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const undici_1 = require("undici");
const canada_1 = require("../constants/canada");
const canadian_vehicle_1 = __importDefault(require("../vehicles/canadian.vehicle"));
const controller_1 = require("./controller");
const logger_1 = __importDefault(require("../logger"));
const common_tools_1 = require("../tools/common.tools");
class CanadianController extends controller_1.SessionController {
    constructor(userConfig) {
        super(userConfig);
        this.vehicles = [];
        this.timeOffset = -(new Date().getTimezoneOffset() / 60);
        logger_1.default.debug('CA Controller created');
        this._environment = (0, canada_1.getBrandEnvironment)(userConfig.brand);
    }
    get environment() {
        return this._environment;
    }
    async refreshAccessToken() {
        const shouldRefreshToken = Math.floor(Date.now() / 1000 - this.session.tokenExpiresAt) >= -10;
        logger_1.default.debug('shouldRefreshToken: ' + shouldRefreshToken.toString());
        if (this.session.refreshToken && shouldRefreshToken) {
            // TODO: someone should find the refresh token API url then we dont have to do this hack
            // the previously used CA_ENDPOINTS.verifyToken did not refresh it only provided if the token was valid
            await this.login();
            logger_1.default.debug('Token refreshed');
            return 'Token refreshed';
        }
        logger_1.default.debug('Token not expired, no need to refresh');
        return 'Token not expired, no need to refresh';
    }
    async login() {
        logger_1.default.info('Begin login request');
        try {
            const response = await this.request(this.environment.endpoints.login, {
                loginId: this.userConfig.username,
                password: this.userConfig.password,
            });
            logger_1.default.debug(response.result);
            this.session.accessToken = response.result.accessToken;
            this.session.refreshToken = response.result.refreshToken;
            this.session.tokenExpiresAt = Math.floor(+new Date() / 1000 + response.result.expireIn);
            return 'login good';
        }
        catch (err) {
            return 'error: ' + err;
        }
    }
    async logout() {
        return 'OK';
    }
    async getVehicles() {
        logger_1.default.info('Begin getVehicleList request');
        try {
            const response = await this.request(this.environment.endpoints.vehicleList, {});
            const data = response.result;
            if (data.vehicles === undefined) {
                this.vehicles = [];
                return this.vehicles;
            }
            data.vehicles.forEach(vehicle => {
                const vehicleConfig = {
                    nickname: vehicle.nickName,
                    name: vehicle.nickName,
                    vin: vehicle.vin,
                    regDate: vehicle.enrollmentDate,
                    brandIndicator: vehicle.brandIndicator,
                    regId: vehicle.regid,
                    id: vehicle.vehicleId,
                    generation: vehicle.genType,
                };
                this.vehicles.push(new canadian_vehicle_1.default(vehicleConfig, this));
            });
            return this.vehicles;
        }
        catch (err) {
            logger_1.default.debug(err);
            return this.vehicles;
        }
    }
    //////////////////////////////////////////////////////////////////////////////
    // Internal
    //////////////////////////////////////////////////////////////////////////////
    // TODO: not quite sure how to type this if it's dynamic?
    /* eslint-disable @typescript-eslint/no-explicit-any */
    async request(endpoint, body, headers = {}) {
        logger_1.default.debug(`[${endpoint}] ${JSON.stringify(headers)} ${JSON.stringify(body)}`);
        const [major, ,] = process.versions.node.split('.').map(Number);
        if (major >= 21) {
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
            logger_1.default.debug('Node version >= 21, using fetch instead of got');
            const options = {
                method: 'POST',
                body: JSON.stringify(body),
                headers: {
                    from: this.environment.origin,
                    language: 0,
                    offset: this.timeOffset,
                    accessToken: this.session.accessToken,
                    Origin: 'https://kiaconnect.ca',
                    Referer: 'https://kiaconnect.ca/login',
                    'Content-Type': 'application/json',
                    ...headers,
                },
                dispatcher: new undici_1.Agent({
                    connect: {
                        rejectUnauthorized: false,
                        secureOptions: node_crypto_1.default.constants.SSL_OP_LEGACY_SERVER_CONNECT
                    }
                }),
            };
            try {
                const response = await (0, undici_1.fetch)(endpoint, options);
                const data = await response.json();
                return data;
            }
            catch (err) {
                logger_1.default.error(err);
                return;
            }
        }
        try {
            const response = await (0, got_1.default)(endpoint, {
                method: 'POST',
                json: true,
                headers: {
                    from: this.environment.origin,
                    language: 1,
                    offset: this.timeOffset,
                    accessToken: this.session.accessToken,
                    ...headers,
                },
                body: {
                    ...body,
                },
            });
            if (response.body.responseHeader.responseCode != 0) {
                throw response.body.responseHeader.responseDesc;
            }
            return response.body;
        }
        catch (err) {
            throw (0, common_tools_1.manageBluelinkyError)(err, 'CanadianController');
        }
    }
}
exports.CanadianController = CanadianController;
