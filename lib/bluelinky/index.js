"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlueLinky = void 0;
const american_controller_1 = require("./controllers/american.controller");
const european_controller_1 = require("./controllers/european.controller");
const canadian_controller_1 = require("./controllers/canadian.controller");
const chinese_controller_1 = require("./controllers/chinese.controller");
const events_1 = require("events");
const logger_1 = __importDefault(require("./logger"));
const constants_1 = require("./constants");
const australia_controller_1 = require("./controllers/australia.controller");
const DEFAULT_CONFIG = {
    username: '',
    password: '',
    region: constants_1.REGIONS.US,
    brand: 'hyundai',
    autoLogin: true,
    pin: '1234',
    vin: '',
    vehicleId: undefined,
};
class BlueLinky extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.vehicles = [];
        // merge configs
        this.config = {
            ...DEFAULT_CONFIG,
            ...config,
        };
        switch (config.region) {
            case constants_1.REGIONS.EU:
                this.controller = new european_controller_1.EuropeanController(this.config);
                break;
            case constants_1.REGIONS.US:
                this.controller = new american_controller_1.AmericanController(this.config);
                break;
            case constants_1.REGIONS.CA:
                this.controller = new canadian_controller_1.CanadianController(this.config);
                break;
            case constants_1.REGIONS.CN:
                this.controller = new chinese_controller_1.ChineseController(this.config);
                break;
            case constants_1.REGIONS.AU:
                this.controller = new australia_controller_1.AustraliaController(this.config);
                break;
            default:
                throw new Error('Your region is not supported yet.');
        }
        if (config.autoLogin === undefined) {
            this.config.autoLogin = true;
        }
        this.onInit();
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(event, listener) {
        return super.on(event, listener);
    }
    onInit() {
        if (this.config.autoLogin) {
            logger_1.default.debug('Bluelinky is logging in automatically, to disable use autoLogin: false');
            this.login();
        }
    }
    async login() {
        try {
            const response = await this.controller.login();
            // get all cars from the controller
            this.vehicles = await this.getVehicles();
            logger_1.default.debug(`Found ${this.vehicles.length} on the account`);
            this.emit('ready', this.vehicles);
            return response;
        }
        catch (error) {
            this.emit('error', error);
            return error.message;
        }
    }
    async getVehicles() {
        return (await this.controller.getVehicles()) || [];
    }
    // Note: I removed the use of ID being given here as it should be standardized that we find cars by VIN
    /**
     * Allows you to access a vehicle in your account by VIN
     * @param input - The VIN for the vehicle
     * @returns Vehicle
     */
    getVehicle(input) {
        try {
            const foundCar = this.vehicles.find(car => car.vin().toLowerCase() === input.toLowerCase());
            if (!foundCar && this.vehicles.length > 0) {
                throw new Error(`Could not find vehicle with id: ${input}`);
            }
            return foundCar;
        }
        catch (err) {
            throw new Error(`Vehicle not found: ${input}!`);
        }
    }
    async refreshAccessToken() {
        return this.controller.refreshAccessToken();
    }
    async logout() {
        return this.controller.logout();
    }
    getSession() {
        return this.controller.session;
    }
    get cachedVehicles() {
        return this.vehicles ?? [];
    }
}
exports.BlueLinky = BlueLinky;
exports.default = BlueLinky;
