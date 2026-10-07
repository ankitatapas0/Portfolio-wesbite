import { useEffect, useRef } from "react";

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
      vec3 weight = vec3(
        smoothstep(0.8, 0.2, samplePosition),
        smoothstep(0.0, 0.5, samplePosition) * smoothstep(1.0, 0.5, samplePosition),
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
    gl_FragColor = vec4(finalColor / weightSum, edgeAlpha);
  }
`;

type DetailGlassBandProps = {
  isClosing: boolean;
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

function drawMedia(
  context: CanvasRenderingContext2D,
  media: HTMLImageElement | HTMLVideoElement,
  bounds: DOMRect,
  captureTop: number,
) {
  const sourceWidth = media instanceof HTMLImageElement
    ? media.naturalWidth
    : media.videoWidth;
  const sourceHeight = media instanceof HTMLImageElement
    ? media.naturalHeight
    : media.videoHeight;
  if (sourceWidth === 0 || sourceHeight === 0) return;

  const styles = getComputedStyle(media);
  const fit = styles.objectFit;
  const destinationRatio = bounds.width / bounds.height;
  const sourceRatio = sourceWidth / sourceHeight;
  let sourceX = 0;
  let sourceY = 0;
  let croppedWidth = sourceWidth;
  let croppedHeight = sourceHeight;
  let destinationX = bounds.left;
  let destinationY = bounds.top - captureTop;
  let destinationWidth = bounds.width;
  let destinationHeight = bounds.height;

  if (fit === "cover") {
    if (sourceRatio > destinationRatio) {
      croppedWidth = sourceHeight * destinationRatio;
      sourceX = (sourceWidth - croppedWidth) / 2;
    } else {
      croppedHeight = sourceWidth / destinationRatio;
      sourceY = (sourceHeight - croppedHeight) / 2;
    }
  } else if (fit === "contain") {
    if (sourceRatio > destinationRatio) {
      destinationHeight = bounds.width / sourceRatio;
      destinationY += (bounds.height - destinationHeight) / 2;
    } else {
      destinationWidth = bounds.height * sourceRatio;
      destinationX += (bounds.width - destinationWidth) / 2;
    }
  }

  context.drawImage(
    media,
    sourceX,
    sourceY,
    croppedWidth,
    croppedHeight,
    destinationX,
    destinationY,
    destinationWidth,
    destinationHeight,
  );
}

export function DetailGlassBand({ isClosing }: DetailGlassBandProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      console.error("WebGL is unavailable; the detail glass band cannot be rendered.");
      return;
    }

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    if (!program) {
      console.error("Unable to create the detail glass shader program.");
      return;
    }
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Unable to link the detail glass shader program.", gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return;
    }

    const positionLocation = gl.getAttribLocation(program, "aPosition");
    const textureLocation = gl.getUniformLocation(program, "uTexture");
    const positionBuffer = gl.createBuffer();
    const texture = gl.createTexture();
    if (!positionBuffer || !texture || positionLocation < 0 || !textureLocation) {
      console.error("Unable to initialize the detail glass shader inputs.");
      return;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);

    const sourceCanvas = document.createElement("canvas");
    const sourceContext = sourceCanvas.getContext("2d", { alpha: false });
    if (!sourceContext) {
      console.error("Unable to create the detail glass source surface.");
      return;
    }

    let sourceBackground = getComputedStyle(document.documentElement)
      .getPropertyValue("--color-main-1")
      .trim();
    const themeObserver = new MutationObserver(() => {
      sourceBackground = getComputedStyle(document.documentElement)
        .getPropertyValue("--color-main-1")
        .trim();
    });
    themeObserver.observe(document.documentElement, {
      attributeFilter: ["data-theme"],
      attributes: true,
    });

    let pixelRatio = 1;
    let surfaceWidth = 0;
    const resize = () => {
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const scrollContainer = document.querySelector<HTMLElement>(
        ".detail-page-transition-backdrop",
      );
      const width = Math.max(scrollContainer?.clientWidth ?? window.innerWidth, 1);
      surfaceWidth = width;
      canvas.style.width = `${width}px`;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(bandHeight * pixelRatio);
      sourceCanvas.width = canvas.width;
      sourceCanvas.height = Math.round(captureHeight * pixelRatio);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();

    const visualViewport = window.visualViewport;
    const scrollContainer = document.querySelector<HTMLElement>(
      ".detail-page-transition-backdrop",
    );
    const scrollContainerResizeObserver = new ResizeObserver(() => resize());
    if (scrollContainer) {
      scrollContainerResizeObserver.observe(scrollContainer);
    }
    window.addEventListener("resize", resize);
    visualViewport?.addEventListener("resize", resize);

    let animationFrame = 0;
    const render = () => {
      animationFrame = requestAnimationFrame(render);

      const currentScrollContainer = document.querySelector<HTMLElement>(
        ".detail-page-transition-backdrop",
      );
      const currentWidth = Math.max(
        currentScrollContainer?.clientWidth ?? window.innerWidth,
        1,
      );
      const currentPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      if (currentWidth !== surfaceWidth || currentPixelRatio !== pixelRatio) {
        resize();
      }

      const viewportHeight = visualViewport?.height ?? window.innerHeight;
      const captureTop = viewportHeight - captureHeight;
      const viewportWidth = sourceCanvas.width / pixelRatio;
      sourceContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      sourceContext.fillStyle = sourceBackground;
      sourceContext.fillRect(0, 0, viewportWidth, captureHeight);

      const mediaElements = document.querySelectorAll<HTMLElement>(
        "video[data-detail-page-content], .expanded-media-image-frame[data-detail-page-content]",
      );
      mediaElements.forEach((element) => {
        const bounds = element.getBoundingClientRect();
        if (bounds.bottom <= captureTop || bounds.top >= viewportHeight) return;

        const media = element instanceof HTMLVideoElement
          ? element
          : element.querySelector("img");
        if (
          !media
          || (media instanceof HTMLImageElement && !media.complete)
          || (media instanceof HTMLVideoElement && media.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)
        ) return;

        drawMedia(sourceContext, media, bounds, captureTop);
      });

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGB,
        gl.RGB,
        gl.UNSIGNED_BYTE,
        sourceCanvas,
      );
      gl.useProgram(program);
      gl.uniform1i(textureLocation, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    animationFrame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      visualViewport?.removeEventListener("resize", resize);
      scrollContainerResizeObserver?.disconnect();
      themeObserver.disconnect();
      gl.deleteTexture(texture);
      gl.deleteBuffer(positionBuffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`detail-page-glass-band${isClosing ? " is-closing" : ""}`}
      aria-hidden="true"
    />
  );
}
