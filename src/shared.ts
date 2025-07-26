export interface Options {
  particleCount?: number;
  angle?: number;
  spread?: number;
  startVelocity?: number;
  decay?: number;
  gravity?: number;
  drift?: number;
  ticks?: number;
  x?: number;
  y?: number;
  shapes?: string[];
  shape?:
    | string
    | { type: "path"; path: string; matrix?: string | number[] }
    | {
        type: "bitmap";
        bitmap: OffscreenCanvas | HTMLImageElement | HTMLCanvasElement;
        matrix?: string | number[];
      };
  zIndex?: number;
  colors?: string[];
  disableForReducedMotion?: boolean;
  scalar?: number;
  origin?: { x: number; y: number };
  color?: { r: number; g: number; b: number };
  flat?: boolean;
}

const defaults: Options = {
  particleCount: 50,
  angle: 90,
  spread: 45,
  startVelocity: 45,
  decay: 0.9,
  gravity: 1,
  drift: 0,
  ticks: 200,
  x: 0.5,
  y: 0.5,
  shapes: ["square", "circle"],
  zIndex: 100,
  colors: [
    "#26ccff",
    "#a25afd",
    "#ff5e7e",
    "#88ff5a",
    "#fcff42",
    "#ffa62d",
    "#ff36ff",
  ],
  // probably should be true, but back-compat
  disableForReducedMotion: false,
  scalar: 1,
};
function isOk(val: unknown): val is NonNullable<unknown> {
  return !(val === null || val === undefined);
}
export function prop<K extends keyof Options>(
  options: Options,
  name: K
): NonNullable<Options[K]>;
export function prop<K extends keyof Options, R>(
  options: Options,
  name: K,
  transform: (val: NonNullable<Options[K]>) => R
): R;
export function prop<K extends keyof Options, R>(
  options: Options | undefined,
  name: K,
  transform?: (val: Options[K]) => R
): NonNullable<Options[K]> | R {
  const value = options && isOk(options[name]) ? options[name] : defaults[name];
  return transform ? transform(value) : (value as NonNullable<Options[K]>);
}

export var raf = (function () {
  var TIME = Math.floor(1000 / 60);
  var frame, cancel;
  var frames: Record<number, number> = {};
  var lastFrameTime = 0;

  frame = function (cb: () => void) {
    var id = Math.random();

    frames[id] = requestAnimationFrame(function onFrame(time) {
      if (lastFrameTime === time || lastFrameTime + TIME - 1 < time) {
        lastFrameTime = time;
        delete frames[id];

        cb();
      } else {
        frames[id] = requestAnimationFrame(onFrame);
      }
    });

    return id;
  };
  cancel = function (id: number) {
    if (frames[id]) {
      cancelAnimationFrame(frames[id]);
    }
  };

  return { frame: frame, cancel: cancel };
})();

export function randomPhysics(opts: Options) {
  var radAngle = prop(opts, "angle") * (Math.PI / 180);
  var radSpread = prop(opts, "spread") * (Math.PI / 180);

  return {
    x: opts.x,
    y: opts.y,
    wobble: Math.random() * 10,
    wobbleSpeed: Math.min(0.11, Math.random() * 0.1 + 0.05),
    velocity:
      prop(opts, "startVelocity") * 0.5 +
      Math.random() * prop(opts, "startVelocity"),
    angle2D: -radAngle + (0.5 * radSpread - Math.random() * radSpread),
    tiltAngle: (Math.random() * (0.75 - 0.25) + 0.25) * Math.PI,
    color: prop(opts, "color"),
    shape: prop(opts, "shape"),
    tick: 0,
    totalTicks: opts.ticks,
    decay: opts.decay,
    drift: opts.drift,
    random: Math.random() + 2,
    tiltSin: 0,
    tiltCos: 0,
    wobbleX: 0,
    wobbleY: 0,
    gravity: prop(opts, "gravity") * 3,
    ovalScalar: 0.6,
    scalar: opts.scalar,
    flat: prop(opts, "flat"),
  };
}
export type Physics = ReturnType<typeof randomPhysics>;

