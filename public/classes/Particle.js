
var Particle = function(position) {
    this.acceleration = createVector(0, 0.05);
    this.position = position.copy();
    this.lifespan = 255.0;
};

Particle.prototype.update = function(){
    this.velocity.add(this.acceleration);
    this.position.add(this.velocity);
    this.lifespan -= 2;
};
Particle.prototype.draw = function () {
    stroke(200, this.lifespan);
    strokeWeight(2);
    fill(127, this.lifespan);
    ellipse(this.position.x, this.position.y, 12, 12);
};