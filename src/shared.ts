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
function isOk(value: unknown): value is NonNullable<unknown> {
  return !(value === null || value === undefined);
}
export function property<K extends keyof Options>(
  options: Options,
  name: K,
): NonNullable<Options[K]>;
export function property<K extends keyof Options, R>(
  options: Options,
  name: K,
  transform: (value: NonNullable<Options[K]>) => R,
): R;
export function property<K extends keyof Options, R>(
  options: Options | undefined,
  name: K,
  transform?: (value_: Options[K]) => R,
): NonNullable<Options[K]> | R {
  const value = options && isOk(options[name]) ? options[name] : defaults[name];
  return transform ? transform(value) : (value as NonNullable<Options[K]>);
}

export const raf = (function () {
  const TIME = Math.floor(1000 / 60);
  const frames: Record<number, number> = {};
  let lastFrameTime = 0;

  const frame = function (callback: () => void) {
    const id = Math.random();

    frames[id] = requestAnimationFrame(function onFrame(time) {
      if (lastFrameTime === time || lastFrameTime + TIME - 1 < time) {
        lastFrameTime = time;
        delete frames[id];

        callback();
      } else {
        frames[id] = requestAnimationFrame(onFrame);
      }
    });

    return id;
  };
  const cancel = function (id: number) {
    if (frames[id]) {
      cancelAnimationFrame(frames[id]);
    }
  };

  return { frame: frame, cancel: cancel };
})();

export function randomPhysics(options: Options) {
  const radAngle = property(options, "angle") * (Math.PI / 180);
  const radSpread = property(options, "spread") * (Math.PI / 180);

  return {
    x: options.x,
    y: options.y,
    wobble: Math.random() * 10,
    wobbleSpeed: Math.min(0.11, Math.random() * 0.1 + 0.05),
    velocity:
      property(options, "startVelocity") * 0.5 +
      Math.random() * property(options, "startVelocity"),
    angle2D: -radAngle + (0.5 * radSpread - Math.random() * radSpread),
    tiltAngle: (Math.random() * (0.75 - 0.25) + 0.25) * Math.PI,
    color: property(options, "color"),
    shape: property(options, "shape"),
    tick: 0,
    totalTicks: options.ticks,
    decay: options.decay,
    drift: options.drift,
    random: Math.random() + 2,
    tiltSin: 0,
    tiltCos: 0,
    wobbleX: 0,
    wobbleY: 0,
    gravity: property(options, "gravity") * 3,
    ovalScalar: 0.6,
    scalar: options.scalar,
    flat: property(options, "flat"),
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
  rotation: number,
) {
  const path2d = new Path2D(pathString);

  const t1 = new Path2D();
  t1.addPath(path2d, new DOMMatrix(pathMatrix));

  const t2 = new Path2D();
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
    ]),
  );

  return t2;
}

export function updateFetti(context: CanvasRenderingContext2D, fetti: Physics) {
  fetti.x ??= 0;
  fetti.y ??= 0;
  fetti.scalar ??= 1;
  fetti.drift ??= 0;
  fetti.totalTicks ??= 1;
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

  const progress = fetti.tick++ / fetti.totalTicks;

  const x1 = fetti.x + fetti.random * fetti.tiltCos;
  const y1 = fetti.y + fetti.random * fetti.tiltSin;
  const x2 = fetti.wobbleX + fetti.random * fetti.tiltCos;
  const y2 = fetti.wobbleY + fetti.random * fetti.tiltSin;

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
        (Math.PI / 10) * fetti.wobble,
      ),
    );
  } else if (typeof fetti.shape !== "string" && fetti.shape.type === "bitmap") {
    const rotation = (Math.PI / 10) * fetti.wobble;
    const scaleX = Math.abs(x2 - x1) * 0.1;
    const scaleY = Math.abs(y2 - y1) * 0.1;
    const width = fetti.shape.bitmap.width * fetti.scalar;
    const height = fetti.shape.bitmap.height * fetti.scalar;

    const matrix = new DOMMatrix([
      Math.cos(rotation) * scaleX,
      Math.sin(rotation) * scaleX,
      -Math.sin(rotation) * scaleY,
      Math.cos(rotation) * scaleY,
      fetti.x,
      fetti.y,
    ]);

    // apply the transform matrix from the confetti shape
    matrix.multiplySelf(new DOMMatrix(fetti.shape.matrix));

    const pattern = context.createPattern(fetti.shape.bitmap, "no-repeat")!;
    pattern.setTransform(matrix);

    context.globalAlpha = 1 - progress;
    context.fillStyle = pattern;
    context.fillRect(fetti.x - width / 2, fetti.y - height / 2, width, height);
    context.globalAlpha = 1;
  } else if (fetti.shape === "circle") {
    context.ellipse(
      fetti.x,
      fetti.y,
      Math.abs(x2 - x1) * fetti.ovalScalar,
      Math.abs(y2 - y1) * fetti.ovalScalar,
      (Math.PI / 10) * fetti.wobble,
      0,
      2 * Math.PI,
    );
  } else if (fetti.shape === "star") {
    let rot = (Math.PI / 2) * 3;
    const innerRadius = 4 * fetti.scalar;
    const outerRadius = 8 * fetti.scalar;
    let x = fetti.x;
    let y = fetti.y;
    let spikes = 5;
    const step = Math.PI / spikes;

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

export function onlyPositiveInt(number: number) {
  return number < 0 ? 0 : Math.floor(number);
}

function toDecimal(string_: string) {
  return Number.parseInt(string_, 16);
}

function hexToRgb(string_: string | number) {
  let value = String(string_).replaceAll(/[^0-9a-f]/gi, "");

  if (value.length < 6) {
    value = value[0] + value[0] + value[1] + value[1] + value[2] + value[2];
  }

  return {
    r: toDecimal(value.slice(0, 2)),
    g: toDecimal(value.slice(2, 4)),
    b: toDecimal(value.slice(4, 6)),
  };
}
export function colorsToRgb(colors: number[] | string[]) {
  return colors.map((element) => hexToRgb(element));
}
export function getOrigin(options: Options) {
  const origin = property(options, "origin");
  origin.x = property(origin, "x", Number);
  origin.y = property(origin, "y", Number);

  return origin;
}
export function randomInt(min: number, max: number) {
  // [min, max)
  return Math.floor(Math.random() * (max - min)) + min;
}
