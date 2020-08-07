import tty from "tty";

import { Message, MessageType } from "./Message";
import { Network } from "./Network2";
import { Entity } from "./Entity";
import { World } from "./World2";


const CLIENT_NUMBER = 2;
const clients: Message[][] = new Array<Message[]>(CLIENT_NUMBER);
clients[0] = [];
clients[1] = [];


function client(id: number) {

    // 네트워크 컴포넌트를 생성한다
    const net = Network.create(id, {
        send: (m: Message) => {
            // 자신을 제외한 나머지클라이언트 큐에 입력한다
            clients.forEach((c,i) => { 
                if (i !== id) {
                    c.push(m);
                }
            });
        },
        recv: (): Message | undefined => {
            return clients[id].shift();
        }
    });

    // 월드를 생성한다
    const world = World.create();
    const entities = new Array<Entity>(CLIENT_NUMBER);
    for(let i = 0; i < CLIENT_NUMBER; ++i) {
        entities[i] = Entity.create(i, id === i);
    }
    world.entities = entities
    world.controlled = id; // 같은 아이디를 사용한다

    // 엔티티와 네트워크를 연결한다
    entities.forEach((entity, i) => {
        Network.link(net, i, (m: Message) => {
            Entity.onMessage(entity, m);
        });
    });

    // 월드 업데이트 이벤트에 네트워크를 포함시켜야 한다
    // 임시처방!
    (world as any).network = net;

    return world;
}


async function frame(world: World) {
    

    // 입력을 받는다
    // * 랜덤 입력으로 시뮬레이션을 대체
    const inputValue = Math.floor(Math.random() * 3);
    
    // 컨트롤 오브젝트에 입력을 넘긴다
    const controlled = world.entities.find(e => e.id === world.controlled);
    if (controlled !== undefined) {
        Entity.addLocalInput(controlled , world.currentFrame, inputValue);
        // 네트워크로 입력을 전송시킨다
        ((world as any).network as Network).send({ 
            type: MessageType.Input, 
            from: controlled.id, 
            body: { frame: world.currentFrame, data: inputValue }
        });
    }

    Network.update((world as any).network);

    // 월드업데이트
    World.advance(world);
}

const _1 = client(0);
const _2 = client(1);

process.stdout.cursorTo(0, 0);
process.stdout.clearScreenDown();

setInterval(() => {
    (Math.random() < 0.5 - (_1.currentFrame - _2.currentFrame) / 5) ? frame(_1) : null;
    (Math.random() < 0.5 + (_1.currentFrame - _2.currentFrame) / 5) ? frame(_2) : null;
}, 500)