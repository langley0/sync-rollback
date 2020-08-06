import { World } from "./world";

function wait(timeout: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, timeout);
    });
    
}

async function main() {
    const numPlayers = 2;
    const world = World.create();

    let start = Date.now();;
    let next = start;

    while(true) {
        await wait(1);

        const now  = Date.now();
        World.idle(world, Math.max(0, next - now - 1));
        // 다음 목표 프레임을 따라잡을 때까지는 별도의 처리를 하지 않는다
        if (now >= next) {
            console.log("-------------------------------------");
            World.processFrame(world);
            next = now + (1000 / 60);
        }
    }
}

main();
