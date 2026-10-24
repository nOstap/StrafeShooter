Player.prototype = Object.create(Entity.prototype);
Player.prototype.constructor = Player;
function Player(setup) {
    Entity.call(this);
    this.id = setup.id;
    this.displayName = setup.displayName || 'Player' + setup.id;
    this.health = setup.health != null ? setup.health : CFG.PLAYER.MAX_HEALTH;
    this.maxHealth = setup.maxHealth || CFG.PLAYER.MAX_HEALTH;
    this.speed = setup.speed || CFG.PLAYER.SPEED;
    this.position = setup.position ? new Vec2(setup.position.x, setup.position.y) : new Vec2(CFG.MAP_WIDTH * .5, CFG.MAP_HEIGHT * .5);
    this.lookAngle = setup.lookAngle || 0;
    this._spawned = setup._spawned || false;
    this.isDeadH = setup.isDeadH || false;
    this.team = setup.team || null;
    this.killsPerMatch = setup.killsPerMatch || 0;
    this.deathsPerMatch = setup.deathsPerMatch || 0;
    this.jumpAt = setup.jumpAt || null;
    this.jumpTick = null;
    this.isPlayer = true;
    this.isSpectator = setup.isSpectator !== undefined ? setup.isSpectator : true;
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
            if (this.weapons[w]) this.weapons[w].ammunition = setup.weapons[w].ammunition;
    this.buffs = {};
    if (setup.buffs)
        for (var b in setup.buffs)
            if (global[b] && setup.buffs[b].timeLeft > 0) this.buffs[b] = new global[b](setup.buffs[b].timeLeft, this);
    this.input = Player.continuousInput(setup.input);
    // Networking
    this.inputQueue = [];
    this.lastSeq = 0;
    this.lastQueuedSeq = null;
    this.lastSentSeq = null;
    this.lastSwitchSeq = 0;
    this._hitAt = 0;
    this.animationState = setup.animationState || 'stand';
    this.body = setup.body || 0;
    this.head = setup.head || 0;
    this.sfx = {
        jump: 'SFX.EFFECTS.JUMP',
        walk: 'SFX.EFFECTS.WALK',
        hurt: 'SFX.EFFECTS.HURT',
        die: 'SFX.EFFECTS.DEATH'
    };
    this.density = 1;
    this.group = 'players';
    this.zIndex = 2;
}

Player.JUMP_TICKS = Math.round(CFG.JUMP_TIME / CFG.TICK_RATE);

