import { MessageType, Message } from "../src/Message";
import * as ws from "ws";
import express from "express";
import { Game } from "../src/game";
import { Network } from "../src/Network";
import { assert } from "console";

const wss = new ws.Server({ port: 3001 });
let myId = 0;
const sockets: { id: number, socket: ws }[] = [];

const messageQueue: Message[] = [];
const network = Network.create(0, {
    send: (m: Message) => {
        assert("no one sends");
    },
    recv: (): Message | undefined => {
        return  messageQueue.shift();
    }
});

const game = Game.init(2, -1, network);
game.render = false;

let nextTime = 0;
const run = () => { 
    if (nextTime === 0) { nextTime = Date.now();}
    Game.runFrame(game);

    const now = Date.now();
    nextTime += 60;
    setTimeout(run, nextTime - now);
};
run();

wss.on('connection', (socket: ws, request) => {
    const id = ++myId;
    socket.on('message', (data) => {
        const msg: Message = JSON.parse(data.toString());
        if (msg.type === MessageType.FrameRequest) {
            // 지금은 이것을 join 처럼 사용하자. 나중에 고친다
            sockets.push({ id, socket });
            console.log("원격 접속요청을 받았습니다 : " + request.connection.remoteAddress + " => " + id, "frame: " + game.currentFrame);
            socket.send(JSON.stringify({ type: MessageType.FrameReply, from: -1, body: { 
                frame: game.currentFrame ,
                state: game.state
            } }));
        } else {
            // 다른 사용자에게 전파한다
            messageQueue.push(msg);
            sockets.forEach(s => {
                if (s.id !== id) {
                    s.socket.send(data);
                }
            })
        }
    });

    socket.on('error', (error) => {
        console.error(error);
    });

    socket.on('close', () => {
        const index = sockets.findIndex(s => s.id === id);
        if (index >= 0) {
            sockets.splice(index, 1);
            console.log("접속 해제되었습니다 : " + id);
        }
    });
});


const app = express();
app.get('create', (req, res) => {

});
app.get('join', (req, res) => {

});