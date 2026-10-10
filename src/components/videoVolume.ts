type VolumeGraph = {
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  connected: boolean;
  sync: () => void;
};

type VolumeState = {
  volume: number;
  forceGain: boolean;
  nativeWritable?: boolean;
  graph?: VolumeGraph;
};

const states = new WeakMap<HTMLVideoElement, VolumeState>();
const connectedGraphs = new Set<VolumeGraph>();
let audioContext: AudioContext | undefined;

function getState(video: HTMLVideoElement): VolumeState {
  let state = states.get(video);
  if (!state) {
    // iOS WebKit's volume readback does not establish actual sound-level
    // control. Use a real gain node on Apple touch devices even if a browser
    // version accepts or echoes a native volume assignment.
    const forceGain = /iPhone|iPad|iPod/.test(navigator.platform) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    state = { volume: video.volume, forceGain, nativeWritable: forceGain ? false : undefined };
    states.set(video, state);
  }
  return state;
}

function connectGraph(graph: VolumeGraph) {
  if (graph.connected || !audioContext) return;
  graph.source.connect(graph.gain);
  graph.gain.connect(audioContext.destination);
  graph.connected = true;
  graph.source.mediaElement.addEventListener("volumechange", graph.sync);
  graph.sync();
  connectedGraphs.add(graph);
}

export function getVideoVolume(video: HTMLVideoElement): number {
  const state = states.get(video);
  if (!state) return video.volume;
  if (!state.graph && state.nativeWritable !== false) state.volume = video.volume;
  return state.volume;
}

export function setVideoVolume(video: HTMLVideoElement, value: number) {
  const state = getState(video);
  const next = Math.max(0, Math.min(1, value));
  const previous = state.volume;
  const nativeBefore = video.volume;
  state.volume = next;
  if (state.graph && audioContext) {
    connectGraph(state.graph);
    state.graph.sync();
  }
  // A gain-controlled player uses unity native volume, avoiding double attenuation.
  video.volume = state.graph ? 1 : next;
  if (!state.graph && !state.forceGain) {
    if (Math.abs(video.volume - next) > 0.01) state.nativeWritable = false;
    else if (next !== 1) state.nativeWritable = true;
  }
  if (previous !== next && video.volume === nativeBefore) {
    video.dispatchEvent(new Event("volumechange"));
  }
}

// Call synchronously from a user gesture: Safari requires it to unlock audio.
// Apple touch devices use gain; other browsers use native capability detection.
export async function activateVideoVolume(video: HTMLVideoElement, allowProbe = true): Promise<void> {
  const state = getState(video);
  if (state.nativeWritable === undefined) {
    const nativeBefore = video.volume;
    if (Math.abs(nativeBefore - state.volume) > 0.01) {
      state.nativeWritable = false;
    } else {
      // Merely pressing Play must not emit volume-probe events that could
      // save a partially completed autoplay fade as the visitor's preference.
      if (!allowProbe) return;
      const probe = nativeBefore > 0.5 ? 0.25 : 0.75;
      video.volume = probe;
      state.nativeWritable = Math.abs(video.volume - probe) < 0.01;
      video.volume = state.nativeWritable ? state.volume : nativeBefore;
    }
  }
  if (state.nativeWritable) return;
  if (!audioContext) {
    const AudioContextConstructor = window.AudioContext
      ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) throw new Error("This browser cannot adjust video volume");
    audioContext = new AudioContextConstructor();
  }
  if (!state.graph) {
    const gain = audioContext.createGain();
    gain.gain.value = video.muted ? 0 : state.volume;
    const source = audioContext.createMediaElementSource(video);
    const context = audioContext;
    state.graph = { source, gain, connected: false, sync: () => {
      gain.gain.setTargetAtTime(video.muted ? 0 : state.volume, context.currentTime, 0.015);
    } };
    video.volume = 1;
  }
  connectGraph(state.graph);
  if (audioContext.state !== "running") await audioContext.resume();
}

export function releaseVideoVolume(video: HTMLVideoElement) {
  const graph = states.get(video)?.graph;
  if (!graph) return;
  graph.source.mediaElement.removeEventListener("volumechange", graph.sync);
  graph.source.disconnect();
  graph.gain.disconnect();
  graph.connected = false;
  connectedGraphs.delete(graph);
  const context = audioContext;
  if (context && connectedGraphs.size === 0) {
    void context.suspend().then(async () => {
      if (connectedGraphs.size > 0) await context.resume();
    }).catch((error: unknown) => console.warn("Unable to suspend unused video audio", error));
  }
}
