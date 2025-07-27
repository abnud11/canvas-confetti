/* globals Map */

import {
  colorsToRgb,
  getOrigin,
  onlyPositiveInt,
  prop,
  raf,
  randomInt,
  randomPhysics,
  setCanvasRectSize,
  setCanvasWindowSize,
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
var getWorker = (function () {
  var worker: DecoratedWorker | undefined;
  var prom: Promise<void> | undefined;
  var resolves: Record<string, () => void> = {};

  function decorate(worker: DecoratedWorker) {
    function execute(options: Options, callback: string | null) {
      worker.postMessage({ options: options || {}, callback: callback });
    }
    worker.init = function initWorker(canvas) {
      var offscreen = canvas.transferControlToOffscreen();
      worker.postMessage({ canvas: offscreen }, [offscreen]);
    };

    worker.fire = function fireWorker(options, done) {
      if (prom) {
        execute(options, null);
        return prom;
      }

      var id = Math.random().toString(36).slice(2);

      prom = new Promise(function (resolve) {
        function workerDone(msg: { data: { callback: string } }) {
          if (msg.data.callback !== id) {
            return;
          }

          delete resolves[id];
          worker.removeEventListener("message", workerDone);

          prom = undefined;

          done();
          resolve(undefined);
        }

        worker.addEventListener("message", workerDone);
        execute(options, id);

        resolves[id] = workerDone.bind(null, { data: { callback: id } });
      });

      return prom;
    };

    worker.reset = function resetWorker() {
      worker.postMessage({ reset: true });

      for (var id in resolves) {
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
    } catch (e) {
      // eslint-disable-next-line no-console
      typeof console !== undefined && typeof console.warn === "function"
        ? console.warn("🎊 Could not load worker", e)
        : null;

      return null;
    }

    decorate(worker);

    return worker;
  };
})();

function getCanvas(zIndex: number) {
  var canvas = document.createElement("canvas");

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
  done: () => void
) {
  var animatingFettis = fettis.slice();
  var context = canvas.getContext("2d")!;
  var animationFrame: number | undefined;
  var destroy: (() => void) | undefined;

  var prom = new Promise(function (resolve) {
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

      if (animatingFettis.length) {
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
var defaultFire: ReturnType<typeof confettiCannon> | null = null;
function getDefaultFire() {
  if (!defaultFire) {
    defaultFire = confettiCannon(null, { useWorker: true, resize: true });
  }
  return defaultFire;
}

export function shapeFromPath(
  pathData: string | { path: string; matrix?: string | number[] }
) {
  var path, matrix;

  if (typeof pathData === "string") {
    path = pathData;
  } else {
    path = pathData.path;
    matrix = pathData.matrix;
  }

  var path2d = new Path2D(path);
  var tempCanvas = document.createElement("canvas");
  var tempCtx = tempCanvas.getContext("2d")!;

  if (!matrix) {
    // attempt to figure out the width of the path, up to 1000x1000
    var maxSize = 1000;
    var minX = maxSize;
    var minY = maxSize;
    var maxX = 0;
    var maxY = 0;
    var width, height;

    // do some line skipping... this is faster than checking
    // every pixel and will be mostly still correct
    for (var x = 0; x < maxSize; x += 2) {
      for (var y = 0; y < maxSize; y += 2) {
        if (tempCtx.isPointInPath(path2d, x, y, "nonzero")) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    width = maxX - minX;
    height = maxY - minY;

    var maxDesiredSize = 10;
    var scale = Math.min(maxDesiredSize / width, maxDesiredSize / height);

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
    | { text: string; scalar?: number; fontFamily?: string; color?: string }
) {
  var text,
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
  var fontSize = 10 * scalar;
  var font = "" + fontSize + "px " + fontFamily;

  var canvas = new OffscreenCanvas(fontSize, fontSize);
  var ctx = canvas.getContext("2d")!;

  ctx.font = font;
  var size = ctx.measureText(text);
  var width = Math.ceil(
    size.actualBoundingBoxRight + size.actualBoundingBoxLeft
  );
  var height = Math.ceil(
    size.actualBoundingBoxAscent + size.actualBoundingBoxDescent
  );

  var padding = 2;
  var x = size.actualBoundingBoxLeft + padding;
  var y = size.actualBoundingBoxAscent + padding;
  width += padding + padding;
  height += padding + padding;

  canvas = new OffscreenCanvas(width, height);
  ctx = canvas.getContext("2d")!;
  ctx.font = font;
  ctx.fillStyle = color;

  ctx.fillText(text, x, y);

  var scale = 1 / scalar;

  return {
    type: "bitmap",
    // TODO these probably need to be transfered for workers
    bitmap: canvas.transferToImageBitmap(),
    matrix: [scale, 0, 0, scale, (-width * scale) / 2, (-height * scale) / 2],
  };
}
interface ConfettiOptions {
  resize?: boolean;
  disableForReducedMotion?: boolean;
  useWorker?: boolean;
  zIndex?: number;
}
function confettiCannon(
  canvas: HTMLCanvasElement | null,
  globalOpts?: ConfettiOptions
) {
  const isLibCanvas = !canvas;
  globalOpts ??= {};
  var allowResize = globalOpts.resize ?? true;
  var hasResizeEventRegistered = false;
  var globalDisableForReducedMotion = prop(
    globalOpts,
    "disableForReducedMotion",
    Boolean
  );
  var shouldUseWorker = globalOpts.useWorker ?? true;
  var worker = shouldUseWorker ? getWorker() : null;
  var resizer = isLibCanvas ? setCanvasWindowSize : setCanvasRectSize;
  var initialized = canvas && worker ? !!canvas.__confetti_initialized : false;
  var preferLessMotion =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion)").matches;
  var animationObj: ReturnType<typeof animate> | null = null;

  function fireLocal(
    options: Options,
    size: { width: number | null; height: number | null },
    done: () => void
  ) {
    var particleCount = prop(options, "particleCount", onlyPositiveInt);
    var angle = prop(options, "angle", Number);
    var spread = prop(options, "spread", Number);
    var startVelocity = prop(options, "startVelocity", Number);
    var decay = prop(options, "decay", Number);
    var gravity = prop(options, "gravity", Number);
    var drift = prop(options, "drift", Number);
    var colors = prop(options, "colors", colorsToRgb);
    var ticks = prop(options, "ticks", Number);
    var shapes = prop(options, "shapes");
    var scalar = prop(options, "scalar");
    var flat = !!prop(options, "flat");
    var origin = getOrigin(options);

    var temp = particleCount;
    var fettis = [];

    var startX = canvas!.width * origin.x;
    var startY = canvas!.height * origin.y;

    while (temp--) {
      fettis.push(
        randomPhysics({
          x: startX,
          y: startY,
          angle: angle,
          spread: spread,
          startVelocity: startVelocity,
          color: colors[temp % colors.length],
          shape: shapes[randomInt(0, shapes.length)],
          ticks: ticks,
          decay: decay,
          gravity: gravity,
          drift: drift,
          scalar: scalar,
          flat: flat,
        })
      );
    }

    // if we have a previous canvas already animating,
    // add to it
    if (animationObj) {
      return animationObj.addFettis(fettis);
    }

    animationObj = animate(canvas!, fettis, resizer, size, done);

    return animationObj.promise;
  }

  function fire(options: Options) {
    var disableForReducedMotion =
      globalDisableForReducedMotion ||
      prop(options, "disableForReducedMotion", Boolean);
    var zIndex = prop(options, "zIndex", Number);

    if (disableForReducedMotion && preferLessMotion) {
      return Promise.resolve();
    }

    if (isLibCanvas && animationObj) {
      // use existing canvas from in-progress animation
      canvas = animationObj.canvas;
    } else if (isLibCanvas && !canvas) {
      // create and initialize a new canvas
      canvas = getCanvas(zIndex);
      document.body.appendChild(canvas);
    }

    if (allowResize && !initialized) {
      // initialize the size of a user-supplied canvas
      resizer(canvas!);
    }

    var size: { width: number | null; height: number | null } = {
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
        var obj = {
          getBoundingClientRect: function () {
            if (!isLibCanvas) {
              return canvas!.getBoundingClientRect();
            }
          },
        } as HTMLCanvasElement;

        resizer(obj);

        worker.postMessage({
          resize: {
            width: obj.width,
            height: obj.height,
          },
        });
        return;
      }

      // don't actually query the size here, since this
      // can execute frequently and rapidly
      size.width = size.height = null;
    }

    function done() {
      animationObj = null;

      if (allowResize) {
        hasResizeEventRegistered = false;
        global.removeEventListener("resize", onResize);
      }

      if (isLibCanvas && canvas) {
        if (document.body.contains(canvas)) {
          document.body.removeChild(canvas);
        }
        canvas = null;
        initialized = false;
      }
    }

    if (allowResize && !hasResizeEventRegistered) {
      hasResizeEventRegistered = true;
      global.addEventListener("resize", onResize, false);
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

    if (animationObj) {
      animationObj.reset();
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
