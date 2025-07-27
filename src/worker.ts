import type { Physics, Options } from "./shared.ts";
import {
  randomPhysics,
  raf,
  updateFetti,
  prop,
  onlyPositiveInt,
  colorsToRgb,
  getOrigin,
  randomInt,
} from "./shared.ts";

function animate(
  canvas: HTMLCanvasElement,
  fettis: Physics[],
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
function confettiCannon(canvas: HTMLCanvasElement | null) {
  const isLibCanvas = !canvas;

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

    animationObj = animate(canvas!, fettis, size, done);

    return animationObj.promise;
  }

  function fire(options: Options) {
    if (isLibCanvas && animationObj) {
      // use existing canvas from in-progress animation
      canvas = animationObj.canvas;
    }

    var size: { width: number | null; height: number | null } = {
      width: canvas!.width,
      height: canvas!.height,
    };

    function done() {
      animationObj = null;

      if (isLibCanvas && canvas) {
        if (document.body.contains(canvas)) {
          document.body.removeChild(canvas);
        }
        canvas = null;
      }
    }

    return fireLocal(options, size, done);
  }

  fire.reset = function () {
    if (animationObj) {
      animationObj.reset();
    }
  };

  return fire;
}
var CONFETTI: ReturnType<typeof confettiCannon> | null = null,
  SIZE: { width?: number; height?: number } = {};
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
self.onmessage = function (msg: ConfettiMessage) {
  if ("options" in msg.data && msg.data.options) {
    CONFETTI?.(msg.data.options).then(function () {
      if ((msg as CallConfettiMessage).data.callback) {
        postMessage({ callback: (msg as CallConfettiMessage).data.callback });
      }
    });
  } else if ("reset" in msg.data && msg.data.reset) {
    CONFETTI?.reset();
  } else if ("resize" in msg.data && msg.data.resize) {
    SIZE.width = msg.data.resize.width;
    SIZE.height = msg.data.resize.height;
  } else if ("canvas" in msg.data && msg.data.canvas) {
    SIZE.width = msg.data.canvas.width;
    SIZE.height = msg.data.canvas.height;
    CONFETTI = confettiCannon(msg.data.canvas);
  }
};
