export const INPUT_THRUST            = (1 << 0);
export const INPUT_BREAK             = (1 << 1);
export const INPUT_ROTATE_LEFT       = (1 << 2);
export const INPUT_ROTATE_RIGHT      = (1 << 3);
export const INPUT_FIRE              = (1 << 4);
export const INPUT_BOMB              = (1 << 5);

let localInputs: number[] = [];

export function initInput() {
    function onKeydown(e: KeyboardEvent) {
        if (e.key ==="ArrowLeft") {
            localInputs.push(INPUT_ROTATE_LEFT);
        }
    
        if (e.key ==="ArrowRight") {
            localInputs.push(INPUT_ROTATE_RIGHT);
        }
    
        if (e.key ==="ArrowUp") {
            localInputs.push(INPUT_THRUST);
        }
    
        if (e.key ==="ArrowDown") {
            localInputs.push(INPUT_BREAK);
        }
    
        if (e.key ==="ArrowDown") {
            localInputs.push(INPUT_BREAK);
        }
    
        if (e.ctrlKey) {
            localInputs.push(INPUT_FIRE);
        }
    }
    document.addEventListener("keydown", onKeydown);
   
}

export function getInput(): number{
    const clone = localInputs.splice(0, localInputs.length);
    return clone.reduce((result, input) => {
        return result | input;
    }, 0);
}