function transformPath2D(
  pathString: string,
  pathMatrix: number[],
  x: number,
  y: number,
  scaleX: number,
  scaleY: number,
  rotation: number
) {
  var path2d = new Path2D(pathString);

  var t1 = new Path2D();
  t1.addPath(path2d, new DOMMatrix(pathMatrix));

  var t2 = new Path2D();
  // see https://developer.mozilla.org/en-US/docs/Web/API/DOMMatrix/DOMMatrix
  t2.addPath(
    t1,
    new DOMMatrix([
      Math.cos(rotation) * scaleX,
      Math.sin(rotation) * scaleX,
      -Math.sin(rotation) * scaleY,
      Math.cos(rotation) * scaleY,
      x,
      y,
    ])
  );

  return t2;
}

function ellipse(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  rotation: number,
  startAngle: number,
  endAngle: number,
  antiClockwise?: boolean
) {
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.scale(radiusX, radiusY);
  context.arc(0, 0, 1, startAngle, endAngle, antiClockwise);
  context.restore();
}
export function updateFetti(context: CanvasRenderingContext2D, fetti: Physics) {
  if (fetti.x === undefined) {
    fetti.x = 0;
  }
  if (fetti.y === undefined) {
    fetti.y = 0;
  }
  if (fetti.scalar === undefined) {
    fetti.scalar = 1;
  }
  if (fetti.drift === undefined) {
    fetti.drift = 0;
  }
  if (fetti.totalTicks === undefined) {
    fetti.totalTicks = 1;
  }
  fetti.x += Math.cos(fetti.angle2D) * fetti.velocity + fetti.drift;
  fetti.y += Math.sin(fetti.angle2D) * fetti.velocity + fetti.gravity;
  fetti.velocity *= fetti.decay ?? 1;

  if (fetti.flat) {
    fetti.wobble = 0;
    fetti.wobbleX = fetti.x + 10 * fetti.scalar;
    fetti.wobbleY = fetti.y + 10 * fetti.scalar;

    fetti.tiltSin = 0;
    fetti.tiltCos = 0;
    fetti.random = 1;
  } else {
    fetti.wobble += fetti.wobbleSpeed;
    fetti.wobbleX = fetti.x + 10 * fetti.scalar * Math.cos(fetti.wobble);
    fetti.wobbleY = fetti.y + 10 * fetti.scalar * Math.sin(fetti.wobble);

    fetti.tiltAngle += 0.1;
    fetti.tiltSin = Math.sin(fetti.tiltAngle);
    fetti.tiltCos = Math.cos(fetti.tiltAngle);
    fetti.random = Math.random() + 2;
  }

  var progress = fetti.tick++ / fetti.totalTicks;

  var x1 = fetti.x + fetti.random * fetti.tiltCos;
  var y1 = fetti.y + fetti.random * fetti.tiltSin;
  var x2 = fetti.wobbleX + fetti.random * fetti.tiltCos;
  var y2 = fetti.wobbleY + fetti.random * fetti.tiltSin;

  context.fillStyle =
    "rgba(" +
    fetti.color.r +
    ", " +
    fetti.color.g +
    ", " +
    fetti.color.b +
    ", " +
    (1 - progress) +
    ")";

  context.beginPath();

  if (
    typeof fetti.shape !== "string" &&
    fetti.shape.type === "path" &&
    typeof fetti.shape.path === "string" &&
    Array.isArray(fetti.shape.matrix)
  ) {
    context.fill(
      transformPath2D(
        fetti.shape.path,
        fetti.shape.matrix,
        fetti.x,
        fetti.y,
        Math.abs(x2 - x1) * 0.1,
        Math.abs(y2 - y1) * 0.1,
        (Math.PI / 10) * fetti.wobble
      )
    );
  } else if (typeof fetti.shape !== "string" && fetti.shape.type === "bitmap") {
    var rotation = (Math.PI / 10) * fetti.wobble;
    var scaleX = Math.abs(x2 - x1) * 0.1;
    var scaleY = Math.abs(y2 - y1) * 0.1;
    var width = fetti.shape.bitmap.width * fetti.scalar;
    var height = fetti.shape.bitmap.height * fetti.scalar;

    var matrix = new DOMMatrix([
      Math.cos(rotation) * scaleX,
      Math.sin(rotation) * scaleX,
      -Math.sin(rotation) * scaleY,
      Math.cos(rotation) * scaleY,
      fetti.x,
      fetti.y,
    ]);

    // apply the transform matrix from the confetti shape
    matrix.multiplySelf(new DOMMatrix(fetti.shape.matrix));

    var pattern = context.createPattern(fetti.shape.bitmap, "no-repeat")!;
    pattern.setTransform(matrix);

    context.globalAlpha = 1 - progress;
    context.fillStyle = pattern;
    context.fillRect(fetti.x - width / 2, fetti.y - height / 2, width, height);
    context.globalAlpha = 1;
  } else if (fetti.shape === "circle") {
    context.ellipse
      ? context.ellipse(
          fetti.x,
          fetti.y,
          Math.abs(x2 - x1) * fetti.ovalScalar,
          Math.abs(y2 - y1) * fetti.ovalScalar,
          (Math.PI / 10) * fetti.wobble,
          0,
          2 * Math.PI
        )
      : ellipse(
          context,
          fetti.x,
          fetti.y,
          Math.abs(x2 - x1) * fetti.ovalScalar,
          Math.abs(y2 - y1) * fetti.ovalScalar,
          (Math.PI / 10) * fetti.wobble,
          0,
          2 * Math.PI
        );
  } else if (fetti.shape === "star") {
    var rot = (Math.PI / 2) * 3;
    var innerRadius = 4 * fetti.scalar;
    var outerRadius = 8 * fetti.scalar;
    var x = fetti.x;
    var y = fetti.y;
    var spikes = 5;
    var step = Math.PI / spikes;

    while (spikes--) {
      x = fetti.x + Math.cos(rot) * outerRadius;
      y = fetti.y + Math.sin(rot) * outerRadius;
      context.lineTo(x, y);
      rot += step;

      x = fetti.x + Math.cos(rot) * innerRadius;
      y = fetti.y + Math.sin(rot) * innerRadius;
      context.lineTo(x, y);
      rot += step;
    }
  } else {
    context.moveTo(Math.floor(fetti.x), Math.floor(fetti.y));
    context.lineTo(Math.floor(fetti.wobbleX), Math.floor(y1));
    context.lineTo(Math.floor(x2), Math.floor(y2));
    context.lineTo(Math.floor(x1), Math.floor(fetti.wobbleY));
  }

  context.closePath();
  context.fill();

  return fetti.tick < fetti.totalTicks;
}

