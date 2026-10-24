"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const constants_1 = require("../constants");
const common_interfaces_1 = require("../interfaces/common.interfaces");
const european_interfaces_1 = require("../interfaces/european.interfaces");
const logger_1 = __importDefault(require("../logger"));
const common_tools_1 = require("../tools/common.tools");
const util_1 = require("../util");
const vehicle_1 = require("./vehicle");
class AustraliaVehicle extends vehicle_1.Vehicle {
    constructor(vehicleConfig, controller) {
        super(vehicleConfig, controller);
        this.vehicleConfig = vehicleConfig;
        this.controller = controller;
        this.region = constants_1.REGIONS.AU;
        this.serverRates = {
            max: -1,
            current: -1,
        };
        logger_1.default.debug(`AU Vehicle ${this.vehicleConfig.id} created`);
    }
    /**
     *
     * @param config - Vehicle start configuration for the request
     * @returns Promise<string>
     * @remarks - not sure if this supports starting ICE vehicles
     */
    async start(config) {
        const http = await this.controller.getVehicleHttpService();
        try {
            const response = this.updateRates(await http.post(`/api/v2/spa/vehicles/${this.vehicleConfig.id}/control/engine`, {
                body: {
                    action: 'start',
                    hvacType: 0,
                    options: {
                        defrost: config.defrost,
                        heating1: config.heatedFeatures ? 1 : 0,
                    },
                    tempCode: (0, util_1.celciusToTempCode)(constants_1.REGIONS.AU, config.temperature),
                    unit: config.unit,
                },
            }));
            logger_1.default.info(`Climate started for vehicle ${this.vehicleConfig.id}`);
            return response.body;
        }
        catch (err) {
            throw (0, common_tools_1.manageBluelinkyError)(err, 'AustraliaVehicle.start');
        }
    }
    async stop() {
        const http = await this.controller.getVehicleHttpService();
        try {
            const response = this.updateRates(await http.post(`/api/v2/spa/vehicles/${this.vehicleConfig.id}/control/engine`, {
                body: {
                    action: 'stop',
                    hvacType: 0,
                    options: {
                        defrost: true,
                        heating1: 1,
                    },
                    tempCode: '10H',
                    unit: 'C',
                },
            }));
            logger_1.default.info(`Climate stopped for vehicle ${this.vehicleConfig.id}`);
            return response.body;
        }
        catch (err) {
            throw (0, common_tools_1.manageBluelinkyError)(err, 'AustraliaVehicle.stop');
        }
    }
    async lock() {
        const http = await this.controller.getVehicleHttpService();
        try {
            const response = this.updateRates(await http.post(`/api/v2/spa/vehicles/${this.vehicleConfig.id}/control/door`, {
                body: {
                    action: 'close',
                    deviceId: this.controller.session.deviceId,
                },
            }));
            if (response.statusCode === 200) {
                logger_1.default.debug(`Vehicle ${this.vehicleConfig.id} locked`);
                return 'Lock successful';
            }
            return 'Something went wrong!';
        }
        catch (err) {
            throw (0, common_tools_1.manageBluelinkyError)(err, 'AustraliaVehicle.lock');
        }
    }
    async unlock() {
        const http = await this.controller.getVehicleHttpService();
        try {
            const response = this.updateRates(await http.post(`/api/v2/spa/vehicles/${this.vehicleConfig.id}/control/door`, {
                body: {
                    action: 'open',
                    deviceId: this.controller.session.deviceId,
                },
            }));
            if (response.statusCode === 200) {
                logger_1.default.debug(`Vehicle ${this.vehicleConfig.id} unlocked`);
                return 'Unlock successful';
            }
            return 'Something went wrong!';
        }
        catch (err) {
            throw (0, common_tools_1.manageBluelinkyError)(err, 'AustraliaVehicle.unlock');
        }
    }
    async setWindows(config) {
        const http = await this.controller.getVehicleHttpService();
        try {
            const response = this.updateRates(await http.post(`/api/v2/spa/vehicles/${this.vehicleConfig.id}/control/windowcurtain`, {
                body: config,
            }));
            logger_1.default.info(`Climate started for vehicle ${this.vehicleConfig.id}`);
            return response.body;
        }
        catch (err) {
            throw (0, common_tools_1.manageBluelinkyError)(err, 'AustraliaVehicle.start');
        }
    }
    async fullStatus(input) {
        const statusConfig = {
            ...constants_1.DEFAULT_VEHICLE_STATUS_OPTIONS,
            ...input,
        };
        const http = await this.controller.getVehicleHttpService();
        try {
            const vehicleStatusResponse = this.updateRates(statusConfig.refresh
                ? await http.get(`/api/v2/spa/vehicles/${this.vehicleConfig.id}/status/latest`)
                : await http.get(`/api/v2/spa/vehicles/${this.vehicleConfig.id}/status`));
            const locationResponse = this.updateRates(await http.get(`/api/v2/spa/vehicles/${this.vehicleConfig.id}/location/park`));
            const odometer = await this.odometer();
            // TODO: make odometer in `FullVehicleStatus` nullable
            if (!odometer) {
                return null;
            }
            this._fullStatus = {
                vehicleLocation: locationResponse.body.resMsg.gpsDetail,
                odometer,
                vehicleStatus: vehicleStatusResponse.body.resMsg,
            };
            return this._fullStatus;
        }
        catch (err) {
            throw (0, common_tools_1.manageBluelinkyError)(err, 'AustraliaVehicle.fullStatus');
        }
    }
    async status(input) {
        const statusConfig = {
            ...constants_1.DEFAULT_VEHICLE_STATUS_OPTIONS,
            ...input,
        };
        const http = await this.controller.getVehicleHttpService();
        try {
            const cacheString = statusConfig.refresh ? '' : '/latest';
            const response = this.updateRates(await http.get(`/api/v2/spa/vehicles/${this.vehicleConfig.id}/status${cacheString}`));
            const vehicleStatus = response.body.resMsg;
            const parsedStatus = {
                chassis: {
                    hoodOpen: vehicleStatus?.hoodOpen,
                    trunkOpen: vehicleStatus?.trunkOpen,
                    locked: vehicleStatus.doorLock,
                    openDoors: {
                        frontRight: !!vehicleStatus?.doorOpen?.frontRight,
                        frontLeft: !!vehicleStatus?.doorOpen?.frontLeft,
                        backLeft: !!vehicleStatus?.doorOpen?.backLeft,
                        backRight: !!vehicleStatus?.doorOpen?.backRight,
                    },
                    tirePressureWarningLamp: {
                        rearLeft: !!vehicleStatus?.tirePressureLamp?.tirePressureLampRL,
                        frontLeft: !!vehicleStatus?.tirePressureLamp?.tirePressureLampFL,
                        frontRight: !!vehicleStatus?.tirePressureLamp?.tirePressureLampFR,
                        rearRight: !!vehicleStatus?.tirePressureLamp?.tirePressureLampRR,
                        all: !!vehicleStatus?.tirePressureLamp?.tirePressureWarningLampAll,
                    },
                },
                climate: {
                    active: vehicleStatus?.airCtrlOn,
                    steeringwheelHeat: !!vehicleStatus?.steerWheelHeat,
                    sideMirrorHeat: false,
                    rearWindowHeat: !!vehicleStatus?.sideBackWindowHeat,
                    defrost: vehicleStatus?.defrost,
                    temperatureSetpoint: (0, util_1.tempCodeToCelsius)(constants_1.REGIONS.AU, vehicleStatus?.airTemp?.value),
                    temperatureUnit: vehicleStatus?.airTemp?.unit,
                },
                engine: {
                    ignition: vehicleStatus.engine,
                    accessory: vehicleStatus?.acc,
                    rangeGas: vehicleStatus?.evStatus?.drvDistance[0]?.rangeByFuel?.gasModeRange?.value ??
                        vehicleStatus?.dte?.value,
                    // EV
                    range: vehicleStatus?.evStatus?.drvDistance[0]?.rangeByFuel?.totalAvailableRange?.value,
                    rangeEV: vehicleStatus?.evStatus?.drvDistance[0]?.rangeByFuel?.evModeRange?.value,
                    plugedTo: vehicleStatus?.evStatus?.batteryPlugin ?? common_interfaces_1.EVPlugTypes.UNPLUGED,
                    charging: vehicleStatus?.evStatus?.batteryCharge,
                    estimatedCurrentChargeDuration: vehicleStatus?.evStatus?.remainTime2?.atc?.value,
                    estimatedFastChargeDuration: vehicleStatus?.evStatus?.remainTime2?.etc1?.value,
                    estimatedPortableChargeDuration: vehicleStatus?.evStatus?.remainTime2?.etc2?.value,
                    estimatedStationChargeDuration: vehicleStatus?.evStatus?.remainTime2?.etc3?.value,
                    batteryCharge12v: vehicleStatus?.battery?.batSoc,
                    batteryChargeHV: vehicleStatus?.evStatus?.batteryStatus,
                },
                lastupdate: vehicleStatus?.time ? (0, util_1.parseDate)(vehicleStatus?.time) : null,
            };
            if (!parsedStatus.engine.range) {
                if (parsedStatus.engine.rangeEV || parsedStatus.engine.rangeGas) {
                    parsedStatus.engine.range =
                        (parsedStatus.engine.rangeEV ?? 0) + (parsedStatus.engine.rangeGas ?? 0);
                }
            }
            this._status = statusConfig.parsed ? parsedStatus : vehicleStatus;
            return this._status;
        }
        catch (err) {
            throw (0, common_tools_1.manageBluelinkyError)(err, 'AustraliaVehicle.status');
        }
    }
    async odometer() {
        const http = await this.controller.getVehicleHttpService();
        try {
            const response = this.updateRates(await http.post(`/api/v2/spa/vehicles/${this.vehicleConfig.id}/monthlyreport`, {
                body: {
                    setRptMonth: toMonthDate({
                        year: new Date().getFullYear(),
                        month: new Date().getMonth() + 1,
                    }),
                },
            }));
            this._odometer = {
                // TODO: need to hardcode the unit here: what unit values exist? should this be an enum?
                unit: 0,
                value: response.body.resMsg.odometer,
            };
            return this._odometer;
        }
        catch (err) {
            throw (0, common_tools_1.manageBluelinkyError)(err, 'AustraliaVehicle.odometer');
        }
    }
    async location() {
        const http = await this.controller.getVehicleHttpService();
        try {
            const response = this.updateRates(await http.get(`/api/v2/spa/vehicles/${this.vehicleConfig.id}/location/park`));
            const data = response.body.resMsg?.gpsDetail;
            this._location = {
                latitude: data?.coord?.lat,
                longitude: data?.coord?.lon,
                altitude: data?.coord?.alt,
                speed: {
                    unit: data?.speed?.unit,
                    value: data?.speed?.value,
                },
                heading: data?.head,
            };
            return this._location;
        }
        catch (err) {
            throw (0, common_tools_1.manageBluelinkyError)(err, 'AustraliaVehicle.location');
        }
    }
    async startCharge() {
        // TODO: test this
        const http = await this.controller.getVehicleHttpService();
        try {
            const response = this.updateRates(await http.post(`/api/v2/spa/vehicles/${this.vehicleConfig.id}/control/charge`, {
                body: {
                    action: 'start',
                    deviceId: this.controller.session.deviceId,
                },
            }));
            if (response.statusCode === 200) {
                logger_1.default.debug(`Send start charge command to Vehicle ${this.vehicleConfig.id}`);
                return 'Start charge successful';
            }
            throw 'Something went wrong!';
        }
        catch (err) {
            throw (0, common_tools_1.manageBluelinkyError)(err, 'AustraliaVehicle.startCharge');
        }
    }
    async stopCharge() {
        // TODO: test this
        const http = await this.controller.getVehicleHttpService();
        try {
            const response = this.updateRates(await http.post(`/api/v2/spa/vehicles/${this.vehicleConfig.id}/control/charge`, {
                body: {
                    action: 'stop',
                    deviceId: this.controller.session.deviceId,
                },
            }));
            if (response.statusCode === 200) {
                logger_1.default.debug(`Send stop charge command to Vehicle ${this.vehicleConfig.id}`);
                return 'Stop charge successful';
            }
            throw 'Something went wrong!';
        }
        catch (err) {
            throw (0, common_tools_1.manageBluelinkyError)(err, 'AustraliaVehicle.stopCharge');
        }
    }
    async monthlyReport(month = {
        year: new Date().getFullYear(),
        month: new Date().getMonth() + 1,
    }) {
        const http = await this.controller.getVehicleHttpService();
        try {
            const response = this.updateRates(await http.post(`/api/v2/spa/vehicles/${this.vehicleConfig.id}/monthlyreport`, {
                body: {
                    setRptMonth: toMonthDate(month),
                },
            }));
            const rawData = response.body.resMsg?.monthlyReport;
            if (rawData) {
                return {
                    start: rawData.ifo?.mvrMonthStart,
                    end: rawData.ifo?.mvrMonthEnd,
                    breakdown: rawData.breakdown,
                    driving: rawData.driving
                        ? {
                            distance: rawData.driving?.runDistance,
                            startCount: rawData.driving?.engineStartCount,
                            durations: {
                                idle: rawData.driving?.engineIdleTime,
                                drive: rawData.driving?.engineOnTime,
                            },
                        }
                        : undefined,
                    vehicleStatus: rawData.vehicleStatus
                        ? {
                            tpms: rawData.vehicleStatus?.tpmsSupport
                                ? Boolean(rawData.vehicleStatus?.tpmsSupport)
                                : undefined,
                            tirePressure: {
                                all: rawData.vehicleStatus?.tirePressure?.tirePressureLampAll == '1',
                            },
                        }
                        : undefined,
                };
            }
            return;
        }
        catch (err) {
            throw (0, common_tools_1.manageBluelinkyError)(err, 'AustraliaVehicle.monthyReports');
        }
    }
    async tripInfo(date = {
        year: new Date().getFullYear(),
        month: new Date().getMonth() + 1,
    }) {
        const http = await this.controller.getApiHttpService();
        try {
            const perDay = Boolean(date.day);
            const response = this.updateRates(await http.post(`/api/v1/spa/vehicles/${this.vehicleConfig.id}/tripinfo`, {
                body: {
                    setTripLatest: 10,
                    setTripMonth: !perDay ? toMonthDate(date) : undefined,
                    setTripDay: perDay ? toDayDate(date) : undefined,
                    tripPeriodType: perDay ? 1 : 0,
                },
            }));
            if (!perDay) {
                const rawData = response.body.resMsg;
                return {
                    days: Array.isArray(rawData?.tripDayList)
                        ? rawData?.tripDayList.map(day => ({
                            dayRaw: day.tripDayInMonth,
                            date: day.tripDayInMonth ? (0, util_1.parseDate)(day.tripDayInMonth) : undefined,
                            tripsCount: day.tripCntDay,
                        }))
                        : [],
                    durations: {
                        drive: rawData?.tripDrvTime,
                        idle: rawData?.tripIdleTime,
                    },
                    distance: rawData?.tripDist,
                    speed: {
                        avg: rawData?.tripAvgSpeed,
                        max: rawData?.tripMaxSpeed,
                    },
                };
            }
            else {
                const rawData = response.body.resMsg.dayTripList;
                if (rawData && Array.isArray(rawData)) {
                    return rawData.map(day => ({
                        dayRaw: day.tripDay,
                        tripsCount: day.dayTripCnt,
                        distance: day.tripDist,
                        durations: {
                            drive: day.tripDrvTime,
                            idle: day.tripIdleTime,
                        },
                        speed: {
                            avg: day.tripAvgSpeed,
                            max: day.tripMaxSpeed,
                        },
                        trips: Array.isArray(day.tripList)
                            ? day.tripList.map(trip => {
                                const start = (0, util_1.parseDate)(`${day.tripDay}${trip.tripTime}`);
                                return {
                                    timeRaw: trip.tripTime,
                                    start,
                                    end: (0, util_1.addMinutes)(start, trip.tripDrvTime),
                                    durations: {
                                        drive: trip.tripDrvTime,
                                        idle: trip.tripIdleTime,
                                    },
                                    speed: {
                                        avg: trip.tripAvgSpeed,
                                        max: trip.tripMaxSpeed,
                                    },
                                    distance: trip.tripDist,
                                };
                            })
                            : [],
                    }));
                }
            }
            return;
        }
        catch (err) {
            throw (0, common_tools_1.manageBluelinkyError)(err, 'AustraliaVehicle.history');
        }
    }
    async driveHistory(period = european_interfaces_1.historyDrivingPeriod.DAY) {
        const http = await this.controller.getApiHttpService();
        try {
            const response = await http.post(`/api/v1/spa/vehicles/${this.vehicleConfig.id}/drvhistory`, {
                body: {
                    periodTarget: period,
                },
            });
            return {
                cumulated: response.body.resMsg.drivingInfo?.map(line => ({
                    period: line.drivingPeriod,
                    consumption: {
                        total: line.totalPwrCsp,
                        engine: line.motorPwrCsp,
                        climate: line.climatePwrCsp,
                        devices: line.eDPwrCsp,
                        battery: line.batteryMgPwrCsp,
                    },
                    regen: line.regenPwr,
                    distance: line.calculativeOdo,
                })),
                history: response.body.resMsg.drivingInfoDetail?.map(line => ({
                    period: line.drivingPeriod,
                    rawDate: line.drivingDate,
                    date: line.drivingDate ? (0, util_1.parseDate)(line.drivingDate) : undefined,
                    consumption: {
                        total: line.totalPwrCsp,
                        engine: line.motorPwrCsp,
                        climate: line.climatePwrCsp,
                        devices: line.eDPwrCsp,
                        battery: line.batteryMgPwrCsp,
                    },
                    regen: line.regenPwr,
                    distance: line.calculativeOdo,
                })),
            };
        }
        catch (err) {
            throw (0, common_tools_1.manageBluelinkyError)(err, 'AustraliaVehicle.history');
        }
    }
    /**
     * Warning: Only works on EV
     */
    async getChargeTargets() {
        const http = await this.controller.getVehicleHttpService();
        try {
            const response = this.updateRates(await http.get(`/api/v2/spa/vehicles/${this.vehicleConfig.id}/charge/target`));
            const rawData = response.body.resMsg?.targetSOClist;
            if (rawData && Array.isArray(rawData)) {
                return rawData.map(rawSOC => ({
                    distance: rawSOC.drvDistance?.distanceType?.distanceValue,
                    targetLevel: rawSOC.targetSOClevel,
                    type: rawSOC.plugType,
                }));
            }
            return;
        }
        catch (err) {
            throw (0, common_tools_1.manageBluelinkyError)(err, 'AustraliaVehicle.getChargeTargets');
        }
    }
    /**
     * Warning: Only works on EV
     */
    async setChargeTargets(limits) {
        // TODO: test this
        const http = await this.controller.getVehicleHttpService();
        if (!constants_1.POSSIBLE_CHARGE_LIMIT_VALUES.includes(limits.fast) ||
            !constants_1.POSSIBLE_CHARGE_LIMIT_VALUES.includes(limits.slow)) {
            throw new common_tools_1.ManagedBluelinkyError(`Charge target values are limited to ${constants_1.POSSIBLE_CHARGE_LIMIT_VALUES.join(', ')}`);
        }
        try {
            this.updateRates(await http.post(`/api/v2/spa/vehicles/${this.vehicleConfig.id}/charge/target`, {
                body: {
                    targetSOClist: [
                        { plugType: common_interfaces_1.EVChargeModeTypes.FAST, targetSOClevel: limits.fast },
                        { plugType: common_interfaces_1.EVChargeModeTypes.SLOW, targetSOClevel: limits.slow },
                    ],
                },
            }));
        }
        catch (err) {
            throw (0, common_tools_1.manageBluelinkyError)(err, 'AustraliaVehicle.setChargeTargets');
        }
    }
    /**
     * Define a navigation route
     * @param poiInformations The list of POIs and waypoint to go through
     */
    async setNavigation(poiInformations) {
        // TODO: test this
        const http = await this.controller.getVehicleHttpService();
        try {
            this.updateRates(await http.post(`/api/v2/spa/vehicles/${this.vehicleConfig.id}/location/routes`, {
                body: {
                    deviceID: this.controller.session.deviceId,
                    poiInfoList: poiInformations,
                },
            }));
        }
        catch (err) {
            throw (0, common_tools_1.manageBluelinkyError)(err, 'AustraliaVehicle.setNavigation');
        }
    }
    updateRates(resp) {
        if (resp.headers?.['x-ratelimit-limit']) {
            this.serverRates.max = Number(resp.headers?.['x-ratelimit-limit']);
            this.serverRates.current = Number(resp.headers?.['x-ratelimit-remaining']);
            if (resp.headers?.['x-ratelimit-reset']) {
                this.serverRates.reset = new Date(Number(`${resp.headers?.['x-ratelimit-reset']}000`));
            }
            this.serverRates.updatedAt = new Date();
        }
        return resp;
    }
}
exports.default = AustraliaVehicle;
function toMonthDate(month) {
    return `${month.year}${month.month.toString().padStart(2, '0')}`;
}
function toDayDate(date) {
    return date.day
        ? `${toMonthDate(date)}${date.day.toString().padStart(2, '0')}`
        : toMonthDate(date);
}
