'use strict';

const utils = require('@iobroker/adapter-core');
const bluelinky = require('bluelinky');

const Json2iob = require("./lib/json2iob");

const adapterIntervals = {}; //halten von allen Intervallen
let request_count = 100; //max api request per Day
let client;

let slow_charging;
let fast_charging;

const POSSIBLE_CHARGE_LIMIT_VALUES = [50, 60, 70, 80, 90, 100];

class Bluelink extends utils.Adapter {

    /**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
    constructor(options) {
        super({
            ...options,
            name: 'bluelink',
        });

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        // this.on('objectChange', this.onObjectChange.bind(this));
        // this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
        this.vehiclesDict = {}
        this.vehicles=  [];
        this.json2iob = new Json2iob(this);
        this.evHistoryInterval = null;
    }

    //Start Adapter
    async onReady() {
        //first check account settings
        if (this.config.request < 1) {
            this.log.warn('Request is under 1 -> got to default 100');
        } else {
            request_count = this.config.request;
        }

        if (this.config.username == '' ) {
            this.log.error('No Username set');
        } else {
            //Start logic with login
            this.login();
        }
    }

    /**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
    onUnload(callback) {
        try {
            clearTimeout(adapterIntervals.readAllStates);
            clearInterval(this.evHistoryInterval);
            this.log.info('Adapter bluelink cleaned up everything...');
            callback();
        } catch (e) {
            callback();
        }
    }

    async onStateChange(id, state) {
        this.log.debug(JSON.stringify(state));
        this.log.debug(id);
        if (state) {

            this.log.debug('New Event for state: ' + JSON.stringify(state));
            this.log.debug('ID: ' + JSON.stringify(id));

            const vin = id.split(".")[2];
            const vehicle = this.vehiclesDict[vin]
            const tmpControl = id.split('.')[4];
            let response;
            switch (tmpControl) {
                case 'lock':
                    this.log.info('Starting lock for vehicle');
                    response = await vehicle.lock();
                    this.log.info(response);
                    break;
                case 'unlock':
                    this.log.info('Starting unlock for vehicle');
                    response = await vehicle.unlock();
                    this.log.info(response);
                    break;
                case 'start':
                    this.log.info('Starting clima for vehicle');
                    response = await vehicle.start({
                        airCtrl: false,
                        igniOnDuration: 10,
                        airTempvalue: 70,
                        defrost: false,
                        heating1: false,
                    });
                    this.log.debug(JSON.stringify(response));
                    break;
                case 'stop':
                    this.log.info('Stop clima for vehicle');
                    response = await vehicle.stop();
                    this.log.debug(JSON.stringify(response));
                    break;
                case 'force_refresh':
                    this.log.info('Forcing refresh');
                    //Force refresh for new states
                    this.readStatus(true);
                    break;
                case 'charge':
                    this.log.info('Start charging');
                    response = await vehicle.startCharge();
                    break;
                case 'stop_charge':
                    this.log.info('Stop charging');
                    response = await vehicle.stopCharge();
                    break;
                case 'battery':
                    if (!state.ack) {
                        if (!POSSIBLE_CHARGE_LIMIT_VALUES.includes(state.val)) {
                            this.log.error(`Charge target values are limited to ${POSSIBLE_CHARGE_LIMIT_VALUES.join(', ')}`);
                        } else {
                            this.log.info('Set nee charging options');
                            const charge_option = { fast: fast_charging, slow: slow_charging };
                            if(tmpControl[4] == 'charge_limit_fast') {
                                //set fast charging
                                this.log.debug('Set fast charging');
                                charge_option.fast = state.val;
                            } else {
                                //set slow charging
                                this.log.debug('Set slow charging');
                                charge_option.slow = state.val;
                            }
                            response = await vehicle.setChargeTargets(charge_option);
                            this.log.debug(JSON.stringify(response));
                        }
                    }
                    break;
                default:
                    this.log.error('No command for Control found for: ' + id);
            }
        }
    }

    /**
	 * Funktion to login in bluelink / UVO
	 */
    login() {
        try {
            this.log.info('Login to api');
            const tmpConfig = {
                username: this.config.username,
                password: this.config.client_secret,
                pin: this.config.client_secret_pin,
                brand: this.config.brand,
                region: 'EU' //set over GUI next time
            };

          
            // @ts-ignore
            client = new bluelinky(tmpConfig);

            client.on('ready', async (vehicles) => {
                // wir haben eine Verbindung und haben Autos
                this.log.info(vehicles.length + ' Vehicles found');
                this.log.debug(JSON.stringify(vehicles,this.getCircularReplacer()))

                this.vehicles = vehicles;
                for (const vehicle of vehicles) {
                    const vin = vehicle.vehicleConfig.vin
                    this.vehiclesDict[vin] = vehicle
                    await this.setObjectNotExistsAsync(vin, {
                        type: 'device',
                        common: {
                            name: vehicle.vehicleConfig.nickname,
                   
                        },
                        native: {},
                    });
           
                    await this.setControlObjects(vin);
                    await this.setStatusObjects(vin);
                    
                    await this.setObjectNotExistsAsync(vin + ".general", {
                        type: "channel",
                        common: {
                            name: "General Information",
                        },
                        native: {},
                    });
                    this.json2iob.parse(vin + ".general", vehicle.vehicleConfig);
                    if (this.config.evHistory) {
                        await this.receiveEVInformation(vehicle, vin);
                        this.evHistoryInterval = setInterval(() => {
                            this.receiveEVInformation(vehicle, vin);
                        }, 24 * 60 * 60 * 1000); //24h
    
                    }
                };
    

                //start time cycle
                await this.readStatus();

                //clean legacy states
                this.cleanObjects()

               
            });

            client.on('error', async (err) => {
                // something went wrong with login
                this.log.debug('Error on Api login');
                this.log.error(err);
            });

        } catch (error) {
            this.log.error('Error in login/on function');
            this.log.error(error.message);
        }
    }