export function setCanvasWindowSize(canvas: HTMLCanvasElement) {
  canvas.width = document.documentElement.clientWidth;
  canvas.height = document.documentElement.clientHeight;
}

export function setCanvasRectSize(canvas: HTMLCanvasElement) {
  var rect = canvas.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
}
export function onlyPositiveInt(number: number) {
  return number < 0 ? 0 : Math.floor(number);
}

function toDecimal(str: string) {
  return parseInt(str, 16);
}

function hexToRgb(str: string | number) {
  var val = String(str).replace(/[^0-9a-f]/gi, "");

  if (val.length < 6) {
    val = val[0] + val[0] + val[1] + val[1] + val[2] + val[2];
  }

  return {
    r: toDecimal(val.substring(0, 2)),
    g: toDecimal(val.substring(2, 4)),
    b: toDecimal(val.substring(4, 6)),
  };
}
export function colorsToRgb(colors: number[] | string[]) {
  return colors.map(hexToRgb);
}
export function getOrigin(options: Options) {
  var origin = prop(options, "origin", Object);
  origin.x = prop(origin, "x", Number);
  origin.y = prop(origin, "y", Number);

  return origin;
}
export function randomInt(min: number, max: number) {
  // [min, max)
  return Math.floor(Math.random() * (max - min)) + min;
}
