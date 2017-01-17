Player.prototype = Object.create(Entity.prototype);
Player.prototype.constructor = Player;
function Player(setup) {
    Entity.call(this);
    this.id = setup.id;
    this.displayName = setup.displayName || 'Player' + setup.id;
    this.health = setup.health || CFG.PLAYER.MAX_HEALTH;
    this.maxHealth = setup.maxHealth || CFG.PLAYER.MAX_HEALTH;
    this.speed = setup.speed || CFG.PLAYER.ACCELERATION;
    this.position = setup.position || new Vec2(CFG.MAP_WIDTH * .5, CFG.MAP_HEIGHT * .5);
    this.lookAngle = setup.lookAngle || 0;
    this._spawned = setup._spawned;
    this.team = setup.team || null;
    this.killsPerMatch = setup.killsPerMatch || 0;
    this.deathsPerMatch = setup.deathsPerMatch || 0;
    this.jumpAt = setup.jumpAt || null;
    this.isPlayer = setup.isPlayer || true;
    this.isSpectator = setup.isSpectator || true;
    this.isDead = setup.isDead || false;
    this.path = [];
    this.isWalking = setup.isWalking || false;
    this.isInAir = setup.isInAir || false;
    this.isReady = setup.isReady || false;
    this.activeWeapon = setup.activeWeapon || 'RocketLuncher';
    this.weapons = {
        'Spas': new Spas(this),
        'LightGun': new LightGun(this),
        'CurveGun': new CurveGun(this),
        'RocketLuncher': new RocketLuncher(this),
        'Bow': new Bow(this),
        'MachineGun': new MachineGun(this)
    };
    if (setup.weapons)
        for (var w in setup.weapons)
            this.weapons[w] = new global[w](this, setup.weapons[w]);
    this.buffs = {};
    if (setup.buffs)
        for (var b in setup.buffs)
            this.buffs[b] = new global[b](this, setup.buffs[b]);
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
    this.animationState = setup.animationState || 'stand';
    this.body = setup.body || 0;
    this.head = setup.head || 0;
    this.sfx = {
        jump: 'SFX.EFFECTS.JUMP',
        walk: 'SFX.EFFECTS.WALK'
    };
    this.density = 1;
    this.zIndex = 2;
}

