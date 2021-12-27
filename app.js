const puppeteer = require('puppeteer');
const fs = require('fs');
const request = require('request-promise');
var path = require('path')

let browser;
let page;

const dir = './images';

run().catch(err => console.error(err));

async function run() {

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }

    await init();

    await page.goto('https://hu.pinterest.com/', {
        waitUntil: 'networkidle2',
        timeout: 30000
    });

    const loginButton = await page.waitForSelector('div[data-test-id="login-button"],div[data-test-id="simple-login-button"] > button');
    await loginButton.click();

    const profileIcon = await page.waitForSelector('div[data-test-id="header-profile"]', { timeout: 0 });
    await profileIcon.click();

    while (true) {
        try {
            await page.waitForSelector('div.Collection-Item', { timeout: 5000 });
            break;
        } catch (err) {
            console.log(err);
            page.reload({
                waitUntil: 'networkidle2',
                timeout: 30000
            });
        }
    }

    await scrollToEnd();

    const items = await page.$$('div.Collection-Item');
    console.log('items', items.length);

    const pinIds = [];
    for (let index = 0; index < items.length; index++) {
        const item = items[index];
        const pinId = await item.$eval('div[data-test-id="pin"]', e => e.getAttribute('data-test-pin-id'));
        pinIds.push(pinId);
    }

    console.log(pinIds);

    for (let index = 0; index < pinIds.length; index++) {
        const pinId = pinIds[index];
        try {
            await downloadPinImage(pinId);
        } catch (err) {
            console.log('Could not save pin:', err);
        }
    }

    await page.removeAllListeners('request');
    await page.setRequestInterception(false);

    await browser.close();
}

async function downloadPinImage(pinId) {
    const pinUrl = `https://hu.pinterest.com/pin/${pinId}/`

    await page.goto(pinUrl, {waitUntil: 'domcontentloaded'});

    await page.waitForSelector('div[data-test-id="pin-action-bar"]')
    await page.click('div[data-test-id="pin-action-bar"]');

    const url = await pressDownloadAndInterceptUrl();

    const filename = `${dir}/${pinId}${path.extname(url)}`;
    await download(url, filename);

}

async function pressDownloadAndInterceptUrl() {
    let resolveUrl;
    const interceptedUrl = new Promise((resolve) => { resolveUrl = resolve });

    const handler = request => {
        try {
            // console.log(request.url());
            if (request.url().startsWith('https://i.pinimg.com/originals/')) {
                resolveUrl(request.url());
                request.abort();
            } else {
                request.continue();
            }
        } catch (err) { }
    };

    await page.setRequestInterception(true);
    await page.on('request', handler);

    const downloadOption = await page.waitForSelector('div[data-test-id="pin-action-dropdown-download"]');
    await downloadOption.click();

    const url = await interceptedUrl;
    await page.removeAllListeners('request');
    await page.setRequestInterception(false);

    return url;

}

async function init() {
    let launchProperties = {
        executablePath: './chromium/chrome.exe',
        headless: false,
        defaultViewport: null,
        // headless: true,
        args: ['--no-sandbox',
            '--disable-setuid-sandbox',
            '--start-maximized',
            // debug logging
            // '--enable-logging', '--v=1'
        ],
        // set 'devtools: true' => if you want to be able to launch the dev tools console too
        //  just need to add 'await page.evaluate(() => {debugger})' to the step 
        //  you want to stop at
        // dumpio: true,
        // devtools: true
    };
    browser = await puppeteer.launch(launchProperties);

    page = await browser.newPage();


    page.off()
    // await page.setViewport({ width: 1366, height: 768});
    await page.setDefaultTimeout(15000);

    //add in accept language header - this is required when running in headless mode 
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.8,zh-TW;q=0.6'
    });
}

async function scrollToEnd() {
    let lastHeight = await page.evaluate('document.body.scrollHeight');
    while (true) {
        await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
        await page.waitForTimeout(2000); // sleep a bit
        let newHeight = await page.evaluate('document.body.scrollHeight');
        if (newHeight === lastHeight) {
            break;
        }
        lastHeight = newHeight;
    }
}

async function download(uri, filename) {
    await request(uri).pipe(fs.createWriteStream(filename));
}
