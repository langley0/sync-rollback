import { InputQueue } from "./inputQueue";
import { Input } from "./input";

const MAX_PREDICTION_FRAMES        = 8;

const assert = console.assert;
const log = console.log;

interface SavedState {
    frames: {
        frame: number;
        buf: Buffer;
    }[]
}

export interface State {
    rollingBack: boolean;
    inputQueues: InputQueue[];

    framecount: number;
    lastConfirmedFrame: number;
    maxPredictionFrames: number;

    savedState: SavedState;
}



// 현재 상황을 저장하고 로딩해야한다
function saveFame(state: State) {
    // callback current snapshot
    const snapshot = {};
    const index = state.framecount % state.savedState.frames.length;
    state.savedState.frames[index] = {
        frame: state.framecount,
        buf: new Buffer(JSON.stringify(snapshot)),
    };
}

function findSavedFrameIndex(state: State, frame: number) {
    const found = state.savedState.frames.find((f) => f.frame === frame)
    assert(found);
    return found!;
}



export namespace State {
    // 나중에 외부로 옮기자...진짜로
    export function loadFrame(state: State, frame: number) {
        if(state.framecount === frame) {
            log("Skipping NOP");
            return;
        }
    
        // saved frame 을 찾아야 한다
        const saved = findSavedFrameIndex(state, frame);
        const snapshot = JSON.parse(saved.buf.toString());
    
        // 프레임을 로딩된 상태로 돌려놓는다
        state.framecount = saved.frame;
    }

    export function create(): State {
        return {
            rollingBack: false,
            inputQueues: [InputQueue.init(0)], // TODO: 플레이어를 정상적으로 세팅하는 방법에 대해서 고민

            framecount: 0,
            lastConfirmedFrame: -1,
            maxPredictionFrames: MAX_PREDICTION_FRAMES,
            
            savedState: {
                frames: new Array(MAX_PREDICTION_FRAMES + 2).fill({ buf: new Buffer(""), frame: -1 }),
            }
        }
    }

    export function synchronizeInputs(ctx: State) {
        const result: Input[] = [];
        ctx.inputQueues.forEach((inputQueue) => {
            const input = InputQueue.getInput(inputQueue, ctx.framecount);
            result.push(input);
        });
        return result;
    }

    export function incrementFrame(ctx: State) {
        ctx.framecount += 1;
        saveFame(ctx);
    }



    export function getIncorrectFrame(ctx: State) {
        const firstIncorrect = 
        ctx.inputQueues.reduce<number|null>((firstIncorrect, inputQueue, i) => {
            const incorrect = inputQueue.firstIncorrectFrame;
            if (incorrect !== null) {
                log(`considering incorrect frame ${incorrect} reported by queue ${i}`)
                if (firstIncorrect === null || incorrect < firstIncorrect) {
                    firstIncorrect = incorrect;
                }
            }

            return firstIncorrect;
        }, null);
    
        if (firstIncorrect === null) {
            log("prediction ok.  proceeding");
        }
    
        return firstIncorrect;
    }

    export function resetPrediction(ctx: State, frameNumber: number) {
        ctx.inputQueues.forEach(input => {
            InputQueue.resetPrediction(input, frameNumber);
        });
    }


    export function inRollback(state: State) {
        return state.rollingBack;
    }

    export function addLocalInput(ctx: State, queue: number, inputValue: number) {
        // 현재 프레임과 마지막으로 입력이 확인된 프레임간의 차이를 본다
        const framesBehind = ctx.framecount - ctx.lastConfirmedFrame; 

        if (framesBehind >= ctx.maxPredictionFrames) {
            // 나의 네트워크 컨넥션이 좋지 않은 경우에 발생한다
            // 시스템의 프레임은 문제없이 진행되지만, 입력받은 프레임이 너무 늦어서 차이가 나는 경우이다
            // 현재 이경우에는 플레이어에게 입력불가라는 핸디켑을 주고 있다
            log(`Rejecting input from emulator: reached prediction barrier.`);
            return false;
        }

        log(`Sending undelayed local frame ${ctx.framecount} to queue ${queue}.`);
        const input = Input.create(ctx.framecount, inputValue);
        InputQueue.addInput(ctx.inputQueues[queue], input);
        return true;
    }

    export function addRemoteInput(ctx: State, queue: number, input: Input) {
        InputQueue.addInput(ctx.inputQueues[queue], input);
    }


    export function getFrameCount(ctx: State) { return ctx.framecount; }
    export function setLastConfirmedFrame(ctx: State, frame: number) { 
        ctx.lastConfirmedFrame = frame;
        if (frame > 0) {
            ctx.inputQueues.forEach(inputQueue => {
                InputQueue.discardConfirmedFrames(inputQueue, frame - 1);
            });
        }
    }
}

