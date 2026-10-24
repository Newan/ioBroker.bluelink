"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EuropeanController = void 0;
const europe_1 = require("./../constants/europe");
const got_1 = __importDefault(require("got"));
const european_vehicle_1 = __importDefault(require("../vehicles/european.vehicle"));
const controller_1 = require("./controller");
const logger_1 = __importDefault(require("../logger"));
const url_1 = require("url");
const common_tools_1 = require("../tools/common.tools");
const european_brandAuth_strategy_1 = require("./authStrategies/european.brandAuth.strategy");
const european_legacyAuth_strategy_1 = require("./authStrategies/european.legacyAuth.strategy");
class EuropeanController extends controller_1.SessionController {
    constructor(userConfig) {
        super(userConfig);
        this.session = {
            accessToken: '',
            refreshToken: '',
            controlToken: undefined,
            deviceId: (0, common_tools_1.uuidV4)(),
            tokenExpiresAt: 0,
            controlTokenExpiresAt: 0,
        };
        this.vehicles = [];
        this.userConfig.language = userConfig.language ?? europe_1.DEFAULT_LANGUAGE;
        if (!europe_1.EU_LANGUAGES.includes(this.userConfig.language)) {
            throw new Error(`The language code ${this.userConfig.language} is not managed. Only ${europe_1.EU_LANGUAGES.join(', ')} are.`);
        }
        this.session.deviceId = (0, common_tools_1.uuidV4)();
        this._environment = (0, europe_1.getBrandEnvironment)(userConfig);
        this.authStrategies = {
            main: new european_brandAuth_strategy_1.EuropeanBrandAuthStrategy(this._environment, this.userConfig.language),
            fallback: new european_legacyAuth_strategy_1.EuropeanLegacyAuthStrategy(this._environment, this.userConfig.language),
        };
        logger_1.default.debug('EU Controller created');
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
        try {
            const uri = this.environment.loginFormHost + this.environment.endpoints.tokenURL;
            const headers = {
                'Content-type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 4.1.1; Galaxy Nexus Build/JRO03C) AppleWebKit/535.19 (KHTML, like Gecko) Chrome/18.0.1025.166 Mobile Safari/535.19_CCS_APP_AOS',
            };
            const formData = new url_1.URLSearchParams();
            formData.append('grant_type', 'refresh_token');
            formData.append('refresh_token', this.session.refreshToken);
            formData.append('client_id', this.environment.ccspServiceID);
            formData.append('client_secret', this.environment.ccspServiceSecret);
            const response = await got_1.default.post(uri, {
                headers: headers,
                body: formData.toString(),
                followRedirect: true,
                throwHttpErrors: false,
            });
            if (response.statusCode !== 200) {
                logger_1.default.debug(`Refresh token failed: ${response.body}`);
                return `Refresh token failed: ${response.body}`;
            }
            const token = JSON.parse(response.body);
            if (!token.refresh_token && this.session.refreshToken != '') {
                token.refresh_token = this.session.refreshToken;
            }
            const responseBody = JSON.parse(response.body);
            this.session.accessToken = 'Bearer ' + responseBody.access_token;
            this.session.tokenExpiresAt = Math.floor(Date.now() / 1000 + responseBody.expires_in);
        }
        catch (err) {
            throw (0, common_tools_1.manageBluelinkyError)(err, 'EuropeController.refreshAccessToken');
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
            throw (0, common_tools_1.manageBluelinkyError)(err, 'EuropeController.pin');
        }
    }
    async login() {
        try {
            if (!this.userConfig.password || !this.userConfig.username) {
                throw new Error('@EuropeController.login: username and password must be defined.');
            }
            let authResult = null;
            try {
                logger_1.default.debug(`@EuropeController.login: Trying to sign in with ${this.authStrategies.main.name}`);
                authResult = await this.authStrategies.main.login({
                    password: this.userConfig.password,
                    username: this.userConfig.username,
                });
            }
            catch (e) {
                logger_1.default.error(`@EuropeController.login: sign in with ${this.authStrategies.main.name} failed with error ${e.toString()}`);
                throw new Error('@EuropeController.login: Could not manage to get token');
            }
            logger_1.default.debug('@EuropeController.login: Authenticated properly with user and password');
            const token = authResult.code;
            this.session.accessToken = `Bearer ${token.access_token}`;
            this.session.refreshToken = token.refresh_token;
            this.session.tokenExpiresAt = Math.floor(Date.now() / 1000 + token.expires_in);
            const genRanHex = size => [...Array(size)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
            const stamp = this.environment.stamp.result;
            const data = {
                'pushRegId': genRanHex(64),
                'pushType': this.environment.pushType,
                'uuid': crypto.randomUUID(),
            };
            const headers = {
                'ccsp-service-id': this.environment.ccspServiceID,
                'ccsp-application-id': this.environment.ccspApplicationID,
                'Content-type': 'application/json;charset=UTF-8',
                'User-Agent': 'okhttp/3.10.0',
                'Stamp': stamp,
            };
            const notificationReponse = await got_1.default.post(this.environment.endpoints.deviceIdURL, {
                headers: headers,
                body: data,
                json: true,
            });
            if (notificationReponse) {
                this.session.deviceId = notificationReponse.body.resMsg.deviceId;
            }
            logger_1.default.debug('@EuropeController.login: Device registered');
            logger_1.default.debug('@EuropeController.login: Session defined properly');
            return 'Login success';
        }
        catch (err) {
            throw (0, common_tools_1.manageBluelinkyError)(err, 'EuropeController.login');
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
                    //        'Stamp': await this.environment.stamp(),
                },
                json: true,
            });
            this.vehicles = await (0, common_tools_1.asyncMap)(response.body.resMsg.vehicles, async (v) => {
                const vehicleProfileReponse = await (0, got_1.default)(`${this.environment.baseUrl}/api/v1/spa/vehicles/${v.vehicleId}/profile`, {
                    method: 'GET',
                    headers: {
                        ...this.defaultHeaders,
                        //              'Stamp': await this.environment.stamp(),
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
                    ccuCCS2ProtocolSupport: !!v.ccuCCS2ProtocolSupport
                };
                logger_1.default.debug(`@EuropeController.getVehicles: Added vehicle ${vehicleConfig.id}`);
                return new european_vehicle_1.default(vehicleConfig, this);
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
                //      'Stamp': await this.environment.stamp(),
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
                //      'Stamp': await this.environment.stamp(),
            },
            json: true,
        });
    }
    get defaultHeaders() {
        return {
            'Authorization': this.session.accessToken,
            'offset': (new Date().getTimezoneOffset() / 60).toFixed(2),
            'ccsp-device-id': this.session.deviceId,
            'ccsp-application-id': this.environment.ccspApplicationID,
            'Content-Type': 'application/json',
        };
    }
}
exports.EuropeanController = EuropeanController;