// The part of an input that describes held state; one-shot actions are stripped so a
// repeated / interpolated input never re-triggers a jump or weapon switch.
Player.continuousInput = function (input) {
    input = input || {};
    return {
        seq: input.seq || 0,
        x: input.x || 0,
        y: input.y || 0,
        isWalking: !!input.isWalking,
        fire: !!input.fire,
        jump: false,
        switch_weapon: false,
        aim: input.aim ? {x: input.aim.x, y: input.aim.y} : {x: 0, y: 0}
    };
};
// Server side validation of client input (never trust the wire).
Player.sanitizeInput = function (input, player) {
    if (!input || typeof input !== 'object') return null;
    var num = function (v) {
        v = +v;
        return isFinite(v) ? v : 0;
    };
    var x = Math.max(-1, Math.min(1, num(input.x)));
    var y = Math.max(-1, Math.min(1, num(input.y)));
    var len = Math.sqrt(x * x + y * y);
    if (len > 1) {
        x /= len;
        y /= len;
    }
    var sw = input.switch_weapon;
    if (typeof sw === 'string') sw = player.weapons[sw] ? sw : false;
    else sw = !!sw;
    return {
        seq: Math.floor(num(input.seq)),
        x: x,
        y: y,
        isWalking: !!input.isWalking && len > 0,
        fire: !!input.fire,
        jump: !!input.jump,
        switch_weapon: sw,
        aim: input.aim ? {x: num(input.aim.x), y: num(input.aim.y)} : {x: 0, y: 0}
    };
};

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
    this.position = this.physBody.GetPosition();
    this._prev = null;
};
Player.prototype.renderPos = function () {
    var pos = Entity.prototype.renderPos.call(this);
    if (!IS_SERVER && this.id == gameEngine.local_player) {
        pos.x += gameEngine.visualError.x;
        pos.y += gameEngine.visualError.y;
    }
    return pos;
};
Player.prototype.draw = function () {
    var pos = this.renderPos();
    var px = pos.x * SCALE, py = pos.y * SCALE;
    var vec = this.getShootFix();
    vec.Add(pos);
    var headAnim = 'ANIMATIONS.PLAYER.HEAD[' + this.head + ']';
    var bodyAnim = 'ANIMATIONS.PLAYER.BODY[' + this.body + ']';
    var legsAnim = 'ANIMATIONS.PLAYER.LEGS';
    var deadAnim = 'ANIMATIONS.PLAYER.DEAD';
    var footStepAnim = 'ANIMATIONS.PLAYER.FOOTSTEP';
    if (this.isDead) {
        Animation.animate(deadAnim, null, px, py);
        return;
    }
    this.path.forEach(function (val) {
        Animation.animate(footStepAnim, null, val.x * SCALE, val.y * SCALE, val.angle - HALF_PI);
    });
    var lift = this.isInAir && this.jumpTick !== null ? Math.sin(Math.min(1, (this.engine.tick - this.jumpTick + gameEngine.alpha) / Player.JUMP_TICKS) * PI) : 0;
    renderEngine.drawShadow(px, py, 34 - lift * 8, 0.3 - lift * 0.12, lift * 18);

    if (this.buffs.MaximumDefenseBuff) renderEngine.drawGlow(px, py, 120, [80, 170, 255], 0.5);
    if (this.buffs.DoubleDamageBuff) renderEngine.drawGlow(px, py, 120, [255, 60, 40], 0.5);

    push();
    if (lift) {
        // Jumping: a slight scale-up sells the height on a top-down view.
        translate(px, py);
        scale(1 + lift * 0.18);
        translate(-px, -py);
    }
    Animation.animate(legsAnim, this.animationState, px, py, this.angle + HALF_PI);
    Animation.animate(bodyAnim, null, px, py, this.lookAngle + HALF_PI);
    Animation.animate(this.weapons[this.activeWeapon].anim, this.input.fire ? 'fire' : 'idle', vec.x * SCALE, vec.y * SCALE, this.lookAngle + HALF_PI);
    Animation.animate(headAnim, null, px, py, this.lookAngle + HALF_PI);
    pop();

    var sinceHit = Date.now() - this._hitAt;
    if (sinceHit < 150) renderEngine.drawGlow(px, py, 110, [255, 40, 40], 0.7 * (1 - sinceHit / 150));

    this.drawNameplate(px, py);
};
Player.prototype.drawNameplate = function (px, py) {
    var ctx = drawingContext;
    var ratio = Math.max(0, Math.min(1, this.health / this.maxHealth));
    var w = 60, h = 7, x = px - w / 2, y = py - 58;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = 'hsl(' + Math.round(ratio * 120) + ',90%,50%)';
    ctx.fillRect(x, y, w * ratio, h);
    if (this.maxHealth > CFG.PLAYER.MAX_HEALTH) {
        ctx.strokeStyle = '#7fd0ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
    }
    ctx.restore();
    push();
    strokeWeight(3);
    stroke(this.id == gameEngine.local_player ? '#1b7a1b' : '#0b4fa8');
    fill(255);
    textFont(FONT);
    textSize(16);
    textAlign(CENTER, BOTTOM);
    text(this.displayName, px, y - 4);
    pop();
};
Player.prototype.update = function () {
    if (this.health <= 0) {
        if (!this.isDead) {
            this.zIndex = 1;
            this.isDeadH = true;
            this.physBody.SetActive(false);
            SoundManager.worldPlay(this.sfx.die, this.position);
            if (!IS_SERVER) particles.death(this.position.x, this.position.y);
            this.weapons[this.activeWeapon].stopFire();
        }
        this.animationState = 'die';
        this.isDead = true;

    } else {
        if (this.isDead) {
            this.isDead = false;
            this.zIndex = 2;
            this.physBody.SetActive(true);
            this.animationState = 'stand';
        }
    }
    for (var buff in this.buffs) {
        this.buffs[buff].update();
        if (this.buffs[buff]._expired) delete this.buffs[buff];
    }
    if (this.physBody !== null) {
        if (this.isInAir && this.jumpTick !== null && this.engine.tick - this.jumpTick >= Player.JUMP_TICKS) {
            this.isInAir = false;
            if (!IS_SERVER) particles.dust(this.position.x, this.position.y, 10);
        }
        this.lookAngle = this.physBody.GetAngle();
        this.position = this.physBody.GetPosition();
    }
    if (!IS_SERVER && !this.isDead) {
        if (this.buffs.DoubleDamageBuff && this.engine.tick % 2 === 0)
            particles.aura(this.position.x, this.position.y, [255, 80, 50]);
        if (this.buffs.MaximumDefenseBuff && this.engine.tick % 2 === 0)
            particles.aura(this.position.x, this.position.y, [90, 180, 255]);
    }
};
Player.prototype.applyInput = function (input, time) {
    if (!this.physBody) return;

    if (this.isDead) {
        this.input = Player.continuousInput(input);
        this.input.fire = false;
        return;
    }

    var angle = this.angle;

    if (input.isWalking && !this.isInAir) {
        if (!IS_SERVER && this.engine.tick % 5 === 0) {
            this.path.push({x: this.position.x, y: this.position.y, angle: this.angle});
            if (this.path.length > 10) this.path.shift();
            particles.dust(this.position.x, this.position.y, 1);
        }
        this.animationState = 'walk';
        SoundManager.worldPlay(this.sfx.walk, this.position, 1);

        // Constant speed: identical on every machine regardless of frame rate.
        var velocity = new Vec2(input.x * this.speed, input.y * this.speed);

        angle = Math.atan2(velocity.y, velocity.x);
        if (!input.fire) this.lookAngle = angle;
        this.physBody.SetLinearVelocity(velocity);
    } else {
        if (!this.isInAir) {
            this.animationState = 'stand';
            this.physBody.SetLinearVelocity(new Vec2(0, 0));
        }
    }

    if (input.fire && Math.abs(angle - this.lookAngle) >= HALF_PI) angle = this.lookAngle;
    this.angle = angle;

    this.physBody.SetAngle(this.lookAngle);

    this.isWalking = input.isWalking;
    var prevInput = this.input;
    this.input = Player.continuousInput(input);

    if (input.switch_weapon) {
        if (typeof input.switch_weapon == 'string')
            this.switchWeapon(input.switch_weapon);
        else
            this.switchWeapon();
    }

    if (input.fire) {
        this.weapons[this.activeWeapon].startFire(this);
    } else if (prevInput.fire) {
        this.weapons[this.activeWeapon].stopFire(this);
    }

    if (input.jump && !this.isInAir) this.jump(time);
};
/**
 * Client: drive a remote player from interpolated server state. Its body is moved
 * kinematically (no local velocity) so it never drifts from what the server says.
 */
