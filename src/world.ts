import { Input } from "./input";
import { State } from "./State";
import { log, assert } from "console";
import { toUnicode } from "punycode";

const INPUT_THRUST      = (1 << 0),
INPUT_BREAK             = (1 << 1),
INPUT_ROTATE_LEFT       = (1 << 2),
INPUT_ROTATE_RIGHT      = (1 << 3),
INPUT_FIRE              = (1 << 4),
INPUT_BOMB              = (1 << 5),
INPUT_QUIT              = (1 << 6);

const RECOMMENDATION_INTERVAL           = 240;
const DEFAULT_DISCONNECT_TIMEOUT        = 5000;
const DEFAULT_DISCONNECT_NOTIFY_START   = 750;



const keysBuffer: Buffer[] = [];

process.stdin
.setRawMode(true)
.resume()
.setEncoding( 'utf8' )
.on("data", function(chunk) {
    keysBuffer.push(Buffer.from(chunk));
});

export interface World {
    // common state
    state: State;
    playerHandle: number | null;
    nextRecommendedSleep: number;

    // need app state
}

export namespace World {
    export function create(): World {
        return {
            state: State.create(),
            playerHandle: 0,
            nextRecommendedSleep: 0,
        }
    }

    export function readInputs() {
        const inputtable: { key: Buffer, input: number}[]  = [
            { key: Buffer.from([0x1b,0x5b,0x41]), input: INPUT_THRUST },
            { key: Buffer.from([0x1b,0x5b,0x42]), input: INPUT_BREAK },
            { key: Buffer.from([0x1b,0x5b,0x44]), input: INPUT_ROTATE_LEFT },
            { key: Buffer.from([0x1b,0x5b,0x43]), input: INPUT_ROTATE_RIGHT },
            { key: Buffer.from([0x71]), input: INPUT_QUIT },
        ];
        
        const keys = keysBuffer.splice(0, keysBuffer.length);
        const inputs = keys.reduce((inputs, key) => {
            const inputtedKey = inputtable.find((value) => {
                return key.compare(value.key) === 0;
            });
            if (inputtedKey) {
                return inputs | inputtedKey.input;
            }
            return inputs;
        }, 0);
        debugPrintInput(inputs);
        return inputs;
    }

    function debugPrintInput(inputs: number) {
        // debug
        let debug = [];
        if (inputs & INPUT_QUIT) {
            console.log("QUIT");
            process.exit(0);
        }
        if (inputs & INPUT_THRUST) {
            debug.push("THRUST");
        }
        if (inputs & INPUT_BREAK) {
            debug.push("BREAK");
        }
        if (inputs & INPUT_ROTATE_LEFT) {
            debug.push("LEFT");
        }
        if (inputs & INPUT_ROTATE_RIGHT) {
            debug.push("RIGHT");
        }
        if (debug.length > 0) {
            console.log(debug.join(" & "));
        }
    }

    function addLocalInput(world: World, inputs: number) {
        // 이미 사전에 검사하고 왔어야 한다
        assert(world.playerHandle !== null); 
        const handle = world.playerHandle!;
        State.addLocalInput(world.state, handle, inputs);
    }

    function syncInput(world: World): number[] {
        const result = State.synchronizeInputs(world.state);
        return result.map(value => value.data);
    }

    function advanceFrame(world: World, input: number[]) {
        // state update
        State.incrementFrame(world.state);
        poll(world); // 세가지 콜백을 넣어야 한다
        //pollSyncEvents(world.state);
    }

    function drawFrame() {
        // do nothing yet
    }

    function adjustSimulation(world:World, incorrect: number) {
        const framecount = State.getFrameCount(world.state);
        const count = framecount - incorrect;
     
        log("Catching up");
        world.state.rollingBack = true; // 함수로??
     
        // validation 이 실패한 프레임으로 이동한다
        // TODO : 스냅샷을 로딩할 수 있어야 한다
        State.loadFrame(world.state, incorrect);
        // 현재 프레임은 실패한 해당 프레임이어야 한다
        assert(world.state.framecount === incorrect);
     
         // 현재 프레임을 따라잡을 때까지 메인프레임을 증가시킨다
        State.resetPrediction(world.state, framecount);
         for (let i = 0; i < count; i++) {
            
            // 메인 프레임을 한프레임 증가시킨다
            const inputs = syncInput(world);
            advanceFrame(world, inputs);
         }
        
        assert(world.state.framecount === framecount);
        world.state.rollingBack = false;
     
        log("---");   
     }

    function poll(world: World) {
        const { state  } = world;

        // 롤백중이라면 아무것도 하지 않는다
        if (State.inRollback(state)) { return; }
        
        // 네트워크이벤트를 처리한다
        // 동기화중이라면 여기서 중단한다

        // 롤백도 아니고 동기화중도 아닌 상태이다
        // 가장 일반적인 상황이다
        const incorrect = State.getIncorrectFrame(state);
        if (incorrect !== null) {
            adjustSimulation(world, incorrect);
        }
        const currentFrame = State.getFrameCount(state);
        
        // 선택된 프레임을 모든 플레이어의 로컬 프레임으로 설정한다
        // 각각의 플레이어를 처리하면서 마지막으로 확인된 프레임을 가져온다
        const confirmedFrame = pollPlayers(world, currentFrame);
        if (confirmedFrame >= 0) {
            log(`setting confirmed frame in sync to ${confirmedFrame}`);
            State.setLastConfirmedFrame(state, confirmedFrame);
        }

        if(currentFrame > world.nextRecommendedSleep) {
            let interval = 0;
            // 모든 유저의 프레임딜레이중에 최대값을 가져온다

            if (interval > 0) {
                // 타임싱크를 해야한다
                world.nextRecommendedSleep = currentFrame + RECOMMENDATION_INTERVAL;
            }
        }
    }

    function pollPlayers(world: World, frame: number): number {
        // 나중에 네트워크마다 오는 입력 큐를 처리해야하는데, 지금은 기본 월드 프레임을 사용하자
        return world.state.framecount;
    }

    export function processFrame(world: World) {
        // TODO : spectator 처리를 해야한다. spectator 는 별도의 인풋을 가지고 있지 않는다
        if (world.playerHandle !== null) {
            const inputs = readInputs();
            addLocalInput(world, inputs);
        }

        const result = syncInput(world);
        advanceFrame(world, result);
        drawFrame();
    }

    export function idle(world: World, timeout: number) {
        // poll timeout
    }
}

