Player.prototype = Object.create(Entity.prototype);
Player.prototype.constructor = Player;
function Player(setup) {
    Entity.call(this);
    this.id = setup.id;
    this.displayName = setup.displayName || 'Player' + setup.id;
    this.gameID = setup.gameID || null;
    this.health = setup.health || CFG.PLAYER.MAX_HEALTH;
    this.maxHealth = setup.maxHealth || CFG.PLAYER.MAX_HEALTH;
    this.size = 0.35;
    this.density = 1;
    this.lookAngle = 0;
    this.speed = setup.speed || CFG.PLAYER.ACCELERATION;
    this.position = setup.position || new Vec2(CFG.MAP_WIDTH*.5,CFG.MAP_HEIGHT*.5);
    this.zIndex = 2;
    this.team = null;
    this.kpr = 0;
    this.dpr = 0;
    this.jumpAt = null;
    this.ready = false;
    this.isPlayer = true;
    this.isSpectator = true;
    this.isDead = false;
    this.isWalking = false;
    this.isInAir = false;
    this.buffs = {
        damage: null,
        speed: null,
        maxhealth: null,
        immortal: null
    };
    this.weapons = {
        'Spas': new Spas(this),
        'LightGun': new LightGun(this),
        'CurveGun': new CurveGun(this),
        'RocketLuncher': new RocketLuncher(this),
        'Bow': new Bow(this),
        'MachineGun': new MachineGun(this)
    }
    if (setup.weapons)
        for (var w in setup.weapons)
            this.weapons[w] = new global[w](this, setup.weapons[w]);
    this.activeWeapon = setup.activeWeapon || 'RocketLuncher';
    this.input = setup.input || {
            x: 0,
            y: 0,
            fire: false,
            jump: false,
            scale: SCALE,
            switch_weapon: false,
            camera: new Vec2(0, 0),
            pointer: new Vec2(0, 0)
        };
    this.sfx = {
        jump: 'SFX.EFFECTS.JUMP',
        walk: 'SFX.EFFECTS.WALK'
    };
    if (!IS_SERVER) {
        this.footAnimation = {
            walk: new Animation({
                frames: [
                    SPR_OBJ.frames.step_0,
                    SPR_OBJ.frames.step_1,
                    SPR_OBJ.frames.step_2,
                    SPR_OBJ.frames.step_3

                ]
            }),
            stand: new Animation({
                frames: [
                    SPR_OBJ.frames.step_stand
                ]
            }),
            jump: new Animation({
                frames: [
                    SPR_OBJ.frames.step_jump
                ]
            })
        };
        this.bodyAnimation = new Animation({
            frames: [
                SPR_OBJ.frames.body_0
            ]
        });
        this.headAnimation = new Animation({
            frames: [
                SPR_OBJ.frames.head_1
            ]
        });
    }
    this.animationState = 'stand';
}

