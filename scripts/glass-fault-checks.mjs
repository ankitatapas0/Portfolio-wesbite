// Chromium/CDP-only instrumentation; never imported by the application.
export function installGlassFaultProbe() {
  window.glassFault = null;
  const isGlass = (gl) => gl.canvas.classList.contains("detail-page-glass-band");
  const hit = (gl, mode) => {
    const fault = window.glassFault;
    if (!fault || !isGlass(gl) || fault.mode !== mode || fault.hits) return false;
    fault.hits++;
    return true; // Fail once: an accidental retry must be allowed to succeed.
  };
  for (const kind of ["Shader", "Program", "Buffer", "Texture"]) {
    const create = WebGLRenderingContext.prototype["create" + kind];
    const destroy = WebGLRenderingContext.prototype["delete" + kind];
    WebGLRenderingContext.prototype["create" + kind] = function (...args) {
      const fault = isGlass(this) && window.glassFault;
      if (fault) fault.calls[kind]++;
      if ((kind === "Buffer" || kind === "Texture") && hit(this, kind.toLowerCase())) return null;
      if (kind === "Shader" && hit(this,
        args[0] === this.VERTEX_SHADER ? "createVertexShader" : "createFragmentShader")) return null;
      if (kind === "Program" && hit(this, "createProgram")) return null;
      const resource = create.apply(this, args);
      if (fault && resource) fault.created.push({
        kind, resource,
        shaderType: kind === "Shader"
          ? (args[0] === this.VERTEX_SHADER ? "vertex" : "fragment") : null,
      });
      return resource;
    };
    WebGLRenderingContext.prototype["delete" + kind] = function (resource) {
      const fault = isGlass(this) && window.glassFault;
      if (fault && resource) fault.deleted.push({ kind, resource });
      if (fault && !resource) fault.nullDeletes++;
      return destroy.call(this, resource);
    };
  }
  for (const [method, name, mode, missing] of [
    ["getAttribLocation", "aPosition", "attribute", -1],
    ["getUniformLocation", "uTexture", "uniform", null],
  ]) {
    const original = WebGLRenderingContext.prototype[method];
    WebGLRenderingContext.prototype[method] = function (...args) {
      const fault = isGlass(this) && window.glassFault;
      if (fault) fault.calls[method]++;
      if (args[1] === name && hit(this, mode)) return missing;
      return original.apply(this, args);
    };
  }
  const compile = WebGLRenderingContext.prototype.compileShader;
  WebGLRenderingContext.prototype.compileShader = function (shader) {
    // Fail the fragment shader so the successful vertex must also be released.
    if (this.getShaderParameter(shader, this.SHADER_TYPE) === this.FRAGMENT_SHADER
      && hit(this, "shader")) this.shaderSource(shader, "invalid shader source");
    return compile.call(this, shader);
  };
  const link = WebGLRenderingContext.prototype.linkProgram;
  WebGLRenderingContext.prototype.linkProgram = function (program) {
    if (hit(this, "link")) {
      // A missing fragment shader makes the real linker report failure.
      const shader = this.getAttachedShaders(program).find(
        (s) => this.getShaderParameter(s, this.SHADER_TYPE) === this.FRAGMENT_SHADER,
      );
      this.detachShader(program, shader);
    }
    return link.call(this, program);
  };
  const error = console.error;
  console.error = function (...args) {
    if (window.glassFault && String(args[0]).includes("detail glass")) {
      window.glassFault.errors.push(String(args[0]));
    }
    return error.apply(this, args);
  };
  window.glassFaultSnapshot = () => {
    const fault = window.glassFault;
    const counts = (records) => Object.fromEntries(
      ["Shader", "Program", "Buffer", "Texture"].map(
        (kind) => [kind, records.filter((r) => r.kind === kind).length],
      ),
    );
    return {
      mode: fault.mode, hits: fault.hits, calls: { ...fault.calls },
      created: counts(fault.created), deleted: counts(fault.deleted),
      createdShaders: fault.created.filter((r) => r.kind === "Shader").map((r) => r.shaderType),
      unreleased: fault.created.filter(
        (r) => !fault.deleted.some((d) => d.resource === r.resource),
      ).length,
      duplicateDeletes: fault.deleted.length - new Set(fault.deleted.map((r) => r.resource)).size,
      foreignDeletes: fault.deleted.filter(
        (d) => !fault.created.some((r) => r.resource === d.resource && r.kind === d.kind),
      ).length,
      nullDeletes: fault.nullDeletes,
      errors: [...fault.errors],
    };
  };
}

