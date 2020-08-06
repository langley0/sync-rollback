import express from "express";

const app = express();
app.use(express.json());

let packets: any = {};

app.get("/reset", (req, res) => {
    packets = {};
    console.log("reset");
    res.sendStatus(200);
});

app.post("/", (req, res) => {

    const message = req.body;
    
    // 자신을 제외한 모든 플레이어의 패킷에 추가를 한다
    Object.keys(packets).forEach(key => {
        if (key !== message.index) {
            packets[key].push(message);
        }
    })

    // 자신에게 쌓여있던 패킷을 모두 돌려준다
    packets[message.index] = packets[message.index] || [];
    res.json(packets[message.index].splice(0, packets[message.index].length))
});

app.listen(8080, ()=> {
    console.log("started");
})