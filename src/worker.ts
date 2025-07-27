import type { Physics, Options } from "./shared.ts";
import {
  randomPhysics,
  raf,
  updateFetti,
  property,
  onlyPositiveInt,
  colorsToRgb,
  getOrigin,
  randomInt,
} from "./shared.ts";

function animate(
  canvas: HTMLCanvasElement,
  fettis: Physics[],
  size: { width: number | null; height: number | null },
  done: () => void,
) {
  let animatingFettis = [...fettis];
  const context = canvas.getContext("2d")!;
  let animationFrame: number | undefined;
  let destroy: (() => void) | undefined;

  const prom = new Promise<void>(function (resolve) {
    function onDone() {
      animationFrame = destroy = undefined;
      if (size.width && size.height) {
        context.clearRect(0, 0, size.width, size.height);
      }
      done();
      resolve();
    }

    function update() {
      if (!(size.width === SIZE.width && size.height === SIZE.height)) {
        size.width = canvas.width = SIZE.width!;
        size.height = canvas.height = SIZE.height!;
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
      animatingFettis = [...animatingFettis, ...fettis];

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
function confettiCannon(canvas: HTMLCanvasElement | null) {
  const isLibraryCanvas = !canvas;

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

    animationObject = animate(canvas!, fettis, size, done);

    return animationObject.promise;
  }

  function fire(options: Options) {
    if (isLibraryCanvas && animationObject) {
      // use existing canvas from in-progress animation
      canvas = animationObject.canvas;
    }

    const size: { width: number | null; height: number | null } = {
      width: canvas!.width,
      height: canvas!.height,
    };

    function done() {
      animationObject = null;

      if (isLibraryCanvas && canvas) {
        if (document.body.contains(canvas)) {
          canvas.remove();
        }
        canvas = null;
      }
    }

    return fireLocal(options, size, done);
  }

  fire.reset = function () {
    if (animationObject) {
      animationObject.reset();
    }
  };

  return fire;
}
let CONFETTI: ReturnType<typeof confettiCannon> | null = null;
const SIZE: { width?: number; height?: number } = {};
interface CallConfettiMessage {
  data: {
    options: Options;
    callback?: string | null;
  };
}
interface ResetConfettiMessage {
  data: {
    reset: true;
  };
}
interface ResizeConfettiMessage {
  data: {
    resize: { width: number; height: number };
  };
}
interface CanvasConfettiMessage {
  data: {
    canvas: HTMLCanvasElement;
  };
}
type ConfettiMessage =
  | CallConfettiMessage
  | ResetConfettiMessage
  | ResizeConfettiMessage
  | CanvasConfettiMessage;
globalThis.addEventListener("message", (message: ConfettiMessage) => {
  if ("options" in message.data && message.data.options) {
    void CONFETTI?.(message.data.options).then(function () {
      if ((message as CallConfettiMessage).data.callback) {
        postMessage({
          callback: (message as CallConfettiMessage).data.callback,
        });
      }
    });
  } else if ("reset" in message.data && message.data.reset) {
    CONFETTI?.reset();
  } else if ("resize" in message.data && message.data.resize) {
    SIZE.width = message.data.resize.width;
    SIZE.height = message.data.resize.height;
  } else if ("canvas" in message.data && message.data.canvas) {
    SIZE.width = message.data.canvas.width;
    SIZE.height = message.data.canvas.height;
    CONFETTI = confettiCannon(message.data.canvas);
  }
});
