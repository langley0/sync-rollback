import { Input } from "./input";
import assert from "assert";

//const assert = console.assert;
const log = console.log;


export interface InputQueue {
    id: number;
    head: number;
    tail: number;
    length: number;
    frameDelay: number;
    firstFrame: boolean;

    lastUserAddedFrame: number | null;
    firstIncorrectFrame: number | null;
    lastAddedFrame: number | null;
    lastFrameRequested: number | null;

    prediction: Input | null;
    inputs: Input[];
}

export namespace InputQueue {
    const INPUT_QUEUE_LENGTH = 128;
    const PREVIOUS_FRAME = (offset: number) => (((offset) == 0) ? (INPUT_QUEUE_LENGTH - 1) : ((offset) - 1));
    const NULL_FRAME = -1;
    
    export function init(id: number): InputQueue {
        return {
            id: id,
            head: 0,
            tail: 0,
            length: 0,
            frameDelay: 0,
            firstFrame: true,

            lastUserAddedFrame: null,
            firstIncorrectFrame: null,
            lastFrameRequested: null,
            lastAddedFrame: null,

            prediction: null,
            inputs: new Array<Input>(INPUT_QUEUE_LENGTH).fill(Input.create(-1, 0)),
        }
    }

    export function resetPrediction(ctx: InputQueue, frame: number) {
        assert(ctx.firstIncorrectFrame === null || frame < ctx.firstIncorrectFrame);
        log(`resetting all prediction errors back to frame ${frame}`);

        ctx.prediction = null;
        ctx.firstIncorrectFrame = null;
        ctx.lastAddedFrame = null;
    }

    export function getConfirmedInput(ctx: InputQueue, requestedFrame: number): Input | null {
        assert(ctx.firstIncorrectFrame === null || requestedFrame < ctx.firstIncorrectFrame);
        const offset = requestedFrame % INPUT_QUEUE_LENGTH;
        if (ctx.inputs[offset].frame !== requestedFrame) {
            return null;
        } else {
            return ctx.inputs[offset];
        }
    }

    /**
     * 로컬과 리모트 입력이 들어왔을때를 처리한다
     * 로컬의 경우는 입력프레임이 현재프레임이기 때문에 별다른 프레임 딜레이가 없지만
     * 리모트의 경우는 프레임 딜레이가 생기게 되어 있다
     * @param ctx 
     * @param input 
     */
    export function addInput(ctx: InputQueue, input: Input) {
        log(`Adding input frame number ${input.frame} to queue`);
        // 입력은 한프레임단위로 계속해서 서버로 전달되어야 한다
        // 이때에는 프레임딜레이는 무시된다
        assert(ctx.lastUserAddedFrame === null || input.frame === ctx.lastUserAddedFrame + 1);
        ctx.lastUserAddedFrame = input.frame;

        // 입력이 드랍되는 경우는 여러가지가 있다
        // 우선 리모트의 프레임 딜레이가 너무 큰 경우에, 로컬의 입력이 막히게 된다
        // 반대로 리모트의 경우도 여러가지이유로 (패킷손실을 포함) 입력이 드랍될 수 있다
        // 이러한 상황에서 새로운 입력과 이전 입력과의 빈틈을 메꾸기 위한 작업을 공통으로 진행한다
        const newFrame = advanceQueueHead(ctx, input.frame);
        addDelayedInputToQueue(ctx, input, newFrame);
        
        input.frame = newFrame;
    }

    /**
     * 주어진 프레임
     * @param ctx 
     * @param frame 
     */
    function advanceQueueHead(ctx: InputQueue, frame: number): number{
        log(`Advancing queue head to frame ${frame}`);
        // 이번이 첫번째 프레임이면 0 번 프레임에 기록하면 된다
        // 그것이 아니라면 마지막 기록 프레임 넘버 + 1 을 하면 된다
        // head 가 가르키는 프레임에는 아무것도 없기 때문에  (이전 프레임 + 1) 을 해야 한다
        // * head : 새로운 프레임이 기록될 위치
        // * expectedFrame: 마지막 입력의 다음 프레임 넘버
        let expectedFrame = ctx.firstFrame ? 0 : ctx.inputs[PREVIOUS_FRAME(ctx.head)].frame + 1;
        frame += ctx.frameDelay;

        // ??? 언제 발생하는겨
        // TODO: 코드 이해 필요
        if (expectedFrame > frame) {
            log(`Dropping input frame ${frame} (expected next frame to be ${expectedFrame})`);
            return NULL_FRAME;
        }
        
        // 마지막 입력으로부터 시간으로부터 시스템 프레임간의 차이가 큰데.. 이게 가능한가
        // useinput 을 시퀀셜하게 체크하잖아?? 언제 발생할수 있지
        // TODO: 코드 이해 필요
        while (expectedFrame < frame) {
            log(`Adding padding frame ${expectedFrame} to account for change in frame delay.`);
            const lastInput = ctx.inputs[PREVIOUS_FRAME(ctx.head)];
            addDelayedInputToQueue(ctx, lastInput, expectedFrame);
            expectedFrame++;
        }

        assert(frame === 0 || frame === ctx.inputs[PREVIOUS_FRAME(ctx.head)].frame + 1);
        return frame;
    }