    //read new sates from vehicle
    async readStatus(force=false) {
     
        //read new verhicle status
        for (const vehicle of this.vehicles) {
            const vin =  vehicle.vehicleConfig.vin
            this.log.debug('Read new status from api for ' + vin);
            try {
                const newStatus = await vehicle.fullStatus({
                    refresh: true,
                    parsed: true
                });

                //set all values
                this.log.debug('Set new status for ' + vin);
                this.log.debug(JSON.stringify(newStatus));
                await this.setNewStatus(newStatus, vin);
                await this.setObjectNotExistsAsync(vin + ".vehicleStatusRaw", {
                    type: "channel",
                    common: {
                        name: "Unformatted vehicle status",
                    },
                    native: {},
                });
                this.json2iob.parse(vin + ".vehicleStatusRaw", newStatus);

         
            } catch (error) {
                this.log.error('Error on API-Request GetFullStatus');
                this.log.debug(error.message);
            }
        }
        //set ne cycle
        if (force) {
            clearTimeout(adapterIntervals.readAllStates);
        }
        adapterIntervals.readAllStates = setTimeout(this.readStatus.bind(this), ((24*60) / request_count) * 60000);

    }

    async receiveEVInformation(vehicle, vin) {
        try { 
            const driveHistory = await vehicle.driveHistory();
            await this.setObjectNotExistsAsync(vin + ".driveHistory", {
                type: "channel",
                common: {
                    name: "drive history",
                },
                native: {},
            });
            this.json2iob.parse(vin + ".driveHistory", driveHistory,{preferedArrayName:"rawDate"});
            const monthlyReport = await vehicle.monthlyReport();
            await this.setObjectNotExistsAsync(vin + ".monthlyReport", {
                type: "channel",
                common: {
                    name: "monthly report",
                },
                native: {},
            });
            this.json2iob.parse(vin + ".monthlyReport", monthlyReport);
            const tripInfo = await vehicle.tripInfo({year: new Date().getFullYear(),month: new Date().getMonth()+1});
            await this.setObjectNotExistsAsync(vin + ".tripInfo", {
                type: "channel",
                common: {
                    name: "trip information",
                },
                native: {},
            });
            this.json2iob.parse(vin + ".tripInfo", tripInfo);
        } catch (error) {
            this.log.error("EV History fetching failed")
            this.log.error(error)
        }
    }

