const axios = require('axios').default;
const positionUrlConst = 'https://maps.google.com/maps?z=15&t=m&q=loc:';

/**
 * Tests whether the given variable is a real object and not an Array
 *
 * @param {any} it The variable to test
 * @returns {it is Record<string, any>}
 */
function isObject(it) {
    // This is necessary because:
    // typeof null === 'object'
    // typeof [] === 'object'
    // [] instanceof Object === true
    return Object.prototype.toString.call(it) === '[object Object]';
}

/**
 * Tests whether the given variable is really an Array
 *
 * @param {any} it The variable to test
 * @returns {it is any[]}
 */
function isArray(it) {
    if (typeof Array.isArray === 'function') {
        return Array.isArray(it);
    }
    return Object.prototype.toString.call(it) === '[object Array]';
}

/**
 * Translates text to the target language. Automatically chooses the right translation API.
 *
 * @param {string} text The text to translate
 * @param {string} targetLang The target languate
 * @param {string} [yandexApiKey] The yandex API key. You can create one for free at https://translate.yandex.com/developers
 * @returns {Promise<string>}
 */
async function translateText(text, targetLang, yandexApiKey) {
    if (targetLang === 'en') {
        return text;
    } else if (!text) {
        return '';
    }
    if (yandexApiKey) {
        return translateYandex(text, targetLang, yandexApiKey);
    }
    return translateGoogle(text, targetLang);
}


/**
 * Resolves geographic coordinates to a human-readable address.
 *
 * @param {number} latitude The latitude of the location
 * @param {number} longitude The longitude of the location
 * @returns {Promise<string>} The resolved address or 'not found'
 */
async function getResolveAddress(latitude, longitude) {
    try {
        const res = await axios.get('https://photon.komoot.io/reverse', {
            params: {
                lat: latitude,
                lon: longitude
            },
            timeout: 5000
        });

        const addrDetails = res.data?.features?.[0]?.properties;

        if (!addrDetails || !addrDetails.country) {
            return 'not found';
        }

        return [
            `${addrDetails.street || ''} ${addrDetails.housenumber || ''}`.trim(),
            `${addrDetails.postcode || ''} ${addrDetails.city || ''}`.trim(),
            addrDetails.locality ? `(${addrDetails.locality})` : null,
            addrDetails.state,
            addrDetails.country
        ]
            .filter(Boolean)
            .join(', ');


    } catch (err) {
        return 'not found';
    }
}

/**
 * Translates text with Yandex API
 *
 * @param {string} text The text to translate
 * @param {string} targetLang The target languate
 * @param {string} apiKey The yandex API key. You can create one for free at https://translate.yandex.com/developers
 * @returns {Promise<string>}
 */
async function translateYandex(text, targetLang, apiKey) {
    if (targetLang === 'zh-cn') {
        targetLang = 'zh';
    }
    try {
        const url = `https://translate.yandex.net/api/v1.5/tr.json/translate?key=${apiKey}&text=${encodeURIComponent(text)}&lang=en-${targetLang}`;
        const response = await axios({url, timeout: 15000});
        if (response.data && response.data.text && isArray(response.data.text)) {
            return response.data.text[0];
        }
        return Promise.reject(new Error('Invalid response for translate request'));
    } catch (e) {
        throw new Error(`Could not translate to "${targetLang}": ${e}`);
    }
}

/**
 * Translates text with Google API
 *
 * @param {string} text The text to translate
 * @param {string} targetLang The target languate
 * @returns {Promise<string>}
 */
async function translateGoogle(text, targetLang) {
    try {
        const url = `http://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}&ie=UTF-8&oe=UTF-8`;
        const response = await axios({url, timeout: 15000});
        if (isArray(response.data)) {
            // we got a valid response
            return response.data[0][0][0];
        }
        return Promise.reject(new Error('Invalid response for translate request'));
    } catch (e) {
        if (e.response && e.response.status === 429) {
            throw new Error(
                `Could not translate to "${targetLang}": Rate-limited by Google Translate`
            );
        } else {
            throw new Error(`Could not translate to "${targetLang}": ${e}`);
        }
    }
}

/**
 * Removes outdated/legacy ioBroker objects for a given vehicle.
 *
 * @param {object} adaptr The ioBroker adapter instance
 * @param {string} vin The vehicle identification number (VIN)
 * @returns {Promise<void>}
 */
async function cleanObjects(adaptr, vin) {
    const controlState = await adaptr.getObjectAsync(`${vin}.control.charge`);
    if (controlState) {
        await adaptr.delObjectAsync(`${vin}.control`, {recursive: true});
    }

    const odometer = await adaptr.getObjectAsync(`${vin}.odometer`);
    if (odometer) {
        await adaptr.delObjectAsync(`${vin}.odometer`, {recursive: true});
    }

    const vehicleLocation = await adaptr.getObjectAsync(`${vin}.vehicleLocation.lat`);
    if (vehicleLocation) {
        await adaptr.delObjectAsync(`${vin}.vehicleLocation`, { recursive: true });
    }

    const vehicleStatus = await adaptr.getObjectAsync(`${vin}.vehicleStatus`);
    if (vehicleStatus) {
        await adaptr.delObjectAsync(`${vin}.vehicleStatus`, { recursive: true });
    }
}

/**
 * Removes ioBroker objects that are no longer available for a given vehicle.
 *
 * @param {object} adaptr The ioBroker adapter instance
 * @param {string} vin The vehicle identification number (VIN)
 * @returns {Promise<void>}
 */
async function cleanNotAvailableObjects(adaptr,vin) {
    const vehicleStatus = await adaptr.getObjectAsync(`${vin}.vehicleStatus.airTemp`);
    if (vehicleStatus) {
        await adaptr.delObjectAsync(`${vin}.vehicleStatus`, { recursive: true });
    }
}
/**
 * Sets the vehicle location states in ioBroker.
 *
 * @param {object} adaptr The ioBroker adapter instance
 * @param {string} vin The vehicle identification number (VIN)
 * @param {number} latitude The latitude of the vehicle location
 * @param {number} longitude The longitude of the vehicle location
 * @param {number} speed The current speed of the vehicle in km/h
 * @returns {Promise<void>}
 */
async function setLocation(adaptr, vin, latitude, longitude, speed) {
    //Location
    const positionUrl = `${positionUrlConst}${latitude}+${longitude}`;

    await adaptr.setStateAsync(`${vin  }.vehicleLocation.lat`, {val: latitude, ack: true});
    await adaptr.setStateAsync(`${vin  }.vehicleLocation.lon`, {val: longitude, ack: true});

    if (speed > 250) {
        speed = 0;
    }

    await adaptr.setStateAsync(`${vin  }.vehicleLocation.speed`, {val: speed, ack: true});
    await adaptr.setStateAsync(`${vin  }.vehicleLocation.position_url`, {val: positionUrl, ack: true});

    const addressText = await getResolveAddress(latitude, longitude);

    await adaptr.setStateAsync(`${vin  }.vehicleLocation.position_text`, {val: addressText, ack: true});
}

module.exports = {
    isArray,
    isObject,
    translateText,
    getResolveAddress,
    cleanObjects,
    cleanNotAvailableObjects,
    setLocation

};
