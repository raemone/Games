const app = document.getElementById('app');
const boot = document.getElementById('boot');

const canvas = document.createElement('canvas');
canvas.width = 480;
canvas.height = 270;
app?.append(canvas);

const ctx = canvas.getContext('2d');
if (ctx) {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#2a1b4a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffd88a';
  ctx.font = '16px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ROXY RUN', canvas.width / 2, canvas.height / 2);
}

function fit(): void {
  const scale = Math.max(
    1,
    Math.floor(Math.min(window.innerWidth / canvas.width, window.innerHeight / canvas.height)),
  );
  canvas.style.width = `${canvas.width * scale}px`;
  canvas.style.height = `${canvas.height * scale}px`;
}

window.addEventListener('resize', fit);
fit();
boot?.classList.add('hidden');