    //Set new values to ioBroker
    async setNewStatus(newStatus, vin) {
        await this.setStateAsync(vin + '.vehicleStatus.doorLock', { val:newStatus.vehicleStatus.doorLock, ack: true });
        await this.setStateAsync(vin + '.vehicleStatus.trunkOpen', { val: newStatus.vehicleStatus.trunkOpen, ack: true });
        await this.setStateAsync(vin + '.vehicleStatus.hoodOpen', { val: newStatus.vehicleStatus.hoodOpen, ack: true });
        await this.setStateAsync(vin + '.vehicleStatus.airCtrlOn', { val: newStatus.vehicleStatus.airCtrlOn, ack: true });

        //Charge

        //Bei Kia sind die Werte in einer targetSOClist
        if (newStatus.vehicleStatus.evStatus != undefined) {

            if (newStatus.vehicleStatus.evStatus.reservChargeInfos.targetSOClist != undefined) {

                if (newStatus.vehicleStatus.evStatus.reservChargeInfos.targetSOClist[0].plugType == 1) {
                    //Slow  = 1  -> Index 0 ist slow
                    await this.setStateAsync(vin + '.vehicleStatus.battery.charge_limit_slow', { val:
                    newStatus.vehicleStatus.evStatus.reservChargeInfos.targetSOClist[0].targetSOClevel, ack: true });
                    slow_charging = newStatus.vehicleStatus.evStatus.reservChargeInfos.targetSOClist[0].targetSOClevel;
                    await this.setStateAsync(vin + '.vehicleStatus.battery.charge_limit_fast', { val:
                    newStatus.vehicleStatus.evStatus.reservChargeInfos.targetSOClist[1].targetSOClevel, ack: true });
                    fast_charging = newStatus.vehicleStatus.evStatus.reservChargeInfos.targetSOClist[1].targetSOClevel;
                } else {
                    //fast  = 0  -> Index 0 ist fast
                    await this.setStateAsync(vin + '.vehicleStatus.battery.charge_limit_slow', { val:
                    newStatus.vehicleStatus.evStatus.reservChargeInfos.targetSOClist[1].targetSOClevel, ack: true });
                    slow_charging = newStatus.vehicleStatus.evStatus.reservChargeInfos.targetSOClist[1].targetSOClevel;
                    await this.setStateAsync(vin + '.vehicleStatus.battery.charge_limit_fast', { val:
                    newStatus.vehicleStatus.evStatus.reservChargeInfos.targetSOClist[0].targetSOClevel, ack: true });
                    fast_charging = newStatus.vehicleStatus.evStatus.reservChargeInfos.targetSOClist[0].targetSOClevel;
                }

            } else {
                //Bei Hyundai sieht es anders aus:

            }

            //Nur für Elektro Fahrzeuge - Battery
            await this.setStateAsync(vin + '.vehicleStatus.dte', { val: newStatus.vehicleStatus.evStatus.drvDistance[0].rangeByFuel.totalAvailableRange.value, ack: true });
            await this.setStateAsync(vin + '.vehicleStatus.evModeRange', { val: newStatus.vehicleStatus.evStatus.drvDistance[0].rangeByFuel.evModeRange.value, ack: true });
            if (newStatus.vehicleStatus.evStatus.drvDistance[0].rangeByFuel.gasModeRange != undefined) {
                //Only for PHEV
                await this.setStateAsync(vin + '.vehicleStatus.gasModeRange', { val: newStatus.vehicleStatus.evStatus.drvDistance[0].rangeByFuel.gasModeRange.value, ack: true });
            }

            await this.setStateAsync(vin + '.vehicleStatus.battery.soc', { val: newStatus.vehicleStatus.evStatus.batteryStatus, ack: true });
            await this.setStateAsync(vin + '.vehicleStatus.battery.charge', { val: newStatus.vehicleStatus.evStatus.batteryCharge, ack: true });
            await this.setStateAsync(vin + '.vehicleStatus.battery.plugin', { val: newStatus.vehicleStatus.evStatus.batteryPlugin, ack: true });

            //Ladezeit anzeigen, da noch nicht klar welche Werte
            await this.setStateAsync(vin + '.vehicleStatus.battery.minutes_to_charged', { val: newStatus.vehicleStatus.evStatus.remainTime2.atc.value, ack: true });
            this.log.debug('Folgende Ladezeiten Moeglichkeiten wurden gefunden:');
            this.log.debug(JSON.stringify(newStatus.vehicleStatus.evStatus.remainTime2));


        } else {
            //Kein Elektromodell, Diesel etc
            await this.setStateAsync(vin + '.vehicleStatus.dte', { val: newStatus.vehicleStatus.dte.value, ack: true });

        }

        // nur für Kia
        if(newStatus.vehicleStatus.battery != undefined) {
            await this.setStateAsync(vin + '.vehicleStatus.battery.soc-12V', { val: newStatus.vehicleStatus.battery.batSoc, ack: true });
            await this.setStateAsync(vin + '.vehicleStatus.battery.state-12V', { val: newStatus.vehicleStatus.battery.batState, ack: true });
        }


        //Location
        if(newStatus.vehicleLocation.coord != undefined) {
            await this.setStateAsync(vin + '.vehicleLocation.lat', { val: newStatus.vehicleLocation.coord.lat, ack: true });
            await this.setStateAsync(vin + '.vehicleLocation.lon', { val: newStatus.vehicleLocation.coord.lon, ack: true });
            await this.setStateAsync(vin + '.vehicleLocation.speed', { val: newStatus.vehicleLocation.speed.value, ack: true });
        }

        //Odometer
        await this.setStateAsync(vin + '.odometer.value', { val: newStatus.odometer.value, ack: true });
        await this.setStateAsync(vin + '.odometer.unit', { val: newStatus.odometer.unit, ack: true });
    }

