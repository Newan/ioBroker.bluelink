const axios = require('axios').default;
const positionUrlConst = 'https://maps.google.com/maps?z=15&t=m&q=loc:';

/**
 * Tests whether the given variable is a real object and not an Array
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
 * @param {any} it The variable to test
 * @returns {it is any[]}
 */
function isArray(it) {
    if (typeof Array.isArray === 'function') return Array.isArray(it);
    return Object.prototype.toString.call(it) === '[object Array]';
}

/**
 * Translates text to the target language. Automatically chooses the right translation API.
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
    } else {
        return translateGoogle(text, targetLang);
    }
}


async function getResolveAddress(latitude,longitude) {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse.php?format=json&lat=${latitude}&lon=${longitude}&zoom=18`;
        const response = await axios({url, timeout: 5000});

        if (response.data) {
            const addrDetails = response.data.address;
            const addr = ([addrDetails.road ? addrDetails.road : null,addrDetails.house_number ? [' ',addrDetails.house_number,''].join('') : null,addrDetails.road ? ', ' : null,addrDetails.postcode ? String(addrDetails.postcode) + ', ' : null,addrDetails.town ? String(addrDetails.town) + ', ' : null,addrDetails.village ? [' (',addrDetails.village,')'].join('') : null,addrDetails.county ? '' + String(addrDetails.county) : null, addrDetails.city ? '' + String(addrDetails.city) : null,addrDetails.state ? ', ' + String(addrDetails.state) : null,addrDetails.country ? ', ' + String(addrDetails.country) : null,!addrDetails.country ? 'not found' : null].join(''));
            return addr;
        }
        return ''
    } catch (err) {
        return '';
    }
}
/**
 * Translates text with Yandex API
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
        throw new Error('Invalid response for translate request');
    } catch (e) {
        throw new Error(`Could not translate to "${targetLang}": ${e}`);
    }
}

/**
 * Translates text with Google API
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
        throw new Error('Invalid response for translate request');
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

async function cleanObjects(vin, adaptr) {
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

async function cleanNotAvailableObjects(adaptr,vin) {
    const vehicleStatus = await adaptr.getObjectAsync(`${vin}.vehicleStatus.airTemp`);
    if (vehicleStatus) {
        await adaptr.delObjectAsync(`${vin}.vehicleStatus`, { recursive: true });
    }
}
async function setLocation(adaptr, vin, latitude, longitude, speed) {
    //Location
    const positionUrl = `${positionUrlConst}${latitude}+${longitude}`;

    await adaptr.setStateAsync(vin + '.vehicleLocation.lat', {val: latitude, ack: true});
    await adaptr.setStateAsync(vin + '.vehicleLocation.lon', {val: longitude, ack: true});

    if (speed > 250) {
        speed = 0;
    }

    await adaptr.setStateAsync(vin + '.vehicleLocation.speed', {val: speed, ack: true});
    await adaptr.setStateAsync(vin + '.vehicleLocation.position_url', {val: positionUrl, ack: true});

    const addressText = await getResolveAddress(latitude, longitude);

    await adaptr.setStateAsync(vin + '.vehicleLocation.position_text', {val: addressText, ack: true});
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
