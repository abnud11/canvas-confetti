/* globals Map */

import {
  colorsToRgb,
  getOrigin,
  onlyPositiveInt,
  property,
  raf,
  randomInt,
  randomPhysics,
  updateFetti,
  type Options,
  type Physics,
} from "./shared";
import MyWorker from "./worker?worker";

type DecoratedWorker = Worker & {
  init: (canvas: HTMLCanvasElement) => void;
  fire: (options: Options, done: () => void) => Promise<void>;
  reset: () => void;
};
const getWorker = (function () {
  let worker: DecoratedWorker | undefined;
  let prom: Promise<void> | undefined;
  const resolves: Record<string, () => void> = {};

  function decorate(worker: DecoratedWorker) {
    function execute(options: Options, callback: string | null) {
      worker.postMessage({ options: options || {}, callback: callback });
    }
    worker.init = function initWorker(canvas) {
      const offscreen = canvas.transferControlToOffscreen();
      worker.postMessage({ canvas: offscreen }, [offscreen]);
    };

    worker.fire = function fireWorker(options, done) {
      if (prom) {
        execute(options, null);
        return prom;
      }

      const id = Math.random().toString(36).slice(2);

      prom = new Promise(function (resolve) {
        function workerDone(message: { data: { callback: string } }) {
          if (message.data.callback !== id) {
            return;
          }

          delete resolves[id];
          worker.removeEventListener("message", workerDone);

          prom = undefined;

          done();
          resolve();
        }

        worker.addEventListener("message", workerDone);
        execute(options, id);

        resolves[id] = workerDone.bind(null, { data: { callback: id } });
      });

      return prom;
    };

    worker.reset = function resetWorker() {
      worker.postMessage({ reset: true });

      for (const id in resolves) {
        resolves[id]();
        delete resolves[id];
      }
    };
  }

  return function () {
    if (worker) {
      return worker;
    }

    try {
      worker = new MyWorker() as DecoratedWorker;
    } catch (error) {
      typeof console !== undefined && typeof console.warn === "function"
        ? console.warn("🎊 Could not load worker", error)
        : null;

      return null;
    }

    decorate(worker);

    return worker;
  };
})();

function getCanvas(zIndex: number) {
  const canvas = document.createElement("canvas");

  canvas.style.position = "fixed";
  canvas.style.top = "0px";
  canvas.style.left = "0px";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = `${zIndex}`;

  return canvas;
}

function animate(
  canvas: HTMLCanvasElement,
  fettis: Physics[],
  resizer: (canvas: HTMLCanvasElement) => void,
  size: { width: number | null; height: number | null },
  done: () => void,
) {
  let animatingFettis = [...fettis];
  const context = canvas.getContext("2d")!;
  let animationFrame: number | undefined;
  let destroy: (() => void) | undefined;

  const prom = new Promise(function (resolve) {
    function onDone() {
      animationFrame = destroy = undefined;
      if (size.width && size.height) {
        context.clearRect(0, 0, size.width, size.height);
      }
      done();
      resolve(undefined);
    }

    function update() {
      if (!size.width && !size.height) {
        resizer(canvas);
        size.width = canvas.width;
        size.height = canvas.height;
      }
      if (size.width && size.height) {
        context.clearRect(0, 0, size.width, size.height);
      }
      animatingFettis = animatingFettis.filter(function (fetti) {
        return updateFetti(context, fetti);
      });

      if (animatingFettis.length > 0) {
        animationFrame = raf.frame(update);
      } else {
        onDone();
      }
    }

    animationFrame = raf.frame(update);
    destroy = onDone;
  });

  return {
    addFettis: function (fettis: Physics[]) {
      animatingFettis = animatingFettis.concat(fettis);

      return prom;
    },
    canvas: canvas,
    promise: prom,
    reset: function () {
      if (animationFrame) {
        raf.cancel(animationFrame);
      }

      if (destroy) {
        destroy();
      }
    },
  };
}

declare global {
  interface HTMLCanvasElement {
    __confetti_initialized?: boolean;
  }
}

// Make default export lazy to defer worker creation until called.
let defaultFire: ReturnType<typeof confettiCannon> | null = null;
function getDefaultFire() {
  if (!defaultFire) {
    defaultFire = confettiCannon(null, { useWorker: true, resize: true });
  }
  return defaultFire;
}

