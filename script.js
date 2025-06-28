// 1) Tell OpenCV when to flip cvReady → true
let cvReady = false;
cv['onRuntimeInitialized'] = () => {
  cvReady = true;
  document.getElementById('status').textContent =
    '✅ OpenCV is ready. Upload an LPG image.';
  console.log('▶️ OpenCV.js ready');
};

// 2) Once the DOM is in place, wire up our UI
document.addEventListener('DOMContentLoaded', () => {
  const input   = document.getElementById('fileInput');
  const canvas  = document.getElementById('canvasOut');
  const maskOut = document.getElementById('maskOut');
  const status  = document.getElementById('status');
  const ctx     = canvas.getContext('2d');
  const mCtx    = maskOut.getContext('2d');

  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) {
      status.textContent = '⚠️ No file selected.';
      return;
    }
    if (!cvReady) {
      status.textContent = '⌛ Waiting for OpenCV…';
      return;
    }

    status.textContent = '🔄 Loading image…';
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(img.src);

      // match canvas size to image
      canvas.width  = maskOut.width  = img.width;
      canvas.height = maskOut.height = img.height;

      // draw original
      ctx.drawImage(img, 0, 0);
      status.textContent = '✅ Image drawn. Detecting cap…';
      detectCap(canvas, maskOut, status);
    };
    img.onerror = () => {
      status.textContent = '❌ Failed to load image.';
    };
  });
});

// 3) The detection routine
function detectCap(canvas, maskCanvas, statusEl) {
  // read into OpenCV mats
  const src = cv.imread(canvas);
  const hsv = new cv.Mat();
  cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
  cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);

  // threshold white: low sat, high val
  const mask = new cv.Mat();
  const low  = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [0, 0, 200, 0]);
  const high = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [180, 30, 255, 255]);
  cv.inRange(hsv, low, high, mask);

  // show raw mask for debug
  cv.imshow(maskCanvas, mask);

  // clean noise
  const M = cv.Mat.ones(5, 5, cv.CV_8U);
  cv.morphologyEx(mask, mask, cv.MORPH_OPEN, M);
  cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, M);

  // find contours
  const contours  = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  // look for a circular blob near image center
  const cx = src.cols / 2;
  const cy = src.rows / 2;
  let found = false;

  for (let i = 0; i < contours.size(); i++) {
    const cnt  = contours.get(i);
    const area = cv.contourArea(cnt);
    if (area < 500) { cnt.delete(); continue; }

    const { center, radius } = cv.minEnclosingCircle(cnt);
    const circ = area / (Math.PI * radius * radius);            // 1 = perfect circle
    const dist = Math.hypot(center.x - cx, center.y - cy);      // distance to image center

    if (circ > 0.6 && dist < Math.max(src.cols, src.rows) * 0.2) {
      // draw circle
      cv.circle(src, center, radius, [0, 255, 0, 255], 4);
      found = true;
      cnt.delete();
      break;
    }
    cnt.delete();
  }

  // render result & update status
  cv.imshow(canvas, src);
  statusEl.innerHTML = found
    ? '<span style="color:green">✅ Cap detected!</span>'
    : '<span style="color:red">❌ No cap found.</span>';

  // cleanup
  src.delete(); hsv.delete(); mask.delete();
  low.delete(); high.delete(); M.delete();
  contours.delete(); hierarchy.delete();
}
