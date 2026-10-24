"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const got_1 = __importDefault(require("got"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const undici_1 = require("undici");
const logger_1 = __importDefault(require("../logger"));
const constants_1 = require("../constants");
const common_interfaces_1 = require("../interfaces/common.interfaces");
const vehicle_1 = require("./vehicle");
const util_1 = require("../util");
const common_tools_1 = require("../tools/common.tools");
class CanadianVehicle extends vehicle_1.Vehicle {
    constructor(vehicleConfig, controller) {
        super(vehicleConfig, controller);
        this.vehicleConfig = vehicleConfig;
        this.controller = controller;
        this.region = constants_1.REGIONS.CA;
        this.timeOffset = -(new Date().getTimezoneOffset() / 60);
        this._info = null;
        logger_1.default.debug(`CA Vehicle ${this.vehicleConfig.id} created`);
    }
    fullStatus() {
        throw new Error('Method not implemented.');
    }
    async status(input) {
        const statusConfig = {
            ...constants_1.DEFAULT_VEHICLE_STATUS_OPTIONS,
            ...input,
        };
        logger_1.default.debug('Begin status request, polling car', statusConfig.refresh);
        try {
            let vehicleStatus = null;
            if (statusConfig.useInfo) {
                await this.setInfo(statusConfig.refresh);
                if (this._info) {
                    vehicleStatus = this._info.status;
                }
            }
            else {
                const endpoint = statusConfig.refresh
                    ? this.controller.environment.endpoints.remoteStatus
                    : this.controller.environment.endpoints.status;
                const response = await this.request(endpoint, {});
                vehicleStatus = response.result?.status;
                if (response?.error) {
                    throw response?.error?.errorDesc;
                }
            }
            logger_1.default.debug(vehicleStatus);
            let parsedStatus = null;
            if (vehicleStatus) {
                parsedStatus = {
                    chassis: {
                        hoodOpen: vehicleStatus?.hoodOpen,
                        trunkOpen: vehicleStatus?.trunkOpen,
                        locked: vehicleStatus?.doorLock,
                        openDoors: {
                            frontRight: !!vehicleStatus?.doorOpen?.frontRight,
                            frontLeft: !!vehicleStatus?.doorOpen?.frontLeft,
                            backLeft: !!vehicleStatus?.doorOpen?.backLeft,
                            backRight: !!vehicleStatus?.doorOpen?.backRight,
                        },
                        tirePressureWarningLamp: {
                            rearLeft: !!vehicleStatus?.tirePressureLamp?.tirePressureWarningLampRearLeft,
                            frontLeft: !!vehicleStatus?.tirePressureLamp?.tirePressureWarningLampFrontLeft,
                            frontRight: !!vehicleStatus?.tirePressureLamp?.tirePressureWarningLampFrontRight,
                            rearRight: !!vehicleStatus?.tirePressureLamp?.tirePressureWarningLampRearRight,
                            all: !!vehicleStatus?.tirePressureLamp?.tirePressureWarningLampAll,
                        },
                    },
                    climate: {
                        active: vehicleStatus?.airCtrlOn,
                        steeringwheelHeat: !!vehicleStatus?.steerWheelHeat,
                        sideMirrorHeat: false,
                        rearWindowHeat: !!vehicleStatus?.sideBackWindowHeat,
                        defrost: vehicleStatus?.defrost,
                        temperatureSetpoint: vehicleStatus?.airTemp?.value,
                        temperatureUnit: vehicleStatus?.airTemp?.unit,
                    },
                    // TODO: fix props for parsed???
                    // Seems some of the translation would have to account for EV and ICE
                    // as they are often in different locations on the response
                    // example EV status is in lib/__mock__/canadianStatus.json
                    engine: {
                        ignition: vehicleStatus?.engine,
                        accessory: vehicleStatus?.acc,
                        range: vehicleStatus?.dte?.value,
                        charging: vehicleStatus?.evStatus?.batteryCharge,
                        batteryCharge12v: vehicleStatus?.battery?.batSoc,
                        batteryChargeHV: vehicleStatus?.evStatus?.batteryStatus,
                    },
                    lastupdate: (0, util_1.parseDate)(vehicleStatus?.lastStatusDate),
                };
            }
            this._status = statusConfig.parsed ? parsedStatus : vehicleStatus;
            return this._status;
        }
        catch (err) {
            // @ts-ignore
            throw err.message;
        }
    }
    //////////////////////////////////////////////////////////////////////////////
    // Car commands with preauth (PIN)
    //////////////////////////////////////////////////////////////////////////////
    async lock() {
        logger_1.default.debug('Begin lock request');
        try {
            const preAuth = await this.getPreAuth();
            // assuming the API returns a bad status code for failed attempts
            await this.request(this.controller.environment.endpoints.lock, {}, { pAuth: preAuth });
            return 'Lock successful';
        }
        catch (err) {
            // @ts-ignore
            throw err.message;
        }
    }
    async unlock() {
        logger_1.default.debug('Begin unlock request');
        try {
            const preAuth = await this.getPreAuth();
            await this.request(this.controller.environment.endpoints.unlock, {}, { pAuth: preAuth });
            return 'Unlock successful';
        }
        catch (err) {
            // @ts-ignore
            throw err.message;
        }
    }
    /*
    airCtrl: Boolean,  // climatisation
    heating1: Boolean, // front defrost, airCtrl will be on
    defrost: Boolean,  // side mirrors & rear defrost
    airTempvalue: number | null  // temp in degrees for clim and heating 17-27
    */
    async start(startConfig) {
        logger_1.default.debug('Begin startClimate request');
        try {
            const body = {
                hvacInfo: {
                    airCtrl: (startConfig.hvac ?? false) || (startConfig.defrost ?? false) ? 1 : 0,
                    defrost: startConfig.defrost ?? false,
                    // postRemoteFatcStart: 1,
                    heating1: startConfig.heatedFeatures ? 1 : 0,
                },
            };
            const airTemp = startConfig.temperature;
            // TODO: can we use getTempCode here from util?
            if (airTemp != null) {
                body.hvacInfo['airTemp'] = {
                    value: (0, util_1.celciusToTempCode)(constants_1.REGIONS.CA, airTemp),
                    unit: 0,
                    hvacTempType: 1,
                };
            }
            else if ((startConfig.hvac ?? false) || (startConfig.defrost ?? false)) {
                throw 'air temperature should be specified';
            }
            const preAuth = await this.getPreAuth();
            const response = await this.request(this.controller.environment.endpoints.start, body, {
                pAuth: preAuth,
            });
            logger_1.default.debug(response);
            if (response.responseHeader && response.responseHeader.responseCode === 0) {
                return 'Vehicle started!';
            }
            return 'Failed to start vehicle';
        }
        catch (err) {
            // @ts-ignore
            throw err.message;
        }
    }
    async stop() {
        logger_1.default.debug('Begin stop request');
        try {
            const preAuth = await this.getPreAuth();
            const response = await this.request(this.controller.environment.endpoints.stop, {
                pAuth: preAuth,
            });
            return response;
        }
        catch (err) {
            throw 'error: ' + err;
        }
    }
    // TODO: type this
    async lights(withHorn = false) {
        logger_1.default.debug('Begin lights request with horn ' + withHorn);
        try {
            const preAuth = await this.getPreAuth();
            const response = await this.request(this.controller.environment.endpoints.hornlight, { horn: withHorn }, { pAuth: preAuth });
            return response;
        }
        catch (err) {
            throw 'error: ' + err;
        }
    }
    /**
     * Warning only works on EV vehicles
     * @returns
     */
    async stopCharge() {
        logger_1.default.debug('Begin stopCharge');
        const { stopCharge } = this.controller.environment.endpoints;
        try {
            const preAuth = await this.getPreAuth();
            const response = await this.request(stopCharge, {
                pin: this.controller.userConfig.pin,
                pAuth: preAuth,
            });
            return response;
        }
        catch (err) {
            throw 'error: ' + err;
        }
    }
    /**
     * Warning only works on EV vehicles
     * @returns
     */
    async startCharge() {
        logger_1.default.debug('Begin startCharge');
        const { startCharge } = this.controller.environment.endpoints;
        try {
            const preAuth = await this.getPreAuth();
            const response = await this.request(startCharge, {
                pin: this.controller.userConfig.pin,
                pAuth: preAuth,
            });
            return response;
        }
        catch (err) {
            throw 'error: ' + err;
        }
    }
    /**
     *  Warning only works on EV vehicles
     * @param limits
     * @returns Promise<void>
     */
    async setChargeTargets(limits) {
        logger_1.default.debug('Begin setChargeTarget');
        if (!constants_1.POSSIBLE_CHARGE_LIMIT_VALUES.includes(limits.fast) ||
            !constants_1.POSSIBLE_CHARGE_LIMIT_VALUES.includes(limits.slow)) {
            throw new common_tools_1.ManagedBluelinkyError(`Charge target values are limited to ${constants_1.POSSIBLE_CHARGE_LIMIT_VALUES.join(', ')}`);
        }
        const { setChargeTarget } = this.controller.environment.endpoints;
        try {
            const preAuth = await this.getPreAuth();
            const response = await this.request(setChargeTarget, {
                pin: this.controller.userConfig.pin,
                pAuth: preAuth,
                tsoc: [
                    { plugType: common_interfaces_1.EVChargeModeTypes.FAST, level: limits.fast },
                    { plugType: common_interfaces_1.EVChargeModeTypes.SLOW, level: limits.slow },
                ],
            });
            return response;
        }
        catch (err) {
            throw 'error: ' + err;
        }
    }
    // TODO: @Seb to take a look at doing this
    async odometer() {
        try {
            await this.setInfo();
            if (this._info) {
                return { unit: this._info.vehicle.odometer, value: this._info.vehicle.odometerUnit };
            }
            else {
                throw 'error: no info';
            }
        }
        catch (err) {
            throw 'error: ' + err;
        }
    }
    async location() {
        logger_1.default.debug('Begin locate request');
        try {
            const preAuth = await this.getPreAuth();
            const response = await this.request(this.controller.environment.endpoints.locate, {}, { pAuth: preAuth });
            this._location = response.result;
            return this._location;
        }
        catch (err) {
            throw 'error: ' + err;
        }
    }
    //////////////////////////////////////////////////////////////////////////////
    // Internal
    //////////////////////////////////////////////////////////////////////////////
    // Does this have to be done before every command?
    async getPreAuth() {
        logger_1.default.info('Begin pre-authentication');
        try {
            const response = await this.request(this.controller.environment.endpoints.verifyPin, {});
            return response.result.pAuth;
        }
        catch (err) {
            throw 'error: ' + err;
        }
    }
    // TODO: not sure how to type a dynamic response
    /* eslint-disable @typescript-eslint/no-explicit-any */
    async request(endpoint, body, headers = {}) {
        logger_1.default.debug(`[${endpoint}] ${JSON.stringify(headers)} ${JSON.stringify(body)}`);
        // add logic for token refresh to ensure we don't use a stale token
        await this.controller.refreshAccessToken();
        const [major, ,] = process.versions.node.split('.').map(Number);
        if (major >= 21) {
            body = {
                pin: this.userConfig.pin,
                ...body
            };
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
            logger_1.default.debug('Node version >= 21, using fetch instead of got');
            const options = {
                method: 'POST',
                body: JSON.stringify(body),
                headers: {
                    from: this.controller.environment.origin,
                    language: 0,
                    offset: this.timeOffset,
                    accessToken: this.controller.session.accessToken,
                    Origin: 'https://kiaconnect.ca',
                    Referer: 'https://kiaconnect.ca/login',
                    'Content-Type': 'application/json',
                    vehicleId: this.vehicleConfig.id,
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
        const options = {
            method: 'POST',
            json: true,
            throwHttpErrors: false,
            headers: {
                from: this.controller.environment.origin,
                language: 1,
                offset: this.timeOffset,
                accessToken: this.controller.session.accessToken,
                vehicleId: this.vehicleConfig.id,
                ...headers,
            },
            body: {
                pin: this.userConfig.pin,
                ...body,
            },
        };
        try {
            const response = await (0, got_1.default)(endpoint, options);
            if (response.body.responseHeader.responseCode != 0) {
                return response.body.responseHeader.responseDesc;
            }
            return response.body;
        }
        catch (err) {
            throw 'error: ' + err;
        }
    }
    async setInfo(refresh = false) {
        if (this._info !== null && !refresh) {
            return;
        }
        try {
            const preAuth = await this.getPreAuth();
            const response = await this.request(this.controller.environment.endpoints.vehicleInfo, {}, { pAuth: preAuth });
            this._info = response.result;
        }
        catch (err) {
            throw 'error: ' + err;
        }
    }
}
exports.default = CanadianVehicle;
