const assert = console.assert;
const log = console.log;


export interface Input {
    frame: number;
    data: number;
}


export namespace Input {
    export function create(frame: number, data: number): Input {
        return { frame, data };
    }

    export function equal(src: Input, other: Input, bitsonly: boolean) {
        if (!bitsonly && src.frame !== other.frame) {
            log(`frames don't match: ${src.frame}, ${other.frame}`);
        }
        if (src.data !== other.data) {
            log(`data don't match`);
        }
        return (bitsonly || src.frame === other.frame) &&
            src.data === other.data;
    }
}