'use strict';

const utils = require('@iobroker/adapter-core');
const kuvork = require('kuvork'); 

const adapterIntervals = {}; //halten von allen Intervallen
var request_count = 100; //max api request per Day 
var password = ''; 
var pin = ''; 
var client; 
var vehicle;

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
	}

	//Start Adapter
	async onReady() {
		//first check account settings
		if (this.config.request < 1) {
			this.log.warn("Request is under 1 -> got to default 100")
		} else {
			request_count = this.config.request;
		}
	   
		if (this.config.vin == '' ) {
			this.log.error("No Vin found");
		} else if (this.config.username == '' ) {
			this.log.error("No Username set");
		} else {
			//Not crypted are set, st crypted settings
			this.getForeignObject('system.config', (err, obj) => {

            	if ((obj && obj.native && obj.native.secret) || this.config.client_secret == '') {

					password = decrypt(obj.native.secret, this.config.client_secret);
					this.log.info("Password decrypted");
					this.log.debug("Password is:" + password);

					pin = decrypt(obj.native.secret, this.config.client_secret_pin);
					this.log.info("Pin decrypted");
					this.log.debug("Pin is:" + pin);

					//Start logic with login
					this.login()
				}
			});
		}
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			clearTimeout(adapterIntervals.readAllStates);
			this.log.info('Adapter bluelink cleaned up everything...');
			callback();
		} catch (e) {
			callback();
		}
	}

	async onStateChange(id, state) {
		this.log.debug(state);
		this.log.debug(id);
		if (state) {
			
			let tmpControl = id.split('.');
			switch (tmpControl[3]) {
				case 'lock':
					this.log.info("Starting lock for vehicle");
					var response = await vehicle.lock();
					this.log.info(response)
					break;
				case 'unlock':
					this.log.info("Starting unlock for vehicle");
					var response = await vehicle.unlock();
					this.log.info(response)
					break;                
				case 'start':
					this.log.info("Starting clima for vehicle");
					var response = await vehicle.start({
						airCtrl: false,
						igniOnDuration: 10,
						airTempvalue: 70,
						defrost: false,
						heating1: false,
					});
					this.log.debug(JSON.stringify(response))
					break;                
				case 'stop':
					this.log.info("Stop clima for vehicle");
					var response = await vehicle.stop();
					this.log.debug(JSON.stringify(response));
					break;    
				case 'force_refresh':
					this.log.info("Forcing refresh");
					//Force refresh for new states
					this.readStatus(true)
					break;	
				default:
					this.log.error("No command for Control found for: " + id)				
			}			
		}
	}

	/**
	 * Funktion to login in bluelink / UOV
	 */
	login() {
		this.log.info("Login to api")

		let tmpConfig = {
			username: this.config.username,
			password: password,
			pin: pin,
			brand: this.config.brand,
			vin: this.config.vin,
			region: "EU" //set over GUI next time
		}

		this.log.debug(JSON.stringify(tmpConfig));
		client = new kuvork(tmpConfig);

		client.on('ready', async (vehicles) => {
			// wir haben eine Verbindung und haben Autos
			this.log.info("Vehicles found");

			/*vehicles.forEach(car => {
				this.log.debug(JSON.stringify(car));
			});*/

			vehicle = vehicles[0]; //is only one, because vin is in connection set

			//set Objects for the vehicle
			await this.setControlObjects()
			await this.setStatusObjects()

			//start time cycle
			await this.readStatus();
		});

		client.on('error', async (err) => {
			// something went wrong with login
			this.log.debug("Error on Api login");
			this.log.error(err);
		});
	}

	//read new sates from vehicle
	async readStatus(force=false) {
		this.log.info("Read new status from api");
		//read new verhicle status
		let newStatus = await vehicle.fullStatus({
			refresh: true,
			parsed: true
		  });

		//set all values
		this.log.info("Set new status");
		await this.setNewStatus(newStatus)

		//set ne cycle
		if (force) {
			clearTimeout(adapterIntervals.readAllStates);
		}
		adapterIntervals.readAllStates = setTimeout(this.readStatus.bind(this), ((24*60) / request_count) * 60000);
	}

	//Set new values to ioBroker
	async setNewStatus(newStatus) {
		await this.setStateAsync('vehicleStatus.doorLock',newStatus.vehicleStatus.doorLock);
		await this.setStateAsync('vehicleStatus.trunkOpen',newStatus.vehicleStatus.trunkOpen);
		await this.setStateAsync('vehicleStatus.hoodOpen',newStatus.vehicleStatus.hoodOpen);
		await this.setStateAsync('vehicleStatus.airCtrlOn',newStatus.vehicleStatus.airCtrlOn);
		
		// Battery
		await this.setStateAsync('vehicleStatus.dte',newStatus.vehicleStatus.evStatus.drvDistance[0].rangeByFuel.totalAvailableRange.value);
		await this.setStateAsync('vehicleStatus.battery.soc',newStatus.vehicleStatus.evStatus.batteryStatus);
		await this.setStateAsync('vehicleStatus.battery.charge',newStatus.vehicleStatus.evStatus.batteryCharge);
		await this.setStateAsync('vehicleStatus.battery.plugin',newStatus.vehicleStatus.evStatus.batteryPlugin);
		await this.setStateAsync('vehicleStatus.battery.soc-12V',newStatus.vehicleStatus.battery.batSoc);
		await this.setStateAsync('vehicleStatus.battery.state-12V',newStatus.vehicleStatus.battery.batState);
		

		//Location
		await this.setStateAsync('vehicleLocation.lat',newStatus.vehicleLocation.coord.lat);
		await this.setStateAsync('vehicleLocation.lon',newStatus.vehicleLocation.coord.lon);
		await this.setStateAsync('vehicleLocation.speed',newStatus.vehicleLocation.speed.value);

		//Odometer
		await this.setStateAsync('odometer.value', newStatus.odometer.value);
		await this.setStateAsync('odometer.unit', newStatus.odometer.unit);   
	}
	
	/**
	 * Functions to create the ioBroker objects
	 */

	async setControlObjects() {

		await this.setObjectNotExistsAsync('control.lock', {
			type: 'state',
			common: {
				name: "Lock the vehicle",
				type: "boolean",
				role: "button",
				read: true,
				write: true,
			},
			native: {},
		});
		this.subscribeStates('control.lock');

		await this.setObjectNotExistsAsync('control.unlock', {
			type: 'state',
			common: {
				name: "Unlock the vehicle",
				type: "boolean",
				role: "button",
				read: true,
				write: true,
			},
			native: {},
		});
		this.subscribeStates('control.unlock');
	
		await this.setObjectNotExistsAsync('control.start', {
			type: 'state',
			common: {
				name: "Start clima fpr the vehicle",
				type: "boolean",
				role: "button",
				read: true,
				write: true,
			},
			native: {},
		});
		this.subscribeStates('control.start');

		await this.setObjectNotExistsAsync('control.stop', {
			type: 'state',
			common: {
				name: "Stop clima for the vehicle",
				type: "boolean",
				role: "button",
				read: true,
				write: true,
			},
			native: {},
		});
		this.subscribeStates('control.stop');

		await this.setObjectNotExistsAsync('control.force_refresh', {
			type: 'state',
			common: {
				name: "Force refresh vehicle status",
				type: "boolean",
				role: "button",
				read: true,
				write: true,
			},
			native: {},
		});
		this.subscribeStates('control.force_refresh');

	}
	

	async setStatusObjects() {	

		//Bereicht vehicleStatus
		await this.setObjectNotExistsAsync('vehicleStatus.doorLock', {
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

		await this.setObjectNotExistsAsync('vehicleStatus.trunkOpen', {
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

		await this.setObjectNotExistsAsync('vehicleStatus.hoodOpen', {
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

		await this.setObjectNotExistsAsync('vehicleStatus.airCtrlOn', {
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

		await this.setObjectNotExistsAsync('vehicleStatus.dte', {
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

		//Battery
		await this.setObjectNotExistsAsync('vehicleStatus.battery.soc', {
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

		await this.setObjectNotExistsAsync('vehicleStatus.battery.charge', {
			type: 'state',
			common: {
				name: 'Vehicle bettery State',
				type: 'boolean',
				role: 'indicator',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync('vehicleStatus.battery.plugin', {
			type: 'state',
			common: {
				name: 'Vehicle bettery State',
				type: 'boolean',
				role: 'indicator',
				read: true,
				write: false,
			},
			native: {},
		});
		
		await this.setObjectNotExistsAsync('vehicleStatus.battery.soc-12V', {
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

		await this.setObjectNotExistsAsync('vehicleStatus.battery.state-12V', {
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
		await this.setObjectNotExistsAsync('vehicleLocation.lat', {
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

		await this.setObjectNotExistsAsync('vehicleLocation.lon', {
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

		await this.setObjectNotExistsAsync('vehicleLocation.speed', {
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
		await this.setObjectNotExistsAsync('odometer.value', {
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
	
		await this.setObjectNotExistsAsync('odometer.unit', {
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
}

function decrypt(key, value) {
    let result = '';
    for (let i = 0; i < value.length; ++i) {
        result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
    }
    return result;
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