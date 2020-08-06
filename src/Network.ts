import assert from "assert";
import axios from "axios";
import { response } from "express";

enum MessageType {
    Invalid       = 0,
    SyncRequest   = 1,
    SyncReply     = 2,
    Input         = 3,
    QualityReport = 4,
    QualityReply  = 5,
    KeepAlive     = 6,
    InputAck      = 7,
 };

 enum HandleState {
    Syncing = 1,
    Running = 3,
    Disconnected = 4
};

const MAX_PLAYER_NUMBER = 8;
const MAX_SEQ_DISTANCE = (1 << 15);
const NUM_SYNC_PACKETS = 5;
const SYNC_RETRY_INTERVAL = 2000;
const SYNC_FIRST_RETRY_INTERVAL = 500;
const KEEP_ALIVE_INTERVAL    = 200;
const RUNNING_RETRY_INTERVAL = 200;
const QUALITY_REPORT_INTERVAL = 1000;
const NETWORK_STATS_INTERVAL  = 1000;

const log = console.log;

export interface Message {
    type: MessageType,
    from: number;
    magic: number;
    sequence: number;
    body: any;
}

export interface Network {
    ip: string;
    port: number;
    
    synchronizing: boolean;

    handles: Network.Handle[];
    recvQueue: Message[];
    sendQueue: Message[];
}



export namespace Network {
    export interface Handle {
        index: number;
        connected: boolean;
        magicNumber: number;

        nextRecvSeq: number;
        lastRecvTime: number;
        
        nextSendSeq: number;
        packetsSent: number;
        lastSendTime: number;

        currentState: HandleState;
        sync: {
            random: number;
            remaining: number;
        };
        running: {
            lastInputRecvTime: number,
            lastQueryReportTime: number,
            lastNetworkStatsInterval: number,
        }
    }

    export function init(ip: string, port: number): Network {
        const instance: Network = {
            ip: "",
            port: 0,
            synchronizing: false,
        
            handles: [],
            recvQueue: [],
            sendQueue: [],
        };

        instance.ip = ip;
        instance.port = port;
        instance.synchronizing = true;
        instance.handles = new Array<Handle>(MAX_PLAYER_NUMBER).fill({ 
            index: 0,
            connected: false, 
            magicNumber: 0,
            nextRecvSeq: 0,
            lastRecvTime: 0,
            nextSendSeq: 0,
            packetsSent: 0,
            lastSendTime: 0,
            currentState: HandleState.Syncing,
            sync: {
                remaining: NUM_SYNC_PACKETS,
                random: 0,
            },
            running: {
                lastInputRecvTime: 0,
                lastQueryReportTime: 0,
                lastNetworkStatsInterval: 0,
            }
        });

        instance.handles.forEach((handle, i) => { handle.index = i; });
        return instance;
    }

    export function update(net: Network) {
        // 메시지큐에서 메시지를 읽어 해당하는 핸들에 전달을 한다
        let msg: Message | undefined;
        while((msg = net.recvQueue.shift()) !== undefined) {
            const m = msg;
            const handle = net.handles.find(h => h.index === m.from);
            if (handle !== undefined) {
                onHandleMessage(net, handle, msg);
            }
        }

        // 모든 핸들에 대해서 현재 상태에서 해야할 작업을 진행한다
        net.handles.forEach(h => updateHandle(net, h));
    }

    function newMessage(type: MessageType): Message {
        throw new Error();
    }


    function sendMessage(net: Network, handle: Handle, msg: Message) {
        logMsg("send", msg);

        handle.packetsSent ++;
        handle.lastSendTime = Date.now();
        handle.nextSendSeq ++;
        
        msg.magic = handle.magicNumber;
        msg.sequence = handle.nextSendSeq;

        const url =  "http://" + net.ip + ":" + net.port;
        axios.post(url, msg)
        .then(response => response.data) 
        .then(data => net.recvQueue.push(...data))
        .catch(e => {
            console.error(e);
        });
    }
    
    function onSyncRequest(net:Network, handle: Handle, msg: Message): boolean {
        const reply = newMessage(MessageType.SyncReply);
        reply.body = { random: msg.body.random };
        sendMessage(net, handle, reply);
        return true;
    }

    function onSyncReply(net:Network, handle: Handle, msg: Message): boolean {
        if (handle.currentState !== HandleState.Syncing) {
            log("Ignoring SyncReply while not synching.");
            return true;
        }

        if (msg.body.random !== handle.sync.random) {
            log(`sync reply ${msg.body.random} != ${handle.sync.random}.  Keep looking...`);
            return false;
        }

        if (handle.connected === false) {
            handle.connected = true;
            assert(false, "connected event");
        }

        log(`Checking sync state (${handle.sync.remaining} round trips remaining).`);
        handle.sync.remaining --;
        if (handle.sync.remaining === 0) {
            log("Synchronized!");
            // 동기화 완료 이벤트를 준다
            
            // 동기화기 끝나고 플레이 가능상태가 되었다
            handle.currentState = HandleState.Running;
            handle.magicNumber = msg.magic;
        } else {
            // 동기화상태 이벤트를 준다

            // 여러번 동기화를 진행한다
            const msg = newMessage(MessageType.SyncRequest);
            sendMessage(net, handle, msg);
        }

        return false;
    }

