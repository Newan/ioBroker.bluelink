"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VehicleWindowState = exports.EVChargeModeTypes = exports.EVPlugTypes = void 0;
var EVPlugTypes;
(function (EVPlugTypes) {
    EVPlugTypes[EVPlugTypes["UNPLUGED"] = 0] = "UNPLUGED";
    EVPlugTypes[EVPlugTypes["FAST"] = 1] = "FAST";
    EVPlugTypes[EVPlugTypes["PORTABLE"] = 2] = "PORTABLE";
    EVPlugTypes[EVPlugTypes["STATION"] = 3] = "STATION";
})(EVPlugTypes || (exports.EVPlugTypes = EVPlugTypes = {}));
var EVChargeModeTypes;
(function (EVChargeModeTypes) {
    EVChargeModeTypes[EVChargeModeTypes["FAST"] = 0] = "FAST";
    EVChargeModeTypes[EVChargeModeTypes["SLOW"] = 1] = "SLOW";
})(EVChargeModeTypes || (exports.EVChargeModeTypes = EVChargeModeTypes = {}));
var VehicleWindowState;
(function (VehicleWindowState) {
    VehicleWindowState[VehicleWindowState["CLOSED"] = 0] = "CLOSED";
    VehicleWindowState[VehicleWindowState["OPEN"] = 1] = "OPEN";
    VehicleWindowState[VehicleWindowState["VENTILATION"] = 2] = "VENTILATION";
})(VehicleWindowState || (exports.VehicleWindowState = VehicleWindowState = {}));
