import React from "react";
import ReactDOM from "react-dom";
import { Game } from "./game";
import { Network } from "./Network";
import { MessageType, Message } from "./Message";

const styles: { [key: string]: React.CSSProperties } = {
    container: {
        width: "100%",
        height: "100%",
    },
    buttons: {
        width: 120,
        display: "flex",
        margin: "auto",
        flexDirection: "column",
    },
    button: {
        width: "100%",
        height: 32,
        marginBottom: 16,
    },
    canvasContainer: {
        width: "100%",
        display: "felx",
    },
    canvas: {
        margin: "auto",
        width: 600,
        height: 400,
    }
}

const playerName = localStorage.getItem("player");
let started = false;


const Lobby = () => {
    return (
    <div style={styles.container}>
        { started ? (
        <div style={styles.canvasContainer}>
            <canvas style={styles.canvas} id="canvas" width={600} height={400}></canvas>
            <div id="info"></div>
            <div id="progressbar"></div>
        </div> 
        ) : (
        <div style={styles.buttons}>
            <button style={styles.button} onClick={() => start(0) }>Create Room</button>
            <button style={styles.button} onClick={() => start(1) }>Join Room</button>
        </div>
        )}
    </div>);
};

ReactDOM.render(
    <Lobby/>,
    document.getElementById("root")
);


function start(index: number) {
    const ws = new WebSocket("ws://localhost:8080");
    ws.onopen = () => {
        // 처음 프레임싱크를 한다
        const syncMsg = { type: MessageType.FrameRequest, from: -1 };
        ws.send(JSON.stringify(syncMsg));

        ws.onmessage = (ev) => {
            const reply: Message = JSON.parse(ev.data);
            if (reply.type === MessageType.FrameReply) {
                const messageQueue: Message[] = [];
                ws.onmessage = (event) => {
                    const msg: Message = JSON.parse(event.data);
                    messageQueue.push(msg);
                }
                const network = Network.create(0, {
                    send: (m: Message) => {
                        ws.send(JSON.stringify(m));
                    },
                    recv: (): Message | undefined => {
                        return  messageQueue.shift();
                    }
                });
        
                started = true;
                ReactDOM.render(
                    <Lobby/>,
                    document.getElementById("root")
                );

                // 연결을 한다
                const currentFrame = reply.body.frame;
                const game = Game.init(2, index, network);
                game.currentFrame = currentFrame + 2; // 싱크 타이밍을 맞춘다
                const Interval = 60;
                let nextTime = Date.now() + Interval;
                const run = () => { 
                    Game.runFrame(game);
                    const now = Date.now();
                    nextTime = nextTime + Interval;
                    setTimeout(run, nextTime - now);

                    const info = document.getElementById("info");
                    info!.innerText = game.currentFrame.toString();
                }
                run();
                
            } else {
                throw new Error("invalid sync reply");
            }
        }
    }
}