export function shapeFromPath(
  pathData: string | { path: string; matrix?: string | number[] },
) {
  let path, matrix;

  if (typeof pathData === "string") {
    path = pathData;
  } else {
    path = pathData.path;
    matrix = pathData.matrix;
  }

  const path2d = new Path2D(path);
  const temporaryCanvas = document.createElement("canvas");
  const temporaryContext = temporaryCanvas.getContext("2d")!;

  if (!matrix) {
    // attempt to figure out the width of the path, up to 1000x1000
    const maxSize = 1000;
    let minX = maxSize;
    let minY = maxSize;
    let maxX = 0;
    let maxY = 0;
    let width, height;

    // do some line skipping... this is faster than checking
    // every pixel and will be mostly still correct
    for (let x = 0; x < maxSize; x += 2) {
      for (let y = 0; y < maxSize; y += 2) {
        if (temporaryContext.isPointInPath(path2d, x, y, "nonzero")) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    width = maxX - minX;
    height = maxY - minY;

    const maxDesiredSize = 10;
    const scale = Math.min(maxDesiredSize / width, maxDesiredSize / height);

    matrix = [
      scale,
      0,
      0,
      scale,
      -Math.round(width / 2 + minX) * scale,
      -Math.round(height / 2 + minY) * scale,
    ];
  }

  return {
    type: "path",
    path: path,
    matrix: matrix,
  };
}

export function shapeFromText(
  textData:
    | string
    | { text: string; scalar?: number; fontFamily?: string; color?: string },
) {
  let text,
    scalar = 1,
    color = "#000000",
    // see https://nolanlawson.com/2022/04/08/the-struggle-of-using-native-emoji-on-the-web/
    fontFamily =
      '"Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", "EmojiOne Color", "Android Emoji", "Twemoji Mozilla", "system emoji", sans-serif';

  if (typeof textData === "string") {
    text = textData;
  } else {
    text = textData.text;
    scalar = textData.scalar ? textData.scalar : scalar;
    fontFamily = textData.fontFamily ? textData.fontFamily : fontFamily;
    color = textData.color ? textData.color : color;
  }

  // all other confetti are 10 pixels,
  // so this pixel size is the de-facto 100% scale confetti
  const fontSize = 10 * scalar;
  const font = "" + fontSize + "px " + fontFamily;

  let canvas = new OffscreenCanvas(fontSize, fontSize);
  let context = canvas.getContext("2d")!;

  context.font = font;
  const size = context.measureText(text);
  let width = Math.ceil(
    size.actualBoundingBoxRight + size.actualBoundingBoxLeft,
  );
  let height = Math.ceil(
    size.actualBoundingBoxAscent + size.actualBoundingBoxDescent,
  );

  const padding = 2;
  const x = size.actualBoundingBoxLeft + padding;
  const y = size.actualBoundingBoxAscent + padding;
  width += padding + padding;
  height += padding + padding;

  canvas = new OffscreenCanvas(width, height);
  context = canvas.getContext("2d")!;
  context.font = font;
  context.fillStyle = color;

  context.fillText(text, x, y);

  const scale = 1 / scalar;

  return {
    type: "bitmap",
    // TODO these probably need to be transfered for workers
    bitmap: canvas.transferToImageBitmap(),
    matrix: [scale, 0, 0, scale, (-width * scale) / 2, (-height * scale) / 2],
  };
}

function setCanvasWindowSize(canvas: HTMLCanvasElement) {
  canvas.width = document.documentElement.clientWidth;
  canvas.height = document.documentElement.clientHeight;
}

function setCanvasRectSize(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
}
interface ConfettiOptions {
  resize?: boolean;
  disableForReducedMotion?: boolean;
  useWorker?: boolean;
  zIndex?: number;
}
function confettiCannon(
  canvas: HTMLCanvasElement | null,
  globalOptions?: ConfettiOptions,
) {
  const isLibraryCanvas = !canvas;
  globalOptions ??= {};
  const allowResize = globalOptions.resize ?? false;
  let hasResizeEventRegistered = false;
  const globalDisableForReducedMotion = property(
    globalOptions,
    "disableForReducedMotion",
    Boolean,
  );
  const shouldUseWorker = globalOptions.useWorker ?? true;
  const worker = shouldUseWorker ? getWorker() : null;
  const resizer = isLibraryCanvas ? setCanvasWindowSize : setCanvasRectSize;
  let initialized = canvas && worker ? !!canvas.__confetti_initialized : false;
  const preferLessMotion =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion)").matches;
  let animationObject: ReturnType<typeof animate> | null = null;

  function fireLocal(
    options: Options,
    size: { width: number | null; height: number | null },
    done: () => void,
  ) {
    const particleCount = property(options, "particleCount", onlyPositiveInt);
    const angle = property(options, "angle", Number);
    const spread = property(options, "spread", Number);
    const startVelocity = property(options, "startVelocity", Number);
    const decay = property(options, "decay", Number);
    const gravity = property(options, "gravity", Number);
    const drift = property(options, "drift", Number);
    const colors = property(options, "colors", colorsToRgb);
    const ticks = property(options, "ticks", Number);
    const shapes = property(options, "shapes");
    const scalar = property(options, "scalar");
    const flat = !!property(options, "flat");
    const origin = getOrigin(options);

    let temporary = particleCount;
    const fettis = [];

    const startX = canvas!.width * origin.x;
    const startY = canvas!.height * origin.y;

    while (temporary--) {
      fettis.push(
        randomPhysics({
          x: startX,
          y: startY,
          angle: angle,
          spread: spread,
          startVelocity: startVelocity,
          color: colors[temporary % colors.length],
          shape: shapes[randomInt(0, shapes.length)],
          ticks: ticks,
          decay: decay,
          gravity: gravity,
          drift: drift,
          scalar: scalar,
          flat: flat,
        }),
      );
    }

    // if we have a previous canvas already animating,
    // add to it
    if (animationObject) {
      return animationObject.addFettis(fettis);
    }

    animationObject = animate(canvas!, fettis, resizer, size, done);

    return animationObject.promise;
  }

  function fire(options: Options) {
    const disableForReducedMotion =
      globalDisableForReducedMotion ||
      property(options, "disableForReducedMotion", Boolean);
    const zIndex = property(options, "zIndex", Number);

    if (disableForReducedMotion && preferLessMotion) {
      return Promise.resolve();
    }

    if (isLibraryCanvas && animationObject) {
      // use existing canvas from in-progress animation
      canvas = animationObject.canvas;
    } else if (isLibraryCanvas && !canvas) {
      // create and initialize a new canvas
      canvas = getCanvas(zIndex);
      document.body.append(canvas);
    }

    if (allowResize && !initialized) {
      // initialize the size of a user-supplied canvas
      resizer(canvas!);
    }

    const size: { width: number | null; height: number | null } = {
      width: canvas!.width,
      height: canvas!.height,
    };

    if (worker && !initialized) {
      worker.init(canvas!);
    }

    initialized = true;

    if (worker) {
      canvas!.__confetti_initialized = true;
    }

    function onResize() {
      if (worker) {
        // TODO this really shouldn't be immediate, because it is expensive
        const object = {
          getBoundingClientRect: function () {
            if (!isLibraryCanvas) {
              return canvas!.getBoundingClientRect();
            }
          },
        } as HTMLCanvasElement;

        resizer(object);

        worker.postMessage({
          resize: {
            width: object.width,
            height: object.height,
          },
        });
        return;
      }

      // don't actually query the size here, since this
      // can execute frequently and rapidly
      size.width = size.height = null;
    }

    function done() {
      animationObject = null;

      if (allowResize) {
        hasResizeEventRegistered = false;
        globalThis.removeEventListener("resize", onResize);
      }

      if (isLibraryCanvas && canvas) {
        if (document.body.contains(canvas)) {
          canvas.remove();
        }
        canvas = null;
        initialized = false;
      }
    }

    if (allowResize && !hasResizeEventRegistered) {
      hasResizeEventRegistered = true;
      globalThis.addEventListener("resize", onResize, false);
    }

    if (worker) {
      return worker.fire(options, done);
    }

    return fireLocal(options, size, done);
  }

  fire.reset = function () {
    if (worker) {
      worker.reset();
    }

    if (animationObject) {
      animationObject.reset();
    }
  };

  return fire;
}
export function fireConfetti(options: Options) {
  return getDefaultFire()(options);
}
export const reset = function () {
  getDefaultFire().reset();
};

export const create = confettiCannon;
