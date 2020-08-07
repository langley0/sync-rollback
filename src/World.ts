import { Entity } from "./Entity";

const wait = (timeout: number) => {
    return new Promise(resolve => {
        setTimeout(resolve, timeout);
    })
};

export interface World {
    currentFrame: number;
    entities: Entity[];
    controlled: number | null;
}

const PROGRESSBAR = "O";

function log(index: number, state: number, frame: number)  {
    process.stdout.cursorTo(frame % process.stdout.columns, index);
    if (state === 0) {
        process.stdout.write(PROGRESSBAR);
    } else if (state === 1) {
        process.stdout.write("\x1b[31m" + PROGRESSBAR + "\x1b[0m");
    }
}

function update(world: World, frame: number) {
    // 인풋을 처리한다
    const inputs = world.entities.map(e => Entity.syncInput(e, frame));

    // 매프레임업데이트를 한다
    world.entities.forEach(e => Entity.update(e, frame));

}

// 엔티티의 상태를 어떻게 저장하고 읽을수 있을까
function save(world: World, frame: number) {
    // TODO
}

function load(world: World, frame: number) {
    // TODo
}

function updateSafeFrame(world: World) {
    const safeFrame =  world.entities.reduce((frame, e) => {
        if (frame === 0) {
            return e.lastInput.frame;
        } else {
            return Math.min(e.lastInput.frame, frame);
        }
    }, 0);

    world.entities.forEach(e => {
        e.inputs = e.inputs.filter(i => i.frame > safeFrame);
    });
}

export namespace World {
    export function create(): World {
        return {
            currentFrame: 0,
            entities: [],
            controlled: null,
        }
    }

    export function incorrect(world: World): number | null  {
        return world.entities.reduce<number|null>((incorrect, entity) => {
            if (incorrect === null) {
                return entity.incorrect;
            } else if (entity.incorrect === null) {
                return incorrect;
            } else {
                return Math.min(entity.incorrect, incorrect);
            }
        }, null);
    } 

    export function rewind(world: World, from: number)  {
        // start rollback

        // reset prediction
        world.entities.forEach(e => Entity.resetPrediction(e));
        
        // frame load / 모든 엔티티의 상태를 다시 로드해야한다
        load(world, from);

        // force advance frame
        // 롤백된 프레임 만큼 다시 현재 상태를 로드한다
        for(let i = from; i < world.currentFrame ; i++) {
            update(world, i);
            save(world, i);
            log(world.controlled!, 1, i);
        }

        // finish rollbck
    }

    export function advance(world: World) {
        const incorrectFrame = incorrect(world);
        if (incorrectFrame !== null) {
            // 롤백후 다시 현재 프레임까지 진행시킨다
            rewind(world, incorrectFrame);
        }

        update(world, world.currentFrame);
        save(world, world.currentFrame);
        log(world.controlled!, 0, world.currentFrame);
        world.currentFrame ++;

        // 롤백경계선밖에 있는 입력데이터를 여기서 드랍시킨다
        updateSafeFrame(world);
    }
}