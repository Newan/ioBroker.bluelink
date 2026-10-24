"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChineseController = void 0;
const china_1 = require("../constants/china");
const got_1 = __importDefault(require("got"));
const chinese_vehicle_1 = __importDefault(require("../vehicles/chinese.vehicle"));
const controller_1 = require("./controller");
const logger_1 = __importDefault(require("../logger"));
const url_1 = require("url");
const common_tools_1 = require("../tools/common.tools");
const chinese_legacyAuth_strategy_1 = require("./authStrategies/chinese.legacyAuth.strategy");
class ChineseController extends controller_1.SessionController {
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
        this._environment = (0, china_1.getBrandEnvironment)(userConfig);
        this.authStrategies = {
            main: new chinese_legacyAuth_strategy_1.ChineseLegacyAuthStrategy(this._environment),
        };
        logger_1.default.debug('CN Controller created');
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
            throw (0, common_tools_1.manageBluelinkyError)(err, 'ChinaController.refreshAccessToken');
        }
        logger_1.default.debug('Token refreshed');
        return 'Token refreshed';
    }
    async enterPin() {
        if (this.session.accessToken === '') {
            throw 'Token not set';
        }
        try {
            const response = await (0, got_1.default)(`${this.environment.baseUrl}/api/v1/user/pin?token=`, {
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
            logger_1.default.debug(`controlToken is : ${this.session.controlToken}`);
            this.session.controlTokenExpiresAt = Math.floor(Date.now() / 1000 + response.body.expiresTime);
            return 'PIN entered OK, The pin is valid for 10 minutes';
        }
        catch (err) {
            throw (0, common_tools_1.manageBluelinkyError)(err, 'ChinaController.pin');
        }
    }
    async login() {
        try {
            if (!this.userConfig.password || !this.userConfig.username) {
                throw new Error('@ChinaController.login: username and password must be defined.');
            }
            let authResult = null;
            try {
                logger_1.default.debug(`@ChinaController.login: Trying to sign in with ${this.authStrategies.main.name}`);
                authResult = await this.authStrategies.main.login({
                    password: this.userConfig.password,
                    username: this.userConfig.username,
                });
            }
            catch (e) {
                logger_1.default.error(`@ChinaController.login: sign in with ${this.authStrategies.main.name} failed with error ${e.toString()}`);
                logger_1.default.debug(`@ChinaController.login: Trying to sign in with ${this.authStrategies.main.name}`);
                authResult = await this.authStrategies.main.login({
                    password: this.userConfig.password,
                    username: this.userConfig.username,
                });
            }
            logger_1.default.debug('@ChinaController.login: Authenticated properly with user and password');
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
                },
                body: {
                    pushRegId: this.environment.pushRegId, //59af09e554a9442ab8589c9500d04d2e 
                    providerDeviceId: this.environment.providerDeviceId,
                    pushType: 'GCM',
                    uuid: (0, common_tools_1.uuidV4)(),
                },
                json: true,
            });
            if (notificationReponse) {
                this.session.deviceId = notificationReponse.body.resMsg.deviceId;
            }
            logger_1.default.debug('@ChinaController.login: Device registered');
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
                    //'ccsp-application-id': this.environment.appId,
                },
                body: formData.toString(),
                cookieJar: authResult.cookies,
            });
            if (response.statusCode !== 200) {
                throw new Error(`@ChinaController.login: Could not manage to get token: ${response.body}`);
            }
            if (response) {
                const responseBody = JSON.parse(response.body);
                this.session.accessToken = `Bearer ${responseBody.access_token}`;
                this.session.refreshToken = responseBody.refresh_token;
                this.session.tokenExpiresAt = Math.floor(Date.now() / 1000 + responseBody.expires_in);
            }
            logger_1.default.debug('@ChinaController.login: Session defined properly');
            logger_1.default.debug(`accessToken is ${this.session.accessToken}\n refreshToken is ${this.session.refreshToken}\n tokenExpiresAt : ${this.session.tokenExpiresAt}`);
            return 'Login success';
        }
        catch (err) {
            throw (0, common_tools_1.manageBluelinkyError)(err, 'ChinaController.login');
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
                },
                json: true,
            });
            this.vehicles = await (0, common_tools_1.asyncMap)(response.body.resMsg.vehicles, async (v) => {
                const vehicleProfileReponse = await (0, got_1.default)(`${this.environment.baseUrl}/api/v1/spa/vehicles/${v.vehicleId}/profile`, {
                    method: 'GET',
                    headers: {
                        ...this.defaultHeaders,
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
                logger_1.default.debug(`@ChineseController.getVehicles: Added vehicle ${vehicleConfig.id}`);
                return new chinese_vehicle_1.default(vehicleConfig, this);
            });
        }
        catch (err) {
            throw (0, common_tools_1.manageBluelinkyError)(err, 'EuropeController.getVehicles');
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
                'AuthorizationCCSP': this.session.controlToken,
                'ccsp-device-id': '2e062595-28e0-4bcb-a75a-1b395cde337c',
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
            },
            json: true,
        });
    }
    get defaultHeaders() {
        return {
            'Authorization': this.session.accessToken,
            'offset': (new Date().getTimezoneOffset() / 60).toFixed(0), //fix service 503 error.
            //'ccsp-device-id': this.session.deviceId,
            'ccsp-device-id': '2e062595-28e0-4bcb-a75a-1b395cde337c',
            'ccsp-application-id': this.environment.appId,
            'Content-Type': 'application/json',
            'User-Agent': 'okhttp/4.4.0',
        };
    }
}
exports.ChineseController = ChineseController;