Player.prototype.applyRemoteState = function (state) {
    var body = this.physBody;
    var cur = body.GetPosition();
    var moved = Math.abs(cur.x - state.x) + Math.abs(cur.y - state.y);
    body.SetPositionAndAngle(new Vec2(state.x, state.y), state.lookAngle);
    body.SetLinearVelocity(new Vec2(0, 0));
    this.position = body.GetPosition();
    this.lookAngle = state.lookAngle;
    this.angle = state.angle;
    if (this.isDead) return;
    var walking = moved > 0.02;
    if (this.isInAir) this.animationState = 'jump';
    else this.animationState = walking ? 'walk' : 'stand';
    if (walking && !this.isInAir && this.engine.tick % 5 === 0) {
        this.path.push({x: this.position.x, y: this.position.y, angle: this.angle});
        if (this.path.length > 10) this.path.shift();
        particles.dust(this.position.x, this.position.y, 1);
    }
    var prevFire = this.input.fire;
    if (state.input) {
        this.input = Player.continuousInput({
            x: state.input.x, y: state.input.y, isWalking: state.input.w, fire: state.input.f,
            aim: {x: state.input.ax, y: state.input.ay}
        });
    }
    if (this.input.fire) this.weapons[this.activeWeapon].startFire(this);
    else if (prevFire) this.weapons[this.activeWeapon].stopFire(this);
};
Player.prototype.onDamaged = function (amount) {
    this._hitAt = Date.now();
    var pos = this.renderPos();
    particles.blood(pos.x, pos.y, Math.min(30, 4 + amount));
    particles.damageNumber(pos.x, pos.y - 0.5, Math.round(amount));
    if (this.id == gameEngine.local_player) renderEngine.onLocalDamage(amount);
};
Player.prototype._reset = function (data) {
    this.maxHealth = CFG.PLAYER.MAX_HEALTH;
    this.health = this.maxHealth;
    if (data.isSpectator) {
        this.killsPerMatch = 0;
        this.deathsPerMatch = 0;
    }
    this.position = data.position;
    this.zIndex = 2;
    this.isDeadH = data.isDeadH || false;
    this.isSpectator = data.isSpectator || this.isSpectator;
    this._spawned = data._spawned || this._spawned;
    this.isInAir = false;
    this.path = [];
    this.buffs = {};
    if (this.physBody) {
        this.physBody.SetPosition(data.position);
        this.physBody.SetLinearVelocity(new Vec2(0, 0));
        this.position = this.physBody.GetPosition();
    }
    for (var wIndex in this.weapons) {
        this.weapons[wIndex]._reset();
    }
};
Player.prototype.colide = function (body) {
    if (body.isPlayer) {
        if (this.activeWeapon == 'knife' && this.input.fire) {
            this.engine.dealDamage(body.id, 100, this.id);
        }
    }
};
Player.prototype.show = function () {

};
Player.prototype.jump = function () {
    SoundManager.worldPlay(this.sfx.jump, this.position);
    this.isInAir = true;
    this.jumpAt = Date.now();
    this.jumpTick = this.engine.tick;
    this.animationState = 'jump';
    this.zIndex = 2;
    var jump_speed = this.speed * CFG.PLAYER.JUMP_MULTIPLIER;
    var velocity = new Vec2(this.input.x * jump_speed, this.input.y * jump_speed);
    this.physBody.SetLinearVelocity(velocity);
    if (!IS_SERVER) particles.dust(this.position.x, this.position.y, 8);
};
Player.prototype.addBuff = function (buff) {
    this.buffs[buff.constructor.name] = buff;
};
Player.prototype.getBuff = function (buff) {
    return this.buffs[buff] || null;
};
Player.prototype.getFixedPos = function () {
    return new Vec2(this.position.x, this.position.y);
};
Player.prototype.getShootFix = function () {
    var mVec = Vec2.Rotate(null, this.lookAngle);
    mVec.Rotate(PI / 12);
    mVec.Multiply(0.73);
    return mVec;
};
Player.prototype.switchWeapon = function (weapon) {
    if (weapon && !this.weapons[weapon]) return;
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
Player.prototype._snapshot = function () {
    var ammo = [];
    for (var i = 0; i < CFG.WEAPONS.length; i++) {
        var w = this.weapons[CFG.WEAPONS[i]];
        ammo.push(w ? w.ammunition : 0);
    }
    var pos = this.physBody ? this.physBody.GetPosition() : this.position;
    return {
        p: [_round(pos.x), _round(pos.y)],
        la: _round(this.lookAngle),
        a: _round(this.angle),
        h: this.health,
        mh: this.maxHealth,
        k: this.killsPerMatch,
        d: this.deathsPerMatch,
        w: this.activeWeapon,
        dead: this.isDeadH,
        rdy: this.isReady,
        air: this.isInAir,
        s: this.lastSeq,
        am: ammo,
        'in': {
            x: _round(this.input.x),
            y: _round(this.input.y),
            w: this.input.isWalking,
            f: this.input.fire,
            ax: _round(this.input.aim.x),
            ay: _round(this.input.aim.y)
        }
    };
};
Player.prototype._simply = function () {
    var buffs = {}, weapons = {};
    for(var index in this.buffs) {
        buffs[index] = this.buffs[index]._simply();
    }
    for(var index in this.weapons) {
        weapons[index] = this.weapons[index]._simply();
    }
    return {
        id: this.id,
        position: {x: this.position.x, y: this.position.y},
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
        isDeadH: this.isDeadH,
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
        buffs: buffs,
        weapons: weapons
    }
};
