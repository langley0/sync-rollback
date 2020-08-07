export interface Input {
    frame: number;
    data: number;
}

export namespace Input {
    export function create(frame: number, data: number): Input {
        return { frame, data };
    }

    export function equal(src: Input, dst: Input): boolean {
        return src.data === dst.data;
    }
}