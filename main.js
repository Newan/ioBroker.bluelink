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

		this.log.debug(JSON.stringify(
			{
				username: this.config.username,
				password: password,
				pin: pin,
				brand: "K",
				vin: this.config.vin,
				region: "EU" //set over GUI next time
			}
		));
		client = new kuvork({
			username: this.config.username,
			password: password,
			pin: pin,
			brand: "K", //bug on set over GUI next time
			vin: this.config.vin,
			region: "EU" //set over GUI next time
		});

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
	async readStatus(){
		this.log.info("Read new status from api");
		//read new verhicle status
		let newStatus = await vehicle.status({
			refresh: true,
			parsed: true
		  });

		//read odometer
		let odometer = await vehicle.odometer();

		//set all values
		this.log.info("Set new status");
		await this.setNewStatus(newStatus, odometer)

		//set ne cycle
		adapterIntervals.readAllStates = setTimeout(this.readStatus.bind(this), ((24*60) / request_count) * 60000);
	}

	//Set new values to ioBroker
	async setNewStatus(newStatus, odometer) {
		await this.setStateAsync('chassis.locked',newStatus.chassis.locked);
   
		await this.setStateAsync('odometer.value', odometer.value);
		await this.setStateAsync('odometer.unit', odometer.unit);   
	}
	
	/**
	 * Functions to create the ioBroker objects
	 */

	async setControlObjects() {

		await this.setObjectNotExistsAsync('control.lock', {
			type: 'state',
			common: {
				name: "Lock the car",
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
				name: "Lock the car",
				type: "boolean",
				role: "button",
				read: true,
				write: true,
			},
			native: {},
		});
		this.subscribeStates('control.unlock');
	}
	

	async setStatusObjects() {	
		await this.setObjectNotExistsAsync('chassis.locked', {
			type: 'state',
			common: {
				name: 'Car locked',
				type: 'boolean',
				role: 'indicator',
				read: true,
				write: false,
			},
			native: {},
		});
	
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