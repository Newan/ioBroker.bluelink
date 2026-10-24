"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Vehicle = void 0;
const constants_1 = require("../constants");
class Vehicle {
    constructor(vehicleConfig, controller) {
        this.vehicleConfig = vehicleConfig;
        this.controller = controller;
        this._fullStatus = null;
        this._status = null;
        this._location = null;
        this._odometer = null;
        this.userConfig = {
            username: undefined,
            password: undefined,
            region: constants_1.REGIONS.EU,
            brand: 'hyundai',
            autoLogin: true,
            pin: undefined,
            vin: undefined,
            vehicleId: undefined,
        };
        this.userConfig = controller.userConfig;
    }
    vin() {
        return this.vehicleConfig.vin;
    }
    name() {
        return this.vehicleConfig.name;
    }
    nickname() {
        return this.vehicleConfig.nickname;
    }
    id() {
        return this.vehicleConfig.id;
    }
    brandIndicator() {
        return this.vehicleConfig.brandIndicator;
    }
}
exports.Vehicle = Vehicle;
