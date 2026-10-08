const texts = [
  "One Interest, Endless Connections",
  "Temukan teman baru",
  "Temukan komunitasmu",
];
const el = document.getElementById("typed-text");

let textIndex = 0;
let charIndex = 0;
let deleting = false;

function tick() {
  const full = texts[textIndex];

  if (!deleting) {
    charIndex++;
    el.textContent = full.slice(0, charIndex);
    if (charIndex === full.length) {
      deleting = true;
      return setTimeout(tick, 1500);
    }
  } else {
    charIndex--;
    el.textContent = full.slice(0, charIndex);
    if (charIndex === 0) {
      deleting = false;
      textIndex = (textIndex + 1) % texts.length;
    }
  }
  setTimeout(tick, deleting ? 40 : 75);
}

tick();