    /**
     * 인풋이 클라이언트로부터 도착했을때, 
     */
    function addDelayedInputToQueue(ctx: InputQueue, input: Input, frameNumber: number) {
        log(`Adding delayed input frame number ${frameNumber} to queue.`);

        // 이런 검사의 의미를 잘 모르겠다
        assert(ctx.lastAddedFrame === null  || frameNumber === ctx.lastAddedFrame + 1);
        assert(frameNumber === 0 || ctx.inputs[PREVIOUS_FRAME(ctx.head)].frame === frameNumber - 1);

        ctx.inputs[ctx.head] = input;
        ctx.inputs[ctx.head].frame = frameNumber;
        ctx.head = (ctx.head + 1) % INPUT_QUEUE_LENGTH;
        ctx.length++;
        ctx.firstFrame = false;
        ctx.lastAddedFrame = frameNumber;

        if (ctx.prediction !== null) {
            assert(frameNumber === ctx.prediction.frame);

            // 예측한 입력이 실제 입력과 맞지 않는다면, 해당 프레임부터 재계산을 하여야 한다
            if (ctx.firstIncorrectFrame === null && !Input.equal(ctx.prediction, input, true)) {
                log(`frame ${frameNumber} does not match prediction.  marking error.`);
                ctx.firstIncorrectFrame = frameNumber;
            }

            // 만약에 마지막입력이 예측된 입력과 일치한다면 더이상 예측을 하지 않아도된다
            if (ctx.prediction.frame === ctx.lastFrameRequested && ctx.firstIncorrectFrame === null) {
                log("prediction is correct!  dumping out of prediction mode.");
                ctx.prediction = null;
            } else {
                ctx.prediction.frame++;
            }
        }

        // 어찌되었든 input quque 의 길이를 넘어서면 안된다
        assert(ctx.length <= INPUT_QUEUE_LENGTH);
    }

    export function getInput(ctx: InputQueue, requestedFrame: number): Input {
        log(`Requesting input frame ${requestedFrame}`);

        // 예측이 실패한 이후에는 입력을 가져갈수 없다
        // 앞에서 이러한 일이 생기지 않도록 전처리를 해야한다
        assert(ctx.firstIncorrectFrame === null)
        
        // 요청받은 마지막 프레임을 기억했다가, 이후 입력이 예측과 동일한지 판단할때 사용한다
        ctx.lastFrameRequested = requestedFrame;
        assert(requestedFrame >= ctx.inputs[ctx.tail].frame);
        
        if (ctx.prediction === null) {
            const offset = requestedFrame - ctx.inputs[ctx.tail].frame;
            if (offset < ctx.length) {
                // 요청받은 프레임에 입력을 찾아서 돌려준다
                const newOffset = (offset + ctx.tail) % INPUT_QUEUE_LENGTH;
                assert(ctx.inputs[newOffset].frame === requestedFrame);
                const input = ctx.inputs[newOffset];
                log(`Returning confirmed frame number ${input.frame}`);
                return input;
            }

            // 요청받은 프레임이 입력큐에 존재하지 않는다
            // 아직 도착하지 않은 입력을 예측해서 돌려주어야 한다
            // 예측된 입력은 플레이어가 다른 입력을 할때까지 유지된다
            if (requestedFrame === 0) {
                log("basing new prediction frame from nothing, you're client wants frame 0");
                ctx.prediction = Input.create(0, 0);
            } else if (ctx.lastAddedFrame === null) {
                log("basing new prediction frame from nothing, since we have no frames yet");
                ctx.prediction = Input.create(0, 0);
            } else {
                log(`basing new prediction frame from previously added frame (queue entry:${PREVIOUS_FRAME(ctx.head)}, frame:${ctx.inputs[PREVIOUS_FRAME(ctx.head)].frame})`);
                const src = ctx.inputs[PREVIOUS_FRAME(ctx.head)];
                ctx.prediction = Input.create(src.frame + 1, src.data);
            }
        }

        assert(ctx.prediction !== null);
        const prediction = ctx.prediction!;
        const input = Input.create(requestedFrame, prediction.data);
        log(`returning prediction frame number ${input.frame} ${prediction.frame}`);

        return input;
    }


    export function discardConfirmedFrames(ctx: InputQueue, frame: number) {
       assert(frame >= 0);
    
       if (ctx.lastFrameRequested !== null) {
          frame = Math.min(frame, ctx.lastFrameRequested);
       }
    
       log(`discarding confirmed frames up to ${frame} (last_added:${ctx.lastAddedFrame} length:${ctx.length} [head:${ctx.head} tail:${ctx.tail}]).`);
       if (ctx.lastAddedFrame === null || frame >= ctx.lastAddedFrame) {
          ctx.tail = ctx.head;
          ctx.length = 0;
       } else {
          const offset = frame - ctx.inputs[ctx.tail].frame + 1;
          log(`difference of ${offset} frames.`);
          assert(offset >= 0);
    
          ctx.tail = (ctx.tail + offset) % INPUT_QUEUE_LENGTH;
          ctx.length -= offset;
       }
    
       log(`after discarding, new tail is ${ctx.tail} (frame:${ctx.inputs[ctx.tail].frame}).`);
       assert(ctx.length >= 0);
    }
}