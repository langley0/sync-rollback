import { World } from "./World";
import { Entity } from "./Entity";
import { Network } from "./Network";
import { Message, MessageType } from "./Message";
import { getInput } from "./gameInput";

const STARTING_HEALTH = 100;
const ROTATE_INCREMENT = 3;

const SHIP_RADIUS = 15;
const SHIP_WIDTH = 8;
const SHIP_TUCK = 3;

const SHIP_THRUST = 0.06;
const SHIP_MAX_THRUST = 4.0;

const MAX_BULLETS =30;
const BULLET_SPEED =5;
const BULLET_COOLDOWN = 8;
const BULLET_DAMAGE = 10;

const INPUT_THRUST            = (1 << 0);
const INPUT_BREAK             = (1 << 1);
const INPUT_ROTATE_LEFT       = (1 << 2);
const INPUT_ROTATE_RIGHT      = (1 << 3);
const INPUT_FIRE              = (1 << 4);

export interface Rect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
};

export interface Bullet {
    active: boolean;
    x: number;
    y: number;
    vx: number;
    vy: number;
}

export interface Ship {
    score: number;
    health: number;

    cooldown: number;
    heading: number;
    bullets: Bullet[];
    x: number;
    y: number;
    vx: number;
    vy: number;
}

export interface State {
    ships: Ship[];
    bounds: Rect;
}

export interface Game extends World {
    render: boolean;
    
    state: State,
    network: Network
}

function getBounds(): Rect {
    const canvas = document.getElementById("canvas") as HTMLCanvasElement;
    return { x: 0, y: 0, width: canvas.width, height: canvas.height };
}

function distance(x1: number, y1: number, x2: number , y2: number): number {
    const dx = x1- x2;
    const dy = y1 - y2;
    return Math.sqrt(dx*dx + dy*dy);
}

function updateShip(ship: Ship, fire: boolean, thrust: number, screen: Rect, others: Ship[]) {
    // 총알 발사
    --ship.cooldown;
    if (ship.cooldown <= 0) {
        if (fire) {
            const dx = Math.cos(ship.heading * Math.PI / 180);
            const dy = Math.sin(ship.heading * Math.PI / 180);
            if (ship.bullets.length < MAX_BULLETS) {
                const bullet = {
                    active: true,
                    x: ship.x + SHIP_RADIUS * dx,
                    y: ship.y + SHIP_RADIUS * dy,
                    vx: ship.vx + BULLET_SPEED * dx,
                    vy: ship.vy + BULLET_SPEED * dy,
                }
                ship.bullets.push(bullet);
                ship.cooldown = BULLET_COOLDOWN;
            }
        }
    } 
    // 이동 가속
    const dx = thrust * Math.cos(ship.heading * Math.PI / 180);
    const dy = thrust * Math.sin(ship.heading * Math.PI / 180);

    ship.vx += dx;
    ship.vy += dy;
    const mag = distance(0, 0, ship.vx, ship.vy);
    if (mag > SHIP_MAX_THRUST) {
        ship.vx = ship.vx * SHIP_MAX_THRUST / mag;
        ship.vy = ship.vy * SHIP_MAX_THRUST / mag;
    }

    // 위치 이동
    ship.x += ship.vx;
    ship.y += ship.vy;

    // 모서리에 튕기기
    if (ship.x - SHIP_RADIUS < screen.x  || 
        ship.x + SHIP_RADIUS > screen.x + screen.width) {
        ship.vx *= -1;
        ship.x += (ship.vx * 2);
    }

    if (ship.y - SHIP_RADIUS < screen.y  || 
        ship.y + SHIP_RADIUS > screen.y + screen.height) {
        ship.vy *= -1;
        ship.y += (ship.vy * 2);
    }

    // 총탄 계산
    ship.bullets.forEach(b => {
        if (b.active) {
            b.x += b.vx;
            b.y += b.vy;
            if( b.x < screen.x || 
                b.y < screen.y || 
                b.x > screen.x  + screen.width || 
                b.y > screen.y  + screen.height) {
                b.active = false;
            } else {
                // 다른 오브젝트와의 거리 계산
                others.forEach(o => {
                    if (distance(b.x, b.y, o.x, o.y) < SHIP_RADIUS) {
                        o.score ++;
                        o.health -= BULLET_DAMAGE;
                        b.active = false;
                    }
                })
            }
        }
    });

    ship.bullets = ship.bullets.filter(b => b.active);
}

export namespace Game {
    // 초기상태를 구성한다
    
