function Exception(msg) {
    this.msg = msg;
    this.toString = function () {
        return this.constructor.name + " exception: " + msg;
    };
    this.error = function () {
        console.error(this.toString());
    }
}

function AnimationNotDeclared(msg) {
    Exception.call(this, msg);
}
AnimationNotDeclared.prototype = new Exception;
AnimationNotDeclared.prototype.constructor = AnimationNotDeclared;

function SfxNotDeclared(msg) {
    Exception.call(this, msg);
}
SfxNotDeclared.prototype = new Exception;
SfxNotDeclared.prototype.constructor = SfxNotDeclared;

function NoServerEntityFound(msg) {
    Exception.call(this, msg);
}
NoServerEntityFound.prototype = new Exception;
NoServerEntityFound.prototype.constructor = NoServerEntityFound;
