export class InputManager {
  constructor() { this.keys={}; this.mouseButtons={}; this._accDelta={x:0,y:0}; this._handlers={}; this.init(); }
  init() {
    this._handlers.keydown=(e)=>{this.keys[e.code]=true;this.keys[e.key]=true;};
    this._handlers.keyup=(e)=>{this.keys[e.code]=false;this.keys[e.key]=false;};
    this._handlers.mousedown=(e)=>{this.mouseButtons[e.button]=true;};
    this._handlers.mouseup=(e)=>{this.mouseButtons[e.button]=false;};
    this._handlers.mousemove=(e)=>{this._accDelta.x+=e.movementX||0;this._accDelta.y+=e.movementY||0;};
    // Clear all key/button state when the window loses focus so held keys
    // don't cause the player to keep moving after pointer-lock is released.
    this._handlers.blur=()=>{ this.keys={}; this.mouseButtons={}; };
    window.addEventListener('keydown',this._handlers.keydown);
    window.addEventListener('keyup',this._handlers.keyup);
    window.addEventListener('mousedown',this._handlers.mousedown);
    window.addEventListener('mouseup',this._handlers.mouseup);
    window.addEventListener('mousemove',this._handlers.mousemove);
    window.addEventListener('blur',this._handlers.blur);
  }
  isKeyDown(key){return!!this.keys[key];}
  isMouseDown(btn){return!!this.mouseButtons[btn];}
  getMouseDelta(){const d={...this._accDelta};this._accDelta={x:0,y:0};return d;}
  /** Clear all held-key state (call when pointer lock is released). */
  clearKeys(){ this.keys={}; this.mouseButtons={}; }
  dispose(){
    window.removeEventListener('keydown',this._handlers.keydown);
    window.removeEventListener('keyup',this._handlers.keyup);
    window.removeEventListener('mousedown',this._handlers.mousedown);
    window.removeEventListener('mouseup',this._handlers.mouseup);
    window.removeEventListener('mousemove',this._handlers.mousemove);
    window.removeEventListener('blur',this._handlers.blur);
  }
}
