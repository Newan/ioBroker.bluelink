"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const got_1 = __importDefault(require("got"));
const logger_1 = __importDefault(require("../logger"));
const constants_1 = require("../constants");
const vehicle_1 = require("./vehicle");
const url_1 = require("url");
const seatheatvent_1 = require("../constants/seatheatvent");
class AmericanVehicle extends vehicle_1.Vehicle {
    constructor(vehicleConfig, controller) {
        super(vehicleConfig, controller);
        this.vehicleConfig = vehicleConfig;
        this.controller = controller;
        this.region = constants_1.REGIONS.US;
        logger_1.default.debug(`US Vehicle ${this.vehicleConfig.regId} created`);
    }
    getDefaultHeaders() {
        return {
            'access_token': this.controller.session.accessToken,
            'client_id': this.controller.environment.clientId,
            'Host': this.controller.environment.host,
            'User-Agent': 'okhttp/3.12.0',
            'registrationId': this.vehicleConfig.regId,
            'gen': this.vehicleConfig.generation,
            'username': this.userConfig.username,
            'vin': this.vehicleConfig.vin,
            'APPCLOUD-VIN': this.vehicleConfig.vin,
            'Language': '0',
            'to': 'ISS',
            'encryptFlag': 'false',
            'from': 'SPA',
            'brandIndicator': this.vehicleConfig.brandIndicator,
            'bluelinkservicepin': this.userConfig.pin,
            'offset': '-5',
        };
    }
    fullStatus() {
        throw new Error('Method not implemented.');
    }
    async odometer() {
        const response = await this._request(`/ac/v2/enrollment/details/${this.userConfig.username}`, {
            method: 'GET',
            headers: { ...this.getDefaultHeaders() },
        });
        if (response.statusCode !== 200) {
            throw 'Failed to get odometer reading!';
        }
        const data = JSON.parse(response.body);
        const foundVehicle = data.enrolledVehicleDetails.find(item => {
            return item.vehicleDetails.vin === this.vin();
        });
        this._odometer = {
            value: foundVehicle.vehicleDetails.odometer,
            unit: 0, // unsure what this is :P
        };
        return this._odometer;
    }
    /**
     * This is seems to always poll the modem directly, no caching
     */
    async location() {
        const response = await this._request('/ac/v2/rcs/rfc/findMyCar', {
            method: 'GET',
            headers: { ...this.getDefaultHeaders() },
        });
        if (response.statusCode !== 200) {
            throw 'Failed to get location!';
        }
        const data = JSON.parse(response.body);
        return {
            latitude: data.coord.lat,
            longitude: data.coord.lon,
            altitude: data.coord.alt,
            speed: {
                unit: data.speed.unit,
                value: data.speed.value,
            },
            heading: data.head,
        };
    }
    async start(startConfig) {
        logger_1.default.debug('try start: ', JSON.stringify(startConfig));
        let seatClimateOptions = null;
        let gen2ev = false;
        const mergedConfig = {
            ...{
                hvac: false,
                duration: 10,
                temperature: 70,
                defrost: false,
                heatedFeatures: 0,
                unit: 'F',
                seatClimateSettings: seatClimateOptions
            },
            ...startConfig,
        };
        logger_1.default.debug(`mergedConfig:  ${JSON.stringify(mergedConfig)}`);
        const advClimateOptionValidator = (0, seatheatvent_1.advClimateValidator)(this.userConfig.brand, this.region);
        logger_1.default.debug(`advClimateOptionValidator: ${JSON.stringify(advClimateOptionValidator)}`);
        let start_url = 'ac/v2/rcs/rsc/start';
        if (this.vehicleConfig.engineType === 'EV') {
            start_url = 'ac/v2/evc/fatc/start';
            if (this.vehicleConfig.generation == '2') {
                gen2ev = true;
                logger_1.default.debug('gen2 EV vehicle - seat and climate duration options not supported');
            }
        }
        logger_1.default.debug(`Using start URL: ${start_url}`);
        //keeping heate dFeatures backwards compatible
        if (typeof mergedConfig.heatedFeatures === 'boolean') {
            mergedConfig.heatedFeatures = mergedConfig.heatedFeatures ? 1 : 0;
            logger_1.default.warn('heatedFeatures was boolean; is actually enum; please update code to use enum values');
        }
        else if (typeof mergedConfig.heatedFeatures === 'number') {
            if (advClimateOptionValidator.validHeats.includes(mergedConfig.heatedFeatures)) {
                mergedConfig.heatedFeatures = advClimateOptionValidator.validHeats[mergedConfig.heatedFeatures];
            }
            else {
                logger_1.default.warn('heatedFeatures is not a valid enum, defaulting to 0');
                mergedConfig.heatedFeatures = 0; // default to 0 if not valid
            }
        }
        else {
            logger_1.default.warn('heatedFeatures is not a number or boolean, defaulting to 0');
            mergedConfig.heatedFeatures = 0;
        }
        //processing seatClimateSettings
        const result = {};
        if (mergedConfig.seatClimateSettings && !gen2ev) {
            const controlled_seats = Object.keys(mergedConfig.seatClimateSettings);
            if (controlled_seats.length > 0) {
                logger_1.default.debug(`Seat climate settings found: ${JSON.stringify(mergedConfig.seatClimateSettings)}`);
                controlled_seats.forEach((seat) => {
                    const targetSeat = advClimateOptionValidator.validSeats[seat] ? advClimateOptionValidator.validSeats[seat] : null;
                    const seatStatus = advClimateOptionValidator.validStatus.includes(mergedConfig.seatClimateSettings[seat]) ? mergedConfig.seatClimateSettings[seat] : null;
                    if (targetSeat && seatStatus) {
                        result[targetSeat] = seatStatus;
                    }
                    else {
                        logger_1.default.warn(`invalid seat / seat climate option for ${seat}`);
                    }
                });
                // logger.debug(`Processed Climate Seat Options result: ${JSON.stringify(result)}`);
            }
            else {
                logger_1.default.warn('invalid seatClimateSettings provided, defaulting to null');
            }
        }
        else {
            logger_1.default.debug('no seatClimateSettings found / gen 2 ev');
        }
        // if after processing result is empty, default seatClimateOptions to null
        Object.keys(result).length > 0 ? seatClimateOptions = result : seatClimateOptions = null;
        logger_1.default.debug(`Processed seatClimateOptions: ${JSON.stringify(seatClimateOptions)}`);
        // using ... spread syntax to conditionally build body at the end 
        // avoids typescript's *ahem* nuances with changing things conditionally
        const body = {
            'Ims': 0,
            'airCtrl': +mergedConfig.hvac, // use the unary method to convert to int
            'airTemp': {
                'unit': 1,
                'value': `${mergedConfig.temperature}`,
            },
            'defrost': mergedConfig.defrost,
            'heating1': mergedConfig.heatedFeatures, // default to Off if not valid
            ...(!gen2ev && {
                'igniOnDuration': mergedConfig.duration,
                'seatHeaterVentInfo': seatClimateOptions, // figured out what it is
            }),
            'username': this.userConfig.username,
            'vin': this.vehicleConfig.vin,
        };
        logger_1.default.debug(`starting car with payload: ${JSON.stringify(body)}`);
        const response = await this._request(start_url, {
            method: 'POST',
            headers: {
                ...this.getDefaultHeaders(),
                'offset': '-4',
            },
            body: body,
            json: true,
        });
        if (response.statusCode === 200) {
            logger_1.default.debug(`Vehicle started successfully: ${response.body}`);
            return 'Vehicle started!';
        }
        logger_1.default.error(`Failed to start vehicle: ${response.body}`);
        return 'Failed to start vehicle';
    }
    async stop() {
        const response = await this._request('/ac/v2/rcs/rsc/stop', {
            method: 'POST',
            headers: {
                ...this.getDefaultHeaders(),
                'offset': '-4',
            },
        });
        if (response.statusCode === 200) {
            return 'Vehicle stopped';
        }
        throw 'Failed to stop vehicle!';
    }
    async status(input) {
        const statusConfig = {
            ...constants_1.DEFAULT_VEHICLE_STATUS_OPTIONS,
            ...input,
        };
        const response = await this._request('/ac/v2/rcs/rvs/vehicleStatus', {
            method: 'GET',
            headers: {
                'REFRESH': statusConfig.refresh.toString(),
                ...this.getDefaultHeaders(),
            },
        });
        const { vehicleStatus } = JSON.parse(response.body);
        const parsedStatus = {
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
            engine: {
                ignition: vehicleStatus?.engine,
                accessory: vehicleStatus?.acc,
                // try ev range first then fallback to ice range
                range: vehicleStatus?.evStatus?.drvDistance[0]?.rangeByFuel?.totalAvailableRange?.value ||
                    vehicleStatus?.dte?.value,
                charging: vehicleStatus?.evStatus?.batteryCharge,
                batteryCharge12v: vehicleStatus?.battery?.batSoc,
                batteryChargeHV: vehicleStatus?.evStatus?.batteryStatus,
            },
            lastupdate: new Date(vehicleStatus?.dateTime),
        };
        this._status = statusConfig.parsed ? parsedStatus : vehicleStatus;
        return this._status;
    }
    async unlock() {
        const formData = new url_1.URLSearchParams();
        formData.append('userName', this.userConfig.username || '');
        formData.append('vin', this.vehicleConfig.vin);
        const response = await this._request('/ac/v2/rcs/rdo/on', {
            method: 'POST',
            headers: { ...this.getDefaultHeaders() },
            body: formData.toString(),
        });
        if (response.statusCode === 200) {
            return 'Unlock successful';
        }
        return 'Something went wrong!';
    }
    async lock() {
        const formData = new url_1.URLSearchParams();
        formData.append('userName', this.userConfig.username || '');
        formData.append('vin', this.vehicleConfig.vin);
        const response = await this._request('/ac/v2/rcs/rdo/off', {
            method: 'POST',
            headers: { ...this.getDefaultHeaders() },
            body: formData.toString(),
        });
        if (response.statusCode === 200) {
            return 'Lock successful';
        }
        return 'Something went wrong!';
    }
    async startCharge() {
        const response = await this._request(`/api/v2/spa/vehicles/${this.vehicleConfig.id}/control/charge`, {
            method: 'POST',
        });
        if (response.statusCode === 200) {
            logger_1.default.debug(`Send start charge command to Vehicle ${this.vehicleConfig.id}`);
            return 'Start charge successful';
        }
        throw 'Something went wrong!';
    }
    async stopCharge() {
        const response = await (0, got_1.default)(`/api/v2/spa/vehicles/${this.vehicleConfig.id}/control/charge`, {
            method: 'POST',
        });
        if (response.statusCode === 200) {
            logger_1.default.debug(`Send stop charge command to vehicle ${this.vehicleConfig.id}`);
            return 'Stop charge successful';
        }
        throw 'Something went wrong!';
    }
    // TODO: not sure how to type a dynamic response
    /* eslint-disable @typescript-eslint/no-explicit-any */
    async _request(service, options) {
        // add logic for token refresh if to ensure we don't use a stale token
        await this.controller.refreshAccessToken();
        // if we refreshed token make sure to apply it to the request
        options.headers.access_token = this.controller.session.accessToken;
        const response = await (0, got_1.default)(`${this.controller.environment.baseUrl}/${service}`, {
            throwHttpErrors: false,
            ...options,
        });
        if (response?.body) {
            logger_1.default.debug(response.body);
        }
        return response;
    }
}
exports.default = AmericanVehicle;
