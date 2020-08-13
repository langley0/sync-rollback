import { Entity } from "./Entity";

export interface World {
    currentFrame: number;
    entities: Entity[];
    controlled: number | null;
}

const LENGTH = 40;
let buffer = Buffer.from(new Array(LENGTH).fill(" "));


function log(state: number, frame: number)  {
    if (typeof window === 'undefined') { return; }
    const progressbar = document.getElementById("progressbar");
    if (progressbar === null) { return; }
    
    
    const column = frame % LENGTH;
    if (column === 0) {
        buffer = Buffer.from(new Array(LENGTH).fill(""));
    }
    if (state === 0) {
        buffer[column] = "O".charCodeAt(0);
    } else {
        buffer[column] = "X".charCodeAt(0);
    }
    
    const htmlStr = buffer.toString();
    progressbar!.innerHTML = htmlStr.replace(/O/g, "○").replace(/X/g, `<span style="color:red;">●</span>`);
    

    /*if (state === 1) {
        const progressbar = document.getElementById("progressbar");
        progressbar!.innerText = "last rollbacked frame is " + frame;
    }*/
}

function update(world: World, frame: number) {
    // 인풋을 처리한다
    const inputs = world.entities.map(e => Entity.syncInput(e, frame));
    world.entities.forEach((e, index) => Entity.update(e, frame, inputs[index]));

}

// 엔티티의 상태를 어떻게 저장하고 읽을수 있을까
const saveslot: any[] = [];
function save(world: World, frame: number) {
    saveslot.push({ frame, state: JSON.stringify((world as any).state) });
    if (saveslot.length > 200) {
        saveslot.shift();
    }
}

function load(world: World, frame: number) {
    const saved = saveslot.find(s => s.frame === frame);
    if (saved === undefined) {
        throw new Error("invalid savedframe " + frame);
    }
    saveslot.splice(0, saveslot.length);
    (world as any).state = JSON.parse(saved.state);
    world.currentFrame = frame;
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
        const count = world.currentFrame - from;
        load(world, from);

        // force advance frame
        // 롤백된 프레임 만큼 다시 현재 상태를 로드한다
        for(let i = 0; i < count ; i++) {
            const currentFrame = world.currentFrame;
            update(world, currentFrame);
            save(world, currentFrame + 1);
            log(-1, currentFrame);
            world.currentFrame =  currentFrame + 1;
        }

        // finish rollbck
    }

    export function advance(world: World) {
        const incorrectFrame = incorrect(world);
        if (incorrectFrame !== null) {
            // 롤백후 다시 현재 프레임까지 진행시킨다
            rewind(world, incorrectFrame);
        }
        const currentFrame = world.currentFrame;

        update(world, currentFrame);
        save(world, currentFrame + 1);
        log(0, currentFrame);
        world.currentFrame =  currentFrame + 1;

        // 롤백경계선밖에 있는 입력데이터를 여기서 드랍시킨다
        updateSafeFrame(world);
    }
}