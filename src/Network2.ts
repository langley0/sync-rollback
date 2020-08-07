import { Message } from "./Message";
import assert from "assert";

type SendFunction = (m: Message) => void;
type RecvFunction = () => Message | undefined;

type HandleFunction = (m: Message) => void;

interface Handle {
    onRecv: HandleFunction;
}

export interface Network {
    id: number,
    send: SendFunction;
    recv: RecvFunction;
    handles: {[number: number]: Handle }
}

export interface NetworkOption {
    send: SendFunction;
    recv: RecvFunction;
}





export namespace Network {
    export function create(netId: number, options: NetworkOption): Network {
        return {
            id: netId,
            send: options.send,
            recv: options.recv,
            handles: {}
        };
    }

    export function link(net: Network, index: number, handler: HandleFunction) {
        assert(net.handles[index] === undefined);
        net.handles[index] = {
            onRecv: handler
        }
    }

    export function update(net: Network) {
        // 수신된 메시지를 읽는다
        let msg = net.recv();
        while(msg !== undefined) {
            // 메시지의 수신 대상이 되는 오브젝트에 메시지를 보낸다
            const handle = net.handles[msg.from];
            assert(handle !== undefined);
            handle.onRecv(msg);

            msg = net.recv();
        }
    }

}