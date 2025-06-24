import fs from "fs";
import path from "path";
import OpenAI from "openai";
import Pushover from "pushover-notifications";
import express from "express"

const INTERVAL_SECONDS = 60 * 10 // minutes
const COOLDOWN_SECONDS = 60 * 60; // minutes
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

const log = (...args) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}]`, ...args);
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const cliImagePath = process.argv[2];
const imagePath = path.resolve(cliImagePath || "temp/snapshot.jpg");
const run = async () => {
    while (true) {
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
                message: message + "\n" + SNAPSHOT_URL,
                sound: "pushover",
                priority: 0,
            }, (err, res) => {
                if (err) error("❗ Pushover 오류:", err);
                else log("📲 Pushover 알림 전송됨");
            });
            setLastPushTime();
        }


        log("⏱️ 다음 실행까지 대기 중...");
        await sleep(INTERVAL_SECONDS * 1000); // 10분 대기
    }
};

// start server
const app = express();
const port = process.env.PORT || 47901;

app.use(express.static('temp'));

app.listen(port, () => {
    log(`Catseye started on port: ${port}`);
});

run().catch(console.error);