function InputEngine() {
    this.bindings = {}
    this.actions = {}
    this.presses = {}
    this.locks = {}
    this.bind = function(key, action) {
        this.bindings[key] = action;
    }
    this.unbind = function(key) {
        this.bindings[key] = null;
    }

}

