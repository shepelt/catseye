import fs from "fs";
import path from "path";
import OpenAI from "openai";
import Pushover from "pushover-notifications";



const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const push = new Pushover({
    user: process.env.PUSHOVER_USER,
    token: process.env.PUSHOVER_TOKEN,
});

// 커맨드라인 인자에서 이미지 경로 가져오기
const cliImagePath = process.argv[2];
const imagePath = path.resolve(cliImagePath || "temp/snapshot.jpg");
const run = async () => {
    var imageData = fs.readFileSync(imagePath, { encoding: "base64" });

    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini", // 또는 "gpt-4o"
        messages: [
            {
                role: "user",
                content: [
                    { type: "text", text: 'resp in json (without codeblock) - {"cat_detected": true/false, "tabby_cat": true/false, "white_spotted_cat": true/false, "desc": "short desc of env"}' },
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
    console.log("resp:", resJson);

    // send sample push
    if (resJson.cat_detected) {
        var message = "";
        if (resJson.tabby_cat) {
            message = "아홍이가 나타났어요"
        } else if (resJson.white_spotted_cat) {
            message = "외팔이가 나타났어요"
        } else {
            message = "모르는 고양이가 나타났어요"
        }
        push.send({
            title: "🐾 고양이 감지됨!",
            message: message,
            sound: "pushover",
            priority: 0,
        }, (err, res) => {
            if (err) console.error("❗ Pushover 오류:", err);
            else console.log("📲 Pushover 알림 전송됨");
        });
    }
};

run().catch(console.error);