    function onInvalid(handle: Handle, msg: Message) {

    }
    
    const dispatch: {[key:number]: (n: Network, h: Handle, m: Message) => boolean } = {};
    dispatch[MessageType.SyncRequest] = onSyncRequest;
    dispatch[MessageType.SyncReply] = onSyncReply;
    
    function onHandleMessage(net: Network, handle: Handle, msg: Message) {
        const seq = msg.sequence;
        const skipped = seq - handle.nextRecvSeq;
        if (skipped > MAX_SEQ_DISTANCE) {
            log(`dropping out of order packet (seq: ${seq}, last seq:${handle.nextRecvSeq})`);
            return;
        }

        handle.nextRecvSeq = seq;
        logMsg("recv", msg);
        
        const handler = dispatch[msg.type];
        if (handler) {
            if (handler(net, handle, msg)) {
                handle.lastRecvTime = Date.now();
            }

        } else {
            onInvalid(handle, msg);
        }
    }

    function UpdateNetworkStats() {
        const now = 

   if (_stats_start_time == 0) {
      _stats_start_time = now;
   }

   int total_bytes_sent = _bytes_sent + (UDP_HEADER_SIZE * _packets_sent);
   float seconds = (float)((now - _stats_start_time) / 1000.0);
   float Bps = total_bytes_sent / seconds;
   float udp_overhead = (float)(100.0 * (UDP_HEADER_SIZE * _packets_sent) / _bytes_sent);

   _kbps_sent = int(Bps / 1024);

   Log("Network Stats -- Bandwidth: %.2f KBps   Packets Sent: %5d (%.2f pps)   "
       "KB Sent: %.2f    UDP Overhead: %.2f %%.\n",
       _kbps_sent, 
       _packets_sent,
       (float)_packets_sent * 1000 / (now - _stats_start_time),
       total_bytes_sent / 1024.0,
       udp_overhead);
}

    function updateHandle(net: Network, handle: Handle) {
        const now = Date.now();

        switch(handle.currentState) {
            case HandleState.Syncing: 
                const nextInterval = (handle.sync.remaining === NUM_SYNC_PACKETS) ? SYNC_FIRST_RETRY_INTERVAL : SYNC_RETRY_INTERVAL;
                if (handle.lastSendTime > 0 && handle.lastSendTime + nextInterval < now) {
                    log(`No luck syncing after ${nextInterval} ms... Re-queueing sync packet.`);
                    handle.sync.random = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
                    const msg = newMessage(MessageType.SyncRequest);
                    //msg.body.random = handle.sync.random;
                    sendMessage(net, handle, msg);
                }
                break;
            case HandleState.Running:
                if (handle.running.lastInputRecvTime + RUNNING_RETRY_INTERVAL < now) {
                    //Log("Haven't exchanged packets in a while (last received:%d  last sent:%d).  Resending.\n", _last_received_input.frame, _last_sent_input.frame);
                    // 인풋처리는 천천히 하자
                    // sendPendingOutput();
                    handle.running.lastInputRecvTime = now;
                }

                if (handle.running.lastQueryReportTime + QUALITY_REPORT_INTERVAL < now) {
                    const msg = newMessage(MessageType.QualityReport);
                    msg.body.ping = Date.now();
                    msg.body.frameAdvantage = 0;//handle.localFrameAdvantage; TODO:
                    sendMessage(net, handle, msg);
                    handle.running.lastQueryReportTime = now;
                }

                if (handle.running.lastNetworkStatsInterval + NETWORK_STATS_INTERVAL < now) {
                    updateNetworkStats();
                    handle.running.lastNetworkStatsInterval = now;
                }

                if (handle.lastSendTime + KEEP_ALIVE_INTERVAL < now) {
                    log("Sending keep alive packet");
                    sendMessage(net, handle, newMessage(MessageType.KeepAlive));
                }

                // disconnect 처리해야한다
                // 나중에 천천히
                break;
            case HandleState.Disconnected:
                log("disconnected");
                // 핸들을 정리해야한다. 어떻게 할지는 고민중
                break;
        }
    }

    function logMsg(prefix: string, msg: Message)
    {
        switch (msg.type) {
        case MessageType.SyncRequest:
            log(`${prefix} sync-request (${msg.body.random}).`);
            break;
        case MessageType.SyncReply:
            log(`${prefix} sync-reply (${msg.body.random}).`);
            break;
        case MessageType.QualityReport:
            log(`${prefix} quality report.`);
            break;
        case MessageType.QualityReply:
            log(`${prefix} quality reply.`);
          break;
        case MessageType.KeepAlive:
            log(`${prefix} keep alive.`);
            break;
        case MessageType.Input:
            log(`${prefix} game-compressed-input ${msg.body.frame}.`);
            break;
        case MessageType.InputAck:
            log(`${prefix} input ack.`);
            break;
        default:
            assert(false, "Unknown message type.");
       }
    }
}

// 테스트용 코드이다
Network.init("localhost", 8080);
setInterval(Network.update, 100);