Player.prototype.draw = function () {
    this.footAnimation[this.animationState].animate(this.position.x * SCALE, this.position.y * SCALE, this.angle + HALF_PI);
    this.bodyAnimation.animate(this.position.x * SCALE, this.position.y * SCALE, this.lookAngle + HALF_PI);

    if (this.weapons[this.activeWeapon].anim) {
        var vec = this.getShootFix();
        vec.Add(this.position);
        this.weapons[this.activeWeapon].anim[this.input.fire ? 'fire' : 'idle']
            .animate(vec.x * SCALE, vec.y * SCALE, this.lookAngle + HALF_PI);
    }

    this.headAnimation.animate(this.position.x * SCALE, this.position.y * SCALE, this.lookAngle + HALF_PI);
}
Player.prototype.setup = function (engine) {
    Entity.prototype.setup.call(this, engine);
    var entityDef = {
        radius: this.size,
        position: this.position,
        allowSleep: false,
        density: this.density,
        friction: 0.5,
        categoryBits: CFG.COLLISION_GROUPS.PLAYER,
        restitution: 0,
        userData: {
            id: this.id,
            elementType: CFG.COLLISION_GROUPS.PLAYER,
            ent: this
        }
    };
    this.physBody = physicsEngine.addBody(entityDef);
    this.physBody.SetFixedRotation(true);
    this.physBody.SetLinearVelocity(new Vec2(0, 0));
};
Player.prototype.update = function () {
    if (this.health <= 0) {
        this.isDead = true;
        this.physBody.SetActive(false);
        this.animationState = 'die';
    } else {
        if (this.isDead) {
            this.isDead = false;
            this.physBody.SetActive(true);
            this.animationState = 'stand';
        }
    }
    for (var buff in this.buffs) {
        if (this.buffs[buff] !== null) {
            this.buffs[buff].expired -= this.engine.delta;
            if (this.buffs[buff].expired <= 0) this.buffs[buff] = null;
        }
    }
    if (this.physBody !== null) {
        if (Date.now()-this.jumpAt >= CFG.JUMP_TIME) this.isInAir = false;
        this.angle = this.physBody.GetAngle();
        this.position = this.physBody.GetPosition();
    }
};
Player.prototype.applyInput = function (input, time) {
    if (!this.physBody) return;
    this.input = input;

    var angle = this.angle;

    if (this.input.isWalking && !this.isInAir) {
        if (this.physBody.GetLinearVelocity().Length() > 1) {
            this.animationState = 'walk';
            SoundManager.worldPlay(this.sfx.walk, this.position, 1);
        }
        else this.animationState = 'stand';

        var velocity = new Vec2(this.input.x, this.input.y);
        velocity.Multiply(this.speed * this.engine.delta);
        velocity.Multiply(this.speed);

        angle = Math.atan2(velocity.y, velocity.x);

        if (!this.input.fire) this.lookAngle = this.angle;

        this.physBody.SetLinearVelocity(velocity, this.physBody.GetWorldCenter());
    } else {
        if (!this.isInAir) {
            this.animationState = 'stand';
            this.physBody.SetLinearVelocity(new Vec2(0, 0));
        }
    }

    if(this.input.fire && Math.abs(angle-this.lookAngle) >= HALF_PI) angle = this.lookAngle;

    this.physBody.SetAngle(angle);



    if (this.input.fire) {
        this.weapons[this.activeWeapon].startFire(this);
    } else {
        this.weapons[this.activeWeapon].stopFire(this);
    }

    this.isWalking = this.input.isWalking;

    if (this.input.jump && !this.isInAir) this.jump(time);

    if (this.input.switch_weapon) {
        if (typeof this.input.switch_weapon == 'string')
            this.switchWeapon(this.input.switch_weapon);
        else
            this.switchWeapon();
    }
};
Player.prototype.show = function () {

};
Player.prototype.jump = function () {
    SoundManager.worldPlay(this.sfx.jump, this.position);
    this.isInAir = true;
    this.jumpAt = Date.now();
    this.animationState = 'jump';
    this.zIndex = 2;
    var velocity = new Vec2(this.input.x, this.input.y);
    var jump_speed = this.speed * 1.3;
    velocity.Multiply(jump_speed * this.engine.delta);
    velocity.Multiply(jump_speed);
    this.physBody.SetLinearVelocity(velocity);
};
Player.prototype.addBuff = function (buff, mult, exp) {
    if (this.buffs[buff] == null)
        this.buffs[buff] = {multipler: mult, expired: exp};
    else
        this.buffs[buff].expired += exp;
};
Player.prototype.getBuff = function (buff) {
    return this.buffs[buff];
};
Player.prototype.getFixedPos = function () {
    return new Vec2(this.position.x + this.input.camera.x, this.position.y + this.input.camera.y);
};
Player.prototype.getShootFix = function () {
    var mVec = Vec2.Rotate(null, this.lookAngle);
    mVec.Rotate(PI/12);
    mVec.Multiply(0.7);
    return mVec;
};
Player.prototype.switchWeapon = function (weapon) {
    this.weapons[this.activeWeapon].disactivate();
    if (weapon) {
        this.activeWeapon = weapon;
    } else {
        var wKeys = Object.keys(this.weapons);
        this.activeWeapon = wKeys[wKeys.indexOf(this.activeWeapon) + 1];
        if (!this.activeWeapon) this.activeWeapon = wKeys[0];
    }
    this.weapons[this.activeWeapon].activate();
};
Player.prototype._simply = function () {
    return {
        id: this.id,
        position: this.position,
        class: this.class,
        displayName: this.displayName,
        lifetime: this.lifetime,
        health: this.health,
        input: this.input,
        isPlayer: true,
        isSpectator: this.isSpectator,
        isWalking: this.isWalking,
        angle: this.angle,
        lookAngle: this.lookAngle,
        buffs: this.buffs,
        kpr: this.kpr,
        dpr: this.dpr,
        weapons: {
            'Spas': this.weapons['Spas']._simply(),
            'LightGun': this.weapons['LightGun']._simply(),
            'CurveGun': this.weapons['CurveGun']._simply(),
            'RocketLuncher': this.weapons['RocketLuncher']._simply(),
            'Bow': this.weapons['Bow']._simply(),
            'MachineGun': this.weapons['MachineGun']._simply()
        },
        _spawned: this._spawned,
        zIndex: 0
    }
};