export async function checkGlassFaults({ evaluate, wait, live, contextEvent, results }) {
  const assert = (condition, message, state) => {
    if (!condition) throw new Error(message + ": " + JSON.stringify(state));
  };
  const resetCounts = () => evaluate(`Object.keys(glassCounts).forEach(k => glassCounts[k] = 0)`);
  const closed = async (name) => {
    const state = await live();
    assert(!Object.values(state).some(Boolean), name + " leaked resources", state);
    return state;
  };
  const expected = {
    shader: { Shader: 2, Program: 0, Buffer: 0, Texture: 0 },
    link: { Shader: 2, Program: 1, Buffer: 0, Texture: 0 },
    buffer: { Shader: 2, Program: 1, Buffer: 0, Texture: 1 },
    texture: { Shader: 2, Program: 1, Buffer: 1, Texture: 0 },
    createVertexShader: { Shader: 1, Program: 0, Buffer: 0, Texture: 0 },
    createFragmentShader: { Shader: 1, Program: 0, Buffer: 0, Texture: 0 },
    createProgram: { Shader: 2, Program: 0, Buffer: 0, Texture: 0 },
    attribute: { Shader: 2, Program: 1, Buffer: 1, Texture: 1 },
    uniform: { Shader: 2, Program: 1, Buffer: 1, Texture: 1 },
  };
  const errors = {
    shader: "Unable to compile the detail glass shader.",
    link: "Unable to link the detail glass shader program.",
    buffer: "Unable to initialize the detail glass shader inputs.",
    texture: "Unable to initialize the detail glass shader inputs.",
    createVertexShader: "Unable to create the detail glass shader.",
    createFragmentShader: "Unable to create the detail glass shader.",
    createProgram: "Unable to create the detail glass shader program.",
    attribute: "Unable to initialize the detail glass shader inputs.",
    uniform: "Unable to initialize the detail glass shader inputs.",
  };
  results.initializationFailures = {};
  for (const mode of Object.keys(expected)) {
    // Fresh playing-media page gives every failure live media listeners and
    // callbacks to suspend, rather than testing an empty capture surface.
    await evaluate(`location.hash = '#/desktop/opera-live-visuals'`);
    await wait(1500);
    await evaluate(`(async () => {
      const video = document.querySelector('video[data-detail-page-content]');
      document.querySelector('.detail-page-transition-backdrop').scrollTop = 50;
      video.muted = true; await video.play();
    })()`);
    await wait(300);
    const healthy = await live();
    assert(healthy.gpu === 5 && healthy.video > 0, mode + " missing healthy setup", healthy);
    await contextEvent();
    const lost = await live();
    assert(!lost.gpu && !lost.raf && !lost.video && !lost.timers, mode + " loss did not suspend", lost);
    // Arm only after loss released the old generation. Resource audit now
    // describes precisely the partially initialized restored generation.
    await evaluate(`window.glassFault = {
      mode: ${JSON.stringify(mode)}, hits: 0,
      calls: { Shader: 0, Program: 0, Buffer: 0, Texture: 0,
        getAttribLocation: 0, getUniformLocation: 0 },
      created: [], deleted: [], nullDeletes: 0, errors: []
    }`);
    await resetCounts();
    await contextEvent(true);
    await wait(300);
    const initial = await evaluate(`glassFaultSnapshot()`);
    const inputsReached = ["buffer", "texture", "attribute", "uniform"].includes(mode);
    const shadersFailed = ["shader", "createVertexShader", "createFragmentShader"].includes(mode);
    const expectedCalls = {
      Shader: 2, Program: shadersFailed ? 0 : 1,
      Buffer: inputsReached ? 1 : 0, Texture: inputsReached ? 1 : 0,
      getAttribLocation: inputsReached ? 1 : 0, getUniformLocation: inputsReached ? 1 : 0,
    };
    const expectedShaders = mode === "createVertexShader" ? ["fragment"]
      : mode === "createFragmentShader" ? ["vertex"] : ["vertex", "fragment"];
    assert(initial.hits === 1
      && JSON.stringify(initial.calls) === JSON.stringify(expectedCalls)
      && JSON.stringify(initial.errors) === JSON.stringify([errors[mode]]),
      mode + " failure branch was not exercised exactly once", initial);
    assert(JSON.stringify(initial.created) === JSON.stringify(expected[mode])
      && JSON.stringify(initial.deleted) === JSON.stringify(expected[mode])
      && JSON.stringify(initial.createdShaders) === JSON.stringify(expectedShaders)
      && !initial.unreleased && !initial.duplicateDeletes
      && !initial.foreignDeletes && !initial.nullDeletes,
    mode + " partial GPU cleanup failed", initial);
    const failedLive = await live();
    assert(!failedLive.gpu && !failedLive.raf && !failedLive.video && !failedLive.timers,
      mode + " failure retained scheduled work", failedLive);
    assert(failedLive.observers === healthy.observers && failedLive.listeners === healthy.listeners,
      mode + " failure duplicated observers/listeners", { healthy, failedLive });

    const content = await evaluate(`(async () => {
      const root = document.querySelector('.detail-page-transition-backdrop');
      const video = root.querySelector('video[data-detail-page-content]');
      const title = root.querySelector('h1, h2');
      const beforeScroll = root.scrollTop;
      root.scrollTop = beforeScroll + 200;
      root.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('resize'));
      document.querySelector('.theme-toggle').click();
      document.querySelector('.theme-toggle').click();
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
      video.pause(); await video.play();
      const beforeTime = video.currentTime;
      await new Promise((resolve, reject) => {
        const done = () => { clearTimeout(timer); resolve(); };
        const timer = setTimeout(() => {
          video.removeEventListener('seeked', done);
          reject(new Error('Failure-path video seek timed out'));
        }, 6000);
        video.addEventListener('seeked', done, { once: true });
        video.currentTime = beforeTime + 2;
      });
      return {
        title: title?.textContent.trim(), scrollChanged: root.scrollTop !== beforeScroll,
        playing: !video.paused, seekChanged: video.currentTime >= beforeTime + 1,
        readyState: video.readyState
      };
    })()`);
    assert(content.title && content.scrollChanged && content.playing && content.seekChanged
      && content.readyState >= 2, mode + " project content became unusable", content);
    await wait(1000); // Several frames and fallback-poll periods, after invalidations.
    const settled = await evaluate(`glassFaultSnapshot()`);
    const counts = await evaluate(`({...glassCounts})`);
    const settledLive = await live();
    assert(JSON.stringify(initial) === JSON.stringify(settled)
      && !Object.values(counts).some(Boolean)
      && !settledLive.raf && !settledLive.video && !settledLive.timers && !settledLive.gpu,
    mode + " initialization retried after failure", { initial, settled, counts, settledLive });

    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    await wait(700);
    const closedLive = await closed(mode + " close");
    assert(JSON.stringify(await evaluate(`glassFaultSnapshot()`)) === JSON.stringify(settled),
      mode + " close deleted partial resources twice", settled);
    assert(!await evaluate(`!!document.querySelector('.detail-page-transition-backdrop')`),
      mode + " Escape did not close project", closedLive);
    await resetCounts();
    // Stale events on the detached canvas must not revive any failed renderer.
    await evaluate(`glassContextCanvas.dispatchEvent(new Event('webglcontextrestored'));
      window.dispatchEvent(new Event('resize')); document.dispatchEvent(new Event('visibilitychange'))`);
    await wait(300);
    await closed(mode + " late event");
    assert(JSON.stringify(await evaluate(`glassFaultSnapshot()`)) === JSON.stringify(settled),
      mode + " late event revived failed initialization", settled);
    assert(!Object.values(await evaluate(`({...glassCounts})`)).some(Boolean),
      mode + " closed renderer did work", settled);
    await evaluate(`window.glassFault = null; window.glassPixels = null;
      window.glassProbe = true; location.hash = '#/desktop/opera-live-visuals'`);
    await wait(1500);
    const reopened = { state: await live(), counts: await evaluate(`({...glassCounts})`),
      pixels: await evaluate(`glassPixels`) };
    assert(reopened.state.gpu === 5 && reopened.state.observers === healthy.observers
      && reopened.state.listeners === healthy.listeners && reopened.counts.draws > 0
      && reopened.counts.allocations === 1 && reopened.pixels
      && !reopened.pixels.glError && reopened.pixels.lowerAlpha === 255
      && reopened.pixels.upperAlpha < 10,
    mode + " reopening did not create one healthy renderer", reopened);
    await evaluate(`window.glassProbe = false;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    await wait(700);
    results.initializationFailures[mode] = {
      audit: settled, failedLive, content, counts, closedLive, reopened,
      reopenedCloseLive: await closed(mode + " reopened close"),
    };
  }
}
