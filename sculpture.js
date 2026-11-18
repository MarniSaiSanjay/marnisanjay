(() => {
  "use strict";

  const canvas = document.getElementById("sculpture");
  const gl = canvas.getContext("webgl", { alpha: true, antialias: true, powerPreference: "low-power" });
  if (!gl) return;

  const root = document.documentElement;
  const stage = canvas.parentElement;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
  const segments = 192;
  const sides = 28;
  const vertices = [];
  const faces = [];
  let width = 0;
  let height = 0;
  let bounds;
  let uniforms;
  let resources;
  let ready = false;
  let frame = 0;
  let lastTime = 0;
  let angle = .35;
  let visible = true;
  let pointerX = 0;
  let pointerY = 0;
  let tiltX = 0;
  let tiltY = 0;
  let scrollTurn = 0;
  let scrollTarget = 0;

  const normalize = (v) => {
    const length = Math.hypot(...v) || 1;
    return v.map((n) => n / length);
  };
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
  const center = (t) => [Math.sin(t) + 2 * Math.sin(2 * t), Math.cos(t) - 2 * Math.cos(2 * t), -Math.sin(3 * t)];

  // A continuous trefoil tube, with its local frame baked once rather than per frame.
  for (let i = 0; i < segments; i++) {
    const t = i / segments * Math.PI * 2;
    const point = center(t);
    const next = center(t + .001);
    const previous = center(t - .001);
    const tangent = normalize(next.map((v, axis) => v - previous[axis]));
    const normal = normalize(cross(tangent, [0, 0, 1]));
    const binormal = cross(tangent, normal);
    for (let j = 0; j < sides; j++) {
      const v = j / sides * Math.PI * 2;
      const direction = normal.map((n, axis) => n * Math.cos(v) + binormal[axis] * Math.sin(v));
      vertices.push(...point.map((n, axis) => n + direction[axis] * .38), ...direction, i < segments * .48 ? 1 : 0);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * sides + j;
      const b = ((i + 1) % segments) * sides + j;
      const c = ((i + 1) % segments) * sides + (j + 1) % sides;
      const d = i * sides + (j + 1) % sides;
      faces.push(a, b, c, a, c, d);
    }
  }

  const vertexSource = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    attribute float aAccent;
    uniform vec3 uRotation;
    uniform vec2 uScale;
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying float vAccent;
    void main() {
      vec3 c = cos(uRotation), s = sin(uRotation);
      mat3 rx = mat3(1.,0.,0., 0.,c.x,s.x, 0.,-s.x,c.x);
      mat3 ry = mat3(c.y,0.,-s.y, 0.,1.,0., s.y,0.,c.y);
      mat3 rz = mat3(c.z,s.z,0., -s.z,c.z,0., 0.,0.,1.);
      mat3 rotation = rz * ry * rx;
      vec3 position = rotation * aPosition;
      vec3 normal = rotation * aNormal;
      vPosition = position * vec3(1.,-1.,1.);
      vNormal = normal * vec3(1.,-1.,1.);
      vAccent = aAccent;
      float depth = 9. - position.z;
      gl_Position = vec4(vPosition.xy * uScale, depth * 31. / 29. - 60. / 29., depth);
    }
  `;
  const fragmentSource = `
    precision mediump float;
    uniform vec3 uShadow;
    uniform vec3 uHighlight;
    uniform vec3 uAccent;
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying float vAccent;
    void main() {
      vec3 normal = normalize(vNormal);
      vec3 view = normalize(vec3(0.,0.,9.) - vPosition);
      vec3 light = normalize(vec3(-.4,.65,1.));
      vec3 reflection = reflect(-view, normal);
      float diffuse = max(dot(normal, light), 0.);
      float studio = smoothstep(-.55,.65,reflection.y);
      float strip = pow(max(0., 1. - abs(reflection.y - .35) * 5.), 3.);
      float specular = pow(max(dot(reflect(-light,normal),view), 0.), 60.);
      float rim = pow(1. - max(dot(normal,view),0.), 3.);
      vec3 metal = mix(uShadow, uHighlight, .12 + studio * .6);
      vec3 rose = mix(uShadow, uAccent, .4 + diffuse * .6);
      vec3 color = mix(metal, rose, smoothstep(.3,.7,vAccent));
      color = mix(color, uHighlight, min(.92, strip * .48 + specular * .7 + rim * .22));
      gl_FragColor = vec4(color, 1.);
    }
  `;

  function initialize() {
    function compile(type, source) {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
      gl.deleteShader(shader);
      return null;
    }
    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) {
      if (vertex) gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
      if (program) gl.deleteProgram(program);
      return false;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return false;
    }
    gl.useProgram(program);
    const vertexBuffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();
    if (!vertexBuffer || !indexBuffer) {
      if (vertexBuffer) gl.deleteBuffer(vertexBuffer);
      if (indexBuffer) gl.deleteBuffer(indexBuffer);
      gl.deleteProgram(program);
      return false;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(faces), gl.STATIC_DRAW);
    for (const [name, size, offset] of [["aPosition", 3, 0], ["aNormal", 3, 12], ["aAccent", 1, 24]]) {
      const attribute = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribPointer(attribute, size, gl.FLOAT, false, 28, offset);
    }
    uniforms = Object.fromEntries(["uRotation", "uScale", "uShadow", "uHighlight", "uAccent"]
      .map((name) => [name, gl.getUniformLocation(program, name)]));
    gl.enable(gl.DEPTH_TEST);
    resources = { vertexBuffer, indexBuffer, program };
    return true;
  }

  function readPalette() {
    if (!ready) return;
    const styles = getComputedStyle(root);
    const color = (token) => styles.getPropertyValue(token).trim().match(/[a-f\d]{2}/gi).map((value) => parseInt(value, 16) / 255);
    const text = color("--cp-text");
    const surface = color("--cp-surface");
    const dark = root.dataset.theme === "dark";
    gl.uniform3fv(uniforms.uShadow, dark ? surface : text);
    gl.uniform3fv(uniforms.uHighlight, dark ? text : surface);
    gl.uniform3fv(uniforms.uAccent, color("--cp-accent"));
  }

  function draw() {
    if (!ready || !width || !height || gl.isContextLost()) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform3f(uniforms.uRotation, -.35 + tiltY * .38, .35 + tiltX * .55 + scrollTurn, angle);
    gl.uniform2f(uniforms.uScale, 2.45 * height / width, 2.45);
    gl.drawElements(gl.TRIANGLES, faces.length, gl.UNSIGNED_SHORT, 0);
    stage.classList.add("sculpture-ready");
  }

  const moving = () => ready && visible && !document.hidden && !reducedMotion.matches && root.dataset.motion === "running";
  function tick(time) {
    frame = 0;
    if (!moving()) return;
    if (time - lastTime >= 1000 / 30) {
      const elapsed = Math.min((time - lastTime) / 1000, .05);
      angle += elapsed * .12;
      tiltX += (pointerX - tiltX) * .09;
      tiltY += (pointerY - tiltY) * .09;
      scrollTurn += (scrollTarget - scrollTurn) * .08;
      lastTime = time;
      draw();
    }
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    lastTime = performance.now();
    if (moving()) frame = requestAnimationFrame(tick);
    else draw();
  }
  function resize() {
    bounds = canvas.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    draw();
  }
  stage.addEventListener("pointerenter", () => { bounds = canvas.getBoundingClientRect(); });
  stage.addEventListener("pointermove", (event) => {
    if (!finePointer.matches || !moving()) return;
    pointerX = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / width * 2 - 1));
    pointerY = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / height * 2 - 1));
  }, { passive: true });
  stage.addEventListener("pointerleave", () => { pointerX = 0; pointerY = 0; });
  window.addEventListener("scroll", () => {
    if (moving()) scrollTarget = scrollY * .0007;
  }, { passive: true });
  new MutationObserver(() => { readPalette(); sync(); }).observe(root, { attributes: true, attributeFilter: ["data-theme", "data-motion"] });
  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(stage);
  else window.addEventListener("resize", resize, { passive: true });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }).observe(stage);
  }
  document.addEventListener("visibilitychange", sync);
  reducedMotion.addEventListener("change", sync);
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    ready = false;
    resources = null;
    stage.classList.remove("sculpture-ready");
    sync();
  });
  canvas.addEventListener("webglcontextrestored", () => {
    ready = initialize();
    readPalette();
    resize();
    sync();
  });
  window.addEventListener("pagehide", (event) => {
    if (event.persisted || !resources) return;
    ready = false;
    sync();
    gl.deleteBuffer(resources.vertexBuffer);
    gl.deleteBuffer(resources.indexBuffer);
    gl.deleteProgram(resources.program);
    resources = null;
  });
  ready = initialize();
  readPalette();
  resize();
  sync();
})();
