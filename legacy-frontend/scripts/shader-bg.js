/**
 * WebGL animated background — one of 4 shader variants picked per session.
 * Reads theme colors from :root (set by theme-randomizer.js).
 * Runs at half-resolution for perf; pauses when tab hidden.
 */
(function () {
    if (document.getElementById('bg-shader')) return;
    const canvas = document.createElement('canvas');
    canvas.id = 'bg-shader';
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:-3;pointer-events:none;opacity:0.32';
    const insert = () => document.body.insertBefore(canvas, document.body.firstChild);
    if (document.body) insert();
    else document.addEventListener('DOMContentLoaded', insert, { once: true });

    const gl = canvas.getContext('webgl', { antialias: false, alpha: true, preserveDrawingBuffer: false });
    if (!gl) return;

    const VS = `
      attribute vec2 p;
      void main(){ gl_Position = vec4(p, 0.0, 1.0); }
    `;

    const HEAD = `
      precision mediump float;
      uniform vec2 u_res;
      uniform float u_t;
      uniform vec3 u_c1;
      uniform vec3 u_c2;
      uniform vec3 u_c3;
      uniform float u_seed;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i = floor(p); vec2 f = fract(p);
        float a = hash(i), b = hash(i+vec2(1,0)), c = hash(i+vec2(0,1)), d = hash(i+vec2(1,1));
        vec2 u = f*f*(3.0-2.0*f);
        return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
      }
      float fbm(vec2 p){ float s=0., a=0.5; for(int i=0;i<5;i++){ s += a*noise(p); p *= 2.02; a *= 0.5; } return s; }
    `;

    // Shader 0: Nebula — fbm with color stops
    const F_NEBULA = HEAD + `
      void main(){
        vec2 uv = (gl_FragCoord.xy - 0.5*u_res) / min(u_res.x, u_res.y);
        uv *= 1.6;
        float t = u_t*0.04 + u_seed*31.0;
        float n = fbm(uv*1.8 + vec2(t, -t*0.7));
        float n2 = fbm(uv*3.2 + vec2(-t*0.5, t*0.3) + n);
        vec3 col = mix(u_c3*0.25, u_c1, smoothstep(0.3, 0.75, n));
        col = mix(col, u_c2, smoothstep(0.55, 0.95, n2));
        float vig = smoothstep(1.3, 0.3, length(uv));
        col *= vig*0.9 + 0.1;
        gl_FragColor = vec4(col*0.6, 1.0);
      }
    `;

    // Shader 1: Plasma — smooth sines
    const F_PLASMA = HEAD + `
      void main(){
        vec2 uv = (gl_FragCoord.xy - 0.5*u_res) / min(u_res.x, u_res.y);
        float t = u_t*0.12 + u_seed*7.0;
        float v = 0.0;
        v += sin(uv.x*3.0 + t);
        v += sin((uv.y + t*0.4)*2.5);
        v += sin((uv.x + uv.y + t*0.6)*1.7);
        v += sin(length(uv*2.0) - t*1.2);
        v *= 0.25;
        vec3 col = mix(u_c3*0.3, u_c1, smoothstep(-0.8, 0.3, v));
        col = mix(col, u_c2, smoothstep(0.15, 0.9, v));
        float vig = smoothstep(1.4, 0.4, length(uv));
        gl_FragColor = vec4(col*vig*0.55, 1.0);
      }
    `;

    // Shader 2: Aurora / flow — curl-like noise bands
    const F_AURORA = HEAD + `
      void main(){
        vec2 uv = (gl_FragCoord.xy - 0.5*u_res) / u_res.y;
        float t = u_t*0.06 + u_seed*19.0;
        float band = 0.0;
        for (float i = 1.0; i <= 3.0; i += 1.0){
          float y = uv.y + sin(uv.x*2.0 + t*0.7 + i*1.3)*0.2 + fbm(uv*vec2(2.0,1.0) + t*0.3 + i)*0.25 - (i-2.0)*0.25;
          band += smoothstep(0.18, 0.0, abs(y)) * (0.5 + 0.5*sin(t*0.5 + i*2.0));
        }
        vec3 col = mix(u_c3*0.25, u_c1, band*0.6);
        col = mix(col, u_c2, clamp(band - 0.4, 0.0, 1.0));
        float vig = smoothstep(1.3, 0.3, length(uv));
        gl_FragColor = vec4(col*vig*0.65, 1.0);
      }
    `;

    // Shader 3: Orbs — soft metaballs
    const F_ORBS = HEAD + `
      float ball(vec2 uv, vec2 c, float r){ return r / length(uv - c); }
      void main(){
        vec2 uv = (gl_FragCoord.xy - 0.5*u_res) / min(u_res.x, u_res.y);
        float t = u_t*0.1 + u_seed*11.0;
        float v = 0.0;
        v += ball(uv, vec2(sin(t)*0.5, cos(t*0.7)*0.4), 0.28);
        v += ball(uv, vec2(cos(t*0.9+1.2)*0.6, sin(t*1.1)*0.35), 0.22);
        v += ball(uv, vec2(sin(t*0.5+2.5)*0.45, cos(t*0.8+0.7)*0.55), 0.25);
        v += ball(uv, vec2(cos(t*1.3)*0.3, sin(t*0.6+3.1)*0.5), 0.18);
        v *= 0.3;
        vec3 col = mix(u_c3*0.25, u_c1, smoothstep(0.25, 0.7, v));
        col = mix(col, u_c2, smoothstep(0.55, 1.1, v));
        float vig = smoothstep(1.3, 0.3, length(uv));
        gl_FragColor = vec4(col*vig*0.6, 1.0);
      }
    `;

    const SHADERS = [F_NEBULA, F_PLASMA, F_AURORA, F_ORBS];
    const NAMES = ['nebula', 'plasma', 'aurora', 'orbs'];

    let shaderIdx;
    try {
        const cached = sessionStorage.getItem('portfolio_shader_v1');
        if (cached !== null) shaderIdx = Number(cached);
    } catch (_) { }
    if (!Number.isInteger(shaderIdx) || shaderIdx < 0 || shaderIdx >= SHADERS.length) {
        shaderIdx = Math.floor(Math.random() * SHADERS.length);
        try { sessionStorage.setItem('portfolio_shader_v1', String(shaderIdx)); } catch (_) { }
    }
    document.documentElement.dataset.shader = NAMES[shaderIdx];

    function compile(src, type) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.warn('Shader compile error:', gl.getShaderInfoLog(s));
            return null;
        }
        return s;
    }

    const vs = compile(VS, gl.VERTEX_SHADER);
    const fs = compile(SHADERS[shaderIdx], gl.FRAGMENT_SHADER);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    // Full-screen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    const attr = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(attr);
    gl.vertexAttribPointer(attr, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'u_res');
    const uT = gl.getUniformLocation(prog, 'u_t');
    const uC1 = gl.getUniformLocation(prog, 'u_c1');
    const uC2 = gl.getUniformLocation(prog, 'u_c2');
    const uC3 = gl.getUniformLocation(prog, 'u_c3');
    const uSeed = gl.getUniformLocation(prog, 'u_seed');

    function hexToRgb(hex) {
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})/i.exec(hex);
        if (!m) return [0.2, 0.6, 1.0];
        return [parseInt(m[1],16)/255, parseInt(m[2],16)/255, parseInt(m[3],16)/255];
    }

    function readThemeColors() {
        const cs = getComputedStyle(document.documentElement);
        return {
            c1: hexToRgb(cs.getPropertyValue('--accent-cyan').trim() || '#00e5ff'),
            c2: hexToRgb(cs.getPropertyValue('--accent-pink').trim() || '#ff2d95'),
            c3: hexToRgb(cs.getPropertyValue('--accent-purple').trim() || '#a855f7'),
        };
    }

    const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    const SCALE = 0.6; // half-ish resolution for perf

    function resize() {
        const w = Math.max(1, Math.floor(window.innerWidth * SCALE * DPR));
        const h = Math.max(1, Math.floor(window.innerHeight * SCALE * DPR));
        canvas.width = w; canvas.height = h;
        gl.viewport(0, 0, w, h);
        gl.uniform2f(uRes, w, h);
    }
    window.addEventListener('resize', resize, { passive: true });
    resize();

    const seed = Math.random();
    gl.uniform1f(uSeed, seed);

    let colors = readThemeColors();
    gl.uniform3fv(uC1, colors.c1);
    gl.uniform3fv(uC2, colors.c2);
    gl.uniform3fv(uC3, colors.c3);

    let visible = true;
    document.addEventListener('visibilitychange', () => { visible = !document.hidden; });
    // Re-read theme colors in case randomizer runs after us
    setTimeout(() => {
        colors = readThemeColors();
        gl.uniform3fv(uC1, colors.c1);
        gl.uniform3fv(uC2, colors.c2);
        gl.uniform3fv(uC3, colors.c3);
    }, 100);

    const start = performance.now();
    function tick() {
        if (visible) {
            const t = (performance.now() - start) * 0.001;
            gl.uniform1f(uT, t);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        requestAnimationFrame(tick);
    }
    tick();

    window.__rerollShader = function () {
        try { sessionStorage.removeItem('portfolio_shader_v1'); } catch (_) { }
        location.reload();
    };
})();