    /**
	 * Functions to create the ioBroker objects
	 */

    async setControlObjects(vin) {
        await this.setObjectNotExistsAsync(vin + '.control.charge', {
            type: 'state',
            common: {
                name: 'Start charging',
                type: 'boolean',
                role: 'button',
                read: true,
                write: true,
            },
            native: {},
        });
        this.subscribeStates(vin + '.control.charge');

        await this.setObjectNotExistsAsync(vin + '.control.charge_stop', {
            type: 'state',
            common: {
                name: 'Stop charging',
                type: 'boolean',
                role: 'button',
                read: true,
                write: true,
            },
            native: {},
        });
        this.subscribeStates(vin + '.control.charge_stop');

        await this.setObjectNotExistsAsync(vin + '.control.lock', {
            type: 'state',
            common: {
                name: 'Lock the vehicle',
                type: 'boolean',
                role: 'button',
                read: true,
                write: true,
            },
            native: {},
        });
        this.subscribeStates(vin + '.control.lock');

        await this.setObjectNotExistsAsync(vin + '.control.unlock', {
            type: 'state',
            common: {
                name: 'Unlock the vehicle',
                type: 'boolean',
                role: 'button',
                read: true,
                write: true,
            },
            native: {},
        });
        this.subscribeStates(vin + '.control.unlock');

        await this.setObjectNotExistsAsync(vin + '.control.start', {
            type: 'state',
            common: {
                name: 'Start clima fpr the vehicle',
                type: 'boolean',
                role: 'button',
                read: true,
                write: true,
            },
            native: {},
        });
        this.subscribeStates(vin + '.control.start');

        await this.setObjectNotExistsAsync(vin + '.control.stop', {
            type: 'state',
            common: {
                name: 'Stop clima for the vehicle',
                type: 'boolean',
                role: 'button',
                read: true,
                write: true,
            },
            native: {},
        });
        this.subscribeStates(vin + '.control.stop');

        await this.setObjectNotExistsAsync(vin + '.control.force_refresh', {
            type: 'state',
            common: {
                name: 'Force refresh vehicle status',
                type: 'boolean',
                role: 'button',
                read: true,
                write: true,
            },
            native: {},
        });
        this.subscribeStates(vin + '.control.force_refresh');

    }


