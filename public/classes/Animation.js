function Animation(setup) {
    this.frames = setup.frames;
    this.activeFrame = setup.activeFrame || 0;
    this.stepTime = setup.stepTime || 100;
    this.stepStart = Date.now();
    this.currentLoop = 0;
    this.sheet = setup.sheet || SPRITE_SHEET;
    this.maxLoops = setup.maxLoops || 1;
    this.position = {
        x: 0,
        y: 0
    };
    this.angle = 0;
}

Animation.prototype.SetPosition = function (pos) {
    this.position = pos;
    return this;
};
Animation.prototype.SetLoop = function (maxLoops) {
    this.maxLoops = maxLoops;
};
Animation.prototype.addFrame = function (frame) {
    this.frames.push(frame);
    return this;
};
Animation.prototype.removeFrame = function (index) {
    this.frames.split(index, 1);
    return this;
};
Animation.prototype.nextStep = function () {
    this.stepStart = Date.now();
    if (this.activeFrame == this.frames.length - 1) {
        this.currentLoop++;
        this.activeFrame = 0;
        return true;
    } else {
        this.activeFrame++;
    }
    return this;
};
Animation.prototype.animate = function (x, y, angle) {
    push();
    x = x ? x : this.position.x;
    y = y ? y : this.position.y;

    translate(x, y);
    var af = this.frames[this.activeFrame];
    var pivot = {x: -af.frame.w * af.pivot.x, y: -af.frame.h * af.pivot.y};
    if (angle) rotate(angle, pivot);
    image(this.sheet, af.frame.x, af.frame.y, af.frame.w, af.frame.h, pivot.x, pivot.y, af.frame.w - CFG.MAP_TEARING_Y, af.frame.h - CFG.MAP_TEARING_Y);
    pop();
    if (Date.now() - this.stepStart > this.stepTime) {
        this.nextStep();
    }
};
Animation.prototype.play = function (position, loop) {
    position.Multiply(SCALE);
    this.SetPosition(position);
    this.currentLoop = 0;
    if (loop)
        this.SetLoop(loop);
    renderEngine.addAnimation(this);
};
Animation.animate = function (animation, animationState, x, y, angle) {
    var animName = animation + (animationState ? '.' + animationState : '');
    var animObj = eval(animName);
    if (!animObj) throw new AnimationNotDeclared('Cannot find animation ' + animName);
    animObj.animate(x, y, angle);
};
Animation.play = function (animation, position, loop) {
    animation.play(position, loop);
};
Animation.load = function () {
    ANIMATIONS = {
        WEAPONS: {
            ROCKETLUNCHER: {
                idle: new Animation({
                    frames: [
                        SPRITES_JSON.frames.rocket_idle
                    ]
                }),
                fire: new Animation({
                    stepTime: 333,
                    frames: [
                        SPRITES_JSON.frames.rocket_fire_0,
                        SPRITES_JSON.frames.rocket_fire_1,
                        SPRITES_JSON.frames.rocket_idle
                    ]
                })
            },
            SPAS: {
                idle: new Animation({
                    frames: [
                        SPRITES_JSON.frames.spas_idle
                    ]
                }),
                fire: new Animation({
                    stepTime: 400,
                    frames: [
                        SPRITES_JSON.frames.spas_0,
                        SPRITES_JSON.frames.spas_1
                    ]
                })
            },
            MACHINEGUN: {
                idle: new Animation({
                    frames: [
                        SPRITES_JSON.frames.machine_gun_idle
                    ]
                }),
                fire: new Animation({
                    frames: [
                        SPRITES_JSON.frames.machine_gun_0,
                        SPRITES_JSON.frames.machine_gun_1
                    ]
                })
            },
            LIGHTGUN: {
                idle: new Animation({
                    frames: [
                        SPRITES_JSON.frames.light_gun_idle
                    ]
                }),
                fire: new Animation({
                    frames: [
                        SPRITES_JSON.frames.light_gun_0,
                        SPRITES_JSON.frames.light_gun_1
                    ]
                })
            },
            CURVEGUN: {
                idle: new Animation({
                    frames: [
                        SPRITES_JSON.frames.curve_gun_idle
                    ]
                }),
                fire: new Animation({
                    frames: [
                        SPRITES_JSON.frames.curve_gun_idle,
                        SPRITES_JSON.frames.curve_gun_0
                    ]
                })
            },
            BOW: {
                idle: new Animation({
                    frames: [
                        SPRITES_JSON.frames.bow
                    ]
                }),
                fire: new Animation({
                    frames: [
                        SPRITES_JSON.frames.bow
                    ]
                })
            }
        },
        COLLECTABLES: {
            LIFEBOX: new Animation({
                frames: [
                    SPRITES_JSON.frames.life_box_crate
                ]
            }),
            AMMOBOX: {
                RocketLuncher: new Animation({
                    frames: [
                        SPRITES_JSON.frames.rocket_luncher_weapon_crate
                    ]
                }),
                Spas: new Animation({
                    frames: [
                        SPRITES_JSON.frames.spas_weapon_crate
                    ]
                }),
                LightGun: new Animation({
                    frames: [
                        SPRITES_JSON.frames.light_gun_weapon_crate
                    ]
                }),
                MachineGun: new Animation({
                    frames: [
                        SPRITES_JSON.frames.mini_gun_weapon_crate
                    ]
                }),
                CurveGun: new Animation({
                    frames: [
                        SPRITES_JSON.frames.curve_gun_weapon_crate
                    ]
                })
            },
            DOUBLEDAMAGE: new Animation({
                frames: [
                    SPRITES_JSON.frames.rocket_luncher_weapon_crate
                ]
            }),
            MAXIMUMDEFENSE: new Animation({
                frames: [
                    SPRITES_JSON.frames.rocket_luncher_weapon_crate
                ]
            })
        },
        BULLETS: {
            ROCKET: {
                fly: new Animation({
                    frames: [
                        SPRITES_JSON.frames.rocket_bullet
                    ]
                }),
                explode: new Animation({
                    frames: [
                        SPRITES_JSON.frames.exp_1,
                        SPRITES_JSON.frames.exp_2,
                        SPRITES_JSON.frames.exp_3,
                        SPRITES_JSON.frames.exp_4,
                        SPRITES_JSON.frames.exp_5,
                        SPRITES_JSON.frames.exp_6,
                        SPRITES_JSON.frames.exp_7,
                        SPRITES_JSON.frames.exp_8
                    ]
                })
            }
            ,
            ARROW: {
                fly: new Animation({
                    frames: [
                        SPRITES_JSON.frames.arrow
                    ]
                })
            }
            ,
            LIGHTBULLET: {
                fly: new Animation({
                    frames: [
                        SPRITES_JSON.frames.light_bullet
                    ]
                })
            }
            ,
            REGULARBULLET: {
                fly: new Animation({
                    frames: [
                        SPRITES_JSON.frames.regular_bullet
                    ]
                })
            }
            ,
            SPASBULLET: {
                fly: new Animation({
                    frames: [
                        SPRITES_JSON.frames.spas_bullet
                    ]
                })
            }
        }
        ,
        PLAYER: {
            BODY: [
                new Animation({
                    frames: [
                        SPRITES_JSON.frames.body_0
                    ]
                }),
                new Animation({
                    frames: [
                        SPRITES_JSON.frames.body_1
                    ]
                })
            ],
            FOOTSTEP: new Animation({
                frames: [
                    SPRITES_JSON.frames.foot_step
                ]
            }),
            HEAD: [
                new Animation({
                    frames: [
                        SPRITES_JSON.frames.head_0
                    ]
                }),
                new Animation({
                    frames: [
                        SPRITES_JSON.frames.head_1
                    ]
                }),
                new Animation({
                    frames: [
                        SPRITES_JSON.frames.head_2
                    ]
                })
            ],
            LEGS: {
                walk: new Animation({
                    frames: [
                        SPRITES_JSON.frames.step_0,
                        SPRITES_JSON.frames.step_1,
                        SPRITES_JSON.frames.step_2,
                        SPRITES_JSON.frames.step_3

                    ]
                }),
                stand: new Animation({
                    frames: [
                        SPRITES_JSON.frames.step_stand
                    ]
                }),
                jump: new Animation({
                    frames: [
                        SPRITES_JSON.frames.step_jump
                    ]
                })
            },
            DEAD: new Animation({
                frames: [
                    SPRITES_JSON.frames.dead
                ]
            })
        }
        ,
        WORLD: {}
    }
    ;
};