    export function init(numberOfPlayer: number, controlled: number, network: Network): Game {
        const bounds = getBounds();
        const w = bounds.width;
        const h = bounds.height;
        const r = h / 4;

        const ships: Ship[] = [];
        const state =  { ships, bounds };
        
        const game: Game = { 
            render: true, 
            state, 
            network, 
            ...World.create() 
        };

        for(let i = 0; i < numberOfPlayer; ++i) {
            const heading = i * 360 / numberOfPlayer;
            const theta = heading * Math.PI / 180;
            const cos = Math.cos(theta);
            const sin = Math.sin(theta);

            const ship = {
                score: 0,
                health: STARTING_HEALTH,
                cooldown: 0,
                heading: (heading + 180) % 360,
                bullets: [],
                x: w/2 + r*cos, 
                y: h/2 + r*sin,
                vx: 0,
                vy: 0,
            };

            const entity = Entity.create(i, controlled === i);
            entity.onUpdate = (e, f, input) => {
                const ship = game.state.ships[i];
                const otherShip = game.state.ships.filter((_, index) => index !== i);

                let thrust = 0;
                let fire = false;

                if (input.data & INPUT_ROTATE_RIGHT) {
                    ship.heading = (ship.heading + ROTATE_INCREMENT) % 360;
                }
                if (input.data & INPUT_ROTATE_LEFT) {
                    ship.heading = (ship.heading - ROTATE_INCREMENT + 360) % 360;
                }
                if (input.data & INPUT_THRUST) {
                    thrust += SHIP_THRUST;
                }
                if (input.data & INPUT_BREAK) {
                    thrust -= SHIP_THRUST;
                }
                if (input.data & INPUT_FIRE) {
                    fire = true;
                }
                updateShip(ship, fire, thrust, game.state.bounds, otherShip);
            };

            game.state.ships.push(ship);
            game.entities.push(entity);
            Network.link(network, i, (m: Message) => {
                Entity.onMessage(entity, m);
            });
        }
        game.controlled = controlled;

        // 각각의 ship 을 월드 엔티티로 선언한다
        return game;
    }

    export function runFrame(game: Game) {
        // 입력을 받는다
        const controlled = game.entities.find(e => e.id === game.controlled);
        // 컨트롤 오브젝트에 입력을 넘긴다
        if (controlled !== undefined) {
            const inputValue = getInput();
            Entity.addLocalInput(controlled , game.currentFrame, inputValue);
            // 네트워크로 입력을 전송시킨다
            game.network.send({ 
                type: MessageType.Input, 
                from: controlled.id, 
                body: { frame: game.currentFrame, data: inputValue }
            });
        }
        Network.update(game.network);
        // update game logic
        World.advance(game);
        
        // render
        if (game.render) {
            render(game);
        }
    }

    function render(game: Game) {
        const canvas = document.getElementById("canvas") as HTMLCanvasElement;
        const context = canvas.getContext("2d");
        if (context === null) { return; }
    
        const w = canvas.width;
        const h = canvas.height;
        
        context.fillStyle = "black";
        context.fillRect(0, 0, w, h);

        game.state.ships.forEach(ship => {
            drawShip(context, ship.x, ship.y, ship.heading, ship.bullets);
        });
    }

    function drawShip(context: CanvasRenderingContext2D, x: number, y: number, heading: number, bullets: {x: number, y: number}[]) {
        const shape = [
            [SHIP_RADIUS, 0],
            [-SHIP_RADIUS, SHIP_WIDTH],
            [SHIP_TUCK-SHIP_RADIUS, 0],
            [-SHIP_RADIUS, -SHIP_WIDTH],
            [SHIP_RADIUS, 0],
        ];
    
        const cos = Math.cos(heading * Math.PI / 180);
        const sin = Math.sin(heading * Math.PI / 180);
        
        const points:{x: number, y: number}[] = [];
    
        shape.forEach(s => {
            const px = s[0] * cos - s[1] * sin + x;
            const py = s[0] * sin + s[1] * cos + y;
            points.push({x: px, y: py });
        });
    
        const firstP = points.shift()!;
        context.beginPath();
        context.moveTo(firstP.x, firstP.y);
        points.forEach(p => {
            context.lineTo(p.x, p.y);
        });
        context.strokeStyle = "white";
        context.stroke();
    
        context.fillStyle = "rgb(255, 192, 0)";
        bullets.forEach(b => {
            context.fillRect(b.x -1, b.y-1, 3, 3);
        });
    }
}