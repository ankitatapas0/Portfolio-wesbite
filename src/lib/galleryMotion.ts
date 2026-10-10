export const GALLERY_DRAG_YAW = 8;
export const GALLERY_DRAG_TILT = 10;
export const GALLERY_GYRO_YAW = 12;
export const GALLERY_GYRO_TILT_MIN = -20;
export const GALLERY_GYRO_TILT_MAX = 6;

// A 30-degree change in how the device is held reaches the gyro limit.
const DEVICE_TILT_RANGE = 30;
const clamp = (value: number) => Math.max(-1, Math.min(1, value));
const angularDelta = (value: number, origin: number) =>
  ((value - origin + 540) % 360) - 180;

export type GalleryDevicePose = {
  alpha: number | null;
  beta: number;
  gamma: number;
};

// Device orientation uses intrinsic Z (alpha), X (beta), Y (gamma) rotations.
// Comparing full orientations avoids Euler-angle flips near an upright phone.
function deviceQuaternion(alpha: number, beta: number, gamma: number) {
  const halfRadians = Math.PI / 360;
  const sx = Math.sin(beta * halfRadians);
  const cx = Math.cos(beta * halfRadians);
  const sy = Math.sin(gamma * halfRadians);
  const cy = Math.cos(gamma * halfRadians);
  const sz = Math.sin(alpha * halfRadians);
  const cz = Math.cos(alpha * halfRadians);
  return {
    x: sx * cy * cz - cx * sy * sz,
    y: cx * sy * cz + sx * cy * sz,
    z: cx * cy * sz + sx * sy * cz,
    w: cx * cy * cz - sx * sy * sz,
  };
}

export function galleryDeviceMotionAngles(
  pose: GalleryDevicePose,
  neutral: GalleryDevicePose,
  screenAngle: number,
) {
  if (pose.alpha === null || neutral.alpha === null) {
    // Retain the two-axis path for browsers that omit the heading component.
    return galleryMotionAngles(
      pose.beta, pose.gamma, neutral.beta, neutral.gamma, screenAngle,
    );
  }

  const origin = deviceQuaternion(neutral.alpha, neutral.beta, neutral.gamma);
  const current = deviceQuaternion(pose.alpha, pose.beta, pose.gamma);
  // Inverse(origin) * current gives rotation in the initial holding frame,
  // independent of the sensor's Euler representation or north heading.
  const x = origin.w * current.x - origin.x * current.w -
    origin.y * current.z + origin.z * current.y;
  const y = origin.w * current.y + origin.x * current.z -
    origin.y * current.w - origin.z * current.x;
  const z = origin.w * current.z - origin.x * current.y +
    origin.y * current.x - origin.z * current.w;
  const w = origin.w * current.w + origin.x * current.x +
    origin.y * current.y + origin.z * current.z;

  // Extract local pitch and yaw; roll does not rotate the gallery.
  const degrees = 180 / Math.PI;
  const pitch = Math.atan2(2 * (x * w - y * z), 1 - 2 * (x * x + y * y)) * degrees;
  const yaw = Math.asin(Math.max(-1, Math.min(1, 2 * (x * z + y * w)))) * degrees;
  return galleryMotionAngles(pitch, yaw, 0, 0, screenAngle);
}

export function galleryMotionAngles(
  beta: number,
  gamma: number,
  neutralBeta: number,
  neutralGamma: number,
  screenAngle: number,
  yawRange = GALLERY_GYRO_YAW,
  tiltMin = GALLERY_GYRO_TILT_MIN,
  tiltMax = GALLERY_GYRO_TILT_MAX,
) {
  const radians = screenAngle * Math.PI / 180;
  const horizontal = angularDelta(gamma, neutralGamma);
  const vertical = angularDelta(beta, neutralBeta);
  const x = horizontal * Math.cos(radians) + vertical * Math.sin(radians);
  const y = vertical * Math.cos(radians) - horizontal * Math.sin(radians);
  const normalizedTilt = clamp(y / DEVICE_TILT_RANGE);

  return {
    yaw: clamp(x / DEVICE_TILT_RANGE) * -yawRange,
    tilt: normalizedTilt * (normalizedTilt < 0 ? -tiltMin : tiltMax),
  };
}