    async setStatusObjects(vin) {

        //Bereicht vehicleStatus
        await this.setObjectNotExistsAsync(vin + '.vehicleStatus.doorLock', {
            type: 'state',
            common: {
                name: 'Vehicle doors locked',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.setObjectNotExistsAsync(vin + '.vehicleStatus.trunkOpen', {
            type: 'state',
            common: {
                name: 'Trunk open',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.setObjectNotExistsAsync(vin + '.vehicleStatus.hoodOpen', {
            type: 'state',
            common: {
                name: 'Hood open',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.setObjectNotExistsAsync(vin + '.vehicleStatus.airCtrlOn', {
            type: 'state',
            common: {
                name: 'Vehicle air control',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.setObjectNotExistsAsync(vin + '.vehicleStatus.dte', {
            type: 'state',
            common: {
                name: 'Vehicle total available range',
                type: 'number',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.setObjectNotExistsAsync(vin + '.vehicleStatus.evModeRange', {
            type: 'state',
            common: {
                name: 'Vehicle total available range for ev',
                type: 'number',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.setObjectNotExistsAsync(vin + '.vehicleStatus.gasModeRange', {
            type: 'state',
            common: {
                name: 'Vehicle total available range for gas',
                type: 'number',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        //Charge
        await this.setObjectNotExistsAsync(vin + '.vehicleStatus.battery.charge_limit_slow', {
            type: 'state',
            common: {
                name: 'Vehicle charge limit for slow charging',
                type: 'number',
                role: 'indicator',
                read: true,
                write: true,
            },
            native: {},
        });
        this.subscribeStates(vin + '.vehicleStatus.battery.charge_limit_slow');

        await this.setObjectNotExistsAsync(vin + '.vehicleStatus.battery.charge_limit_fast', {
            type: 'state',
            common: {
                name: 'Vehicle charge limit for fast charging',
                type: 'number',
                role: 'indicator',
                read: true,
                write: true,
            },
            native: {},
        });
        this.subscribeStates(vin + '.vehicleStatus.battery.charge_limit_fast');

        await this.setObjectNotExistsAsync(vin + '.vehicleStatus.battery.minutes_to_charged', {
            type: 'state',
            common: {
                name: 'Vehicle minutes to charged',
                type: 'number',
                role: 'indicator',
                read: true,
                write: true,
            },
            native: {},
        });

        //Battery
        await this.setObjectNotExistsAsync(vin + '.vehicleStatus.battery.soc', {
            type: 'state',
            common: {
                name: 'Vehicle battery state of charge',
                type: 'number',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.setObjectNotExistsAsync(vin + '.vehicleStatus.battery.charge', {
            type: 'state',
            common: {
                name: 'Vehicle charging',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.setObjectNotExistsAsync(vin + '.vehicleStatus.battery.plugin', {
            type: 'state',
            common: {
                name: 'Charger connected (UNPLUGED = 0, FAST = 1, PORTABLE = 2, STATION = 3)',
                type: 'number',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.setObjectNotExistsAsync(vin + '.vehicleStatus.battery.soc-12V', {
            type: 'state',
            common: {
                name: 'Vehicle 12v battery state of charge',
                type: 'number',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.setObjectNotExistsAsync(vin + '.vehicleStatus.battery.state-12V', {
            type: 'state',
            common: {
                name: 'Vehicle 12v battery State',
                type: 'number',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        //Bereich vehicleLocation
        await this.setObjectNotExistsAsync(vin + '.vehicleLocation.lat', {
            type: 'state',
            common: {
                name: 'Vehicle position latitude',
                type: 'number',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.setObjectNotExistsAsync(vin + '.vehicleLocation.lon', {
            type: 'state',
            common: {
                name: 'Vehicle position longitude',
                type: 'number',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.setObjectNotExistsAsync(vin + '.vehicleLocation.speed', {
            type: 'state',
            common: {
                name: 'Vehicle speed',
                type: 'number',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        //Bereich Odometer
        await this.setObjectNotExistsAsync(vin + '.odometer.value', {
            type: 'state',
            common: {
                name: 'Odometer value',
                type: 'number',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.setObjectNotExistsAsync(vin + '.odometer.unit', {
            type: 'state',
            common: {
                name: 'Odometer unit',
                type: 'number',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });
    }
    async cleanObjects() {

            const controlState = await this.getObjectAsync ("control.charge");

            if (controlState) {
              
                await this.delObjectAsync("control", { recursive: true });
                await this.delObjectAsync("odometer", { recursive: true });
                await this.delObjectAsync("vehicleLocation", { recursive: true });
                await this.delObjectAsync("vehicleStatus", { recursive: true });
      
            }
    }
    
    getCircularReplacer = () => {
        const seen = new WeakSet;
        return (key, value) => {
          if (typeof value === "object" && value !== null) {
            if (seen.has(value)) {
              return;
            }
            seen.add(value);
          }
          return value;
        };
      };
}

if (require.main !== module) {
    // Export the constructor in compact mode
    /**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
    module.exports = (options) => new Bluelink(options);
} else {
    // otherwise start the instance directly
    new Bluelink();
}
