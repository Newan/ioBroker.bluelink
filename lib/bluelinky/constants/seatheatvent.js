"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.advClimateValidator = void 0;
//should the keys be limited on climateseat?
const payloadSeatNameMapUS = {
    'driverSeat': 'drvSeatHeatState',
    'passengerSeat': 'astSeatHeatState',
    'rearLeftSeat': 'rlSeatHeatState',
    'rearRightSeat': 'rrSeatHeatState'
};
const seatStatusMap = {
    0: 'Off',
    1: 'On',
    2: 'Off',
    3: 'Low Cool',
    4: 'Medium Cool',
    5: 'High Cool',
    6: 'Low Heat',
    7: 'Medium Heat',
    8: 'High Heat',
};
const heatStatusMap = {
    0: 'Off',
    1: 'Steering Wheel and Rear Window',
    2: 'Rear Window',
    3: 'Steering Wheel',
    //     // # Seems to be the same as 1 but different region (EU) handed in seatlistlogic:
    // 4: "Steering Wheel and Rear Window", /// todo be more graceful, handled in logic xxx
};
const createValidatorMapping = (region) => {
    const convry = Object.keys(seatStatusMap).map((key) => Number(key));
    // convry.concat(Object.keys(seatStatusMap));
    const heatstates = Object.keys(heatStatusMap).map((key) => Number(key));
    if (region === 'EU') {
        heatstates.push(4); // EU has 4 as a valid heat state not actually implemented in the code
    }
    // heatstates = heatstates.concat(Object.keys(heatStatusMap));
    // match json input variations
    return {
        validSeats: payloadSeatNameMapUS,
        validStatus: convry,
        validHeats: heatstates
    };
};
const advClimateValidator = (brand, region) => {
    if (region === 'US' && brand === 'hyundai') {
        return Object.freeze(createValidatorMapping(region));
    }
    else {
        return Object.freeze({ validSeats: {}, validStatus: [], validHeats: [] });
    }
};
exports.advClimateValidator = advClimateValidator;
// HEAT_STATUS = {
//     None: None,
//     0: "Off",
//     1: "Steering Wheel and Rear Window",
//     2: "Rear Window",
//     3: "Steering Wheel",
//     // # Seems to be the same as 1 but different region (EU):
//     4: "Steering Wheel and Rear Window",
// }
