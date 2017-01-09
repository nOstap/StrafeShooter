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
    }
    this.angle = 0;
}
Animation.prototype.SetPosition = function (pos) {
    this.position = pos;
    return this;
}
Animation.prototype.SetLoop = function (maxLoops) {
    this.maxLoops = maxLoops;
}
Animation.prototype.addFrame = function (frame) {
    this.frames.push(frame);
    return this;
}
Animation.prototype.removeFrame = function (index) {
    this.frames.split(index, 1);
    return this;
}
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
}
Animation.prototype.animate = function (x,y, angle) {
    push();
    x = x?x:this.position.x;
    y = y?y:this.position.y;

    translate(x, y);
    var af = this.frames[this.activeFrame];
    var pivot = {x: -af.frame.w * af.pivot.x, y: -af.frame.h * af.pivot.y};
    if (angle) rotate(angle, pivot);
    image(this.sheet, af.frame.x, af.frame.y, af.frame.w, af.frame.h, pivot.x, pivot.y, af.frame.w-CFG.MAP_TEARING_Y, af.frame.h-CFG.MAP_TEARING_Y);
    pop();
    if (Date.now() - this.stepStart > this.stepTime) {
        this.nextStep();
    }
}
Animation.prototype.play = function (position, loop) {
    position.Multiply(SCALE);
    this.SetPosition(position);
    if(loop)
    this.SetLoop(loop);
    renderEngine.addAnimation(this);
}
Animation.play = function (animation, position, loop) {
    position.Multiply(SCALE);
    animation.SetPosition(position);
    if(loop)
    animation.SetLoop(loop);
    renderEngine.addAnimation(animation);
}