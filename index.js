import fs from "fs";
import path from "path";
import OpenAI from "openai";
import Pushover from "pushover-notifications";
import express from "express"


const log = (...args) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}]`, ...args);
};

var INTERVAL_SECONDS = 60 * 10 // minutes
if (process.env.INTERVAL_SECONDS) {
    const parsed = parseInt(process.env.INTERVAL_SECONDS, 10);
    if (!isNaN(parsed) && parsed > 0) {
        INTERVAL_SECONDS = parsed;
    }
}

var COOLDOWN_SECONDS = 60 * 60; // minutes
if (process.env.COOLDOWN_SECONDS) {
    const parsed = parseInt(process.env.COOLDOWN_SECONDS, 10);
    if (!isNaN(parsed) && parsed > 0) {
        COOLDOWN_SECONDS = parsed;
    }
}

log("Push cooldown", COOLDOWN_SECONDS)
log("Check interval", INTERVAL_SECONDS)

const SNAPSHOT_URL = process.env.SNAPSHOT_URL;
var lastPushTime = 0;

function shouldPushNow() {
    const now = Math.floor(Date.now() / 1000);
    return (now - lastPushTime) > COOLDOWN_SECONDS;
}

function setLastPushTime() {
    lastPushTime = Math.floor(Date.now() / 1000);
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const push = new Pushover({
    user: process.env.PUSHOVER_USER,
    token: process.env.PUSHOVER_TOKEN,
});

function generateAlphaId(length = 8) {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let id = '';
    for (let i = 0; i < length; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
}

function generateShortID() {
    const timestamp = Date.now().toString(36);
    const alphaId = generateAlphaId(3);
    const shortId = `${timestamp}_${alphaId}`;
    return shortId;
}

function purgeSnapshots() {
    const targetDir = './temp';
    const now = Date.now();
    const maxAgeMs = 3 * 24 * 60 * 60 * 1000;

    fs.readdirSync(targetDir).forEach(file => {
        if (path.extname(file).toLowerCase() !== '.jpg') return;

        const fullPath = path.join(targetDir, file);
        try {
            const stats = fs.statSync(fullPath);
            const age = now - stats.mtimeMs;
            if (age > maxAgeMs) {
                fs.unlinkSync(fullPath);
                log(`🗑️ deleted: ${file}`);
            }
        } catch (err) {
            log(`⚠️ error (${file}):`, err.message);
        }
    });
}


const cliImagePath = process.argv[2];
const imagePath = path.resolve(cliImagePath || "temp/snapshot.jpg");
const checkCat = async function () {
    var imageData = fs.readFileSync(imagePath, { encoding: "base64" });
    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini", // 또는 "gpt-4o"
        messages: [
            {
                role: "user",
                content: [
                    { type: "text", text: 'resp in json (without codeblock) - {"cat_detected": true/false, "is_adult": true/false, "tabby_cat": true/false, "white_spotted_cat": true/false, "desc": "short desc of env"}' },
                    {
                        type: "image_url",
                        image_url: {
                            url: `data:image/jpeg;base64,${imageData}`,
                            detail: "low" // 비용 아끼려면 low
                        }
                    }
                ],
            },
        ],
    });

    var resJson = JSON.parse(completion.choices[0].message.content);
    log("resp:", resJson);

    if (resJson.cat_detected && shouldPushNow()) {
        // save snapshot
        var newName = generateShortID() + ".jpg";
        fs.writeFileSync("temp/" + newName, Buffer.from(imageData, "base64"));
        purgeSnapshots();

        var message = "";
        if (resJson.tabby_cat && resJson.is_adult) {
            message = "아홍이가 나타났어요"
        } else if (resJson.white_spotted_cat && resJson.is_adult) {
            message = "외팔이가 나타났어요"
        } else {
            message = "모르는 고양이가 나타났어요"
        }
        push.send({
            title: "🐾 고양이 감지됨!",
            message: message + "\n" + SNAPSHOT_URL + "/" + newName,
            sound: "pushover",
            priority: 0,
        }, (err, res) => {
            if (err) error("❗ Pushover Error:", err);
            else log("📲 Pushover Sent");
        });
        setLastPushTime();
    }
    log("⏱️ Awaiting next check...");
};

// start server
const app = express();
const port = process.env.PORT || 47901;

app.use(express.static('temp'));

app.listen(port, () => {
    log(`Catseye started on port: ${port}`);
});

setInterval(function () {
    checkCat();
}, INTERVAL_SECONDS * 1000);

checkCat();