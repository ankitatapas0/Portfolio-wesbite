// WebGL 1's optional, asynchronous timer extension. Never finish/readPixels,
// never wait for a result, and never schedule a frame merely to poll a query.
type TimerExtension = {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
  QUERY_RESULT_AVAILABLE_EXT: number;
  QUERY_RESULT_EXT: number;
  createQueryEXT(): object | null;
  deleteQueryEXT(query: object): void;
  beginQueryEXT(target: number, query: object): void;
  endQueryEXT(target: number): void;
  getQueryObjectEXT(query: object, name: number): number | boolean;
};

export function createGlassGpuTiming(gl: WebGLRenderingContext) {
  const ext = gl.getExtension("EXT_disjoint_timer_query") as TimerExtension | null;
  const pending: { query: object; time: number }[] = [];
  let active: object | null = null;
  let latest: { time: number; ms: number } | null = null;
  const clear = () => {
    if (active) {
      if (!gl.isContextLost()) ext?.endQueryEXT(ext.TIME_ELAPSED_EXT);
      ext?.deleteQueryEXT(active);
    }
    pending.forEach(({ query }) => ext?.deleteQueryEXT(query));
    active = null;
    pending.length = 0;
    latest = null;
  };
  return {
    clear,
    poll(now: number): number | undefined {
      if (!ext) return undefined;
      if (gl.getParameter(ext.GPU_DISJOINT_EXT)) { clear(); return undefined; }
      while (pending.length) {
        const { query, time } = pending[0];
        if (now - time > 1000) {
          ext.deleteQueryEXT(query); pending.shift(); continue;
        }
        if (!ext.getQueryObjectEXT(query, ext.QUERY_RESULT_AVAILABLE_EXT)) break;
        const ms = Number(ext.getQueryObjectEXT(query, ext.QUERY_RESULT_EXT)) / 1e6;
        ext.deleteQueryEXT(query);
        pending.shift();
        latest = { time, ms };
      }
      return latest && now - latest.time <= 250 ? latest.ms : undefined;
    },
    begin() {
      if (!ext || pending.length >= 4) return;
      active = ext.createQueryEXT();
      if (active) ext.beginQueryEXT(ext.TIME_ELAPSED_EXT, active);
    },
    end(now: number) {
      if (!ext || !active) return;
      ext.endQueryEXT(ext.TIME_ELAPSED_EXT);
      pending.push({ query: active, time: now });
      active = null;
    },
  };
}
