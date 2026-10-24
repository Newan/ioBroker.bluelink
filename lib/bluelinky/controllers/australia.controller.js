"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AustraliaController = void 0;
const got_1 = __importDefault(require("got"));
const australia_vehicle_1 = __importDefault(require("../vehicles/australia.vehicle"));
const australia_1 = require("./../constants/australia");
const controller_1 = require("./controller");
const url_1 = require("url");
const logger_1 = __importDefault(require("../logger"));
const common_tools_1 = require("../tools/common.tools");
const australia_authStrategy_1 = require("./authStrategies/australia.authStrategy");
class AustraliaController extends controller_1.SessionController {
    constructor(userConfig) {
        super(userConfig);
        this.session = {
            accessToken: undefined,
            refreshToken: undefined,
            controlToken: undefined,
            deviceId: (0, common_tools_1.uuidV4)(),
            tokenExpiresAt: 0,
            controlTokenExpiresAt: 0,
        };
        this.vehicles = [];
        this.session.deviceId = (0, common_tools_1.uuidV4)();
        this._environment = (0, australia_1.getBrandEnvironment)(userConfig);
        this.authStrategy = new australia_authStrategy_1.AustraliaAuthStrategy(this._environment);
        logger_1.default.debug('AU Controller created');
    }
    get environment() {
        return this._environment;
    }
    async refreshAccessToken() {
        const shouldRefreshToken = Math.floor(Date.now() / 1000 - this.session.tokenExpiresAt) >= -10;
        if (!this.session.refreshToken) {
            logger_1.default.debug('Need refresh token to refresh access token. Use login()');
            return 'Need refresh token to refresh access token. Use login()';
        }
        if (!shouldRefreshToken) {
            logger_1.default.debug('Token not expired, no need to refresh');
            return 'Token not expired, no need to refresh';
        }
        const formData = new url_1.URLSearchParams();
        formData.append('grant_type', 'refresh_token');
        formData.append('redirect_uri', 'https://www.getpostman.com/oauth2/callback'); // Oversight from Hyundai developers
        formData.append('refresh_token', this.session.refreshToken);
        try {
            const response = await (0, got_1.default)(this.environment.endpoints.token, {
                method: 'POST',
                headers: {
                    'Authorization': this.environment.basicToken,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Host': this.environment.host,
                    'Connection': 'Keep-Alive',
                    'Accept-Encoding': 'gzip',
                    'User-Agent': 'okhttp/3.10.0',
                },
                body: formData.toString(),
                throwHttpErrors: false,
            });
            if (response.statusCode !== 200) {
                logger_1.default.debug(`Refresh token failed: ${response.body}`);
                return `Refresh token failed: ${response.body}`;
            }
            const responseBody = JSON.parse(response.body);
            this.session.accessToken = 'Bearer ' + responseBody.access_token;
            this.session.tokenExpiresAt = Math.floor(Date.now() / 1000 + responseBody.expires_in);
        }
        catch (err) {
            throw (0, common_tools_1.manageBluelinkyError)(err, 'AustraliaController.refreshAccessToken');
        }
        logger_1.default.debug('Token refreshed');
        return 'Token refreshed';
    }
    async enterPin() {
        if (this.session.accessToken === '') {
            throw 'Token not set';
        }
        try {
            const response = await (0, got_1.default)(`${this.environment.baseUrl}/api/v1/user/pin`, {
                method: 'PUT',
                headers: {
                    'Authorization': this.session.accessToken,
                    'Content-Type': 'application/json',
                },
                body: {
                    deviceId: this.session.deviceId,
                    pin: this.userConfig.pin,
                },
                json: true,
            });
            this.session.controlToken = 'Bearer ' + response.body.controlToken;
            this.session.controlTokenExpiresAt = Math.floor(Date.now() / 1000 + response.body.expiresTime);
            return 'PIN entered OK, The pin is valid for 10 minutes';
        }
        catch (err) {
            throw (0, common_tools_1.manageBluelinkyError)(err, 'AustraliaController.pin');
        }
    }
    async login() {
        try {
            if (!this.userConfig.password || !this.userConfig.username) {
                throw new Error('@AustraliaController.login: username and password must be defined.');
            }
            let authResult = null;
            try {
                logger_1.default.debug(`@AustraliaController.login: Trying to sign in with ${this.authStrategy.name}`);
                authResult = await this.authStrategy.login({
                    password: this.userConfig.password,
                    username: this.userConfig.username,
                });
            }
            catch (e) {
                throw new Error(`@AustraliaController.login: sign in with ${this.authStrategy.name} failed with error ${e.toString()}`);
            }
            logger_1.default.debug('@AustraliaController.login: Authenticated properly with user and password');
            const genRanHex = size => [...Array(size)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
            const notificationReponse = await (0, got_1.default)(`${this.environment.baseUrl}/api/v1/spa/notifications/register`, {
                method: 'POST',
                headers: {
                    'ccsp-service-id': this.environment.clientId,
                    'Content-Type': 'application/json;charset=UTF-8',
                    'Host': this.environment.host,
                    'Connection': 'Keep-Alive',
                    'Accept-Encoding': 'gzip',
                    'User-Agent': 'okhttp/3.10.0',
                    'ccsp-application-id': this.environment.appId,
                    'Stamp': await this.environment.stamp(),
                },
                body: {
                    pushRegId: genRanHex(64),
                    pushType: 'GCM',
                    uuid: this.session.deviceId,
                },
                json: true,
            });
            if (notificationReponse) {
                this.session.deviceId = notificationReponse.body.resMsg.deviceId;
            }
            logger_1.default.debug('@AustraliaController.login: Device registered');
            const formData = new url_1.URLSearchParams();
            formData.append('grant_type', 'authorization_code');
            formData.append('redirect_uri', this.environment.endpoints.redirectUri);
            formData.append('code', authResult.code);
            const response = await (0, got_1.default)(this.environment.endpoints.token, {
                method: 'POST',
                headers: {
                    'Authorization': this.environment.basicToken,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Host': this.environment.host,
                    'Connection': 'Keep-Alive',
                    'Accept-Encoding': 'gzip',
                    'User-Agent': 'okhttp/3.10.0',
                    'grant_type': 'authorization_code',
                    'ccsp-application-id': this.environment.appId,
                    'Stamp': await this.environment.stamp(),
                },
                body: formData.toString(),
                cookieJar: authResult.cookies,
            });
            if (response.statusCode !== 200) {
                throw new Error(`@AustraliaController.login: Could not manage to get token: ${response.body}`);
            }
            if (response) {
                const responseBody = JSON.parse(response.body);
                this.session.accessToken = `Bearer ${responseBody.access_token}`;
                this.session.refreshToken = responseBody.refresh_token;
                this.session.tokenExpiresAt = Math.floor(Date.now() / 1000 + responseBody.expires_in);
            }
            logger_1.default.debug('@AustraliaController.login: Session defined properly');
            return 'Login success';
        }
        catch (err) {
            throw (0, common_tools_1.manageBluelinkyError)(err, 'AustraliaController.login');
        }
    }
    async logout() {
        return 'OK';
    }
    async getVehicles() {
        if (this.session.accessToken === undefined) {
            throw 'Token not set';
        }
        try {
            const response = await (0, got_1.default)(`${this.environment.baseUrl}/api/v1/spa/vehicles`, {
                method: 'GET',
                headers: {
                    ...this.defaultHeaders,
                    'Stamp': await this.environment.stamp(),
                },
                json: true,
            });
            this.vehicles = await (0, common_tools_1.asyncMap)(response.body.resMsg.vehicles, async (v) => {
                const vehicleProfileReponse = await (0, got_1.default)(`${this.environment.baseUrl}/api/v1/spa/vehicles/${v.vehicleId}/profile`, {
                    method: 'GET',
                    headers: {
                        ...this.defaultHeaders,
                        'Stamp': await this.environment.stamp(),
                    },
                    json: true,
                });
                const vehicleProfile = vehicleProfileReponse.body.resMsg;
                const vehicleConfig = {
                    nickname: v.nickname,
                    name: v.vehicleName,
                    regDate: v.regDate,
                    brandIndicator: 'H',
                    id: v.vehicleId,
                    vin: vehicleProfile.vinInfo[0].basic.vin,
                    generation: vehicleProfile.vinInfo[0].basic.modelYear,
                };
                logger_1.default.debug(`@AustraliaController.getVehicles: Added vehicle ${vehicleConfig.id}`);
                return new australia_vehicle_1.default(vehicleConfig, this);
            });
        }
        catch (err) {
            throw (0, common_tools_1.manageBluelinkyError)(err, 'AustraliaController.getVehicles');
        }
        return this.vehicles;
    }
    async checkControlToken() {
        await this.refreshAccessToken();
        if (this.session?.controlTokenExpiresAt !== undefined) {
            if (!this.session.controlToken || Date.now() / 1000 > this.session.controlTokenExpiresAt) {
                await this.enterPin();
            }
        }
    }
    async getVehicleHttpService() {
        await this.checkControlToken();
        return got_1.default.extend({
            baseUrl: this.environment.baseUrl,
            headers: {
                ...this.defaultHeaders,
                'Authorization': this.session.controlToken,
                'Stamp': await this.environment.stamp(),
            },
            json: true,
        });
    }
    async getApiHttpService() {
        await this.refreshAccessToken();
        return got_1.default.extend({
            baseUrl: this.environment.baseUrl,
            headers: {
                ...this.defaultHeaders,
                'Stamp': await this.environment.stamp(),
            },
            json: true,
        });
    }
    get defaultHeaders() {
        return {
            'Authorization': this.session.accessToken,
            'offset': (new Date().getTimezoneOffset() / 60).toFixed(2),
            'ccsp-device-id': this.session.deviceId,
            'ccsp-application-id': this.environment.appId,
            'Content-Type': 'application/json',
        };
    }
}
exports.AustraliaController = AustraliaController;