Player.prototype.setup = function (engine) {
    Entity.prototype.setup.call(this, engine);
    this.position = new Vec2(this.position.x, this.position.y);
    var ptm_ratio = SCALE;
    var b2Vec2 = Vec2;
    var polygons = [{
        polygon: [new b2Vec2(-25 / ptm_ratio, 30 / ptm_ratio),
            new b2Vec2(-19 / ptm_ratio, -6 / ptm_ratio),
            new b2Vec2(3 / ptm_ratio, -23 / ptm_ratio),
            new b2Vec2(28 / ptm_ratio, 28 / ptm_ratio)]
    }, {
        polygon: [new b2Vec2(75 / ptm_ratio, 12 / ptm_ratio),
            new b2Vec2(75 / ptm_ratio, 30 / ptm_ratio),
            new b2Vec2(10 / ptm_ratio, 30 / ptm_ratio),
            new b2Vec2(10 / ptm_ratio, 12 / ptm_ratio)]
        ,
        filter: {
            categoryBits: CFG.COLLISION_GROUPS.PLAYER,
            maskBits: CFG.COLLISION_GROUPS.ALL ^ CFG.COLLISION_GROUPS.BULLET ^ CFG.COLLISION_GROUPS.ENERGY
        }
    }
    ];
    var entityDef = {
        position: this.position,
        allowSleep: false,
        density: this.density,
        friction: 0.5,
        polygons: polygons,
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
Player.prototype.draw = function () {
    var vec = this.getShootFix();
    vec.Add(this.position);
    var headAnim = 'ANIMATIONS.PLAYER.HEAD[' + this.head + ']';
    var bodyAnim = 'ANIMATIONS.PLAYER.BODY[' + this.body + ']';
    var legsAnim = 'ANIMATIONS.PLAYER.LEGS';
    var footStepAnim = 'ANIMATIONS.PLAYER.FOOTSTEP';
    this.path.forEach(function (val) {
        Animation.animate(footStepAnim, null, val.x * SCALE, val.y * SCALE, val.angle - HALF_PI);
    });
    Animation.animate(legsAnim, this.animationState, this.position.x * SCALE, this.position.y * SCALE, this.angle + HALF_PI);
    Animation.animate(bodyAnim, null, this.position.x * SCALE, this.position.y * SCALE, this.lookAngle + HALF_PI);
    Animation.animate(this.weapons[this.activeWeapon].anim, this.input.fire ? 'fire' : 'idle', vec.x * SCALE, vec.y * SCALE, this.lookAngle + HALF_PI);
    Animation.animate(headAnim, null, this.position.x * SCALE, this.position.y * SCALE, this.lookAngle + HALF_PI);

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
        this.buffs[buff].update();
        if (this.buffs[buff]._expired) delete this.buffs[buff];
    }
    if (this.physBody !== null) {
        if (Date.now() - this.jumpAt >= CFG.JUMP_TIME) this.isInAir = false;
        this.lookAngle = this.physBody.GetAngle();
        this.position = this.physBody.GetPosition();
    }
};
Player.prototype.applyInput = function (input, time) {
    if (!this.physBody) return;
    this.input = input;

    var angle = this.angle;

    if (this.input.isWalking && !this.isInAir) {
        if(!IS_SERVER) {
            if(frameCount%5 === 0) {
                this.path.push({x: this.position.x, y: this.position.y, angle: this.angle});
            }
            if(this.path.length>5) this.path.shift();
        }
        if (this.physBody.GetLinearVelocity().Length() > 1) {
            this.animationState = 'walk';
            SoundManager.worldPlay(this.sfx.walk, this.position, 1);
        }
        else this.animationState = 'stand';

        var velocity = new Vec2(this.input.x, this.input.y);
        velocity.Multiply(this.speed * this.engine.delta);
        velocity.Multiply(this.speed);

        angle = Math.atan2(velocity.y, velocity.x);
        if (!this.input.fire) this.lookAngle = angle;
        this.physBody.SetLinearVelocity(velocity, this.physBody.GetWorldCenter());
    } else {
        if (!this.isInAir) {
            this.animationState = 'stand';
            this.physBody.SetLinearVelocity(new Vec2(0, 0));
        }
    }

    if (this.input.fire && Math.abs(angle - this.lookAngle) >= HALF_PI) angle = this.lookAngle;
    this.angle = angle;

    this.physBody.SetAngle(this.lookAngle);

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
    if (this.input.ready) this.isReady = true;
};
Player.prototype.reset = function () {
    this.isDead = false;
    this.maxHealth = CFG.PLAYER.MAX_HEALTH;
    this.health = this.maxHealth;
    this.killsPerMatch = 0;
    this.deathsPerMatch = 0;
    this.isReady = false;
    this._spawned = false;
    this.buffs = {};
    this.weapons = {
        'Spas': new Spas(this),
        'LightGun': new LightGun(this),
        'CurveGun': new CurveGun(this),
        'RocketLuncher': new RocketLuncher(this),
        'Bow': new Bow(this),
        'MachineGun': new MachineGun(this)
    };
    if(!IS_SERVER) interface.showCounter(CFG.PLAYER.SPAWN_TIME);
};
Player.prototype.colide = function (body) {
    if (body.isPlayer) {
        if (this.activeWeapon == 'knife' && this.input.fire) {
            this.engine.dealDamage(body.id, 100);
        }
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
Player.prototype.addBuff = function (buff) {
    this.buffs[buff.constructor.name] = buff;
};
Player.prototype.getBuff = function (buff) {
    return this.buffs[buff];
};
Player.prototype.getFixedPos = function () {
    return new Vec2(this.position.x + this.input.camera.x, this.position.y + this.input.camera.y);
};
Player.prototype.getShootFix = function () {
    var mVec = Vec2.Rotate(null, this.lookAngle);
    mVec.Rotate(PI / 12);
    mVec.Multiply(0.73);
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
        maxHealth: this.maxHealth,
        speed: this.speed,
        input: this.input,
        isPlayer: true,
        isSpectator: this.isSpectator,
        isWalking: this.isWalking,
        isDead: this.isDead,
        isReady: this.isReady,
        angle: this.angle,
        lookAngle: this.lookAngle,
        killsPerMatch: this.killsPerMatch,
        deathsPerMatch: this.deathsPerMatch,
        activeWeapon: this.activeWeapon,
        head: this.head,
        body: this.body,
        _spawned: this._spawned,
        team: this.team,
        jumpAt: this.jumpAt,
        buffs: this.buffs,
        weapons: {
            'Spas': this.weapons['Spas']._simply(),
            'LightGun': this.weapons['LightGun']._simply(),
            'CurveGun': this.weapons['CurveGun']._simply(),
            'RocketLuncher': this.weapons['RocketLuncher']._simply(),
            'Bow': this.weapons['Bow']._simply(),
            'MachineGun': this.weapons['MachineGun']._simply()
        }
    }
};