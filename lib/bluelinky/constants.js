"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_VEHICLE_STATUS_OPTIONS = exports.POSSIBLE_CHARGE_LIMIT_VALUES = exports.REGIONS = exports.ALL_ENDPOINTS = void 0;
// moved all the US constants to its own file, we can use this file for shared constants
const canada_1 = require("./constants/canada");
const europe_1 = require("./constants/europe");
const china_1 = require("./constants/china");
const australia_1 = require("./constants/australia");
exports.ALL_ENDPOINTS = {
    CA: (brand) => (0, canada_1.getBrandEnvironment)(brand).endpoints,
    EU: (brand) => (0, europe_1.getBrandEnvironment)({ brand }).endpoints,
    CN: (brand) => (0, china_1.getBrandEnvironment)({ brand }).endpoints,
    AU: (brand) => (0, australia_1.getBrandEnvironment)({ brand }).endpoints,
};
var REGIONS;
(function (REGIONS) {
    REGIONS["US"] = "US";
    REGIONS["CA"] = "CA";
    REGIONS["EU"] = "EU";
    REGIONS["CN"] = "CN";
    REGIONS["AU"] = "AU";
})(REGIONS || (exports.REGIONS = REGIONS = {}));
exports.POSSIBLE_CHARGE_LIMIT_VALUES = [50, 60, 70, 80, 90, 100];
exports.DEFAULT_VEHICLE_STATUS_OPTIONS = {
    refresh: false,
    parsed: false,
};
