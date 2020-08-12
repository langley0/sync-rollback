import assert from "assert";
import { Message, MessageType } from "./Message";
import { Input } from "./Input";


export interface Entity {
    id: number;
    controlled: boolean;
    // 나중에는 인풋을 관리는 컴포넌트를 따로 분리하는게 좋겠다
    inputs: Input[];
    
    lastInput: Input;
    prediction: Input[];
    incorrect: number | null;
    onUpdate: ((entity: Entity, frame: number, input: Input) => void) | null;
}

function addInputInternal(entity: Entity, input: Input) {
    assert(entity.lastInput.frame+1 === input.frame, `${entity.lastInput.frame + 1} === ${input.frame}`);

     // 마지막으로 입력이 들어온 프레임을 기억한다
     entity.inputs.push(input);
     entity.lastInput = input;

    // 예측과 어긋났는지 확인을 해야한다
    const prediction = entity.prediction.shift();
    if (prediction !== undefined) {
        assert(prediction.frame === input.frame, `${prediction.frame} === ${input.frame}`);

        // 프레임 예측이 발생한 상황이다
        // 프레임 예측이 실패했는지 본다

        if (!Input.equal(prediction, input)) {
            // 예측이 실패하였다
            // 롤백이 필요하다
            if (entity.incorrect === null) {
                entity.incorrect = input.frame;
            }
        }
    }
}

function addInput(entity: Entity, input: Input) {
    let nextFrame = entity.lastInput.frame + 1;
    while (nextFrame < input.frame) {
        // 마지막 입력으로부터 프레임스킵이 일어나서 새로운 입력이 들어왔다
        // 프레임 입력이 비어있을수는 없기 때문에 패딩된 입력을 채운다
        // 실제로 패딩된 입력이 아닌 다른 입력이 존재하였을 경우에는 동기화 실패가 발생한다
        // 실제 스킵과 패킷 로스를 구분할 수 있을까?
        // 지금은 패킷 로스는 없다고 가정한다
        const padded = Input.create(nextFrame, entity.lastInput.data);
        addInputInternal(entity, padded);
        nextFrame ++;
    }

    // 최근 입력을 넣는다
    addInputInternal(entity, input);
}

function getInput(entity: Entity, requestedFrame: number): Input {
    
    // 중요한것은 요청받은 프레임은 입력큐안에 있는 최소 프레임보다 커야 한다는 것이다
    // 롤백상황에서 입력을 재실행하기 위해서 입력큐는 롤백 최전선보다 위로 항상 유지를 하고 있어야 한다
    // [롤백하지 않는 상황] 이 인식되면 해당만큼의 입력큐는 비우게 된다. 
    // 입력큐의 최대 크기가 롤백가능한 프레임최대수가 된다.
    if (entity.inputs.length > 0) {
        assert(requestedFrame >= entity.inputs[0].frame, `${requestedFrame} >= ${entity.inputs[0].frame}`);

        // 기본 상태에서는 아래의 입력큐에서 입력을 찾아가게 된다
        // 남아있는 입력큐안에서 마지막 입력을 찾는다
        const found = entity.inputs.find(input => input.frame === requestedFrame);
        if (found !== undefined) {
            return found;
        }
    }

    // 내 프레임보다 입력이 부족한 경우에는 예측을 해야한다
    // 요청받은 프레임이 마지막 수신받은 입력보다 나중 프레임이어야 한다
    // 입력 발생측에서 프레임 딜레이가 발생했을 경우에 여기로 오게 된다
    assert (requestedFrame > entity.lastInput.frame, `${requestedFrame} > ${entity.lastInput.frame}`);
    if (entity.prediction.length > 0) {
        const found = entity.prediction.find(v => v.frame === requestedFrame);
        if (found !== undefined) {
            return found;
        }

        // 여기 도착하는 경우는 예측중에 다음 프레임 요청을 받았을때뿐이다
        // 이런 경우에는 마지막 예측 프레임보다 하나 큰 프레임을 요청 받아야 한다
        assert(requestedFrame === entity.prediction[entity.prediction.length - 1].frame + 1);
    }

    // 새로운 예측을 만들어서 넣는다
    if (entity.lastInput.frame >= 0) {
        assert(entity.prediction.length === 0  || entity.prediction[0].frame === entity.lastInput.frame +1);
        const lastPredictedFrame = entity.prediction.length > 0 ? entity.prediction[entity.prediction.length -  1].frame : entity.lastInput.frame;
        assert(requestedFrame > lastPredictedFrame);

        // 마지막 입력과 현재 입력사이에 에측큐를 구축한다
        for (let i = lastPredictedFrame + 1; i < requestedFrame; ++i) {
            const padding = Input.create(i, entity.lastInput.data);
            entity.prediction.push(padding);
        }

        const prediction = Input.create(requestedFrame, entity.lastInput.data);
        entity.prediction.push(prediction);
        return prediction;
    } else {
        // 첫번째 입력전에는 예측큐를 구성하지 않는다
        return Input.create(requestedFrame, entity.lastInput.data);
    }
}

export namespace Entity {
    export function create(id: number, controlled: boolean): Entity {
        return {
            id,
            controlled,
            inputs: [],
            lastInput: Input.create(-1, 0),
            prediction: [],
            incorrect: null,
            onUpdate: null,
        };
    }

    export function onMessage(entity: Entity, msg: Message) {
        // 메시지를 받아서 처리한다
        // 인풋메시지를 받아서 처리하게 된다
        // 입력에 어떻게 반응할지는 고민
        switch (msg.type) {
            case MessageType.Input: {
                // 인풋을 받아서 처리한다
                const input = Input.create(msg.body.frame, msg.body.data);
                assert(entity.lastInput.frame === -1 || entity.lastInput.frame + 1 === msg.body.frame, `${entity.lastInput.frame} + 1 === ${msg.body.frame}`);
                addInput(entity, input);
                break;
            };
        }
    }

    export function update(entity: Entity, frame: number, input: Input) {
        // 매프레임 업데이트 하는 함수이다
        // 주어진 입력(액션) 을 엔티티에게 전달해서 처리하도록 한다
        // 각각의 액션을 받고 어떻게 반응할지는 엔티티가 스스로 판단한다

        if (entity.onUpdate !== null) {
            entity.onUpdate(entity, frame, input);
        }
    }
    
    export function addLocalInput(entity: Entity, frame: number, inputValue: number) {
        const input = Input.create(frame, inputValue);
        assert(entity.lastInput.frame < 0 || entity.lastInput.frame + 1 === input.frame, `${entity.lastInput.frame} + 1 === ${input.frame}`);
        addInput(entity, input);
    }

    export function syncInput(entity: Entity, frame: number) {
        return getInput(entity, frame);
    }

    export function resetPrediction(entity: Entity) {
        // 예측된 값을 모두 제거한다
        entity.prediction = [];
        entity.incorrect = null;
    }
}

