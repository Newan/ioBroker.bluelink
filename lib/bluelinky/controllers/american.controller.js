"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AmericanController = void 0;
const got_1 = __importDefault(require("got"));
const american_vehicle_1 = __importDefault(require("../vehicles/american.vehicle"));
const controller_1 = require("./controller");
const logger_1 = __importDefault(require("../logger"));
const america_1 = require("../constants/america");
const common_tools_1 = require("../tools/common.tools");
class AmericanController extends controller_1.SessionController {
    constructor(userConfig) {
        super(userConfig);
        this.vehicles = [];
        this._environment = (0, america_1.getBrandEnvironment)(userConfig.brand);
        logger_1.default.debug('US Controller created');
    }
    get environment() {
        return this._environment;
    }
    async refreshAccessToken() {
        const shouldRefreshToken = Math.floor(Date.now() / 1000 - this.session.tokenExpiresAt) >= -10;
        try {
            if (this.session.refreshToken && shouldRefreshToken) {
                logger_1.default.debug('refreshing token');
                const response = await (0, got_1.default)(`${this.environment.baseUrl}/v2/ac/oauth/token/refresh`, {
                    method: 'POST',
                    body: {
                        'refresh_token': this.session.refreshToken,
                    },
                    headers: {
                        'User-Agent': 'PostmanRuntime/7.26.10',
                        'client_secret': this.environment.clientSecret,
                        'client_id': this.environment.clientId,
                    },
                    json: true,
                });
                logger_1.default.debug(response.body);
                this.session.accessToken = response.body.access_token;
                this.session.refreshToken = response.body.refresh_token;
                this.session.tokenExpiresAt = Math.floor(+new Date() / 1000 + parseInt(response.body.expires_in));
                logger_1.default.debug('Token refreshed');
                return 'Token refreshed';
            }
            logger_1.default.debug('Token not expired, no need to refresh');
            return 'Token not expired, no need to refresh';
        }
        catch (err) {
            throw (0, common_tools_1.manageBluelinkyError)(err, 'AmericanController.refreshAccessToken');
        }
    }
    // TODO: come up with a better return value?
    async login() {
        logger_1.default.debug('Logging in to the API');
        try {
            const response = await (0, got_1.default)(`${this.environment.baseUrl}/v2/ac/oauth/token`, {
                method: 'POST',
                body: {
                    username: this.userConfig.username,
                    password: this.userConfig.password,
                },
                headers: {
                    'User-Agent': 'PostmanRuntime/7.26.10',
                    'client_id': this.environment.clientId,
                    'client_secret': this.environment.clientSecret,
                },
                json: true,
            });
            logger_1.default.debug(response.body);
            if (response.statusCode !== 200) {
                return 'login bad';
            }
            this.session.accessToken = response.body.access_token;
            this.session.refreshToken = response.body.refresh_token;
            this.session.tokenExpiresAt = Math.floor(+new Date() / 1000 + parseInt(response.body.expires_in));
            return 'login good';
        }
        catch (err) {
            throw (0, common_tools_1.manageBluelinkyError)(err, 'AmericanController.login');
        }
    }
    async logout() {
        return 'OK';
    }
    async getVehicles() {
        try {
            const response = await (0, got_1.default)(`${this.environment.baseUrl}/ac/v2/enrollment/details/${this.userConfig.username}`, {
                method: 'GET',
                headers: {
                    'access_token': this.session.accessToken,
                    'client_id': this.environment.clientId,
                    'Host': this.environment.host,
                    'User-Agent': 'okhttp/3.12.0',
                    'payloadGenerated': '20200226171938',
                    'includeNonConnectedVehicles': 'Y',
                },
            });
            const data = JSON.parse(response.body);
            if (data.enrolledVehicleDetails === undefined) {
                this.vehicles = [];
                return this.vehicles;
            }
            // logger.debug(`Found vehicles on the account:: `, JSON.stringify(data.enrolledVehicleDetails));
            this.vehicles = data.enrolledVehicleDetails.map(vehicle => {
                const vehicleInfo = vehicle.vehicleDetails;
                const vehicleConfig = {
                    nickname: vehicleInfo.nickName,
                    name: vehicleInfo.nickName,
                    vin: vehicleInfo.vin,
                    regDate: vehicleInfo.enrollmentDate,
                    brandIndicator: vehicleInfo.brandIndicator,
                    regId: vehicleInfo.regid,
                    generation: vehicleInfo.vehicleGeneration
                };
                if (vehicleInfo.evStatus == 'N') {
                    vehicleConfig.engineType = 'ICE'; // Internal Combustion Engine
                }
                else if (vehicleInfo.evStatus == 'E') {
                    vehicleConfig.engineType = 'EV'; // Electric Vehicle
                }
                return new american_vehicle_1.default(vehicleConfig, this);
            });
            return this.vehicles;
        }
        catch (err) {
            throw (0, common_tools_1.manageBluelinkyError)(err, 'AmericanController.getVehicles');
        }
    }
}
exports.AmericanController = AmericanController;
