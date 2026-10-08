import { useEffect, useRef, type RefObject } from "react";
import { createGlassRenderer } from "./glassRenderer";

const bandHeight = 70;
const captureHeight = 140;
const edgeFeatherHeight = 30;

const vertexShaderSource = `
  attribute vec2 aPosition;
  varying vec2 vUv;

  void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const fragmentShaderSource = `
  precision highp float;

  uniform sampler2D uTexture;
  varying vec2 vUv;

  float sag(float t) {
    t = clamp(t, 0.0, 1.0);
    return 1.0 - sqrt(1.0 - t * t);
  }

  void main() {
    float t = 1.0 - vUv.y;
    float distancePx = sag(t) * ${bandHeight.toFixed(1)};
    float sourceDistancePx = vUv.y * ${bandHeight.toFixed(1)} + distancePx;

    vec3 finalColor = vec3(0.0);
    vec3 weightSum = vec3(0.0);

    for (int i = 0; i < 16; i++) {
      float samplePosition = float(i) / 15.0;
      // GLSL leaves reversed smoothstep edges undefined. Invert an ascending
      // ramp instead so mobile GPUs calculate the same channel weights.
      vec3 weight = vec3(
        1.0 - smoothstep(0.2, 0.8, samplePosition),
        smoothstep(0.0, 0.5, samplePosition) * (1.0 - smoothstep(0.5, 1.0, samplePosition)),
        smoothstep(0.2, 0.8, samplePosition)
      );
      float chromaticShiftPx = (samplePosition - 0.5) * 0.3 * distancePx;
      float sourceY = clamp(
        (sourceDistancePx + chromaticShiftPx) / ${captureHeight.toFixed(1)},
        0.0,
        1.0
      );
      finalColor += texture2D(uTexture, vec2(vUv.x, sourceY)).rgb * weight;
      weightSum += weight;
    }

    float edgeAlpha = smoothstep(
      0.0,
      ${(edgeFeatherHeight / bandHeight).toFixed(4)},
      t
    );
    // Match the canvas's premultiplied-alpha contract. Transparent pixels
    // must not carry bright RGB values that can produce mobile edge halos.
    gl_FragColor = vec4((finalColor / weightSum) * edgeAlpha, edgeAlpha);
  }
`;

type DetailGlassBandProps = {
  isClosing: boolean;
  backdropRef: RefObject<HTMLDivElement | null>;
};

function createShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) {
    console.error("Unable to create the detail glass shader.");
    return null;
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Unable to compile the detail glass shader.", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function DetailGlassBand({ isClosing, backdropRef }: DetailGlassBandProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      console.error("WebGL is unavailable; the detail glass band cannot be rendered.");
      return;
    }

    const initializeGpu = (): (() => void) | null => {
      const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
      const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
      if (!vertexShader || !fragmentShader) {
        if (vertexShader) gl.deleteShader(vertexShader);
        if (fragmentShader) gl.deleteShader(fragmentShader);
        return null;
      }

      const program = gl.createProgram();
      const releaseShaders = () => {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
      };
      if (!program) {
        console.error("Unable to create the detail glass shader program.");
        releaseShaders();
        return null;
      }
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("Unable to link the detail glass shader program.", gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        releaseShaders();
        return null;
      }

      const positionLocation = gl.getAttribLocation(program, "aPosition");
      const textureLocation = gl.getUniformLocation(program, "uTexture");
      const positionBuffer = gl.createBuffer();
      const texture = gl.createTexture();
      if (!positionBuffer || !texture || positionLocation < 0 || !textureLocation) {
        console.error("Unable to initialize the detail glass shader inputs.");
        if (positionBuffer) gl.deleteBuffer(positionBuffer);
        if (texture) gl.deleteTexture(texture);
        gl.deleteProgram(program);
        releaseShaders();
        return null;
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW,
      );
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.useProgram(program);
      gl.uniform1i(textureLocation, 0);
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
      return () => {
        gl.deleteTexture(texture);
        gl.deleteBuffer(positionBuffer);
        gl.deleteProgram(program);
        releaseShaders();
      };
    };

    return createGlassRenderer(
      canvas, gl, backdropRef.current, bandHeight, captureHeight, initializeGpu,
    );
  }, [backdropRef]);

  return (
    <canvas
      ref={canvasRef}
      className={`detail-page-glass-band${isClosing ? " is-closing" : ""}`}
      aria-hidden="true"
    />
  );
}
