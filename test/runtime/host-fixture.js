/* Shared inert host for Node VM and AutoJs6's pinned Rhino. No real IO. */
var __host = (function (o) {
    var store = Object.create(null), queue = [], clips = [], clock = 1800000000000, intent = false;
    var state = {foreground:o.foreground || 'autojs6.fixture', tapCommands:0, captureStops:0,
        armed:false, focusChecks:0, geometryChecks:0, clicked:false, rotated:false,
        captures:0, orientationRequests:0, copies:0, recycled:0, originalRecycled:0, commands:[], javaValues:0};
    var NativeDate = Date;
    function MockDate(v) { return arguments.length ? new NativeDate(v) : new NativeDate(clock); }
    MockDate.now = function () { return clock; };
    MockDate.parse = NativeDate.parse; MockDate.UTC = NativeDate.UTC;
    Object.keys(o.initialStore || {}).forEach(function (k) { store[k] = o.initialStore[k]; });
    function control(text) { return {text:text || '', handlers:{}, enabled:true, history:[],
        setText:function(v) { this.text=String(v); this.history.push(this.text); },
        setEnabled:function(v) { this.enabled=v; },
        on:function(e,f) { this.handlers[e]=f; }}; }
    var ui={target:control('WAIT'), outcome:control('READY'), status:control(), selftest:control(),
        rotation:control(), observe:control(), game:control(), stop:control(), copy:control(),
        layout:function(){}, run:function(f){f();}};
    function File(p) { this.path=String(p); }
    File.prototype.exists=function(){return Object.prototype.hasOwnProperty.call(store,this.path);};
    File.prototype.delete=function(){var existed=this.exists();delete store[this.path];return existed;};
    File.prototype.renameTo=function(dest){
        if(!this.exists() || (o.failVersionRename && dest.path.indexOf('client-version')>=0) ||
            (o.failEvidenceRename && dest.path.indexOf('automation-run')>=0)) return false;
        store[dest.path]=store[this.path];delete store[this.path];return true;
    };
    var files={exists:function(p){return Object.prototype.hasOwnProperty.call(store,String(p));},
        read:function(p){return store[String(p)];}, write:function(p,v){
            var s=String(v), r=JSON.parse(s);
            if((o.failWriteAt==='preflight' && r.stage==='preflight') ||
                (o.failWriteAt==='observe' && r.frames && r.frames.length>0) ||
                (o.failWriteAt==='action' && r.actionCount===1) ||
                (o.failWriteAt==='final' && r.status!=='running')) throw new Error('private disk detail');
            store[String(p)]=s;
            if(!intent && r.status==='running' && r.actionCount===1){
                intent=true;
                if(o.switchDuringInputPersistence) state.foreground='com.other.app';
                if(o.cancelDuringInputPersistence) ui.stop.handlers.click();
                if(o.rotateDuringInputPersistence) state.rotated=true;
                clock+=o.inputPersistenceDelay || 0;
            }
            if(!state.armed && s.indexOf('"stage": "action_requested"')>=0){
                state.armed=true;state.focusChecks=0;state.geometryChecks=0;
            }
        }};
    function shizuku(cmd){
        state.commands.push(cmd);
        if(Object.prototype.hasOwnProperty.call(o,'shellThrowValue')) throw o.shellThrowValue;
        if(o.shellThrow) throw new Error(o.shellThrow);
        if(cmd.indexOf('dumpsys package ')===0) return {code:0,result:o.packageDump===undefined?
            'versionCode=5012301\nversionName=3.9.0':o.packageDump};
        if(cmd.indexOf('input tap ')===0){state.tapCommands++;
            if(o.failInput) return {code:1,result:''};
            if(!o.ignoreInput){ui.target.handlers.click();state.clicked=true;}}
        return {code:0,result:'ok'};
    }
    shizuku.state={isOperational:o.shizukuOperational!==false};
    shizuku.currentPackage=function(){
        if(state.armed && o.lateFocusSwitch && ++state.focusChecks>=3) return 'com.other.app';
        return state.foreground;
    };
    var android={content:{pm:{ActivityInfo:{SCREEN_ORIENTATION_PORTRAIT:1}},Context:{WINDOW_SERVICE:'window'}},
        util:{DisplayMetrics:function(){}}};
    var context={getFilesDir:function(){return '/mock';},getPackageName:function(){return 'autojs6.fixture';},
        getPackageManager:function(){return {getPackageInfo:function(){return {versionName:'6.7.0'};}};},
        getSystemService:function(){return {getDefaultDisplay:function(){return {
            getRealMetrics:function(m){
                m.widthPixels=state.rotated?2400:1080;
                m.heightPixels=state.rotated?1080:2400;
            },
            getRotation:function(){
                if(state.rotated || (state.armed && o.lateRotation && ++state.geometryChecks>=2)) return 1;
                return 0;
            }};}};}};
    var original={getWidth:function(){return state.rotated?2400:1080;},
        getHeight:function(){return state.rotated?1080:2400;},
        recycle:function(){state.originalRecycled++;}};
    var images={requestScreenCapture:function(){return o.allowCapture!==false;},
        captureScreen:function(){state.captures++;if(o.captureThrows)throw new Error('PRIVATE_CAPTURE_ERROR');return original;},
        copy:function(){state.copies++;return {getWidth:original.getWidth,getHeight:original.getHeight,
            recycle:function(){state.recycled++;}};},stopScreenCapture:function(){state.captureStops++;}};
    var ocr={mlkit:{detect:function(){
        if(o.ocrThrows)throw new Error('PRIVATE_OCR_ERROR');
        if(o.emptyOcr)return [];
        var text=state.foreground==='autojs6.fixture'?(state.clicked?ui.outcome.text:ui.target.text):'设置';
        var item={text:text,confidence:0.99,bounds:{left:100,top:200,right:400,bottom:300}};
        if(typeof __jvm!=='undefined' && __jvm){
            // Public int fields and boxed values exercise actual Rhino Java
            // conversion. Insets is a desktop fixture, not Android Rect.
            item.text=new __interop.String(text);
            item.confidence=__interop.Float.valueOf('0.99');
            item.bounds=new __interop.Insets(200,100,300,400);
            state.javaValues++;
        }
        var rows = [item];
        if (o.weakDuplicate) rows.push({text:item.text, confidence:0.2, bounds:item.bounds});
        return rows;
    }}};
    return {globals:{ui:ui,android:android,context:context,images:images,ocr:ocr,files:files,shizuku:shizuku,
        Date:MockDate,activity:{setRequestedOrientation:function(){state.orientationRequests++;}},
        java:{io:{File:File},util:{UUID:{randomUUID:function(){return '00112233-4455-6677-8899-aabbccddeeff';}}}},
        threads:{start:function(f){if(o.deferThread)queue.push(f);else f();}},
        sleep:function(ms){
            clock+=ms;
            if(o.rotateAfterFirstCapture && state.captures>0) state.rotated=true;
        },toast:function(){},setClip:function(s){clips.push(s);}},
        press:function(n){ui[n].handlers.click();},flush:function(){while(queue.length)queue.shift()();},
        report:function(){return JSON.parse(store['/mock/android-automation-run.json']);},
        stored:function(p){return store[p];},state:state,ui:ui,clips:clips};
})(typeof __options==='undefined'?{}:__options);
Object.keys(__host.globals).forEach(function(k){this[k]=__host.globals[k];},this);
