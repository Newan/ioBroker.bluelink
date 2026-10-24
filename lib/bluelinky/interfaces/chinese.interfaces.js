"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.historyCumulatedTypes = exports.historyDrivingPeriod = void 0;
var historyDrivingPeriod;
(function (historyDrivingPeriod) {
    historyDrivingPeriod[historyDrivingPeriod["DAY"] = 0] = "DAY";
    historyDrivingPeriod[historyDrivingPeriod["MONTH"] = 1] = "MONTH";
    historyDrivingPeriod[historyDrivingPeriod["ALL"] = 2] = "ALL";
})(historyDrivingPeriod || (exports.historyDrivingPeriod = historyDrivingPeriod = {}));
var historyCumulatedTypes;
(function (historyCumulatedTypes) {
    historyCumulatedTypes[historyCumulatedTypes["TOTAL"] = 0] = "TOTAL";
    historyCumulatedTypes[historyCumulatedTypes["AVERAGE"] = 1] = "AVERAGE";
    historyCumulatedTypes[historyCumulatedTypes["TODAY"] = 2] = "TODAY";
})(historyCumulatedTypes || (exports.historyCumulatedTypes = historyCumulatedTypes = {}));
